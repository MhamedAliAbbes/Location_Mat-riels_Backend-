const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const validation = require('../middleware/validation');

// --- Reservation Routes ---

// GET /api/reservations/statistics (Admin only)
// This must come before /:id to avoid "statistics" being treated as an ID
router.get(
  '/statistics',
  authenticateToken,
  requireAdmin,
  reservationController.getReservationStats
);

// GET /api/reservations (Get all reservations for a user, or all for admin)
router.get(
  '/',
  authenticateToken,
  reservationController.getAllReservations
);

// GET /api/reservations/:id (Get a single reservation by ID)
router.get(
  '/:id',
  authenticateToken,
  validation.validateObjectId('id'),
  reservationController.getReservationById
);

// POST /api/reservations (Create a new reservation)
router.post(
  '/',
  authenticateToken,
  validation.validateReservation,
  validation.handleValidationErrors,
  reservationController.createReservation
);

// PATCH /api/reservations/:id/approve (Admin approves a reservation)
router.patch(
  '/:id/approve',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  reservationController.approveReservation
);

// PATCH /api/reservations/:id/reject (Admin rejects a reservation)
router.patch(
  '/:id/reject',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  reservationController.rejectReservation
);

// PATCH /api/reservations/:id/cancel (User or Admin cancels a reservation)
router.patch(
  '/:id/cancel',
  authenticateToken,
  validation.validateObjectId('id'),
  reservationController.cancelReservation
);

// PATCH /api/reservations/:id/active (Admin marks a reservation as active)
router.patch(
  '/:id/active',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  reservationController.markReservationActive
);

// PATCH /api/reservations/:id/complete (Admin completes a reservation)
router.patch(
  '/:id/complete',
  authenticateToken,
  requireAdmin,
  validation.validateObjectId('id'),
  reservationController.completeReservation
);

module.exports = router;