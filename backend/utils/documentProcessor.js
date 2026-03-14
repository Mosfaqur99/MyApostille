
// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');  // ADD THIS IMPORT
const fs = require('fs');  // KEEP full fs module
const fsp = fs.promises;  // Separate promises reference
const path = require('path');

// Helper function to format date as "08 Feb 2026"
function formatSignatureDate(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month} ${year}`;
  } catch (e) {
    return dateString;
  }
}

function getOutputDir() {
  return process.env.UPLOAD_DIR 
    ? path.join(process.env.UPLOAD_DIR, 'verified')
    : path.join(__dirname, '..', 'uploads', 'verified');
}

function getAssetsPath() {
  const possiblePaths = [
    path.join(__dirname, '..', 'assets'),
    path.join(__dirname, '..', '..', 'assets'),
    path.join('/opt/render/project/src', 'backend', 'assets'),
    path.join(process.cwd(), 'backend', 'assets'),
    path.join(process.cwd(), 'assets')
  ];
  
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  return possiblePaths[0];
}

async function processDocumentWithSignatures(filePath, signers, certNumber) {
  console.log('🔍 processDocumentWithSignatures called');
  console.log('🔍 filePath:', filePath);
  console.log('🔍 signers:', signers?.length);
  console.log('🔍 certNumber:', certNumber);
  
  try {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath, ext);
    const outputDir = getOutputDir();
    
    console.log('🔍 outputDir:', outputDir);
    
    // Ensure directory exists (use sync version)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log('🔍 Created output directory');
    }
    
    const outputPath = path.join(outputDir, `${filename}_verified${ext}`);
    console.log('🔍 outputPath:', outputPath);
    
    // Format dates for all signers
    const formattedSigners = signers.map(signer => ({
      ...signer,
      signatureDate: formatSignatureDate(signer.signatureDate)
    }));
    
    if (ext === '.pdf') {
      return await processPDF(filePath, formattedSigners, outputPath);
    } else {
      return await processImage(filePath, formattedSigners, outputPath);
    }
  } catch (err) {
    console.error('❌ processDocumentWithSignatures failed:', err);
    throw err;
  }
}

async function processPDF(filePath, signers, outputPath) {
  console.log('🔍 Processing PDF:', filePath);
  
  try {
    const pdfBytes = await fsp.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);  // Now fontkit is defined
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    
    const assetsPath = getAssetsPath();
    const fontsPath = path.join(assetsPath, 'fonts');
    const sigPath = path.join(assetsPath, 'signatures', 'documents');
    
    console.log('🔍 assetsPath:', assetsPath);
    console.log('🔍 fontsPath:', fontsPath);
    console.log('🔍 sigPath:', sigPath);

    // Verify signature files exist
    for (const signer of signers) {
      const sigFilePath = path.join(sigPath, signer.signature_image);
      console.log(`🔍 Checking signature: ${sigFilePath} - Exists: ${fs.existsSync(sigFilePath)}`);
    }

    // Load fonts
    let timesRegular, timesBold;
    try {
      const regularBytes = await fsp.readFile(path.join(fontsPath, 'TimesRoman-Regular.ttf'));
      const boldBytes = await fsp.readFile(path.join(fontsPath, 'TimesRoman-Bold.ttf'));
      
      timesRegular = await pdfDoc.embedFont(regularBytes);
      timesBold = await pdfDoc.embedFont(boldBytes);
      console.log('✅ Times Roman fonts loaded');
    } catch (fontErr) {
      console.error('❌ Font load failed:', fontErr.message);
      timesRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      timesBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
    
    // Load "Attested" text image (replaces verified/certified)
    let attestedTextImage;
    try {
      const attestedBytes = await fsp.readFile(path.join(sigPath, 'attested_text.png'));
      attestedTextImage = await pdfDoc.embedPng(attestedBytes);
      console.log('✅ attested_text.png loaded');
    } catch (err) {
      console.log('⚠️ attested_text.png not found, will use text fallback');
    }
    
    const numSigners = signers.length;
    const sigBoxHeight = 110;  // REDUCED from 130
    const sigBoxWidth = 240;   // REDUCED from 260
    
    const cols = numSigners === 1 ? 1 : 2;
    const rows = Math.ceil(numSigners / cols);
    const rowGap = 20;         // REDUCED from 25
    const bottomMargin = 25;   // REDUCED from 30
    
    const totalSigHeight = (rows * sigBoxHeight) + ((rows - 1) * rowGap);
    const startY = bottomMargin + totalSigHeight - 15;  // Adjusted
    
    const blueColor = rgb(0.25, 0.25, 0.6);
    const TEXT_SIZE = 8;       // REDUCED from 10
    const colGap = 25;         // REDUCED from 30
    
    // Draw signatures in grid
    for (let i = 0; i < numSigners; i++) {
      const signer = signers[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      const totalGridWidth = cols * sigBoxWidth + (cols - 1) * colGap;
      const startX = (width - totalGridWidth) / 2;
      const x = startX + (col * (sigBoxWidth + colGap));
      const y = startY - 15 - (row * (sigBoxHeight + rowGap));  // Adjusted
      
      const centerX = x + (sigBoxWidth / 2);
      
      // Draw "Attested" text/image for ALL signers (replaces verified/certified)
      if (attestedTextImage) {
        const textHeight = 14;     // REDUCED from 18
        const textScale = textHeight / attestedTextImage.height;
        const textWidth = attestedTextImage.width * textScale;
        
        lastPage.drawImage(attestedTextImage, {
          x: centerX - (textWidth / 2),
          y: y,
          width: textWidth,
          height: textHeight
        });
      } else {
        // Fallback to text if image not found
        const text = 'Attested';
        const textWidth = timesRegular.widthOfTextAtSize(text, TEXT_SIZE);
        lastPage.drawText(text, {
          x: centerX - (textWidth / 2),
          y: y,
          size: TEXT_SIZE,
          font: timesRegular,
          color: blueColor
        });
      }
      
      let currentY = y - 18;     // REDUCED from 22
      
      // Draw signature image
      try {
        const sigFullPath = path.join(sigPath, signer.signature_image);
        console.log(`🔍 Loading signature from: ${sigFullPath}`);
        
        const sigBytes = await fsp.readFile(sigFullPath);
        
        // Try PNG first, then JPG
        let sigImage;
        try {
          sigImage = await pdfDoc.embedPng(sigBytes);
        } catch (pngErr) {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        }
        
        const sigHeight = 28;      // REDUCED from 35
        const sigScale = sigHeight / sigImage.height;
        const sigWidth = sigImage.width * sigScale;
        
        lastPage.drawImage(sigImage, {
          x: centerX - (sigWidth / 2),
          y: currentY - sigHeight,
          width: sigWidth,
          height: sigHeight
        });
        
        console.log(`✅ Drawn signature for ${signer.name}`);
        currentY -= (sigHeight + 8);  // REDUCED from 10
      } catch (err) {
        console.error(`❌ Signature image failed for ${signer.name}:`, err.message);
        const fallbackText = '[SIGNATURE]';
        const textWidth = timesRegular.widthOfTextAtSize(fallbackText, TEXT_SIZE);
        lastPage.drawText(fallbackText, {
          x: centerX - (textWidth / 2),
          y: currentY - 10,  // REDUCED from 12
          size: TEXT_SIZE,
          font: timesRegular,
          color: blueColor
        });
        currentY -= 20;  // REDUCED from 24
      }
      
      // Draw date
      const dateText = signer.signatureDate;
      const dateWidth = timesRegular.widthOfTextAtSize(dateText, TEXT_SIZE);
      lastPage.drawText(dateText, {
        x: centerX - (dateWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 10;  // REDUCED from 12
      
      // Draw name (bold)
      const nameWidth = timesBold.widthOfTextAtSize(signer.name, TEXT_SIZE);
      lastPage.drawText(signer.name, {
        x: centerX - (nameWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesBold,
        color: blueColor
      });
      currentY -= 9;   // REDUCED from 11
      
      // Draw designation
      const desigWidth = timesRegular.widthOfTextAtSize(signer.designation, TEXT_SIZE);
      lastPage.drawText(signer.designation, {
        x: centerX - (desigWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 9;   // REDUCED from 11
      
      // Draw organization
      const orgText = signer.organization;
      let orgFont = timesRegular;
      let orgSize = TEXT_SIZE;
      let orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
      
      const maxOrgWidth = sigBoxWidth - 10;
      if (orgWidth > maxOrgWidth) {
        orgSize = (maxOrgWidth / orgWidth) * TEXT_SIZE;
        orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
      }
      
      lastPage.drawText(orgText, {
        x: centerX - (orgWidth / 2),
        y: currentY,
        size: orgSize,
        font: orgFont,
        color: blueColor
      });
    }
    
    const modifiedPdfBytes = await pdfDoc.save();
    await fsp.writeFile(outputPath, modifiedPdfBytes);
    
    console.log('✅ PDF processed and saved:', outputPath);
    return `/uploads/verified/${path.basename(outputPath)}`;
    
  } catch (err) {
    console.error('❌ PDF processing failed:', err);
    throw err;
  }
}

async function processImage(filePath, signers, outputPath) {
  console.log('🔍 Processing Image:', filePath);
  
  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);  // Register fontkit here too
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    
    // Load and embed original image
    const imageBytes = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    let embeddedImage;
    try {
      if (ext === '.png') {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      }
    } catch (err) {
      throw new Error(`Failed to embed image: ${err.message}`);
    }
    
    // Calculate dimensions
    const margin = 40;
    const availableWidth = pageWidth - (margin * 2);
    
    const scale = availableWidth / embeddedImage.width;
    const imgWidth = availableWidth;
    const imgHeight = embeddedImage.height * scale;
    
    // Calculate signature section
    const numSigners = signers.length;
    const sigBoxHeight = 110;  // REDUCED from 130
    const sigBoxWidth = 240;   // REDUCED from 260
    const rows = Math.ceil(numSigners / 2);
    const rowGap = 20;         // REDUCED from 25
    const sigSectionHeight = (rows * sigBoxHeight) + ((rows - 1) * rowGap) + 15;  // Adjusted
    
    const totalHeight = imgHeight + sigSectionHeight + 15;  // Adjusted
    const finalPageHeight = Math.max(pageHeight, totalHeight);
    
    const page = pdfDoc.addPage([pageWidth, finalPageHeight]);
    
    // Draw image at top
    page.drawImage(embeddedImage, {
      x: margin,
      y: finalPageHeight - imgHeight - 8,  // Adjusted
      width: imgWidth,
      height: imgHeight
    });
    
    const assetsPath = getAssetsPath();
    const fontsPath = path.join(assetsPath, 'fonts');
    const sigPath = path.join(assetsPath, 'signatures', 'documents');
    
    // Load fonts
    let timesRegular, timesBold;
    try {
      const regularBytes = await fsp.readFile(path.join(fontsPath, 'TimesRoman-Regular.ttf'));
      const boldBytes = await fsp.readFile(path.join(fontsPath, 'TimesRoman-Bold.ttf'));
      
      timesRegular = await pdfDoc.embedFont(regularBytes);
      timesBold = await pdfDoc.embedFont(boldBytes);
    } catch (fontErr) {
      console.error('Font load failed:', fontErr.message);
      timesRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      timesBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
    
    // Load "Attested" text image
    let attestedTextImage;
    try {
      const attestedBytes = await fsp.readFile(path.join(sigPath, 'attested_text.png'));
      attestedTextImage = await pdfDoc.embedPng(attestedBytes);
    } catch (err) {
      console.log('attested_text.png not found');
    }
    
    const blueColor = rgb(0.25, 0.25, 0.6);
    const TEXT_SIZE = 7;       // REDUCED from 8
    const colGap = 25;         // REDUCED from 30
    
    // Draw signatures
    const sigStartY = finalPageHeight - imgHeight - 12;  // Adjusted
    const cols = numSigners === 1 ? 1 : 2;
    
    for (let i = 0; i < numSigners; i++) {
      const signer = signers[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      
      const totalGridWidth = cols * sigBoxWidth + (cols - 1) * colGap;
      const startX = (pageWidth - totalGridWidth) / 2;
      const x = startX + (col * (sigBoxWidth + colGap));
      const y = sigStartY - (row * (sigBoxHeight + rowGap));
      
      const centerX = x + (sigBoxWidth / 2);
      
      // Draw "Attested" for ALL signers
      if (attestedTextImage) {
        const textHeight = 12;     // REDUCED from 18
        const textScale = textHeight / attestedTextImage.height;
        const textWidth = attestedTextImage.width * textScale;
        
        page.drawImage(attestedTextImage, {
          x: centerX - (textWidth / 2),
          y: y,
          width: textWidth,
          height: textHeight
        });
      } else {
        const text = 'Attested';
        const textWidth = timesRegular.widthOfTextAtSize(text, TEXT_SIZE);
        page.drawText(text, {
          x: centerX - (textWidth / 2),
          y: y,
          size: TEXT_SIZE,
          font: timesRegular,
          color: blueColor
        });
      }
      
      let currentY = y - 16;     // REDUCED from 22
      
      // Draw signature
      try {
        const sigFullPath = path.join(sigPath, signer.signature_image);
        const sigBytes = await fsp.readFile(sigFullPath);
        
        let sigImage;
        try {
          sigImage = await pdfDoc.embedPng(sigBytes);
        } catch (pngErr) {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        }
        
        const sigHeight = 24;      // REDUCED from 35
        const sigScale = sigHeight / sigImage.height;
        const sigWidth = sigImage.width * sigScale;
        
        page.drawImage(sigImage, {
          x: centerX - (sigWidth / 2),
          y: currentY - sigHeight,
          width: sigWidth,
          height: sigHeight
        });
        
        currentY -= (sigHeight + 6);  // REDUCED from 10
      } catch (err) {
        console.log('Signature not found:', signer.signature_image);
        const fallbackText = '[SIGNATURE]';
        const textWidth = timesRegular.widthOfTextAtSize(fallbackText, TEXT_SIZE);
        page.drawText(fallbackText, {
          x: centerX - (textWidth / 2),
          y: currentY - 8,  // REDUCED from 12
          size: TEXT_SIZE,
          font: timesRegular,
          color: blueColor
        });
        currentY -= 16;  // REDUCED from 24
      }
      
      // Draw date
      const dateWidth = timesRegular.widthOfTextAtSize(signer.signatureDate, TEXT_SIZE);
      page.drawText(signer.signatureDate, {
        x: centerX - (dateWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 9;   // REDUCED from 12
      
      // Draw name (bold)
      const nameWidth = timesBold.widthOfTextAtSize(signer.name, TEXT_SIZE);
      page.drawText(signer.name, {
        x: centerX - (nameWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesBold,
        color: blueColor
      });
      currentY -= 8;   // REDUCED from 11
      
      // Draw designation
      const desigWidth = timesRegular.widthOfTextAtSize(signer.designation, TEXT_SIZE);
      page.drawText(signer.designation, {
        x: centerX - (desigWidth / 2),
        y: currentY,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 8;   // REDUCED from 11
      
      // Draw organization
      const orgText = signer.organization;
      let orgFont = timesRegular;
      let orgSize = TEXT_SIZE;
      let orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
      
      const maxOrgWidth = sigBoxWidth - 10;
      if (orgWidth > maxOrgWidth) {
        orgSize = (maxOrgWidth / orgWidth) * TEXT_SIZE;
        orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
      }
      
      page.drawText(orgText, {
        x: centerX - (orgWidth / 2),
        y: currentY,
        size: orgSize,
        font: orgFont,
        color: blueColor
      });
    }
    
    const pdfBytes = await pdfDoc.save();
    const finalOutputPath = outputPath.replace(/\\.(jpg|jpeg|png)$/i, '.pdf');
    await fsp.writeFile(finalOutputPath, pdfBytes);
    
    console.log('✅ Image processed and saved:', finalOutputPath);
    return `/uploads/verified/${path.basename(finalOutputPath)}`;
    
  } catch (err) {
    console.error('❌ Image processing failed:', err);
    throw err;
  }
}

module.exports = { processDocumentWithSignatures };
