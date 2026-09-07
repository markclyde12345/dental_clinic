const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice, reconcileInvoices } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

// Financial Reconciliation — Accounting and Admin only
router.get('/reconciliation', protect, authorize('Accounting', 'Admin'), reconcileInvoices);

router.route('/')
  .get(protect, getInvoices)
  .post(protect, authorize('Accounting', 'Admin'), createInvoice);

router.route('/:id')
  .put(protect, authorize('Accounting', 'Admin'), updateInvoice);

module.exports = router;
