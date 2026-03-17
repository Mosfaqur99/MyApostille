const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// CORS CONFIGURATION
// ==========================================
const allowedOrigins = [
  'https://mygovapostille.com',
  'https://www.mygovapostille.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('CORS request from:', origin || 'no origin');
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn('CORS blocked:', origin);
    return callback(new Error('Not allowed by CORS: ' + origin), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'Accept']
}));

app.options('*', cors());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/api/signatures', express.static(path.join(__dirname, 'assets', 'signatures', 'documents')));
// ==========================================
// DIRECTORY SETUP - CRITICAL FIX
// ==========================================
const isRender = process.env.RENDER === 'true' || !!process.env.RENDER_EXTERNAL_URL;
const uploadBaseDir = isRender ? '/tmp/uploads' : path.join(__dirname, 'uploads');

// Create directories SYNCHRONOUSLY (safe for startup)
// const dirs = [
//   uploadBaseDir,
//   path.join(uploadBaseDir, 'original'),
//   path.join(uploadBaseDir, 'certificates'),
//   path.join(uploadBaseDir, 'verified')
// ];

// dirs.forEach(dir => {
//   try {
//     if (!fs.existsSync(dir)) {
//       fs.mkdirSync(dir, { recursive: true });
//       console.log('Created directory:', dir);
//     }
//   } catch (err) {
//     console.error('Failed to create directory:', dir, err.message);
//     // Don't crash - log and continue
//   }
// });

// Set environment variable for other modules
process.env.UPLOAD_DIR = uploadBaseDir;

// ==========================================
// STATIC FILES - FIXED VARIABLE NAME
// ==========================================
// ❌ WRONG: uploadDir (undefined)
// ✅ CORRECT: uploadBaseDir
app.use('/certificates', express.static(path.join(uploadBaseDir, 'certificates'), {
  setHeaders: (res) => {
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline');
  }
}));

app.use('/verified', express.static(path.join(uploadBaseDir, 'verified'), {
  setHeaders: (res, filePath) => {
    // Set appropriate content types
    if (filePath.endsWith('.pdf')) {
      res.set('Content-Type', 'application/pdf');
    } else if (filePath.match(/\.(jpg|jpeg|png|gif)$/i)) {
      res.set('Content-Type', `image/${path.extname(filePath).slice(1)}`);
    }
    res.set('Content-Disposition', 'inline');
  }
}));

console.log('Upload directory:', uploadBaseDir);

// ==========================================
// ROUTES
// ==========================================
try {
  app.use("/api/auth", require("./routes/authRoutes"));
  app.use("/api/files", require("./routes/fileRoutes"));
} catch (err) {
  console.error('Route loading error:', err);
  process.exit(1);
}

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    uploadDir: uploadBaseDir,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint
app.get("/debug", (req, res) => {
  const assetsPath = path.join(__dirname, 'assets');
  res.json({
    cwd: process.cwd(),
    __dirname: __dirname,
    uploadDir: uploadBaseDir,
    uploadDirExists: fs.existsSync(uploadBaseDir),
    assetsPath: assetsPath,
    assetsExists: fs.existsSync(assetsPath)
  });
});

// ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({ 
    message: "Server error", 
    error: err.message,
    path: req.path
  });
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('Server running on port', PORT);
  console.log('Uploads:', uploadBaseDir);
  console.log('='.repeat(60));
});