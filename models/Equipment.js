const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Category for cinema equipment
  category: {
    type: String,
    required: true,
    enum: [
      'camera',        // Cameras and lenses
      'lighting',      // Lighting equipment
      'sound',         // Audio equipment
      'stabilizer',    // Gimbals, tripods, etc.
      'drone',         // Drones and aerial equipment
      'monitor',       // Monitors and displays
      'accessory',     // General accessories
      'other'          // Other equipment
    ]
  },
  
  // Technical Details
  brand: String,
  model: String,
  serialNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Availability and Pricing
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  available: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerDay: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Equipment Status
  status: {
    type: String,
    enum: ['available', 'rented', 'maintenance', 'retired'],
    default: 'available'
  },
  
  // Equipment Condition
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'excellent'
  },
  
  // Images (simple URL storage)
  images: [{
    url: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  
  // Specifications (flexible key-value pairs)
  specifications: [{
    name: String,    // e.g., "Resolution", "Battery Life", "Weight"
    value: String    // e.g., "4K", "8 hours", "2.5kg"
  }],
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Index for better search performance
equipmentSchema.index({ category: 1, status: 1 });
equipmentSchema.index({ name: 'text', description: 'text' });

// Update the 'updatedAt' field before saving
equipmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure available quantity doesn't exceed total quantity
  if (this.available > this.quantity) {
    this.available = this.quantity;
  }
  
  next();
});

// Instance method to check if equipment is available for specific quantity
equipmentSchema.methods.isAvailableForQuantity = function(requestedQuantity) {
  return this.status === 'available' && this.available >= requestedQuantity;
};

// Static method to find available equipment by category
equipmentSchema.statics.findAvailableByCategory = function(category) {
  return this.find({
    category: category,
    status: 'available',
    available: { $gt: 0 }
  });
};

// Virtual for equipment full name
equipmentSchema.virtual('fullName').get(function() {
  return `${this.brand} ${this.model} ${this.name}`.trim();
});

// Ensure virtual fields are serialized
equipmentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Equipment', equipmentSchema);