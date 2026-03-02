// backend/utils/documentProcessor.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
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

async function processDocumentWithSignatures(filePath, signers, certNumber) {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath, ext);
  const outputDir = path.join(__dirname, '../uploads/verified');
  const outputPath = path.join(outputDir, `${filename}_verified${ext}`);
  
  await fs.mkdir(outputDir, { recursive: true });
  
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
}

async function processPDF(filePath, signers, outputPath) {
  const pdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width, height } = lastPage.getSize();
  
  // Define paths FIRST
  const assetsPath = path.join(__dirname, '../assets');
  const fontsPath = path.join(assetsPath, 'fonts');
  const sigPath = path.join(assetsPath, 'signatures', 'documents');
  
  // Load Times Roman fonts
  let timesRegular, timesBold;
  try {
    const regularBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Regular.ttf'));
    const boldBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Bold.ttf'));
    
    timesRegular = await pdfDoc.embedFont(regularBytes);
    timesBold = await pdfDoc.embedFont(boldBytes);
    
    console.log('✅ Times Roman fonts loaded');
  } catch (fontErr) {
    console.error('❌ Font load failed:', fontErr.message);
    timesRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    timesBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
  
  // Load text images
  let verifiedTextImage, certifiedTextImage;
  try {
    const verifiedBytes = await fs.readFile(path.join(sigPath, 'verified_text.png'));
    verifiedTextImage = await pdfDoc.embedPng(verifiedBytes);
  } catch (err) {
    console.log('verified_text.png not found');
  }
  
  try {
    const certifiedBytes = await fs.readFile(path.join(sigPath, 'certified_text.png'));
    certifiedTextImage = await pdfDoc.embedPng(certifiedBytes);
  } catch (err) {
    console.log('certified_text.png not found');
  }
  
  const numSigners = signers.length;
  const sigBoxHeight = 130;
  const sigBoxWidth = 260; // INCREASED from 240 to fit longer org names
  
  const cols = numSigners === 1 ? 1 : 2;
  const rows = Math.ceil(numSigners / cols);
  
  // Gap between rows - REDUCED
  const rowGap = 25; // REDUCED from 40
  // Bottom margin - REDUCED
  const bottomMargin = 30; // REDUCED from 120
  
  const totalSigHeight = (rows * sigBoxHeight) + ((rows - 1) * rowGap);
  // Start closer to bottom of page
  const startY = bottomMargin + totalSigHeight - 20;
  
  // Blue color for ALL text
  const blueColor = rgb(0.25, 0.25, 0.6);
  const TEXT_SIZE = 8;
  
  // INCREASED horizontal gap between columns for better spacing with wider boxes
  const colGap = 30; // Slightly increased from 25
  
  // Draw signatures in grid - CENTERED
  for (let i = 0; i < numSigners; i++) {
    const signer = signers[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    const totalGridWidth = cols * sigBoxWidth + (cols - 1) * colGap;
    const startX = (width - totalGridWidth) / 2;
    const x = startX + (col * (sigBoxWidth + colGap));
    const y = startY - 20 - (row * (sigBoxHeight + rowGap));
    
    const centerX = x + (sigBoxWidth / 2);
    
    // Draw text image (Verified/Certified) - CENTERED
    const isFirst = i === 0;
    const textImage = isFirst ? verifiedTextImage : certifiedTextImage;
    
    if (textImage) {
      const textHeight = 18;
      const textScale = textHeight / textImage.height;
      const textWidth = textImage.width * textScale;
      
      lastPage.drawImage(textImage, {
        x: centerX - (textWidth / 2),
        y: y,
        width: textWidth,
        height: textHeight
      });
    } else {
      const text = isFirst ? 'Verified and found correct' : 'Certified';
      const textWidth = timesRegular.widthOfTextAtSize(text, TEXT_SIZE);
      lastPage.drawText(text, {
        x: centerX - (textWidth / 2),
        y: y,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
    }
    
    let currentY = y - 22;
    
    // Draw signature image - CENTERED
    try {
      const sigBytes = await fs.readFile(path.join(sigPath, signer.signature_image));
      const sigImage = await pdfDoc.embedPng(sigBytes).catch(() => pdfDoc.embedJpg(sigBytes));
      
      const sigHeight = 35;
      const sigScale = sigHeight / sigImage.height;
      const sigWidth = sigImage.width * sigScale;
      
      lastPage.drawImage(sigImage, {
        x: centerX - (sigWidth / 2),
        y: currentY - sigHeight,
        width: sigWidth,
        height: sigHeight
      });
      
      // Gap between signature and date
      currentY -= (sigHeight + 10); // Slightly reduced from 12
    } catch (err) {
      const fallbackText = '[SIGNATURE]';
      const textWidth = timesRegular.widthOfTextAtSize(fallbackText, TEXT_SIZE);
      lastPage.drawText(fallbackText, {
        x: centerX - (textWidth / 2),
        y: currentY - 12,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 24;
    }
    
    // Draw date - CENTERED
    const dateText = signer.signatureDate;
    const dateWidth = timesRegular.widthOfTextAtSize(dateText, TEXT_SIZE);
    lastPage.drawText(dateText, {
      x: centerX - (dateWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesRegular,
      color: blueColor
    });
    currentY -= 12;
    
    // Draw name - CENTERED, BOLD
    const nameWidth = timesBold.widthOfTextAtSize(signer.name, TEXT_SIZE);
    lastPage.drawText(signer.name, {
      x: centerX - (nameWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesBold,
      color: blueColor
    });
    currentY -= 11;
    
    // Draw designation - CENTERED
    const desigWidth = timesRegular.widthOfTextAtSize(signer.designation, TEXT_SIZE);
    lastPage.drawText(signer.designation, {
      x: centerX - (desigWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesRegular,
      color: blueColor
    });
    currentY -= 11;
    
    // Draw organization - FULL TEXT, NO TRUNCATION, CENTERED
    const orgText = signer.organization;
    // Remove truncation - show full organization name
    // Calculate if it fits, if not reduce font size slightly
    let orgFont = timesRegular;
    let orgSize = TEXT_SIZE;
    let orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
    
    // If too wide, scale down slightly to fit
    const maxOrgWidth = sigBoxWidth - 10; // 5px padding on each side
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
  await fs.writeFile(outputPath, modifiedPdfBytes);
  
  return `/uploads/verified/${path.basename(outputPath)}`;
}

async function processImage(filePath, signers, outputPath) {
  const pdfDoc = await PDFDocument.create();
  
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  
  // Load and embed original image
  const imageBytes = await fs.readFile(filePath);
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
  
  // Calculate signature section - TIGHTER SPACING
  const numSigners = signers.length;
  const sigBoxHeight = 130;
  const sigBoxWidth = 260; // INCREASED from 240
  const rows = Math.ceil(numSigners / 2);
  const rowGap = 25; // REDUCED from 40
  const sigSectionHeight = (rows * sigBoxHeight) + ((rows - 1) * rowGap) + 20; // REDUCED padding
  
  // Minimize whitespace - only add necessary space
  const totalHeight = imgHeight + sigSectionHeight + 20; // REDUCED from 40
  const finalPageHeight = Math.max(pageHeight, totalHeight);
  
  const page = pdfDoc.addPage([pageWidth, finalPageHeight]);
  
  // Draw image at top
  page.drawImage(embeddedImage, {
    x: margin,
    y: finalPageHeight - imgHeight - 10,
    width: imgWidth,
    height: imgHeight
  });
  
  // Define paths
  const assetsPath = path.join(__dirname, '../assets');
  const fontsPath = path.join(assetsPath, 'fonts');
  const sigPath = path.join(assetsPath, 'signatures', 'documents');
  
  // Load Times Roman fonts
  let timesRegular, timesBold;
  try {
    const regularBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Regular.ttf'));
    const boldBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Bold.ttf'));
    
    timesRegular = await pdfDoc.embedFont(regularBytes);
    timesBold = await pdfDoc.embedFont(boldBytes);
  } catch (fontErr) {
    console.error('Font load failed:', fontErr.message);
    timesRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    timesBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }
  
  // Load text images
  let verifiedTextImage, certifiedTextImage;
  try {
    const verifiedBytes = await fs.readFile(path.join(sigPath, 'verified_text.png'));
    verifiedTextImage = await pdfDoc.embedPng(verifiedBytes);
  } catch (err) {
    console.log('verified_text.png not found');
  }
  
  try {
    const certifiedBytes = await fs.readFile(path.join(sigPath, 'certified_text.png'));
    certifiedTextImage = await pdfDoc.embedPng(certifiedBytes);
  } catch (err) {
    console.log('certified_text.png not found');
  }
  
  // Blue color for ALL text
  const blueColor = rgb(0.25, 0.25, 0.6);
  const TEXT_SIZE = 8;
  const colGap = 30; // INCREASED from 25
  
  // Draw signatures - CENTERED, closer to image
  const sigStartY = finalPageHeight - imgHeight - 15; // REDUCED from 25
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
    
    // Draw text image - CENTERED
    const isFirst = i === 0;
    const textImage = isFirst ? verifiedTextImage : certifiedTextImage;
    
    if (textImage) {
      const textHeight = 18;
      const textScale = textHeight / textImage.height;
      const textWidth = textImage.width * textScale;
      
      page.drawImage(textImage, {
        x: centerX - (textWidth / 2),
        y: y,
        width: textWidth,
        height: textHeight
      });
    } else {
      const text = isFirst ? 'Verified and found correct' : 'Certified';
      const textWidth = timesRegular.widthOfTextAtSize(text, TEXT_SIZE);
      page.drawText(text, {
        x: centerX - (textWidth / 2),
        y: y,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
    }
    
    let currentY = y - 22;
    
    // Draw signature - CENTERED
    try {
      const sigBytes = await fs.readFile(path.join(sigPath, signer.signature_image));
      const sigImage = await pdfDoc.embedPng(sigBytes).catch(() => pdfDoc.embedJpg(sigBytes));
      
      const sigHeight = 35;
      const sigScale = sigHeight / sigImage.height;
      const sigWidth = sigImage.width * sigScale;
      
      page.drawImage(sigImage, {
        x: centerX - (sigWidth / 2),
        y: currentY - sigHeight,
        width: sigWidth,
        height: sigHeight
      });
      
      // Gap between signature and date
      currentY -= (sigHeight + 10); // REDUCED from 12
    } catch (err) {
      const fallbackText = '[SIGNATURE]';
      const textWidth = timesRegular.widthOfTextAtSize(fallbackText, TEXT_SIZE);
      page.drawText(fallbackText, {
        x: centerX - (textWidth / 2),
        y: currentY - 12,
        size: TEXT_SIZE,
        font: timesRegular,
        color: blueColor
      });
      currentY -= 24;
    }
    
    // Draw date - CENTERED
    const dateWidth = timesRegular.widthOfTextAtSize(signer.signatureDate, TEXT_SIZE);
    page.drawText(signer.signatureDate, {
      x: centerX - (dateWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesRegular,
      color: blueColor
    });
    currentY -= 12;
    
    // Draw name - CENTERED, BOLD
    const nameWidth = timesBold.widthOfTextAtSize(signer.name, TEXT_SIZE);
    page.drawText(signer.name, {
      x: centerX - (nameWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesBold,
      color: blueColor
    });
    currentY -= 11;
    
    // Draw designation - CENTERED
    const desigWidth = timesRegular.widthOfTextAtSize(signer.designation, TEXT_SIZE);
    page.drawText(signer.designation, {
      x: centerX - (desigWidth / 2),
      y: currentY,
      size: TEXT_SIZE,
      font: timesRegular,
      color: blueColor
    });
    currentY -= 11;
    
    // Draw organization - FULL TEXT, NO TRUNCATION, CENTERED
    const orgText = signer.organization;
    // Remove truncation - show full organization name
    // Scale font if needed to fit within box width
    let orgFont = timesRegular;
    let orgSize = TEXT_SIZE;
    let orgWidth = orgFont.widthOfTextAtSize(orgText, orgSize);
    
    // If too wide, scale down slightly to fit
    const maxOrgWidth = sigBoxWidth - 10; // 5px padding on each side
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
  const finalOutputPath = outputPath.replace(/\.(jpg|jpeg|png)$/i, '.pdf');
  await fs.writeFile(finalOutputPath, pdfBytes);
  
  return `/uploads/verified/${path.basename(finalOutputPath)}`;
}

module.exports = { processDocumentWithSignatures };