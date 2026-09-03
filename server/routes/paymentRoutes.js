const express = require('express');
const router = express.Router();
const {
  createPaymongoCheckout,
  verifyPaymongoPayment,
  handlePaymongoWebhook
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

// Protected endpoints for patients, receptionists, and admins
router.post('/paymongo/checkout', protect, authorize('Patient', 'Receptionist', 'Admin'), createPaymongoCheckout);
router.post('/paymongo/verify', protect, authorize('Patient', 'Receptionist', 'Admin'), verifyPaymongoPayment);

// Public webhook endpoint for PayMongo server events
router.post('/paymongo/webhook', handlePaymongoWebhook);

module.exports = router;
