const express = require('express');
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
  validation.validateDateRange,
  equipmentController.checkAvailability
);

// Get equipment statistics (Admin only)
router.get('/statistics',
  authenticateToken,
  requireAdmin,
  equipmentController.getEquipmentStats
);

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
  async (req, res) => {
    try {
      const { equipmentIds, status } = req.body;
      
      if (!Array.isArray(equipmentIds) || equipmentIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Equipment IDs array is required'
        });
      }
      
      const validStatuses = ['available', 'rented', 'maintenance', 'retired'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
      
      const Equipment = require('../models/Equipment');
      const result = await Equipment.updateMany(
        { _id: { $in: equipmentIds } },
        { status, updatedAt: new Date() }
      );
      
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

// Get equipment by ID
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

// Delete equipment (Admin only)
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  equipmentController.deleteEquipment
);

module.exports = router;