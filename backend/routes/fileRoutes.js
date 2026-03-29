const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');
const AdmZip = require('adm-zip');
const { createStorage } = require('../config/cloudinary');

// Import generators and processors
const { generateEApostilleCertificate } = require('../utils/certificateGenerator');
const { processDocumentWithSignatures, processMultipleDocuments } = require('../utils/documentProcessor');

// Helper: Generate certificate number
function generateCertNumber() {
  let num = '';
  for (let i = 0; i < 12; i++) {
    num += Math.floor(Math.random() * 10);
  }
  return num;
}
async function generateUniqueCertNumber(client) {
  let certNumber;
  let exists = true;
  
  while (exists) {
    certNumber = generateCertNumber();
    const check = await client.query(
      'SELECT id FROM uploads WHERE certificate_number = $1',
      [certNumber]
    );
    exists = check.rows.length > 0;
  }
  
  return certNumber;
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

// Create storage instances for different purposes
const originalStorage = createStorage('original');
const verifiedStorage = createStorage('verified');
const certificateStorage = createStorage('certificates');

// Create multer instances
const uploadOriginal = multer({ 
  storage: originalStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG allowed'), false);
    }
  }
});

const uploadVerified = multer({ 
  storage: verifiedStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
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
// Upload files - CLOUDINARY VERSION
// Upload files - FIXED VERSION
router.post('/upload', verifyToken, uploadOriginal.array('files'), async (req, res) => {
  console.log('=== UPLOAD REQUEST ===');
  console.log('Files received:', req.files?.length || 0);

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const hasPDF = req.files.some(f => f.mimetype === 'application/pdf');
    const hasImages = req.files.some(f => f.mimetype.startsWith('image/'));
    
    if (hasPDF && hasImages) {
      return res.status(400).json({ message: 'Cannot mix PDF and images' });
    }
    
    if (hasPDF && req.files.length > 1) {
      return res.status(400).json({ message: 'Only one PDF file allowed per upload' });
    }

    // Build file data array
    const fileData = req.files.map(file => ({
      path: file.path,
      original_name: file.originalname,
      public_id: file.filename
    }));

    const file_type = hasPDF ? 'pdf' : (req.files.length > 1 ? 'multi-image' : 'image');
    
    // FIX: Truncate filename to fit in VARCHAR(255)
    let original_filename = fileData.map(f => f.original_name).join(', ');
    if (original_filename.length > 250) {
      original_filename = original_filename.substring(0, 247) + '...';
    }

    console.log('Inserting to database...');
    console.log('Filename length:', original_filename.length);

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

    console.log('Database insert successful, ID:', newUpload.rows[0].id);

    res.status(201).json({
      message: 'Files uploaded successfully',
      data: newUpload.rows[0]
    });

  } catch (err) {
    console.error('=== UPLOAD ERROR ===');
    console.error('Error message:', err.message);
    
    // Import cloudinary at top of file if not already
    const { cloudinary } = require('../config/cloudinary');
    
    // Clean up Cloudinary files if database fails
    if (req.files) {
      for (const file of req.files) {
        if (file.filename) {
          try {
            await cloudinary.uploader.destroy(
              file.filename,
              { resource_type: file.mimetype?.includes('pdf') ? 'raw' : 'image' }
            );
            console.log('Cleaned up:', file.filename);
          } catch (cleanupErr) {
            console.warn('Cleanup failed:', cleanupErr.message);
          }
        }
      }
    }

    res.status(500).json({ 
      message: 'Server error during upload', 
      error: err.message
    });
  }
});

// Upload additional files to existing upload - SUPPORTS UNLIMITED FILES
router.post('/upload/:uploadId/add-files', verifyToken, uploadOriginal.array('files'), async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Verify upload exists and belongs to user
    const existingUpload = await pool.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2',
      [uploadId, req.user.id]
    );

    if (existingUpload.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found or access denied' });
    }

    const upload = existingUpload.rows[0];
    
    // Only allow adding files to pending uploads
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Cannot modify verified upload' });
    }

    // Parse existing files
    let existingFiles = [];
    try {
      if (upload.file_paths) {
        existingFiles = typeof upload.file_paths === 'string' 
          ? JSON.parse(upload.file_paths) 
          : upload.file_paths;
      }
    } catch (e) {
      console.warn('Failed to parse existing files:', e);
    }

    // Add new files
    const newFileData = req.files.map(file => ({
      path: file.path,
      original_name: file.originalname,
      public_id: file.filename
    }));

    const updatedFiles = [...existingFiles, ...newFileData];
    
    // Update file type based on total count
    let fileType = upload.file_type;
    if (updatedFiles.length > 1) {
      fileType = 'multi-image';
    }

    // FIX: Truncate filename to fit in VARCHAR(255)
    let original_filename = updatedFiles.map(f => f.original_name).join(', ');
    if (original_filename.length > 250) {
      original_filename = original_filename.substring(0, 247) + '...';
    }

    // Update database
    const result = await pool.query(
      `UPDATE uploads 
       SET file_paths = $1, 
           file_type = $2,
           file_path = $3,
           original_filename = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [
        JSON.stringify(updatedFiles),
        fileType,
        updatedFiles[0].path,
        original_filename,
        uploadId,
        req.user.id
      ]
    );

    res.status(200).json({
      message: `${newFileData.length} files added successfully`,
      data: result.rows[0],
      addedCount: newFileData.length,
      totalFiles: updatedFiles.length
    });

  } catch (err) {
    console.error('Add files error:', err);
    
    // Import cloudinary for cleanup
    const { cloudinary } = require('../config/cloudinary');
    
    // Cleanup uploaded files if database fails
    if (req.files) {
      for (const file of req.files) {
        if (file.filename) {
          try {
            await cloudinary.uploader.destroy(
              file.filename,
              { resource_type: file.mimetype?.includes('pdf') ? 'raw' : 'image' }
            );
            console.log('Cleaned up:', file.filename);
          } catch (cleanupErr) {
            console.warn('Cleanup failed:', cleanupErr.message);
          }
        }
      }
    }
    
    res.status(500).json({ 
      message: 'Server error during file addition', 
      error: err.message 
    });
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

// Download originals
// Download files as ZIP - CLOUDINARY VERSION
// Download files as ZIP - CLOUDINARY VERSION
router.get('/download/:uploadId', verifyToken, async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { type } = req.query; // 'originals', 'verified', 'certificate', or 'all'
    
    console.log(`[Download] Starting for ID: ${uploadId}, type: ${type || 'all'}`);

    const result = await pool.query(
      'SELECT * FROM uploads WHERE id = $1',
      [uploadId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = result.rows[0];
    
    // Check permissions
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const filesToDownload = [];
    
    // Collect files based on type
    if (!type || type === 'originals') {
      if (upload.file_paths) {
        const files = typeof upload.file_paths === 'string' 
          ? JSON.parse(upload.file_paths) 
          : upload.file_paths;
        filesToDownload.push(...files.map(f => ({
          url: typeof f === 'object' ? f.path : f,
          name: typeof f === 'object' ? f.original_name : `file-${filesToDownload.length + 1}`,
          folder: 'original'
        })));
      }
    }
    
    if ((!type || type === 'verified') && upload.status === 'verified') {
      if (upload.reuploaded_file_paths) {
        const files = typeof upload.reuploaded_file_paths === 'string'
          ? JSON.parse(upload.reuploaded_file_paths)
          : upload.reuploaded_file_paths;
        filesToDownload.push(...files.map((url, idx) => ({
          url: url,
          name: `verified-document-${idx + 1}.pdf`,
          folder: 'verified'
        })));
      }
    }
    
    if ((!type || type === 'certificate') && upload.status === 'verified' && upload.certificate_pdf_path) {
      filesToDownload.push({
        url: upload.certificate_pdf_path,
        name: `e-APOSTILLE-${upload.certificate_number}.pdf`,
        folder: 'certificate'
      });
    }

    if (filesToDownload.length === 0) {
      return res.status(404).json({ message: 'No files available for download' });
    }

    // Download files from Cloudinary and create ZIP
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    const axios = require('axios');
    
    let successCount = 0;
    
    for (const file of filesToDownload) {
      try {
        console.log(`[Download] Fetching: ${file.url}`);
        
        // CRITICAL FIX: Use responseType: 'arraybuffer' for binary files
        const response = await axios.get(file.url, {
          responseType: 'arraybuffer',  // THIS IS REQUIRED!
          timeout: 30000,
          headers: {
            'Accept': '*/*'  // Accept any file type
          }
        });
        
        // Add to ZIP with folder structure
        const zipPath = `${file.folder}/${file.name}`;
        zip.addFile(zipPath, Buffer.from(response.data));  // Convert arraybuffer to Buffer
        
        successCount++;
        console.log(`[Download] Added: ${zipPath}, size: ${response.data.length} bytes`);
      } catch (err) {
        console.error(`[Download] Failed to fetch ${file.url}:`, err.message);
        // Continue with other files
      }
    }

    if (successCount === 0) {
      return res.status(500).json({ message: 'Failed to download files from cloud storage' });
    }

    const zipBuffer = zip.toBuffer();
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=apostille-${uploadId}-${type || 'all'}.zip`,
      'Content-Length': zipBuffer.length
    });
    
    console.log(`[Download] Success: ${successCount} files, ZIP size: ${zipBuffer.length} bytes`);
    res.send(zipBuffer);

  } catch (err) {
    console.error('[Download] Error:', err);
    res.status(500).json({ message: 'Download failed', error: err.message });
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

// GET /verify/:certificateNumber - PUBLIC ROUTE
router.get('/verify/:certificateNumber', async (req, res) => {
    try {
        const { certificateNumber } = req.params;
        
        // Get upload with user info - FIXED: use 'name' instead of 'full_name'
        const uploadQuery = `
            SELECT u.*, 
                   usr.name as user_name, 
                   usr.email as user_email,
                   verifier.name as verified_by_name
            FROM uploads u
            JOIN users usr ON u.user_id = usr.id
            LEFT JOIN users verifier ON u.verified_by = verifier.id
            WHERE u.certificate_number = $1
        `;
        
        const uploadResult = await pool.query(uploadQuery, [certificateNumber]);
        
        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ message: 'Certificate not found' });
        }
        
        const upload = uploadResult.rows[0];
        
        // Parse additional_signatures_data JSONB to get signers
        let signers = [];
        if (upload.additional_signatures_data) {
            try {
                const sigData = typeof upload.additional_signatures_data === 'string' 
                    ? JSON.parse(upload.additional_signatures_data) 
                    : upload.additional_signatures_data;
                
                if (Array.isArray(sigData)) {
                    signers = sigData.map(sig => ({
                        id: sig.id || sig.signerId,
                        name: sig.name,
                        designation: sig.designation,
                        organization: sig.organization,
                        signature_image: sig.signature_image || sig.signatureImage,
                        signatureDate: sig.signatureDate || sig.date || upload.certificate_date
                    }));
                }
            } catch (e) {
                console.warn('Failed to parse additional_signatures_data:', e.message);
            }
        }
        
        // Build documents array from reuploaded files
        let documents = [];
        
        if (upload.reuploaded_file_paths) {
            try {
                const reuploaded = typeof upload.reuploaded_file_paths === 'string'
                    ? JSON.parse(upload.reuploaded_file_paths)
                    : upload.reuploaded_file_paths;
                
                if (Array.isArray(reuploaded) && reuploaded.length > 0) {
                    documents = reuploaded.map((path, index) => ({
                        url: path,
                        originalName: `Document ${index + 1}`,
                        fileType: 'image/jpeg',
                        signers: signers
                    }));
                }
            } catch (e) {
                console.warn('Failed to parse reuploaded_file_paths:', e.message);
            }
        }
        
        // Fallback to original files if no reuploaded files
        if (documents.length === 0 && upload.file_paths) {
            try {
                const files = typeof upload.file_paths === 'string'
                    ? JSON.parse(upload.file_paths)
                    : upload.file_paths;
                
                if (Array.isArray(files)) {
                    documents = files.map((path, index) => ({
                        url: path,
                        originalName: upload.original_filename || `Document ${index + 1}`,
                        fileType: upload.file_type,
                        signers: signers
                    }));
                } else if (files) {
                    documents = [{
                        url: files,
                        originalName: upload.original_filename,
                        fileType: upload.file_type,
                        signers: signers
                    }];
                }
            } catch (e) {
                console.warn('Failed to parse file_paths:', e.message);
            }
        }
        
        // Final fallback to single file_path
        if (documents.length === 0 && upload.file_path) {
            documents = [{
                url: upload.file_path,
                originalName: upload.original_filename,
                fileType: upload.file_type,
                signers: signers
            }];
        }

        res.json({
            certificateNumber: upload.certificate_number,
            certificatePath: upload.certificate_pdf_path,
            userName: upload.user_name,
            userEmail: upload.user_email,
            verifiedByName: upload.verified_by_name,
            verifiedAt: upload.verified_at,
            authorityName: upload.authority_name,
            documents: documents
        });
        
    } catch (error) {
        console.error('Verification fetch error:', error);
        res.status(500).json({ 
            message: 'Internal server error', 
            error: error.message 
        });
    }
});

// GET /verify/:certificateNumber - PUBLIC ROUTE
router.get('/files/verify/:certificateNumber', async (req, res) => {
    try {
        const { certificateNumber } = req.params;
        
        // Get upload with user info
        const uploadQuery = `
            SELECT u.*, 
                   usr.name as user_name, 
                   usr.email as user_email,
                   verifier.name as verified_by_name
            FROM uploads u
            JOIN users usr ON u.user_id = usr.id
            LEFT JOIN users verifier ON u.verified_by = verifier.id
            WHERE u.certificate_number = $1
        `;
        
        const uploadResult = await pool.query(uploadQuery, [certificateNumber]);
        
        if (uploadResult.rows.length === 0) {
            return res.status(404).json({ message: 'Certificate not found' });
        }
        
        const upload = uploadResult.rows[0];
        
        // Parse additional_signatures_data JSONB to get signers
        let signers = [];
        if (upload.additional_signatures_data) {
            try {
                const sigData = typeof upload.additional_signatures_data === 'string' 
                    ? JSON.parse(upload.additional_signatures_data) 
                    : upload.additional_signatures_data;
                
                if (Array.isArray(sigData)) {
                    signers = sigData.map(sig => ({
                        id: sig.id || sig.signerId,
                        name: sig.name,
                        designation: sig.designation,
                        organization: sig.organization,
                        signature_image: sig.signature_image || sig.signatureImage,
                        signatureDate: sig.signatureDate || sig.date || upload.certificate_date
                    }));
                }
            } catch (e) {
                console.warn('Failed to parse additional_signatures_data:', e.message);
            }
        }
        
        // Build documents array from reuploaded files
        let documents = [];
        
        if (upload.reuploaded_file_paths) {
            try {
                const reuploaded = typeof upload.reuploaded_file_paths === 'string'
                    ? JSON.parse(upload.reuploaded_file_paths)
                    : upload.reuploaded_file_paths;
                
                if (Array.isArray(reuploaded) && reuploaded.length > 0) {
                    documents = reuploaded.map((path, index) => ({
                        url: path,
                        originalName: `Document ${index + 1}`,
                        fileType: 'image/jpeg',
                        signers: signers
                    }));
                }
            } catch (e) {
                console.warn('Failed to parse reuploaded_file_paths:', e.message);
            }
        }
        
        // Fallback to original files if no reuploaded files
        if (documents.length === 0 && upload.file_paths) {
            try {
                const files = typeof upload.file_paths === 'string'
                    ? JSON.parse(upload.file_paths)
                    : upload.file_paths;
                
                if (Array.isArray(files)) {
                    documents = files.map((path, index) => ({
                        url: path,
                        originalName: upload.original_filename || `Document ${index + 1}`,
                        fileType: upload.file_type,
                        signers: signers
                    }));
                } else if (files) {
                    documents = [{
                        url: files,
                        originalName: upload.original_filename,
                        fileType: upload.file_type,
                        signers: signers
                    }];
                }
            } catch (e) {
                console.warn('Failed to parse file_paths:', e.message);
            }
        }
        
        // Final fallback to single file_path
        if (documents.length === 0 && upload.file_path) {
            documents = [{
                url: upload.file_path,
                originalName: upload.original_filename,
                fileType: upload.file_type,
                signers: signers
            }];
        }

        res.json({
            certificateNumber: upload.certificate_number,
            certificatePath: upload.certificate_pdf_path,
            userName: upload.user_name,
            userEmail: upload.user_email,
            verifiedByName: upload.verified_by_name,
            verifiedAt: upload.verified_at,
            authorityName: upload.authority_name,
            documents: documents
        });
        
    } catch (error) {
        console.error('Verification fetch error:', error);
        res.status(500).json({ 
            message: 'Internal server error', 
            error: error.message 
        });
    }
});

// POST /verify/:id - PROTECTED ROUTE (Admin only)
router.post('/verify/:id', verifyToken, authorizeRole('admin'), uploadVerified.array('reuploadedFiles'), async (req, res) => {
  const uploadId = req.params.id;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Step 1: Fetch upload
    const uploadResult = await client.query('SELECT * FROM uploads WHERE id = $1', [uploadId]);
    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    const upload = uploadResult.rows[0];

    // Step 2: Validate required fields
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

    // Step 3: Generate certificate number (MUST match the format used elsewhere)
    const certNumber = await generateUniqueCertNumber(client);

    // Step 4: Generate certificate PDF
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

    const certResult = await generateEApostilleCertificate(certificateData);
    if (!certResult || !certResult.pdfBytes) {
      throw new Error('Certificate generator returned invalid result');
    }
    
    // Upload certificate to Cloudinary
    const streamifier = require('streamifier');
    const { cloudinary } = require('../config/cloudinary');
    
    const certUploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'apostille/certificates',
          public_id: `certificate-${certNumber}`,
          resource_type: 'raw',
          format: 'pdf'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(certResult.pdfBytes).pipe(uploadStream);
    });
    
    const certUrl = certUploadResult.secure_url;

    // Step 5: Upload reuploaded files to Cloudinary
    const reuploadedUrls = [];
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'apostille/verified',
        resource_type: 'auto'
      });
      reuploadedUrls.push(result.secure_url);
    }

    // Step 6: Parse additional signers
    let signaturesData = [];
    
    if (additionalSigners) {
      try {
        const signerIds = JSON.parse(additionalSigners);
        if (Array.isArray(signerIds) && signerIds.length > 0) {
          const signerIdsArray = signerIds.map(s => s.signerId || s.id);
          const signersResult = await client.query(
            'SELECT * FROM additional_signers WHERE id = ANY($1)',
            [signerIdsArray]
          );
          signaturesData = signersResult.rows.map(signer => ({
            id: signer.id,
            name: signer.name,
            designation: signer.designation,
            organization: signer.organization,
            signature_image: signer.signature_image,
            signatureDate: signerIds.find(s => (s.signerId || s.id) === signer.id)?.date || certificateDate
          }));
        }
      } catch (e) {
        console.warn('Failed to parse additionalSigners:', e.message);
      }
    }

    // Step 7: UPDATE DATABASE
    const updateQuery = `
      UPDATE uploads 
      SET status = 'verified',
          certificate_number = $1,
          certificate_pdf_path = $2,
          certificate_data = $3,
          reuploaded_file_paths = $4,
          additional_signatures_data = $5,
          verified_by = $6,
          verified_at = CURRENT_TIMESTAMP,
          document_issuer = $7,
          document_title = $8,
          document_location = $9,
          certificate_location = $10,
          certificate_date = $11,
          authority_name = $12
      WHERE id = $13
      RETURNING *
    `;

    await client.query(updateQuery, [
      certNumber,
      certUrl,
      JSON.stringify(certificateData),
      JSON.stringify(reuploadedUrls),
      JSON.stringify(signaturesData),
      req.user.id,
      documentIssuer,
      documentTitle,
      documentLocation,
      certificateLocation,
      certificateDate,
      authorityName,
      uploadId
    ]);

    await client.query('COMMIT');

    res.json({
      message: 'e-APOSTILLE Certificate generated successfully',
      certificateNumber: certNumber,
      certificatePath: certUrl,
      reuploadedFiles: reuploadedUrls
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Verification failed:', err);
    
    res.status(500).json({
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
  } finally {
    client.release();
  }
});

// Delete upload
// Delete upload - CLOUDINARY VERSION
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    
    if (req.user.role !== 'admin') {
      if (upload.status !== 'pending') {
        return res.status(400).json({ message: 'Only pending uploads can be deleted by users.' });
      }
      if (upload.user_id !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }
    
    // Delete files from Cloudinary
    const { cloudinary } = require('../config/cloudinary');
    
    try {
      // Delete original files
      if (upload.file_paths) {
        const files = typeof upload.file_paths === 'string' 
          ? JSON.parse(upload.file_paths) 
          : upload.file_paths;
        for (const f of Array.isArray(files) ? files : [files]) {
          if (f?.public_id) {
            await cloudinary.uploader.destroy(f.public_id, { resource_type: f.path?.includes('.pdf') ? 'raw' : 'image' });
          }
        }
      }
      
      // Delete certificate
      if (upload.certificate_pdf_path) {
        // Extract public_id from URL or store it separately
        const certPublicId = upload.certificate_pdf_path.match(/apostille\/certificates\/(.+?)(?:\.[^.]+)?$/)?.[1];
        if (certPublicId) {
          await cloudinary.uploader.destroy(`apostille/certificates/${certPublicId}`, { resource_type: 'raw' });
        }
      }
      
      // Delete reuploaded files
      if (upload.reuploaded_file_paths) {
        const paths = typeof upload.reuploaded_file_paths === 'string'
          ? JSON.parse(upload.reuploaded_file_paths)
          : upload.reuploaded_file_paths;
        for (const url of paths) {
          const publicId = url.match(/apostille\/verified\/(.+?)(?:\.[^.]+)?$/)?.[1];
          if (publicId) {
            await cloudinary.uploader.destroy(`apostille/verified/${publicId}`, { resource_type: 'raw' });
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete some Cloudinary files: ${err.message}`);
    }
    
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    
    res.json({ 
      message: req.user.role === 'admin' && upload.status === 'verified' 
        ? 'যাচাইকৃত আবেদন সফলভাবে মুছে ফেলা হয়েছে!' 
        : 'আবেদন সফলভাবে মুছে ফেলা হয়েছে!' 
    });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ message: 'Server error during deletion', error: err.message });
  }
});

// Serve original files
// Serve original files - CLOUDINARY VERSION (redirect to Cloudinary)
router.get('/uploads/:filename', verifyToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // Find the upload containing this file
    const uploads = await pool.query(
      `SELECT * FROM uploads 
       WHERE file_paths::text LIKE $1`,
      [`%${filename}%`]
    );
    
    if (uploads.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const upload = uploads.rows[0];
    
    // Check ownership (non-admin)
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Find the specific file URL
    const files = typeof upload.file_paths === 'string' 
      ? JSON.parse(upload.file_paths) 
      : upload.file_paths;
    
    const file = files.find(f => 
      (typeof f === 'object' ? f.path : f).includes(filename)
    );
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    const fileUrl = typeof file === 'object' ? file.path : file;
    
    // Redirect to Cloudinary URL
    res.redirect(fileUrl);
    
  } catch (error) {
    console.error('❌ File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});

// Serve verified files (public)
// Serve verified files - CLOUDINARY VERSION
router.get('/verified/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    
    // Find upload with this verified file
    const result = await pool.query(
      `SELECT reuploaded_file_paths FROM uploads 
       WHERE status = 'verified' AND reuploaded_file_paths::text LIKE $1`,
      [`%${filename}%`]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Find the specific URL
    const paths = typeof result.rows[0].reuploaded_file_paths === 'string'
      ? JSON.parse(result.rows[0].reuploaded_file_paths)
      : result.rows[0].reuploaded_file_paths;
    
    const fileUrl = paths.find(p => p.includes(filename));
    
    if (!fileUrl) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Redirect to Cloudinary
    res.redirect(fileUrl);
    
  } catch (error) {
    console.error('❌ File serve error:', error);
    res.status(500).json({ message: 'Error serving file' });
  }
});

// Serve certificate PDFs (public)
// Serve certificate PDFs - CLOUDINARY VERSION
router.get('/certificates/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }
    
    // Find upload with this certificate
    const result = await pool.query(
      `SELECT certificate_pdf_path FROM uploads 
       WHERE status = 'verified' AND certificate_pdf_path LIKE $1`,
      [`%${filename}%`]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Certificate not found' });
    }
    
    // Redirect to Cloudinary URL
    res.redirect(result.rows[0].certificate_pdf_path);
    
  } catch (error) {
    console.error('❌ Certificate serve error:', error);
    res.status(500).json({ message: 'Error serving certificate' });
  }
});

// PATCH endpoint for partial file updates
// PATCH endpoint for partial file updates - CLOUDINARY VERSION
router.patch('/edit/:id', verifyToken, uploadOriginal.array('files'), async (req, res) => {
  try {
    const { id } = req.params;
    const { removeIndices } = req.body;
    
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Cannot edit verified uploads' });
    }

    let currentFilePaths = [];
    if (upload.file_paths) {
      try {
        currentFilePaths = typeof upload.file_paths === 'string' 
          ? JSON.parse(upload.file_paths) 
          : upload.file_paths;
      } catch (e) {
        currentFilePaths = [upload.file_paths];
      }
    }

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

    indicesToRemove.sort((a, b) => b - a);
    const validIndices = indicesToRemove.filter(index => index >= 0 && index < currentFilePaths.length);

    // Delete from Cloudinary
    const { cloudinary } = require('../config/cloudinary');
    
    for (const index of validIndices) {
      const file = currentFilePaths[index];
      if (file && typeof file === 'object' && file.public_id) {
        try {
          await cloudinary.uploader.destroy(file.public_id, { 
            resource_type: file.path?.includes('.pdf') ? 'raw' : 'image' 
          });
        } catch (err) {
          console.error('Error deleting from Cloudinary:', err);
        }
      }
    }

    // Remove from array
    for (const index of validIndices) {
      currentFilePaths.splice(index, 1);
    }

    // Add new files (already uploaded to Cloudinary by multer)
    const newFiles = req.files || [];
    const newFilePaths = newFiles.map(file => ({
      path: file.path,  // Cloudinary URL
      original_name: file.originalname,
      public_id: file.filename
    }));
    
    const updatedFilePaths = [...currentFilePaths, ...newFilePaths];

    // Determine file type
    let fileType = upload.file_type;
    if (updatedFilePaths.length === 0) {
      fileType = null;
    } else if (updatedFilePaths.length === 1) {
      const url = updatedFilePaths[0].path || updatedFilePaths[0];
      fileType = url.includes('.pdf') ? 'pdf' : 'image';
    } else {
      fileType = 'multi-image';
    }

    const updateQuery = `
      UPDATE uploads 
      SET file_paths = $1, 
          file_type = $2,
          file_path = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND user_id = $5
      RETURNING *
    `;

    const filePathsValue = JSON.stringify(updatedFilePaths);
    const filePathValue = updatedFilePaths.length > 0 ? updatedFilePaths[0].path : null;

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




module.exports = router;