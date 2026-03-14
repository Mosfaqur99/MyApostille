const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');
const AdmZip = require('adm-zip');

// Import generators
const { generateEApostilleCertificate } = require('../utils/certificateGenerator');
const { processMultipleDocuments } = require('../utils/documentProcessor');

console.log('Loading fileRoutes...');
console.log('processDocumentWithSignatures:', typeof processDocumentWithSignatures);

if (typeof processDocumentWithSignatures !== 'function') {
  console.error('WARNING: processDocumentWithSignatures is not a function!');
  console.error('Module exports:', require('../utils/documentProcessor'));
}
// Helper: Generate certificate number
function generateCertNumber() {
  let num = '';
  for (let i = 0; i < 12; i++) {
    num += Math.floor(Math.random() * 10);
  }
  return num;
}

// Helper: Delete file (async)
async function deleteFileAsync(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log('Deleted:', filePath);
    }
  } catch (err) {
    console.warn('Could not delete:', filePath, err.message);
  }
}

// Helper: Ensure directory exists (async)
async function ensureDirAsync(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
      console.log('Created directory:', dirPath);
    }
  } catch (err) {
    console.error('Failed to create directory:', dirPath, err.message);
    throw err;
  }
}

// ========== MULTER CONFIGURATION ==========
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const baseDir = process.env.UPLOAD_DIR || '/tmp/uploads';
      const dest = path.join(baseDir, 'original');
      
      // Use sync version for multer callback
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      
      cb(null, dest);
    } catch (err) {
      console.error('Multer destination error:', err);
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + safeName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG allowed'), false);
    }
  }
});

// ========== ROUTES ==========

// Upload files
router.post('/upload', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const hasPDF = req.files.some(f => f.mimetype === 'application/pdf');
    const hasImages = req.files.some(f => f.mimetype.startsWith('image/'));
    
    if (hasPDF && hasImages) {
      for (const f of req.files) {
        await deleteFileAsync(f.path);
      }
      return res.status(400).json({ 
        message: 'Cannot mix PDF and images' 
      });
    }
    
    if (hasPDF && req.files.length > 1) {
      for (const f of req.files) {
        await deleteFileAsync(f.path);
      }
      return res.status(400).json({ 
        message: 'Only one PDF file allowed per upload' 
      });
    }

    const fileData = req.files.map(file => ({
      path: file.path,
      original_name: file.originalname
    }));
    
    const file_type = hasPDF ? 'pdf' : (req.files.length > 1 ? 'multi-image' : 'image');
    const original_filename = fileData.map(f => f.original_name).join(', ');

    const newUpload = await pool.query(
      `INSERT INTO uploads 
       (user_id, original_filename, file_path, file_paths, file_type, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        req.user.id,
        original_filename,
        fileData[0].path,
        JSON.stringify(fileData),
        file_type,
        'pending'
      ]
    );

    res.status(201).json({
      message: 'Files uploaded successfully',
      data: newUpload.rows[0]
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.files) {
      for (const file of req.files) {
        await deleteFileAsync(file.path);
      }
    }
    res.status(500).json({ message: 'Server error during upload', error: err.message });
  }
});

// Get user's uploads
router.get('/my-uploads', verifyToken, async (req, res) => {
  try {
    const uploads = await pool.query(
      `SELECT * FROM uploads WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(uploads.rows);
  } catch (err) {
    console.error('Error fetching uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending uploads (admin)
router.get('/pending', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const pendingUploads = await pool.query(
      `SELECT uploads.*, users.name AS user_name, users.email AS user_email 
       FROM uploads 
       JOIN users ON uploads.user_id = users.id 
       WHERE uploads.status = 'pending' 
       ORDER BY uploads.created_at DESC`
    );
    res.json(pendingUploads.rows);
  } catch (err) {
    console.error('Error fetching pending uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// backend/routes/fileRoutes.js
// backend/routes/fileRoutes.js
router.get('/download-originals/:uploadId', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { uploadId } = req.params;
    console.log(`[Download] Starting for ID: ${uploadId}`);

    const result = await pool.query('SELECT file_paths FROM uploads WHERE id = $1', [uploadId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Record not found" });

    let rawData = result.rows[0].file_paths;
    let filePaths = [];

    // FIX: Robust Parsing of the Database Data
    if (Array.isArray(rawData)) {
      filePaths = rawData;
    } else if (typeof rawData === 'string') {
      try {
        filePaths = JSON.parse(rawData);
        if (!Array.isArray(filePaths)) filePaths = [filePaths];
      } catch (e) {
        filePaths = [rawData];
      }
    }

    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    let fileCount = 0;

    filePaths.forEach(entry => {
      // FIX: Extract path if it's an object, otherwise use it as a string
      let relPath = (typeof entry === 'object' && entry !== null) ? entry.path : entry;
      
      if (!relPath || typeof relPath !== 'string') {
        console.warn(`[Download] Skipping invalid path entry:`, entry);
        return;
      }
      
      // Render/Linux Path Fix
      const cleanPath = relPath.replace(/\\/g, '/'); 
      const fullPath = path.isAbsolute(cleanPath) ? cleanPath : path.join(process.cwd(), cleanPath);
      
      if (fs.existsSync(fullPath)) {
        zip.addLocalFile(fullPath);
        fileCount++;
        console.log(`[Download] Added: ${fullPath}`);
      } else {
        console.error(`[Download] File NOT FOUND on disk: ${fullPath}`);
      }
    });

    if (fileCount === 0) {
      return res.status(404).json({ message: "Physical files not found on server storage." });
    }

    const zipBuffer = zip.toBuffer();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=docs_${uploadId}.zip`,
      'Content-Length': zipBuffer.length
    });
    
    return res.send(zipBuffer);

  } catch (err) {
    console.error('SERVER ERROR 500:', err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});


// Get completed uploads (admin)
router.get('/completed', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const completedUploads = await pool.query(
      `SELECT uploads.*, users.name AS user_name, users.email AS user_email, 
              verifier.name AS verified_by_name
       FROM uploads 
       JOIN users ON uploads.user_id = users.id
       LEFT JOIN users verifier ON uploads.verified_by = verifier.id
       WHERE uploads.status = 'verified' 
       ORDER BY uploads.verified_at DESC`
    );
    res.json(completedUploads.rows);
  } catch (err) {
    console.error('Error fetching completed uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get additional signers
router.get('/additional-signers', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const signers = await pool.query('SELECT * FROM additional_signers ORDER BY name');
    res.json(signers.rows);
  } catch (err) {
    console.error('Error fetching additional signers:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get verification details (public) - FIXED
// Get verification details (public) - Updated for path consistency
// backend/routes/fileRoutes.js

// backend/routes/fileRoutes.js

// GET /verify/:certificateNumber - PUBLIC verification endpoint
// GET /verify/:certificateNumber - PUBLIC verification endpoint
// GET /verify/:certificateNumber - FIXED JSON PARSING
router.get('/verify/:certificateNumber', async (req, res) => {
  try {
    const { certificateNumber } = req.params;
    console.log('🔍 Verification request for:', certificateNumber);

    const result = await pool.query(
      `SELECT uploads.*, users.name as user_name, verifier.name as verified_by_name
       FROM uploads 
       JOIN users ON uploads.user_id = users.id
       LEFT JOIN users verifier ON uploads.verified_by = verifier.id
       WHERE uploads.certificate_number = $1 AND uploads.status = 'verified'`,
      [certificateNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    const upload = result.rows[0];

    // Helper: Extract just filename from paths like "uploads/verified/file.pdf"
    const extractFilename = (p) => {
      if (!p) return null;
      return p.split('/').pop()?.split('\\').pop() || null;
    };

    // Build certificate path
    const certificatePath = upload.certificate_pdf_path 
      ? upload.certificate_pdf_path.replace(/\\/g, '/').replace(/^.*uploads[\\/]/i, "uploads/") 
      : null;
    
    // ✅ FIXED: Parse reuploaded_file_paths properly (handle JSON string or array)
    let reuploadedFiles = [];
    if (upload.reuploaded_file_paths) {
      try {
        // Parse if it's a JSON string (TEXT column), otherwise use as-is (JSONB)
        const paths = typeof upload.reuploaded_file_paths === 'string' 
          ? JSON.parse(upload.reuploaded_file_paths) 
          : upload.reuploaded_file_paths;
        
        if (Array.isArray(paths)) {
          // Extract just filenames for /verified/:filename route
          reuploadedFiles = paths.map(extractFilename).filter(Boolean);
        } else if (paths) {
          const filename = extractFilename(paths);
          if (filename) reuploadedFiles = [filename];
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse reuploaded_file_paths:', e);
      }
    }

    console.log('🔍 Response data:', {
      certificatePath,
      reuploadedFiles,
      raw_db_value: upload.reuploaded_file_paths
    });

    // Send response matching frontend expectations
   // In GET /verify/:certificateNumber route, replace the response with:
// In the res.json() response:
res.json({
  certificateNumber: upload.certificate_number,
  certificatePath: upload.certificate_pdf_path
    ? upload.certificate_pdf_path.replace(/^.*uploads[\\/]/, "uploads/")
    : null,
  certificateData: upload.certificate_data,
  
  // ✅ FIXED: Parse JSON string if needed, then extract filenames
  reuploadedFiles: (() => {
  if (!upload.reuploaded_file_paths) return [];
  try {
    const paths = typeof upload.reuploaded_file_paths === 'string'
      ? JSON.parse(upload.reuploaded_file_paths)
      : upload.reuploaded_file_paths;
    if (Array.isArray(paths)) {
      return paths.map(p => p.split('/').pop()?.split('\\').pop()).filter(Boolean);
    }
    return [];
  } catch (e) {
    console.warn('⚠️ Parse error:', e);
    return [];
  }
})(),
  
  signaturesData: upload.additional_signatures_data || [],
  verifiedAt: upload.verified_at,
  userName: upload.user_name,
  verifiedBy: upload.verified_by_name
});

  } catch (err) {
    console.error('❌ Error fetching verification:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// CRITICAL: Verify endpoint - SIMPLIFIED AND FIXED
// REPLACE the entire verify route with this diagnostic version:

// POST /verify/:id - COMPLETELY FIXED VERSION
// POST /verify/:id - FINAL FIXED VERSION
router.post('/verify/:id', verifyToken, authorizeRole('admin'), upload.array('reuploadedFiles', 10), async (req, res) => {
  const uploadId = req.params.id;
  console.log('🔍 Verify endpoint called for upload:', uploadId);
  
  try {
    // ========== Step 1: Fetch upload ==========
    const uploadResult = await pool.query('SELECT * FROM uploads WHERE id = $1', [uploadId]);
    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    const upload = uploadResult.rows[0];

    // ========== Step 2: Validate required fields ==========
    const {
      documentIssuer, documentTitle, documentLocation,
      certificateLocation, certificateDate, authorityName,
      additionalSigners
    } = req.body;
    
    const requiredFields = { documentIssuer, documentTitle, documentLocation, certificateLocation, certificateDate, authorityName };
    const missing = Object.entries(requiredFields).filter(([_, val]) => !val).map(([key]) => key);
    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please re-upload documents' });
    }

    // ========== Step 3: Generate certificate ==========
    const certNumber = generateCertNumber();
    const certificateData = {
      documentIssuer, actingCapacity: documentTitle, sealLocation: documentLocation,
      certificateLocation, certificateDate, authorityName,
      certificateNumber: certNumber,
      baseUrl: `${req.protocol}://${req.get('host')}`
    };

    const certResult = await generateEApostilleCertificate(certificateData);
    if (!certResult || !certResult.pdfBytes) {
      throw new Error('Certificate generator returned invalid result');
    }
    
    const certDir = path.join(process.env.UPLOAD_DIR || '/tmp/uploads', 'certificates');
    await ensureDirAsync(certDir);
    const certFileName = `certificate-${certNumber}.pdf`;
    const certFilePath = path.join(certDir, certFileName);
    const relativeCertPath = `/uploads/certificates/${certFileName}`;
    
    await fs.promises.writeFile(certFilePath, certResult.pdfBytes);
    console.log('✅ Certificate saved:', relativeCertPath);

    // ========== Step 4: Parse additional signers (OPTIONAL) ==========
    
    
    
    if (additionalSigners) {
      try {
        const signerIds = JSON.parse(additionalSigners);
        if (signerIds.length > 0) {
          const signerIdsArray = signerIds.map(s => s.signerId);
          const signersResult = await pool.query(
            'SELECT * FROM additional_signers WHERE id = ANY($1)',
            [signerIdsArray]
          );
          signersWithDates = signersResult.rows.map(signer => ({
            ...signer,
            signatureDate: signerIds.find(s => s.signerId === signer.id)?.date || new Date().toISOString().split('T')[0]
          }));
          signaturesData = signersWithDates;
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse additionalSigners:', e.message);
      }
    }

   // Step 5: Process signatures on uploaded documents
console.log('🔍 Step 5: Processing signatures...');
let reuploadedPaths = [];
let signaturesData = [];

// Parse signers first (optional)
let signersWithDates = [];
if (additionalSigners) {
  try {
    const signerIds = JSON.parse(additionalSigners);
    if (signerIds.length > 0) {
      const signerIdsArray = signerIds.map(s => s.signerId);
      const signersResult = await pool.query(
        'SELECT * FROM additional_signers WHERE id = ANY($1)',
        [signerIdsArray]
      );
      signersWithDates = signersResult.rows.map(signer => ({
        ...signer,
        signatureDate: signerIds.find(s => s.signerId === signer.id)?.date || new Date().toISOString().split('T')[0]
      }));
      signaturesData = signersWithDates;
    }
  } catch (e) {
    console.warn('⚠️ Failed to parse additionalSigners:', e.message);
  }
}

// ✅ Process ALL files - MOVED OUTSIDE the signers condition
if (req.files && req.files.length > 0) {
  const verifiedDir = path.join(process.env.UPLOAD_DIR || '/tmp/uploads', 'verified');
  await ensureDirAsync(verifiedDir);
  
  for (const file of req.files) {
    try {
      const processedPath = await processDocumentWithSignatures(
        file.path,
        signersWithDates,  // Empty array = no signatures drawn, but file still processed
        certNumber
      );
      reuploadedPaths.push(processedPath);
      console.log('✅ File processed:', processedPath);
    } catch (procErr) {
      console.error('⚠️ File processing failed:', file.originalname, procErr.message);
    }
  }
}
console.log('🔍 reuploadedPaths:', reuploadedPaths);

    // ========== Step 7: Cleanup original files ==========
    if (upload.file_paths) {
      const files = typeof upload.file_paths === 'string' 
        ? JSON.parse(upload.file_paths) 
        : upload.file_paths;
      for (const f of Array.isArray(files) ? files : [files]) {
        if (f?.path) await deleteFileAsync(f.path).catch(() => {});
      }
    }

    // ========== Step 8: Send success response ==========
    console.log('✅ VERIFICATION COMPLETE for cert:', certNumber);
    res.json({
      message: 'e-APOSTILLE Certificate generated successfully',
      certificateNumber: certNumber,
      certificatePath: relativeCertPath
    });

  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err.message);
    
    // Cleanup on error
    if (req.files) {
      for (const file of req.files) {
        await deleteFileAsync(file.path).catch(() => {});
      }
    }
    
    res.status(500).json({
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  }
});

// Delete upload
// Delete upload (admin can delete any, user can only delete their own pending)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    
    // Admin can delete any upload (pending or verified)
    // User can only delete their own pending uploads
    if (req.user.role !== 'admin') {
      // Non-admin checks
      if (upload.status !== 'pending') {
        return res.status(400).json({ 
          message: 'Only pending uploads can be deleted by users.' 
        });
      }
      
      if (upload.user_id !== req.user.id) {
        return res.status(403).json({ 
          message: 'Access denied' 
        });
      }
    }
    
    // Delete associated files
    try {
      // Delete original files
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
      
      // Delete certificate file if exists
      if (upload.certificate_pdf_path) {
        const certPath = path.join(__dirname, '..', upload.certificate_pdf_path);
        await fs.unlink(certPath).catch(() => {});
      }
      
      // Delete reuploaded/verified files if exist
      if (upload.reuploaded_file_paths && Array.isArray(upload.reuploaded_file_paths)) {
        for (const filePath of upload.reuploaded_file_paths) {
          const fullPath = path.join(__dirname, '..', filePath);
          await fs.unlink(fullPath).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete some files: ${err.message}`);
    }
    
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    
    res.json({ 
      message: req.user.role === 'admin' && upload.status === 'verified' 
        ? 'যাচাইকৃত আবেদন সফলভাবে মুছে ফেলা হয়েছে!' 
        : 'আবেদন সফলভাবে মুছে ফেলা হয়েছে!' 
    });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ 
      message: 'Server error during deletion', 
      error: err.message 
    });
  }
});

// Download file
// REPLACE the download route - allow users to view their own files

router.get('/uploads/:filename', verifyToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    const filePath = path.join(uploadDir, 'original', filename);
    
    console.log('📥 View requested by user:', req.user.id, 'role:', req.user.role);
    console.log('📁 File:', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      const altPath = path.join(uploadDir, filename);
      if (fs.existsSync(altPath)) {
        return res.sendFile(path.resolve(altPath));
      }
      return res.status(404).json({ message: 'File not found' });
    }
    
    // If user is not admin, verify they own this file
    if (req.user.role !== 'admin') {
      const uploads = await pool.query(
        `SELECT * FROM uploads 
         WHERE (file_path LIKE $1 OR file_paths::text LIKE $1)
         AND user_id = $2`,
        [`%${filename}%`, req.user.id]
      );
      
      if (uploads.rows.length === 0) {
        console.log('❌ Access denied: User', req.user.id, 'does not own file', filename);
        return res.status(403).json({ message: 'Access denied - you do not own this file' });
      }
    }
    
    // Set proper content type for images (not download)
    const ext = path.extname(filename).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    }[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // NO Content-Disposition header (this makes it view, not download)
    res.sendFile(path.resolve(filePath));
    
  } catch (error) {
    console.error('❌ File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});

// Serve verified files (public access for viewing processed documents)
router.get('/verified/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: Prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    const filePath = path.join(uploadDir, 'verified', filename);
    
    console.log('📥 Verified file request:', filename);
    console.log('📁 Full path:', filePath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log('❌ File not found:', filePath);
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Set content type
    const ext = path.extname(filename).toLowerCase();
    const contentType = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    }[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Disposition', 'inline'); // For viewing in iframe
    
    res.sendFile(path.resolve(filePath));
    
  } catch (error) {
    console.error('❌ File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});


// Serve certificate PDFs (public access for verification page)
router.get('/certificates/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    const filePath = path.join(uploadDir, 'certificates', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('❌ Certificate serve error:', error);
    res.status(500).json({ message: 'Error serving certificate' });
  }
});
// PATCH endpoint for partial file updates (add/remove files)
router.patch('/edit/:id', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { removeIndices } = req.body;
    
    // Get current upload
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Cannot edit verified uploads' });
    }

    // Parse current file paths
    let currentFilePaths = [];
    if (upload.file_paths) {
      try {
        currentFilePaths = typeof upload.file_paths === 'string' 
          ? JSON.parse(upload.file_paths) 
          : upload.file_paths;
      } catch (e) {
        // If it's a single file stored as string path
        currentFilePaths = [upload.file_paths];
      }
    } else if (upload.file_path) {
      currentFilePaths = [upload.file_path];
    }

    // Parse remove indices
    let indicesToRemove = [];
    if (removeIndices) {
      try {
        indicesToRemove = JSON.parse(removeIndices);
        if (!Array.isArray(indicesToRemove)) {
          indicesToRemove = [indicesToRemove];
        }
      } catch (e) {
        return res.status(400).json({ message: 'Invalid removeIndices format' });
      }
    }

    // Sort indices in descending order to remove from end first (avoid index shifting issues)
    indicesToRemove.sort((a, b) => b - a);

    // Validate indices
    const validIndices = indicesToRemove.filter(index => 
      index >= 0 && index < currentFilePaths.length
    );

    // Remove files from storage and array
    const removedFiles = [];
    for (const index of validIndices) {
      const filePath = currentFilePaths[index];
      if (filePath) {
        try {
          const fullPath = path.join(__dirname, '..', 'uploads', path.basename(filePath));
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            removedFiles.push(filePath);
          }
        } catch (err) {
          console.error('Error deleting file:', err);
        }
      }
    }

    // Remove from array (descending order prevents index issues)
    for (const index of validIndices) {
      currentFilePaths.splice(index, 1);
    }

    // Add new files
    const newFiles = req.files || [];
    const newFilePaths = newFiles.map(file => `/uploads/${file.filename}`);
    
    // Combine remaining files with new files
    const updatedFilePaths = [...currentFilePaths, ...newFilePaths];

    // Determine file type
    let fileType = upload.file_type;
    if (updatedFilePaths.length === 0) {
      fileType = null;
    } else if (updatedFilePaths.length === 1) {
      const ext = path.extname(updatedFilePaths[0]).toLowerCase();
      fileType = ext === '.pdf' ? 'pdf' : 'image';
    } else {
      fileType = 'multi-image';
    }

    // Update database
    const updateQuery = `
      UPDATE uploads 
      SET file_paths = $1, 
          file_type = $2,
          file_path = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `;

    // Store as JSON array if multiple files, or single path if one file
    const filePathsValue = updatedFilePaths.length > 1 
      ? JSON.stringify(updatedFilePaths) 
      : updatedFilePaths[0] || null;
    
    const filePathValue = updatedFilePaths.length > 0 ? updatedFilePaths[0] : null;

    const result = await pool.query(updateQuery, [
      filePathsValue,
      fileType,
      filePathValue,
      id,
      req.user.id
    ]);

    res.json({
      message: 'Files updated successfully',
      upload: result.rows[0],
      removedCount: validIndices.length,
      addedCount: newFiles.length
    });

  } catch (error) {
    console.error('Error in partial update:', error);
    res.status(500).json({ message: 'Server error during file update' });
  }
});


// In backend/routes/fileRoutes.js

router.post('/verify-batch', verifyToken, async (req, res) => {
  try {
    const { uploadId, certNumber } = req.body;

    // 1. Fetch file paths and signers from DB
    const uploadRes = await pool.query('SELECT file_paths FROM uploads WHERE id = $1', [uploadId]);
    const signersRes = await pool.query('SELECT * FROM signers WHERE is_active = true LIMIT 4');

    if (uploadRes.rows.length === 0) return res.status(404).json({ message: "Files not found" });

    const filePaths = JSON.parse(uploadRes.rows[0].file_paths);
    const signers = signersRes.rows;

    // 2. Map file paths to objects multer-style for the processor
    const filesToProcess = filePaths.map(p => ({
      path: path.join(__dirname, '..', p),
      originalname: path.basename(p)
    }));

    // 3. Process all
    const results = await processMultipleDocuments(filesToProcess, signers, certNumber);

    res.json({
      success: true,
      processedFiles: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;