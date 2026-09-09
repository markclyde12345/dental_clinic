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
    if (status === 'Paid') updateData.paid_at = new Date().toISOString();

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log financial audit actions
    const { logAuditAction } = require('../utils/auditLogger');
    const invoiceRef = id ? id.substring(0, 8).toUpperCase() : id;
    const staffName = req.user?.name || req.user?.email || 'Staff';

    if (status === 'Paid') {
      logAuditAction({
        action: 'PAYMENT_COLLECTED',
        entityType: 'invoice',
        entityId: id,
        details: `${staffName} collected payment of ₱${paid_amount || invoice.amount} for Invoice #${invoiceRef}`,
        metadata: {
          invoice_id: id,
          amount: paid_amount || invoice.amount,
          payment_method: req.body.payment_method || 'Cash / Front Desk'
        },
        req
      });
    } else if (status === 'Written Off') {
      logAuditAction({
        action: 'INVOICE_WRITTEN_OFF',
        entityType: 'invoice',
        entityId: id,
        details: `${staffName} declared Invoice #${invoiceRef} (₱${invoice.amount}) as uncollectible Bad Debt`,
        metadata: {
          invoice_id: id,
          amount: invoice.amount
        },
        req
      });
    }

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Automated Financial Reconciliation Check
// @route   GET /api/invoices/reconciliation
// @access  Private (Accounting, Admin)
const reconcileInvoices = async (req, res) => {
  try {
    // 1. Fetch completed appointments
    const { data: completedAppts, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, patient_id,
        patient:patient_id ( id, name, email ),
        treatment:treatment_id ( id, name, price )
      `)
      .eq('status', 'Completed');

    if (apptErr) throw apptErr;

    // 2. Fetch all invoices
    const { data: allInvoices, error: invErr } = await supabase
      .from('invoices')
      .select('*');

    if (invErr) throw invErr;

    // 3. Fetch all recorded payments
    const { data: allPayments } = await supabase
      .from('payments')
      .select('*');

    const paymentsByInvoice = new Map();
    (allPayments || []).forEach(p => {
      const invId = p.invoice_id;
      if (invId) {
        const sum = paymentsByInvoice.get(invId) || 0;
        paymentsByInvoice.set(invId, sum + (Number(p.amount) || 0));
      }
    });

    const invoiceByApptId = new Map();
    (allInvoices || []).forEach(inv => {
      if (inv.appointment_id) {
        invoiceByApptId.set(inv.appointment_id, inv);
      }
    });

    // Check for unbilled completed appointments
    const unbilledAppointments = [];
    (completedAppts || []).forEach(appt => {
      if (!invoiceByApptId.has(appt.id)) {
        unbilledAppointments.push({
          appointmentId: appt.id,
          date: appt.appointment_date,
          patientName: appt.patient?.name || 'Unknown Patient',
          treatmentName: appt.treatment?.name || 'General Consultation',
          estimatedAmount: Number(appt.treatment?.price) || 0
        });
      }
    });

    // Check for payment discrepancies on invoices
    const discrepancies = [];
    let totalBilled = 0;
    let totalCollected = 0;
    let totalUnpaid = 0;
    let totalWrittenOff = 0;

    (allInvoices || []).forEach(inv => {
      const billed = Number(inv.amount) || 0;
      totalBilled += billed;

      if (inv.status === 'Paid') {
        totalCollected += billed;
      } else if (inv.status === 'Written Off') {
        totalWrittenOff += billed;
      } else {
        totalUnpaid += billed;
      }

      // Check if recorded payments match invoice marked as Paid
      const recordedPaid = paymentsByInvoice.get(inv.id);
      if (inv.status === 'Paid' && recordedPaid !== undefined && Math.abs(recordedPaid - billed) > 1) {
        discrepancies.push({
          invoiceId: inv.id,
          type: 'PAYMENT_MISMATCH',
          description: `Invoice #${inv.id.slice(0, 8)} billed at ₱${billed.toFixed(2)}, recorded payments sum to ₱${recordedPaid.toFixed(2)}`,
          billedAmount: billed,
          recordedPaidAmount: recordedPaid,
          difference: billed - recordedPaid
        });
      }
    });

    const isReconciled = unbilledAppointments.length === 0 && discrepancies.length === 0;

    // Log reconciliation run to audit ONLY if manually triggered (e.g. ?log=true)
    if (req.query && (req.query.log === 'true' || req.query.manual === 'true')) {
      const { logAuditAction } = require('../utils/auditLogger');
      logAuditAction({
        action: 'FINANCIAL_RECONCILIATION_RUN',
        entityType: 'invoice',
        entityId: 'reconciliation_summary',
        details: `${req.user?.name || 'Accountant'} performed financial reconciliation: ${isReconciled ? 'CLEAN (No discrepancies)' : `${unbilledAppointments.length} unbilled appts, ${discrepancies.length} mismatches`}`,
        metadata: {
          totalBilled,
          totalCollected,
          totalUnpaid,
          unbilledCount: unbilledAppointments.length,
          discrepancyCount: discrepancies.length,
          isReconciled
        },
        req
      }).catch(() => {});
    }

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      isReconciled,
      summary: {
        totalBilled,
        totalCollected,
        totalUnpaid,
        totalWrittenOff,
        completedAppointmentsCount: (completedAppts || []).length,
        totalInvoicesCount: (allInvoices || []).length,
        unbilledAppointmentsCount: unbilledAppointments.length,
        discrepancyCount: discrepancies.length
      },
      unbilledAppointments,
      discrepancies
    });
  } catch (error) {
    console.error('[Reconciliation Error]', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a single invoice by ID
// @route   GET /api/invoices/:id
// @access  Private
const getInvoiceById = async (req, res) => {
  const id = String(req.params.id || '').trim();
  try {
    let query = supabase
      .from('invoices')
      .select(`
        id, amount, status, issued_at, paid_at, appointment_id, patient_id,
        patient:patient_id ( id, name, email, contact_number ),
        appointment:appointment_id ( id, appointment_date, notes, treatment:treatment_id ( id, name, price ) )
      `)
      .eq('id', id);

    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data: invoice, error } = await query.maybeSingle();
    if (error || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getInvoices, getInvoiceById, createInvoice, updateInvoice, reconcileInvoices };
