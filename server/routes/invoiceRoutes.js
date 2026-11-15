const express = require('express');
const router = express.Router();
const supabase = require('../config/db');
const { getInvoices, getInvoiceById, createInvoice, updateInvoice, reconcileInvoices, voidInvoice, recordInvoicePayment } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');

// Financial Reconciliation — Accounting, Admin, and Receptionist
router.get('/reconciliation', protect, authorize('Accounting', 'Admin', 'Receptionist'), reconcileInvoices);

router.route('/')
  .get(protect, getInvoices)
  .post(protect, requirePermission('invoice.create'), createInvoice);

router.route('/:id')
  .get(protect, getInvoiceById)
  .put(protect, authorize('Accounting', 'Admin'), updateInvoice);

// Write off an unpaid invoice as bad debt. Separate from PUT /:id so that
// granting this permission does not also allow arbitrary status changes.
router.patch('/:id/write-off', protect, requirePermission('invoice.writeoff'), async (req, res, next) => {
  try {
    const { data: inv, error } = await supabase
      .from('invoices')
      .select('id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error || !inv) return res.status(404).json({ message: 'Invoice not found.' });
    if (!['Unpaid', 'Partial', 'Overdue'].includes(inv.status)) {
      return res.status(400).json({ message: `Only unpaid invoices can be written off (current status: ${inv.status}).` });
    }
    req.body = { status: 'Written Off' };
    return updateInvoice(req, res, next);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Void and Payment routes
router.patch('/:id/void', protect, requirePermission('invoice.void'), voidInvoice);
router.post('/:id/payment', protect, requirePermission('invoice.collect'), recordInvoicePayment);

module.exports = router;
