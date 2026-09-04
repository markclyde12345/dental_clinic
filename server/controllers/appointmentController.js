const supabase = require('../config/db');

// @desc    Get appointments assigned to the logged-in dentist
// @route   GET /api/appointments/my
// @access  Private (Dentist / Dental Assistant)
const getMyAppointments = async (req, res) => {
  try {
    if (req.user.role !== 'Dentist' && req.user.role !== 'Dental Assistant') {
      return res.status(403).json({ message: 'Only dentists can view their schedule.' });
    }

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const mapped = (appointments || []).map(appt => ({
      ...appt,
      dateTime: appt.appointment_date,
      reason: appt.treatment ? appt.treatment.name : 'General Consultation'
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark an appointment as In Progress
// @route   PUT /api/appointments/:id/start
// @access  Private (Dentist)
const startAppointment = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: updated, error } = await supabase
      .from('appointments')
      .update({ status: 'In Progress' })
      .eq('id', id)
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .single();

    if (error) throw error;
    if (!updated) return res.status(404).json({ message: 'Appointment not found.' });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single appointment by id
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    res.json({
      ...appointment,
      dateTime: appointment.appointment_date,
      reason: appointment.treatment ? appointment.treatment.name : 'General Consultation'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all appointments
// @route   GET /api/appointments
// @access  Private
const getAppointments = async (req, res) => {
  try {
    let query = supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `);

    // If patient, only get their own appointments
    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data: appointments, error } = await query.order('appointment_date', { ascending: true });

    if (error) throw error;

    // Maintain backward compatibility for UI mapping if needed
    const mapped = appointments.map(appt => ({
      ...appt,
      dateTime: appt.appointment_date,
      reason: appt.treatment ? appt.treatment.name : 'General Consultation'
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get occupied/booked appointment time slots across the clinic
// @route   GET /api/appointments/occupied?date=YYYY-MM-DD
// @access  Private
const getOccupiedSlots = async (req, res) => {
  try {
    const { date } = req.query;

    let query = supabase
      .from('appointments')
      .select('id, appointment_date, status')
      .neq('status', 'Cancelled');

    // If a specific date is provided, filter server-side for much faster results
    if (date) {
      // Build UTC range for the requested local date
      const startUTC = new Date(`${date}T00:00:00.000Z`);
      const endUTC   = new Date(`${date}T23:59:59.999Z`);
      query = query
        .gte('appointment_date', startUTC.toISOString())
        .lte('appointment_date', endUTC.toISOString());
    }

    const { data: appointments, error } = await query;

    if (error) throw error;

    const occupied = (appointments || []).map(appt => {
      const d = new Date(appt.appointment_date);
      const timeStr = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const year  = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day   = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      return {
        id: appt.id,
        appointment_date: appt.appointment_date,
        date: dateStr,
        time: timeStr
      };
    });

    res.json(occupied);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create appointment
// @route   POST /api/appointments
// @access  Private
const createAppointment = async (req, res) => {
  const { treatment_id, treatmentId, dateTime, appointmentDate, appointment_date, notes } = req.body;
  const targetDate = appointment_date || appointmentDate || dateTime;

  try {
    if (!targetDate) {
      return res.status(400).json({ message: 'Appointment date and time are required.' });
    }

    // Check if slot is already occupied
    const { data: conflict, error: conflictErr } = await supabase
      .from('appointments')
      .select('id, appointment_date, status')
      .eq('appointment_date', targetDate)
      .neq('status', 'Cancelled')
      .maybeSingle();

    if (conflictErr) throw conflictErr;
    if (conflict) {
      return res.status(400).json({ message: 'This time slot is already occupied. Please choose another time.' });
    }

    // Delinquent balance protection: Patients with unpaid balances > 30 days cannot book new appointments
    if (req.user.role === 'Patient') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('id, amount, issued_at, status')
        .eq('patient_id', req.user.id)
        .eq('status', 'Unpaid')
        .lt('issued_at', thirtyDaysAgo);

      if (overdueInvoices && overdueInvoices.length > 0) {
        const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        const oldest = overdueInvoices.reduce((oldest, inv) => new Date(inv.issued_at) < new Date(oldest.issued_at) ? inv : oldest, overdueInvoices[0]);
        const daysPastDue = Math.max(1, Math.floor((Date.now() - new Date(oldest.issued_at).getTime()) / (1000 * 60 * 60 * 24)));
        return res.status(403).json({
          message: `Booking locked: You have an outstanding overdue balance of ₱${totalOverdue.toFixed(2)} (${daysPastDue} days past due). Please settle your past-due balance before booking new appointments.`,
          is_delinquent: true,
          overdue_amount: totalOverdue,
          oldest_invoice_id: oldest.id,
          days_past_due: daysPastDue
        });
      }
    }

    // Allow Receptionist, Admin, or Dentist to book for a patient directly; otherwise use logged-in patient
    const assignedPatientId = (req.user.role !== 'Patient' && (req.body.patient_id || req.body.patientId))
      ? (req.body.patient_id || req.body.patientId)
      : req.user.id;

    const initialStatus = (req.user.role !== 'Patient' && req.body.status)
      ? req.body.status
      : 'Pending';

    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert([{
        patient_id: assignedPatientId,
        treatment_id: treatment_id || treatmentId || null,
        appointment_date: targetDate,
        notes,
        status: initialStatus
      }])
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .single();

    if (error) throw error;

    // Auto-generate invoice for this appointment with treatment price
    let createdInvoice = null;
    try {
      let treatmentPrice = 0;
      if (appointment.treatment?.price) {
        treatmentPrice = parseFloat(appointment.treatment.price) || 0;
      } else if (treatment_id || treatmentId) {
        const { data: tData } = await supabase
          .from('treatments')
          .select('price')
          .eq('id', treatment_id || treatmentId)
          .maybeSingle();
        if (tData?.price) treatmentPrice = parseFloat(tData.price) || 0;
      }

      const isPaidInitial = req.body.is_paid || req.body.payment_status === 'Paid';
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert([{
          patient_id: assignedPatientId,
          appointment_id: appointment.id,
          amount: treatmentPrice,
          status: isPaidInitial ? 'Paid' : 'Unpaid',
          paid_amount: isPaidInitial ? treatmentPrice : 0,
          paid_at: isPaidInitial ? new Date().toISOString() : null
        }])
        .select()
        .single();

      if (!invErr) {
        createdInvoice = inv;
      }
    } catch (invErr) {
      console.error('[Auto-Invoice Creation Error]', invErr.message);
    }

    res.status(201).json({
      ...appointment,
      invoice: createdInvoice
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── Appointment status notification emails ─────────────────────────────────
const sendAppointmentStatusEmail = async (updated, status) => {
  try {
    const sendEmail = require('../utils/emailService');
    const patient = updated.patient;
    const treatment = updated.treatment;

    if (!patient || !patient.email) return;

    const apptDate = updated.appointment_date
      ? new Date(updated.appointment_date).toLocaleString('en-PH', {
          weekday: 'long', year: 'numeric', month: 'long',
          day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
        })
      : 'N/A';
    const treatmentName = treatment ? treatment.name : 'General Consultation';

    const statusConfig = {
      Approved: {
        subject: '✅ Appointment Confirmed — Fano Dental Clinic',
        label: 'Confirmed',
        color: '#0b3c4d',
        bg: '#e6f7f2',
        message: 'Great news! Your appointment has been <strong>confirmed</strong> by our team. Please make sure to arrive 10 minutes early. If you need to reschedule or cancel, you can do so through your patient dashboard at least 24 hours before the appointment.'
      },
      Cancelled: {
        subject: '❌ Appointment Cancelled — Fano Dental Clinic',
        label: 'Cancelled',
        color: '#b91c1c',
        bg: '#fee2e2',
        message: 'We regret to inform you that your appointment has been <strong>cancelled</strong>. If you did not request this cancellation or need to book a new appointment, please visit your patient dashboard or contact our clinic directly.'
      },
      Completed: {
        subject: '🦷 Appointment Completed — Thank You! | Fano Dental Clinic',
        label: 'Completed',
        color: '#065f46',
        bg: '#d1fae5',
        message: 'Thank you for visiting Fano Dental Clinic! Your appointment has been marked as <strong>completed</strong>. We hope you had a great experience. Remember to follow any post-treatment instructions provided by your dentist!'
      },
      Rescheduled: {
        subject: '🗓️ Appointment Rescheduled — Fano Dental Clinic',
        label: 'Rescheduled',
        color: '#92400e',
        bg: '#fef3c7',
        message: 'Your appointment has been <strong>rescheduled</strong> to a new date and time. Please review the updated details below and contact us if you have any concerns.'
      }
    };

    const cfg = statusConfig[status];
    if (!cfg) return; // No email for minor status changes

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
              <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:700;line-height:1.3;">Appointment Update</h1>
            </td>
          </tr>
          <!-- Status Badge -->
          <tr>
            <td style="padding:28px 40px 8px 40px;text-align:center;">
              <span style="display:inline-block;background:${cfg.bg};color:${cfg.color};font-size:15px;font-weight:700;padding:10px 28px;border-radius:50px;border:1.5px solid ${cfg.color}44;letter-spacing:0.5px;">
                Status: ${cfg.label}
              </span>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:20px 40px 4px 40px;">
              <p style="margin:0;font-size:16px;color:#1e293b;">Hello, <strong>${patient.name}</strong>,</p>
            </td>
          </tr>
          <!-- Body Message -->
          <tr>
            <td style="padding:12px 40px 20px 40px;">
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.7;">${cfg.message}</p>
            </td>
          </tr>
          <!-- Appointment Details Card -->
          <tr>
            <td style="padding:0 40px 28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
                <tr>
                  <td style="background:#0b3c4d;padding:12px 20px;">
                    <p style="margin:0;font-size:12px;font-weight:700;color:#c59b27;letter-spacing:1.5px;text-transform:uppercase;">Appointment Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;">
                    <table width="100%" cellpadding="4" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#64748b;width:140px;font-weight:600;">&#128197; Date &amp; Time</td>
                        <td style="font-size:13px;color:#1e293b;font-weight:700;">${apptDate}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#129463; Treatment</td>
                        <td style="font-size:13px;color:#1e293b;">${treatmentName}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#128203; Status</td>
                        <td style="font-size:13px;color:${cfg.color};font-weight:700;">${cfg.label}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#64748b;font-weight:600;">&#128290; Reference #</td>
                        <td style="font-size:13px;color:#1e293b;font-family:monospace;">${updated.id}</td>
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
              <a href="${process.env.APP_URL || 'http://localhost:5000'}/pages/patient-dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#0b3c4d,#14536a);color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">View My Appointments &#8594;</a>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0;"></td>
          </tr>
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

    const plainText = `Fano Dental Clinic — Appointment ${cfg.label}\n\nHello ${patient.name},\n\n${cfg.message.replace(/<[^>]+>/g, '')}\n\nAppointment Details:\n- Date & Time: ${apptDate}\n- Treatment: ${treatmentName}\n- Status: ${cfg.label}\n- Reference #: ${updated.id}\n\nFano Dental Clinic\n123 Dental Street, Your City, Philippines\n(02) 8-XXX-XXXX`;

    await sendEmail(patient.email, cfg.subject, htmlContent, plainText);
    console.log(`📧 [Appt Notification] "${cfg.label}" email sent to ${patient.email}`);
  } catch (err) {
    console.error('[Appointment Email Error]', err.message);
  }
};

// @desc    Update appointment details (status, date, notes, etc.)
// @route   PUT /api/appointments/:id
// @access  Private
const updateAppointment = async (req, res) => {
  const { id } = req.params;
  const { appointment_date, dateTime, appointmentDate, status, notes, clinical_notes, clinicalNotes } = req.body;
  const targetDate = appointment_date || appointmentDate || dateTime;

  try {
    if (targetDate) {
      // Check if target slot is already taken by another active appointment
      const { data: conflict, error: conflictErr } = await supabase
        .from('appointments')
        .select('id, appointment_date, status')
        .eq('appointment_date', targetDate)
        .neq('id', id)
        .neq('status', 'Cancelled')
        .maybeSingle();

      if (conflictErr) throw conflictErr;
      if (conflict) {
        return res.status(400).json({ message: 'This time slot is already occupied. Please choose another time.' });
      }
    }

    const updateFields = {};
    if (targetDate !== undefined) updateFields.appointment_date = targetDate;
    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;

    let query = supabase
      .from('appointments')
      .update(updateFields)
      .eq('id', id);

    // If patient, ensure they own the appointment
    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data: updated, error } = await query
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .single();

    if (error) throw error;

    // Send status notification email (fire-and-forget, won't delay response)
    if (status) {
      sendAppointmentStatusEmail(updated, status).catch(() => {});
    }

    // Auto-generate an invoice when an appointment is completed (and none exists yet)
    if (status === 'Completed') {
      try {
        const { data: existing } = await supabase
          .from('invoices')
          .select('id')
          .eq('appointment_id', id)
          .maybeSingle();

        if (!existing && updated.patient_id) {
          const amount = updated.treatment ? Number(updated.treatment.price) || 0 : 0;
          await supabase
            .from('invoices')
            .insert([{
              patient_id: updated.patient_id,
              appointment_id: id,
              amount,
              status: 'Unpaid'
            }]);
        }
      } catch (invErr) {
        console.error('[Auto-Invoice Error]', invErr.message);
      }
    }

    // Log appointment status changes and cancellations in audit trail
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const apptRef = id ? id.substring(0, 8).toUpperCase() : id;
      const patientName = updated.patient ? (updated.patient.name || updated.patient.email) : 'Patient';

      if (status === 'Cancelled') {
        logAuditAction({
          action: 'APPOINTMENT_CANCELLED',
          entityType: 'appointment',
          entityId: id,
          details: `${req.user?.name || 'Staff'} cancelled appointment #${apptRef} for ${patientName}`,
          metadata: { appointment_id: id, patient_id: updated.patient_id, status: 'Cancelled' },
          req
        });
      } else if (status) {
        logAuditAction({
          action: 'APPOINTMENT_STATUS_CHANGED',
          entityType: 'appointment',
          entityId: id,
          details: `${req.user?.name || 'Staff'} updated appointment #${apptRef} for ${patientName} to status '${status}'`,
          metadata: { appointment_id: id, patient_id: updated.patient_id, status },
          req
        });
      }
    } catch (auditErr) {
      console.warn('[Audit Log Skip]', auditErr.message);
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private
const deleteAppointment = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const apptRef = id ? id.substring(0, 8).toUpperCase() : id;
      logAuditAction({
        action: 'APPOINTMENT_DELETED',
        entityType: 'appointment',
        entityId: id,
        details: `${req.user?.name || 'Staff'} deleted appointment record #${apptRef}`,
        metadata: { appointment_id: id },
        req
      });
    } catch (_) {}

    res.json({ success: true, message: 'Appointment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMyAppointments,
  startAppointment,
  getAppointmentById,
  getAppointments,
  getOccupiedSlots,
  createAppointment,
  updateAppointment,
  deleteAppointment
};
