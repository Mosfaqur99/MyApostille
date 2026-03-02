// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// backend/middleware/auth.js
const verifyToken = (req, res, next) => {
  // Check multiple possible header names
  let token = req.headers['x-auth-token'] || 
              req.headers['authorization'] || 
              req.headers['x-access-token'];

  // Remove 'Bearer ' prefix if present
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const authorizeRole = (allowedRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== allowedRole) {
        return res.status(403).json({ message: 'Access denied: Insufficient permissions' });
      }
      next();
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ message: 'Server error' });
    }
  };
};

module.exports = { verifyToken, authorizeRole };