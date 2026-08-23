const express = require('express');
const router = express.Router();
const {
  getAppointmentTreatments,
  addAppointmentTreatment,
  updateAppointmentTreatment,
  deleteAppointmentTreatment
} = require('../controllers/appointmentTreatmentController');
const { protect, authorize } = require('../middleware/auth');

router.get('/:id/treatments', protect, getAppointmentTreatments);
router.post('/:id/treatments', protect, authorize('Dentist', 'Dental Assistant'), addAppointmentTreatment);

router.route('/:id')
  .put(protect, authorize('Dentist', 'Dental Assistant'), updateAppointmentTreatment)
  .delete(protect, authorize('Dentist', 'Dental Assistant'), deleteAppointmentTreatment);

module.exports = router;
