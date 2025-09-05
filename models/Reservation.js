const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  // Reservation Identification
  reservationNumber: {
    type: String,
    unique: true
    // Remove required: true - let the pre-save hook handle it
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
  
  // Reservation Status
  status: {
    type: String,
    enum: [
      'pending',     // Waiting for admin approval
      'approved',    // Admin approved the reservation
      'rejected',    // Admin rejected the reservation
      'active',      // Equipment is currently rented out
      'completed',   // Rental period finished and equipment returned
      'cancelled'    // Reservation was cancelled
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
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: Date,
  rejectedAt: Date,
  completedAt: Date
});

// Index for better query performance
reservationSchema.index({ client: 1, status: 1 });
reservationSchema.index({ startDate: 1, endDate: 1 });
reservationSchema.index({ 'equipment.item': 1 });

// FIXED: Middleware to generate reservation number before saving
reservationSchema.pre('save', async function(next) {
  // Only generate reservation number for new documents
  if (this.isNew && !this.reservationNumber) {
    try {
      const year = new Date().getFullYear();
      
      // Get count of existing reservations for this year
      const count = await this.constructor.countDocuments({
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`)
        }
      });
      
      // Generate reservation number: RES-YYYY-XXXXXX
      this.reservationNumber = `RES-${year}-${String(count + 1).padStart(6, '0')}`;
      
    } catch (error) {
      console.error('Error generating reservation number:', error);
      // Fallback: use timestamp-based number
      const timestamp = Date.now();
      this.reservationNumber = `RES-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
    }
  }
  next();
});

// Method to calculate total pricing
reservationSchema.methods.calculateTotal = function() {
  this.pricing.subtotal = this.equipment.reduce((sum, item) => sum + item.totalPrice, 0);
  this.pricing.deposit = Math.round(this.pricing.subtotal * 0.2); // 20% deposit
  this.pricing.total = this.pricing.subtotal + this.pricing.deposit;
};

// Static method to check if equipment is available for specific dates
reservationSchema.statics.checkAvailability = async function(equipmentId, startDate, endDate, excludeReservationId = null) {
  const query = {
    'equipment.item': equipmentId,
    status: { $in: ['approved', 'active'] },
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

// Method to mark as active (equipment picked up)
reservationSchema.methods.markActive = function() {
  this.status = 'active';
};

// Method to complete reservation (equipment returned)
reservationSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
};

module.exports = mongoose.model('Reservation', reservationSchema);