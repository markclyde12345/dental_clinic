const express = require('express');
const router = express.Router();
const {
  getMyAppointments,
  startAppointment,
  getAppointmentById,
  getAppointments,
  getOccupiedSlots,
  createAppointment,
  createQrAppointment,
  updateAppointment,
  deleteAppointment
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

// Public endpoints for QR Code scan / Portal booking (no token required)
router.get('/public-slots', getOccupiedSlots);
router.post('/qr-book', createQrAppointment);

router.get('/occupied', protect, getOccupiedSlots);

router.get('/my', protect, authorize('Dentist', 'Dental Assistant'), getMyAppointments);
router.put('/:id/start', protect, authorize('Dentist', 'Dental Assistant'), startAppointment);

router.route('/')
  .get(protect, getAppointments)
  .post(protect, createAppointment);

router.get('/:id', protect, getAppointmentById);

router.route('/:id')
  .put(protect, updateAppointment)
  .delete(protect, deleteAppointment);

module.exports = router;
