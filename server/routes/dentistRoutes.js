const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardStats,
  getAppointmentsForDentist,
  getPatientQueue,
  callNextPatient,
  getPatientRecord,
  updatePatientRecord,
  addPatientImage,
  deletePatientImage,
  getDentalChart,
  saveDentalChart,
  getPrescriptions,
  createPrescription,
  getFollowUps,
  createFollowUp,
  getDentistReports,
  getNotifications
} = require('../controllers/dentistController');

// All dentist routes require Dentist authentication
router.use(protect, authorize('Dentist', 'Dental Assistant', 'Admin'));

// Dashboard stats & today overview
router.get('/dashboard', getDashboardStats);

// Appointments
router.get('/appointments', getAppointmentsForDentist);

// Patient Queue
router.get('/queue', getPatientQueue);
router.post('/queue/call-next', callNextPatient);

// Patient Profile & Records
router.get('/patients/:id', getPatientRecord);
router.patch('/patients/:id', updatePatientRecord);
router.post('/patients/:id/images', addPatientImage);
router.delete('/patients/:id/images/:imgId', deletePatientImage);

// Dental Charting
router.get('/chart/:patientId', getDentalChart);
router.post('/chart/:patientId', saveDentalChart);

// Prescriptions
router.get('/prescriptions', getPrescriptions);
router.post('/prescriptions', createPrescription);

// Follow-ups
router.get('/followups', getFollowUps);
router.post('/followups', createFollowUp);

// Reports & Statistics
router.get('/reports', getDentistReports);

// Notifications
router.get('/notifications', getNotifications);

module.exports = router;
