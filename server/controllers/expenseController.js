const supabase = require('../config/db');

// In-memory fallback if Supabase table is not yet migrated
let fallbackExpenses = [
  { id: 'exp-001', ref_no: 'MERALCO-2026-08', vendor: 'MERALCO', category: 'Utilities', description: 'Monthly electricity bill – August 2026', amount: 18500, due_date: '2026-08-25', paid_date: '2026-08-27', status: 'Paid', payment_method: 'Bank Transfer', reference_no: 'BDO-TXN-2091833' },
  { id: 'exp-002', ref_no: 'MAYNILAD-2026-08', vendor: 'Maynilad Water Services', category: 'Utilities', description: 'Monthly water bill – August 2026', amount: 3200, due_date: '2026-09-05', paid_date: null, status: 'Unpaid', payment_method: 'Auto-Debit', reference_no: '' },
  { id: 'exp-003', ref_no: 'BDO-LEASE-2026-08', vendor: 'BDO Unibank (Landlord)', category: 'Rent', description: 'Monthly clinic lease – Ground Floor, Fano Bldg.', amount: 55000, due_date: '2026-09-01', paid_date: null, status: 'Overdue', payment_method: 'Check', reference_no: '' },
  { id: 'exp-004', ref_no: 'PAYROLL-2026-08', vendor: 'Fano Dental Staff', category: 'Salaries', description: 'Monthly payroll for all clinic staff – August 2026', amount: 132000, due_date: '2026-09-07', paid_date: null, status: 'Unpaid', payment_method: 'Bank Transfer', reference_no: '' },
  { id: 'exp-005', ref_no: 'PLDT-2026-08', vendor: 'PLDT Fiber', category: 'Utilities', description: 'Internet & business landline – August 2026', amount: 4200, due_date: '2026-08-20', paid_date: '2026-08-20', status: 'Paid', payment_method: 'Auto-Debit', reference_no: 'PLDT-AUT-28821' },
  { id: 'exp-006', ref_no: 'SUPPLY-2026-07', vendor: 'Dental Supply Corp.', category: 'Supplies', description: 'Monthly dental consumables restock order', amount: 24300, due_date: '2026-08-10', paid_date: '2026-08-12', status: 'Paid', payment_method: 'Check', reference_no: 'CHK-00219' },
  { id: 'exp-007', ref_no: 'MAINT-2026-08', vendor: 'TechServ Clinic Solutions', category: 'Maintenance', description: 'Dental chair servicing & autoclave calibration', amount: 8750, due_date: '2026-09-12', paid_date: null, status: 'Unpaid', payment_method: 'Cash', reference_no: '' }
];

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
    res.json(expenses || []);
  } catch (error) {
    console.warn('[Expenses Supabase Fallback]', error.message);
    res.json(fallbackExpenses);
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
    fallbackExpenses.unshift(mockCreated);
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
    const index = fallbackExpenses.findIndex(e => e.id === id);
    if (index !== -1) {
      fallbackExpenses[index] = { ...fallbackExpenses[index], ...updates };
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
    fallbackExpenses = fallbackExpenses.filter(e => e.id !== id);
    res.json({ message: 'Expense record deleted.' });
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense
};
