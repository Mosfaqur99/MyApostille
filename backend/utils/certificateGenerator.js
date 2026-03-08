// backend/utils/certificateGenerator.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs').promises;
const path = require('path');

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

/* ---------- SAFE ASSETS PATH DETECTION (from code 1) ---------- */
function getAssetsPath() {
  const possiblePaths = [
    path.join(__dirname, '..', 'assets'),
    path.join(__dirname, '..', '..', 'assets'),
    path.join('/opt/render/project/src', 'backend', 'assets'),
    path.join(process.cwd(), 'backend', 'assets'),
    path.join(process.cwd(), 'assets')
  ];
  
  for (const testPath of possiblePaths) {
    if (require('fs').existsSync(testPath)) {
      console.log('✅ Found assets at:', testPath);
      return testPath;
    }
  }
  
  console.warn('⚠️ Assets not found, using default:', possiblePaths[0]);
  return possiblePaths[0];
}

async function generateEApostilleCertificate(certificateData) {
  console.log('🚀 STARTING CERTIFICATE GENERATION');
  console.log('Data received:', JSON.stringify(certificateData, null, 2));
  try {
    const doc = await PDFDocument.create();
    console.log('✅ PDF document created');
    doc.registerFontkit(fontkit);
    
     console.log('✅ Fontkit registered');
    
    const page = doc.addPage([595.28, 841.89]);
    console.log('✅ Page added');
    const { width, height } = page.getSize();
    
    const textColor = rgb(46/255, 46/255, 46/255);
    const linkColor = rgb(0, 0, 238/255);
    
    const centerX = width / 2;
    const margin = 25;
    const leftMargin = margin + 20;
    const labelX = leftMargin;

    const assetsPath = getAssetsPath();
    console.log('📁 Assets path:', assetsPath);
    const fontsPath = path.join(assetsPath, 'fonts');
    console.log('📁 Fonts path:', fontsPath);
    console.log('📁 Fonts exists:', require('fs').existsSync(fontsPath));

     try {
      const fs = require('fs');
      if (fs.existsSync(assetsPath)) {
        console.log('📂 Assets contents:', fs.readdirSync(assetsPath));
        if (fs.existsSync(fontsPath)) {
          console.log('📂 Fonts contents:', fs.readdirSync(fontsPath));
        }
      }
    } catch (e) {
      console.error('Cannot list assets:', e.message);
    }

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

    /* ---------- WATERMARK ---------- */

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

    /* ---------- BORDER ---------- */

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
      const gap = options.gap || 9;
      
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

    /* ---------- HEADER ---------- */

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

    const authName = safeText(certificateData.authorityName || 'MD. ASIF KHAN PRANTO').toUpperCase();
    drawRow('7', 'by ', authName, y, { valueBold: true, valueUnderline: true, labelBold: false });
    y -= 12;

    page.drawText('Assistant Secretary, Ministry of Foreign Affairs', { 
        x: labelX + timesBold.widthOfTextAtSize('7. by ', 10) + 5,
        y: y, 
        size: 12, 
        font: timesRegular, 
        color: textColor
    });

    y -= 30;

    /* ---------- CERTIFICATE NUMBER ---------- */

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

    /* ---------- SEAL & SIGNATURE ---------- */

    y -= 50;

    const sealSigY = y;

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

    const sealImg = await loadImage(doc, path.join(assetsPath, 'seal.jpg'));

    const authorityName = safeText(certificateData.authorityName || 'MD. ASIF KHAN PRANTO').toUpperCase();

    let signatureFileName;

    switch(authorityName) {
      case 'MD. ASIF KHAN PRANTO':
        signatureFileName = 'signature_asif.png';
        break;
      case 'TUSHAR':
        signatureFileName = 'signature_tushar.png';
        break;
      case 'ANIK':
        signatureFileName = 'signature_anik.png';
        break;
      default:
        signatureFileName = 'signature.png';
    }

    const sigImg = await loadImage(doc, path.join(assetsPath, signatureFileName));

    if (sealImg) {
      const sealSize = 110;
      page.drawImage(sealImg, { 
        x: labelX, 
        y: sealSigY - sealSize - 10, 
        width: sealSize, 
        height: sealSize 
      });
    }

    if (sigImg) {
      page.drawImage(sigImg, { 
        x: centerX + 90,
        y: sealSigY - 60, 
        width: 100, 
        height: 50 
      });
    }

    /* ---------- QR & DIGITAL SIGN ---------- */

    const qrBuffer = await generateQRCode(`https://mofa.servicedirectory.apostille.mygov.bd/verify/${certNo}`);
    const qrImage = await doc.embedPng(qrBuffer);

    page.drawImage(qrImage, { 
      x: width - 120,
      y: margin + 20,
      width: 85,
      height: 85
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'.');
    const timeStr = now.toISOString().slice(11,19);

    page.drawText(`Digitally signed by ${authName}`, { x: labelX+60, y: margin+140, size:10, font: timesBold });
    page.drawText(`Date: ${dateStr}`, { x: labelX+60, y: margin+130, size:10, font: timesBold });
    page.drawText(`${timeStr} +06:00`, { x: labelX+60, y: margin+120, size:10, font: timesBold });

    /* ---------- SAVE CERTIFICATE (from code 1) ---------- */

    const pdfBytes = await doc.save();

    const baseDir = process.env.UPLOAD_DIR || '/tmp/uploads';
const certDir = path.join(baseDir, 'certificates');

    if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

    const certFilename = `cert_${certNo}.pdf`;
    const certPath = path.join(certDir, certFilename);

    
    await fs.writeFile(certPath, pdfBytes);

    console.log('✅ Certificate saved:', certPath);

    return { 
      pdfBytes, 
      certificateNumber: certNo,
      filePath: `/uploads/certificates/${certFilename}`,
      localPath: certPath
    };

  } catch (err) {
    console.error('❌ PDF Logic Error:', err);
    throw err; 
  }
}

module.exports = {
  generateEApostilleCertificate,
  sanitizeForPDF: safeText,
  formatDate,
  generateQRCode
};