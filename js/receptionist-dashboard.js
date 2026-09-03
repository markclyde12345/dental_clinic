/**
 * Receptionist Dashboard Suite — Fano Dental Clinic
 * Front Desk Management, Live Waiting Lounge Queue, Fast Check-In,
 * Appointment Booking, Patient Chart Directory, and Billing Check-Out.
 */

// ─── API & Base Configuration ────────────────────────────────────────────────
const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
let currentUser = null;

// Cache state
let allAppointments = [];
let allPatients = [];
let allDentists = [];
let allStaffSchedules = [];
let allTreatments = [];
let allInvoices = [];

// ─── Live Clock ──────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('current-time');
  const dateEl = document.getElementById('current-date');
  
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ─── Authentication & Initialization ──────────────────────────────────────────
if (!token) {
  window.location.href = 'login.html';
} else {
  fetch(`${BASE_ORIGIN}/api/auth/profile`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => {
    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }
    return res.json();
  })
  .then(data => {
    if (!data || data.message) {
      logout();
      return;
    }
    currentUser = data;

    // Verify authorized front-desk roles
    if (currentUser.role !== 'Receptionist' && currentUser.role !== 'Admin') {
      showToast('Access restricted to front-desk staff.', 'error');
      setTimeout(() => window.location.href = 'login.html', 1200);
      return;
    }

    setupUserInterface();
    loadDashboardData();
  })
  .catch(err => {
    console.error('[Profile Load Error]', err);
    logout();
  });
}

function setupUserInterface() {
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  const roleEl = document.getElementById('user-role');

  const fullName = currentUser.name || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'Receptionist';
  if (nameEl) nameEl.textContent = fullName;
  if (roleEl) roleEl.textContent = currentUser.role === 'Admin' ? 'Admin / Front Desk' : 'Receptionist';
  if (avatarEl) avatarEl.textContent = fullName.charAt(0).toUpperCase();

  // Setup tab navigation
  document.querySelectorAll('.sidebar-menu .nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Set default book date to today
  const bookDateInput = document.getElementById('book-date');
  if (bookDateInput) {
    const today = new Date().toISOString().split('T')[0];
    bookDateInput.value = today;
    bookDateInput.min = today;
  }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tabName) {
  // Update nav menu active state
  document.querySelectorAll('.sidebar-menu .nav-tab').forEach(tab => {
    if (tab.getAttribute('data-tab') === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const targetPane = document.getElementById(`tab-${tabName}`);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  // Update page header
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  const tabTitles = {
    overview: { title: 'Front Desk Overview', sub: 'Manage daily appointments, walk-in arrivals, and patient check-ins' },
    appointments: { title: 'Appointments Schedule', sub: 'Comprehensive clinic booking roster and schedule management' },
    queue: { title: 'Patient Waiting Lounge & Queue', sub: 'Live chair occupancy, front desk arrival queues, and seating' },
    patients: { title: 'Patient Directory & Charts', sub: 'Search patient records, view medical demographics, or register walk-ins' },
    dentists: { title: 'Dentists on Duty', sub: 'Medical doctors roster, clinical shift hours, and availability' },
    billing: { title: 'Front Desk Check-Out & Billing', sub: 'Collect treatment payments, print receipts, and reconcile invoices' }
  };

  if (tabTitles[tabName]) {
    if (titleEl) titleEl.textContent = tabTitles[tabName].title;
    if (subEl) subEl.textContent = tabTitles[tabName].sub;
  }

  // Auto-scroll to top of main content
  const main = document.querySelector('.main-content');
  if (main) main.scrollTop = 0;
}

// ─── Global Data Loading ──────────────────────────────────────────────────────
async function loadDashboardData() {
  try {
    const authHeader = { 'Authorization': `Bearer ${token}` };

    const [apptsRes, patientsRes, dentistsRes, treatmentsRes, invoicesRes, schedulesRes] = await Promise.all([
      fetch(`${BASE_ORIGIN}/api/appointments`, { headers: authHeader }),
      fetch(`${BASE_ORIGIN}/api/patients`, { headers: authHeader }),
      fetch(`${BASE_ORIGIN}/api/dentists`, { headers: authHeader }),
      fetch(`${BASE_ORIGIN}/api/treatments`, { headers: authHeader }),
      fetch(`${BASE_ORIGIN}/api/invoices`, { headers: authHeader }),
      fetch(`${BASE_ORIGIN}/api/admin/staff-schedules`, { headers: authHeader }).catch(() => ({ ok: false }))
    ]);

    allAppointments = apptsRes.ok ? await apptsRes.json() : [];
    allPatients = patientsRes.ok ? await patientsRes.json() : [];
    allDentists = dentistsRes.ok ? await dentistsRes.json() : [];
    allTreatments = treatmentsRes.ok ? await treatmentsRes.json() : [];
    allInvoices = invoicesRes.ok ? await invoicesRes.json() : [];
    
    if (schedulesRes.ok && typeof schedulesRes.json === 'function') {
      allStaffSchedules = await schedulesRes.json();
    }

    // Populate modal selects
    populateModalSelects();

    // Render components
    renderMetrics();
    renderOverviewQueue();
    renderOverviewAppointments();
    renderOverviewDentists();
    renderAppointmentsTable(allAppointments);
    renderPatientQueue();
    renderPatientsTable(allPatients);
    renderDentistsRoster();
    renderBillingTable(allInvoices);
    renderFastCheckInDatalist();

  } catch (err) {
    console.error('[Dashboard Load Error]', err);
    showToast('Failed to load clinic data. Check connection.', 'error');
  }
}

// ─── Metrics Calculation ──────────────────────────────────────────────────────
function renderMetrics() {
  const todayStr = new Date().toISOString().split('T')[0];

  const todayAppts = allAppointments.filter(a => {
    if (!a.appointment_date) return false;
    return a.appointment_date.startsWith(todayStr);
  });

  const waitingCount = todayAppts.filter(a => a.status === 'Checked In').length;
  const inProgressCount = todayAppts.filter(a => a.status === 'In Progress').length;
  const completedCount = todayAppts.filter(a => a.status === 'Completed').length;
  
  const unpaidInvoices = allInvoices.filter(inv => {
    const s = (inv.status || '').toLowerCase();
    return s === 'unpaid' || s === 'pending';
  }).length;

  document.getElementById('stat-today-total').textContent = todayAppts.length;
  document.getElementById('stat-waiting-count').textContent = waitingCount;
  document.getElementById('stat-inprogress-count').textContent = inProgressCount;
  document.getElementById('stat-completed-count').textContent = completedCount;
  document.getElementById('stat-unpaid-invoices').textContent = unpaidInvoices;

  // Update badge counters in sidebar
  const badgeAppts = document.getElementById('nav-badge-appts');
  const badgeQueue = document.getElementById('nav-badge-queue');
  const badgeBilling = document.getElementById('nav-badge-billing');

  if (badgeAppts) badgeAppts.textContent = todayAppts.length;
  if (badgeQueue) badgeQueue.textContent = waitingCount;
  if (badgeBilling) badgeBilling.textContent = unpaidInvoices;
}

// ─── Overview Queue & Appointments ────────────────────────────────────────────
function renderOverviewQueue() {
  const container = document.getElementById('overview-queue-list');
  if (!container) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const waitingPatients = allAppointments.filter(a => {
    return a.appointment_date && a.appointment_date.startsWith(todayStr) && a.status === 'Checked In';
  });

  if (!waitingPatients.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-mug-hot"></i>
        <p>Waiting lounge is empty right now.</p>
        <span>Check in arriving patients from today's schedule.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = waitingPatients.map((appt, idx) => {
    const patientName = appt.patient ? (appt.patient.name || 'Patient') : 'Walk-in Patient';
    const treatmentName = appt.treatment ? appt.treatment.name : 'General Consultation';
    const apptTime = formatTime(appt.appointment_date);

    return `
      <div class="queue-card-item waiting-lounge">
        <div class="queue-num-pill">Q-${String(idx + 1).padStart(2, '0')}</div>
        <div class="queue-patient-info">
          <h4>${escapeHtml(patientName)}</h4>
          <div class="queue-patient-meta">
            <span><i class="fa-regular fa-clock"></i> Arrived: ${apptTime}</span>
            <span><i class="fa-solid fa-tooth"></i> ${escapeHtml(treatmentName)}</span>
          </div>
        </div>
        <div class="queue-actions">
          <button class="btn btn-sm btn-success" onclick="updateAppointmentStatus('${appt.id}', 'In Progress', 'Patient seated in dental chair')">
            <i class="fa-solid fa-chair"></i>
            <span>Seat in Chair</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderOverviewAppointments() {
  const tbody = document.getElementById('overview-appointments-body');
  if (!tbody) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppts = allAppointments.filter(a => a.appointment_date && a.appointment_date.startsWith(todayStr));

  if (!todayAppts.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="fa-regular fa-calendar-xmark" style="font-size: 1.5rem; margin-bottom: 6px; display: block;"></i>
          No appointments scheduled for today yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = todayAppts.map(appt => {
    const patientName = appt.patient ? (appt.patient.name || 'Patient') : 'Unknown';
    const contact = appt.patient ? (appt.patient.contact_number || appt.patient.email || 'N/A') : 'N/A';
    const treatmentName = appt.treatment ? appt.treatment.name : 'Consultation';
    const timeStr = formatTime(appt.appointment_date);
    const statusBadge = getStatusBadge(appt.status);

    let actionButton = '';
    if (appt.status === 'Pending' || appt.status === 'Approved') {
      actionButton = `
        <button class="btn btn-sm btn-gold" onclick="updateAppointmentStatus('${appt.id}', 'Checked In', 'Patient arrived and checked in')">
          <i class="fa-solid fa-user-check"></i>
          <span>Check In</span>
        </button>
      `;
    } else if (appt.status === 'Checked In') {
      actionButton = `
        <button class="btn btn-sm btn-success" onclick="updateAppointmentStatus('${appt.id}', 'In Progress', 'Seated with doctor')">
          <i class="fa-solid fa-chair"></i>
          <span>Call / Seat</span>
        </button>
      `;
    } else if (appt.status === 'In Progress') {
      actionButton = `
        <button class="btn btn-sm btn-primary" onclick="updateAppointmentStatus('${appt.id}', 'Completed', 'Treatment completed')">
          <i class="fa-solid fa-check-double"></i>
          <span>Complete Visit</span>
        </button>
      `;
    } else {
      actionButton = `<span class="text-muted" style="font-size: 0.78rem;">Finished</span>`;
    }

    return `
      <tr>
        <td><strong>${timeStr}</strong></td>
        <td><strong>${escapeHtml(patientName)}</strong></td>
        <td>${escapeHtml(contact)}</td>
        <td>${escapeHtml(treatmentName)}</td>
        <td>${statusBadge}</td>
        <td>${actionButton}</td>
      </tr>
    `;
  }).join('');
}

function renderOverviewDentists() {
  const container = document.getElementById('overview-dentists-list');
  if (!container) return;

  if (!allDentists.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-user-doctor"></i>
        <p>No dentists registered in clinic database.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allDentists.slice(0, 4).map(d => {
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--primary-subtle); color: var(--primary-color); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
            ${(d.name || 'D').charAt(0)}
          </div>
          <div>
            <strong style="font-size: 0.88rem; color: var(--dark-color);">${escapeHtml(d.name)}</strong>
            <div style="font-size: 0.74rem; color: #10b981; font-weight: 600;">&bull; On Duty Today</div>
          </div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="openBookWithDentist('${d.id}')">
          <i class="fa-solid fa-plus"></i> Book
        </button>
      </div>
    `;
  }).join('');
}

// ─── Notes Parser & Intake Extraction ─────────────────────────────────────────
function parseAppointmentNotes(rawNotes) {
  if (!rawNotes) return { hasData: false, freeNotes: '' };

  const parsed = {
    hasData: true,
    branch: '',
    dentist: '',
    emergency: '',
    conditions: '',
    allergies: '',
    meds: '',
    concern: '',
    hmo: '',
    anxiety: '',
    reminderPref: '',
    patientAddr: '',
    freeNotes: ''
  };

  const regex = /\[([^:]+):\s*([^\]]+)\]/g;
  let match;
  let matchCount = 0;

  while ((match = regex.exec(rawNotes)) !== null) {
    matchCount++;
    const key = match[1].trim().toLowerCase();
    const val = match[2].trim();

    if (key === 'branch') parsed.branch = val;
    else if (key === 'dentist') parsed.dentist = val;
    else if (key === 'emergency') parsed.emergency = val;
    else if (key === 'conditions') parsed.conditions = val;
    else if (key === 'allergies') parsed.allergies = val;
    else if (key === 'meds') parsed.meds = val;
    else if (key === 'concern') parsed.concern = val;
    else if (key === 'hmo') parsed.hmo = val;
    else if (key === 'anxietysupport') parsed.anxiety = val;
    else if (key === 'reminderpref') parsed.reminderPref = val;
    else if (key === 'patientaddr') parsed.patientAddr = val;
  }

  // Remove brackets to isolate actual notes written by patient or front desk
  const cleanFree = rawNotes.replace(/\[[^\]]+\]/g, '').trim();
  parsed.freeNotes = cleanFree;

  if (matchCount === 0 && !cleanFree) {
    parsed.hasData = false;
  }
  return parsed;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #0b3c4d, #14536a)',
  'linear-gradient(135deg, #0d9488, #14b8a6)',
  'linear-gradient(135deg, #2563eb, #60a5fa)',
  'linear-gradient(135deg, #7c3aed, #a78bfa)',
  'linear-gradient(135deg, #b45309, #f59e0b)',
  'linear-gradient(135deg, #be123c, #fb7185)'
];

function getAvatarColor(name) {
  if (!name) return AVATAR_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function updateStatusPillsCount() {
  const counts = {
    ALL: allAppointments.length,
    Pending: 0,
    Approved: 0,
    'Checked In': 0,
    'In Progress': 0,
    Completed: 0,
    Cancelled: 0
  };

  allAppointments.forEach(a => {
    if (a.status === 'Pending') counts.Pending++;
    else if (a.status === 'Approved' || a.status === 'Confirmed') counts.Approved++;
    else if (a.status === 'Checked In') counts['Checked In']++;
    else if (a.status === 'In Progress') counts['In Progress']++;
    else if (a.status === 'Completed') counts.Completed++;
    else if (a.status === 'Cancelled') counts.Cancelled++;
  });

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('count-pill-all', counts.ALL);
  setTxt('count-pill-pending', counts.Pending);
  setTxt('count-pill-approved', counts.Approved);
  setTxt('count-pill-checkedin', counts['Checked In']);
  setTxt('count-pill-inprogress', counts['In Progress']);
  setTxt('count-pill-completed', counts.Completed);
  setTxt('count-pill-cancelled', counts.Cancelled);
}

function selectStatusPill(status) {
  document.querySelectorAll('.status-pill-btn').forEach(btn => {
    if (btn.getAttribute('data-status') === status) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const hidden = document.getElementById('appts-status-filter');
  if (hidden) hidden.value = status;
  filterAppointments();
}

function clearApptSearch() {
  const input = document.getElementById('appts-search-input');
  if (input) {
    input.value = '';
    filterAppointments();
  }
}

function copyRefId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showToast(`Copied reference #${id}`, 'info');
  }).catch(() => {});
}

// ─── Full Appointments Tab ───────────────────────────────────────────────────
function renderAppointmentsTable(list) {
  const tbody = document.getElementById('appointments-table-body');
  const countInfo = document.getElementById('appts-count-info');
  if (!tbody) return;

  updateStatusPillsCount();

  if (!list || !list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">
          <div class="empty-state-box">
            <i class="fa-regular fa-calendar-xmark" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 10px;"></i>
            <h4 style="margin: 0 0 4px 0; color: #475569;">No appointments match your filters</h4>
            <p style="margin: 0; font-size: 0.84rem;">Try resetting your search, status tab, or date range.</p>
          </div>
        </td>
      </tr>
    `;
    if (countInfo) countInfo.textContent = 'Showing 0 appointments';
    return;
  }

  tbody.innerHTML = list.map(appt => {
    const patientName = appt.patient ? (appt.patient.name || 'Patient') : 'Unknown Patient';
    const patientPhone = appt.patient ? (appt.patient.contact_number || appt.patient.email || '') : '';
    const treatmentName = appt.treatment ? appt.treatment.name : 'General Consultation';
    const treatmentPrice = appt.treatment?.price ? Number(appt.treatment.price).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : '';
    const statusBadge = getStatusBadge(appt.status);
    const refId = appt.id ? appt.id.substring(0, 8).toUpperCase() : '--';
    const patientInitial = (patientName.charAt(0) || 'P').toUpperCase();
    const avatarBg = getAvatarColor(patientName);

    // Format Date & Time separately
    const d = appt.appointment_date ? new Date(appt.appointment_date) : null;
    const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--';

    // Parse bracketed intake metadata from notes
    const parsedNotes = parseAppointmentNotes(appt.notes);

    // Build intelligent chips
    let chipsHtml = '';
    if (parsedNotes.concern && parsedNotes.concern !== 'None' && parsedNotes.concern !== 'N/A') {
      chipsHtml += `<span class="notes-chip chip-concern" title="Chief Concern"><i class="fa-solid fa-tooth"></i> ${escapeHtml(parsedNotes.concern)}</span>`;
    }
    if (parsedNotes.hmo && parsedNotes.hmo !== 'None' && parsedNotes.hmo !== 'N/A') {
      chipsHtml += `<span class="notes-chip chip-hmo" title="HMO / Insurance"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(parsedNotes.hmo)}</span>`;
    }
    if (parsedNotes.allergies && parsedNotes.allergies.toLowerCase() !== 'none' && parsedNotes.allergies.toLowerCase() !== 'n/a') {
      chipsHtml += `<span class="notes-chip chip-alert" title="Allergies"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(parsedNotes.allergies)}</span>`;
    }

    let freeNoteHtml = '';
    if (parsedNotes.freeNotes) {
      freeNoteHtml = `<div class="notes-custom-preview"><i class="fa-regular fa-comment-dots"></i> "${escapeHtml(parsedNotes.freeNotes)}"</div>`;
    } else if (!chipsHtml) {
      chipsHtml = `<span class="notes-chip chip-default">Standard Consultation</span>`;
    }

    // Doctor info badge
    const dentistBadge = (parsedNotes.dentist && parsedNotes.dentist !== 'N/A' && parsedNotes.dentist !== 'No Preference')
      ? `<span class="doctor-badge" title="Assigned Doctor"><i class="fa-solid fa-user-doctor"></i> ${escapeHtml(parsedNotes.dentist)}</span>`
      : '';

    // Front Desk Action Buttons
    let mainActionBtn = '';
    if (appt.status === 'Pending') {
      mainActionBtn = `
        <button class="btn-action-main btn-action-confirm" onclick="updateAppointmentStatus('${appt.id}', 'Approved', 'Appointment confirmed')">
          <i class="fa-solid fa-check"></i>
          <span>Confirm</span>
        </button>
      `;
    } else if (appt.status === 'Approved' || appt.status === 'Confirmed') {
      mainActionBtn = `
        <button class="btn-action-main btn-action-checkin" onclick="updateAppointmentStatus('${appt.id}', 'Checked In', 'Patient arrived and checked in')">
          <i class="fa-solid fa-user-check"></i>
          <span>Check In</span>
        </button>
      `;
    } else if (appt.status === 'Checked In') {
      mainActionBtn = `
        <button class="btn-action-main btn-action-seat" onclick="updateAppointmentStatus('${appt.id}', 'In Progress', 'Patient seated with doctor')">
          <i class="fa-solid fa-chair"></i>
          <span>Seat Patient</span>
        </button>
      `;
    } else if (appt.status === 'In Progress') {
      mainActionBtn = `
        <button class="btn-action-main btn-action-complete" onclick="updateAppointmentStatus('${appt.id}', 'Completed', 'Visit marked completed')">
          <i class="fa-solid fa-circle-check"></i>
          <span>Complete</span>
        </button>
      `;
    } else if (appt.status === 'Cancelled') {
      mainActionBtn = `
        <button class="btn-action-main btn-action-rebook" onclick="openBookForPatient('${appt.patient_id}')">
          <i class="fa-solid fa-rotate-right"></i>
          <span>Rebook</span>
        </button>
      `;
    } else {
      mainActionBtn = `
        <span class="action-finished-label"><i class="fa-solid fa-check"></i> Finished</span>
      `;
    }

    // Secondary icon utilities
    let secondaryActions = '';
    if (appt.status !== 'Completed' && appt.status !== 'Cancelled') {
      secondaryActions = `
        <button class="btn-action-icon btn-icon-resched" title="Reschedule Date/Time" onclick="openRescheduleModal('${appt.id}')">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </button>
        <button class="btn-action-icon btn-icon-cancel" title="Cancel Appointment" onclick="cancelAppointmentPrompt('${appt.id}')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;
    }
    secondaryActions += `
      <button class="btn-action-icon btn-icon-view" title="View Full Intake Details" onclick="openApptIntakeDetails('${appt.id}')">
        <i class="fa-solid fa-eye"></i>
      </button>
    `;

    // Check if patient has delinquent overdue balance (> 30 days)
    const patientOverdueInvs = (allInvoices || []).filter(inv => {
      const pId = inv.patient_id || inv.patient?.id;
      const isMatch = pId && String(pId) === String(appt.patient_id);
      const isUnpaid = (inv.status || '').toLowerCase() === 'unpaid';
      const daysOld = Math.floor((Date.now() - new Date(inv.issued_at || inv.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
      return isMatch && isUnpaid && daysOld > 30;
    });

    let delinquentTag = '';
    if (patientOverdueInvs.length > 0) {
      const maxDays = Math.max(...patientOverdueInvs.map(i => Math.floor((Date.now() - new Date(i.issued_at || i.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24))));
      const totalOverdue = patientOverdueInvs.reduce((sum, i) => sum + (parseFloat(i.amount || i.total_amount) || 0), 0);
      delinquentTag = `<span class="patient-delinquent-tag" title="Account has ₱${totalOverdue.toFixed(2)} overdue for ${maxDays} days!"><i class="fa-solid fa-triangle-exclamation"></i> Overdue (${maxDays}d)</span>`;
    }

    return `
      <tr class="appt-row row-status-${(appt.status || '').toLowerCase().replace(/\s+/g, '')}">
        <!-- Date & Schedule -->
        <td>
          <div class="appt-time-cell">
            <div class="appt-date"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
            <div class="appt-time-row">
              <span class="appt-time-pill"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
              ${statusBadge}
            </div>
          </div>
        </td>

        <!-- Patient Info -->
        <td>
          <div class="patient-cell">
            <div class="patient-avatar-mini" style="background: ${avatarBg}">
              ${patientInitial}
            </div>
            <div class="patient-cell-meta">
              <div class="patient-name-row">
                <span class="patient-name">${escapeHtml(patientName)}</span>
                <span class="ref-pill" onclick="copyRefId('${refId}')" title="Click to copy Reference ID">#${refId}</span>
                ${delinquentTag}
              </div>
              <span class="patient-contact"><i class="fa-solid fa-phone"></i> ${escapeHtml(patientPhone || 'No phone recorded')}</span>
            </div>
          </div>
        </td>

        <!-- Procedure & Doctor -->
        <td>
          <div class="procedure-cell">
            <div class="procedure-icon-wrap"><i class="fa-solid fa-tooth"></i></div>
            <div class="procedure-meta">
              <span class="procedure-name">${escapeHtml(treatmentName)}</span>
              <div class="procedure-sub-row">
                <span class="procedure-price">${treatmentPrice || '<span class="text-muted">Standard Care</span>'}</span>
                ${dentistBadge}
              </div>
            </div>
          </div>
        </td>

        <!-- Clinical Intake & Notes -->
        <td>
          <div class="notes-smart-cell">
            <div class="chips-flex-row">
              ${chipsHtml}
            </div>
            ${freeNoteHtml}
            <button class="btn-open-intake" onclick="openApptIntakeDetails('${appt.id}')">
              <i class="fa-solid fa-file-waveform"></i>
              <span>Intake Details &rarr;</span>
            </button>
          </div>
        </td>

        <!-- Front Desk Actions -->
        <td style="text-align: right;">
          <div class="action-cell-container">
            ${mainActionBtn}
            <div class="secondary-actions-group">
              ${secondaryActions}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (countInfo) {
    countInfo.textContent = `Showing ${list.length} appointment${list.length !== 1 ? 's' : ''}`;
  }
}

function filterAppointments() {
  const searchTerm = (document.getElementById('appts-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('appts-status-filter')?.value || 'ALL';
  const dateFilter = document.getElementById('appts-date-filter')?.value || 'ALL';
  const customDate = document.getElementById('appts-custom-date')?.value;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const weekLater = new Date();
  weekLater.setDate(now.getDate() + 7);

  const filtered = allAppointments.filter(appt => {
    // Search match
    if (searchTerm) {
      const pName = (appt.patient?.name || '').toLowerCase();
      const pPhone = (appt.patient?.contact_number || '').toLowerCase();
      const pEmail = (appt.patient?.email || '').toLowerCase();
      const ref = (appt.id || '').toLowerCase();
      const notes = (appt.notes || '').toLowerCase();
      const treat = (appt.treatment?.name || '').toLowerCase();

      const matchesSearch = pName.includes(searchTerm) || pPhone.includes(searchTerm) ||
                            pEmail.includes(searchTerm) || ref.includes(searchTerm) ||
                            notes.includes(searchTerm) || treat.includes(searchTerm);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'Approved' && appt.status !== 'Approved' && appt.status !== 'Confirmed') return false;
      if (statusFilter !== 'Approved' && appt.status !== statusFilter) return false;
    }

    // Date filter
    if (dateFilter === 'TODAY') {
      if (!appt.appointment_date || !appt.appointment_date.startsWith(todayStr)) return false;
    } else if (dateFilter === 'TOMORROW') {
      if (!appt.appointment_date || !appt.appointment_date.startsWith(tomorrowStr)) return false;
    } else if (dateFilter === 'THIS_WEEK') {
      if (!appt.appointment_date) return false;
      const apptD = new Date(appt.appointment_date);
      if (apptD < new Date(todayStr) || apptD > weekLater) return false;
    } else if (dateFilter === 'CUSTOM' && customDate) {
      if (!appt.appointment_date || !appt.appointment_date.startsWith(customDate)) return false;
    }

    return true;
  });

  renderAppointmentsTable(filtered);
}

function handleApptDateFilterChange() {
  const filter = document.getElementById('appts-date-filter')?.value;
  const customInput = document.getElementById('appts-custom-date');
  if (customInput) {
    customInput.style.display = filter === 'CUSTOM' ? 'inline-block' : 'none';
  }
  filterAppointments();
}

// ─── Modal: Appointment Intake & Full Clinical Sheet ──────────────────────────
function openApptIntakeDetails(apptId) {
  const appt = allAppointments.find(a => a.id === apptId);
  if (!appt) return;

  const sub = document.getElementById('appt-details-sub');
  const body = document.getElementById('appt-details-body');
  const footer = document.getElementById('appt-details-footer');

  const refId = appt.id ? appt.id.substring(0, 8).toUpperCase() : '--';
  const patient = appt.patient || {};
  const treatment = appt.treatment || {};
  const parsed = parseAppointmentNotes(appt.notes);

  if (sub) {
    sub.innerHTML = `Ref <strong>#${refId}</strong> &bull; Scheduled for <strong>${formatDateTime(appt.appointment_date)}</strong> &bull; Status: ${getStatusBadge(appt.status)}`;
  }

  if (body) {
    body.innerHTML = `
      <div class="intake-sheet-grid">
        <!-- Section: Patient Profile -->
        <div class="intake-section-card">
          <div class="intake-card-title"><i class="fa-solid fa-user text-primary"></i> Patient Identity</div>
          <div class="intake-fields-grid">
            <div class="intake-field">
              <span class="intake-lbl">Full Name</span>
              <strong class="intake-val">${escapeHtml(patient.name || 'Unknown')}</strong>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Contact Number</span>
              <span class="intake-val">${escapeHtml(patient.contact_number || 'N/A')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Email Address</span>
              <span class="intake-val">${escapeHtml(patient.email || 'N/A')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Patient Address</span>
              <span class="intake-val">${escapeHtml(parsed.patientAddr || patient.address || 'Not specified')}</span>
            </div>
          </div>
        </div>

        <!-- Section: Dental Procedure & Doctor -->
        <div class="intake-section-card">
          <div class="intake-card-title"><i class="fa-solid fa-tooth text-primary"></i> Clinical Procedure</div>
          <div class="intake-fields-grid">
            <div class="intake-field">
              <span class="intake-lbl">Treatment</span>
              <strong class="intake-val text-primary">${escapeHtml(treatment.name || 'General Consultation')}</strong>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Estimated Price</span>
              <span class="intake-val">${treatment.price ? Number(treatment.price).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : 'Standard Care'}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Assigned Doctor</span>
              <span class="intake-val font-semibold">${escapeHtml(parsed.dentist || 'Assigned to Shift Doctor')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Clinic Branch</span>
              <span class="intake-val">${escapeHtml(parsed.branch || 'Fano Dental Clinic — Main Branch')}</span>
            </div>
          </div>
        </div>

        <!-- Section: Health Intake & Alerts -->
        <div class="intake-section-card intake-card-highlight">
          <div class="intake-card-title"><i class="fa-solid fa-heart-pulse text-amber"></i> Patient Health &amp; Medical Intake</div>
          <div class="intake-fields-grid">
            <div class="intake-field" style="grid-column: span 2;">
              <span class="intake-lbl">Chief Dental Concern</span>
              <strong class="intake-val" style="color: #92400e;">${escapeHtml(parsed.concern || 'None reported')}</strong>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Known Drug Allergies</span>
              <span class="intake-val">${parsed.allergies && parsed.allergies.toLowerCase() !== 'none' ? `<span class="badge-cancelled status-badge">⚠️ ${escapeHtml(parsed.allergies)}</span>` : 'None reported'}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Medical Conditions</span>
              <span class="intake-val">${escapeHtml(parsed.conditions || 'None')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Current Medications</span>
              <span class="intake-val">${escapeHtml(parsed.meds || 'None')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Dental Anxiety Support</span>
              <span class="intake-val">${parsed.anxiety && parsed.anxiety.toLowerCase() === 'yes' ? '<span class="status-badge badge-checkedin">Requested Gentle Care</span>' : 'Standard'}</span>
            </div>
          </div>
        </div>

        <!-- Section: Insurance & Billing -->
        <div class="intake-section-card">
          <div class="intake-card-title"><i class="fa-solid fa-shield-halved text-blue"></i> HMO &amp; Emergency Contacts</div>
          <div class="intake-fields-grid">
            <div class="intake-field">
              <span class="intake-lbl">HMO / Dental Insurance</span>
              <strong class="intake-val">${escapeHtml(parsed.hmo || 'Self-Pay / Cash')}</strong>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Emergency Contact</span>
              <span class="intake-val">${escapeHtml(parsed.emergency || 'N/A')}</span>
            </div>
            <div class="intake-field">
              <span class="intake-lbl">Reminder Preference</span>
              <span class="intake-val">${escapeHtml(parsed.reminderPref || 'SMS / Email')}</span>
            </div>
          </div>
        </div>

        ${parsed.freeNotes ? `
          <!-- Section: Custom Notes -->
          <div class="intake-section-card" style="grid-column: 1 / -1;">
            <div class="intake-card-title"><i class="fa-regular fa-comment-dots text-primary"></i> Front Desk &amp; Patient Notes</div>
            <div style="background: #f8fafc; padding: 12px 16px; border-radius: 10px; font-size: 0.88rem; color: #334155; line-height: 1.6;">
              ${escapeHtml(parsed.freeNotes)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (footer) {
    let modalActionBtns = `<button type="button" class="btn btn-outline" onclick="closeModal('modal-appt-details')">Close</button>`;

    if (appt.status === 'Pending') {
      modalActionBtns += `
        <button type="button" class="btn btn-primary" onclick="closeModal('modal-appt-details'); updateAppointmentStatus('${appt.id}', 'Approved', 'Appointment confirmed')">
          <i class="fa-solid fa-check"></i> Confirm Appointment
        </button>
      `;
    } else if (appt.status === 'Approved' || appt.status === 'Confirmed') {
      modalActionBtns += `
        <button type="button" class="btn btn-gold" onclick="closeModal('modal-appt-details'); updateAppointmentStatus('${appt.id}', 'Checked In', 'Patient checked in')">
          <i class="fa-solid fa-user-check"></i> Check In Patient
        </button>
      `;
    } else if (appt.status === 'Checked In') {
      modalActionBtns += `
        <button type="button" class="btn btn-success" onclick="closeModal('modal-appt-details'); updateAppointmentStatus('${appt.id}', 'In Progress', 'Patient seated in chair')">
          <i class="fa-solid fa-chair"></i> Seat in Dental Chair
        </button>
      `;
    } else if (appt.status === 'In Progress') {
      modalActionBtns += `
        <button type="button" class="btn btn-teal" onclick="closeModal('modal-appt-details'); updateAppointmentStatus('${appt.id}', 'Completed', 'Visit completed')">
          <i class="fa-solid fa-circle-check"></i> Complete &amp; Bill
        </button>
      `;
    }

    footer.innerHTML = modalActionBtns;
  }

  openModal('modal-appt-details');
}

// ─── Patient Queue Tab ────────────────────────────────────────────────────────
function renderPatientQueue() {
  const inTreatmentList = document.getElementById('in-treatment-list');
  const waitingLoungeList = document.getElementById('waiting-lounge-list');
  const badgeTreatment = document.getElementById('in-treatment-badge');
  const badgeWaiting = document.getElementById('waiting-lounge-badge');

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppts = allAppointments.filter(a => a.appointment_date && a.appointment_date.startsWith(todayStr));

  const inTreatment = todayAppts.filter(a => a.status === 'In Progress');
  const waitingLounge = todayAppts.filter(a => a.status === 'Checked In');

  if (badgeTreatment) badgeTreatment.textContent = `${inTreatment.length} Active`;
  if (badgeWaiting) badgeWaiting.textContent = `${waitingLounge.length} Waiting`;

  // Render In Treatment Chairs
  if (inTreatmentList) {
    if (!inTreatment.length) {
      inTreatmentList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-circle-check"></i>
          <p>No active procedures in dental chairs right now.</p>
        </div>
      `;
    } else {
      inTreatmentList.innerHTML = inTreatment.map(appt => {
        const patientName = appt.patient ? (appt.patient.name || 'Patient') : 'Unknown';
        const treatmentName = appt.treatment ? appt.treatment.name : 'Dental Procedure';
        const timeStr = formatTime(appt.appointment_date);

        return `
          <div class="queue-card-item active-chair">
            <div class="queue-num-pill" style="background: var(--accent-light); color: var(--accent-color);">
              <i class="fa-solid fa-tooth"></i>
            </div>
            <div class="queue-patient-info">
              <h4>${escapeHtml(patientName)}</h4>
              <div class="queue-patient-meta">
                <span><i class="fa-regular fa-clock"></i> Started: ${timeStr}</span>
                <span><i class="fa-solid fa-stethoscope"></i> ${escapeHtml(treatmentName)}</span>
              </div>
            </div>
            <div class="queue-actions">
              <button class="btn btn-sm btn-primary" onclick="updateAppointmentStatus('${appt.id}', 'Completed', 'Treatment finished')">
                <i class="fa-solid fa-check"></i> Complete &amp; Bill
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Waiting Lounge
  if (waitingLoungeList) {
    if (!waitingLounge.length) {
      waitingLoungeList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-couch"></i>
          <p>Waiting lounge is empty. Check in arriving patients.</p>
        </div>
      `;
    } else {
      waitingLoungeList.innerHTML = waitingLounge.map((appt, idx) => {
        const patientName = appt.patient ? (appt.patient.name || 'Patient') : 'Walk-in Patient';
        const treatmentName = appt.treatment ? appt.treatment.name : 'Consultation';
        const timeStr = formatTime(appt.appointment_date);

        return `
          <div class="queue-card-item waiting-lounge">
            <div class="queue-num-pill">Q-${String(idx + 1).padStart(2, '0')}</div>
            <div class="queue-patient-info">
              <h4>${escapeHtml(patientName)}</h4>
              <div class="queue-patient-meta">
                <span><i class="fa-regular fa-clock"></i> Checked In: ${timeStr}</span>
                <span><i class="fa-solid fa-tooth"></i> ${escapeHtml(treatmentName)}</span>
              </div>
            </div>
            <div class="queue-actions">
              <button class="btn btn-sm btn-success" onclick="updateAppointmentStatus('${appt.id}', 'In Progress', 'Patient seated in chair')">
                <i class="fa-solid fa-chair"></i> Call &amp; Seat
              </button>
              <button class="btn btn-sm btn-danger" onclick="cancelAppointmentPrompt('${appt.id}')" title="No-Show">
                <i class="fa-solid fa-user-xmark"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function renderFastCheckInDatalist() {
  const datalist = document.getElementById('today-patients-datalist');
  if (!datalist) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const pendingOrApproved = allAppointments.filter(a => {
    return a.appointment_date && a.appointment_date.startsWith(todayStr) &&
           (a.status === 'Pending' || a.status === 'Approved' || a.status === 'Confirmed');
  });

  datalist.innerHTML = pendingOrApproved.map(appt => {
    const p = appt.patient || {};
    return `<option value="${p.name || ''} - ${p.contact_number || ''}" data-id="${appt.id}"></option>`;
  }).join('');
}

function handleFastCheckIn() {
  const input = document.getElementById('fast-checkin-input');
  if (!input || !input.value.trim()) {
    showToast('Please type patient name or phone to check in.', 'warning');
    return;
  }

  const query = input.value.toLowerCase().trim();
  const todayStr = new Date().toISOString().split('T')[0];

  const match = allAppointments.find(a => {
    const isToday = a.appointment_date && a.appointment_date.startsWith(todayStr);
    if (!isToday) return false;
    const canCheckIn = a.status === 'Pending' || a.status === 'Approved' || a.status === 'Confirmed';
    if (!canCheckIn) return false;

    const pName = (a.patient?.name || '').toLowerCase();
    const pPhone = (a.patient?.contact_number || '').toLowerCase();
    return pName.includes(query) || pPhone.includes(query) || query.includes(pName);
  });

  if (!match) {
    showToast('No pending appointment found today matching that name.', 'error');
    return;
  }

  updateAppointmentStatus(match.id, 'Checked In', 'Arrived via fast check-in');
  input.value = '';
}

// ─── Patients Directory Tab ──────────────────────────────────────────────────
function renderPatientsTable(list) {
  const tbody = document.getElementById('patients-table-body');
  const countInfo = document.getElementById('patients-count-info');
  if (!tbody) return;

  if (!list || !list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="fa-solid fa-users-slash" style="font-size: 1.6rem; margin-bottom: 8px; display: block;"></i>
          No patient records found.
        </td>
      </tr>
    `;
    if (countInfo) countInfo.textContent = 'Showing 0 patients';
    return;
  }

  tbody.innerHTML = list.map(p => {
    const userObj = p.user || {};
    const name = userObj.name || `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() || 'Patient';
    const email = userObj.email || 'No email';
    const phone = userObj.contact_number || 'No phone';
    const address = p.address || userObj.address || 'N/A';
    const dob = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : 'N/A';
    const gender = p.gender || 'Not specified';
    
    let allergiesStr = 'None';
    if (Array.isArray(p.allergies) && p.allergies.length) {
      allergiesStr = `<span class="badge-cancelled status-badge" style="font-size: 0.72rem;">⚠️ ${escapeHtml(p.allergies.join(', '))}</span>`;
    }

    const patientId = p.id || userObj.id;

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--primary-color);">${escapeHtml(name)}</div>
          <div style="font-size: 0.74rem; color: #64748b;">Chart ID: #${(patientId || '').substring(0, 8)}</div>
        </td>
        <td>
          <div><i class="fa-solid fa-phone" style="font-size: 0.75rem; color: #94a3b8;"></i> ${escapeHtml(phone)}</div>
          <div style="font-size: 0.75rem; color: #64748b;"><i class="fa-solid fa-envelope" style="font-size: 0.75rem; color: #94a3b8;"></i> ${escapeHtml(email)}</div>
        </td>
        <td><small>${escapeHtml(address)}</small></td>
        <td>${dob} &bull; ${gender}</td>
        <td>
          <div>${allergiesStr}</div>
          <small class="text-muted">${escapeHtml(p.medical_notes || 'No medical alerts')}</small>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-primary" onclick="openBookForPatient('${patientId}')" title="Book Appointment">
              <i class="fa-solid fa-calendar-plus"></i> Book
            </button>
            <button class="btn btn-sm btn-outline" onclick="openPatientHistoryModal('${patientId}')" title="View Chart History">
              <i class="fa-solid fa-file-medical"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (countInfo) {
    countInfo.textContent = `Showing ${list.length} patient${list.length !== 1 ? 's' : ''}`;
  }
}

function filterPatients() {
  const searchTerm = (document.getElementById('patients-search-input')?.value || '').toLowerCase().trim();
  if (!searchTerm) {
    renderPatientsTable(allPatients);
    return;
  }

  const filtered = allPatients.filter(p => {
    const u = p.user || {};
    const name = (u.name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const phone = (u.contact_number || '').toLowerCase();
    const addr = (p.address || u.address || '').toLowerCase();
    const notes = (p.medical_notes || '').toLowerCase();

    return name.includes(searchTerm) || email.includes(searchTerm) ||
           phone.includes(searchTerm) || addr.includes(searchTerm) ||
           notes.includes(searchTerm);
  });

  renderPatientsTable(filtered);
}

// ─── Dentists On Duty Tab ─────────────────────────────────────────────────────
function renderDentistsRoster() {
  const container = document.getElementById('dentists-cards-container');
  if (!container) return;

  if (!allDentists.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-user-doctor"></i>
        <p>No dentists registered in clinic database.</p>
      </div>
    `;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = allDentists.map(d => {
    // Match staff schedule if available
    const sched = allStaffSchedules.find(s => s.email === d.email || s.name === d.name);
    const shift = sched ? sched.shift : '08:00 AM - 05:00 PM';
    const availability = sched ? sched.availability : 'On Duty';

    // Count today's appointments for this dentist
    const docAppts = allAppointments.filter(a => a.appointment_date && a.appointment_date.startsWith(todayStr));

    const statusBadge = availability === 'On Duty'
      ? `<span class="status-badge badge-completed">&bull; Available On Duty</span>`
      : `<span class="status-badge badge-pending">&bull; ${availability}</span>`;

    return `
      <div class="dentist-card">
        <div class="dentist-card-top">
          <div class="dentist-card-avatar">
            ${(d.name || 'D').charAt(0)}
          </div>
          <div class="dentist-card-meta">
            <h4>${escapeHtml(d.name)}</h4>
            <span>Licensed Dental Surgeon</span>
            <div style="margin-top: 4px;">${statusBadge}</div>
          </div>
        </div>

        <div class="dentist-schedule-info">
          <div class="schedule-row">
            <span>Shift Hours:</span>
            <strong>${shift}</strong>
          </div>
          <div class="schedule-row">
            <span>Contact Phone:</span>
            <strong>${d.contact_number || 'Clinic Extension'}</strong>
          </div>
          <div class="schedule-row">
            <span>Today's Total Appts:</span>
            <strong style="color: var(--primary-color);">${docAppts.length} patients</strong>
          </div>
        </div>

        <button class="btn btn-primary" style="width: 100%; justify-content: center;" onclick="openBookWithDentist('${d.id}')">
          <i class="fa-solid fa-calendar-plus"></i>
          <span>Schedule with Doctor</span>
        </button>
      </div>
    `;
  }).join('');
}

// ─── Billing & Check-Out Tab ──────────────────────────────────────────────────
function renderBillingTable(list) {
  const tbody = document.getElementById('billing-table-body');
  const countInfo = document.getElementById('billing-count-info');
  if (!tbody) return;

  if (!list || !list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="fa-solid fa-receipt" style="font-size: 1.6rem; margin-bottom: 8px; display: block;"></i>
          No invoices matched the current filter.
        </td>
      </tr>
    `;
    if (countInfo) countInfo.textContent = 'Showing 0 invoices';
    return;
  }

  tbody.innerHTML = list.map(inv => {
    const patientName = inv.patient ? (inv.patient.name || inv.patient.email || 'Patient') : 'Walk-in Patient';
    const amount = Number(inv.amount || inv.total_amount || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    const isPaid = (inv.status || '').toLowerCase() === 'paid';
    const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
    const issuedDate = new Date(inv.issued_at || inv.created_at || Date.now());
    const daysOld = Math.max(0, Math.floor((Date.now() - issuedDate.getTime()) / (1000 * 60 * 60 * 24)));
    const isOverdue = !isPaid && !isWrittenOff && daysOld > 30;

    let statusBadge = '';
    if (isPaid) {
      statusBadge = `<span class="status-badge badge-completed"><i class="fa-solid fa-check"></i> Paid</span>`;
    } else if (isWrittenOff) {
      statusBadge = `<span class="status-badge" style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1;"><i class="fa-solid fa-ban"></i> Bad Debt (Written Off)</span>`;
    } else if (isOverdue) {
      statusBadge = `<span class="status-badge badge-cancelled" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;" title="${daysOld} days past due"><i class="fa-solid fa-triangle-exclamation"></i> Overdue (${daysOld}d)</span>`;
    } else {
      statusBadge = `<span class="status-badge badge-pending"><i class="fa-solid fa-clock"></i> Unpaid (${daysOld}d)</span>`;
    }

    const dateIssued = inv.issued_at || inv.created_at ? new Date(inv.issued_at || inv.created_at).toLocaleDateString() : 'N/A';
    const invoiceNum = inv.id ? inv.id.substring(0, 8).toUpperCase() : '--';

    let actionBtn = '';
    if (isPaid) {
      actionBtn = `
        <span class="text-muted" style="font-size: 0.8rem;"><i class="fa-solid fa-circle-check text-green"></i> Settled</span>
      `;
    } else if (isWrittenOff) {
      actionBtn = `
        <span class="text-muted" style="font-size: 0.78rem; font-style: italic;">Written Off</span>
      `;
    } else {
      actionBtn = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <button class="btn btn-sm btn-success" onclick="openPaymentModal('${inv.id}', '${escapeHtml(patientName)}', '${inv.amount || inv.total_amount || 0}')" title="Collect payment">
            <i class="fa-solid fa-cash-register"></i> Collect
          </button>
          ${daysOld >= 60 ? `
            <button class="btn btn-sm" onclick="markInvoiceAsBadDebt('${inv.id}', '${escapeHtml(patientName)}', '${daysOld}')" title="Write off as uncollectible bad debt" style="background: #f1f5f9; color: #b91c1c; border: 1px solid #fecaca; font-size: 0.74rem; padding: 4px 8px;">
              <i class="fa-solid fa-ban"></i> Write Off
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <tr>
        <td><strong>#INV-${invoiceNum}</strong></td>
        <td><strong>${escapeHtml(patientName)}</strong></td>
        <td>${dateIssued}</td>
        <td><strong style="color: var(--primary-color);">${amount}</strong></td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');

  if (countInfo) {
    countInfo.textContent = `Showing ${list.length} invoice${list.length !== 1 ? 's' : ''}`;
  }
}

async function markInvoiceAsBadDebt(invId, patientName, daysOld) {
  if (!confirm(`Are you sure you want to write off the invoice for ${patientName} (${daysOld} days overdue) as uncollectible Bad Debt?\n\nThis will update its accounting status in accordance with clinic policy.`)) {
    return;
  }

  try {
    const res = await fetch(`${BASE_ORIGIN}/api/invoices/${invId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      body: JSON.stringify({ status: 'Written Off' })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update invoice');
    }

    showToast(`Invoice for ${patientName} written off as bad debt.`, 'info');
    await loadInitialData();
  } catch (err) {
    showToast(err.message || 'Failed to write off invoice', 'error');
  }
}

function filterBilling() {
  const query = (document.getElementById('billing-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('billing-status-filter')?.value || 'ALL';

  const filtered = allInvoices.filter(inv => {
    if (query) {
      const pName = (inv.patient?.name || '').toLowerCase();
      const invId = (inv.id || '').toLowerCase();
      if (!pName.includes(query) && !invId.includes(query)) return false;
    }

    if (statusFilter !== 'ALL') {
      const s = (inv.status || '').toLowerCase();
      if (statusFilter === 'Unpaid' && s === 'paid') return false;
      if (statusFilter === 'Paid' && s !== 'paid') return false;
    }

    return true;
  });

  renderBillingTable(filtered);
}

// ─── Status Updates (Check In, Call In, Complete, Cancel) ─────────────────────
async function updateAppointmentStatus(appointmentId, newStatus, actionDescription) {
  try {
    const res = await fetch(`${BASE_ORIGIN}/api/appointments/${appointmentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update appointment.');
    }

    showToast(`Success: ${actionDescription || newStatus}`, 'success');
    await loadDashboardData();

  } catch (err) {
    console.error('[Status Update Error]', err);
    showToast(err.message, 'error');
  }
}

function cancelAppointmentPrompt(appointmentId) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  updateAppointmentStatus(appointmentId, 'Cancelled', 'Appointment cancelled');
}

// ─── Modals: Open & Close ─────────────────────────────────────────────────────
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

// Close on backdrop click
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

function populateModalSelects() {
  // Patient select
  const patientSelect = document.getElementById('book-patient-select');
  if (patientSelect) {
    patientSelect.innerHTML = `<option value="">-- Select or Search Patient --</option>` +
      allPatients.map(p => {
        const u = p.user || {};
        const name = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Patient';
        const phone = u.contact_number ? `(${u.contact_number})` : '';
        const id = p.id || u.id;
        return `<option value="${id}">${escapeHtml(name)} ${phone}</option>`;
      }).join('');
  }

  // Treatment select
  const treatmentSelect = document.getElementById('book-treatment-select');
  if (treatmentSelect) {
    treatmentSelect.innerHTML = `<option value="">-- Select Treatment --</option>` +
      allTreatments.map(t => {
        const price = Number(t.price || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
        return `<option value="${t.id}">${escapeHtml(t.name)} (${price})</option>`;
      }).join('');
  }

  // Dentist select
  const dentistSelect = document.getElementById('book-dentist-select');
  if (dentistSelect) {
    dentistSelect.innerHTML = `<option value="">Any Available Dentist</option>` +
      allDentists.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  }
}

function openBookAppointmentModal() {
  openModal('modal-book-appointment');
  handleBookDateChange();
}

function openBookForPatient(patientId) {
  openModal('modal-book-appointment');
  const patientSelect = document.getElementById('book-patient-select');
  if (patientSelect) patientSelect.value = patientId;
  handleBookDateChange();
}

function openBookWithDentist(dentistId) {
  openModal('modal-book-appointment');
  const dentistSelect = document.getElementById('book-dentist-select');
  if (dentistSelect) dentistSelect.value = dentistId;
  handleBookDateChange();
}

function switchModalToRegister() {
  closeModal('modal-book-appointment');
  openRegisterPatientModal();
}

function openRegisterPatientModal() {
  const form = document.getElementById('form-register-patient');
  if (form) form.reset();
  openModal('modal-register-patient');
}

// ─── Time Slot Generator ──────────────────────────────────────────────────────
function handleBookDateChange() {
  const dateInput = document.getElementById('book-date');
  const timeSelect = document.getElementById('book-time');
  if (!dateInput || !timeSelect) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    timeSelect.innerHTML = `<option value="">Select Date First</option>`;
    return;
  }

  const standardSlots = [
    '08:00:00', '09:00:00', '10:00:00', '11:00:00',
    '13:00:00', '14:00:00', '15:00:00', '16:00:00', '17:00:00'
  ];

  // Find booked slots for this date
  const bookedTimes = allAppointments
    .filter(a => a.appointment_date && a.appointment_date.startsWith(dateVal) && a.status !== 'Cancelled')
    .map(a => a.appointment_date.split('T')[1]?.substring(0, 8));

  timeSelect.innerHTML = standardSlots.map(time => {
    const isTaken = bookedTimes.includes(time);
    const label = formatTime(`${dateVal}T${time}`);
    return `<option value="${time}" ${isTaken ? 'disabled style="color: #cbd5e1;"' : ''}>${label} ${isTaken ? '(Occupied)' : '(Available)'}</option>`;
  }).join('');
}

// ─── Appointment Booking Handler ──────────────────────────────────────────────
async function handleBookAppointment(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-appointment');
  if (btn) btn.disabled = true;

  try {
    const patientId = document.getElementById('book-patient-select').value;
    const treatmentId = document.getElementById('book-treatment-select').value;
    const dateVal = document.getElementById('book-date').value;
    const timeVal = document.getElementById('book-time').value;
    const statusVal = document.getElementById('book-status').value;
    const notesVal = document.getElementById('book-notes').value;

    if (!patientId || !treatmentId || !dateVal || !timeVal) {
      throw new Error('Please fill in all required fields.');
    }

    const appointmentDateTime = `${dateVal}T${timeVal}`;

    const res = await fetch(`${BASE_ORIGIN}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        patient_id: patientId,
        treatment_id: treatmentId,
        appointment_date: appointmentDateTime,
        status: statusVal,
        notes: notesVal
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Booking failed.');
    }

    showToast('Appointment booked successfully!', 'success');
    closeModal('modal-book-appointment');
    document.getElementById('form-book-appointment')?.reset();
    await loadDashboardData();

  } catch (err) {
    console.error('[Book Appointment Error]', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Register Walk-In Patient Handler ─────────────────────────────────────────
async function handleRegisterPatient(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-patient');
  if (btn) btn.disabled = true;

  try {
    const firstName = document.getElementById('reg-first-name').value.trim();
    const lastName = document.getElementById('reg-last-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const address = document.getElementById('reg-address').value.trim();
    const dob = document.getElementById('reg-dob').value;
    const gender = document.getElementById('reg-gender').value;
    const bloodType = document.getElementById('reg-blood').value;
    const allergies = document.getElementById('reg-allergies').value.trim();
    const medicalNotes = document.getElementById('reg-notes').value.trim();

    if (!firstName || !lastName || !email || !phone) {
      throw new Error('First Name, Last Name, Email, and Phone are required.');
    }

    const res = await fetch(`${BASE_ORIGIN}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        contactNumber: phone,
        address,
        password: 'patient123',
        role: 'Patient',
        dob,
        gender,
        bloodType,
        allergies,
        medicalNotes
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Registration failed.');
    }

    const newUser = await res.json();
    showToast(`Walk-in patient ${firstName} registered successfully!`, 'success');
    closeModal('modal-register-patient');
    document.getElementById('form-register-patient')?.reset();

    await loadDashboardData();

    // Prompt to book appointment immediately
    if (confirm(`Would you like to book an appointment for ${firstName} ${lastName} right now?`)) {
      openBookForPatient(newUser.id);
    }

  } catch (err) {
    console.error('[Register Patient Error]', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Reschedule Modal & Handler ───────────────────────────────────────────────
function openRescheduleModal(appointmentId) {
  const appt = allAppointments.find(a => a.id === appointmentId);
  if (!appt) return;

  document.getElementById('reschedule-appt-id').value = appt.id;
  document.getElementById('reschedule-patient-name').textContent = appt.patient?.name || 'Patient';
  document.getElementById('reschedule-treatment-name').textContent = appt.treatment?.name || 'Consultation';
  document.getElementById('reschedule-current-time').textContent = formatDateTime(appt.appointment_date);

  const dateInput = document.getElementById('reschedule-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    dateInput.min = today;
  }

  openModal('modal-reschedule');
  handleRescheduleDateChange();
}

function handleRescheduleDateChange() {
  const dateInput = document.getElementById('reschedule-date');
  const timeSelect = document.getElementById('reschedule-time');
  if (!dateInput || !timeSelect) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    timeSelect.innerHTML = `<option value="">Select Date First</option>`;
    return;
  }

  const standardSlots = [
    '08:00:00', '09:00:00', '10:00:00', '11:00:00',
    '13:00:00', '14:00:00', '15:00:00', '16:00:00', '17:00:00'
  ];

  const currentApptId = document.getElementById('reschedule-appt-id').value;

  const bookedTimes = allAppointments
    .filter(a => a.id !== currentApptId && a.appointment_date && a.appointment_date.startsWith(dateVal) && a.status !== 'Cancelled')
    .map(a => a.appointment_date.split('T')[1]?.substring(0, 8));

  timeSelect.innerHTML = standardSlots.map(time => {
    const isTaken = bookedTimes.includes(time);
    const label = formatTime(`${dateVal}T${time}`);
    return `<option value="${time}" ${isTaken ? 'disabled style="color: #cbd5e1;"' : ''}>${label} ${isTaken ? '(Occupied)' : '(Available)'}</option>`;
  }).join('');
}

async function handleRescheduleAppointment(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-reschedule');
  if (btn) btn.disabled = true;

  try {
    const apptId = document.getElementById('reschedule-appt-id').value;
    const dateVal = document.getElementById('reschedule-date').value;
    const timeVal = document.getElementById('reschedule-time').value;
    const reason = document.getElementById('reschedule-reason').value;

    if (!apptId || !dateVal || !timeVal) {
      throw new Error('Please select a new date and time slot.');
    }

    const newDateTime = `${dateVal}T${timeVal}`;

    const res = await fetch(`${BASE_ORIGIN}/api/appointments/${apptId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        appointment_date: newDateTime,
        status: 'Rescheduled',
        notes: reason ? `Rescheduled: ${reason}` : undefined
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Reschedule failed.');
    }

    showToast('Appointment rescheduled successfully!', 'success');
    closeModal('modal-reschedule');
    await loadDashboardData();

  } catch (err) {
    console.error('[Reschedule Error]', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Payment Check-Out Handler ────────────────────────────────────────────────
function openPaymentModal(invoiceId, patientName, amount) {
  document.getElementById('payment-invoice-id').value = invoiceId;
  document.getElementById('payment-patient-name').textContent = patientName;
  document.getElementById('payment-invoice-ref').textContent = `#INV-${invoiceId.substring(0, 8).toUpperCase()}`;
  document.getElementById('payment-total-amount').textContent = Number(amount).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  document.getElementById('payment-amount-paid').value = amount;

  openModal('modal-payment');
}

async function handleRecordPayment(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-payment');
  if (btn) btn.disabled = true;

  try {
    const invoiceId = document.getElementById('payment-invoice-id').value;
    const method = document.getElementById('payment-method').value;
    const amountPaid = document.getElementById('payment-amount-paid').value;
    const refNo = document.getElementById('payment-ref-no').value;

    const res = await fetch(`${BASE_ORIGIN}/api/invoices/${invoiceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        status: 'Paid',
        paid_amount: parseFloat(amountPaid) || 0
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Payment processing failed.');
    }

    showToast(`Payment collected via ${method}. Invoice marked Paid!`, 'success');
    closeModal('modal-payment');
    await loadDashboardData();

  } catch (err) {
    console.error('[Payment Error]', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── Patient History Modal ────────────────────────────────────────────────────
async function openPatientHistoryModal(patientId) {
  openModal('modal-patient-history');
  const body = document.getElementById('history-modal-body');
  const sub = document.getElementById('history-patient-sub');
  const bookBtn = document.getElementById('btn-book-from-history');

  if (body) body.innerHTML = `<div class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin"></i> Loading chart history...</div>`;

  try {
    const res = await fetch(`${BASE_ORIGIN}/api/patients/${patientId}/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Could not fetch patient chart.');
    const data = await res.json();

    const patient = data.patient || {};
    const appointments = data.appointments || [];
    const prescriptions = data.prescriptions || [];

    if (sub) sub.textContent = `Chart for ${patient.name || 'Patient'} &bull; ${patient.email || ''}`;
    if (bookBtn) {
      bookBtn.onclick = () => {
        closeModal('modal-patient-history');
        openBookForPatient(patientId);
      };
    }

    body.innerHTML = `
      <div class="info-callout" style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 6px 0; color: var(--primary-color);">${escapeHtml(patient.name || 'Patient')}</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.82rem;">
          <div><strong>Phone:</strong> ${patient.contact_number || 'N/A'}</div>
          <div><strong>Email:</strong> ${patient.email || 'N/A'}</div>
          <div><strong>DOB / Gender:</strong> ${patient.date_of_birth || 'N/A'} &bull; ${patient.gender || 'N/A'}</div>
          <div><strong>Blood Type:</strong> ${patient.blood_type || 'Unknown'}</div>
          <div style="grid-column: span 2;">
            <strong>Allergies:</strong>
            ${Array.isArray(patient.allergies) && patient.allergies.length ? `<span class="badge-cancelled status-badge">${patient.allergies.join(', ')}</span>` : 'No known drug allergies'}
          </div>
          <div style="grid-column: span 2;">
            <strong>Medical Notes:</strong> ${escapeHtml(patient.medical_notes || 'None recorded.')}
          </div>
        </div>
      </div>

      <h4 class="form-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Past Clinic Appointments (${appointments.length})</h4>
      ${appointments.length ? `
        <div class="table-responsive" style="margin-bottom: 18px;">
          <table class="medical-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Treatment</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${appointments.map(a => `
                <tr>
                  <td>${formatDateTime(a.appointment_date)}</td>
                  <td>${escapeHtml(a.treatment ? a.treatment.name : 'Consultation')}</td>
                  <td>${getStatusBadge(a.status)}</td>
                  <td><small>${escapeHtml(a.notes || 'N/A')}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-muted" style="font-size: 0.85rem;">No previous appointment history.</p>'}

      <h4 class="form-section-title"><i class="fa-solid fa-prescription"></i> Prescriptions History (${prescriptions.length})</h4>
      ${prescriptions.length ? `
        <div class="table-responsive">
          <table class="medical-table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Instructions</th>
              </tr>
            </thead>
            <tbody>
              ${prescriptions.map(p => `
                <tr>
                  <td><strong>${escapeHtml(p.medication || '')}</strong></td>
                  <td>${escapeHtml(p.dosage || '')}</td>
                  <td><small>${escapeHtml(p.instructions || '')}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-muted" style="font-size: 0.85rem;">No prescribed medications on chart.</p>'}
    `;

  } catch (err) {
    console.error('[Chart History Error]', err);
    if (body) body.innerHTML = `<div class="text-center py-4 text-danger"><i class="fa-solid fa-circle-exclamation"></i> Error loading patient chart history.</div>`;
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
function formatDateTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function formatTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function getStatusBadge(status) {
  const s = status || 'Pending';
  switch (s) {
    case 'Approved':
    case 'Confirmed':
      return `<span class="status-badge badge-approved"><i class="fa-solid fa-check"></i> Confirmed</span>`;
    case 'Checked In':
      return `<span class="status-badge badge-checkedin"><i class="fa-solid fa-user-clock"></i> In Lounge</span>`;
    case 'In Progress':
      return `<span class="status-badge badge-inprogress"><i class="fa-solid fa-tooth"></i> In Chair</span>`;
    case 'Completed':
      return `<span class="status-badge badge-completed"><i class="fa-solid fa-circle-check"></i> Completed</span>`;
    case 'Cancelled':
      return `<span class="status-badge badge-cancelled"><i class="fa-solid fa-ban"></i> Cancelled</span>`;
    case 'Rescheduled':
      return `<span class="status-badge badge-pending"><i class="fa-solid fa-clock-rotate-left"></i> Rescheduled</span>`;
    default:
      return `<span class="status-badge badge-pending">&bull; ${escapeHtml(s)}</span>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-circle-exclamation';
  if (type === 'warning') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}

