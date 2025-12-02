const { body, param, query, validationResult } = require('express-validator');
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

  // Enhanced validation for equipment (updated)
  validateEquipment: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Equipment name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Equipment name must be between 2 and 100 characters'),
    
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Description is required')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .isIn(['camera', 'lighting', 'sound', 'stabilizer', 'drone', 'monitor', 'accessory', 'other'])
      .withMessage('Invalid equipment category'),
    
    body('brand')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Brand name cannot exceed 50 characters'),
    
    body('model')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('Model name cannot exceed 50 characters'),
    
    body('serialNumber')
      .trim()
      .notEmpty()
      .withMessage('Serial number is required')
      .isLength({ min: 1, max: 100 })
      .withMessage('Serial number must be between 1 and 100 characters'),
    
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be at least 1'),
    
    body('pricePerDay')
      .isFloat({ min: 0 })
      .withMessage('Price per day must be a positive number'),
    
    body('status')
      .optional()
      .isIn(['available', 'rented', 'maintenance', 'retired'])
      .withMessage('Invalid status'),
    
    body('condition')
      .optional()
      .isIn(['excellent', 'good', 'fair', 'poor'])
      .withMessage('Invalid condition'),

    // Image validation (new)
    body('images')
      .optional()
      .isArray()
      .withMessage('Images must be an array'),

    body('images.*.url')
      .if(body('images').exists())
      .isURL()
      .withMessage('Invalid image URL'),

    body('images.*.isPrimary')
      .if(body('images').exists())
      .optional()
      .isBoolean()
      .withMessage('isPrimary must be a boolean'),

    // Specifications validation (new)
    body('specifications')
      .optional()
      .isArray()
      .withMessage('Specifications must be an array'),

    body('specifications.*.name')
      .if(body('specifications').exists())
      .trim()
      .notEmpty()
      .withMessage('Specification name is required')
      .isLength({ max: 50 })
      .withMessage('Specification name cannot exceed 50 characters'),

    body('specifications.*.value')
      .if(body('specifications').exists())
      .trim()
      .notEmpty()
      .withMessage('Specification value is required')
      .isLength({ max: 100 })
      .withMessage('Specification value cannot exceed 100 characters')
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
      .custom((value, { req }) => {
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(value);
        
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Notes cannot exceed 500 characters')
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

  // User update validation (admin)
  validateUserUpdate: [
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
      .trim()
      .isLength({ min: 8, max: 20 })
      .withMessage('Phone number must be between 8 and 20 characters'),
    
    body('company')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Company name must not exceed 100 characters'),
    
    body('role')
      .optional()
      .isIn(['client', 'admin'])
      .withMessage('Role must be either client or admin'),
    
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean value')
  ],

  // Password reset validation (admin)
  validatePasswordReset: [
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters long')
  ],

  // NEW: Validation for availability checking
  validateAvailabilityCheck: [
    query('equipmentId')
      .notEmpty()
      .withMessage('Equipment ID is required')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid equipment ID format');
        }
        return true;
      }),
    
    query('startDate')
      .notEmpty()
      .withMessage('Start date is required')
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date')
      .custom((value) => {
        const startDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (startDate < today) {
          throw new Error('Start date cannot be in the past');
        }
        return true;
      }),
    
    query('endDate')
      .notEmpty()
      .withMessage('End date is required')
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .custom((value, { req }) => {
        const startDate = new Date(req.query.startDate);
        const endDate = new Date(value);
        
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
        
        // Maximum rental period of 30 days
        const maxRentalDays = 30;
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > maxRentalDays) {
          throw new Error(`Rental period cannot exceed ${maxRentalDays} days`);
        }
        
        return true;
      }),
    
    query('quantity')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Quantity must be between 1 and 10')
  ],

  // NEW: Validation for bulk updates
  validateBulkUpdate: [
    body('equipmentIds')
      .isArray({ min: 1 })
      .withMessage('Equipment IDs array is required and must contain at least one ID'),

    body('equipmentIds.*')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid equipment ID format');
        }
        return true;
      }),

    body('status')
      .notEmpty()
      .withMessage('Status is required')
      .isIn(['available', 'rented', 'maintenance', 'retired'])
      .withMessage('Invalid status')
  ],

  // NEW: File upload validation
  validateFileUpload: (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxFileSize = 5 * 1024 * 1024; // 5MB

    const files = req.files || [req.file];
    
    for (const file of files) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'
        });
      }

      if (file.size > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB per image.'
        });
      }
    }

    next();
  },

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

  // Enhanced date range validation
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

      // Check if start date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (start < today) {
        return res.status(400).json({
          success: false,
          message: 'Start date cannot be in the past'
        });
      }
    }
    
    next();
  }
};

module.exports = validation;