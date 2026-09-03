const supabase = require('../config/db');

// @desc    Get all invoices
// @route   GET /api/invoices
// @access  Private
const getInvoices = async (req, res) => {
  try {
    // If patient, auto-reconcile any appointments that are missing invoices
    if (req.user.role === 'Patient' && req.user.id) {
      try {
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, treatment_id, appointment_date, status, treatment:treatment_id ( id, name, price )')
          .eq('patient_id', req.user.id)
          .neq('status', 'Cancelled');

        if (appts && appts.length > 0) {
          const { data: existingInvs } = await supabase
            .from('invoices')
            .select('appointment_id')
            .eq('patient_id', req.user.id);
          const existingApptIds = new Set((existingInvs || []).map(i => i.appointment_id));

          for (const a of appts) {
            if (!existingApptIds.has(a.id)) {
              const price = a.treatment?.price ? parseFloat(a.treatment.price) : 0;
              await supabase.from('invoices').insert([{
                patient_id: req.user.id,
                appointment_id: a.id,
                amount: price,
                status: 'Unpaid'
              }]);
            }
          }
        }
      } catch (recErr) {
        console.error('[Invoice Reconcile Error]', recErr.message);
      }
    }

    let query = supabase
      .from('invoices')
      .select(`
        id, amount, status, issued_at, paid_at, appointment_id,
        patient:patient_id ( id, name, email ),
        appointment:appointment_id ( id, appointment_date, notes, treatment:treatment_id ( id, name, price ) )
      `);

    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data: invoices, error } = await query.order('issued_at', { ascending: false });

    if (error) throw error;

    // Provide legacy mapping fields and overdue calculation
    const mapped = invoices.map(inv => {
      const issuedTime = inv.issued_at || inv.created_at;
      const daysOld = issuedTime
        ? Math.max(0, Math.floor((Date.now() - new Date(issuedTime).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      const isOverdue = inv.status === 'Unpaid' && daysOld > 30;
      return {
        ...inv,
        total_amount: inv.amount,
        is_paid: inv.status === 'Paid',
        created_at: inv.issued_at,
        days_old: daysOld,
        is_overdue: isOverdue
      };
    });

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
