// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');
const { cloudinary } = require('../config/cloudinary');
const streamifier = require('streamifier');

function formatSignatureDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function getAssetsPath() {
  return path.join(__dirname, '..', 'assets');
}

// NEW: Process documents for verification - returns metadata only, no PDF conversion
async function processDocumentsForVerification(filePathsOrUrls, signers, certNumber = null) {
  const results = [];
  
  for (let i = 0; i < filePathsOrUrls.length; i++) {
    const fileInfo = filePathsOrUrls[i];
    const trimmedPath = (typeof fileInfo === 'string' ? fileInfo : fileInfo.path).trim();
    
    try {
      results.push({
        id: i + 1,
        url: trimmedPath,
        originalName: typeof fileInfo === 'object' ? fileInfo.originalname : `Document ${i + 1}`,
        signers: signers.map(signer => ({
          name: signer.name,
          designation: signer.designation,
          organization: signer.organization,
          signature_image: signer.signature_image,
          signatureDate: signer.signatureDate || new Date().toISOString()
        })),
        status: 'success'
      });
      
      console.log(`✅ Document ${i + 1} processed:`, trimmedPath);
    } catch (error) {
      console.error(`❌ Document ${i + 1} failed:`, error.message);
      results.push({ 
        id: i + 1, 
        originalName: typeof fileInfo === 'object' ? fileInfo.originalname : `Document ${i + 1}`,
        status: 'error', 
        message: error.message 
      });
    }
  }
  
  return results;
}

// For generating the e-Apostille certificate PDF only
async function generateCertificatePDF(certificateData) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  
  const assetsPath = getAssetsPath();
  let customFont, boldFont;
  
  try {
    customFont = await pdfDoc.embedFont(fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush.ttf')));
    boldFont = await pdfDoc.embedFont(fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush-bold.ttf')));
  } catch (e) {
    customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
  
  const purpleColor = rgb(91/255, 43/255, 131/255);
  
  // Title
  page.drawText('e-APOSTILLE', {
    x: width / 2 - 80,
    y: height - 100,
    size: 24,
    font: boldFont,
    color: purpleColor
  });
  
  // Certificate number
  page.drawText(`Certificate No: ${certificateData.certificateNumber}`, {
    x: 50,
    y: height - 150,
    size: 12,
    font: customFont,
    color: rgb(0, 0, 0)
  });
  
  // Add more certificate content as needed...
  
  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, certificateNumber: certificateData.certificateNumber };
}

module.exports = { 
  processDocumentsForVerification,
  generateCertificatePDF,
  formatSignatureDate 
};