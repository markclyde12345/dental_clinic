const express = require('express');
const router = express.Router();
const {
  getTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  addTreatmentPlanItem,
  updateTreatmentPlanItem
} = require('../controllers/treatmentPlanController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getTreatmentPlans)
  .post(protect, authorize('Dentist', 'Receptionist'), createTreatmentPlan);

router.get('/:id', protect, getTreatmentPlan);
router.post('/:id/items', protect, authorize('Dentist', 'Receptionist'), addTreatmentPlanItem);

router.put('/items/:id', protect, authorize('Dentist', 'Receptionist'), updateTreatmentPlanItem);

module.exports = router;
