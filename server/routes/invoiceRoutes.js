const express = require('express');
const router = express.Router();
const { getInvoices, getInvoiceById, createInvoice, updateInvoice, reconcileInvoices } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

// Financial Reconciliation — Accounting and Admin only
router.get('/reconciliation', protect, authorize('Accounting', 'Admin'), reconcileInvoices);

router.route('/')
  .get(protect, getInvoices)
  .post(protect, authorize('Accounting', 'Admin'), createInvoice);

router.route('/:id')
  .get(protect, getInvoiceById)
  .put(protect, authorize('Accounting', 'Admin'), updateInvoice);

module.exports = router;
