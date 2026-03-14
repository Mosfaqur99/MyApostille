const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

// Email transporter - SendGrid configuration
const getTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    auth: {
      user: 'apikey',  // Literally the word "apikey"
      pass: process.env.SENDGRID_API_KEY  // Your actual SendGrid API key
    }
  });
};

// Generate secure random token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ========== EXISTING ROUTES (UNCHANGED) ==========

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name, email, hashedPassword, 'user']
    );
    
    const token = jwt.sign(
      { id: newUser.rows[0].id, email: newUser.rows[0].email, role: newUser.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'Registration successful',
      user: newUser.rows[0],
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await pool.query(
      'SELECT * FROM users WHERE email = $1', 
      [email]
    );
    
    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: user.rows[0].id, 
        email: user.rows[0].email, 
        role: user.rows[0].role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ 
      token, 
      user: {
        id: user.rows[0].id,
        name: user.rows[0].name,
        email: user.rows[0].email,
        role: user.rows[0].role
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========== FORGOT PASSWORD ROUTES ==========

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [normalizedEmail]
    );

    const successMessage = 'If an account exists with this email, a password reset link has been sent.';

    if (userResult.rows.length === 0) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
      return res.json({ message: successMessage });
    }

    const user = userResult.rows[0];

    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, expiresAt, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Send email via SendGrid
    try {
      const transporter = getTransporter();
      
      await transporter.sendMail({
        from: `"e-APOSTILLE Bangladesh" <${process.env.FROM_EMAIL || 'noreply@yourdomain.com'}>`,
        to: user.email,
        subject: 'Password Reset - e-APOSTILLE System',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px 0;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    
                    <tr>
                      <td style="background: linear-gradient(135deg, #166534 0%, #15803d 100%); padding: 30px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">e-APOSTILLE Bangladesh</h1>
                        <p style="color: #dcfce7; margin: 8px 0 0 0; font-size: 14px;">Ministry of Foreign Affairs</p>
                      </td>
                    </tr>
                    
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Hello ${user.name},</h2>
                        
                        <p style="color: #4b5563; line-height: 1.6; margin: 0 0 25px 0; font-size: 15px;">
                          We received a request to reset your password for your e-APOSTILLE account. 
                          Click the button below to create a new password:
                        </p>
                        
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center">
                              <a href="${resetUrl}" 
                                 style="display: inline-block; background: linear-gradient(135deg, #166534 0%, #15803d 100%); 
                                        color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; 
                                        font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                Reset My Password
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0 0 15px 0;">
                          <strong>Important:</strong> This link expires in <strong style="color: #dc2626;">1 hour</strong> 
                          and can only be used once.
                        </p>
                        
                        <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0;">
                          If you didn't request this reset, please ignore this email or contact support if you're concerned.
                        </p>
                      </td>
                    </tr>
                    
                    <tr>
                      <td style="padding: 0 30px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #e5e7eb;">
                          <tr><td style="height: 20px;"></td></tr>
                        </table>
                      </td>
                    </tr>
                    
                    <tr>
                      <td style="padding: 0 30px 30px 30px;">
                        <p style="color: #9ca3af; font-size: 12px; margin: 0 0 10px 0;">
                          If the button doesn't work, copy and paste this link into your browser:
                        </p>
                        <p style="margin: 0; word-break: break-all;">
                          <a href="${resetUrl}" style="color: #166534; font-size: 12px; text-decoration: none;">
                            ${resetUrl}
                          </a>
                        </p>
                      </td>
                    </tr>
                    
                    <tr>
                      <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0;">
                          &copy; ${new Date().getFullYear()} Ministry of Foreign Affairs, Bangladesh<br>
                          <span style="color: #9ca3af;">This is an automated message, please do not reply.</span>
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      });

      console.log(`Password reset email sent to: ${user.email}`);

    } catch (emailErr) {
      console.error('Failed to send email:', emailErr);
    }

    res.json({ message: successMessage });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// @route   GET /api/auth/verify-reset-token
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    res.json({ valid: true, message: 'Token is valid' });

  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        message: 'Token and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'Password must be at least 6 characters' 
      });
    }

    const userResult = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token. Please request a new one.' 
      });
    }

    const userId = userResult.rows[0].id;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      `UPDATE users 
       SET password = $1, 
           reset_token = NULL, 
           reset_token_expires = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, userId]
    );

    console.log(`Password reset successful for user: ${userId}`);
    res.json({ message: 'Password reset successful. You can now log in.' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;