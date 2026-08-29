const supabase = require('../config/db');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getInvoices = async (req, res) => {
  try {
    let query = supabase
      .from('invoices')
      .select(`
        id, amount, status, issued_at, paid_at, appointment_id,
        patient:patient_id ( id, name, email ),
        appointment:appointment_id ( id, appointment_date, notes )
      `);

    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data: invoices, error } = await query.order('issued_at', { ascending: false });

    if (error) throw error;

    // Provide legacy mapping fields so UI doesn't break
    const mapped = invoices.map(inv => ({
      ...inv,
      total_amount: inv.amount,
      is_paid: inv.status === 'Paid',
      created_at: inv.issued_at
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create an invoice
// @route   POST /api/invoices
// @access  Private (Accounting/Admin)
const createInvoice = async (req, res) => {
  const { patient_id, patientId, appointment_id, appointmentId, amount, totalAmount, status } = req.body;
  try {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        patient_id: patient_id || patientId,
        appointment_id: appointment_id || appointmentId || null,
        amount: amount || totalAmount,
        status: status || 'Unpaid'
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update an invoice status
// @route   PUT /api/invoices/:id
// @access  Private (Accounting/Admin)
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paid_amount } = req.body;

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (paid_amount !== undefined) updateData.paid_amount = parseFloat(paid_amount);
    if (status === 'Paid') updateData.paid_at = new Date().toISOString();

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getInvoices, createInvoice, updateInvoice };
