const Equipment = require('../models/Equipment');
const Reservation = require('../models/Reservation');
const { validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/equipment';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `equipment-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  }
});

// Get all equipment with filters and pagination
const getAllEquipment = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      available,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    let query = {};

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (available === 'true') {
      query.available = { $gt: 0 };
      query.status = 'available';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
    };

    // Execute paginated query
    const equipment = await Equipment.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort(options.sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit);

    const total = await Equipment.countDocuments(query);

    res.json({
      success: true,
      data: equipment,
      pagination: {
        current: options.page,
        pages: Math.ceil(total / options.limit),
        total,
        hasNext: options.page * options.limit < total,
        hasPrev: options.page > 1
      }
    });

  } catch (error) {
    console.error('Get all equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching equipment'
    });
  }
};

// Get equipment by ID
const getEquipmentById = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    res.json({
      success: true,
      data: equipment
    });

  } catch (error) {
    console.error('Get equipment by ID error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while fetching equipment'
    });
  }
};

// Create new equipment (Admin only)
const createEquipment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided',
        errors: errors.array()
      });
    }

    const equipmentData = {
      ...req.body,
      createdBy: req.user._id,
      available: req.body.quantity || 1
    };

    const equipment = new Equipment(equipmentData);
    await equipment.save();

    await equipment.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Equipment created successfully',
      data: equipment
    });

  } catch (error) {
    console.error('Create equipment error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating equipment'
    });
  }
};

// Update equipment (Admin only)
const updateEquipment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided',
        errors: errors.array()
      });
    }

    const equipment = await Equipment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    res.json({
      success: true,
      message: 'Equipment updated successfully',
      data: equipment
    });

  } catch (error) {
    console.error('Update equipment error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Serial number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating equipment'
    });
  }
};

// Delete equipment (Admin only) - ENHANCED WITH FORCE DELETE
const deleteEquipment = async (req, res) => {
  try {
    console.log('Delete equipment request for ID:', req.params.id);
    
    // Check for force delete parameter
    const forceDelete = req.query.force === 'true';
    console.log('Force delete:', forceDelete);
    
    // Validate ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('Invalid equipment ID format:', req.params.id);
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }

    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      console.log('Equipment not found for ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    console.log('Found equipment to delete:', equipment.name);

    // Check if equipment has active reservations (unless force delete)
    let activeReservations = [];
    if (!forceDelete) {
      try {
        activeReservations = await Reservation.find({
          'equipment.item': req.params.id,
          status: { $in: ['approved', 'active'] }
        });

        if (activeReservations.length > 0) {
          console.log('Equipment has active reservations, cannot delete');
          return res.status(400).json({
            success: false,
            message: 'Cannot delete equipment with active reservations. Use force delete if you want to proceed anyway.',
            activeReservations: activeReservations.length,
            canForceDelete: true
          });
        }
      } catch (reservationError) {
        console.error('Error checking reservations:', reservationError);
        // Continue with deletion even if reservation check fails
      }
    } else {
      console.log('Force delete enabled - skipping reservation check');
      
      // Still check for active reservations to inform the user
      try {
        activeReservations = await Reservation.find({
          'equipment.item': req.params.id,
          status: { $in: ['approved', 'active'] }
        });
        
        if (activeReservations.length > 0) {
          console.log(`Force deleting equipment with ${activeReservations.length} active reservations`);
        }
      } catch (reservationError) {
        console.error('Error checking reservations during force delete:', reservationError);
      }
    }

    // Delete associated images from filesystem
    if (equipment.images && equipment.images.length > 0) {
      console.log('Deleting', equipment.images.length, 'associated images');
      for (const image of equipment.images) {
        try {
          if (image.url && image.url.startsWith('/uploads/')) {
            const imagePath = path.join(process.cwd(), image.url);
            await fs.unlink(imagePath);
            console.log('Deleted image file:', imagePath);
          }
        } catch (imageError) {
          console.error('Error deleting image file:', image.url, imageError.message);
          // Continue with deletion even if image file deletion fails
        }
      }
    }

    // Delete the equipment document
    await Equipment.findByIdAndDelete(req.params.id);
    console.log('Equipment deleted successfully:', req.params.id);

    const responseMessage = forceDelete && activeReservations.length > 0
      ? `Equipment deleted successfully (forced deletion with ${activeReservations.length} active reservations)`
      : 'Equipment deleted successfully';

    res.json({
      success: true,
      message: responseMessage,
      forceDeleted: forceDelete,
      affectedReservations: activeReservations.length
    });

  } catch (error) {
    console.error('Delete equipment error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while deleting equipment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Upload equipment image (Admin only)
const uploadEquipmentImage = async (req, res) => {
  try {
    console.log('Upload single image request for equipment:', req.params.id);
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    console.log('Uploaded file:', req.file.filename, 'size:', req.file.size);

    const imageData = {
      url: `/uploads/equipment/${req.file.filename}`,
      filename: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      isPrimary: equipment.images.length === 0 // First image is primary
    };

    await equipment.addImage(imageData);
    console.log('Image added to equipment successfully');

    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: equipment
    });

  } catch (error) {
    console.error('Upload image error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while uploading image'
    });
  }
};

// Upload multiple equipment images (Admin only)
const uploadMultipleImages = async (req, res) => {
  try {
    console.log('Upload multiple images request for equipment:', req.params.id);
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided'
      });
    }

    if (equipment.images.length + req.files.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 images allowed per equipment'
      });
    }

    console.log('Uploading', req.files.length, 'images');

    for (const file of req.files) {
      const imageData = {
        url: `/uploads/equipment/${file.filename}`,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        isPrimary: equipment.images.length === 0 // First image is primary
      };

      await equipment.addImage(imageData);
      console.log('Added image:', file.filename);
    }

    res.json({
      success: true,
      message: `${req.files.length} images uploaded successfully`,
      data: equipment
    });

  } catch (error) {
    console.error('Upload multiple images error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while uploading images'
    });
  }
};

// Delete equipment image (Admin only)
const deleteEquipmentImage = async (req, res) => {
  try {
    console.log('Delete image request:', req.params.imageId, 'from equipment:', req.params.id);
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    const image = equipment.images.id(req.params.imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Delete image file from filesystem
    try {
      if (image.url && image.url.startsWith('/uploads/')) {
        const imagePath = path.join(process.cwd(), image.url);
        await fs.unlink(imagePath);
        console.log('Deleted image file:', imagePath);
      }
    } catch (imageError) {
      console.error('Error deleting image file:', image.url, imageError.message);
    }

    await equipment.removeImage(req.params.imageId);
    console.log('Image removed from equipment successfully');

    res.json({
      success: true,
      message: 'Image deleted successfully',
      data: equipment
    });

  } catch (error) {
    console.error('Delete image error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment or image ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while deleting image'
    });
  }
};

// Set primary equipment image (Admin only)
const setPrimaryImage = async (req, res) => {
  try {
    console.log('Set primary image request:', req.params.imageId, 'for equipment:', req.params.id);
    
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    const image = equipment.images.id(req.params.imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    await equipment.setPrimaryImage(req.params.imageId);
    console.log('Primary image set successfully');

    res.json({
      success: true,
      message: 'Primary image set successfully',
      data: equipment
    });

  } catch (error) {
    console.error('Set primary image error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment or image ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while setting primary image'
    });
  }
};

// Check equipment availability for specific dates
const checkAvailability = async (req, res) => {
  try {
    const { equipmentId, startDate, endDate, quantity = 1 } = req.query;

    if (!equipmentId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'equipmentId, startDate, and endDate are required'
      });
    }

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    // Check for conflicting reservations
    let conflicts = [];
    try {
      conflicts = await Reservation.checkAvailability(
        equipmentId,
        new Date(startDate),
        new Date(endDate)
      );
    } catch (reservationError) {
      console.error('Error checking reservations:', reservationError);
      // Continue with basic availability check
    }

    // Calculate reserved quantity
    const reservedQuantity = conflicts.reduce((sum, reservation) => {
      const item = reservation.equipment.find(eq => eq.item.toString() === equipmentId);
      return sum + (item ? item.quantity : 0);
    }, 0);

    const availableQuantity = equipment.quantity - reservedQuantity;
    const isAvailable = availableQuantity >= parseInt(quantity);

    res.json({
      success: true,
      available: isAvailable,
      availableQuantity,
      totalQuantity: equipment.quantity,
      reservedQuantity,
      requestedQuantity: parseInt(quantity),
      conflicts: conflicts.length
    });

  } catch (error) {
    console.error('Check availability error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid equipment ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while checking availability'
    });
  }
};

// Get equipment by category
const getEquipmentByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { available } = req.query;

    let query = { category };
    
    if (available === 'true') {
      query.status = 'available';
      query.available = { $gt: 0 };
    }

    const equipment = await Equipment.find(query)
      .populate('createdBy', 'firstName lastName')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: equipment,
      count: equipment.length
    });

  } catch (error) {
    console.error('Get equipment by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching equipment by category'
    });
  }
};

// Get equipment statistics (Admin only)
const getEquipmentStats = async (req, res) => {
  try {
    const totalEquipment = await Equipment.countDocuments();
    const availableEquipment = await Equipment.countDocuments({ 
      status: 'available', 
      available: { $gt: 0 } 
    });
    const rentedEquipment = await Equipment.countDocuments({ status: 'rented' });
    const maintenanceEquipment = await Equipment.countDocuments({ status: 'maintenance' });

    // Equipment by category
    const equipmentByCategory = await Equipment.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          availableQuantity: { $sum: '$available' }
        }
      }
    ]);

    // Total value
    const totalValue = await Equipment.aggregate([
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ['$pricePerDay', '$quantity'] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalEquipment,
        availableEquipment,
        rentedEquipment,
        maintenanceEquipment,
        totalValue: totalValue[0]?.totalValue || 0,
        equipmentByCategory
      }
    });

  } catch (error) {
    console.error('Get equipment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching equipment statistics'
    });
  }
};

// Get featured equipment
const getFeaturedEquipment = async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const equipment = await Equipment.find({
      status: 'available',
      available: { $gt: 0 }
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('createdBy', 'firstName lastName');

    res.json({
      success: true,
      data: equipment
    });

  } catch (error) {
    console.error('Get featured equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching featured equipment'
    });
  }
};

module.exports = {
  getAllEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  uploadEquipmentImage,
  uploadMultipleImages,
  deleteEquipmentImage,
  setPrimaryImage,
  checkAvailability,
  getEquipmentByCategory,
  getEquipmentStats,
  getFeaturedEquipment,
  upload
};