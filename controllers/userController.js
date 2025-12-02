const User = require('../models/User');
const Reservation = require('../models/Reservation');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('getAllUsers - Query params:', { page, limit, role, isActive, status, search });

    // Build filter query
    let query = {};

    // Handle role filter
    if (role && role !== 'all') {
      query.role = role;
    }

    // Handle status filter (map frontend 'status' to backend 'isActive')
    if (status && status !== 'all') {
      query.isActive = status === 'active';
    } else if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Handle search
    if (search && search.trim()) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('getAllUsers - MongoDB query:', JSON.stringify(query, null, 2));

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 }
    };

    // Execute paginated query (exclude password)
    const users = await User.find(query)
      .select('-password')
      .sort(options.sort)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(); // Use lean() for better performance

    const total = await User.countDocuments(query);

    console.log(`getAllUsers - Found ${users.length} users out of ${total} total`);

    // Return in the format expected by frontend
    res.json({
      success: true,
      data: {
        users: users, // Frontend expects 'users' property
        pagination: {
          current: options.page,
          pages: Math.ceil(total / options.limit),
          total,
          hasNext: options.page * options.limit < total,
          hasPrev: options.page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user by ID (Admin only)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's reservation statistics
    const reservationStats = await Reservation.aggregate([
      { $match: { client: user._id, isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalReservations = await Reservation.countDocuments({ 
      client: user._id, 
      isDeleted: false 
    });

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        reservationStats,
        totalReservations
      }
    });

  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user'
    });
  }
};

// Update user (Admin only)
const updateUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided',
        errors: errors.array()
      });
    }

    const userId = req.params.id;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated this way
    delete updateData.password;
    delete updateData.email; // Email changes should be handled separately

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
};

// Delete user with cascade handling (Admin only)
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { reason } = req.body;

    // Prevent admin from deleting themselves
    if (req.user._id.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has active reservations
    const activeReservations = await Reservation.countDocuments({
      client: userId,
      status: { $in: ['pending', 'approved', 'active'] },
      isDeleted: false
    });

    console.log(`User ${user.email} has ${activeReservations} active reservations. Processing cascade deletion...`);

    // Handle reservation cascade deletion
    let cascadeResults = { processed: 0, cancelled: 0, equipmentReleased: 0, errors: [] };
    
    try {
      if (Reservation.handleUserDeletion) {
        cascadeResults = await Reservation.handleUserDeletion(userId);
      } else {
        // Fallback if method doesn't exist
        await Reservation.updateMany(
          { client: userId, isDeleted: false },
          { $set: { isDeleted: true, deletedAt: new Date() } }
        );
        cascadeResults.processed = activeReservations;
      }
    } catch (cascadeError) {
      console.error('Cascade deletion error:', cascadeError);
      cascadeResults.errors.push(cascadeError.message);
    }

    console.log('Cascade deletion results:', cascadeResults);

    // Now delete the user
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        deletedUser: {
          id: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        },
        cascadeResults: {
          reservationsProcessed: cascadeResults.processed,
          reservationsCancelled: cascadeResults.cancelled,
          equipmentReleased: cascadeResults.equipmentReleased,
          errors: cascadeResults.errors
        },
        reason: reason || 'No reason provided'
      }
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
};

// Reset user password (Admin only)
const resetUserPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data provided',
        errors: errors.array()
      });
    }

    const userId = req.params.id;
    const { newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting password'
    });
  }
};

// Toggle user active status (Admin only)
const toggleUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent admin from deactivating themselves
    if (req.user._id.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own status'
      });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newStatus = !user.isActive;
    
    // If deactivating user, handle their active reservations
    if (!newStatus) {
      console.log(`Deactivating user ${user.email}, handling reservations...`);
      
      // Cancel pending and approved reservations
      const activeReservations = await Reservation.find({
        client: userId,
        status: { $in: ['pending', 'approved'] },
        isDeleted: false
      });

      for (const reservation of activeReservations) {
        reservation.status = 'cancelled';
        reservation.adminNotes = `Cancelled due to user account deactivation - ${new Date().toISOString()}`;
        await reservation.save();

        // Release equipment if reservation was approved
        if (reservation.status === 'approved') {
          const Equipment = require('../models/Equipment');
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
      }
    }

    user.isActive = newStatus;
    await user.save();

    res.json({
      success: true,
      message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: user
    });

  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user status'
    });
  }
};

// Get user statistics (Admin only) - FIXED
const getUserStats = async (req, res) => {
  try {
    console.log('Fetching user statistics...');

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });
    const clientUsers = await User.countDocuments({ role: 'client' });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const activeClientUsers = await User.countDocuments({ role: 'client', isActive: true });
    const inactiveClientUsers = await User.countDocuments({ role: 'client', isActive: false });

    // Users by month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyUsers = await User.countDocuments({
      createdAt: { $gte: startOfMonth }
    });

    // Recent user activity (users with recent reservations)
    let recentlyActiveUsers = 0;
    try {
      const activeUserIds = await Reservation.distinct('client', {
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
        isDeleted: false
      });
      recentlyActiveUsers = activeUserIds.length;
    } catch (reservationError) {
      console.log('Could not fetch reservation data for activity stats:', reservationError.message);
    }

    const stats = {
      totalUsers,
      activeUsers,
      inactiveUsers,
      clientUsers,
      adminUsers,
      monthlyUsers,
      recentlyActiveUsers,
      // Additional client-specific stats for frontend
      clients: clientUsers,
      active: activeClientUsers,
      inactive: inactiveClientUsers,
      recentSignups: monthlyUsers
    };

    console.log('User statistics:', stats);

    res.json({
      success: true,
      data: {
        stats: stats // Frontend expects data.stats structure
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Bulk user operations (Admin only)
const bulkUserOperation = async (req, res) => {
  try {
    const { operation, userIds, reason } = req.body;

    if (!operation || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        message: 'Operation and userIds array are required'
      });
    }

    // Prevent admin from affecting their own account in bulk operations
    const adminId = req.user._id.toString();
    const filteredUserIds = userIds.filter(id => id !== adminId);

    if (filteredUserIds.length !== userIds.length) {
      console.log('Removed admin ID from bulk operation');
    }

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    switch (operation) {
      case 'deactivate':
        for (const userId of filteredUserIds) {
          try {
            results.processed++;
            
            const user = await User.findById(userId);
            if (!user) {
              results.failed++;
              results.errors.push({ userId, error: 'User not found' });
              continue;
            }

            // Cancel user's reservations
            await Reservation.updateMany(
              {
                client: userId,
                status: { $in: ['pending', 'approved'] },
                isDeleted: false
              },
              {
                $set: {
                  status: 'cancelled',
                  adminNotes: `Cancelled due to bulk user deactivation - ${new Date().toISOString()}`
                }
              }
            );

            user.isActive = false;
            await user.save();
            results.successful++;

          } catch (error) {
            results.failed++;
            results.errors.push({ userId, error: error.message });
          }
        }
        break;

      case 'activate':
        for (const userId of filteredUserIds) {
          try {
            results.processed++;
            
            const user = await User.findById(userId);
            if (!user) {
              results.failed++;
              results.errors.push({ userId, error: 'User not found' });
              continue;
            }

            user.isActive = true;
            await user.save();
            results.successful++;

          } catch (error) {
            results.failed++;
            results.errors.push({ userId, error: error.message });
          }
        }
        break;

      case 'delete':
        for (const userId of filteredUserIds) {
          try {
            results.processed++;
            
            const user = await User.findById(userId);
            if (!user) {
              results.failed++;
              results.errors.push({ userId, error: 'User not found' });
              continue;
            }

            // Handle cascade deletion
            try {
              if (Reservation.handleUserDeletion) {
                await Reservation.handleUserDeletion(userId);
              } else {
                await Reservation.updateMany(
                  { client: userId },
                  { $set: { isDeleted: true, deletedAt: new Date() } }
                );
              }
            } catch (cascadeError) {
              console.log('Cascade deletion warning:', cascadeError.message);
            }
            
            await User.findByIdAndDelete(userId);
            results.successful++;

          } catch (error) {
            results.failed++;
            results.errors.push({ userId, error: error.message });
          }
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid operation. Supported: deactivate, activate, delete'
        });
    }

    res.json({
      success: true,
      message: `Bulk ${operation} operation completed`,
      data: {
        operation,
        reason: reason || 'No reason provided',
        results
      }
    });

  } catch (error) {
    console.error('Bulk user operation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during bulk operation'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  resetUserPassword,
  toggleUserStatus,
  getUserStats,
  bulkUserOperation
};