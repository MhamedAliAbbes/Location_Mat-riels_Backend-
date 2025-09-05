const Reservation = require('../models/Reservation');
const Equipment = require('../models/Equipment');
const { validationResult } = require('express-validator');
const moment = require('moment');

// Get all reservations with filters
const getAllReservations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    let query = {};

    // For clients, only show their own reservations
    if (req.user.role === 'client') {
      query.client = req.user._id;
    }

    if (status) {
      query.status = status;
    }

    if (startDate && endDate) {
      query.startDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
    };

    // Execute paginated query
    const reservations = await Reservation.find(query)
      .populate('client', 'firstName lastName email company phone')
      .populate('equipment.item', 'name category brand model pricePerDay')
      .sort(options.sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit);

    const total = await Reservation.countDocuments(query);

    res.json({
      success: true,
      data: reservations,
      pagination: {
        current: options.page,
        pages: Math.ceil(total / options.limit),
        total,
        hasNext: options.page * options.limit < total,
        hasPrev: options.page > 1
      }
    });

  } catch (error) {
    console.error('Get all reservations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reservations'
    });
  }
};

// Get reservation by ID
const getReservationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    let query = { _id: id };
    
    // Clients can only view their own reservations
    if (req.user.role === 'client') {
      query.client = req.user._id;
    }

    const reservation = await Reservation.findOne(query)
      .populate('client', 'firstName lastName email company phone')
      .populate('equipment.item', 'name category brand model pricePerDay');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    res.json({
      success: true,
      data: reservation
    });

  } catch (error) {
    console.error('Get reservation by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reservation'
    });
  }
};

// Create new reservation

const createReservation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided',
        errors: errors.array()
      });
    }

    const { equipment, startDate, endDate, clientNotes } = req.body;
    
    // Validate dates
    const start = moment(startDate);
    const end = moment(endDate);
    
    if (start.isSameOrAfter(end)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    if (start.isBefore(moment(), 'day')) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be in the past'
      });
    }

    // Calculate duration
    const duration = end.diff(start, 'days') + 1;

    // Verify equipment availability and calculate pricing
    const equipmentDetails = [];
    let totalPrice = 0;

    for (const item of equipment) {
      const equipmentItem = await Equipment.findById(item.item);
      if (!equipmentItem) {
        return res.status(404).json({
          success: false,
          message: `Equipment not found: ${item.item}`
        });
      }

      // Check if equipment is available
      if (equipmentItem.status !== 'available') {
        return res.status(400).json({
          success: false,
          message: `Equipment ${equipmentItem.name} is not available`
        });
      }

      // Check for conflicts with existing reservations
      const conflicts = await Reservation.checkAvailability(
        item.item,
        start.toDate(),
        end.toDate()
      );
      
      const reservedQuantity = conflicts.reduce((sum, reservation) => {
        const conflictItem = reservation.equipment.find(eq => eq.item.toString() === item.item);
        return sum + (conflictItem ? conflictItem.quantity : 0);
      }, 0);
      
      const availableQuantity = equipmentItem.quantity - reservedQuantity;

      if (availableQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient quantity for ${equipmentItem.name}. Available: ${availableQuantity}, Requested: ${item.quantity}`
        });
      }

      // Calculate item price
      const itemPrice = equipmentItem.pricePerDay * item.quantity * duration;
      totalPrice += itemPrice;

      equipmentDetails.push({
        item: item.item,
        quantity: item.quantity,
        pricePerDay: equipmentItem.pricePerDay,
        totalPrice: itemPrice
      });
    }

    // Calculate pricing
    const subtotal = totalPrice;
    const deposit = Math.round(totalPrice * 0.2); // 20% deposit
    const total = subtotal + deposit;

    // Create reservation (don't set reservationNumber - let pre-save hook handle it)
    const reservation = new Reservation({
      client: req.user._id,
      equipment: equipmentDetails,
      startDate: start.toDate(),
      endDate: end.toDate(),
      duration,
      clientNotes: clientNotes || '',
      pricing: {
        subtotal,
        deposit,
        total
      },
      status: 'pending'
      // reservationNumber will be auto-generated by pre-save hook
    });

    // Save reservation
    await reservation.save();

    // Populate data for response
    await reservation.populate('client', 'firstName lastName email');
    await reservation.populate('equipment.item', 'name category brand model');

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Create reservation error:', error);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const errorMessages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating reservation'
    });
  }
};

// Approve reservation (Admin only)
const approveReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending reservations can be approved'
      });
    }

    // Re-check availability before approving
    for (const item of reservation.equipment) {
      const conflicts = await Reservation.checkAvailability(
        item.item,
        reservation.startDate,
        reservation.endDate,
        reservation._id
      );
      
      const equipmentItem = await Equipment.findById(item.item);
      const reservedQuantity = conflicts.reduce((sum, res) => {
        const conflictItem = res.equipment.find(eq => eq.item.toString() === item.item.toString());
        return sum + (conflictItem ? conflictItem.quantity : 0);
      }, 0);
      
      const availableQuantity = equipmentItem.quantity - reservedQuantity;

      if (availableQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Equipment ${equipmentItem.name} is no longer available for the requested quantity`
        });
      }
    }

    // Approve the reservation
    reservation.approve(adminNotes);
    await reservation.save();

    res.json({
      success: true,
      message: 'Reservation approved successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Approve reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while approving reservation'
    });
  }
};

// Reject reservation (Admin only)
const rejectReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, adminNotes } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending reservations can be rejected'
      });
    }

    // Reject the reservation
    reservation.reject(rejectionReason, adminNotes);
    await reservation.save();

    res.json({
      success: true,
      message: 'Reservation rejected successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Reject reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting reservation'
    });
  }
};

// Cancel reservation
const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    // Check permissions
    if (req.user.role === 'client' && reservation.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Check if cancellation is allowed
    const cancellableStatuses = ['pending', 'approved'];
    if (!cancellableStatuses.includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        message: 'This reservation cannot be cancelled'
      });
    }

    reservation.status = 'cancelled';
    await reservation.save();

    res.json({
      success: true,
      message: 'Reservation cancelled successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Cancel reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling reservation'
    });
  }
};

// Mark reservation as active (Admin only)
const markReservationActive = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    if (reservation.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved reservations can be marked as active'
      });
    }

    reservation.markActive();
    await reservation.save();

    // Update equipment availability
    for (const item of reservation.equipment) {
      await Equipment.findByIdAndUpdate(
        item.item,
        { 
          $inc: { available: -item.quantity },
          status: 'rented'
        }
      );
    }

    res.json({
      success: true,
      message: 'Reservation marked as active successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Mark reservation active error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking reservation as active'
    });
  }
};

// Complete reservation (Admin only)
const completeReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findById(id);
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    if (reservation.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active reservations can be completed'
      });
    }

    reservation.complete();
    await reservation.save();

    // Update equipment availability
    for (const item of reservation.equipment) {
      const equipment = await Equipment.findById(item.item);
      equipment.available += item.quantity;
      
      // Check if this was the last rental for this equipment
      const activeRentals = await Reservation.countDocuments({
        'equipment.item': item.item,
        status: 'active'
      });
      
      if (activeRentals === 0) {
        equipment.status = 'available';
      }
      
      await equipment.save();
    }

    res.json({
      success: true,
      message: 'Reservation completed successfully',
      data: reservation
    });

  } catch (error) {
    console.error('Complete reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while completing reservation'
    });
  }
};

// Get reservation statistics (Admin only)
const getReservationStats = async (req, res) => {
  try {
    const totalReservations = await Reservation.countDocuments();
    const pendingReservations = await Reservation.countDocuments({ status: 'pending' });
    const approvedReservations = await Reservation.countDocuments({ status: 'approved' });
    const activeReservations = await Reservation.countDocuments({ status: 'active' });
    const completedReservations = await Reservation.countDocuments({ status: 'completed' });

    // Reservations by status
    const reservationsByStatus = await Reservation.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Monthly reservations
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyReservations = await Reservation.countDocuments({
      createdAt: { $gte: startOfMonth }
    });

    res.json({
      success: true,
      data: {
        totalReservations,
        pendingReservations,
        approvedReservations,
        activeReservations,
        completedReservations,
        reservationsByStatus,
        monthlyReservations
      }
    });

  } catch (error) {
    console.error('Get reservation stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching reservation statistics'
    });
  }
};

module.exports = {
  getAllReservations,
  getReservationById,
  createReservation,
  approveReservation,
  rejectReservation,
  cancelReservation,
  markReservationActive,
  completeReservation,
  getReservationStats
};