const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const validation = {
  // Validation for user registration
  validateRegister: [
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('phone')
      .notEmpty()
      .withMessage('Phone number is required')
  ],

  // Validation for user login
  validateLogin: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  // Validation for profile update
  validateProfileUpdate: [
    body('firstName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('phone')
      .optional()
      .notEmpty()
      .withMessage('Phone number cannot be empty'),
    body('company')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters')
  ],

  // Validation for equipment
  validateEquipment: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Equipment name must be between 2 and 100 characters'),
    body('description')
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    body('category')
      .isIn(['camera', 'lighting', 'sound', 'stabilizer', 'drone', 'monitor', 'accessory', 'other'])
      .withMessage('Invalid equipment category'),
    body('serialNumber')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Serial number must be between 3 and 50 characters'),
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive number'),
    body('pricePerDay')
      .isFloat({ min: 0 })
      .withMessage('Price per day must be a positive number')
  ],

  // Validation for reservation
  validateReservation: [
    body('equipment')
      .isArray({ min: 1 })
      .withMessage('At least one equipment item must be selected'),
    body('equipment.*.item')
      .isMongoId()
      .withMessage('Invalid equipment ID'),
    body('equipment.*.quantity')
      .isInt({ min: 1 })
      .withMessage('Equipment quantity must be a positive number'),
    body('startDate')
      .isISO8601()
      .withMessage('Invalid start date format'),
    body('endDate')
      .isISO8601()
      .withMessage('Invalid end date format')
  ],

  // Validation for password change
  validatePasswordChange: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters')
  ],

  // Handle validation errors
  handleValidationErrors: (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(error => ({
          field: error.path || error.param,
          message: error.msg,
          value: error.value
        }))
      });
    }
    next();
  },

  // Validate MongoDB ObjectId
  validateObjectId: (paramName) => {
    return (req, res, next) => {
      const id = req.params[paramName];
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${paramName} format`
        });
      }
      
      next();
    };
  },

  // Validate date range
  validateDateRange: (req, res, next) => {
    const { startDate, endDate } = req.query;
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }
      
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }
    }
    
    next();
  }
};

module.exports = validation;