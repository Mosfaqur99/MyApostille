const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const pdfLib = require("pdf-lib");
const authRoutes = require("./routes/authRoutes");
const fileRoutes = require("./routes/fileRoutes");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware

app.use(cors({
  origin: [
    'https://mygovapostille.com',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
  res.sendStatus(200);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

// Create uploads directory
// Windows-compatible path handling
const uploadDir = path
  .join(__dirname, process.env.UPLOAD_DIR || "uploads")
  .replace(/\\/g, "/");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Database connection
const pool = require("./config/db");

app.use("/uploads", express.static(uploadDir));

// Routes
// Routes


// Health check
app.get("/", (req, res) => {
  res.json({
    message: "PDF Verification System API is running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res
    .status(500)
    .json({ message: "Something went wrong!", error: err.message });
});

// In backend/server.js, add before app.listen()
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Start server - ONLY ONE app.listen() call!
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("✅ PDF VERIFICATION SYSTEM STARTED");
  console.log("=".repeat(60));
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${uploadDir}`);
  console.log(`📡 CORS: http://localhost:3000`);
  console.log(
    `🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  );
  console.log("=".repeat(60) + "\n");
});
