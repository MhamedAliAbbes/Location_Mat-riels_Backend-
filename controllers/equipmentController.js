const Equipment = require('../models/Equipment');
const Reservation = require('../models/Reservation');
const { validationResult } = require('express-validator');

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

// Delete equipment (Admin only)
const deleteEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    // Check if equipment has active reservations
    const activeReservations = await Reservation.find({
      'equipment.item': req.params.id,
      status: { $in: ['approved', 'active'] }
    });

    if (activeReservations.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete equipment with active reservations'
      });
    }

    await Equipment.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Equipment deleted successfully'
    });

  } catch (error) {
    console.error('Delete equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting equipment'
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
    const conflicts = await Reservation.checkAvailability(
      equipmentId,
      new Date(startDate),
      new Date(endDate)
    );

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

    res.json({
      success: true,
      data: {
        totalEquipment,
        availableEquipment,
        rentedEquipment,
        maintenanceEquipment,
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

module.exports = {
  getAllEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  checkAvailability,
  getEquipmentByCategory,
  getEquipmentStats
};