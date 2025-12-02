const Reservation = require('../models/Reservation');
const Equipment = require('../models/Equipment');
const { validationResult } = require('express-validator');
const moment = require('moment');
const cleanupService = require('../services/cleanupService');

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
      sortOrder = 'desc',
      includeDeleted = false
    } = req.query;

    // Build filter query
    let query = { isDeleted: includeDeleted === 'true' ? { $in: [true, false] } : false };

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

    // Check for expired reservations during fetch
    const expiredCount = await Reservation.countDocuments({
      status: 'approved',
      endDate: { $lt: new Date() },
      isExpired: false,
      isDeleted: false
    });

    // If there are expired reservations, trigger cleanup
    if (expiredCount > 0) {
      console.log(`Found ${expiredCount} expired reservations, triggering cleanup...`);
      // Run cleanup in background
      cleanupService.runImmediateCleanup().catch(err => 
        console.error('Background cleanup failed:', err)
      );
    }

    res.json({
      success: true,
      data: reservations,
      pagination: {
        current: options.page,
        pages: Math.ceil(total / options.limit),
        total,
        hasNext: options.page * options.limit < total,
        hasPrev: options.page > 1
      },
      meta: {
        expiredCount,
        cleanupTriggered: expiredCount > 0
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
    
    let query = { _id: id, isDeleted: false };
    
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

    // Check if reservation is expired and handle it
    if (reservation.checkIfExpired() && !reservation.isExpired) {
      console.log(`Reservation ${reservation.reservationNumber} is expired, auto-expiring...`);
      
      // Auto-expire this specific reservation
      reservation.status = 'expired';
      reservation.isExpired = true;
      reservation.expiredAt = new Date();
      reservation.autoCompletedAt = new Date();
      
      // Release equipment
      for (const item of reservation.equipment) {
        await Equipment.findByIdAndUpdate(
          item.item,
          { 
            $inc: { available: item.quantity },
            $set: { status: 'available' }
          }
        );
      }
      
      await reservation.save();
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

      // Check for conflicts with existing active reservations
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

    // Create reservation
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

    const reservation = await Reservation.findOne({ _id: id, isDeleted: false });
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

    // Check if reservation is already expired
    if (reservation.checkIfExpired()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve expired reservation'
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

    // Populate for response
    await reservation.populate('client', 'firstName lastName email');
    await reservation.populate('equipment.item', 'name category brand model');

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

    const reservation = await Reservation.findOne({ _id: id, isDeleted: false });
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

    // Reject the reservation and free equipment if it was reserved
    reservation.reject(rejectionReason, adminNotes);
    
    // If reservation had approved equipment, release it
    if (reservation.status === 'approved') {
      for (const item of reservation.equipment) {
        await Equipment.findByIdAndUpdate(
          item.item,
          { 
            $inc: { available: item.quantity },
            $set: { status: 'available' }
          }
        );
      }
    }
    
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

// Cancel reservation (Only for pending reservations)
const cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findOne({ _id: id, isDeleted: false });
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

    // Check if cancellation is allowed - only pending reservations can be cancelled by clients
    if (req.user.role === 'client' && reservation.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'You cannot cancel this reservation after admin approval. Please contact support.'
      });
    }

    // Admin can cancel approved reservations too
    const cancellableStatuses = req.user.role === 'admin' ? ['pending', 'approved'] : ['pending'];
    if (!cancellableStatuses.includes(reservation.status)) {
      return res.status(400).json({
        success: false,
        message: 'This reservation cannot be cancelled'
      });
    }

    // If reservation was approved, release equipment back to available pool
    if (reservation.status === 'approved') {
      for (const item of reservation.equipment) {
        await Equipment.findByIdAndUpdate(
          item.item,
          { 
            $inc: { available: item.quantity },
            $set: { status: 'available' }
          }
        );
      }
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

// Delete reservation (Admin only)
const deleteReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await Reservation.findOne({ _id: id, isDeleted: false });
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    // If reservation was approved, release equipment back to available pool
    if (reservation.status === 'approved') {
      for (const item of reservation.equipment) {
        await Equipment.findByIdAndUpdate(
          item.item,
          { 
            $inc: { available: item.quantity },
            $set: { status: 'available' }
          }
        );
      }
    }

    // Mark as deleted instead of actually deleting
    reservation.isDeleted = true;
    reservation.deletedAt = new Date();
    reservation.deletionReason = 'manual_deletion';
    await reservation.save();

    res.json({
      success: true,
      message: 'Reservation deleted successfully'
    });

  } catch (error) {
    console.error('Delete reservation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting reservation'
    });
  }
};

// Get reservation statistics (Admin only)
const getReservationStats = async (req, res) => {
  try {
    const totalReservations = await Reservation.countDocuments({ isDeleted: false });
    const pendingReservations = await Reservation.countDocuments({ status: 'pending', isDeleted: false });
    const approvedReservations = await Reservation.countDocuments({ status: 'approved', isDeleted: false });
    const completedReservations = await Reservation.countDocuments({ status: 'completed', isDeleted: false });
    const expiredReservations = await Reservation.countDocuments({ status: 'expired', isDeleted: false });

    // Reservations by status
    const reservationsByStatus = await Reservation.aggregate([
      { $match: { isDeleted: false } },
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
      createdAt: { $gte: startOfMonth },
      isDeleted: false
    });

    // Expired reservations that need attention
    const expiredNeedingCleanup = await Reservation.countDocuments({
      status: 'approved',
      endDate: { $lt: new Date() },
      isExpired: false,
      isDeleted: false
    });

    res.json({
      success: true,
      data: {
        totalReservations,
        pendingReservations,
        approvedReservations,
        completedReservations,
        expiredReservations,
        reservationsByStatus,
        monthlyReservations,
        expiredNeedingCleanup
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

// Manual cleanup trigger (Admin only)
const triggerCleanup = async (req, res) => {
  try {
    const results = await cleanupService.runImmediateCleanup();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      data: results
    });
    
  } catch (error) {
    console.error('Trigger cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during cleanup operation'
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
  deleteReservation,
  getReservationStats,
  triggerCleanup
};