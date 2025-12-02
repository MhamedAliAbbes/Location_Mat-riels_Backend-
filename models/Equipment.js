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
  
  // Images - Enhanced for better image management
  images: [{
    url: {
      type: String,
      required: true
    },
    publicId: String,  // For cloud storage reference (Cloudinary, AWS S3, etc.)
    filename: String,  // Original filename
    size: Number,      // File size in bytes
    mimeType: String,  // MIME type (image/jpeg, image/png, etc.)
    isPrimary: {
      type: Boolean,
      default: false
    },
    alt: String,       // Alt text for accessibility
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Specifications (flexible key-value pairs)
  specifications: [{
    name: String,    // e.g., "Resolution", "Battery Life", "Weight"
    value: String    // e.g., "4K", "8 hours", "2.5kg"
  }],
  
  // Documents (manuals, warranties, etc.)
  documents: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['manual', 'warranty', 'certificate', 'other']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
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
equipmentSchema.index({ name: 'text', description: 'text', brand: 'text', model: 'text' });
equipmentSchema.index({ serialNumber: 1 });

// Middleware to ensure only one primary image
equipmentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure available quantity doesn't exceed total quantity
  if (this.available > this.quantity) {
    this.available = this.quantity;
  }
  
  // Handle primary image logic
  if (this.images && this.images.length > 0) {
    let primaryCount = 0;
    let firstImageIndex = -1;
    
    this.images.forEach((image, index) => {
      if (image.isPrimary) {
        primaryCount++;
        if (primaryCount > 1) {
          image.isPrimary = false; // Remove primary flag from duplicates
        }
      }
      if (firstImageIndex === -1) {
        firstImageIndex = index;
      }
    });
    
    // If no primary image is set, make the first one primary
    if (primaryCount === 0 && firstImageIndex !== -1) {
      this.images[firstImageIndex].isPrimary = true;
    }
  }
  
  next();
});

// Virtual for primary image
equipmentSchema.virtual('primaryImage').get(function() {
  if (!this.images || this.images.length === 0) return null;
  
  const primaryImg = this.images.find(img => img.isPrimary);
  return primaryImg || this.images[0];
});

// Virtual for image count
equipmentSchema.virtual('imageCount').get(function() {
  return this.images ? this.images.length : 0;
});

// Instance method to check if equipment is available for specific quantity
equipmentSchema.methods.isAvailableForQuantity = function(requestedQuantity) {
  return this.status === 'available' && this.available >= requestedQuantity;
};

// Instance method to add image
equipmentSchema.methods.addImage = function(imageData) {
  if (!this.images) this.images = [];
  
  // Set as primary if it's the first image
  if (this.images.length === 0) {
    imageData.isPrimary = true;
  }
  
  this.images.push({
    url: imageData.url,
    publicId: imageData.publicId,
    filename: imageData.filename,
    size: imageData.size,
    mimeType: imageData.mimeType,
    isPrimary: imageData.isPrimary || false,
    alt: imageData.alt || this.name,
    uploadedAt: new Date()
  });
  
  return this.save();
};

// Instance method to remove image
equipmentSchema.methods.removeImage = function(imageId) {
  if (!this.images) return this.save();
  
  const imageIndex = this.images.findIndex(img => img._id.toString() === imageId);
  if (imageIndex === -1) return this.save();
  
  const removedImage = this.images[imageIndex];
  this.images.splice(imageIndex, 1);
  
  // If removed image was primary, make the first remaining image primary
  if (removedImage.isPrimary && this.images.length > 0) {
    this.images[0].isPrimary = true;
  }
  
  return this.save();
};

// Instance method to set primary image
equipmentSchema.methods.setPrimaryImage = function(imageId) {
  if (!this.images) return this.save();
  
  this.images.forEach(img => {
    img.isPrimary = img._id.toString() === imageId;
  });
  
  return this.save();
};

// Static method to find available equipment by category
equipmentSchema.statics.findAvailableByCategory = function(category) {
  return this.find({
    category: category,
    status: 'available',
    available: { $gt: 0 }
  });
};

// Static method to get equipment statistics
equipmentSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        available: { 
          $sum: { 
            $cond: [
              { $and: [{ $eq: ['$status', 'available'] }, { $gt: ['$available', 0] }] }, 
              1, 
              0
            ] 
          } 
        },
        rented: { $sum: { $cond: [{ $eq: ['$status', 'rented'] }, 1, 0] } },
        maintenance: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } },
        totalValue: { $sum: '$pricePerDay' }
      }
    }
  ]);
};

// Virtual for equipment full name
equipmentSchema.virtual('fullName').get(function() {
  return `${this.brand} ${this.model} ${this.name}`.trim();
});

// Virtual for availability status
equipmentSchema.virtual('availabilityStatus').get(function() {
  if (this.status !== 'available') return this.status;
  if (this.available === 0) return 'out_of_stock';
  if (this.available <= this.quantity * 0.2) return 'low_stock';
  return 'available';
});

// Ensure virtual fields are serialized
equipmentSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    // Remove sensitive fields if needed
    delete ret.__v;
    return ret;
  }
});

// Export the model
module.exports = mongoose.model('Equipment', equipmentSchema);