// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// Configuration for different page sizes
const LAYOUT_CONFIG = {
  mobile: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 120,
    sigHeight: 30,
    textSize: 7,
    yOffset: 80, // Higher up on mobile
    verticalSpacing: 90,
    marginX: 20
  },
  tablet: {
    maxSignaturesPerRow: 3,
    sigBoxWidth: 130,
    sigHeight: 32,
    textSize: 8,
    yOffset: 70,
    verticalSpacing: 85,
    marginX: 30
  },
  desktop: {
    maxSignaturesPerRow: 4,
    sigBoxWidth: 140,
    sigHeight: 35,
    textSize: 9,
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

// Detect device type based on page dimensions
function getDeviceType(width, height) {
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  
  // Mobile: width < 600 (typical phone portrait)
  if (minDim < 600) return 'mobile';
  // Tablet: width 600-900
  if (minDim < 900) return 'tablet';
  // Desktop: larger
  return 'desktop';
}

// Calculate responsive layout
function calculateLayout(pageWidth, pageHeight, numSigners) {
  const deviceType = getDeviceType(pageWidth, pageHeight);
  const config = LAYOUT_CONFIG[deviceType];
  
  // Determine how many rows needed
  const sigsPerRow = Math.min(numSigners, config.maxSignaturesPerRow);
  const numRows = Math.ceil(numSigners / sigsPerRow);
  
  // Calculate actual box width to fit page
  const availableWidth = pageWidth - (config.marginX * 2);
  const actualBoxWidth = Math.min(
    config.sigBoxWidth,
    Math.floor(availableWidth / sigsPerRow) - 10 // 10px gap
  );
  
  // Calculate starting X to center the row
  const totalRowWidth = (sigsPerRow * actualBoxWidth) + ((sigsPerRow - 1) * 10);
  const startX = (pageWidth - totalRowWidth) / 2;
  
  // Calculate Y positions (from bottom up, or top down depending on space)
  // Start from bottom but ensure we don't go below page
  const signatureBlockHeight = numRows * config.verticalSpacing;
  const startY = Math.max(
    config.yOffset,
    config.yOffset // Keep consistent bottom margin
  );
  
  return {
    deviceType,
    sigsPerRow,
    numRows,
    boxWidth: actualBoxWidth,
    boxHeight: config.sigHeight,
    textSize: config.textSize,
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
  
  console.log('✅ Saved verified file to:', outputPath);
  return `verified/${outputFileName}`;
}

async function processPDF(pdfDoc, signers, certNumber = null) {
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  
  let customFont, boldFont;
  const assetsPath = getAssetsPath();
  const purpleColor = rgb(76/255, 32/255, 114/255);
  
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
    
    // Draw certificate number at top
    if (certNumber) {
      page.drawText(`Cert: ${certNumber}`, { 
        x: 40, 
        y: height - 30, 
        size: 10, 
        font: boldFont,
        color: purpleColor
      });
    }

    // Calculate responsive layout for this page size
    const layout = calculateLayout(width, height, signers.length);
    console.log(`📐 Page ${width}x${height} detected as ${layout.deviceType}, using ${layout.sigsPerRow} per row`);

    // Draw signatures in grid layout
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
        layout.textSize,
        customFont,
        boldFont,
        purpleColor,
        assetsPath
      );
    }
  }
}

async function drawSignatureBox(page, signer, x, y, boxWidth, sigHeight, textSize, customFont, boldFont, color, assetsPath) {
  // 1. "Attested" Label (centered)
  const attestedText = "Attested";
  const attestedWidth = boldFont.widthOfTextAtSize(attestedText, textSize + 2);
  page.drawText(attestedText, {
    x: x + (boxWidth - attestedWidth) / 2,
    y: y + sigHeight + 25,
    size: textSize + 2,
    font: boldFont,
    color: color
  });

  // 2. Signature Image (scaled to fit box)
  try {
    const sigPath = path.join(assetsPath, 'signatures', 'documents', signer.signature_image);
    if (fs.existsSync(sigPath)) {
      const sigBytes = fs.readFileSync(sigPath);
      const sigImg = sigPath.toLowerCase().endsWith('.png') 
        ? await page.doc.embedPng(sigBytes)
        : await page.doc.embedJpg(sigBytes);
      
      // Calculate scaling to fit within boxWidth x sigHeight
      const scale = Math.min(
        (boxWidth - 20) / sigImg.width,  // 10px padding each side
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

  // 3. Date (centered)
  const dateText = formatSignatureDate(signer.signatureDate || new Date());
  const dateWidth = customFont.widthOfTextAtSize(dateText, textSize);
  page.drawText(dateText, {
    x: x + (boxWidth - dateWidth) / 2,
    y: y - 12,
    size: textSize,
    font: customFont,
    color: color
  });

  // 4. Name (truncate if too long)
  let nameText = signer.name || '';
  const maxNameWidth = boxWidth - 10;
  while (boldFont.widthOfTextAtSize(nameText, textSize) > maxNameWidth && nameText.length > 3) {
    nameText = nameText.slice(0, -4) + '...';
  }
  const nameWidth = boldFont.widthOfTextAtSize(nameText, textSize);
  page.drawText(nameText, {
    x: x + (boxWidth - nameWidth) / 2,
    y: y - 24,
    size: textSize,
    font: boldFont,
    color: color
  });

  // 5. Designation (truncate if too long)
  let desigText = signer.designation || '';
  while (customFont.widthOfTextAtSize(desigText, textSize - 1) > maxNameWidth && desigText.length > 3) {
    desigText = desigText.slice(0, -4) + '...';
  }
  const desigWidth = customFont.widthOfTextAtSize(desigText, textSize - 1);
  page.drawText(desigText, {
    x: x + (boxWidth - desigWidth) / 2,
    y: y - 36,
    size: textSize - 1,
    font: customFont,
    color: color
  });
}

async function processImage(pdfDoc, imagePath, signers, certNumber = null) {
  const imageBytes = fs.readFileSync(imagePath);
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const image = isPng 
    ? await pdfDoc.embedPng(imageBytes) 
    : await pdfDoc.embedJpg(imageBytes);

  // Create page with image dimensions + space for signatures
  const sigSpace = Math.min(400, signers.length * 100); // Estimate signature space
  const pageHeight = image.height + sigSpace;
  
  const page = pdfDoc.addPage([image.width, pageHeight]);
  
  // Draw image at top
  page.drawImage(image, { 
    x: 0, 
    y: sigSpace, 
    width: image.width, 
    height: image.height 
  });
  
  // Process signatures on this page
  await processPDF(pdfDoc, signers, certNumber);
}

module.exports = {
  processDocumentWithSignatures,
  processMultipleDocuments
};