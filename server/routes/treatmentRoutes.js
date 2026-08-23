const express = require('express');
const router = express.Router();
const { getTreatments, addTreatment, deleteTreatment } = require('../controllers/treatmentController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getTreatments)
  .post(protect, authorize('Dentist', 'Admin'), addTreatment);

router.route('/:id')
  .delete(protect, authorize('Dentist', 'Admin'), deleteTreatment);

module.exports = router;
