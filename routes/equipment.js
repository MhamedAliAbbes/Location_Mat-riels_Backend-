const express = require('express');
const multer = require('multer'); // IMPORTANT: Add this import
const equipmentController = require('../controllers/equipmentController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const validation = require('../middleware/validation');

const router = express.Router();

// IMPORTANT: Static routes MUST come before dynamic routes to avoid conflicts

// === STATIC ROUTES (NO PARAMETERS) ===

// Get equipment categories (public)
router.get('/categories', (req, res) => {
  const categories = [
    { value: 'camera', label: 'Cameras & Lenses' },
    { value: 'lighting', label: 'Lighting Equipment' },
    { value: 'sound', label: 'Audio Equipment' },
    { value: 'stabilizer', label: 'Stabilizers & Tripods' },
    { value: 'drone', label: 'Drones & Aerial' },
    { value: 'monitor', label: 'Monitors & Displays' },
    { value: 'accessory', label: 'Accessories' },
    { value: 'other', label: 'Other Equipment' }
  ];
  
  res.json({
    success: true,
    data: categories
  });
});

// Check equipment availability (public)
router.get('/check-availability', 
  validation.validateAvailabilityCheck,
  validation.handleValidationErrors,
  equipmentController.checkAvailability
);

// Get equipment statistics (Admin only)
router.get('/statistics',
  authenticateToken,
  requireAdmin,
  equipmentController.getEquipmentStats
);

// Get featured equipment (public)
router.get('/featured', equipmentController.getFeaturedEquipment);

// Search equipment (public)
router.get('/search', equipmentController.getAllEquipment);

// Get all equipment (public with filters)
router.get('/', equipmentController.getAllEquipment);

// === ROUTES WITH CATEGORY PARAMETER ===

// Get equipment by category
router.get('/category/:category', 
  (req, res, next) => {
    const validCategories = ['camera', 'lighting', 'sound', 'stabilizer', 'drone', 'monitor', 'accessory', 'other'];
    if (!validCategories.includes(req.params.category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment category'
      });
    }
    next();
  },
  equipmentController.getEquipmentByCategory
);

// === ADMIN ONLY ROUTES ===

// Create new equipment (Admin only)
router.post('/',
  authenticateToken,
  requireAdmin,
  validation.validateEquipment,
  validation.handleValidationErrors,
  equipmentController.createEquipment
);

// Bulk update equipment status (Admin only)
router.patch('/bulk-update',
  authenticateToken,
  requireAdmin,
  validation.validateBulkUpdate,
  validation.handleValidationErrors,
  async (req, res) => {
    try {
      const { equipmentIds, status } = req.body;
      
      // Validate equipment IDs exist
      if (!equipmentIds || !Array.isArray(equipmentIds) || equipmentIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Equipment IDs array is required'
        });
      }

      // Validate status
      const validStatuses = ['available', 'rented', 'maintenance', 'retired'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status provided'
        });
      }
      
      const Equipment = require('../models/Equipment');
      const result = await Equipment.updateMany(
        { _id: { $in: equipmentIds } },
        { status, updatedAt: new Date() }
      );
      
      console.log('Bulk update result:', result);
      
      res.json({
        success: true,
        message: `Updated ${result.modifiedCount} equipment items`,
        modifiedCount: result.modifiedCount
      });
      
    } catch (error) {
      console.error('Bulk update error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during bulk update'
      });
    }
  }
);

// === DYNAMIC ID ROUTES (MUST BE LAST) ===

// Upload single equipment image (Admin only)
router.post('/:id/images',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  equipmentController.upload.single('image'),
  validation.validateFileUpload,
  equipmentController.uploadEquipmentImage
);

// Upload multiple equipment images (Admin only)
router.post('/:id/images/multiple',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  equipmentController.upload.array('images', 5),
  validation.validateFileUpload,
  equipmentController.uploadMultipleImages
);

// Delete equipment image (Admin only)
router.delete('/:id/images/:imageId',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  validation.validateObjectId('imageId'),
  equipmentController.deleteEquipmentImage
);

// Set primary equipment image (Admin only)
router.patch('/:id/images/:imageId/primary',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  validation.validateObjectId('imageId'),
  equipmentController.setPrimaryImage
);

// Get equipment by ID (public)
router.get('/:id', 
  validation.validateObjectId('id'),
  equipmentController.getEquipmentById
);

// Update equipment (Admin only)
router.put('/:id',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  validation.validateEquipment,
  validation.handleValidationErrors,
  equipmentController.updateEquipment
);

// Delete equipment (Admin only) - ENHANCED ERROR HANDLING
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  (req, res, next) => {
    console.log('DELETE request received for equipment ID:', req.params.id);
    console.log('User:', req.user?.email || 'Unknown');
    console.log('Time:', new Date().toISOString());
    next();
  },
  equipmentController.deleteEquipment
);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  console.error('Equipment route error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB per image.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 5 images allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      message: 'Only image files (JPEG, PNG, GIF, WebP) are allowed.'
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }

  // Handle cast errors (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  // Handle duplicate key errors
  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found'
    });
  }
  
  next(error);
});

// Global error handler for equipment routes
router.use((error, req, res, next) => {
  console.error('Unhandled equipment route error:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;