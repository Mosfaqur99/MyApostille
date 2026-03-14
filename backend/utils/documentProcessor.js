const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ==========================================
// REFINED TEXT SIZE CONFIGURATION
// ==========================================
const TEXT_SIZES = {
  date: 7,
  name: 8.5,        // Slightly larger for prominence
  designation: 7,
  attestedImgHeight: 16, 
  lineHeight: 9     // Tighter line spacing
};

const LAYOUT_CONFIG = {
  mobile: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 140,
    sigHeight: 35,
    sigWidth: 80,
    yOffset: 40,
    verticalSpacing: 100,
    marginX: 15,
  },
  desktop: {
    maxSignaturesPerRow: 2,
    sigBoxWidth: 180,
    sigHeight: 40,
    sigWidth: 100,
    yOffset: 40,
    verticalSpacing: 110,
    marginX: 30,
  }
};

// Helper to wrap text
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

function formatSignatureDate(dateString) {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

async function processDocumentWithSignatures(filePath, signers) {
  const ext = path.extname(filePath).toLowerCase();
  let pdfDoc;

  if (ext === '.pdf') {
    const pdfBytes = fs.readFileSync(filePath);
    pdfDoc = await PDFDocument.load(pdfBytes);
  } else {
    pdfDoc = await PDFDocument.create();
    await processImageAsBackground(pdfDoc, filePath, signers.length);
  }

  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  const assetsPath = path.join(__dirname, '..', 'assets');
  const purpleColor = rgb(76/255, 32/255, 114/255);

  // Load Fonts
  const fontBytes = fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush.ttf'));
  const boldBytes = fs.readFileSync(path.join(assetsPath, 'fonts', 'kalpurush-bold.ttf'));
  const customFont = await pdfDoc.embedFont(fontBytes);
  const boldFont = await pdfDoc.embedFont(boldBytes);

  // Load Attested Image
  const attestedPath = path.join(assetsPath, 'signatures', 'documents', 'attested_text.png');
  const attestedImg = fs.existsSync(attestedPath) ? await pdfDoc.embedPng(fs.readFileSync(attestedPath)) : null;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const deviceType = width < 600 ? 'mobile' : 'desktop';
    const config = LAYOUT_CONFIG[deviceType];

    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      
      // GRID LOGIC
      const row = Math.floor(i / config.maxSignaturesPerRow);
      const col = i % config.maxSignaturesPerRow;

      // Determine how many signers are in THIS specific row
      const remainingSigners = signers.length - (row * config.maxSignaturesPerRow);
      const itemsInThisRow = Math.min(config.maxSignaturesPerRow, remainingSigners);
      
      // Calculate row width to center it
      const gap = 20;
      const totalRowWidth = (itemsInThisRow * config.sigBoxWidth) + ((itemsInThisRow - 1) * gap);
      const rowStartX = (width - totalRowWidth) / 2;

      const x = rowStartX + (col * (config.sigBoxWidth + gap));
      // PDF-Lib Y starts from bottom; yOffset is distance from bottom
      const baseY = config.yOffset + (row * config.verticalSpacing);

      await drawSignatureBox(page, signer, x, baseY, config, customFont, boldFont, purpleColor, assetsPath, attestedImg);
    }
  }

  const outputDir = path.join(__dirname, '..', 'uploads', 'verified');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  const outputPath = path.join(outputDir, `verified_${Date.now()}.pdf`);
  fs.writeFileSync(outputPath, await pdfDoc.save());
  return outputPath;
}

async function drawSignatureBox(page, signer, x, baseY, config, customFont, boldFont, color, assetsPath, attestedImg) {
  const { sigBoxWidth, sigWidth, sigHeight } = config;
  
  // We work from top-down relative to the box's assigned baseY
  // Position 1: Attested (Top)
  let currentY = baseY + config.verticalSpacing - 20; 

  if (attestedImg) {
    const imgWidth = (TEXT_SIZES.attestedImgHeight * attestedImg.width) / attestedImg.height;
    page.drawImage(attestedImg, {
      x: x + (sigBoxWidth - imgWidth) / 2,
      y: currentY,
      width: imgWidth,
      height: TEXT_SIZES.attestedImgHeight
    });
  }

  // Position 2: Signature
  currentY -= (sigHeight + 5);
  try {
    const sigPath = path.join(assetsPath, 'signatures', 'documents', signer.signature_image);
    if (fs.existsSync(sigPath)) {
      const sigImg = await page.doc.embedPng(fs.readFileSync(sigPath));
      const scale = sigWidth / sigImg.width;
      const finalHeight = sigImg.height * scale;
      
      page.drawImage(sigImg, {
        x: x + (sigBoxWidth - sigWidth) / 2,
        y: currentY,
        width: sigWidth,
        height: Math.min(finalHeight, sigHeight)
      });
    }
  } catch (e) { console.warn("Sig error", e); }

  // Position 3: Date
  currentY -= 12;
  const dateText = formatSignatureDate(signer.signatureDate || new Date());
  page.drawText(dateText, {
    x: x + (sigBoxWidth - customFont.widthOfTextAtSize(dateText, TEXT_SIZES.date)) / 2,
    y: currentY,
    size: TEXT_SIZES.date,
    font: customFont,
    color
  });

  // Position 4: Name
  currentY -= 12;
  const nameText = signer.name || '';
  page.drawText(nameText, {
    x: x + (sigBoxWidth - boldFont.widthOfTextAtSize(nameText, TEXT_SIZES.name)) / 2,
    y: currentY,
    size: TEXT_SIZES.name,
    font: boldFont,
    color
  });

  // Position 5: Designation & Org
  currentY -= TEXT_SIZES.lineHeight;
  const details = `${signer.designation || ''}\n${signer.organization || ''}`;
  const lines = wrapText(details.replace('\n', ' '), sigBoxWidth - 10, customFont, TEXT_SIZES.designation);
  
  for (const line of lines) {
    page.drawText(line, {
      x: x + (sigBoxWidth - customFont.widthOfTextAtSize(line, TEXT_SIZES.designation)) / 2,
      y: currentY,
      size: TEXT_SIZES.designation,
      font: customFont,
      color
    });
    currentY -= TEXT_SIZES.lineHeight;
  }
}

async function processImageAsBackground(pdfDoc, imagePath, numSigners) {
  const imageBytes = fs.readFileSync(imagePath);
  const image = imagePath.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
  const extraSpace = numSigners > 2 ? 250 : 150;
  const page = pdfDoc.addPage([image.width, image.height + extraSpace]);
  page.drawImage(image, { x: 0, y: extraSpace, width: image.width, height: image.height });
}

module.exports = { processDocumentWithSignatures };