const express = require('express');
const router = express.Router();
const {
  getTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  addTreatmentPlanItem,
  updateTreatmentPlanItem,
  deleteTreatmentPlan,
  sendTreatmentPlanEmail
} = require('../controllers/treatmentPlanController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getTreatmentPlans)
  .post(protect, authorize('Dentist', 'Receptionist', 'Admin'), createTreatmentPlan);

router.route('/:id')
  .get(protect, getTreatmentPlan)
  .delete(protect, authorize('Dentist', 'Receptionist', 'Admin'), deleteTreatmentPlan);

router.post('/:id/items', protect, authorize('Dentist', 'Receptionist', 'Admin'), addTreatmentPlanItem);
router.post('/:id/send-email', protect, authorize('Dentist', 'Receptionist', 'Admin'), sendTreatmentPlanEmail);

router.put('/items/:id', protect, authorize('Dentist', 'Receptionist', 'Admin'), updateTreatmentPlanItem);

module.exports = router;
