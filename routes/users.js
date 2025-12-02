const express = require('express');
const userController = require('../controllers/userController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { body, param, validationResult } = require('express-validator');

const router = express.Router();

// Validation middleware
const validateObjectId = (field) => {
  return param(field).isMongoId().withMessage(`Invalid ${field} format`);
};

const validateUserUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('First name must not be empty'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Last name must not be empty'),
  body('phone')
    .optional()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Phone must not be empty'),
  body('company')
    .optional()
    .trim(),
  body('role')
    .optional()
    .isIn(['client', 'admin'])
    .withMessage('Role must be either client or admin'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const validatePasswordReset = [
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

// Get user statistics - MUST be before /:id routes
router.get('/stats', userController.getUserStats);

// Bulk operations - MUST be before /:id routes
router.post('/bulk-operation', userController.bulkUserOperation);

// Get all users with filtering and pagination
router.get('/', userController.getAllUsers);

// Get specific user by ID
router.get('/:id', 
  validateObjectId('id'),
  handleValidationErrors,
  userController.getUserById
);

// Update user - Fixed validation
router.put('/:id', 
  validateObjectId('id'),
  validateUserUpdate,
  handleValidationErrors,
  userController.updateUser
);

// Delete user
router.delete('/:id', 
  validateObjectId('id'),
  handleValidationErrors,
  userController.deleteUser
);

// Reset user password
router.put('/:id/reset-password', 
  validateObjectId('id'),
  validatePasswordReset,
  handleValidationErrors,
  userController.resetUserPassword
);

// Toggle user status (activate/deactivate)
router.put('/:id/toggle-status', 
  validateObjectId('id'),
  handleValidationErrors,
  userController.toggleUserStatus
);

module.exports = router;