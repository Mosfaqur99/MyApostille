// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const fsRegular = require('fs');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');
const cors = require('cors');

// Import the certificate generator and document processor from utils
const { generateEApostilleCertificate } = require('../utils/certificateGenerator');
const { processDocumentWithSignatures } = require('../utils/documentProcessor');

// ========== HELPER FUNCTIONS ==========

function generateCertNumber() {
  let num = '';
  for (let i = 0; i < 12; i++) {
    num += Math.floor(Math.random() * 10);
  }
  return num;
}

async function isValidPDF(filePath) {
  try {
    const fileBytes = await fs.readFile(filePath);
    if (fileBytes.length === 0) {
      console.error('❌ PDF file is empty:', filePath);
      return false;
    }
    const magicNumber = fileBytes.subarray(0, 4).toString('utf8');
    if (magicNumber !== '%PDF') {
      console.error('❌ Invalid PDF magic number:', magicNumber);
      return false;
    }
    const { PDFDocument } = require('pdf-lib');
    await PDFDocument.load(fileBytes);
    return true;
  } catch (err) {
    console.error('❌ PDF validation failed:', err.message);
    return false;
  }
}

async function embedImageToPDF(pdfDoc, imagePath) {
  try {
    const imageBytes = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    
    let image;
    if (ext === '.png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else {
      throw new Error('Unsupported image format');
    }

    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    
    const ratio = Math.min(
      (width - 100) / image.width,
      (height - 100) / image.height
    );
    
    const scaledWidth = image.width * ratio;
    const scaledHeight = image.height * ratio;
    
    const x = (width - scaledWidth) / 2;
    const y = (height - scaledHeight) / 2;
    
    page.drawImage(image, {
      x: x,
      y: y,
      width: scaledWidth,
      height: scaledHeight,
    });
    
    return pdfDoc;
  } catch (err) {
    console.error('❌ Image embedding failed:', err.message);
    throw err;
  }
}

// ========== MULTER CONFIGURATION ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads/original');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, PNG, and JPEG files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ========== ROUTES ==========

// Upload files (user only)
router.post('/upload', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const hasPDF = req.files.some(f => f.mimetype === 'application/pdf');
    const hasImages = req.files.some(f => f.mimetype.startsWith('image/'));
    
    if (hasPDF && hasImages) {
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Cannot mix PDF and images. Upload PDF alone or multiple images only.' 
      });
    }
    
    if (hasPDF && req.files.length > 1) {
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Only one PDF file allowed per upload.' 
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
      message: `File${req.files.length > 1 ? 's' : ''} uploaded successfully`,
      data: newUpload.rows[0]
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (req.files) {
      req.files.forEach(file => fs.unlink(file.path).catch(() => {}));
    }
    res.status(500).json({ message: 'Server error during upload', error: err.message });
  }
});


// CORS middleware for this router
router.use(cors({
  origin: ['http://localhost:3000', 'https://mygovapostille.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

router.options('*', cors());
// Replace files for pending upload
router.put('/replace/:id', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    
    const uploadRes = await pool.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, req.user.id, 'pending']
    );
    
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Pending upload not found or already verified' 
      });
    }
    
    const upload = uploadRes.rows[0];
    
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not delete old files:', err.message);
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    const fileData = [];
    for (const file of req.files) {
      const fileExt = path.extname(file.originalname).toLowerCase();
      const isPDF = fileExt === '.pdf';
      const isImage = ['.png', '.jpg', '.jpeg'].includes(fileExt);
      
      if (!isPDF && !isImage) {
        for (const f of req.files) {
          await fs.unlink(f.path).catch(() => {});
        }
        return res.status(400).json({ message: 'Only PDF, PNG, and JPEG files are allowed' });
      }
      
      fileData.push({
        path: file.path,
        original_name: file.originalname
      });
    }
    
    const isMultiImage = fileData.length > 1;
    const file_type = isMultiImage ? 'multi-image' : 
                      (path.extname(fileData[0].original_name).toLowerCase() === '.pdf' ? 'pdf' : 'image');

    const fileNameOnly = path.basename(fileData[0].path);
    const updatedUpload = await pool.query(
      `UPDATE uploads 
       SET file_paths = $1,
           file_type = $2,
           original_filename = $3,
           file_path = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(fileData),
        file_type,
        fileData.map(f => f.original_name).join(', '),
        fileNameOnly,
        id
      ]
    );
    
    res.json({
      message: `${fileData.length} file(s) replaced successfully`,
      data: updatedUpload.rows[0]
    });
  } catch (err) {
    console.error('Replace file error:', err);
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path).catch(() => {});
      });
    }
    res.status(500).json({ message: 'Server error during file replacement', error: err.message });
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

// Get pending uploads (admin only)
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

// Get completed uploads (admin only)
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

// Get all additional signers for dropdown (admin only)
router.get('/additional-signers', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const signers = await pool.query('SELECT * FROM additional_signers ORDER BY name');
    res.json(signers.rows);
  } catch (err) {
    console.error('Error fetching additional signers:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get verification details for public page (no auth required)
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



// Modified verify endpoint with re-upload and additional signatures
router.post('/verify/:id',
  cors({
    origin: ['http://localhost:3000', 'https://mygovapostille.com'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'x-auth-token']
  }), verifyToken, authorizeRole('admin'), upload.array('reuploadedFiles', 10), async (req, res) => {
  const uploadId = req.params.id;
  
  try {
    // Get upload details
    const uploads = await pool.query('SELECT * FROM uploads WHERE id = $1', [uploadId]);
    if (uploads.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploads.rows[0];
    
    // Certificate data from body
    const {
      documentIssuer,
      documentTitle,
      documentLocation,
      certificateLocation,
      certificateDate,
      authorityName,
      additionalSigners // JSON array of {signerId, date}
    } = req.body;
    
    // Validate required fields
    if (!documentIssuer || !documentTitle || !documentLocation || 
        !certificateLocation || !certificateDate || !authorityName) {
      return res.status(400).json({ message: 'All certificate fields are required' });
    }
    
    // Check if re-uploaded files provided
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please re-upload documents with stamps' });
    }
    
    // Generate certificate number
    const certNumber = generateCertNumber();
    
    // Generate certificate PDF
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
    
    const { pdfBytes, certificateNumber } = await generateEApostilleCertificate(certificateData);
    
    // Save certificate PDF
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
    const certDir = path.join(uploadDir, 'certificates');
    await fs.mkdir(certDir, { recursive: true });
    
    const certFilename = `cert_${certificateNumber}.pdf`;
    const certPath = path.join(certDir, certFilename);
    await fs.writeFile(certPath, pdfBytes);
    
    // Process re-uploaded files with additional signatures
    let reuploadedPaths = [];
    let signaturesData = [];
    
    if (additionalSigners) {
      const signerIds = JSON.parse(additionalSigners);
      
      if (signerIds.length > 0) {
        // Get additional signers details from database
        const signerIdsArray = signerIds.map(s => s.signerId);
        const signersResult = await pool.query(
          'SELECT * FROM additional_signers WHERE id = ANY($1)',
          [signerIdsArray]
        );
        
        // Add date to each signer
        const signersWithDates = signersResult.rows.map(signer => {
          const selected = signerIds.find(s => s.signerId === signer.id);
          return {
            ...signer,
            signatureDate: selected?.date || new Date().toISOString().split('T')[0]
          };
        });
        
        signaturesData = signersWithDates;
        
        // Process each re-uploaded file with signatures
        const verifiedDir = path.join(uploadDir, 'verified');
        await fs.mkdir(verifiedDir, { recursive: true });
        
        for (const file of req.files) {
          const processedPath = await processDocumentWithSignatures(
            file.path,
            signersWithDates,
            certificateNumber
          );
          reuploadedPaths.push(processedPath);
        }
      }
    }
    
    // Update database
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
        `/uploads/certificates/${certFilename}`,
        certificateNumber,
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
    
    // Delete original files
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not delete original files:', err.message);
    }
    
    res.json({ 
      message: 'e-APOSTILLE Certificate and signed documents generated successfully',
      certificateNumber,
      certificatePath: `/uploads/certificates/${certFilename}`
    });
    
  } catch (err) {
    console.error('Verification error:', err);
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => fs.unlink(file.path).catch(() => {}));
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
      return res.status(400).json({ 
        message: 'Only pending uploads can be deleted.' 
      });
    }
    
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }
    
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete files: ${err.message}`);
    }
    
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    
    res.json({ message: 'আবেদন সফলভাবে মুছে ফেলা হয়েছে!' });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ 
      message: 'Server error during deletion', 
      error: err.message 
    });
  }
});


// Public file check - REMOVE AFTER TESTING
router.get('/check-file/:filename', async (req, res) => {
  const filename = req.params.filename;
  const path = require('path');
  const fs = require('fs');
  
  const checks = [
    path.join(__dirname, '..', 'uploads', 'original', filename),
    path.join(__dirname, '..', 'uploads', filename),
    path.join(process.cwd(), 'uploads', 'original', filename),
    path.join(process.cwd(), 'uploads', filename),
    `/opt/render/project/src/backend/uploads/original/${filename}`,
    `/opt/render/project/src/backend/uploads/${filename}`
  ];
  
  const results = checks.map(p => ({
    path: p,
    exists: fs.existsSync(p)
  }));
  
  res.json({ filename, checks: results });
});

// Serve uploaded files for download (admin only) - WITH CORS
router.get('/uploads/:filename', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Try original subdirectory first (where multer saves files)
    const filePath = path.join(__dirname, '..', 'uploads', 'original', filename);
    
    console.log('Looking for file at:', filePath);
    
    if (!fsRegular.existsSync(filePath)) {
      // Fallback to uploads root
      const fallbackPath = path.join(__dirname, '..', 'uploads', filename);
      if (fsRegular.existsSync(fallbackPath)) {
        return res.sendFile(path.resolve(fallbackPath));
      }
      return res.status(404).json({ message: 'File not found', path: filePath });
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