const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  // Reservation Identification
  reservationNumber: {
    type: String,
    unique: true
  },
  
  // Client who made the reservation
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Equipment being reserved (can be multiple items)
  equipment: [{
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Equipment',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    pricePerDay: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Rental Period
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in days
    required: true,
    min: 1
  },
  
  // Reservation Status - Updated to include completed
  status: {
    type: String,
    enum: [
      'pending',     // Waiting for admin approval
      'approved',    // Admin approved the reservation
      'rejected',    // Admin rejected the reservation
      'expired',     // Automatically expired after end date
      'cancelled',   // Reservation was cancelled
      'completed'    // Reservation was completed successfully
    ],
    default: 'pending'
  },
  
  // Financial Information
  pricing: {
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    deposit: {
      type: Number,
      required: true,
      min: 0
    },
    total: {
      type: Number,
      required: true,
      min: 0
    }
  },
  
  // Admin Notes and Client Messages
  clientNotes: {
    type: String,
    maxlength: 500
  },
  adminNotes: {
    type: String,
    maxlength: 500
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  
  // Automatic expiration tracking
  isExpired: {
    type: Boolean,
    default: false
  },
  expiredAt: Date,
  autoCompletedAt: Date,
  
  // Deletion tracking (for cascade operations)
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletionReason: {
    type: String,
    enum: ['user_deleted', 'manual_deletion', 'system_cleanup'],
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: Date,
  rejectedAt: Date,
  completedAt: Date
});

// Indexes for better query performance
reservationSchema.index({ client: 1, status: 1 });
reservationSchema.index({ startDate: 1, endDate: 1 });
reservationSchema.index({ 'equipment.item': 1 });
reservationSchema.index({ endDate: 1, status: 1 }); // For expiration checks
reservationSchema.index({ isDeleted: 1 });

// Middleware to generate reservation number before saving
reservationSchema.pre('save', async function(next) {
  if (this.isNew && !this.reservationNumber) {
    try {
      const year = new Date().getFullYear();
      const count = await this.constructor.countDocuments({
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`)
        }
      });
      this.reservationNumber = `RES-${year}-${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generating reservation number:', error);
      const timestamp = Date.now();
      this.reservationNumber = `RES-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
    }
  }
  next();
});

// Static method to check if equipment is available for specific dates
reservationSchema.statics.checkAvailability = async function(equipmentId, startDate, endDate, excludeReservationId = null) {
  const query = {
    'equipment.item': equipmentId,
    status: { $in: ['approved', 'completed'] }, // Include completed reservations in availability check
    isDeleted: false,
    $or: [
      {
        startDate: { $lt: endDate },
        endDate: { $gt: startDate }
      }
    ]
  };
  
  if (excludeReservationId) {
    query._id = { $ne: excludeReservationId };
  }
  
  return await this.find(query);
};

// Static method to find expired reservations
reservationSchema.statics.findExpiredReservations = async function() {
  const now = new Date();
  return await this.find({
    status: { $in: ['approved', 'completed'] }, // Both approved and completed can expire
    endDate: { $lt: now },
    isExpired: false,
    isDeleted: false
  });
};

// Static method to auto-expire reservations and free equipment
reservationSchema.statics.autoExpireReservations = async function() {
  const Equipment = mongoose.model('Equipment');
  const expiredReservations = await this.findExpiredReservations();
  
  const results = {
    processed: 0,
    expired: 0,
    errors: []
  };
  
  for (const reservation of expiredReservations) {
    try {
      results.processed++;
      
      // Mark reservation as expired
      reservation.status = 'expired';
      reservation.isExpired = true;
      reservation.expiredAt = new Date();
      reservation.autoCompletedAt = new Date();
      
      await reservation.save();
      
      // Release equipment back to available pool only if not already completed
      if (reservation.status !== 'completed') {
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
      
      results.expired++;
      console.log(`Auto-expired reservation: ${reservation.reservationNumber}`);
      
    } catch (error) {
      console.error(`Error auto-expiring reservation ${reservation.reservationNumber}:`, error);
      results.errors.push({
        reservationId: reservation._id,
        error: error.message
      });
    }
  }
  
  return results;
};

// Static method to handle user deletion cascading
reservationSchema.statics.handleUserDeletion = async function(userId) {
  const Equipment = mongoose.model('Equipment');
  
  // Find all reservations for the deleted user
  const userReservations = await this.find({
    client: userId,
    isDeleted: false,
    status: { $in: ['pending', 'approved', 'completed'] }
  });
  
  const results = {
    processed: 0,
    cancelled: 0,
    equipmentReleased: 0,
    errors: []
  };
  
  for (const reservation of userReservations) {
    try {
      results.processed++;
      
      // Release equipment if reservation was approved or completed
      if (['approved', 'completed'].includes(reservation.status)) {
        for (const item of reservation.equipment) {
          await Equipment.findByIdAndUpdate(
            item.item,
            { 
              $inc: { available: item.quantity },
              $set: { status: 'available' }
            }
          );
          results.equipmentReleased += item.quantity;
        }
      }
      
      // Mark reservation as deleted/cancelled
      reservation.status = 'cancelled';
      reservation.isDeleted = true;
      reservation.deletedAt = new Date();
      reservation.deletionReason = 'user_deleted';
      reservation.adminNotes = `Cancelled due to user account deletion - ${new Date().toISOString()}`;
      
      await reservation.save();
      results.cancelled++;
      
      console.log(`Cancelled reservation due to user deletion: ${reservation.reservationNumber}`);
      
    } catch (error) {
      console.error(`Error handling reservation ${reservation.reservationNumber} for deleted user:`, error);
      results.errors.push({
        reservationId: reservation._id,
        error: error.message
      });
    }
  }
  
  return results;
};

// Method to approve reservation
reservationSchema.methods.approve = function(adminNotes = '') {
  this.status = 'approved';
  this.approvedAt = new Date();
  this.adminNotes = adminNotes;
};

// Method to reject reservation
reservationSchema.methods.reject = function(reason = '', adminNotes = '') {
  this.status = 'rejected';
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  this.adminNotes = adminNotes;
};

// Method to complete reservation
reservationSchema.methods.complete = function(adminNotes = '') {
  this.status = 'completed';
  this.completedAt = new Date();
  if (adminNotes) {
    this.adminNotes = adminNotes;
  }
};

// Method to check if reservation is expired
reservationSchema.methods.checkIfExpired = function() {
  const now = new Date();
  return this.endDate < now && ['approved', 'completed'].includes(this.status);
};

module.exports = mongoose.model('Reservation', reservationSchema);