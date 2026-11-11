
const fs = require('fs');
const path = require('path');
const { getCloudStore, setCloudStore, getCloudStoreSync } = require('../utils/cloudStore');
const INVOICE_SUPP_PATH = path.join(__dirname, '..', 'data', 'invoice_supplements.json');

// Warm invoice_supplements from Supabase
getCloudStore('invoice_supplements', {}).catch(() => {});

function loadInvoiceSupplements() {
  try {
    return getCloudStoreSync('invoice_supplements', {}) || {};
  } catch {
    return {};
  }
}

async function loadInvoiceSupplementsAsync() {
  try {
    return (await getCloudStore('invoice_supplements', {})) || {};
  } catch {
    return loadInvoiceSupplements();
  }
}

function saveInvoiceSupplements(data) {
  try {
    setCloudStore('invoice_supplements', data).catch(() => {});
  } catch (err) {
    console.error('Failed to save invoice supplements:', err);
  }
}

const supabase = require('../config/db');
const sendEmail = require('../utils/emailService');

// ── Invoice notification email ─────────────────────────────────────────────
const sendInvoiceEmail = async (patientEmail, patientName, invoiceId, amount, status, treatmentName) => {
  try {
    const ref = invoiceId ? invoiceId.slice(0, 8).toUpperCase() : 'N/A';
    const amtFormatted = parseFloat(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const configs = {
      Unpaid: {
        subject: `🧾 Invoice Issued — ₱${amtFormatted} Due | Fano Dental Clinic`,
        badgeLabel: 'Invoice Issued — Payment Due',
        badgeColor: '#92400e',
        badgeBg: '#fef3c7',
        message: `An invoice of <strong>₱${amtFormatted}</strong> has been issued for your recent dental visit (${treatmentName || 'Dental Service'}). Please settle your balance at the clinic front desk or through any accepted payment method at your earliest convenience.`,
        cta: 'View My Invoice'
      },
      Paid: {
        subject: `✅ Payment Confirmed — Invoice #${ref} | Fano Dental Clinic`,
        badgeLabel: 'Payment Received — Thank You!',
        badgeColor: '#065f46',
        badgeBg: '#d1fae5',
        message: `We have received your payment of <strong>₱${amtFormatted}</strong> for Invoice #${ref}. Thank you for settling your balance! You may log in to your patient dashboard to download your official receipt.`,
        cta: 'View Receipt'
      }
    };

    const cfg = configs[status];
    if (!cfg || !patientEmail) return;

    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${cfg.subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(11,60,77,0.10);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0b3c4d 0%,#14536a 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#c59b27;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Fano Dental Clinic</p>
              <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Billing Notification</h1>
            </td>
          </tr>
          <!-- Status Badge -->
          <tr>
            <td style="padding:28px 40px 8px 40px;text-align:center;">
              <span style="display:inline-block;background:${cfg.badgeBg};color:${cfg.badgeColor};font-size:15px;font-weight:700;padding:10px 28px;border-radius:50px;border:1.5px solid ${cfg.badgeColor}44;letter-spacing:0.5px;">
                ${cfg.badgeLabel}
              </span>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:20px 40px 4px 40px;">
              <p style="margin:0;font-size:16px;color:#1e293b;">Hello, <strong>${patientName || 'Patient'}</strong>,</p>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding:12px 40px 20px 40px;">
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.7;">${cfg.message}</p>
            </td>
          </tr>
          <!-- Invoice Details -->
          <tr>
            <td style="padding:0 40px 28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
                <tr>
                  <td style="background:#0b3c4d;padding:12px 20px;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#c59b27;letter-spacing:1.5px;text-transform:uppercase;">Invoice Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="4" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#64748b;width:140px;font-weight:600;">&#128203; Reference #</td>
                        <td style="font-size:13px;color:#1e293b;font-family:monospace;">${ref}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#129463; Service</td>
                        <td style="font-size:13px;color:#1e293b;">${treatmentName || 'Dental Service'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#128181; Amount</td>
                        <td style="font-size:13px;color:#0b3c4d;font-weight:700;">&#8369;${amtFormatted}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#128203; Status</td>
                        <td style="font-size:13px;color:${cfg.badgeColor};font-weight:700;">${status}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 40px 28px 40px;text-align:center;">
              <a href="${appUrl}/pages/patient-dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#0b3c4d,#14536a);color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">${cfg.cta} &#8594;</a>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0;"></td></tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#0b3c4d;font-weight:700;">Fano Dental Clinic</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                &#128205; 123 Dental Street, Your City, Philippines<br>
                &#128222; (02) 8-XXX-XXXX &nbsp;|&nbsp; &#9993;&#65039; ${process.env.GMAIL_USER || 'clinic@fanodental.com'}<br>
                <span style="font-size:11px;">This is an automated notification. Please do not reply to this email.</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const plainText = `Fano Dental Clinic — ${cfg.badgeLabel}\n\nHello ${patientName || 'Patient'},\n\n${cfg.message.replace(/<[^>]+>/g, '')}\n\nInvoice Details:\n- Reference #: ${ref}\n- Service: ${treatmentName || 'Dental Service'}\n- Amount: ₱${amtFormatted}\n- Status: ${status}\n\nFano Dental Clinic\n123 Dental Street, Your City, Philippines`;

    await sendEmail(patientEmail, cfg.subject, htmlContent, plainText);
    console.log(`📧 [Invoice Email] "${status}" email sent to ${patientEmail} for Invoice #${ref}`);
  } catch (err) {
    console.error('[Invoice Email Error]', err.message);
  }
};

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
    const supplements = await loadInvoiceSupplementsAsync();
    const mapped = invoices.map(inv => {
      const supp = supplements[inv.id] || {};
      const issuedTime = inv.issued_at || inv.created_at;
      const daysOld = issuedTime
        ? Math.max(0, Math.floor((Date.now() - new Date(issuedTime).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      const isOverdue = inv.status === 'Unpaid' && daysOld > 30;
      const paidAmount = supp.paid_amount !== undefined ? supp.paid_amount : (inv.status === 'Paid' ? inv.amount : 0);
      const effStatus = supp.voided ? 'Voided' : (inv.status || (paidAmount >= inv.amount ? 'Paid' : (paidAmount > 0 ? 'Partial' : 'Unpaid')));
      return {
        ...inv,
        ...supp,
        status: effStatus,
        paid_amount: paidAmount,
        payment_method: supp.payment_method || (inv.status === 'Paid' ? 'Cash / Front Desk' : ''),
        payments_history: supp.payments_history || [],
        total_amount: inv.amount,
        is_paid: effStatus === 'Paid',
        is_partial: effStatus === 'Partial',
        is_voided: effStatus === 'Voided',
        created_at: inv.issued_at,
        days_old: daysOld,
        is_overdue: isOverdue && effStatus !== 'Voided'
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
    const resolvedPatientId = patient_id || patientId;
    const resolvedStatus = status || 'Unpaid';

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        patient_id: resolvedPatientId,
        appointment_id: appointment_id || appointmentId || null,
        amount: amount || totalAmount,
        status: resolvedStatus
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(invoice);

    // Send invoice notification email (fire-and-forget)
    if (resolvedPatientId) {
      try {
        const { data: patientData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', resolvedPatientId)
          .maybeSingle();

        // Try to get treatment name from appointment
        let treatmentName = 'Dental Service';
        if (appointment_id || appointmentId) {
          const { data: apptData } = await supabase
            .from('appointments')
            .select('treatment:treatment_id ( name )')
            .eq('id', appointment_id || appointmentId)
            .maybeSingle();
          if (apptData?.treatment?.name) treatmentName = apptData.treatment.name;
        }

        if (patientData?.email) {
          sendInvoiceEmail(patientData.email, patientData.name, invoice.id, invoice.amount, resolvedStatus, treatmentName).catch(() => {});
        }
      } catch (_) {}
    }
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

    // Send payment confirmation email (fire-and-forget, only for Paid)
    if (status === 'Paid' && invoice.patient_id) {
      try {
        const { data: patientData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', invoice.patient_id)
          .maybeSingle();

        let treatmentName = 'Dental Service';
        if (invoice.appointment_id) {
          const { data: apptData } = await supabase
            .from('appointments')
            .select('treatment:treatment_id ( name )')
            .eq('id', invoice.appointment_id)
            .maybeSingle();
          if (apptData?.treatment?.name) treatmentName = apptData.treatment.name;
        }

        if (patientData?.email) {
          sendInvoiceEmail(patientData.email, patientData.name, id, paid_amount || invoice.amount, 'Paid', treatmentName).catch(() => {});
        }
      } catch (_) {}
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Automated Financial Reconciliation Check
// @route   GET /api/invoices/reconciliation
// @access  Private (Accounting, Admin, Receptionist)
const reconcileInvoices = async (req, res) => {
  try {
    const isManual = req.query && (req.query.log === 'true' || req.query.manual === 'true');
    const autoFix = req.query && req.query.autoFix === 'true';

    // 1. Fetch all appointments (to check both Completed visits and Cancelled visits with invoices)
    const { data: allAppts, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, patient_id,
        patient:patient_id ( id, name, email ),
        treatment:treatment_id ( id, name, price )
      `);

    if (apptErr) throw apptErr;

    const completedAppts = (allAppts || []).filter(a => a.status === 'Completed');
    const apptById = new Map((allAppts || []).map(a => [a.id, a]));

    // 2. Fetch all invoices
    let { data: allInvoices, error: invErr } = await supabase
      .from('invoices')
      .select('*');

    if (invErr) throw invErr;

    // 3. Load invoice supplements from cloudStore
    const supplements = await loadInvoiceSupplementsAsync();
    let supplementsModified = false;

    const invoiceByApptId = new Map();
    (allInvoices || []).forEach(inv => {
      const supp = supplements[inv.id] || {};
      if (inv.appointment_id && !supp.voided && inv.status !== 'Voided') {
        invoiceByApptId.set(inv.appointment_id, inv);
      }
    });

    // 4. Check for unbilled completed appointments (and auto-generate if manual/autoFix)
    const unbilledAppointments = [];
    let autoGeneratedInvoicesCount = 0;

    for (const appt of completedAppts) {
      if (!invoiceByApptId.has(appt.id)) {
        const estAmount = Number(appt.treatment?.price) || 0;
        if ((isManual || autoFix) && appt.patient_id) {
          const { data: createdInv, error: createErr } = await supabase
            .from('invoices')
            .insert([{
              patient_id: appt.patient_id,
              appointment_id: appt.id,
              amount: estAmount,
              status: 'Unpaid'
            }])
            .select()
            .single();

          if (!createErr && createdInv) {
            autoGeneratedInvoicesCount++;
            allInvoices.push(createdInv);
            invoiceByApptId.set(appt.id, createdInv);
            continue;
          }
        }

        unbilledAppointments.push({
          appointmentId: appt.id,
          date: appt.appointment_date,
          patientName: appt.patient?.name || 'Unknown Patient',
          treatmentName: appt.treatment?.name || 'General Consultation',
          estimatedAmount: estAmount
        });
      }
    }

    // 5. Check for payment & status discrepancies on invoices
    const discrepancies = [];
    let totalBilled = 0;
    let totalCollected = 0;
    let totalUnpaid = 0;
    let totalWrittenOff = 0;
    let autoFixedDiscrepanciesCount = 0;

    for (const inv of (allInvoices || [])) {
      const supp = supplements[inv.id] || {};
      if (supp.voided || inv.status === 'Voided') continue;

      const billed = Number(inv.amount) || 0;
      const linkedAppt = inv.appointment_id ? apptById.get(inv.appointment_id) : null;

      // Check 5a: Invoice attached to a Cancelled appointment
      if (linkedAppt && linkedAppt.status === 'Cancelled') {
        if (autoFix) {
          await supabase.from('invoices').update({ status: 'Voided' }).eq('id', inv.id);
          if (!supplements[inv.id]) supplements[inv.id] = {};
          supplements[inv.id].voided = true;
          supplements[inv.id].void_reason = 'Auto-voided during reconciliation (linked appointment was Cancelled)';
          supplements[inv.id].voided_at = new Date().toISOString();
          supplements[inv.id].voided_by = req.user?.name || 'System Reconciliation';
          supplementsModified = true;
          autoFixedDiscrepanciesCount++;
          continue;
        } else {
          discrepancies.push({
            invoiceId: inv.id,
            type: 'CANCELLED_APPT_INVOICE',
            description: `Invoice #${inv.id.slice(0, 8).toUpperCase()} (${inv.status}, ₱${billed.toFixed(2)}) is linked to a Cancelled appointment (${linkedAppt.treatment?.name || 'Visit'})`,
            billedAmount: billed,
            status: inv.status
          });
        }
      }

      // Check 5b: Billed amount vs standard treatment fee mismatch (when no discount recorded)
      if (linkedAppt && linkedAppt.status !== 'Cancelled' && linkedAppt.treatment?.price) {
        const expectedPrice = Number(linkedAppt.treatment.price) || 0;
        const discount = Number(supp.discount_amount || 0);
        if (expectedPrice > 0 && Math.abs((billed + discount) - expectedPrice) > 1) {
          if (autoFix && inv.status === 'Unpaid') {
            await supabase.from('invoices').update({ amount: expectedPrice }).eq('id', inv.id);
            inv.amount = expectedPrice;
            autoFixedDiscrepanciesCount++;
          } else {
            discrepancies.push({
              invoiceId: inv.id,
              type: 'FEE_MISMATCH',
              description: `Invoice #${inv.id.slice(0, 8).toUpperCase()} billed at ₱${billed.toFixed(2)}, but standard fee for ${linkedAppt.treatment.name} is ₱${expectedPrice.toFixed(2)}`,
              billedAmount: billed,
              expectedAmount: expectedPrice,
              difference: expectedPrice - billed
            });
          }
        }
      }

      // Check 5c: Supplement paid_amount vs invoice status
      const suppPaid = supp.paid_amount !== undefined ? Number(supp.paid_amount) : (inv.status === 'Paid' ? billed : 0);
      if (inv.status !== 'Paid' && billed > 0 && suppPaid >= billed) {
        if (isManual || autoFix) {
          await supabase.from('invoices').update({ status: 'Paid', paid_at: new Date().toISOString() }).eq('id', inv.id);
          inv.status = 'Paid';
          autoFixedDiscrepanciesCount++;
        } else {
          discrepancies.push({
            invoiceId: inv.id,
            type: 'STATUS_MISMATCH',
            description: `Invoice #${inv.id.slice(0, 8).toUpperCase()} has full payment recorded (₱${suppPaid.toFixed(2)}) but status is "${inv.status}"`,
            billedAmount: billed,
            recordedPaidAmount: suppPaid
          });
        }
      }

      const finalBilled = Number(inv.amount) || 0;
      totalBilled += finalBilled;

      if (inv.status === 'Paid') {
        totalCollected += finalBilled;
      } else if (inv.status === 'Written Off') {
        totalWrittenOff += finalBilled;
      } else {
        const partialPaid = Math.min(finalBilled, Math.max(0, Number(supp.paid_amount) || 0));
        totalCollected += partialPaid;
        totalUnpaid += Math.max(0, finalBilled - partialPaid);
      }
    }

    if (supplementsModified) {
      await setCloudStore('invoice_supplements', supplements);
    }

    const isReconciled = unbilledAppointments.length === 0 && discrepancies.length === 0;

    // Log reconciliation run to audit ONLY if manually triggered (e.g. ?log=true)
    if (isManual || autoFix) {
      const { logAuditAction } = require('../utils/auditLogger');
      logAuditAction({
        action: 'FINANCIAL_RECONCILIATION_RUN',
        entityType: 'invoice',
        entityId: 'reconciliation_summary',
        details: `${req.user?.name || 'Accountant'} performed financial reconciliation: ${isReconciled ? 'CLEAN (No discrepancies)' : `${unbilledAppointments.length} unbilled appts, ${discrepancies.length} discrepancies`}${autoGeneratedInvoicesCount > 0 ? ` (${autoGeneratedInvoicesCount} missing invoices generated)` : ''}${autoFixedDiscrepanciesCount > 0 ? ` (${autoFixedDiscrepanciesCount} discrepancies auto-resolved)` : ''}`,
        metadata: {
          totalBilled,
          totalCollected,
          totalUnpaid,
          unbilledCount: unbilledAppointments.length,
          discrepancyCount: discrepancies.length,
          autoGeneratedInvoicesCount,
          autoFixedDiscrepanciesCount,
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
        completedAppointmentsCount: completedAppts.length,
        totalInvoicesCount: (allInvoices || []).length,
        unbilledAppointmentsCount: unbilledAppointments.length,
        discrepancyCount: discrepancies.length,
        autoGeneratedInvoicesCount,
        autoFixedDiscrepanciesCount
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


// @desc    Void or Cancel an invoice
// @route   PATCH /api/invoices/:id/void
// @access  Private (Accounting/Admin)
const voidInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Cancelled by administrator' } = req.body;
    const staffName = req.user?.name || req.user?.email || 'Admin';

    // Update status in Supabase
    await supabase.from('invoices').update({ status: 'Voided' }).eq('id', id);

    // Save supplement
    const supplements = await loadInvoiceSupplementsAsync();
    if (!supplements[id]) supplements[id] = {};
    supplements[id].voided = true;
    supplements[id].void_reason = reason;
    supplements[id].voided_at = new Date().toISOString();
    supplements[id].voided_by = staffName;
    await setCloudStore('invoice_supplements', supplements);

    // Log audit
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      logAuditAction({
        action: 'INVOICE_VOIDED',
        entityType: 'invoice',
        entityId: id,
        details: `${staffName} voided Invoice #${id.slice(0, 8).toUpperCase()}. Reason: ${reason}`,
        req
      });
    } catch (_) {}

    return res.json({ message: 'Invoice voided successfully.', id, voided: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// @desc    Record a payment (Full or Partial) for an invoice
// @route   POST /api/invoices/:id/payment
// @access  Private (Accounting/Admin/Receptionist)
const recordInvoicePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_amount, payment_method = 'Cash', reference = '', notes = '' } = req.body;

    const amt = parseFloat(payment_amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ message: 'A valid payment amount is required.' });
    }

    // Fetch invoice from DB
    const { data: inv, error: fetchErr } = await supabase
      .from('invoices')
      .select('id, amount, status, patient_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !inv) return res.status(404).json({ message: 'Invoice not found.' });

    const supplements = await loadInvoiceSupplementsAsync();
    if (!supplements[id]) supplements[id] = { paid_amount: 0, payments_history: [] };

    const currentPaid = parseFloat(supplements[id].paid_amount || 0);
    const newPaid = currentPaid + amt;
    const totalDue = parseFloat(inv.amount || 0);

    const isFullyPaid = newPaid >= totalDue;
    const newStatus = isFullyPaid ? 'Paid' : 'Partial';
    const paidAt = isFullyPaid ? new Date().toISOString() : null;

    // Update in Supabase
    const updatePayload = { status: newStatus };
    if (paidAt) updatePayload.paid_at = paidAt;
    await supabase.from('invoices').update(updatePayload).eq('id', id);

    // Update supplement
    const staffName = req.user?.name || req.user?.email || 'Staff';
    const paymentRecord = {
      amount: amt,
      payment_method,
      reference,
      notes,
      collected_at: new Date().toISOString(),
      collected_by: staffName
    };

    supplements[id].paid_amount = newPaid;
    supplements[id].payment_method = payment_method;
    supplements[id].payment_notes = notes;
    if (!supplements[id].payments_history) supplements[id].payments_history = [];
    supplements[id].payments_history.push(paymentRecord);
    await setCloudStore('invoice_supplements', supplements);

    // Audit log
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      logAuditAction({
        action: isFullyPaid ? 'PAYMENT_COLLECTED' : 'PARTIAL_PAYMENT_COLLECTED',
        entityType: 'invoice',
        entityId: id,
        details: `${staffName} collected ${isFullyPaid ? 'full' : 'partial'} payment of ₱${amt.toFixed(2)} via ${payment_method} for Invoice #${id.slice(0, 8).toUpperCase()}.`,
        req
      });
    } catch (_) {}

    return res.json({
      message: isFullyPaid ? 'Invoice marked as fully Paid.' : `Partial payment of ₱${amt.toFixed(2)} recorded.`,
      invoice: {
        ...inv,
        status: newStatus,
        paid_amount: newPaid,
        remaining: Math.max(0, totalDue - newPaid),
        payment_method,
        payments_history: supplements[id].payments_history
      }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { getInvoices, getInvoiceById, createInvoice, updateInvoice, reconcileInvoices, voidInvoice, recordInvoicePayment, loadInvoiceSupplements };
