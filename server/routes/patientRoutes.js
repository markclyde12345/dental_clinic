const express = require('express');
const router = express.Router();
const { getPatients, createPatientProfile, getPatientCount, getPatientWithHistory, updatePatientProfile } = require('../controllers/patientController');
const { getPatientPrescriptions } = require('../controllers/prescriptionController');
const { protect, authorize } = require('../middleware/auth');

router.get('/count', getPatientCount);

router.route('/')
  .get(protect, authorize('Admin', 'Receptionist', 'Dentist', 'Dental Assistant'), getPatients)
  .post(protect, authorize('Patient', 'Admin', 'Receptionist'), createPatientProfile);

router.route('/:id')
  .put(protect, authorize('Admin', 'Receptionist'), updatePatientProfile);

router.get('/:id/prescriptions', protect, authorize('Dentist', 'Dental Assistant', 'Receptionist', 'Patient'), getPatientPrescriptions);
router.get('/:id/history', protect, authorize('Admin', 'Receptionist', 'Dentist', 'Dental Assistant', 'Patient'), getPatientWithHistory);

module.exports = router;
