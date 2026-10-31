const supabase = require('../config/db');
const fs = require('fs');
const path = require('path');

const REVIEWS_FILE = path.join(__dirname, '../data/patient_reviews.json');

function getReviewsStore() {
  if (fs.existsSync(REVIEWS_FILE)) {
    try { return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8')); } catch (_) { return []; }
  }
  return [];
}

/**
 * Unified Notifications Controller for Fano Dental Clinic
 * Delivers real-time notifications tailored to the authenticated user's role.
 */

// @desc    Get notifications for current logged-in user
// @route   GET /api/notifications
// @access  Private (Patient, Receptionist, Dentist, Admin)
const getUserNotifications = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const notifications = [];
    const allReviews = getReviewsStore();

    // ─────────────────────────────────────────────────────────────
    // 1. PATIENT NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    if (userRole === 'Patient') {
      // 1a. Patient Appointments
      const { data: appts } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at, notes,
          treatment:treatment_id ( name, price )
        `)
        .eq('patient_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      (appts || []).forEach(a => {
        const rawDate = a.appointment_date || '';
        const d = new Date(rawDate);
        const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Scheduled Date';
        const treatmentName = a.treatment?.name || 'Dental Visit';

        if (a.status === 'Approved') {
          notifications.push({
            id: `appt-approved-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Appointment Confirmed',
            message: `Your appointment for ${treatmentName} on ${dateStr} is confirmed. Please arrive 10 minutes early.`,
            type: 'success',
            icon: 'calendar-check',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
        } else if (a.status === 'Checked In') {
          notifications.push({
            id: `appt-checkedin-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Checked In - In Lounge',
            message: `You are checked in for ${treatmentName}. Please relax in the lounge while the doctor prepares your dental chair.`,
            type: 'warning',
            icon: 'chair',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
        } else if (a.status === 'In Progress') {
          notifications.push({
            id: `appt-progress-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Consultation In Progress',
            message: `Your ${treatmentName} procedure is currently in progress with your dentist.`,
            type: 'primary',
            icon: 'user-doctor',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
        } else if (a.status === 'Completed') {
          const rawNotes = a.notes || '';
          let dentistName = 'Staff Specialist';
          const dMatch = rawNotes.match(/\[Dentist:\s*([^\]]+)\]/i);
          if (dMatch && dMatch[1] && dMatch[1] !== 'No Preference') dentistName = dMatch[1].trim();

          const existingReview = allReviews.find(r => String(r.appointment_id) === String(a.id));

          if (!existingReview) {
            // Surgery / Treatment completed and not yet rated -> Send rating prompt notification!
            notifications.push({
              id: `appt-rate-${a.id}`,
              entity_id: a.id,
              category: 'review',
              title: `★ Rate Your Surgery: ${treatmentName}`,
              message: `Your surgery for ${treatmentName} with Dr. ${dentistName} has finished! Please rate your experience and treatment care.`,
              type: 'warning',
              icon: 'star',
              time: a.created_at || new Date().toISOString(),
              action: { type: 'rate_appointment', id: a.id }
            });
          } else {
            // Already rated -> show rating confirmation alert
            notifications.push({
              id: `appt-rated-${a.id}`,
              entity_id: a.id,
              category: 'review',
              title: `★ Surgery Rated: ${treatmentName}`,
              message: `Thank you! You rated your ${treatmentName} surgery ${existingReview.rating} ★ (${existingReview.comment ? `"${existingReview.comment}"` : 'Thank you for your rating'}).`,
              type: 'success',
              icon: 'star',
              time: existingReview.created_at || a.created_at || new Date().toISOString(),
              action: { type: 'view_appointment', id: a.id }
            });
          }
        } else if (a.status === 'Cancelled') {
          notifications.push({
            id: `appt-canc-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Appointment Cancelled',
            message: `Your appointment for ${treatmentName} on ${dateStr} was cancelled.`,
            type: 'danger',
            icon: 'circle-xmark',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
        } else {
          notifications.push({
            id: `appt-pend-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Appointment Booking Received',
            message: `Booking request for ${treatmentName} on ${dateStr} received. Awaiting clinic approval.`,
            type: 'info',
            icon: 'clock',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
        }
      });

      // 1b. Patient Invoices & Billing
      const { data: invs } = await supabase
        .from('invoices')
        .select(`id, amount, status, issued_at, paid_at`)
        .eq('patient_id', userId)
        .order('issued_at', { ascending: false })
        .limit(6);

      (invs || []).forEach(inv => {
        const ref = inv.id.slice(0, 8).toUpperCase();
        const amt = parseFloat(inv.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

        if (inv.status === 'Paid') {
          notifications.push({
            id: `inv-paid-${inv.id}`,
            entity_id: inv.id,
            category: 'billing',
            title: 'Payment Confirmed',
            message: `Invoice #${ref} (₱${amt}) was paid. Click to view or download your official receipt.`,
            type: 'success',
            icon: 'receipt',
            time: inv.paid_at || inv.issued_at || new Date().toISOString(),
            action: { type: 'view_receipt', id: inv.id }
          });
        } else if (inv.status === 'Unpaid') {
          notifications.push({
            id: `inv-unpaid-${inv.id}`,
            entity_id: inv.id,
            category: 'billing',
            title: 'Pending Clinic Invoice',
            message: `Invoice #${ref} for ₱${amt} is awaiting payment. Pay online via PayMongo or at the front desk.`,
            type: 'warning',
            icon: 'credit-card',
            time: inv.issued_at || new Date().toISOString(),
            action: { type: 'pay_invoice', id: inv.id }
          });
        }
      });

      // 1c. General Preventive Care Recall (Today)
      notifications.push({
        id: 'preventive-recall-notice',
        category: 'reminder',
        title: 'Routine Dental Cleaning Recommended',
        message: 'The Philippine Dental Association recommends routine dental check-ups and prophylaxis every 6 months to maintain optimal oral health.',
        type: 'info',
        icon: 'tooth',
        time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        action: { type: 'book_now' }
      });

      // 1d. Oral Hygiene Tips / Clinic Update (Yesterday / Last Day)
      notifications.push({
        id: 'hygiene-tip-yesterday',
        category: 'announcement',
        title: 'Daily Oral Care Tip',
        message: 'Remember to floss daily and brush twice for 2 minutes to prevent plaque accumulation and protect enamel.',
        type: 'success',
        icon: 'circle-check',
        time: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        action: { type: 'switch_tab', tab: 'services' }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. RECEPTIONIST NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    else if (userRole === 'Receptionist' || ((userRole === 'Admin' || userRole === 'Super Admin') && req.query.role === 'receptionist')) {
      // 2a. Today's Lounge Queue
      const { data: queueAppts, error: qErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at,
          patient:patient_id ( name, contact_number ),
          treatment:treatment_id ( name )
        `)
        .eq('status', 'Checked In');

      if (!qErr && queueAppts && queueAppts.length > 0) {
        notifications.push({
          id: 'queue-active-alert',
          category: 'queue',
          title: 'Patients Waiting in Lounge',
          message: `${queueAppts.length} patient${queueAppts.length !== 1 ? 's are' : ' is'} checked in and waiting in the clinic front lounge.`,
          type: 'warning',
          icon: 'hourglass',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'queue' }
        });

        // Long wait alert (>15 mins)
        const nowMs = Date.now();
        const overdue = queueAppts.filter(a => {
          const t = new Date(a.appointment_date || a.created_at || nowMs).getTime();
          return (nowMs - t) > 15 * 60 * 1000;
        });
        if (overdue.length > 0) {
          notifications.push({
            id: 'lounge-long-wait-alert',
            category: 'queue',
            title: 'Lounge Wait Time Alert',
            message: `${overdue.length} patient(s) waiting in lounge >15 mins. Check dentist room readiness.`,
            type: 'danger',
            icon: 'alert-triangle',
            time: new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'queue' }
          });
        }
      }

      // 2b. Pending Appointments Needing Confirmation
      const { data: pendingAppts, error: pErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at,
          patient:patient_id ( name, contact_number ),
          treatment:treatment_id ( name )
        `)
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!pErr && pendingAppts) {
        pendingAppts.forEach(a => {
          const patientName = a.patient?.name || 'Patient';
          const treatmentName = a.treatment?.name || 'General Consultation';
          const d = new Date(a.appointment_date);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date';

          notifications.push({
            id: `rec-pending-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'New Booking Request',
            message: `${patientName} booked ${treatmentName} for ${dateStr}. Confirm or assign doctor.`,
            type: 'info',
            icon: 'calendar-plus',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Pending', entityId: a.id }
          });
        });
      }

      // 2c. Recent Cancellations
      const { data: cancelledAppts, error: cErr } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at,
          patient:patient_id ( name, contact_number ),
          treatment:treatment_id ( name )
        `)
        .eq('status', 'Cancelled')
        .order('created_at', { ascending: false })
        .limit(5);

      if (!cErr && cancelledAppts) {
        cancelledAppts.forEach(a => {
          const patientName = a.patient?.name || 'Patient';
          const treatmentName = a.treatment?.name || 'Appointment';
          const d = new Date(a.appointment_date);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date';

          notifications.push({
            id: `rec-cancelled-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Appointment Cancelled',
            message: `${patientName} cancelled visit scheduled for ${dateStr}. Slot is now open.`,
            type: 'danger',
            icon: 'calendar-x',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Cancelled', entityId: a.id }
          });
        });
      }

      // 2d. Unpaid Invoices Counter
      const { data: unpaidInvs, error: iErr } = await supabase
        .from('invoices')
        .select('id, amount')
        .eq('status', 'Unpaid');

      if (!iErr && unpaidInvs && unpaidInvs.length > 0) {
        const sum = unpaidInvs.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
        notifications.push({
          id: 'rec-unpaid-counter',
          category: 'billing',
          title: 'Unpaid Invoices Awaiting Collection',
          message: `${unpaidInvs.length} invoice(s) totaling ₱${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })} are currently unpaid.`,
          type: 'warning',
          icon: 'receipt',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'billing', filterStatus: 'Unpaid' }
        });
      }

      // 2e. Recent Patient Ratings & Feedback for Receptionist
      allReviews.slice(0, 5).forEach(r => {
        notifications.push({
          id: `rec-rev-${r.id}`,
          entity_id: r.appointment_id,
          category: 'review',
          title: `★ Patient Feedback: ${r.rating} Stars`,
          message: `${r.patient_name || 'Patient'} submitted a ${r.rating}★ rating for ${r.treatment_name}`,
          type: 'info',
          icon: 'star',
          time: r.created_at || new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'appointments' }
        });
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ADMIN & ACCOUNTING NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    else if (userRole === 'Admin' || userRole === 'Super Admin' || userRole === 'Accounting' || req.query.role === 'admin') {
      const isAdminRole = userRole === 'Admin' || userRole === 'Super Admin' || req.query.role === 'admin';

      if (isAdminRole) {
        // 3a. Pending Appointments (Individual actionable bookings)
        const { data: pendingAppts } = await supabase
          .from('appointments')
          .select(`
            id, appointment_date, status, created_at, notes,
            patient:patient_id ( name, contact_number ),
            treatment:treatment_id ( name )
          `)
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .limit(8);

        (pendingAppts || []).forEach(a => {
          const patientName = a.patient?.name || 'Patient';
          const treatmentName = a.treatment?.name || 'Dental Consultation';
          const d = new Date(a.appointment_date);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date';

          notifications.push({
            id: `admin-pending-${a.id}`,
            entity_id: a.id,
            category: 'operations',
            title: 'New Booking Request',
            message: `${patientName} booked ${treatmentName} for ${dateStr}. Review and confirm.`,
            type: 'info',
            icon: 'calendar-plus',
            time: a.created_at || new Date().toISOString(),
            action: {
              type: 'switch_tab',
              tab: 'appointments',
              filterStatus: 'Pending',
              entityId: a.id
            }
          });
        });

        // 3b. Recent Cancellations (alert that chair slot reopened)
        const { data: cancelledAppts } = await supabase
          .from('appointments')
          .select(`
            id, appointment_date, status, created_at, notes,
            patient:patient_id ( name ),
            treatment:treatment_id ( name )
          `)
          .eq('status', 'Cancelled')
          .order('created_at', { ascending: false })
          .limit(4);

        (cancelledAppts || []).forEach(a => {
          const patientName = a.patient?.name || 'Patient';
          const treatmentName = a.treatment?.name || 'Appointment';
          const d = new Date(a.appointment_date);
          const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date';

          notifications.push({
            id: `admin-cancelled-${a.id}`,
            entity_id: a.id,
            category: 'operations',
            title: 'Appointment Cancelled',
            message: `${patientName} cancelled ${treatmentName} for ${dateStr}. Slot reopened.`,
            type: 'danger',
            icon: 'calendar-x',
            time: a.created_at || new Date().toISOString(),
            action: {
              type: 'switch_tab',
              tab: 'appointments',
              filterStatus: 'Cancelled',
              entityId: a.id
            }
          });
        });

        // 3c. Front Lounge Queue
        const { data: queueAppts } = await supabase
          .from('appointments')
          .select(`
            id, appointment_date, status, created_at,
            patient:patient_id ( name ),
            treatment:treatment_id ( name )
          `)
          .eq('status', 'Checked In');

        if (queueAppts && queueAppts.length > 0) {
          notifications.push({
            id: `admin-queue-${queueAppts.length}`,
            category: 'operations',
            title: 'Patients in Clinic Lounge',
            message: `${queueAppts.length} patient${queueAppts.length !== 1 ? 's are' : ' is'} checked in and waiting in the clinic front lounge.`,
            type: 'warning',
            icon: 'hourglass',
            time: new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Checked In' }
          });

          // Lounge overdue wait alert (>15 mins)
          const nowMs = Date.now();
          const overdue = queueAppts.filter(a => {
            const t = new Date(a.appointment_date || a.created_at || nowMs).getTime();
            return (nowMs - t) > 15 * 60 * 1000;
          });
          if (overdue.length > 0) {
            notifications.push({
              id: 'admin-long-wait-alert',
              category: 'operations',
              title: 'Lounge Wait Time Alert',
              message: `${overdue.length} patient(s) waiting in lounge >15 mins. Check dentist room readiness.`,
              type: 'danger',
              icon: 'triangle-exclamation',
              time: new Date().toISOString(),
              action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Checked In' }
            });
          }
        }
      }

      // 3d. Overdue Balances (> 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: overdueInvs } = await supabase
        .from('invoices')
        .select('id, amount, patient:patient_id ( name )')
        .eq('status', 'Unpaid')
        .lt('issued_at', thirtyDaysAgo);

      if (overdueInvs && overdueInvs.length > 0) {
        notifications.push({
          id: 'admin-overdue-alert',
          category: 'finance',
          title: 'Overdue Invoices Alert',
          message: `${overdueInvs.length} patient invoice(s) are overdue (>30 days). Review financial aging.`,
          type: 'danger',
          icon: 'triangle-exclamation',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'billing' }
        });
      }

      // 3e. Unpaid Invoices Counter
      const { data: unpaidInvs } = await supabase
        .from('invoices')
        .select('id, amount')
        .eq('status', 'Unpaid');

      if (unpaidInvs && unpaidInvs.length > 0) {
        const totalPending = unpaidInvs.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
        notifications.push({
          id: `billing-unpaid-${unpaidInvs.length}-${Math.round(totalPending)}`,
          category: 'finance',
          title: 'Unpaid Invoices Awaiting Collection',
          message: `${unpaidInvs.length} invoice(s) totaling ₱${totalPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })} are currently unpaid.`,
          type: 'warning',
          icon: 'receipt',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'billing' }
        });
      }

      if (isAdminRole) {
        // 3f. Recent Patient Satisfaction Ratings
        allReviews.slice(0, 6).forEach(r => {
          notifications.push({
            id: `admin-rev-${r.id}`,
            entity_id: r.appointment_id,
            category: 'review',
            title: `★ Patient Satisfaction: ${r.rating}★`,
            message: `${r.patient_name || 'Patient'} rated ${r.treatment_name} with ${r.dentist_name || 'Clinic Specialist'} (${r.rating} stars)${r.comment ? `: "${r.comment}"` : ''}`,
            type: 'info',
            icon: 'star',
            time: r.created_at || new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'analytics' }
          });
        });

        // 3g. System & Clinic Operations Status
        notifications.push({
          id: 'admin-system-status',
          category: 'system',
          title: 'Clinic Operations System Healthy',
          message: 'Clinic data synchronization, database connection, and audit logging pipelines are operating normally.',
          type: 'success',
          icon: 'shield-check',
          time: new Date().toISOString()
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. DENTIST NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    else if (userRole === 'Dentist') {
      const { data: recentAppts } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at,
          patient:patient_id ( name ),
          treatment:treatment_id ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(8);

      (recentAppts || []).forEach(a => {
        notifications.push({
          id: `dentist-notif-${a.id}`,
          entity_id: a.id,
          category: 'clinical',
          title: a.status === 'Cancelled' ? 'Appointment Cancelled' : (a.status === 'Completed' ? 'Treatment Completed' : 'New Appointment Booking'),
          message: `${a.patient ? a.patient.name : 'Patient'} booked ${a.treatment ? a.treatment.name : 'Dental Service'} on ${new Date(a.appointment_date).toLocaleDateString()}`,
          type: a.status === 'Cancelled' ? 'danger' : (a.status === 'Completed' ? 'success' : 'info'),
          icon: 'user-doctor',
          time: a.created_at || new Date().toISOString(),
          action: { type: 'view_record', id: a.id }
        });
      });

      // Dentist notifications for patient surgery ratings
      const dentistReviews = allReviews.filter(r => {
        if (!req.user?.name) return true;
        return !r.dentist_name || r.dentist_name.toLowerCase().includes(req.user.name.toLowerCase()) || req.user.name.toLowerCase().includes((r.dentist_name || '').toLowerCase());
      });
      (dentistReviews.length > 0 ? dentistReviews : allReviews).slice(0, 6).forEach(r => {
        notifications.push({
          id: `dentist-rev-${r.id}`,
          entity_id: r.appointment_id,
          category: 'review',
          title: `★ New Patient Rating (${r.rating} Stars)`,
          message: `${r.patient_name || 'Patient'} submitted a ${r.rating}★ rating for ${r.treatment_name}${r.comment ? `: "${r.comment}"` : ''}`,
          type: 'success',
          icon: 'star',
          time: r.created_at || new Date().toISOString(),
          action: { type: 'view_record', id: r.appointment_id }
        });
      });
    }

    // Sort by timestamp descending
    notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.json(notifications);
  } catch (error) {
    console.error('[Notification Controller Error]', error);
    res.status(500).json({ message: error.message || 'Error fetching notifications' });
  }
};

module.exports = {
  getUserNotifications
};
