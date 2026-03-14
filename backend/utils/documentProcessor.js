// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// Helper function to format dates (e.g., 05 March 2026)
function formatSignatureDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Helper function to get/create output directory
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
 * PROCESS MULTIPLE DOCUMENTS - Main entry point for batch processing
 * @param {Array} files - Array of file objects from multer
 * @param {Array} signers - Array of signer objects from database
 * @param {String} certNumber - Optional certificate number
 */
async function processMultipleDocuments(files, signers, certNumber = null) {
    console.log(`🔍 Processing batch: ${files.length} documents`);
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const verifiedUrl = await processDocumentWithSignatures(file.path, signers, certNumber);
            results.push({
                id: i + 1,
                originalName: file.originalname,
                verifiedUrl: verifiedUrl,
                status: 'success'
            });
        } catch (error) {
            console.error(`❌ Failed processing ${file.originalname}:`, error);
            results.push({
                id: i + 1,
                originalName: file.originalname,
                status: 'error',
                message: error.message
            });
        }
    }
    return results;
}

/**
 * Process single document (PDF or Image)
 */
async function processDocumentWithSignatures(filePath, signers, certNumber = null) {
    const ext = path.extname(filePath).toLowerCase();
    let pdfDoc;
    let originalFileName = path.basename(filePath);

    if (ext === '.pdf') {
        const pdfBytes = fs.readFileSync(filePath);
        pdfDoc = await PDFDocument.load(pdfBytes);
        await processPDF(pdfDoc, signers, certNumber);
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
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
    
    return `/uploads/verified/${outputFileName}`;
}

/**
 * PDF Processing Logic
 */
async function processPDF(pdfDoc, signers, certNumber = null) {
    pdfDoc.registerFontkit(fontkit);
    const pages = pdfDoc.getPages();
    
    // Load Fonts
    const fontBytes = fs.readFileSync(path.join(getAssetsPath(), 'fonts', 'kalpurush.ttf'));
    const boldFontBytes = fs.readFileSync(path.join(getAssetsPath(), 'fonts', 'kalpurush-bold.ttf'));
    const customFont = await pdfDoc.embedFont(fontBytes);
    const boldFont = await pdfDoc.embedFont(boldFontBytes);

    // Layout Constants (Optimized for 4-in-a-row)
    const sigBoxWidth = 140; 
    const sigHeight = 35;
    const textSize = 8;
    const purpleColor = rgb(76/255, 32/255, 114/255); // Matching #4C2072 from your image

    for (const page of pages) {
        const { width, height } = page.getSize();
        
        if (certNumber) {
            page.drawText(`Cert: ${certNumber}`, { x: 40, y: height - 30, size: 9, font: customFont });
        }

        const totalWidth = signers.length * sigBoxWidth;
        const startX = (width - totalWidth) / 2;
        const yBase = 50;

        for (let i = 0; i < signers.length; i++) {
            const signer = signers[i];
            const x = startX + (i * sigBoxWidth);

            // 1. "Attested" Text
            page.drawText("Attested", {
                x: x + (sigBoxWidth / 2) - 15,
                y: yBase + 75,
                size: 11,
                font: boldFont,
                color: purpleColor
            });

            // 2. Signature Image
            try {
                const sigPath = path.join(getAssetsPath(), 'signatures', 'documents', signer.signature_image);
                if (fs.existsSync(sigPath)) {
                    const sigImg = await pdfDoc.embedPng(fs.readFileSync(sigPath));
                    const imgWidth = (sigHeight * sigImg.width) / sigImg.height;
                    page.drawImage(sigImg, {
                        x: x + (sigBoxWidth / 2) - (imgWidth / 2),
                        y: yBase + 40,
                        width: imgWidth,
                        height: sigHeight
                    });
                }
            } catch (e) { console.warn("Sig image missing"); }

            // 3. Signer Details
            const detailsY = yBase + 25;
            page.drawText(formatSignatureDate(signer.signatureDate || new Date()), {
                x: x + (sigBoxWidth / 2) - 25, y: detailsY, size: textSize, font: customFont, color: purpleColor
            });
            page.drawText(signer.name, {
                x: x + 15, y: detailsY - 12, size: textSize, font: boldFont, color: purpleColor
            });
            page.drawText(signer.designation, {
                x: x + 15, y: detailsY - 22, size: textSize - 1, font: customFont, color: purpleColor
            });
        }
    }
}

/**
 * Image Processing Logic (Wraps image in PDF)
 */
async function processImage(pdfDoc, imagePath, signers, certNumber = null) {
    const imageBytes = fs.readFileSync(imagePath);
    const isPng = imagePath.toLowerCase().endsWith('.png');
    const image = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage([image.width, image.height + 150]);
    page.drawImage(image, { x: 0, y: 150, width: image.width, height: image.height });
    
    // Call PDF logic to draw signatures on the newly created page
    await processPDF(pdfDoc, signers, certNumber);
}

module.exports = {
    processDocumentWithSignatures,
    processMultipleDocuments
};