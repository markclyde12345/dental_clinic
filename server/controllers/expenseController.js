const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');

const EXPENSES_FILE = path.join(__dirname, '..', 'data', 'expenses.json');

function loadExpensesFromFile() {
  try {
    if (fs.existsSync(EXPENSES_FILE)) {
      const raw = fs.readFileSync(EXPENSES_FILE, 'utf8');
      return JSON.parse(raw) || [];
    }
  } catch (e) {
    console.error('Failed to read expenses.json:', e);
  }
  return [];
}

function saveExpensesToFile(data) {
  try {
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write expenses.json:', e);
  }
}

// In-memory / file fallback store (starts empty — no mock data)
let fallbackExpenses = loadExpensesFromFile();

// @desc    Get all clinic expenses/bills
// @route   GET /api/expenses
// @access  Private (Accounting, Admin)
const getExpenses = async (req, res) => {
  try {
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .order('due_date', { ascending: false });

    if (error) throw error;
    if (Array.isArray(expenses) && expenses.length > 0) {
      return res.json(expenses);
    }
    fallbackExpenses = loadExpensesFromFile();
    res.json(fallbackExpenses || []);
  } catch (error) {
    console.warn('[Expenses Supabase Fallback]', error.message);
    fallbackExpenses = loadExpensesFromFile();
    res.json(fallbackExpenses || []);
  }
};

// @desc    Add a clinic expense/bill
// @route   POST /api/expenses
// @access  Private (Accounting, Admin)
const createExpense = async (req, res) => {
  const { ref_no, ref, vendor, category, description, desc, amount, due_date, dueDate, paid_date, paidDate, status, payment_method, payMethod, reference_no, payRef } = req.body;
  const newRow = {
    ref_no: ref_no || ref || `BILL-${Date.now()}`,
    vendor: vendor || 'Vendor',
    category: category || 'Utilities',
    description: description || desc || '',
    amount: parseFloat(amount) || 0,
    due_date: due_date || dueDate || new Date().toISOString().slice(0, 10),
    paid_date: paid_date || paidDate || null,
    status: status || 'Unpaid',
    payment_method: payment_method || payMethod || null,
    reference_no: reference_no || payRef || null
  };

  try {
    const { data: inserted, error } = await supabase
      .from('expenses')
      .insert([newRow])
      .select()
      .maybeSingle();

    if (error) throw error;
    res.status(201).json(inserted);
  } catch (error) {
    console.warn('[Create Expense Supabase Fallback]', error.message);
    const mockCreated = { id: `exp-${Date.now()}`, ...newRow };
    fallbackExpenses = loadExpensesFromFile();
    fallbackExpenses.unshift(mockCreated);
    saveExpensesToFile(fallbackExpenses);
    res.status(201).json(mockCreated);
  }
};

// @desc    Update / Settle a clinic expense/bill
// @route   PUT /api/expenses/:id
// @access  Private (Accounting, Admin)
const updateExpense = async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  try {
    const { data: updated, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json(updated);
  } catch (error) {
    console.warn('[Update Expense Supabase Fallback]', error.message);
    fallbackExpenses = loadExpensesFromFile();
    const index = fallbackExpenses.findIndex(e => e.id === id);
    if (index !== -1) {
      fallbackExpenses[index] = { ...fallbackExpenses[index], ...updates };
      saveExpensesToFile(fallbackExpenses);
      return res.json(fallbackExpenses[index]);
    }
    res.json({ id, ...updates });
  }
};

// @desc    Delete a clinic expense
// @route   DELETE /api/expenses/:id
// @access  Private (Accounting, Admin)
const deleteExpense = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Expense record deleted successfully.' });
  } catch (error) {
    console.warn('[Delete Expense Supabase Fallback]', error.message);
    fallbackExpenses = loadExpensesFromFile();
    fallbackExpenses = fallbackExpenses.filter(e => e.id !== id);
    saveExpensesToFile(fallbackExpenses);
    res.json({ message: 'Expense record deleted.' });
  }
};

// @desc    Clear all clinic expenses/bills
// @route   DELETE /api/expenses
// @access  Private (Accounting, Admin)
const clearAllExpenses = async (req, res) => {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;
    fallbackExpenses = [];
    saveExpensesToFile(fallbackExpenses);
    res.json({ message: 'All expense records cleared successfully.' });
  } catch (error) {
    console.warn('[Clear All Expenses Supabase Fallback]', error.message);
    fallbackExpenses = [];
    saveExpensesToFile(fallbackExpenses);
    res.json({ message: 'All expense records cleared.' });
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  clearAllExpenses
};
