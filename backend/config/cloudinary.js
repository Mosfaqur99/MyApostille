const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Create storage engine for different upload types
const createStorage = (folderName) => new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => ({
    folder: `apostille/${folderName}`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`,
    resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'image'
  })
});

module.exports = { cloudinary, createStorage };