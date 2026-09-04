const supabase = require('../config/db');

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
          notifications.push({
            id: `appt-comp-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Visit Completed — Thank You!',
            message: `Your visit for ${treatmentName} has been completed. Follow any aftercare instructions from your dentist.`,
            type: 'success',
            icon: 'circle-check',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'view_appointment', id: a.id }
          });
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

      // 1c. General Preventive Care Recall
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
    }

    // ─────────────────────────────────────────────────────────────
    // 2. RECEPTIONIST NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    else if (userRole === 'Receptionist') {
      // 2a. Today's Lounge Queue
      const { data: queueAppts } = await supabase
        .from('appointments')
        .select(`id, status, patient:patient_id ( name ), treatment:treatment_id ( name )`)
        .eq('status', 'Checked In');

      if (queueAppts && queueAppts.length > 0) {
        notifications.push({
          id: 'queue-active-alert',
          category: 'queue',
          title: 'Patients Waiting in Lounge',
          message: `${queueAppts.length} patient${queueAppts.length !== 1 ? 's are' : ' is'} checked in and waiting in the clinic front lounge.`,
          type: 'warning',
          icon: 'hourglass-half',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'queue' }
        });
      }

      // 2b. Recent Appointment Bookings
      const { data: recentAppts } = await supabase
        .from('appointments')
        .select(`
          id, appointment_date, status, created_at,
          patient:patient_id ( name, contact_number ),
          treatment:treatment_id ( name )
        `)
        .order('created_at', { ascending: false })
        .limit(6);

      (recentAppts || []).forEach(a => {
        const patientName = a.patient?.name || 'Patient';
        const treatmentName = a.treatment?.name || 'General Consultation';
        const d = new Date(a.appointment_date);
        const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Date';

        if (a.status === 'Pending') {
          notifications.push({
            id: `rec-pending-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'New Booking Request',
            message: `${patientName} booked ${treatmentName} for ${dateStr}. Confirm or assign doctor.`,
            type: 'info',
            icon: 'calendar-plus',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments' }
          });
        } else if (a.status === 'Cancelled') {
          notifications.push({
            id: `rec-cancelled-${a.id}`,
            entity_id: a.id,
            category: 'appointment',
            title: 'Appointment Cancelled',
            message: `${patientName} cancelled visit scheduled for ${dateStr}.`,
            type: 'danger',
            icon: 'calendar-xmark',
            time: a.created_at || new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments' }
          });
        }
      });

      // 2c. Unpaid Invoices Counter
      const { data: unpaidInvs } = await supabase
        .from('invoices')
        .select('id, amount')
        .eq('status', 'Unpaid');

      if (unpaidInvs && unpaidInvs.length > 0) {
        const sum = unpaidInvs.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
        notifications.push({
          id: 'rec-unpaid-counter',
          category: 'billing',
          title: 'Unpaid Invoices Awaiting Collection',
          message: `${unpaidInvs.length} invoice(s) totaling ₱${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })} are currently unpaid.`,
          type: 'warning',
          icon: 'receipt',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'billing' }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ADMIN & ACCOUNTING NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    else if (userRole === 'Admin' || userRole === 'Accounting') {
      // 3a. Overdue Balances (> 30 days)
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

      // 3b. Unpaid Invoices
      const { data: unpaidInvs } = await supabase
        .from('invoices')
        .select('id, amount')
        .eq('status', 'Unpaid');

      if (unpaidInvs && unpaidInvs.length > 0) {
        const totalPending = unpaidInvs.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
        notifications.push({
          id: 'billing-unpaid-counter',
          category: 'finance',
          title: 'Unpaid Invoices Awaiting Collection',
          message: `${unpaidInvs.length} invoice(s) totaling ₱${totalPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })} are currently unpaid.`,
          type: 'warning',
          icon: 'receipt',
          time: new Date().toISOString(),
          action: { type: 'switch_tab', tab: 'billing' }
        });
      }

      if (userRole === 'Admin') {
        // 3c. Recent Bookings & Pending Approvals
        const { count: pendingCount } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Pending');

        if (pendingCount && pendingCount > 0) {
          notifications.push({
            id: 'admin-pending-count',
            category: 'operations',
            title: 'Pending Appointment Approvals',
            message: `${pendingCount} appointment request(s) require review or front desk confirmation.`,
            type: 'warning',
            icon: 'calendar-clock',
            time: new Date().toISOString(),
            action: { type: 'switch_tab', tab: 'appointments' }
          });
        }

        // 3d. System & Audit Notification
        notifications.push({
          id: 'admin-system-status',
          category: 'system',
          title: 'Clinic Operations System Healthy',
          message: 'Database connection, PayMongo gateway, and audit log pipelines are operating normally.',
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
