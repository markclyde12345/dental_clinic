const express = require('express');
const router = express.Router();
const {
  getAppointmentPrescriptions,
  addPrescription
} = require('../controllers/prescriptionController');
const { protect, authorize } = require('../middleware/auth');

// Mounted at /api/appointments
router.get('/:id/prescriptions', protect, getAppointmentPrescriptions);
router.post('/:id/prescriptions', protect, authorize('Dentist', 'Dental Assistant'), addPrescription);

module.exports = router;
