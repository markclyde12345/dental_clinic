const express = require('express');
const router = express.Router();
const {
  getTreatments,
  addTreatment,
  updateTreatment,
  uploadTreatmentImage,
  deleteTreatment
} = require('../controllers/treatmentController');
const { protect, authorize } = require('../middleware/auth');

// Catalog is viewable publicly (for QR booking, patient booking, front desk and admin)
router.route('/')
  .get(getTreatments)
  .post(protect, authorize('Dentist', 'Admin', 'Super Admin'), addTreatment);

router.post('/upload-image', protect, authorize('Dentist', 'Admin', 'Super Admin'), uploadTreatmentImage);

router.route('/:id')
  .put(protect, authorize('Dentist', 'Admin', 'Super Admin'), updateTreatment)
  .delete(protect, authorize('Dentist', 'Admin', 'Super Admin'), deleteTreatment);

module.exports = router;
