const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000; // Render uses 10000 by default

// CORS - UPDATE WITH YOUR ACTUAL GODADDY DOMAIN
const allowedOrigins = [
  'https://mygovapostille.com',        // ← CHANGE TO YOUR GODADDY DOMAIN
  'https://www.mygovapostille.com',    // ← www version
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS policy violation'), false);
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
// CRITICAL FIX: Proper directory setup for Render
// ==========================================

// Use /tmp for uploads on Render (writable directory)
const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL;

// Base upload directory - MUST be in /tmp or git repo
const uploadBaseDir = isRender 
  ? '/tmp/uploads'  // Render's writable temp directory
  : path.join(__dirname, 'uploads');

// Define all subdirectories
const dirs = [
  uploadBaseDir,
  path.join(uploadBaseDir, 'original'),
  path.join(uploadBaseDir, 'certificates'),
  path.join(uploadBaseDir, 'verified'),
  path.join(uploadBaseDir, 'temp')
];

// Create directories synchronously on startup
dirs.forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  } catch (err) {
    console.error(`❌ Failed to create directory ${dir}:`, err.message);
  }
});

// Make upload path available globally
process.env.UPLOAD_DIR = uploadBaseDir;

// Static file serving - MUST match multer destination
app.use("/uploads", express.static(uploadBaseDir));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "PDF Verification System API is running",
    timestamp: new Date().toISOString(),
    uploadDir: uploadBaseDir,
    directories: dirs.filter(d => fs.existsSync(d))
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(500).json({ 
    message: "Server error", 
    error: err.message,
    path: req.path 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log("\n" + "=".repeat(60));
  console.log("✅ PDF VERIFICATION SYSTEM STARTED");
  console.log("=".repeat(60));
  console.log(`🌐 Server: http://0.0.0.0:${PORT}`);
  console.log(`📁 Uploads: ${uploadBaseDir}`);
  console.log(`🗄️  Database: ${process.env.DB_HOST || 'not set'}`);
  console.log("=".repeat(60) + "\n");
});