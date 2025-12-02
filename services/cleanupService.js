const cron = require('node-cron');
const Reservation = require('../models/Reservation');
const Equipment = require('../models/Equipment');

class ReservationCleanupService {
  constructor() {
    this.isRunning = false;
  }

  // Start the cleanup service with scheduled tasks
  start() {
    if (this.isRunning) {
      console.log('Reservation cleanup service is already running');
      return;
    }

    console.log('Starting Reservation Cleanup Service...');

    // Run every hour to check for expired reservations
    cron.schedule('0 * * * *', async () => {
      console.log('Running hourly reservation expiration check...');
      await this.checkAndExpireReservations();
    });

    // Run daily cleanup at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Running daily reservation cleanup...');
      await this.performDailyCleanup();
    });

    // Run weekly deep cleanup on Sundays at 3 AM
    cron.schedule('0 3 * * 0', async () => {
      console.log('Running weekly deep reservation cleanup...');
      await this.performWeeklyDeepCleanup();
    });

    this.isRunning = true;
    console.log('Reservation cleanup service started successfully');
  }

  // Stop the cleanup service
  stop() {
    this.isRunning = false;
    console.log('Reservation cleanup service stopped');
  }

  // Check and expire overdue reservations
  async checkAndExpireReservations() {
    try {
      console.log('Checking for expired reservations...');
      
      const results = await Reservation.autoExpireReservations();
      
      if (results.expired > 0) {
        console.log(`✅ Auto-expired ${results.expired} reservations`);
        console.log(`📦 Released equipment back to available pool`);
      }
      
      if (results.errors.length > 0) {
        console.error(`❌ ${results.errors.length} errors during expiration:`, results.errors);
      }
      
      // Update equipment status for orphaned items
      await this.updateOrphanedEquipmentStatus();
      
      return results;
      
    } catch (error) {
      console.error('Error in reservation expiration check:', error);
      throw error;
    }
  }

  // Daily cleanup tasks
  async performDailyCleanup() {
    try {
      console.log('Performing daily cleanup tasks...');
      
      // 1. Check for expired reservations
      const expirationResults = await this.checkAndExpireReservations();
      
      // 2. Cleanup old rejected reservations (older than 30 days)
      const cleanupResults = await this.cleanupOldRejectedReservations();
      
      // 3. Validate equipment availability consistency
      const validationResults = await this.validateEquipmentConsistency();
      
      console.log('Daily cleanup completed:', {
        expired: expirationResults.expired,
        cleaned: cleanupResults.cleaned,
        validated: validationResults.corrected
      });
      
    } catch (error) {
      console.error('Error in daily cleanup:', error);
    }
  }

  // Weekly deep cleanup
  async performWeeklyDeepCleanup() {
    try {
      console.log('Performing weekly deep cleanup...');
      
      // 1. Daily cleanup first
      await this.performDailyCleanup();
      
      // 2. Archive old completed reservations (older than 6 months)
      const archiveResults = await this.archiveOldCompletedReservations();
      
      // 3. Full equipment availability recalculation
      const recalcResults = await this.recalculateAllEquipmentAvailability();
      
      console.log('Weekly deep cleanup completed:', {
        archived: archiveResults.archived,
        recalculated: recalcResults.updated
      });
      
    } catch (error) {
      console.error('Error in weekly deep cleanup:', error);
    }
  }

  // Cleanup old rejected reservations
  async cleanupOldRejectedReservations() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const oldRejected = await Reservation.find({
        status: 'rejected',
        rejectedAt: { $lt: thirtyDaysAgo },
        isDeleted: false
      });
      
      let cleaned = 0;
      for (const reservation of oldRejected) {
        reservation.isDeleted = true;
        reservation.deletedAt = new Date();
        reservation.deletionReason = 'system_cleanup';
        await reservation.save();
        cleaned++;
      }
      
      return { cleaned };
      
    } catch (error) {
      console.error('Error cleaning old rejected reservations:', error);
      return { cleaned: 0 };
    }
  }

  // Archive old completed reservations
  async archiveOldCompletedReservations() {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const oldCompleted = await Reservation.find({
        status: { $in: ['completed', 'expired'] },
        $or: [
          { completedAt: { $lt: sixMonthsAgo } },
          { expiredAt: { $lt: sixMonthsAgo } }
        ],
        isDeleted: false
      });
      
      let archived = 0;
      for (const reservation of oldCompleted) {
        // Instead of deleting, we just mark as archived
        reservation.isDeleted = true;
        reservation.deletedAt = new Date();
        reservation.deletionReason = 'system_cleanup';
        await reservation.save();
        archived++;
      }
      
      return { archived };
      
    } catch (error) {
      console.error('Error archiving old completed reservations:', error);
      return { archived: 0 };
    }
  }

  // Update equipment status for items that should be available
  async updateOrphanedEquipmentStatus() {
    try {
      const equipmentItems = await Equipment.find({
        status: 'rented',
        available: { $gt: 0 }
      });
      
      let updated = 0;
      for (const item of equipmentItems) {
        // Check if there are any active reservations for this equipment
        const activeReservations = await Reservation.find({
          'equipment.item': item._id,
          status: { $in: ['approved', 'active'] },
          isDeleted: false
        });
        
        if (activeReservations.length === 0) {
          item.status = 'available';
          await item.save();
          updated++;
        }
      }
      
      return { updated };
      
    } catch (error) {
      console.error('Error updating orphaned equipment status:', error);
      return { updated: 0 };
    }
  }

  // Validate and correct equipment availability consistency
  async validateEquipmentConsistency() {
    try {
      const equipmentItems = await Equipment.find({});
      let corrected = 0;
      
      for (const item of equipmentItems) {
        // Calculate current reservations
        const activeReservations = await Reservation.find({
          'equipment.item': item._id,
          status: { $in: ['approved', 'active'] },
          isDeleted: false
        });
        
        let totalReserved = 0;
        for (const reservation of activeReservations) {
          const equipmentItem = reservation.equipment.find(
            eq => eq.item.toString() === item._id.toString()
          );
          if (equipmentItem) {
            totalReserved += equipmentItem.quantity;
          }
        }
        
        const shouldBeAvailable = Math.max(0, item.quantity - totalReserved);
        
        if (item.available !== shouldBeAvailable) {
          console.log(`Correcting equipment ${item.name}: ${item.available} → ${shouldBeAvailable}`);
          item.available = shouldBeAvailable;
          
          // Update status based on availability
          if (shouldBeAvailable > 0) {
            item.status = 'available';
          } else if (totalReserved > 0) {
            item.status = 'rented';
          }
          
          await item.save();
          corrected++;
        }
      }
      
      return { corrected };
      
    } catch (error) {
      console.error('Error validating equipment consistency:', error);
      return { corrected: 0 };
    }
  }

  // Recalculate all equipment availability from scratch
  async recalculateAllEquipmentAvailability() {
    try {
      const equipmentItems = await Equipment.find({});
      let updated = 0;
      
      for (const item of equipmentItems) {
        const result = await this.recalculateEquipmentAvailability(item._id);
        if (result.updated) {
          updated++;
        }
      }
      
      return { updated };
      
    } catch (error) {
      console.error('Error recalculating all equipment availability:', error);
      return { updated: 0 };
    }
  }

  // Recalculate availability for specific equipment
  async recalculateEquipmentAvailability(equipmentId) {
    try {
      const equipment = await Equipment.findById(equipmentId);
      if (!equipment) {
        return { updated: false, error: 'Equipment not found' };
      }
      
      // Get all active reservations for this equipment
      const activeReservations = await Reservation.find({
        'equipment.item': equipmentId,
        status: { $in: ['approved', 'active'] },
        isDeleted: false
      });
      
      let totalReserved = 0;
      for (const reservation of activeReservations) {
        const equipmentItem = reservation.equipment.find(
          eq => eq.item.toString() === equipmentId.toString()
        );
        if (equipmentItem) {
          totalReserved += equipmentItem.quantity;
        }
      }
      
      const newAvailable = Math.max(0, equipment.quantity - totalReserved);
      const wasUpdated = equipment.available !== newAvailable;
      
      if (wasUpdated) {
        equipment.available = newAvailable;
        
        // Update status
        if (newAvailable > 0) {
          equipment.status = 'available';
        } else if (totalReserved > 0) {
          equipment.status = 'rented';
        }
        
        await equipment.save();
      }
      
      return {
        updated: wasUpdated,
        previousAvailable: equipment.available,
        newAvailable,
        totalReserved
      };
      
    } catch (error) {
      console.error(`Error recalculating availability for equipment ${equipmentId}:`, error);
      return { updated: false, error: error.message };
    }
  }

  // Manual trigger for immediate cleanup (useful for API endpoints)
  async runImmediateCleanup() {
    try {
      console.log('Running immediate cleanup...');
      
      const results = await this.checkAndExpireReservations();
      await this.updateOrphanedEquipmentStatus();
      await this.validateEquipmentConsistency();
      
      return {
        success: true,
        expired: results.expired,
        processed: results.processed,
        errors: results.errors
      };
      
    } catch (error) {
      console.error('Error in immediate cleanup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get cleanup service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      lastRun: this.lastRun
    };
  }
}

// Create singleton instance
const cleanupService = new ReservationCleanupService();

module.exports = cleanupService;