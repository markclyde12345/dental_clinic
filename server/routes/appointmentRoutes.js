const express = require('express');
const router = express.Router();
const {
  getMyAppointments,
  startAppointment,
  getAppointmentById,
  getAppointments,
  getOccupiedSlots,
  createAppointment,
  updateAppointment,
  deleteAppointment
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

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
