const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

// Public routes (no authentication required)

// User registration
router.post('/register', 
  validation.validateRegister,
  validation.handleValidationErrors,
  authController.register
);

// User login
router.post('/login', 
  validation.validateLogin,
  validation.handleValidationErrors,
  authController.login
);

// Protected routes (authentication required)

// Get current user profile
router.get('/profile', 
  authenticateToken, 
  authController.getProfile
);

// Update user profile
router.put('/profile', 
  authenticateToken,
  validation.validateProfileUpdate,
  validation.handleValidationErrors,
  authController.updateProfile
);

// Change password
router.put('/change-password', 
  authenticateToken,
  validation.validatePasswordChange,
  validation.handleValidationErrors,
  authController.changePassword
);

// Token verification route (useful for frontend authentication checks)
router.get('/verify', 
  authenticateToken, 
  (req, res) => {
    res.json({
      success: true,
      message: 'Token is valid',
      user: req.user.getPublicProfile()
    });
  }
);

// Logout route (client-side token removal, server just confirms)
router.post('/logout', 
  authenticateToken, 
  (req, res) => {
    res.json({
      success: true,
      message: 'Logged out successfully. Please remove token from client storage.'
    });
  }
);

module.exports = router;  