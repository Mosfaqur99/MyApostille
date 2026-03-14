// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ==========================================
// TEXT SIZE CONFIGURATION - ADJUST THESE VALUES
// ==========================================
// To change text sizes, modify these constants:
// - DATE_SIZE: Date text size (default: 6)
// - NAME_SIZE: Signer name size (default: 7) 
// - DESIGNATION_SIZE: Designation text size (default: 6)
// - ATTESTED_IMG_HEIGHT: Height of attested image (default: 15)
// Increase numbers to make text bigger, decrease to make smaller

const TEXT_SIZES = {
  date: 7,        // Date text size
  name: 6,        // Signer name size (bold)
  designation: 6, // Designation text size
  attestedImgHeight: 15 // Height of attested image in points
};

// Layout configuration
const LAYOUT_CONFIG = {
  mobile: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 120,
    sigHeight: 30,
    yOffset: 80,
    verticalSpacing: 90,
    marginX: 20
  },
  tablet: {
    maxSignaturesPerRow: 3,
    sigBoxWidth: 130,
    sigHeight: 32,
    yOffset: 70,
    verticalSpacing: 85,
    marginX: 30
  },
  desktop: {
    maxSignaturesPerRow: 4,
    sigBoxWidth: 140,
    sigHeight: 35,
    yOffset: 60,
    verticalSpacing: 80,
    marginX: 40
  }
};

function formatSignatureDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function getOutputDir() {
  const baseDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  const outputDir = path.join(baseDir, 'verified');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  return outputDir;
}

function getAssetsPath() {
  return path.join(__dirname, '..', 'assets');
}

function getDeviceType(width, height) {
  const minDim = Math.min(width, height);
  if (minDim < 600) return 'mobile';
  if (minDim < 900) return 'tablet';
  return 'desktop';
}

function calculateLayout(pageWidth, pageHeight, numSigners) {
  const deviceType = getDeviceType(pageWidth, pageHeight);
  const config = LAYOUT_CONFIG[deviceType];
  
  const sigsPerRow = Math.min(numSigners, config.maxSignaturesPerRow);
  const numRows = Math.ceil(numSigners / config.maxSignaturesPerRow);
  
  const availableWidth = pageWidth - (config.marginX * 2);
  const actualBoxWidth = Math.min(
    config.sigBoxWidth,
    Math.floor(availableWidth / sigsPerRow) - 10
  );
  
  const totalRowWidth = (sigsPerRow * actualBoxWidth) + ((sigsPerRow - 1) * 10);
  const startX = (pageWidth - totalRowWidth) / 2;
  const startY = Math.max(config.yOffset, config.yOffset);
  
  return {
    deviceType,
    sigsPerRow,
    numRows,
    boxWidth: actualBoxWidth,
    boxHeight: config.sigHeight,
    startX,
    startY,
    verticalSpacing: config.verticalSpacing,
    marginX: config.marginX
  };
}

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

async function processDocumentWithSignatures(filePath, signers, certNumber = null) {
  const ext = path.extname(filePath).toLowerCase();
  let pdfDoc;
  let originalFileName = path.basename(filePath);

  if (ext === '.pdf') {
    const pdfBytes = fs.readFileSync(filePath);
    pdfDoc = await PDFDocument.load(pdfBytes);
    await processPDF(pdfDoc, signers);
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    pdfDoc = await PDFDocument.create();
    await processImage(pdfDoc, filePath, signers);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const outputDir = getOutputDir();
  const outputFileName = `verified_${Date.now()}_${originalFileName.replace(/\.[^/.]+$/, '')}.pdf`;
  const outputPath = path.join(outputDir, outputFileName);

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  
  console.log('✅ Saved verified file to:', outputPath);
  return `verified/${outputFileName}`;
}

async function processPDF(pdfDoc, signers) {
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  
  let customFont, boldFont;
  const assetsPath = getAssetsPath();
  const purpleColor = rgb(76/255, 32/255, 114/255);
  
  // Load attested image once
  let attestedImg = null;
  try {
    const attestedPath = path.join(assetsPath, 'signatures', 'documents', 'attested_text.png');
    if (fs.existsSync(attestedPath)) {
      const attestedBytes = fs.readFileSync(attestedPath);
      attestedImg = await pdfDoc.embedPng(attestedBytes);
      console.log('✅ Loaded attested_text.png');
    } else {
      console.warn('⚠️ attested_text.png not found at:', attestedPath);
    }
  } catch (e) {
    console.warn('⚠️ Failed to load attested image:', e.message);
  }
  
  try {
    const fontPath = path.join(assetsPath, 'fonts', 'kalpurush.ttf');
    const boldFontPath = path.join(assetsPath, 'fonts', 'kalpurush-bold.ttf');
    
    if (fs.existsSync(fontPath) && fs.existsSync(boldFontPath)) {
      const fontBytes = fs.readFileSync(fontPath);
      const boldFontBytes = fs.readFileSync(boldFontPath);
      customFont = await pdfDoc.embedFont(fontBytes);
      boldFont = await pdfDoc.embedFont(boldFontBytes);
    } else {
      console.warn('⚠️ Font files not found, using default fonts');
      customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
  } catch (e) {
    console.warn('⚠️ Font loading failed, using defaults:', e.message);
    customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  for (const page of pages) {
    const { width, height } = page.getSize();

    const layout = calculateLayout(width, height, signers.length);
    console.log(`📐 Page ${width}x${height} detected as ${layout.deviceType}, using ${layout.sigsPerRow} per row`);

    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const row = Math.floor(i / layout.sigsPerRow);
      const col = i % layout.sigsPerRow;
      
      const x = layout.startX + (col * (layout.boxWidth + 10));
      const y = layout.startY + (row * layout.verticalSpacing);

      await drawSignatureBox(
        page, 
        signer, 
        x, 
        y, 
        layout.boxWidth, 
        layout.boxHeight,
        customFont,
        boldFont,
        purpleColor,
        assetsPath,
        attestedImg
      );
    }
  }
}

async function drawSignatureBox(page, signer, x, y, boxWidth, sigHeight, customFont, boldFont, color, assetsPath, attestedImg) {
  // 1. Attested Image (instead of text)
  if (attestedImg) {
    const imgWidth = (TEXT_SIZES.attestedImgHeight * attestedImg.width) / attestedImg.height;
    page.drawImage(attestedImg, {
      x: x + (boxWidth - imgWidth) / 2,
      y: y + sigHeight + 20, // Position above signature
      width: imgWidth,
      height: TEXT_SIZES.attestedImgHeight
    });
  }

  // 2. Signature Image
  try {
    const sigPath = path.join(assetsPath, 'signatures', 'documents', signer.signature_image);
    if (fs.existsSync(sigPath)) {
      const sigBytes = fs.readFileSync(sigPath);
      const sigImg = sigPath.toLowerCase().endsWith('.png') 
        ? await page.doc.embedPng(sigBytes)
        : await page.doc.embedJpg(sigBytes);
      
      const scale = Math.min(
        (boxWidth - 20) / sigImg.width,
        sigHeight / sigImg.height
      );
      
      const scaledWidth = sigImg.width * scale;
      const scaledHeight = sigImg.height * scale;
      
      page.drawImage(sigImg, {
        x: x + (boxWidth - scaledWidth) / 2,
        y: y + (sigHeight - scaledHeight) / 2,
        width: scaledWidth,
        height: scaledHeight
      });
    }
  } catch (e) {
    console.warn(`⚠️ Signature image missing for ${signer.name}:`, e.message);
  }

  // 3. Date (using TEXT_SIZES.date)
  const dateText = formatSignatureDate(signer.signatureDate || new Date());
  const dateWidth = customFont.widthOfTextAtSize(dateText, TEXT_SIZES.date);
  page.drawText(dateText, {
    x: x + (boxWidth - dateWidth) / 2,
    y: y - 10, // Reduced spacing for smaller text
    size: TEXT_SIZES.date,
    font: customFont,
    color: color
  });

  // 4. Name (using TEXT_SIZES.name - bold)
  let nameText = signer.name || '';
  const maxNameWidth = boxWidth - 10;
  while (boldFont.widthOfTextAtSize(nameText, TEXT_SIZES.name) > maxNameWidth && nameText.length > 3) {
    nameText = nameText.slice(0, -4) + '...';
  }
  const nameWidth = boldFont.widthOfTextAtSize(nameText, TEXT_SIZES.name);
  page.drawText(nameText, {
    x: x + (boxWidth - nameWidth) / 2,
    y: y - 18, // Tighter spacing
    size: TEXT_SIZES.name,
    font: boldFont,
    color: color
  });

  // 5. Designation (using TEXT_SIZES.designation)
  let desigText = signer.designation || '';
  while (customFont.widthOfTextAtSize(desigText, TEXT_SIZES.designation) > maxNameWidth && desigText.length > 3) {
    desigText = desigText.slice(0, -4) + '...';
  }
  const desigWidth = customFont.widthOfTextAtSize(desigText, TEXT_SIZES.designation);
  page.drawText(desigText, {
    x: x + (boxWidth - desigWidth) / 2,
    y: y - 26, // Tighter spacing
    size: TEXT_SIZES.designation,
    font: customFont,
    color: color
  });
}

async function processImage(pdfDoc, imagePath, signers) {
  const imageBytes = fs.readFileSync(imagePath);
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const image = isPng 
    ? await pdfDoc.embedPng(imageBytes) 
    : await pdfDoc.embedJpg(imageBytes);

  const sigSpace = Math.min(400, signers.length * 100);
  const pageHeight = image.height + sigSpace;
  
  const page = pdfDoc.addPage([image.width, pageHeight]);
  
  page.drawImage(image, { 
    x: 0, 
    y: sigSpace, 
    width: image.width, 
    height: image.height 
  });
  
  await processPDF(pdfDoc, signers);
}

module.exports = {
  processDocumentWithSignatures,
  processMultipleDocuments
};