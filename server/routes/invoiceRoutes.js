const express = require('express');
const router = express.Router();
const { getInvoices, getInvoiceById, createInvoice, updateInvoice, reconcileInvoices, voidInvoice, recordInvoicePayment } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

// Financial Reconciliation — Accounting, Admin, and Receptionist
router.get('/reconciliation', protect, authorize('Accounting', 'Admin', 'Receptionist'), reconcileInvoices);

router.route('/')
  .get(protect, getInvoices)
  .post(protect, authorize('Accounting', 'Admin'), createInvoice);

router.route('/:id')
  .get(protect, getInvoiceById)
  .put(protect, authorize('Accounting', 'Admin'), updateInvoice);


// Void and Payment routes
router.patch('/:id/void', protect, authorize('Accounting', 'Admin'), voidInvoice);
router.post('/:id/payment', protect, authorize('Accounting', 'Admin', 'Receptionist'), recordInvoicePayment);

module.exports = router;
