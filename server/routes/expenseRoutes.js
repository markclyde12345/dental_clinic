const express = require('express');
const router = express.Router();
const { getExpenses, createExpense, updateExpense, deleteExpense } = require('../controllers/expenseController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, authorize('Accounting', 'Admin'), getExpenses)
  .post(protect, authorize('Accounting', 'Admin'), createExpense);

router.route('/:id')
  .put(protect, authorize('Accounting', 'Admin'), updateExpense)
  .delete(protect, authorize('Accounting', 'Admin'), deleteExpense);

module.exports = router;
