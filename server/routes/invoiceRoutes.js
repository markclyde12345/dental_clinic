const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice, updateInvoice } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getInvoices)
  .post(protect, authorize('Accounting', 'Admin', 'Receptionist'), createInvoice);

router.route('/:id')
  .put(protect, authorize('Accounting', 'Admin', 'Receptionist'), updateInvoice);

module.exports = router;
