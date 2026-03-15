const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ==========================================
// TEXT SIZE & SPACING CONFIGURATION
// ==========================================
const TEXT_SIZES = {
  date: 7,
  name: 8,
  designation: 7,
  attestedImgHeight: 14, // Slightly smaller to match real stamps
  lineHeight: 9          // Better spacing between lines
};

const LAYOUT_CONFIG = {
  mobile: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 180,
    sigWidth: 60,
    sigHeight: 25,
    yBottomOffset: 30,    // Distance from bottom of page
    verticalRowGap: 80,
    marginX: 20,
    gapBetweenBoxes: 30
  },
  tablet: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 200,
    sigWidth: 70,
    sigHeight: 30,
    yBottomOffset: 40,
    verticalRowGap: 90,
    marginX: 30,
    gapBetweenBoxes: 50
  },
  desktop: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 220,
    sigWidth: 80,
    sigHeight: 35,
    yBottomOffset: 50,
    verticalRowGap: 100,
    marginX: 40,
    gapBetweenBoxes: 60
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
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
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
  const availableWidth = pageWidth - (config.marginX * 2);

  const actualBoxWidth = Math.min(
    config.sigBoxWidth,
    Math.floor((availableWidth - ((sigsPerRow - 1) * config.gapBetweenBoxes)) / sigsPerRow)
  );

  const totalRowWidth = (sigsPerRow * actualBoxWidth) + ((sigsPerRow - 1) * config.gapBetweenBoxes);
  const startX = (pageWidth - totalRowWidth) / 2;

  return { config, sigsPerRow, boxWidth: actualBoxWidth, startX };
}

async function processMultipleDocuments(files, signers, certNumber = null) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const verifiedUrl = await processDocumentWithSignatures(files[i].path, signers, certNumber);
      results.push({ id: i + 1, originalName: files[i].originalname, verifiedUrl, status: 'success' });
    } catch (error) {
      results.push({ id: i + 1, originalName: files[i].originalname, status: 'error', message: error.message });
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
    await applySignaturesToPDF(pdfDoc, signers);
  } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    pdfDoc = await PDFDocument.create();
    await processImage(pdfDoc, filePath, signers);
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const outputDir = getOutputDir();
  const outputFileName = `verified_${Date.now()}_${originalFileName.replace(/\.[^/.]+$/, '')}.pdf`;
  const outputPath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputPath, await pdfDoc.save());
  return `verified/${outputFileName}`;
}

async function applySignaturesToPDF(pdfDoc, signers) {
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  const assetsPath = getAssetsPath();
  const purpleColor = rgb(91/255, 43/255, 131/255); // Official Purple-ish Blue tint

  let attestedImg = null;
  try {
    const attestedPath = path.join(assetsPath, 'signatures', 'documents', 'attested_text.png');
    if (fs.existsSync(attestedPath)) {
      attestedImg = await pdfDoc.embedPng(fs.readFileSync(attestedPath));
    }
  } catch (e) { console.warn('Attested image load failed'); }

  let customFont, boldFont;
  try {
    customFont = await pdfDoc.embedFont(fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush.ttf')));
    boldFont = await pdfDoc.embedFont(fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush-bold.ttf')));
  } catch (e) {
    customFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  for (const page of pages) {
    const { width, height } = page.getSize();
    const layout = calculateLayout(width, height, signers.length);

    for (let i = 0; i < signers.length; i++) {
      const row = Math.floor(i / layout.sigsPerRow);
      const col = i % layout.sigsPerRow;
      
      const x = layout.startX + (col * (layout.boxWidth + layout.config.gapBetweenBoxes));
      // Positioning from bottom up
      const baseY = layout.config.yBottomOffset + (row * layout.config.verticalRowGap);

      await drawSignatureBox(
        page, signers[i], x, baseY, layout.boxWidth, 
        layout.config.sigWidth, layout.config.sigHeight,
        customFont, boldFont, purpleColor, assetsPath, attestedImg
      );
    }
  }
}

async function drawSignatureBox(page, signer, x, baseY, boxWidth, sigWidth, sigHeight, customFont, boldFont, color, assetsPath, attestedImg) {
  let currentY = baseY;

  // 1. DESIGNATION & ORG (Draw first at bottom, work upwards)
  const orgLines = signer.organization ? wrapText(signer.organization, boxWidth, customFont, TEXT_SIZES.designation) : [];
  const desigLines = wrapText(signer.designation || "", boxWidth, customFont, TEXT_SIZES.designation);

  [...orgLines.reverse(), ...desigLines.reverse()].forEach(line => {
    const w = customFont.widthOfTextAtSize(line, TEXT_SIZES.designation);
    page.drawText(line, { x: x + (boxWidth - w) / 2, y: currentY, size: TEXT_SIZES.designation, font: customFont, color });
    currentY += TEXT_SIZES.lineHeight;
  });

  // 2. NAME
  const nameText = signer.name || "";
  const nameW = boldFont.widthOfTextAtSize(nameText, TEXT_SIZES.name);
  page.drawText(nameText, { x: x + (boxWidth - nameW) / 2, y: currentY, size: TEXT_SIZES.name, font: boldFont, color });
  currentY += TEXT_SIZES.lineHeight;

  // 3. DATE
  const dateText = formatSignatureDate(signer.signatureDate || new Date());
  const dateW = customFont.widthOfTextAtSize(dateText, TEXT_SIZES.date);
  page.drawText(dateText, { x: x + (boxWidth - dateW) / 2, y: currentY, size: TEXT_SIZES.date, font: customFont, color });
  currentY += 8; // Gap before signature image

  // 4. SIGNATURE IMAGE
  try {
    const sigPath = path.join(assetsPath, "signatures", "documents", signer.signature_image);
    if (fs.existsSync(sigPath)) {
      const sigBytes = fs.readFileSync(sigPath);
      const sigImg = sigPath.toLowerCase().endsWith(".png") ? await page.doc.embedPng(sigBytes) : await page.doc.embedJpg(sigBytes);
      const scale = sigWidth / sigImg.width;
      const h = sigImg.height * scale;
      page.drawImage(sigImg, { x: x + (boxWidth - sigWidth) / 2, y: currentY, width: sigWidth, height: h });
      currentY += h + 2; 
    }
  } catch (e) { console.warn("Sig image error", signer.name); }

  // 5. ATTESTED TEXT IMAGE (Topmost element)
  if (attestedImg) {
    const imgW = (TEXT_SIZES.attestedImgHeight * attestedImg.width) / attestedImg.height;
    page.drawImage(attestedImg, { x: x + (boxWidth - imgW) / 2, y: currentY, width: imgW, height: TEXT_SIZES.attestedImgHeight });
  }

  const uploadResult = await cloudinary.uploader.upload(outputPath, {
  folder: 'apostille/verified',
  resource_type: 'raw',
  format: 'pdf'
});

// Return Cloudinary URL
return uploadResult.secure_url;

}

async function processImage(pdfDoc, imagePath, signers) {
  const imageBytes = fs.readFileSync(imagePath);
  const image = imagePath.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
  const sigSpace = signers.length <= 2 ? 150 : 250;
  const pageHeight = image.height + sigSpace;
  const page = pdfDoc.addPage([image.width, pageHeight]);
  page.drawImage(image, { x: 0, y: sigSpace, width: image.width, height: image.height });
  await applySignaturesToPDF(pdfDoc, signers);
}


module.exports = { processDocumentWithSignatures, processMultipleDocuments };