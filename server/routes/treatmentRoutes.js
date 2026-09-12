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

router.route('/')
  .get(protect, getTreatments)
  .post(protect, authorize('Dentist', 'Admin'), addTreatment);

router.post('/upload-image', protect, authorize('Dentist', 'Admin'), uploadTreatmentImage);

router.route('/:id')
  .put(protect, authorize('Dentist', 'Admin'), updateTreatment)
  .delete(protect, authorize('Dentist', 'Admin'), deleteTreatment);

module.exports = router;
