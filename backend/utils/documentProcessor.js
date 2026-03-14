// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

// Helper function to format dates
function formatSignatureDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Helper function to get output directory
function getOutputDir() {
    const outputDir = path.join(__dirname, '..', 'uploads', 'verified');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    return outputDir;
}

// Helper function to get assets path
function getAssetsPath() {
    return path.join(__dirname, '..', 'assets');
}

/**
 * PROCESS MULTIPLE DOCUMENTS - Main function for batch processing
 * @param {Array} files - Array of file objects from multer (req.files)
 * @param {Array} signers - Array of signer objects from database
 * @param {String} certNumber - Certificate number
 * @returns {Promise<Array>} - Array of results with URLs for each document
 */
async function processMultipleDocuments(files, signers, certNumber = null) {
    console.log(`🔍 Processing ${files.length} documents with ${signers.length} signatures`);
    
    const results = [];
    
    // Process files sequentially to avoid memory issues
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`\n📄 Processing file ${i + 1}/${files.length}: ${file.originalname}`);
        
        try {
            const filePath = file.path;
            const verifiedUrl = await processDocumentWithSignatures(filePath, signers, certNumber);
            
            results.push({
                id: i + 1,
                originalName: file.originalname,
                verifiedUrl: verifiedUrl,
                status: 'success',
                message: 'Document verified successfully'
            });
            
        } catch (error) {
            console.error(`❌ Failed to process ${file.originalname}:`, error);
            results.push({
                id: i + 1,
                originalName: file.originalname,
                status: 'error',
                message: error.message
            });
        }
    }
    
    console.log(`\n✅ Batch processing complete. Success: ${results.filter(r => r.status === 'success').length}/${files.length}`);
    return results;
}

/**
 * Process single document with signatures
 * @param {String} filePath - Path to uploaded file
 * @param {Array} signers - Array of signer objects
 * @param {String} certNumber - Certificate number
 * @returns {Promise<String>} - URL to verified document
 */
async function processDocumentWithSignatures(filePath, signers, certNumber = null) {
    console.log(`🔍 Processing document: ${filePath}`);
    
    const ext = path.extname(filePath).toLowerCase();
    let pdfDoc;
    let originalFileName = path.basename(filePath);
    
    try {
        if (ext === '.pdf') {
            console.log('📄 Processing PDF...');
            const pdfBytes = fs.readFileSync(filePath);
            pdfDoc = await PDFDocument.load(pdfBytes);
            await processPDF(pdfDoc, signers, certNumber);
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            console.log('🖼️ Processing Image...');
            pdfDoc = await PDFDocument.create();
            await processImage(pdfDoc, filePath, signers, certNumber);
        } else {
            throw new Error(`Unsupported file type: ${ext}`);
        }
        
        const outputDir = getOutputDir();
        const outputFileName = `verified_${Date.now()}_${originalFileName.replace(/\.[^/.]+$/, '')}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);
        
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(outputPath, pdfBytes);
        
        console.log(`✅ Verified document saved: ${outputPath}`);
        return `/uploads/verified/${outputFileName}`;
        
    } catch (error) {
        console.error('❌ Error processing document:', error);
        throw error;
    }
}

/**
 * Process PDF - Add signatures to existing PDF
 * @param {PDFDocument} pdfDoc - PDF document object
 * @param {Array} signers - Array of signer objects
 * @param {String} certNumber - Certificate number
 */
async function processPDF(pdfDoc, signers, certNumber = null) {
    pdfDoc.registerFontkit(fontkit);
    
    const pages = pdfDoc.getPages();
    const fontPath = path.join(getAssetsPath(), 'fonts', 'kalpurush.ttf');
    const customFont = fs.existsSync(fontPath) ? 
        await pdfDoc.embedFont(fs.readFileSync(fontPath)) : 
        await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const boldFontPath = path.join(getAssetsPath(), 'fonts', 'kalpurush-bold.ttf');
    const boldFont = fs.existsSync(boldFontPath) ?
        await pdfDoc.embedFont(fs.readFileSync(boldFontPath)) :
        await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Load attested image (smaller size)
    let attestedImage;
    try {
        const attestedPath = path.join(getAssetsPath(), 'attested.png');
        if (fs.existsSync(attestedPath)) {
            const attestedImageBytes = fs.readFileSync(attestedPath);
            attestedImage = await pdfDoc.embedPng(attestedImageBytes);
        }
    } catch (error) {
        console.warn('⚠️ Could not load attested image:', error.message);
    }
    
    // Adjusted sizes based on reference image - MORE COMPACT
    const sigBoxHeight = 110;  // Reduced from 130
    const sigBoxWidth = 240;   // Reduced from 260
    const attestedHeight = 14; // Reduced from 18
    const sigHeight = 28;      // Reduced from 35
    const textSize = 8;        // Reduced from 10
    const rowGap = 20;         // Reduced from 25
    const colGap = 25;         // Reduced from 30
    
    for (const page of pages) {
        const { width, height } = page.getSize();
        
        // Add certificate number at top if provided
        if (certNumber) {
            page.drawText(`Certificate No: ${certNumber}`, {
                x: 50,
                y: height - 30,
                size: 10,
                font: customFont,
                color: rgb(0, 0, 0)
            });
        }
        
        // Calculate layout for 4 signatures in a row
        const totalWidth = 4 * sigBoxWidth + 3 * colGap;
        const startX = (width - totalWidth) / 2;
        const startY = 60; // Bottom margin
        
        for (let i = 0; i < signers.length && i < 4; i++) {
            const signer = signers[i];
            const x = startX + i * (sigBoxWidth + colGap);
            const y = startY;
            
            // Draw attested image/text at top (smaller)
            if (attestedImage) {
                const aspectRatio = attestedImage.width / attestedImage.height;
                const attestedWidth = attestedHeight * aspectRatio;
                page.drawImage(attestedImage, {
                    x: x + (sigBoxWidth - attestedWidth) / 2,
                    y: y + sigBoxHeight - attestedHeight - 5,
                    width: attestedWidth,
                    height: attestedHeight
                });
            } else {
                page.drawText("Attested", {
                    x: x + 80,
                    y: y + sigBoxHeight - 15,
                    size: textSize,
                    font: boldFont,
                    color: rgb(0, 0, 0)
                });
            }
            
            // Load and draw signature image (smaller)
            try {
                const sigPath = path.join(getAssetsPath(), 'signatures', 'documents', signer.signature_image);
                if (fs.existsSync(sigPath) && signer.signature_image) {
                    const sigImageBytes = fs.readFileSync(sigPath);
                    const sigImage = await pdfDoc.embedPng(sigImageBytes);
                    const aspectRatio = sigImage.width / sigImage.height;
                    const sigWidth = sigHeight * aspectRatio;
                    
                    page.drawImage(sigImage, {
                        x: x + (sigBoxWidth - sigWidth) / 2,
                        y: y + sigBoxHeight - sigHeight - attestedHeight - 10,
                        width: sigWidth,
                        height: sigHeight
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Could not load signature for ${signer.name}:`, error.message);
            }
            
            // Draw text info (compact layout)
            let currentY = y + sigBoxHeight - sigHeight - attestedHeight - 18;
            
            // Date
            const dateText = signer.signatureDate ? 
                formatSignatureDate(signer.signatureDate) : 
                "Date: _______________";
            page.drawText(dateText, {
                x: x + 10,
                y: currentY,
                size: textSize - 1,
                font: customFont,
                color: rgb(0, 0, 0)
            });
            currentY -= 12;
            
            // Name (bold)
            page.drawText(signer.name, {
                x: x + 10,
                y: currentY,
                size: textSize,
                font: boldFont,
                color: rgb(0, 0, 0)
            });
            currentY -= 10;
            
            // Designation
            page.drawText(signer.designation, {
                x: x + 10,
                y: currentY,
                size: textSize - 0.5,
                font: customFont,
                color: rgb(0, 0, 0)
            });
            currentY -= 9;
            
            // Organization
            page.drawText(signer.organization, {
                x: x + 10,
                y: currentY,
                size: textSize - 1,
                font: customFont,
                color: rgb(0, 0, 0)
            });
        }
    }
    
    return pdfDoc;
}

/**
 * Process Image - Convert to PDF and add signatures
 * @param {PDFDocument} pdfDoc - PDF document object
 * @param {String} imagePath - Path to image file
 * @param {Array} signers - Array of signer objects
 * @param {String} certNumber - Certificate number
 */
async function processImage(pdfDoc, imagePath, signers, certNumber = null) {
    pdfDoc.registerFontkit(fontkit);
    
    const fontPath = path.join(getAssetsPath(), 'fonts', 'kalpurush.ttf');
    const customFont = fs.existsSync(fontPath) ? 
        await pdfDoc.embedFont(fs.readFileSync(fontPath)) : 
        await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const boldFontPath = path.join(getAssetsPath(), 'fonts', 'kalpurush-bold.ttf');
    const boldFont = fs.existsSync(boldFontPath) ?
        await pdfDoc.embedFont(fs.readFileSync(boldFontPath)) :
        await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Load image
    const ext = path.extname(imagePath).toLowerCase();
    const imageBytes = fs.readFileSync(imagePath);
    let embeddedImage;
    
    if (ext === '.png') {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
    } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
    }
    
    // Add page with image and extra space for signatures
    const pageWidth = embeddedImage.width;
    const pageHeight = embeddedImage.height + 180; // Extra space for signatures
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Draw image at top
    page.drawImage(embeddedImage, {
        x: 0,
        y: 180,
        width: embeddedImage.width,
        height: embeddedImage.height
    });
    
    // Adjusted sizes for image mode (even more compact)
    const sigBoxHeight = 110;
    const sigBoxWidth = 240;
    const sigHeight = 24; // Smaller for image mode
    const textSize = 7;   // Smaller for image mode
    
    // Calculate layout for 4 signatures
    const totalWidth = 4 * sigBoxWidth + 3 * 25;
    const startX = (pageWidth - totalWidth) / 2;
    const startY = 20;
    
    for (let i = 0; i < signers.length && i < 4; i++) {
        const signer = signers[i];
        const x = startX + i * (sigBoxWidth + 25);
        
        // Draw signature image (smaller)
        try {
            const sigPath = path.join(getAssetsPath(), 'signatures', 'documents', signer.signature_image);
            if (fs.existsSync(sigPath) && signer.signature_image) {
                const sigBytes = fs.readFileSync(sigPath);
                const sigImage = await pdfDoc.embedPng(sigBytes);
                const aspectRatio = sigImage.width / sigImage.height;
                const sigWidth = sigHeight * aspectRatio;
                
                page.drawImage(sigImage, {
                    x: x + (sigBoxWidth - sigWidth) / 2,
                    y: startY + 80,
                    width: sigWidth,
                    height: sigHeight
                });
            }
        } catch (error) {
            console.warn(`⚠️ Could not load signature for ${signer.name}:`, error.message);
        }
        
        // Draw text info (compact)
        let currentY = startY + 65;
        
        // Date
        const dateText = signer.signatureDate ? 
            formatSignatureDate(signer.signatureDate) : 
            "Date: _______________";
        page.drawText(dateText, {
            x: x + 10,
            y: currentY,
            size: 7,
            font: customFont,
            color: rgb(0, 0, 0)
        });
        currentY -= 11;
        
        // Name (bold)
        page.drawText(signer.name, {
            x: x + 10,
            y: currentY,
            size: 7,
            font: boldFont,
            color: rgb(0, 0, 0)
        });
        currentY -= 9;
        
        // Designation
        page.drawText(signer.designation, {
            x: x + 10,
            y: currentY,
            size: 6.5,
            font: customFont,
            color: rgb(0, 0, 0)
        });
        currentY -= 8;
        
        // Organization
        page.drawText(signer.organization, {
            x: x + 10,
            y: currentY,
            size: 6,
            font: customFont,
            color: rgb(0, 0, 0)
        });
    }
    
    return pdfDoc;
}

module.exports = { 
    processDocumentWithSignatures,
    processMultipleDocuments  // <-- ADD THIS EXPORT
};