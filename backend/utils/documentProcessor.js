// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ==========================================
// TEXT SIZE CONFIGURATION
// ==========================================
const TEXT_SIZES = {
  date: 7,        // Date text size
  name: 8,        // Signer name size (slightly larger for readability)
  designation: 7, // Designation text size
  attestedImgHeight: 18, // Height of attested image
  lineHeight: 8  // Vertical spacing between text lines
};

// Layout configuration - TIGHTER SPACING
const LAYOUT_CONFIG = {
  mobile: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 200,
    sigHeight: 28,
    sigWidth: 65,
    yOffset: 80,
    verticalSpacing: 110,
    marginX: 20,
    gapBetweenBoxes: 70
  },
  tablet: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 220,
    sigHeight: 32,
    sigWidth: 75,
    yOffset: 80,
    verticalSpacing: 120,
    marginX: 30,
    gapBetweenBoxes: 80
  },
  desktop: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 240,
    sigHeight: 36,
    sigWidth: 85,
    yOffset: 90,
    verticalSpacing: 95,
    marginX: 40,
    gapBetweenBoxes: 90
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

// Wrap text into multiple lines
function wrapText(text, maxWidth, font, size) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const width = font.widthOfTextAtSize(testLine, size);
    
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines;
}

function calculateLayout(pageWidth, pageHeight, numSigners) {

  const deviceType = getDeviceType(pageWidth, pageHeight);
  const config = LAYOUT_CONFIG[deviceType];

  const sigsPerRow = Math.min(numSigners, config.maxSignaturesPerRow);
  const numRows = Math.ceil(numSigners / sigsPerRow);

  const availableWidth = pageWidth - (config.marginX * 2);

  const actualBoxWidth = Math.min(
    config.sigBoxWidth,
    Math.floor(
      (availableWidth - ((sigsPerRow - 1) * config.gapBetweenBoxes)) /
      sigsPerRow
    )
  );

  const totalRowWidth =
    (sigsPerRow * actualBoxWidth) +
    ((sigsPerRow - 1) * config.gapBetweenBoxes);

  const startX = (pageWidth - totalRowWidth) / 2;

  return {
    deviceType,
    sigsPerRow,
    numRows,
    boxWidth: actualBoxWidth,
    sigWidth: config.sigWidth,
    sigHeight: config.sigHeight,
    startX,
    startY: 2,
    verticalSpacing: config.verticalSpacing,
    gapBetweenBoxes: config.gapBetweenBoxes
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
  
  // Load attested image
  let attestedImg = null;
  try {
    const attestedPath = path.join(assetsPath, 'signatures', 'documents', 'attested_text.png');
    if (fs.existsSync(attestedPath)) {
      const attestedBytes = fs.readFileSync(attestedPath);
      attestedImg = await pdfDoc.embedPng(attestedBytes);
      console.log('✅ Loaded attested_text.png');
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
      customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }
  } catch (e) {
    customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    const layout = calculateLayout(width, height, signers.length);
    
    console.log(`📐 Page ${width}x${height}, layout: ${layout.deviceType}, box: ${layout.boxWidth}`);

    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const row = Math.floor(i / layout.sigsPerRow);
      const col = i % layout.sigsPerRow;
      
      const x = layout.startX + (col * (layout.boxWidth + layout.gapBetweenBoxes));
      const baseY =
  80 + (row * layout.verticalSpacing);

     await drawSignatureBox(
  page,
  signer,
  x,
  baseY,
  layout.boxWidth,
  layout.sigWidth,
  layout.sigHeight,
  customFont,
  boldFont,
  purpleColor,
  assetsPath,
  attestedImg
);
    }
  }
}

async function drawSignatureBox(
  page,
  signer,
  x,
  baseY,
  boxWidth,
  sigWidth,
  sigHeight,
  customFont,
  boldFont,
  color,
  assetsPath,
  attestedImg
) {

  let y = baseY + 40;

  // ATTTESTED TEXT
  if (attestedImg) {

    const imgWidth =
      (TEXT_SIZES.attestedImgHeight * attestedImg.width) /
      attestedImg.height;

    page.drawImage(attestedImg, {
      x: x + (boxWidth - imgWidth) / 2,
      y: y,
      width: imgWidth,
      height: TEXT_SIZES.attestedImgHeight
    });

    y -= TEXT_SIZES.attestedImgHeight + 4;
  }

  // SIGNATURE IMAGE
  try {

    const sigPath = path.join(
      assetsPath,
      "signatures",
      "documents",
      signer.signature_image
    );

    if (fs.existsSync(sigPath)) {

      const sigBytes = fs.readFileSync(sigPath);

      const sigImg =
        sigPath.toLowerCase().endsWith(".png")
          ? await page.doc.embedPng(sigBytes)
          : await page.doc.embedJpg(sigBytes);

      const scale = sigWidth / sigImg.width;

      const width = sigWidth;
      const height = sigImg.height * scale;

      page.drawImage(sigImg, {
        x: x + (boxWidth - width) / 2,
        y: y - height + 5,
        width,
        height
      });

      y -= sigHeight;
    }

  } catch (e) {
    console.warn("Signature missing:", signer.name);
  }

  y -= 5;

  // DATE
  const dateText = formatSignatureDate(
    signer.signatureDate || new Date()
  );

  const dateWidth = customFont.widthOfTextAtSize(
    dateText,
    TEXT_SIZES.date
  );

  page.drawText(dateText, {
    x: x + (boxWidth - dateWidth) / 2,
    y,
    size: TEXT_SIZES.date,
    font: customFont,
    color
  });

  y -= TEXT_SIZES.lineHeight;

  // NAME
  const nameText = signer.name || "";

  const nameWidth = boldFont.widthOfTextAtSize(
    nameText,
    TEXT_SIZES.name
  );

  page.drawText(nameText, {
    x: x + (boxWidth - nameWidth) / 2,
    y,
    size: TEXT_SIZES.name,
    font: boldFont,
    color
  });

  y -= TEXT_SIZES.lineHeight;

  // DESIGNATION
  const desigLines = wrapText(
    signer.designation || "",
    boxWidth - 10,
    customFont,
    TEXT_SIZES.designation
  );

  for (const line of desigLines) {

    const width = customFont.widthOfTextAtSize(
      line,
      TEXT_SIZES.designation
    );

    page.drawText(line, {
      x: x + (boxWidth - width) / 2,
      y,
      size: TEXT_SIZES.designation,
      font: customFont,
      color
    });

    y -= TEXT_SIZES.lineHeight;
  }

  // ORGANIZATION
  if (signer.organization) {

    const orgLines = wrapText(
      signer.organization,
      boxWidth - 10,
      customFont,
      TEXT_SIZES.designation
    );

    for (const line of orgLines) {

      const width = customFont.widthOfTextAtSize(
        line,
        TEXT_SIZES.designation
      );

      page.drawText(line, {
        x: x + (boxWidth - width) / 2,
        y,
        size: TEXT_SIZES.designation,
        font: customFont,
        color
      });

      y -= TEXT_SIZES.lineHeight;
    }
  }
}

async function processImage(pdfDoc, imagePath, signers) {
  const imageBytes = fs.readFileSync(imagePath);
  const isPng = imagePath.toLowerCase().endsWith('.png');
  const image = isPng 
    ? await pdfDoc.embedPng(imageBytes) 
    : await pdfDoc.embedJpg(imageBytes);

  // Calculate needed height based on signers
  const sigSpace = signers.length <= 2 ? 300 : 500;
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