const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');

// Import generators
const { generateEApostilleCertificate } = require('../utils/certificateGenerator');
const { processDocumentWithSignatures } = require('../utils/documentProcessor');

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

// Get verification details (public)
router.get('/verify/:certificateNumber', async (req, res) => {
  try {
    const { certificateNumber } = req.params;
    
    const uploads = await pool.query(
      `SELECT uploads.*, users.name as user_name 
       FROM uploads 
       JOIN users ON uploads.user_id = users.id
       WHERE uploads.certificate_number = $1 AND uploads.status = $2`,
      [certificateNumber, 'verified']
    );
    
    if (uploads.rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    const upload = uploads.rows[0];
    
    res.json({
      certificateNumber: upload.certificate_number,
      certificatePath: upload.certificate_pdf_path,
      certificateData: upload.certificate_data,
      reuploadedFiles: upload.reuploaded_file_paths || [],
      signaturesData: upload.additional_signatures_data || [],
      verifiedAt: upload.verified_at,
      userName: upload.user_name
    });
  } catch (err) {
    console.error('Error fetching verification:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// CRITICAL: Verify endpoint - SIMPLIFIED AND FIXED
router.post('/verify/:id', verifyToken, authorizeRole('admin'), upload.array('reuploadedFiles', 10), async (req, res) => {
  const uploadId = req.params.id;
  
  try {
    console.log('Starting verification for upload:', uploadId);
    
    // Get upload details
    const uploads = await pool.query('SELECT * FROM uploads WHERE id = $1', [uploadId]);
    if (uploads.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploads.rows[0];
    console.log('Found upload:', upload.id, upload.original_filename);

    // Get certificate data
    const {
      documentIssuer,
      documentTitle,
      documentLocation,
      certificateLocation,
      certificateDate,
      authorityName,
      additionalSigners
    } = req.body;
    
    // Validate
    if (!documentIssuer || !documentTitle || !documentLocation || 
        !certificateLocation || !certificateDate || !authorityName) {
      return res.status(400).json({ message: 'All certificate fields are required' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please re-upload documents with stamps' });
    }
    
    console.log('Re-uploaded files:', req.files.length);

    // Generate certificate
    const certNumber = generateCertNumber();
    console.log('Certificate number:', certNumber);

    const certificateData = {
      documentIssuer,
      actingCapacity: documentTitle,
      sealLocation: documentLocation,
      certificateLocation,
      certificateDate,
      authorityName,
      certificateNumber: certNumber,
      baseUrl: `${req.protocol}://${req.get('host')}`
    };
    
    console.log('Generating certificate...');
    const certResult = await generateEApostilleCertificate(certificateData);
    console.log('Certificate generated:', certResult.filePath);

    // Process signatures if provided
    let reuploadedPaths = [];
    let signaturesData = [];

    if (additionalSigners) {
      const signerIds = JSON.parse(additionalSigners);
      console.log('Additional signers:', signerIds.length);
      
      if (signerIds.length > 0) {
        const signerIdsArray = signerIds.map(s => s.signerId);
        const signersResult = await pool.query(
          'SELECT * FROM additional_signers WHERE id = ANY($1)',
          [signerIdsArray]
        );
        
        const signersWithDates = signersResult.rows.map(signer => {
          const selected = signerIds.find(s => s.signerId === signer.id);
          return {
            ...signer,
            signatureDate: selected?.date || new Date().toISOString().split('T')[0]
          };
        });
        
        signaturesData = signersWithDates;
        
        const verifiedDir = path.join(process.env.UPLOAD_DIR || '/tmp/uploads', 'verified');
        await ensureDirAsync(verifiedDir);
        
        for (const file of req.files) {
          console.log('Processing file with signatures:', file.path);
          const processedPath = await processDocumentWithSignatures(
            file.path,
            signersWithDates,
            certNumber
          );
          reuploadedPaths.push(processedPath);
        }
      }
    }

    // Update database
    console.log('Saving to database...');
    await pool.query(
      `UPDATE uploads SET 
        status = 'verified',
        verified_by = $1,
        verified_at = NOW(),
        certificate_data = $2,
        certificate_pdf_path = $3,
        certificate_number = $4,
        reuploaded_file_paths = $5,
        additional_signatures_data = $6,
        document_issuer = $7,
        document_title = $8,
        document_location = $9,
        certificate_date = $10,
        authority_name = $11
      WHERE id = $12`,
      [
        req.user.id,
        JSON.stringify(certificateData),
        certResult.filePath,
        certNumber,
        JSON.stringify(reuploadedPaths),
        JSON.stringify(signaturesData),
        documentIssuer,
        documentTitle,
        certificateLocation,
        certificateDate,
        authorityName,
        uploadId
      ]
    );
    
    // Cleanup original files (don't await - let it run in background)
    console.log('Cleaning up original files...');
    if (upload.file_paths && Array.isArray(upload.file_paths)) {
      for (const file of upload.file_paths) {
        if (file.path) deleteFileAsync(file.path).catch(console.error);
      }
    } else if (upload.file_path) {
      deleteFileAsync(upload.file_path).catch(console.error);
    }
    
    console.log('Verification complete!');
    res.json({ 
      message: 'e-APOSTILLE Certificate generated successfully',
      certificateNumber: certNumber,
      certificatePath: certResult.filePath
    });
    
  } catch (err) {
    console.error('Verification error:', err);
    // Cleanup on error
    if (req.files) {
      for (const file of req.files) {
        deleteFileAsync(file.path).catch(console.error);
      }
    }
    res.status(500).json({ message: 'Certificate generation failed', error: err.message });
  }
});

// Delete upload
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending uploads can be deleted' });
    }
    
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Delete files
    if (upload.file_paths && Array.isArray(upload.file_paths)) {
      for (const file of upload.file_paths) {
        if (file.path) await deleteFileAsync(file.path);
      }
    } else if (upload.file_path) {
      await deleteFileAsync(upload.file_path);
    }
    
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    
    res.json({ message: 'Application deleted successfully' });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ message: 'Server error during deletion', error: err.message });
  }
});

// Download file
router.get('/uploads/:filename', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const filename = req.params.filename;
    const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    const filePath = path.join(uploadDir, 'original', filename);
    
    console.log('Download requested:', filename);
    console.log('Looking at:', filePath);
    
    if (!fs.existsSync(filePath)) {
      const altPath = path.join(uploadDir, filename);
      if (fs.existsSync(altPath)) {
        return res.sendFile(path.resolve(altPath));
      }
      return res.status(404).json({ message: 'File not found' });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(path.resolve(filePath));
    
  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});

module.exports = router;