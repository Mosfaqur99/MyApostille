const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs').promises;
const path = require('path');

const { cloudinary } = require('../config/cloudinary');
const streamifier = require('streamifier');

async function uploadCertificateToCloudinary(pdfBuffer, certNumber) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'apostille/certificates',
        public_id: `certificate-${certNumber}`,
        resource_type: 'auto',  // For PDFs
        format: 'pdf'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    streamifier.createReadStream(pdfBuffer).pipe(uploadStream);
  });
}

function safeText(text) {
  if (text === undefined || text === null) return 'N/A';
  return text.toString().trim() || 'N/A';
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${monthNames[date.getMonth()]}-${date.getFullYear()}`;
  } catch (e) { return 'N/A'; }
}

async function generateQRCode(text) {
  try {
    return await QRCode.toBuffer(text, { width: 100, margin: 1, errorCorrectionLevel: 'M' });
  } catch (err) { return null; }
}

async function loadImage(doc, imagePath) {
  try {
    const imageBytes = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    return ext === '.png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
  } catch (err) { 
    console.error(`Failed to load image: ${imagePath}`, err);
    return null; 
  }
}

// Authority configuration with names and designations
const AUTHORITY_CONFIG = {
  'MD. ASIF KHAN PRANTO': {
    name: 'MD. ASIF KHAN PRANTO',
    designation: 'Assistant Secretary, Ministry of Foreign Affairs',
    signatureFile: 'signature_asif.png'
  },
  'AKLIMA KHANOM': {
    name: 'AKLIMA KHANOM',
    designation: 'Senior Assistant Secretary, Ministry of Foreign Affairs',
    signatureFile: 'signature_aklima.png'
  }
};

async function generateEApostilleCertificate(certificateData) {
  try {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    
    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    
    const textColor = rgb(46/255, 46/255, 46/255);
    const linkColor = rgb(0, 0, 238/255);
    
    const centerX = width / 2;
    const margin = 25;
    const leftMargin = margin + 20;
    const labelX = leftMargin;
    const assetsPath = path.join(__dirname, '../assets');
    const fontsPath = path.join(assetsPath, 'fonts');

    let timesRegular, timesBold, timesItalic;

    try {
      const regularBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Regular.ttf'));
      const boldBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Bold.ttf'));
      const italicBytes = await fs.readFile(path.join(fontsPath, 'TimesRoman-Italic.otf'));
      
      timesRegular = await doc.embedFont(regularBytes);
      timesBold = await doc.embedFont(boldBytes);
      timesItalic = await doc.embedFont(italicBytes);
      
      console.log('✅ Times Roman fonts loaded');
    } catch (fontErr) {
      console.error('❌ Font load failed:', fontErr.message);
      timesRegular = await doc.embedFont(StandardFonts.Helvetica);
      timesBold = await doc.embedFont(StandardFonts.HelveticaBold);
      timesItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
    }

    // 1. WATERMARK
    const watermarkImg = await loadImage(doc, path.join(assetsPath, 'watermark.jpg'));
    if (watermarkImg) {
      const maxWidth = width * 0.35;
      const maxHeight = height * 0.35;
      const scaleX = maxWidth / watermarkImg.width;
      const scaleY = maxHeight / watermarkImg.height;
      const scale = Math.min(scaleX, scaleY);
      
      const dims = watermarkImg.scale(scale);
      page.drawImage(watermarkImg, {
        x: centerX - dims.width / 2,
        y: height / 2 - dims.height / 2 - 20,
        width: dims.width,
        height: dims.height,
        opacity: 0.25,
      });
    }

    // 2. BORDER
    page.drawRectangle({
      x: margin, 
      y: margin,
      width: width - (margin * 2), 
      height: height - (margin * 2),
      borderWidth: 0.9, 
      borderColor: rgb(0, 0, 0),
    });

    let y = height - margin - 50;

    const drawCentered = (text, font, size, yPos, color = textColor) => {
      const tw = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: centerX - (tw / 2), y: yPos, size, font, color });
    };

    const drawRow = (num, labelText, valueText, yPos, options = {}) => {
      const labelSize = options.labelSize || 12;
      const valueSize = options.valueSize || 12;
      const gap = options.gap || 2;
      
      let currentX = labelX;
      
      if (num) {
        const numText = `${num}. `;
        page.drawText(numText, { 
          x: currentX, 
          y: yPos, 
          size: labelSize, 
          font: timesBold,
          color: textColor
        });
        currentX += timesBold.widthOfTextAtSize(numText, labelSize);
      }
      
      const labelFont = options.labelBold !== false ? timesBold : timesRegular;
      page.drawText(labelText, { 
        x: currentX, 
        y: yPos, 
        size: labelSize, 
        font: labelFont,
        color: textColor
      });
      currentX += labelFont.widthOfTextAtSize(labelText, labelSize);
      
      const valueX = currentX + gap;
      
      const valueFont = options.valueBold ? timesBold : timesRegular;
      const safeValue = safeText(valueText);
      if (safeValue && safeValue !== 'N/A') {
        page.drawText(safeValue, { 
          x: valueX, 
          y: yPos, 
          size: valueSize, 
          font: valueFont,
          color: textColor
        });
        
        // Draw underline if specified
        if (options.valueUnderline) {
          const valueWidth = valueFont.widthOfTextAtSize(safeValue, valueSize);
          page.drawLine({
            start: { x: valueX, y: yPos - 2 },
            end: { x: valueX + valueWidth, y: yPos - 2 },
            thickness: 0.8,
            color: textColor,
          });
        }
      }
      
      return valueX;
    };

    const drawSectionHeader = (text, yPos) => {
      const size = 21;
      const tw = timesBold.widthOfTextAtSize(text, size);
      page.drawText(text, { 
        x: centerX - (tw / 2), 
        y: yPos, 
        size, 
        font: timesBold,
        color: textColor
      });
    };

    // 3. HEADER SECTION
    drawCentered('e-APOSTILLE', timesBold, 21, y, textColor); 
    y -= 18;
    drawCentered('(Convention de La Haye du 5 octobre 1961)', timesBold, 12, y, textColor); 
    y -= 24;
    drawCentered('(Also valid for the countries that are not in reciprocal arrangement with Bangladesh under the', timesBold, 12, y, textColor); 
    y -= 14;
    drawCentered('Apostille Convention of 1961, subject to proper legalisation)', timesBold, 12, y, textColor); 
    y -= 90;

    drawSectionHeader('Issuing Authority', y); 
    y -= 40;

    const lineHeight = 16;
    
    drawRow('1', 'Country: ', 'BANGLADESH', y, { valueBold: true });
    y -= lineHeight;

    page.drawText('The public document', { 
      x: labelX, 
      y: y, 
      size: 12, 
      font: timesRegular,
      color: textColor
    }); 
    y -= lineHeight;

    drawRow('2', 'has been signed by: ', certificateData.documentIssuer || 'Test2', y, { valueBold: true });
    y -= lineHeight;

    const capacity = certificateData.actingCapacity || certificateData.documentTitle || 'Metropolitan Magistrate';
    drawRow('3', 'acting in the capacity of: ', capacity, y);
    y -= lineHeight;

    drawRow('4', 'bears the seal/stamp of: ', certificateData.sealLocation || 'Dhaka', y);
    y -= 50;

    drawSectionHeader('Certified', y); 
    y -= 25;

    drawRow('5', 'at ', `${certificateData.certificateLocation || 'Dhaka'}, Bangladesh`, y, { valueBold: true, valueUnderline: true, labelBold: false });
    y -= lineHeight;

    drawRow('6', 'the ', formatDate(certificateData.certificateDate), y, { valueBold: true, valueUnderline: true, labelBold: false });
    y -= lineHeight;

    // Get authority config based on selected name
    const authorityKey = safeText(certificateData.authorityName || 'MD. ASIF KHAN PRANTO').toUpperCase();
    const authorityConfig = AUTHORITY_CONFIG[authorityKey] || AUTHORITY_CONFIG['MD. ASIF KHAN PRANTO'];
    const authName = authorityConfig.name;
    const authDesignation = authorityConfig.designation;

    // Field 7: Name (bold and underlined)
    drawRow('7', 'by ', authName, y, { valueBold: true, valueUnderline: true, labelBold: false });
    
    // Calculate position for designation (below the name, bold and underlined)
    const nameWidth = timesBold.widthOfTextAtSize(authName, 12);
    const labelWidth = timesBold.widthOfTextAtSize('7. by ', 12) + 5;
    const designationX = labelX + labelWidth;
    const designationY = y - 14; // Below the name
    
    // Draw designation - BOLD and UNDERLINED
    page.drawText(authDesignation, {
      x: designationX,
      y: designationY,
      size: 12,
      font: timesBold, // BOLD
      color: textColor
    });
    
    // Draw underline for designation
    const desigWidth = timesBold.widthOfTextAtSize(authDesignation, 12);
    page.drawLine({
      start: { x: designationX, y: designationY - 2 },
      end: { x: designationX + desigWidth, y: designationY - 2 },
      thickness: 0.8,
      color: textColor,
    });
    
    y -= 30;

    // Generate random 12-digit certificate number
    const generateCertNumber = () => {
      let num = '';
      for (let i = 0; i < 12; i++) {
        num += Math.floor(Math.random() * 10);
      }
      return num;
    };

    const certNo = certificateData.certificateNumber || generateCertNumber();
    const displayNo = certNo.startsWith('N°') ? certNo : `N° ${certNo}`;

    page.drawText('8.', { 
      x: labelX, 
      y: y, 
      size: 12, 
      font: timesBold,
      color: textColor
    });
    const num8Width = timesBold.widthOfTextAtSize('8.', 12);
    page.drawText(displayNo, { 
        x: labelX + num8Width + 8, 
        y: y, 
        size: 12, 
        font: timesRegular, 
        color: textColor
    });
    y -= 50;

    // 7. SEAL & SIGNATURE SECTION
    const sealSigY = y;

    // Labels at the same Y position
    page.drawText('9. Seal/stamp:', { 
      x: labelX, 
      y: sealSigY, 
      size: 12, 
      font: timesBold,
      color: textColor
    });
    page.drawText('10. Signature:', { 
      x: centerX + 90,
      y: sealSigY, 
      size: 12, 
      font: timesBold,
      color: textColor
    });

    // ⭐ LOAD SEAL (common for all)
    const sealImg = await loadImage(doc, path.join(assetsPath, 'seal.jpg'));

    // ⭐ LOAD SIGNATURE BASED ON AUTHORITY CONFIG
    const sigImg = await loadImage(doc, path.join(assetsPath, authorityConfig.signatureFile));

    // Seal on the left
    if (sealImg) {
      const sealSize = 110;
      page.drawImage(sealImg, { 
        x: labelX, 
        y: sealSigY - sealSize - 10, 
        width: sealSize, 
        height: sealSize 
      });
    }

    // Signature on the right
    if (sigImg) {
      const sigWidth = 100;
      const sigHeight = 50;
      page.drawImage(sigImg, { 
        x: centerX + 90,
        y: sealSigY - sigHeight - 10, 
        width: sigWidth, 
        height: sigHeight 
      });
    } else {
      // Fallback if signature image not found - draw text
      console.warn(`Signature image not found: ${authorityConfig.signatureFile}`);
      page.drawText('[SIGNATURE]', { 
        x: centerX + 90,
        y: sealSigY - 30, 
        size: 10, 
        font: timesRegular,
        color: textColor
      });
    }

    // 8. VERIFICATION BLOCK - Position at bottom
    const qrSize = 85;
    const qrX = width - margin - qrSize - 25;
    const bottomSectionY = margin + 80;

    // QR Code at bottom right
    const qrBuffer = await generateQRCode(`https://mygovapostille.com/verify/${certNo}`);
    if (qrBuffer) {
      const qrImage = await doc.embedPng(qrBuffer);
      page.drawImage(qrImage, { 
        x: qrX+10, 
        y: bottomSectionY-60, 
        width: qrSize, 
        height: qrSize 
      });
    }

    // Digital signature info at bottom left
    const infoX = labelX+60;
    const infoY = bottomSectionY + 60;
    const lineSpacing = 9;

    // Format date as shown in image: YYYY.MM.DD
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '.');
    const timeStr = now.toISOString().slice(11, 19);

    page.drawText(`Digitally signed by ${authName}`, { 
      x: infoX, 
      y: infoY, 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText(`Date: ${dateStr}`, { 
      x: infoX, 
      y: infoY - lineSpacing, 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText(`${timeStr} +06:00`, { 
      x: infoX, 
      y: infoY - (lineSpacing * 2), 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText('Reason: Document', { 
      x: infoX, 
      y: infoY - (lineSpacing * 3), 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText('Signing', { 
      x: infoX, 
      y: infoY - (lineSpacing * 4), 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText('Location: Ministry of', { 
      x: infoX, 
      y: infoY - (lineSpacing * 5), 
      size: 10, 
      font: timesBold,
      color: textColor
    });
    page.drawText('foreign Affairs, Dhaka, BD', { 
      x: infoX, 
      y: infoY - (lineSpacing * 6), 
      size: 10, 
      font: timesBold,
      color: textColor
    });

    // Footer lines at very bottom
    const footerY = margin + 20;
    const bullet = '*';

    page.drawText(`${bullet} To see the Apostille documents, please scan the QR code`, {
      x: infoX-60, 
      y: footerY + 12, 
      size: 7.5, 
      font: timesRegular, 
      color: textColor
    });

    // Blue hyperlink text
    page.drawText(`${bullet} For verification of the e-Apostille, please visit: https://mofa-servicedirectory.stage.mygov.bd/`, {
      x: infoX-60, 
      y: footerY, 
      size: 7.5, 
      font: timesRegular, 
      color: linkColor
    });

    const pdfBytes = await doc.save();
    return { pdfBytes, certificateNumber: certNo };

  } catch (err) {
    console.error('❌ PDF Logic Error:', err);
    throw err; 
  }
}

module.exports = {
    generateEApostilleCertificate,
    sanitizeForPDF: safeText,
    formatDate,
    generateQRCode,
    AUTHORITY_CONFIG // Export for use in other modules if needed
};