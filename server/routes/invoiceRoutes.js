const express = require('express');
const router = express.Router();
const { getInvoices, createInvoice } = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getInvoices)
  .post(protect, authorize('Accounting', 'Admin', 'Receptionist'), createInvoice);

module.exports = router;
