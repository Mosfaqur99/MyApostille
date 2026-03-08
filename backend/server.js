const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// CORS - CRITICAL FIX: Allow localhost for development
// ==========================================
const allowedOrigins = [
  'https://mygovapostille.com',        // Your GoDaddy domain
  'https://www.mygovapostille.com',    // www version
  'http://localhost:3000',             // React dev server
  'http://localhost:5173',             // Vite dev server
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('CORS request from:', origin);
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      console.warn('CORS blocked:', origin);
      return callback(new Error('CORS policy violation: ' + origin), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// DIRECTORY SETUP - CRITICAL FIX
// ==========================================

// Detect environment
const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL;

// Use absolute paths that work on Render
const uploadBaseDir = isRender 
  ? '/tmp/uploads'           // Render writable temp
  : path.join(__dirname, 'uploads');  // Local development

// Ensure all directories exist
const requiredDirs = [
  uploadBaseDir,
  path.join(uploadBaseDir, 'original'),
  path.join(uploadBaseDir, 'certificates'),
  path.join(uploadBaseDir, 'verified')
];

requiredDirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('✅ Created:', dir);
    }
  } catch (err) {
    console.error('❌ Failed to create', dir, err.message);
  }
});

// Make available globally
process.env.UPLOAD_DIR = uploadBaseDir;

// Static files - CRITICAL: Serve from the correct directory
app.use("/uploads", express.static(uploadBaseDir));

console.log('📁 Upload directory:', uploadBaseDir);
console.log('📁 Directory exists:', fs.existsSync(uploadBaseDir));

// ==========================================
// ROUTES
// ==========================================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));

// Health check with detailed info
app.get("/", (req, res) => {
  res.json({
    status: "running",
    uploadDir: uploadBaseDir,
    directories: requiredDirs.map(d => ({ path: d, exists: fs.existsSync(d) })),
    assetsPath: path.join(__dirname, 'assets'),
    assetsExists: fs.existsSync(path.join(__dirname, 'assets')),
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint - remove after fixing
app.get("/debug", (req, res) => {
  const assetsPath = path.join(__dirname, 'assets');
  res.json({
    cwd: process.cwd(),
    __dirname: __dirname,
    uploadDir: uploadBaseDir,
    uploadDirExists: fs.existsSync(uploadBaseDir),
    assetsPath: assetsPath,
    assetsExists: fs.existsSync(assetsPath),
    fontsPath: path.join(assetsPath, 'fonts'),
    fontsExists: fs.existsSync(path.join(assetsPath, 'fonts')),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      RENDER: process.env.RENDER,
      PORT: process.env.PORT
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ ERROR:', err.stack);
  res.status(500).json({ 
    message: "Server error", 
    error: err.message,
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('✅ Server running on port', PORT);
  console.log('📁 Uploads:', uploadBaseDir);
  console.log('='.repeat(60));
});