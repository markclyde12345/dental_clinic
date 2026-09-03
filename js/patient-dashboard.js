// ═══════════════════════════════════════════════════════════
//  Patient Dashboard — JS Logic
// ═══════════════════════════════════════════════════════════

const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';
const API = `${BASE_ORIGIN}/api`;

// Global connection error handler
function showConnectionError(msg) {
  showToast(msg || 'Connection error. Please check the server.', 'error');
}

// API fetch wrapper with error handling
function apiFetch(endpoint, options = {}) {
  return fetch(`${API}${endpoint}`, options)
    .then(res => {
      if (!res.ok) {
        // Show connection error only for server-side issues (5xx)
        if (res.status >= 500) {
          showConnectionError(`Server error ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    })
    .catch(err => {
      // Show connection error only for network failures (no HTTP status)
      const msg = err.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        showConnectionError(msg);
      }
      throw err;
    });
}

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
let user = null;
let allAppointments = [];
let allInvoices = [];

// ─── Auth Gate ──────────────────────────────────────────────
if (!token) {
  window.location.href = 'login.html';
} else {
  apiFetch('/auth/profile', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(data => {
    if (!data || data.message) { logout(); return; }
    user = data;
    initDashboard();
  })
  .catch(() => logout());
}

// ─── Init ───────────────────────────────────────────────────
function initDashboard() {
  setDateTime();
  setGreeting();
  renderUserInfo();
  loadAppointments();
  loadInvoices();
  loadTreatments();
  setupBookingWizard();
  setupSettings();
  checkPaymentReturnStatus();
}

// ─── Settings ────────────────────────────────────────────────
const LANG_STRINGS = {
  en: {
    sectionOverview: 'Overview', sectionAppointments: 'Book Appointment',
    sectionRecords: 'My Records', sectionBilling: 'Billing & Invoices',
    sectionProfile: 'My Profile', sectionSettings: 'Settings',
    navOverview: 'Overview', navAppointments: 'Appointments',
    navRecords: 'Records', navBilling: 'Billing',
    navProfile: 'Profile', navSettings: 'Settings',
    saveSettings: 'Save All Settings',
    settingsTitle: 'Settings', settingsSubtitle: 'Customize your dashboard experience.',
  },
  tl: {
    sectionOverview: 'Pangkalahatang-tanaw', sectionAppointments: 'Mag-book ng Appointment',
    sectionRecords: 'Aking mga Rekord', sectionBilling: 'Bayarin at Mga Invoice',
    sectionProfile: 'Aking Profile', sectionSettings: 'Mga Setting',
    navOverview: 'Pangkalahatang-tanaw', navAppointments: 'Appointment',
    navRecords: 'Rekord', navBilling: 'Bayarin',
    navProfile: 'Profile', navSettings: 'Setting',
    saveSettings: 'I-save ang Lahat ng Setting',
    settingsTitle: 'Mga Setting', settingsSubtitle: 'I-customize ang iyong dashboard.',
  },
  es: {
    sectionOverview: 'Resumen', sectionAppointments: 'Reservar Cita',
    sectionRecords: 'Mis Registros', sectionBilling: 'Facturación',
    sectionProfile: 'Mi Perfil', sectionSettings: 'Configuración',
    navOverview: 'Resumen', navAppointments: 'Citas',
    navRecords: 'Registros', navBilling: 'Facturación',
    navProfile: 'Perfil', navSettings: 'Configuración',
    saveSettings: 'Guardar Configuración',
    settingsTitle: 'Configuración', settingsSubtitle: 'Personaliza tu experiencia.',
  }
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pd-theme', theme);
}

function applyLanguage(lang) {
  const s = LANG_STRINGS[lang] || LANG_STRINGS.en;
  localStorage.setItem('pd-lang', lang);

  // Nav items — text is the last text node after the SVG icon
  const navMap = {
    overview: s.navOverview, appointments: s.navAppointments,
    records: s.navRecords, billing: s.navBilling,
    profile: s.navProfile, settings: s.navSettings
  };
  document.querySelectorAll('a.nav-item[data-section]').forEach(item => {
    const sec = item.getAttribute('data-section');
    if (!navMap[sec]) return;
    // The text node is after the SVG — find and update it
    for (let i = item.childNodes.length - 1; i >= 0; i--) {
      const node = item.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = '\n              ' + navMap[sec] + '\n            ';
        break;
      }
    }
  });

  // Section titles
  const sectionTitles = {
    overview: s.sectionOverview, appointments: s.sectionAppointments,
    records: s.sectionRecords, billing: s.sectionBilling,
    profile: s.sectionProfile, settings: s.sectionSettings
  };
  document.querySelectorAll('.content-section').forEach(sec => {
    const id = sec.id.replace('-section', '');
    const titleEl = sec.querySelector('.section-title');
    if (titleEl && sectionTitles[id]) titleEl.textContent = sectionTitles[id];
  });

  // Save button
  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) saveBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    ${s.saveSettings}
  `;
}

function setupSettings() {
  // Load saved prefs
  const savedTheme = localStorage.getItem('pd-theme') || 'blue';
  const savedLang  = localStorage.getItem('pd-lang')  || 'en';
  const savedNotifEmail     = localStorage.getItem('pd-notif-email')     !== 'false';
  const savedNotifSms       = localStorage.getItem('pd-notif-sms')       !== 'false';
  const savedNotifReminders = localStorage.getItem('pd-notif-reminders') !== 'false';

  // Apply saved theme & language immediately
  applyTheme(savedTheme);
  applyLanguage(savedLang);

  // Set selects to match saved values
  const themeSelect = document.getElementById('settings-theme');
  const langSelect  = document.getElementById('settings-lang');
  if (themeSelect) themeSelect.value = savedTheme;
  if (langSelect)  langSelect.value  = savedLang;

  // Set notification toggles
  const notifEmail     = document.getElementById('notify-email');
  const notifSms       = document.getElementById('notify-sms');
  const notifReminders = document.getElementById('notify-reminders');
  if (notifEmail)     notifEmail.checked     = savedNotifEmail;
  if (notifSms)       notifSms.checked       = savedNotifSms;
  if (notifReminders) notifReminders.checked = savedNotifReminders;

  // Live theme preview on change
  themeSelect?.addEventListener('change', () => {
    applyTheme(themeSelect.value);
    showToast('Theme updated!', 'success');
  });

  // Live language change
  langSelect?.addEventListener('change', () => {
    applyLanguage(langSelect.value);
    showToast('Language changed!', 'success');
  });

  // Save All Settings button
  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    const theme = themeSelect?.value || 'blue';
    const lang  = langSelect?.value  || 'en';

    applyTheme(theme);
    applyLanguage(lang);

    // Save notification prefs
    if (notifEmail)     localStorage.setItem('pd-notif-email',     notifEmail.checked);
    if (notifSms)       localStorage.setItem('pd-notif-sms',       notifSms.checked);
    if (notifReminders) localStorage.setItem('pd-notif-reminders', notifReminders.checked);

    showToast('✓ Settings saved successfully!', 'success');
  });
}

// ─── Date & Greeting ────────────────────────────────────────
function setDateTime() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const el = document.getElementById('header-date');
  if (el) el.textContent = dateStr;
}

function setGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';
  const name = user.firstName || user.name?.split(' ')[0] || 'there';
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = `${greeting}, ${name}! Here's your dental health summary.`;
}

// ─── Render User Info ────────────────────────────────────────
function renderUserInfo() {
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient';
  const initial = displayName.charAt(0).toUpperCase();

  // Sidebar
  safeSet('sidebar-user-name', displayName);
  safeSet('sidebar-avatar', initial);

  // Header
  safeSet('header-user-name', displayName.split(' ')[0]);
  safeSet('header-avatar', initial);

  // Patient detail card (overview)
  safeSet('patient-full-name', displayName);
  safeSet('patient-avatar-lg', initial);

  // Generate a display patient ID from user id
  const shortId = user.id ? user.id.slice(0, 8).toUpperCase() : '0000';
  safeSet('patient-id-tag', `PT-${new Date().getFullYear()}-${shortId.slice(0,4)}`);

  // Member since
  if (user.created_at || user.createdAt) {
    const since = new Date(user.created_at || user.createdAt).toLocaleDateString('en-US', {
      month: 'long', year: 'numeric'
    });
    safeSet('detail-since', since);
  }

  // Contact details
  safeSet('detail-phone', user.contactNumber || '—');
  safeSet('detail-email', user.email || '—');
  safeSet('detail-address', user.address || '—');

  // Profile section
  safeSet('profile-hero-name', displayName);
  safeSet('profile-hero-email', user.email || '');
  safeSet('profile-hero-avatar', initial);

  // Profile form pre-fill
  safeVal('profile-first-name', user.firstName || '');
  safeVal('profile-last-name', user.lastName || '');
  safeVal('profile-email', user.email || '');
  safeVal('profile-phone', user.contactNumber || '');
  safeVal('profile-address', user.address || '');
}

// ─── Load Appointments ───────────────────────────────────────
function loadAppointments() {
  apiFetch('/appointments', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(data => {
    if (!Array.isArray(data)) return;
    allAppointments = data;
    renderAppointmentStats();
    renderUpcomingPreview();
    renderAppointmentsFullList();
  })
  .catch(err => console.error('Appointments error:', err));
}

function renderAppointmentStats() {
  const upcoming = allAppointments.find(a =>
    a.status !== 'Cancelled' && new Date(a.appointment_date || a.dateTime) > new Date()
  );
  if (upcoming) {
    const dateStr = new Date(upcoming.appointment_date || upcoming.dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    safeSet('next-appt-val', dateStr);
  }

  const completed = allAppointments.filter(a => a.status === 'Completed').length;
  safeSet('total-visits-val', completed);
  safeSet('pstat-visits', completed);

  // Count badge
  safeSet('appt-count-badge', allAppointments.length);
}

function renderUpcomingPreview() {
  const container = document.getElementById('upcoming-appointments-list');
  if (!container) return;

  const upcoming = allAppointments
    .filter(a => a.status !== 'Cancelled' && new Date(a.appointment_date || a.dateTime) > new Date())
    .sort((a, b) => new Date(a.appointment_date || a.dateTime) - new Date(b.appointment_date || b.dateTime))
    .slice(0, 3);

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>No upcoming appointments</p>
        <button class="link-btn" onclick="switchSection('appointments')">Schedule one now →</button>
      </div>`;
    return;
  }

  container.innerHTML = upcoming.map(appt => {
    const d = new Date(appt.appointment_date || appt.dateTime);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const treatmentName = appt.treatment?.name || appt.reason || 'Dental Visit';
    const statusClass = (appt.status || 'pending').toLowerCase();

    return `
      <div class="appt-preview-item" onclick="openAppointmentDetailsModal('${appt.id}')" title="Click to view details, reschedule, or cancel">
        <div class="appt-date-block">
          <span class="adb-month">${month}</span>
          <span class="adb-day">${day}</span>
        </div>
        <div class="appt-info">
          <div class="appt-treatment">${escapeHTML(treatmentName)}</div>
          <div class="appt-time">${time}</div>
        </div>
        <span class="status-pill ${statusClass}">${appt.status || 'Pending'}</span>
        <button type="button" class="btn-view-appt" onclick="event.stopPropagation(); openAppointmentDetailsModal('${appt.id}')">
          View →
        </button>
      </div>`;
  }).join('');
}

function renderAppointmentsFullList() {
  const container = document.getElementById('appointments-list-full');
  if (!container) return;

  if (allAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <p>No appointments yet</p>
      </div>`;
    return;
  }

  const sorted = [...allAppointments].sort((a, b) =>
    new Date(b.appointment_date || b.dateTime) - new Date(a.appointment_date || a.dateTime)
  );

  container.innerHTML = sorted.map(appt => {
    const d = new Date(appt.appointment_date || appt.dateTime);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const treatmentName = appt.treatment?.name || appt.reason || 'Dental Visit';
    const statusClass = (appt.status || 'pending').toLowerCase();
    return `
      <div class="appt-preview-item" onclick="openAppointmentDetailsModal('${appt.id}')" title="Click to view details, reschedule, or cancel">
        <div class="appt-date-block">
          <span class="adb-month">${month}</span>
          <span class="adb-day">${day}</span>
        </div>
        <div class="appt-info">
          <div class="appt-treatment">${escapeHTML(treatmentName)}</div>
          <div class="appt-time">${time}</div>
        </div>
        <span class="status-pill ${statusClass}">${appt.status || 'Pending'}</span>
        <button type="button" class="btn-view-appt" onclick="event.stopPropagation(); openAppointmentDetailsModal('${appt.id}')">
          View →
        </button>
      </div>`;
  }).join('');
}

// ─── Load Invoices ───────────────────────────────────────────
function loadInvoices() {
  apiFetch('/invoices', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(data => {
    if (!Array.isArray(data)) return;
    allInvoices = data;
    renderInvoiceStats();
    renderInvoicesPreview();
    renderInvoicesTable();
  })
  .catch(err => console.error('Invoices error:', err));
}

function renderInvoiceStats() {
  const unpaid = allInvoices
    .filter(inv => inv.status === 'Unpaid' || !inv.is_paid)
    .reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);

  const unpaidStr = `₱${unpaid.toFixed(2)}`;
  safeSet('unpaid-val', unpaidStr);
  safeSet('balance-display', unpaidStr);
  safeSet('pstat-balance', `₱${unpaid.toFixed(0)}`);
  safeSet('pstat-invoices', allInvoices.length);
}

// ─── Financial Widgets (Accounting Dashboard Features) ───────────
function renderFinancialWidgets() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const allAmounts = allInvoices.map(inv => parseFloat(inv.amount || inv.total_amount || 0));
  const totalBilled = allAmounts.reduce((sum, amt) => sum + amt, 0);

  const thisMonthInvoices = allInvoices.filter(inv => {
    const invDate = new Date(inv.issued_at || inv.created_at);
    return invDate >= thisMonth;
  });
  const paidThisMonth = thisMonthInvoices
    .filter(inv => inv.status === 'Paid' || inv.is_paid)
    .reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);

  const lastMonthInvoices = allInvoices.filter(inv => {
    const invDate = new Date(inv.issued_at || inv.created_at);
    return invDate >= lastMonth && invDate < thisMonth;
  });
  const paidLastMonth = lastMonthInvoices
    .filter(inv => inv.status === 'Paid' || inv.is_paid)
    .reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);

  const pendingInvoices = allInvoices.filter(inv => inv.status === 'Unpaid' || !inv.is_paid);
  const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);

  const insuranceClaims = allInvoices.filter(inv => 
    inv.insurance_provider && inv.insurance_provider !== 'None / Self-Pay'
  ).length;

  // Calculate trends
  const billedTrend = lastMonthInvoices.length > 0 
    ? ((thisMonthInvoices.length - lastMonthInvoices.length) / lastMonthInvoices.length * 100).toFixed(1)
    : 0;
  const paidTrend = paidLastMonth > 0
    ? ((paidThisMonth - paidLastMonth) / paidLastMonth * 100).toFixed(1)
    : 0;

  safeSet('total-billed-val', `₱${totalBilled.toFixed(2)}`);
  safeSet('total-billed-trend', `${billedTrend >= 0 ? '+' : ''}${billedTrend}% vs last month`);
  document.getElementById('total-billed-trend')?.classList.toggle('positive', billedTrend >= 0);
  document.getElementById('total-billed-trend')?.classList.toggle('negative', billedTrend < 0);

  safeSet('pending-payments-val', `₱${pendingAmount.toFixed(2)}`);
  safeSet('pending-payments-trend', `${pendingInvoices.length} invoice${pendingInvoices.length !== 1 ? 's' : ''} pending`);

  safeSet('paid-month-val', `₱${paidThisMonth.toFixed(2)}`);
  safeSet('paid-month-trend', `${paidTrend >= 0 ? '+' : ''}${paidTrend}% vs last month`);
  document.getElementById('paid-month-trend')?.classList.toggle('positive', paidTrend >= 0);
  document.getElementById('paid-month-trend')?.classList.toggle('negative', paidTrend < 0);

  safeSet('insurance-claims-val', insuranceClaims);
  safeSet('insurance-claims-trend', insuranceClaims > 0 ? `${insuranceClaims} pending review` : 'No active claims');
}

function renderFinancialActivity() {
  const container = document.getElementById('financial-activity-list');
  if (!container) return;

  // Combine invoices with payment-like activity
  const activities = allInvoices.map(inv => {
    const isPaid = inv.status === 'Paid' || inv.is_paid;
    const date = new Date(inv.issued_at || inv.created_at);
    const amount = parseFloat(inv.amount || inv.total_amount || 0);
    const insuranceProvider = inv.insurance_provider || 'None / Self-Pay';

    return {
      id: inv.id,
      date: date,
      type: isPaid ? 'payment' : 'invoice',
      title: isPaid ? 'Payment Received' : 'Invoice Generated',
      amount: amount,
      status: isPaid ? 'completed' : 'pending',
      invoiceNumber: `#${inv.id.slice(0, 8).toUpperCase()}`,
      method: inv.payment_method || (insuranceProvider !== 'None / Self-Pay' ? 'Insurance' : 'Cash/Card'),
      patient: inv.patient?.name || 'Unknown'
    };
  }).sort((a, b) => b.date - a.date).slice(0, 10);

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9"/><circle cx="12" cy="12" r="3"/></svg>
        <p>No financial activity</p>
      </div>`;
    return;
  }

  container.innerHTML = activities.map(act => `
    <div class="financial-activity-item">
      <div class="activity-icon ${act.type}">${act.type === 'payment' ? '✓' : '📄'}</div>
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type">${act.title}</span>
          <span class="activity-amount ${act.status}">${act.status === 'completed' ? '+' : ''}₱${act.amount.toFixed(2)}</span>
        </div>
        <div class="activity-details">
          <span class="activity-invoice">${act.invoiceNumber}</span>
          <span class="activity-date">${act.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="activity-method">${act.method}</span>
          <span class="activity-status ${act.status}">${act.status}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderInvoicesPreview() {
  const container = document.getElementById('recent-invoices-list');
  if (!container) return;

  const recent = [...allInvoices]
    .sort((a, b) => new Date(b.issued_at || b.created_at) - new Date(a.issued_at || a.created_at))
    .slice(0, 3);

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        <p>No billing history</p>
      </div>`;
    return;
  }

  container.innerHTML = recent.map(inv => {
    const isPaid = inv.status === 'Paid' || inv.is_paid;
    const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
    const date = new Date(inv.issued_at || inv.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
    return `
      <div class="invoice-preview-item">
        <div>
          <div class="inv-id">#${inv.id.slice(0, 8).toUpperCase()}</div>
          <div class="inv-date">${date}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="inv-amount">₱${amount}</span>
          ${isPaid 
            ? `<span class="status-pill confirmed">Paid</span>` 
            : `<button class="btn-paymongo-mini" onclick="openPaymongoModal('${inv.id}')" title="Pay with PayMongo (GCash, Maya, Card)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Pay</button>`}
        </div>
      </div>`;
  }).join('');
}

function renderInvoicesTable() {
  const tbody = document.getElementById('invoices-table-body');
  if (!tbody) return;

  if (allInvoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-table-row">No invoices found.</td></tr>`;
    return;
  }

  const sorted = [...allInvoices].sort((a, b) =>
    new Date(b.issued_at || b.created_at) - new Date(a.issued_at || a.created_at)
  );

  tbody.innerHTML = sorted.map(inv => {
    const isPaid = inv.status === 'Paid' || inv.is_paid;
    const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
    const issued = new Date(inv.issued_at || inv.created_at).toLocaleDateString();
    const paidAt = inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—';
    const statusClass = isPaid ? 'confirmed' : 'pending';
    const statusLabel = inv.status || (isPaid ? 'Paid' : 'Unpaid');
    const service = inv.appointment?.treatment?.name || inv.treatment_name || 'Dental Consultation';
    const refId = inv.id.slice(0, 8).toUpperCase();

    let actionButton = '';
    if (!isPaid) {
      actionButton = `
        <button class="btn-paymongo" onclick="openPaymongoModal('${inv.id}')" title="Pay with PayMongo (GCash, Maya, GrabPay, Card)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <span>Pay with PayMongo</span>
        </button>
      `;
    } else {
      actionButton = `
        <button class="btn-receipt-view" onclick="viewInvoiceReceipt('${inv.id}')" title="View & Print Official Receipt">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>Receipt</span>
        </button>
      `;
    }

    return `
      <tr>
        <td><strong>#${refId}</strong></td>
        <td>${issued}</td>
        <td>${escapeHTML(service)}</td>
        <td style="font-weight:700; color: #0b3c4d;">₱${amount}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td>${paidAt}</td>
        <td style="text-align: right;">${actionButton}</td>
      </tr>`;
  }).join('');
}

// ─── PayMongo Payment Integration ──────────────────────────────
let activePaymentInvoice = null;

function openPaymongoModal(invoiceId) {
  const inv = allInvoices.find(i => i.id === invoiceId);
  if (!inv) {
    showToast('Invoice not found', 'error');
    return;
  }

  activePaymentInvoice = inv;
  const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
  const refId = inv.id.slice(0, 8).toUpperCase();
  const serviceName = inv.appointment?.treatment?.name || inv.treatment_name || 'Dental Consultation / Service';

  safeSet('pm-invoice-ref', `Invoice #${refId}`);
  safeSet('pm-invoice-service', serviceName);
  safeSet('pm-invoice-amount', `₱${amount}`);
  safeSet('pm-active-invoice-id', inv.id);

  const modal = document.getElementById('modal-paymongo-checkout');
  if (modal) {
    modal.classList.add('active');
  }
}

function closePaymongoModal() {
  const modal = document.getElementById('modal-paymongo-checkout');
  if (modal) {
    modal.classList.remove('active');
  }
  activePaymentInvoice = null;
}

function executePayMongoCheckout() {
  if (!activePaymentInvoice) return;

  const btn = document.getElementById('btn-proceed-paymongo');
  const btnText = document.getElementById('btn-paymongo-text');
  const originalText = btnText ? btnText.textContent : 'Proceed to Checkout';

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Connecting to PayMongo...';

  apiFetch('/payments/paymongo/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      invoice_id: activePaymentInvoice.id
    })
  })
  .then(data => {
    if (data.mode === 'live' && data.checkout_url) {
      // Live PayMongo Checkout Session
      showToast('Redirecting to PayMongo secure payment page...', 'success');
      closePaymongoModal();
      window.location.href = data.checkout_url;
    } else {
      // Sandbox mode simulation
      showToast('PayMongo Gateway connected! Confirming payment...', 'success');
      return apiFetch('/payments/paymongo/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoice_id: activePaymentInvoice.id,
          checkout_id: data.checkout_id || 'sandbox_test'
        })
      });
    }
  })
  .then(res => {
    if (res && res.success) {
      showToast('Payment verified successfully!', 'success');
      const paidInvId = activePaymentInvoice.id;
      closePaymongoModal();
      loadInvoices();
      viewInvoiceReceipt(paidInvId);
    }
  })
  .catch(err => {
    console.error('[PayMongo Checkout Error]', err);
    showToast(err.message || 'Error communicating with PayMongo gateway.', 'error');
  })
  .finally(() => {
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = originalText;
  });
}

function viewInvoiceReceipt(invoiceId) {
  const inv = allInvoices.find(i => i.id === invoiceId);
  if (!inv) return;

  const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
  const refId = inv.id.slice(0, 8).toUpperCase();
  const dateStr = inv.paid_at 
    ? new Date(inv.paid_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  safeSet('receipt-inv-id', `#${refId}`);
  safeSet('receipt-inv-amount', `₱${amount}`);
  safeSet('receipt-inv-date', dateStr);

  const modal = document.getElementById('modal-payment-receipt');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeReceiptModal() {
  const modal = document.getElementById('modal-payment-receipt');
  if (modal) {
    modal.classList.remove('active');
  }
}

function checkPaymentReturnStatus() {
  const params = new URLSearchParams(window.location.search);
  const paymentStatus = params.get('payment');
  const invoiceId = params.get('invoice_id');

  if (paymentStatus === 'success' && invoiceId) {
    showToast('PayMongo payment completed! Updating your records...', 'success');
    apiFetch('/payments/paymongo/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ invoice_id: invoiceId })
    })
    .then(res => {
      loadInvoices();
      viewInvoiceReceipt(invoiceId);
    })
    .catch(err => console.error('[Return Verification Error]', err));

    // Clear URL query parameters cleanly
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (paymentStatus === 'cancelled') {
    showToast('PayMongo payment session was cancelled. You can complete it anytime.', 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ─── Load Treatments (for booking wizard) ──────────────────
function loadTreatments() {
  apiFetch('/treatments', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(treatments => {
    const grid = document.getElementById('services-picker-grid');
    if (!grid) return;
    if (Array.isArray(treatments) && treatments.length > 0) {
      grid.innerHTML = treatments.map(t => `
        <div class="service-card" data-id="${t.id}" data-name="${escapeHTML(t.name)}" data-price="${parseFloat(t.price || 0).toFixed(2)}">
          <div class="service-title">${escapeHTML(t.name)}</div>
          <div class="service-price">₱${parseFloat(t.price || 0).toFixed(2)}</div>
          <div style="font-size: 0.72rem; color: #888; margin-top: 4px;">Duration: ${t.duration_minutes || 30} mins</div>
        </div>
      `).join('');

      // Attach selection listeners
      grid.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', () => {
          grid.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          document.getElementById('wizard-treatment-id').value = card.getAttribute('data-id');
          document.getElementById('summary-service').textContent = `${card.getAttribute('data-name')} (₱${card.getAttribute('data-price')})`;
        });
      });
    } else {
      grid.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">No services available</div>';
    }
  })
  .catch(err => console.error('Treatments error:', err));
}

// ─── Booking Wizard Logic ────────────────────────────────────
let currentStep = 1;
let selectedTime = '';

function setupBookingWizard() {
  const form = document.getElementById('booking-wizard-form');
  if (!form) return;

  const btnPrev = document.getElementById('btn-prev-step');
  const btnNext = document.getElementById('btn-next-step');
  const btnSubmit = document.getElementById('btn-submit-booking');
  const dateInput = document.getElementById('wizard-date');

  // Prevent default date selection of past days
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateInput) {
    dateInput.min = todayStr;
    dateInput.addEventListener('change', checkAvailableSlots);
  }

  // Load Dentists List
  loadDentists();

  // Load Patient Profile Details for Step 4 auto-fill
  if (user) {
    safeVal('wizard-pat-name', user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown');
    safeVal('wizard-pat-email', user.email || '');
    safeVal('wizard-pat-phone', user.contact_number || user.contactNumber || 'N/A');
    safeVal('wizard-pat-address', user.address || 'Balirong, City of Naga, Cebu');
  }

  // Address input change listener
  const addrInput = document.getElementById('wizard-pat-address');
  addrInput?.addEventListener('change', () => {
    geocodeAndLocate(addrInput.value);
  });

  // GPS detect button
  document.getElementById('btn-detect-gps')?.addEventListener('click', () => {
    detectGPSLocation();
  });

  // Next Button Click
  btnNext?.addEventListener('click', () => {
    if (validateStep(currentStep)) {
      currentStep++;
      goToStep(currentStep);
    }
  });

  // Prev Button Click
  btnPrev?.addEventListener('click', () => {
    currentStep--;
    goToStep(currentStep);
  });

  // Time Slot Selection
  document.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('occupied') || btn.disabled) return;
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTime = btn.getAttribute('data-time');
      document.getElementById('wizard-time').value = selectedTime;
    });
  });

  // Form Submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitBooking();
  });
}

// ═══════════════════════════════════════════════════════════
//  CLINIC BRANCHES & MAP ROUTING SYSTEM
// ═══════════════════════════════════════════════════════════

function getClinicBranches() {
  const defaultBranches = [
    {
      id: 'main-balirong',
      name: 'Fano Dental Clinic — Main Branch',
      shortName: 'Main Branch (Balirong)',
      address: 'Balirong Highway, City of Naga, Cebu',
      city: 'City of Naga',
      lat: 10.2098,
      lng: 123.7580,
      phone: '(032) 489-1200',
      hours: 'Mon - Sat: 8:00 AM - 6:00 PM'
    },
    {
      id: 'minglanilla',
      name: 'Fano Dental Clinic — Minglanilla',
      shortName: 'Minglanilla Branch',
      address: 'Poblacion Ward II, Minglanilla, Cebu',
      city: 'Minglanilla',
      lat: 10.2444,
      lng: 123.7972,
      phone: '(032) 272-3456',
      hours: 'Mon - Sun: 8:30 AM - 6:30 PM'
    },
    {
      id: 'san-fernando',
      name: 'Fano Dental Clinic — San Fernando',
      shortName: 'San Fernando Branch',
      address: 'Poblacion South, San Fernando, Cebu',
      city: 'San Fernando',
      lat: 10.1612,
      lng: 123.7088,
      phone: '(032) 488-9900',
      hours: 'Mon - Sat: 9:00 AM - 5:00 PM'
    },
    {
      id: 'talisay',
      name: 'Fano Dental Clinic — Talisay City',
      shortName: 'Talisay City Branch',
      address: 'Tabunok Commercial Strip, Talisay City, Cebu',
      city: 'Talisay City',
      lat: 10.2601,
      lng: 123.8347,
      phone: '(032) 273-8888',
      hours: 'Mon - Sat: 8:00 AM - 7:00 PM'
    }
  ];

  try {
    const saved = localStorage.getItem('set-clinic-branches-detailed');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, idx) => {
          if (typeof item === 'string') {
            return {
              id: `custom-branch-${idx}`,
              name: item,
              shortName: item,
              address: 'Fano Dental Clinic',
              city: 'Cebu',
              lat: 10.2098 + (idx * 0.01),
              lng: 123.7580 + (idx * 0.01),
              phone: '(032) 489-1200',
              hours: 'Mon - Sat: 8:00 AM - 6:00 PM'
            };
          }
          return {
            id: `admin-branch-${idx}-${(item.name || '').replace(/\s+/g, '-').toLowerCase()}`,
            name: item.name || `Fano Dental Branch ${idx + 1}`,
            shortName: item.name || `Branch ${idx + 1}`,
            address: item.address || 'Clinic Branch Address',
            city: item.address ? (item.address.split(',')[1] || 'Cebu').trim() : 'Cebu',
            lat: parseFloat(item.lat) || 10.2098,
            lng: parseFloat(item.lng) || 123.7580,
            phone: item.phone || '(032) 489-1200',
            hours: item.hours || 'Mon - Sat: 8:00 AM - 6:00 PM'
          };
        });
      }
    }
  } catch (e) {
    console.warn('Failed to parse admin branches:', e);
  }

  return defaultBranches;
}

const KNOWN_COORDS = {
  'balirong': { lat: 10.2098, lng: 123.7540, label: 'Balirong, City of Naga, Cebu' },
  'naga': { lat: 10.2070, lng: 123.7570, label: 'City of Naga, Cebu' },
  'minglanilla': { lat: 10.2444, lng: 123.7972, label: 'Minglanilla, Cebu' },
  'san fernando': { lat: 10.1612, lng: 123.7088, label: 'San Fernando, Cebu' },
  'talisay': { lat: 10.2601, lng: 123.8347, label: 'Talisay City, Cebu' },
  'tabunok': { lat: 10.2601, lng: 123.8347, label: 'Tabunok, Talisay City, Cebu' },
  'cebu': { lat: 10.3157, lng: 123.8854, label: 'Cebu City' },
  'carcar': { lat: 10.1067, lng: 123.6425, label: 'Carcar City, Cebu' },
  'toledo': { lat: 10.3774, lng: 123.6409, label: 'Toledo City, Cebu' },
  'mandaue': { lat: 10.3321, lng: 123.9357, label: 'Mandaue City, Cebu' },
  'lapu-lapu': { lat: 10.3103, lng: 123.9494, label: 'Lapu-Lapu City, Cebu' }
};

let branchMap = null;
let mapMarkers = [];
let mapRouteLine = null;
let currentPatientCoords = { lat: 10.2098, lng: 123.7540 }; // Default: Balirong, Naga
let selectedBranchObj = getClinicBranches()[0];

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectGPSLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.', 'error');
    return;
  }
  showToast('Detecting your GPS location...', 'info');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPatientCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, 'My Current GPS Location');
      safeVal('wizard-pat-address', 'Current GPS Location');
      showToast('GPS location updated!', 'success');
    },
    () => {
      showToast('Could not access GPS. Using address lookup instead.', 'error');
    },
    { timeout: 8000 }
  );
}

function geocodeAndLocate(addressText) {
  if (!addressText) addressText = 'Balirong, City of Naga, Cebu';
  const query = addressText.toLowerCase().trim();

  // 1. Check local dictionary
  let matchedCoords = null;
  for (const [key, val] of Object.entries(KNOWN_COORDS)) {
    if (query.includes(key)) {
      matchedCoords = val;
      break;
    }
  }

  if (matchedCoords) {
    currentPatientCoords = { lat: matchedCoords.lat, lng: matchedCoords.lng };
    updateNearestBranchAndMap(matchedCoords.lat, matchedCoords.lng, addressText);
    return;
  }

  // 2. Fallback to OpenStreetMap Nominatim
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText + ', Cebu, Philippines')}`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        currentPatientCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addressText);
      } else {
        // Fallback default to Balirong / Naga
        currentPatientCoords = { lat: 10.2098, lng: 123.7540 };
        updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addressText);
      }
    })
    .catch(() => {
      currentPatientCoords = { lat: 10.2098, lng: 123.7540 };
      updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addressText);
    });
}

function updateNearestBranchAndMap(patientLat, patientLng, addressLabel) {
  const currentBranches = getClinicBranches();

  // Compute distances for all branches
  const branchesWithDistance = currentBranches.map(b => {
    const dist = calculateDistanceKm(patientLat, patientLng, b.lat, b.lng);
    return { ...b, distanceKm: dist };
  });

  // Sort ascending (nearest first)
  branchesWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  const nearest = branchesWithDistance[0];
  selectedBranchObj = nearest;

  // Update Hidden input
  safeVal('wizard-selected-branch', `${nearest.name} (${nearest.address})`);

  // Update Nearest Branch Banner
  safeSet('nearest-branch-name', nearest.name);
  safeSet('nearest-branch-addr', nearest.address);
  const distText = nearest.distanceKm < 1
    ? `${(nearest.distanceKm * 1000).toFixed(0)} meters away`
    : `${nearest.distanceKm.toFixed(1)} km away • ~${Math.max(3, Math.round(nearest.distanceKm * 3))} mins`;
  safeSet('nearest-branch-dist', `📍 ${distText}`);

  // Render branch cards
  const container = document.getElementById('branches-picker-grid');
  if (container) {
    container.innerHTML = branchesWithDistance.map((b, idx) => {
      const isNearest = idx === 0;
      const isSelected = b.id === selectedBranchObj.id;
      const distStr = b.distanceKm < 1 ? `${(b.distanceKm * 1000).toFixed(0)} m` : `${b.distanceKm.toFixed(1)} km`;

      return `
        <div class="branch-card ${isSelected ? 'selected' : ''} ${isNearest ? 'nearest' : ''}" data-branch-id="${b.id}">
          <div class="branch-card-header">
            <span class="branch-name">${escapeHTML(b.shortName)}</span>
            <span class="branch-dist-badge">${isNearest ? '★ ' : ''}${distStr}</span>
          </div>
          <p class="branch-address">${escapeHTML(b.address)}</p>
          <p class="branch-hours">${escapeHTML(b.hours)}</p>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    container.querySelectorAll('.branch-card').forEach(card => {
      card.addEventListener('click', () => {
        const branchId = card.getAttribute('data-branch-id');
        const chosen = getClinicBranches().find(b => b.id === branchId);
        if (chosen) {
          selectedBranchObj = chosen;
          safeVal('wizard-selected-branch', `${chosen.name} (${chosen.address})`);
          container.querySelectorAll('.branch-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          renderMapVisuals(patientLat, patientLng, addressLabel, chosen);
        }
      });
    });
  }

  // Render or Update Map
  renderMapVisuals(patientLat, patientLng, addressLabel, selectedBranchObj);
}

function renderMapVisuals(patientLat, patientLng, addressLabel, targetBranch) {
  const mapContainer = document.getElementById('clinic-map-container');
  if (!mapContainer || typeof L === 'undefined') return;

  if (!branchMap) {
    branchMap = L.map('clinic-map-container', {
      center: [patientLat, patientLng],
      zoom: 13,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(branchMap);
  }

  // Clear previous markers & route lines
  mapMarkers.forEach(m => branchMap.removeLayer(m));
  mapMarkers = [];
  if (mapRouteLine) {
    branchMap.removeLayer(mapRouteLine);
    mapRouteLine = null;
  }

  // 1. Patient Location Marker (Blue Pulse Icon)
  const patientIcon = L.divIcon({
    className: 'patient-map-pin',
    html: `
      <div style="background:#2563eb; width:22px; height:22px; border-radius:50%; border:3px solid white; box-shadow:0 0 12px rgba(37,99,235,0.8); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:bold;">
        P
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  const patientMarker = L.marker([patientLat, patientLng], { icon: patientIcon })
    .addTo(branchMap)
    .bindPopup(`<b>Your Location</b><br>${escapeHTML(addressLabel || 'Home Address')}`);
  mapMarkers.push(patientMarker);

  // 2. Dental Clinic Markers
  getClinicBranches().forEach(b => {
    const isTarget = b.id === targetBranch.id;
    const clinicIcon = L.divIcon({
      className: 'clinic-map-pin',
      html: `
        <div style="background:${isTarget ? '#dc2626' : '#0f172a'}; width:${isTarget ? '32px' : '26px'}; height:${isTarget ? '32px' : '26px'}; border-radius:50%; border:2.5px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; color:white; font-size:${isTarget ? '16px' : '13px'};">
          🦷
        </div>
      `,
      iconSize: [isTarget ? 32 : 26, isTarget ? 32 : 26],
      iconAnchor: [isTarget ? 16 : 13, isTarget ? 16 : 13]
    });

    const dist = calculateDistanceKm(patientLat, patientLng, b.lat, b.lng);
    const distText = dist < 1 ? `${(dist * 1000).toFixed(0)} meters` : `${dist.toFixed(1)} km`;

    const marker = L.marker([b.lat, b.lng], { icon: clinicIcon })
      .addTo(branchMap)
      .bindPopup(`
        <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:180px;">
          <strong style="color:#0f172a; font-size:13px; display:block; margin-bottom:3px;">${escapeHTML(b.name)}</strong>
          <span style="color:#64748b; font-size:11px; display:block; margin-bottom:5px;">${escapeHTML(b.address)}</span>
          <span style="color:#2563eb; font-weight:700; font-size:11px;">📍 ${distText} away</span>
        </div>
      `);
    mapMarkers.push(marker);
  });

  // 3. Connect Patient to Selected Branch with Route Polyline
  mapRouteLine = L.polyline([
    [patientLat, patientLng],
    [targetBranch.lat, targetBranch.lng]
  ], {
    color: '#2563eb',
    weight: 3.5,
    opacity: 0.8,
    dashArray: '8, 8'
  }).addTo(branchMap);

  // 4. Fit bounds
  const bounds = L.latLngBounds([
    [patientLat, patientLng],
    [targetBranch.lat, targetBranch.lng]
  ]);
  branchMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function goToStep(step) {
  // Show/Hide steps
  document.querySelectorAll('.wizard-step').forEach((el, index) => {
    el.style.display = (index + 1) === step ? 'block' : 'none';
  });

  // Update indicators
  document.querySelectorAll('.step-indicator-item').forEach(el => {
    const stepNum = parseInt(el.getAttribute('data-step'));
    el.classList.toggle('active', stepNum <= step);
    const numEl = el.querySelector('.step-number');
    if (numEl) {
      numEl.style.background = stepNum <= step ? 'var(--accent)' : 'white';
      numEl.style.color = stepNum <= step ? 'white' : '#888';
      numEl.style.borderColor = stepNum <= step ? 'var(--accent)' : '#e0e0e0';
    }
  });

  // Progress line
  const progressLine = document.getElementById('step-progress-line');
  if (progressLine) {
    const percent = ((step - 1) / 2) * 100;
    progressLine.style.width = `${percent}%`;
  }

  // Button visibilities
  const btnPrev = document.getElementById('btn-prev-step');
  const btnNext = document.getElementById('btn-next-step');
  const btnSubmit = document.getElementById('btn-submit-booking');

  if (btnPrev) btnPrev.style.display = step > 1 ? 'inline-flex' : 'none';
  if (btnNext) btnNext.style.display = step < 3 ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display = step === 3 ? 'inline-flex' : 'none';

  // Step 1: Check available slots & initialize Map
  if (step === 1) {
    checkAvailableSlots();
    setTimeout(() => {
      const addr = document.getElementById('wizard-pat-address')?.value || user?.address || 'Balirong, City of Naga, Cebu';
      geocodeAndLocate(addr);
      if (branchMap) {
        branchMap.invalidateSize();
      }
    }, 200);
  }

  // Step 2: Load Dentists & Services
  if (step === 2) {
    loadDentists();
    if (allTreatments.length === 0) {
      loadTreatments();
    } else {
      renderTreatmentsPicker();
    }
  }

  // Step 3: Render confirmation details
  if (step === 3) {
    renderConfirmationDetails();
  }
}

function validateStep(step) {
  if (step === 1) {
    const date = document.getElementById('wizard-date')?.value;
    const time = document.getElementById('wizard-time')?.value;
    if (!date) {
      showToast('Please pick a preferred appointment date.', 'error');
      return false;
    }
    if (!time) {
      showToast('Please select an available time slot.', 'error');
      return false;
    }
    return true;
  } else if (step === 2) {
    const treatmentId = document.getElementById('wizard-treatment-id')?.value;
    if (!treatmentId) {
      showToast('Please select a dental service/treatment to continue.', 'error');
      return false;
    }
    return true;
  }
  return true;
}

function loadDentists() {
  fetch(`${API}/dentists`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(dentists => {
    const grid = document.getElementById('dentists-picker-grid');
    if (!grid) return;

    // Add No Preference card
    let html = `
      <div class="dentist-card selected" data-name="No Preference">
        <div class="dentist-name">No Preference</div>
        <div class="dentist-specialty">Auto-assigned to available staff</div>
      </div>
    `;

    if (Array.isArray(dentists) && dentists.length > 0) {
      html += dentists.map(d => `
        <div class="dentist-card" data-name="${escapeHTML(d.name)}">
          <div class="dentist-name">${escapeHTML(d.name)}</div>
          <div class="dentist-specialty">Dental Specialist</div>
          <div style="font-size: 0.72rem; color: #888; margin-top: 4px;">Contact: ${escapeHTML(d.contact_number || 'N/A')}</div>
        </div>
      `).join('');
    }

    grid.innerHTML = html;

    // Attach listeners
    grid.querySelectorAll('.dentist-card').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.dentist-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('wizard-dentist-name').value = card.getAttribute('data-name');
      });
    });
  })
  .catch(err => console.error('Dentists list error:', err));
}

function checkAvailableSlots() {
  const dateVal = document.getElementById('wizard-date').value;
  const slotButtons = document.querySelectorAll('.slot-btn');

  if (!dateVal) {
    slotButtons.forEach(btn => {
      const time = btn.getAttribute('data-time');
      btn.classList.remove('selected', 'occupied', 'slot-loading');
      btn.disabled = false;
      btn.innerHTML = `<span>${time}</span>`;
    });
    return;
  }

  // Reset selected slot
  selectedTime = '';
  document.getElementById('wizard-time').value = '';

  // ── Instant optimistic render: show all slots as Available immediately ──
  slotButtons.forEach(btn => {
    const time = btn.getAttribute('data-time');
    btn.classList.remove('occupied', 'selected', 'slot-loading');
    btn.disabled = false;
    btn.title = 'Click to select this time slot';
    btn.innerHTML = `
      <span>${time}</span>
      <span class="slot-badge-available">Available</span>
    `;
  });

  // ── Fetch only today's occupied slots from server (date-filtered) ──
  apiFetch(`/appointments/occupied?date=${dateVal}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(occupiedList => {
    const occupiedTimes = new Set();

    if (Array.isArray(occupiedList)) {
      occupiedList.forEach(appt => {
        const apptDateObj = new Date(appt.appointment_date);
        const year = apptDateObj.getFullYear();
        const month = String(apptDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(apptDateObj.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;

        if (appt.date === dateVal || localDateStr === dateVal) {
          const formattedTime = apptDateObj.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true
          });
          occupiedTimes.add(formattedTime.toUpperCase().trim());
          if (appt.time) {
            occupiedTimes.add(appt.time.toUpperCase().trim());
          }
        }
      });
    }

    // Only update slots that are actually occupied — available ones already rendered
    slotButtons.forEach(btn => {
      const time = btn.getAttribute('data-time');
      const normTime = time ? time.trim().toUpperCase() : '';
      const noZeroTime = normTime.startsWith('0') ? normTime.substring(1) : ('0' + normTime);

      if (occupiedTimes.has(normTime) || occupiedTimes.has(noZeroTime)) {
        btn.classList.add('occupied');
        btn.classList.remove('selected');
        btn.disabled = true;
        btn.title = 'This time slot is already booked';
        btn.innerHTML = `
          <span>${time}</span>
          <span class="slot-badge-occupied">Occupied</span>
        `;
      }
    });
  })
  .catch(err => {
    console.error('Error fetching occupied slots:', err);
    // Fallback: check cached allAppointments — slots already shown as Available above
    const selectedDateStr = new Date(dateVal).toDateString();
    slotButtons.forEach(btn => {
      const time = btn.getAttribute('data-time');
      let isOccupied = false;
      allAppointments.forEach(appt => {
        const apptDate = new Date(appt.appointment_date || appt.dateTime);
        if (apptDate.toDateString() === selectedDateStr && appt.status !== 'Cancelled') {
          const apptTimeFormatted = apptDate.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit'
          });
          if (apptTimeFormatted === time) isOccupied = true;
        }
      });

      if (isOccupied) {
        btn.classList.add('occupied');
        btn.classList.remove('selected');
        btn.disabled = true;
        btn.innerHTML = `
          <span>${time}</span>
          <span class="slot-badge-occupied">Occupied</span>
        `;
      }
    });
  });
}

function renderConfirmationDetails() {
  const dentist = document.getElementById('wizard-dentist-name')?.value || 'No Preference';
  const dateVal = document.getElementById('wizard-date')?.value || '';
  const timeVal = document.getElementById('wizard-time')?.value || '';
  const branchVal = document.getElementById('wizard-selected-branch')?.value || selectedBranchObj?.name || 'Main Branch, Balirong';
  const emergName = document.getElementById('wizard-emergency-name')?.value.trim();
  const emergPhone = document.getElementById('wizard-emergency-phone')?.value.trim();
  const allergies = document.getElementById('wizard-allergies')?.value.trim() || 'None';
  const medications = document.getElementById('wizard-medications')?.value.trim() || 'None';
  const concern = document.getElementById('wizard-primary-concern')?.value || 'Routine Cleaning & General Checkup';
  const hmo = document.getElementById('wizard-insurance-provider')?.value || 'None / Self-Pay';
  const hmoId = document.getElementById('wizard-insurance-id')?.value.trim();
  const anxiety = document.getElementById('wizard-dental-anxiety')?.checked;
  const reminderPref = document.getElementById('wizard-reminder-pref')?.value || 'SMS Text Message';

  // Selected medical conditions
  const conditions = [];
  document.querySelectorAll('input[name="med_condition"]:checked').forEach(cb => {
    if (cb.value !== 'None') conditions.push(cb.value);
  });
  const conditionsStr = conditions.length > 0 ? conditions.join(', ') : 'None reported';

  const dateObj = new Date(dateVal);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  const treatmentId = document.getElementById('wizard-treatment-id')?.value;
  const selectedTreat = allTreatments.find(t => t.id === treatmentId || String(t.id) === String(treatmentId));
  const serviceName = selectedTreat ? `${selectedTreat.name} (${selectedTreat.price ? '₱' + selectedTreat.price : ''})` : 'General Dental Consultation';

  safeSet('summary-datetime', `${formattedDate} at ${timeVal}`);
  safeSet('summary-dentist', dentist);
  safeSet('summary-service', serviceName);
  safeSet('summary-branch', branchVal);

  const patPhone = document.getElementById('wizard-pat-phone')?.value || user?.contact_number || user?.contactNumber || '';
  const patEmail = document.getElementById('wizard-pat-email')?.value || user?.email || '';
  safeSet('summary-patient-contact', `${patPhone ? patPhone + ' • ' : ''}${patEmail}`);

  if (emergName || emergPhone) {
    safeSet('summary-emergency-contact', `${emergName || 'Contact'} (${emergPhone || 'No phone'})`);
  } else {
    safeSet('summary-emergency-contact', 'None specified');
  }

  safeSet('summary-medical-alerts', `Conditions: ${conditionsStr} • Allergies: ${allergies} • Meds: ${medications}`);
  safeSet('summary-insurance-care', `${hmo}${hmoId ? ' (' + hmoId + ')' : ''} • ${anxiety ? 'Gentle Care Requested' : 'Standard Care'} • Reminders via ${reminderPref}`);
}

function submitBooking() {
  const treatmentId = document.getElementById('wizard-treatment-id').value;
  const dentistName = document.getElementById('wizard-dentist-name').value;
  const dateVal = document.getElementById('wizard-date').value;
  const timeVal = document.getElementById('wizard-time').value;
  const branchVal = document.getElementById('wizard-selected-branch')?.value || selectedBranchObj?.name || 'Main Branch';
  const patientAddr = document.getElementById('wizard-pat-address')?.value || user?.address || 'N/A';
  const emergName = document.getElementById('wizard-emergency-name')?.value.trim() || 'N/A';
  const emergPhone = document.getElementById('wizard-emergency-phone')?.value.trim() || 'N/A';
  const allergies = document.getElementById('wizard-allergies')?.value.trim() || 'None';
  const medications = document.getElementById('wizard-medications')?.value.trim() || 'None';
  const concern = document.getElementById('wizard-primary-concern')?.value || 'Routine Cleaning';
  const hmo = document.getElementById('wizard-insurance-provider')?.value || 'None / Self-Pay';
  const hmoId = document.getElementById('wizard-insurance-id')?.value.trim() || 'N/A';
  const anxiety = document.getElementById('wizard-dental-anxiety')?.checked ? 'Yes (Gentle Care)' : 'No';
  const reminderPref = document.getElementById('wizard-reminder-pref')?.value || 'SMS';
  const rawNotes = document.getElementById('wizard-notes').value.trim();

  // Selected medical conditions
  const conditions = [];
  document.querySelectorAll('input[name="med_condition"]:checked').forEach(cb => {
    if (cb.value !== 'None') conditions.push(cb.value);
  });
  const conditionsStr = conditions.length > 0 ? conditions.join(', ') : 'None';

  // Combine branch, dentist and comprehensive medical details into structured notes string
  const notes = `[Branch: ${branchVal}] [Dentist: ${dentistName}] [Emergency: ${emergName} (${emergPhone})] [Conditions: ${conditionsStr}] [Allergies: ${allergies}] [Meds: ${medications}] [Concern: ${concern}] [HMO: ${hmo} / ${hmoId}] [AnxietySupport: ${anxiety}] [ReminderPref: ${reminderPref}] [PatientAddr: ${patientAddr}] ${rawNotes ? 'Notes: ' + rawNotes : ''}`;

  // Parse preferred date & time into ISO string
  const [time, modifier] = timeVal.split(' ');
  let [hours, minutes] = time.split(':');
  if (modifier === 'PM' && hours !== '12') hours = parseInt(hours) + 12;
  if (modifier === 'AM' && hours === '12') hours = '00';
  const isoDateTime = `${dateVal}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

  const btnSubmit = document.getElementById('btn-submit-booking');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Booking...';

  fetch(`${API}/appointments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      treatment_id: treatmentId,
      appointment_date: isoDateTime,
      notes: notes
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !data.id) throw new Error(data.message);
    
    showToast('Appointment booked successfully! SMS reminder sent via Twilio.', 'success');
    
    // Reset wizard
    currentStep = 1;
    selectedTime = '';
    document.getElementById('booking-wizard-form').reset();
    document.getElementById('wizard-treatment-id').value = '';
    document.getElementById('wizard-dentist-name').value = 'No Preference';
    document.getElementById('wizard-time').value = '';
    
    // Unselect grids & checkboxes
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.dentist-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.slot-btn').forEach(c => {
      c.classList.remove('selected');
      c.disabled = false;
    });

    goToStep(1);
    loadAppointments();
    
    // Redirect to overview
    setTimeout(() => switchSection('overview'), 1200);
  })
  .catch(err => {
    showToast(err.message || 'Failed to book appointment.', 'error');
  })
  .finally(() => {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Confirm & Book Appointment';
  });
}

// ═══════════════════════════════════════════════════════════
//  APPOINTMENT DETAILS & QUICK ACTIONS (RESCHEDULE, CANCEL, CALENDAR, ETC.)
// ═══════════════════════════════════════════════════════════

let selectedAppointment = null;

function openAppointmentDetailsModal(apptId) {
  const appt = allAppointments.find(a => a.id === apptId || String(a.id) === String(apptId));
  if (!appt) {
    showToast('Appointment details not found.', 'error');
    return;
  }

  selectedAppointment = appt;

  // Format procedure, price & duration
  const treatmentName = appt.treatment?.name || appt.reason || 'Dental Consultation';
  const price = appt.treatment?.price ? `₱${parseFloat(appt.treatment.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '₱1,500.00';
  const duration = appt.treatment?.duration_minutes ? `${appt.treatment.duration_minutes} minutes` : '45 minutes';

  // Format date & time
  const d = new Date(appt.appointment_date || appt.dateTime);
  const formattedDate = d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const formattedTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Extract branch & dentist from notes
  let branchName = 'Fano Dental Clinic — Main Branch (Balirong)';
  let dentistName = 'Assigned Staff Specialist';
  const notesRaw = appt.notes || '';

  const branchMatch = notesRaw.match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) branchName = branchMatch[1];

  const dentistMatch = notesRaw.match(/\[Dentist:\s*([^\]]+)\]/i);
  if (dentistMatch) dentistName = dentistMatch[1];

  // Set modal texts
  safeSet('modal-appt-service', treatmentName);
  safeSet('modal-appt-dentist-branch', `Dentist: ${dentistName} • ${branchName.split('—')[0] || 'Fano Clinic'}`);
  safeSet('modal-appt-datetime', `${formattedDate} at ${formattedTime}`);
  safeSet('modal-appt-branch', branchName);
  safeSet('modal-appt-price', price);
  safeSet('modal-appt-duration', duration);

  // Status badge styling
  const status = appt.status || 'Pending';
  const pill = document.getElementById('modal-appt-status-pill');
  if (pill) {
    pill.textContent = status;
    pill.className = `status-pill ${status.toLowerCase()}`;
  }

  // Format notes box
  let cleanNotes = notesRaw.replace(/\[[^\]]+\]/g, '').trim();
  // Extract specific clinical metadata tags for display
  const alertsList = [];
  const condMatch = notesRaw.match(/\[Conditions:\s*([^\]]+)\]/i);
  if (condMatch && condMatch[1] !== 'None') alertsList.push(`• Medical Conditions: ${condMatch[1]}`);
  const allergMatch = notesRaw.match(/\[Allergies:\s*([^\]]+)\]/i);
  if (allergMatch && allergMatch[1] !== 'None') alertsList.push(`• Allergies: ${allergMatch[1]}`);
  const medsMatch = notesRaw.match(/\[Meds:\s*([^\]]+)\]/i);
  if (medsMatch && medsMatch[1] !== 'None') alertsList.push(`• Medications: ${medsMatch[1]}`);
  const emergMatch = notesRaw.match(/\[Emergency:\s*([^\]]+)\]/i);
  if (emergMatch && !emergMatch[1].includes('N/A')) alertsList.push(`• Emergency Contact: ${emergMatch[1]}`);
  const hmoMatch = notesRaw.match(/\[HMO:\s*([^\]]+)\]/i);
  if (hmoMatch && !hmoMatch[1].includes('None')) alertsList.push(`• Insurance/HMO: ${hmoMatch[1]}`);

  let displayText = '';
  if (alertsList.length > 0) {
    displayText += alertsList.join('\n') + '\n\n';
  }
  displayText += cleanNotes ? `Special Notes: ${cleanNotes}` : (alertsList.length > 0 ? '' : 'No special requests or alerts.');
  safeSet('modal-appt-notes', displayText);

  // Disable / Enable action buttons based on status
  const btnReschedule = document.getElementById('btn-modal-reschedule');
  const btnCancel = document.getElementById('btn-modal-cancel');
  const isPastOrCancelled = status === 'Cancelled' || status === 'Completed' || d < new Date();

  if (btnReschedule) {
    btnReschedule.disabled = isPastOrCancelled;
    btnReschedule.style.opacity = isPastOrCancelled ? '0.45' : '1';
    btnReschedule.style.cursor = isPastOrCancelled ? 'not-allowed' : 'pointer';
  }
  if (btnCancel) {
    btnCancel.disabled = isPastOrCancelled;
    btnCancel.style.opacity = isPastOrCancelled ? '0.45' : '1';
    btnCancel.style.cursor = isPastOrCancelled ? 'not-allowed' : 'pointer';
  }

  // Hide inline reschedule panel
  toggleReschedulePanel(false);

  // Show modal
  const modal = document.getElementById('appointment-details-modal');
  if (modal) modal.classList.add('active');
}

function closeAppointmentModal() {
  const modal = document.getElementById('appointment-details-modal');
  if (modal) modal.classList.remove('active');
  toggleReschedulePanel(false);
}

// Close modal on backdrop click
document.getElementById('appointment-details-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'appointment-details-modal') {
    closeAppointmentModal();
  }
});

function toggleReschedulePanel(show) {
  const panel = document.getElementById('inline-reschedule-panel');
  if (!panel) return;

  panel.style.display = show ? 'block' : 'none';

  if (show && selectedAppointment) {
    const dateInput = document.getElementById('reschedule-date-input');
    const timeSelect = document.getElementById('reschedule-time-select');
    
    // Set minimum date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (dateInput) {
      dateInput.min = tomorrowStr;
      dateInput.value = tomorrowStr;
    }
    if (timeSelect) {
      timeSelect.value = '10:00 AM';
    }
  }
}

function executeReschedule() {
  if (!selectedAppointment) return;

  const dateVal = document.getElementById('reschedule-date-input')?.value;
  const timeVal = document.getElementById('reschedule-time-select')?.value;

  if (!dateVal) {
    showToast('Please pick a new date to reschedule.', 'error');
    return;
  }
  if (!timeVal) {
    showToast('Please select a preferred time slot.', 'error');
    return;
  }

  // Parse time into ISO string
  const [time, modifier] = timeVal.split(' ');
  let [hours, minutes] = time.split(':');
  if (modifier === 'PM' && hours !== '12') hours = parseInt(hours) + 12;
  if (modifier === 'AM' && hours === '12') hours = '00';
  const isoDateTime = `${dateVal}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

  const btnConfirm = document.getElementById('btn-confirm-reschedule');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = 'Saving...';
  }

  fetch(`${API}/appointments/${selectedAppointment.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      appointment_date: isoDateTime
    })
  })
  .then(res => {
    if (!res.ok) {
      return res.json().then(err => { throw new Error(err.message || 'Failed to reschedule.'); });
    }
    return res.json();
  })
  .then(updated => {
    showToast('✓ Appointment rescheduled successfully!', 'success');
    closeAppointmentModal();
    loadAppointments();
  })
  .catch(err => {
    showToast(err.message || 'Could not reschedule appointment. Slot may be occupied.', 'error');
  })
  .finally(() => {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = 'Save New Schedule';
    }
  });
}

function executeCancelAppointment() {
  if (!selectedAppointment) return;

  const d = new Date(selectedAppointment.appointment_date || selectedAppointment.dateTime);
  const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!confirm(`Are you sure you want to cancel your appointment on ${formattedDate}?`)) {
    return;
  }

  const btnCancel = document.getElementById('btn-modal-cancel');
  if (btnCancel) {
    btnCancel.disabled = true;
    btnCancel.textContent = 'Cancelling...';
  }

  fetch(`${API}/appointments/${selectedAppointment.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'Cancelled'
    })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to cancel appointment.');
    return res.json();
  })
  .then(() => {
    showToast('Appointment has been cancelled.', 'info');
    closeAppointmentModal();
    loadAppointments();
  })
  .catch(err => {
    showToast(err.message || 'Failed to cancel appointment.', 'error');
  })
  .finally(() => {
    if (btnCancel) {
      btnCancel.disabled = false;
      btnCancel.textContent = 'Cancel Visit';
    }
  });
}

function downloadCalendarEvent() {
  if (!selectedAppointment) return;

  const appt = selectedAppointment;
  const treatmentName = appt.treatment?.name || appt.reason || 'Dental Appointment';
  const start = new Date(appt.appointment_date || appt.dateTime);
  const durationMins = appt.treatment?.duration_minutes || 60;
  const end = new Date(start.getTime() + durationMins * 60 * 1000);

  // Format date to UTC for iCalendar: YYYYMMDDTHHMMSSZ
  const formatICSDate = (dt) => dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let branchName = 'Fano Dental Clinic — Main Branch';
  const branchMatch = (appt.notes || '').match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) branchName = branchMatch[1];

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fano Dental Clinic//Appointment Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:appt-${appt.id}@fanodental.com`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:Dental Appointment: ${treatmentName} at Fano Dental Clinic`,
    `DESCRIPTION:Your scheduled visit for ${treatmentName}. Assigned Clinic: ${branchName}. Phone: (032) 489-1200.`,
    `LOCATION:${branchName}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: Dental Appointment with Fano Clinic',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Fano-Dental-Appointment-${appt.id.slice(0, 6)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast('✓ Calendar event (.ics) downloaded!', 'success');
}

function openBranchDirections() {
  if (!selectedAppointment) return;

  let branchAddr = 'Balirong Highway, City of Naga, Cebu';
  const branchMatch = (selectedAppointment.notes || '').match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) {
    branchAddr = branchMatch[1];
  }

  const query = encodeURIComponent(`Fano Dental Clinic, ${branchAddr}`);
  window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
}

function printAppointmentSlip() {
  if (!selectedAppointment) return;

  const appt = selectedAppointment;
  const treatmentName = appt.treatment?.name || appt.reason || 'Dental Visit';
  const price = appt.treatment?.price ? `₱${parseFloat(appt.treatment.price).toFixed(2)}` : '₱1,500.00';
  const d = new Date(appt.appointment_date || appt.dateTime);
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let branchName = 'Fano Dental Clinic — Main Branch (Balirong)';
  const branchMatch = (appt.notes || '').match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) branchName = branchMatch[1];

  const printWindow = window.open('', '_blank', 'width=650,height=750');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Appointment Confirmation — Fano Dental Clinic</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; padding: 40px; color: #0f172a; margin: 0; }
        .voucher-card { border: 2px solid #0b3c4d; border-radius: 16px; padding: 32px; max-width: 540px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 20px; margin-bottom: 20px; }
        .logo-title { font-size: 20px; font-weight: 800; color: #0b3c4d; }
        .badge { background: #eef6f8; color: #0b3c4d; font-weight: bold; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 14px; font-size: 14px; }
        .label { color: #64748b; font-weight: 600; }
        .val { font-weight: 700; color: #0f172a; text-align: right; }
        .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="voucher-card">
        <div class="header">
          <div>
            <div class="logo-title">🦷 Fano Dental Clinic</div>
            <div style="font-size:12px; color:#64748b; margin-top:3px;">Official Appointment Pass</div>
          </div>
          <span class="badge">${appt.status || 'CONFIRMED'}</span>
        </div>
        <div class="row"><span class="label">Patient Name:</span><span class="val">${user?.name || user?.firstName || 'Valued Patient'}</span></div>
        <div class="row"><span class="label">Dental Service:</span><span class="val">${escapeHTML(treatmentName)}</span></div>
        <div class="row"><span class="label">Date &amp; Time:</span><span class="val">${dateStr} at ${timeStr}</span></div>
        <div class="row"><span class="label">Clinic Location:</span><span class="val">${escapeHTML(branchName)}</span></div>
        <div class="row"><span class="label">Estimated Fee:</span><span class="val">${price}</span></div>
        <div class="row"><span class="label">Appointment Pass ID:</span><span class="val">#${appt.id.slice(0, 8).toUpperCase()}</span></div>
        <div class="footer">
          Please arrive 10 minutes prior to your schedule. For assistance, contact (032) 489-1200.<br>
          Fano Dental Clinic • Where Science Meets Artistry
        </div>
      </div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// Checkbox condition interactions: "None" unchecks others, others uncheck "None"
document.querySelectorAll('input[name="med_condition"]').forEach(cb => {
  cb.addEventListener('change', (e) => {
    if (e.target.value === 'None' && e.target.checked) {
      document.querySelectorAll('input[name="med_condition"]').forEach(other => {
        if (other.value !== 'None') other.checked = false;
      });
    } else if (e.target.value !== 'None' && e.target.checked) {
      const noneCb = document.getElementById('cond-none');
      if (noneCb) noneCb.checked = false;
    }
  });
});

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
}

// ─── Profile Form ────────────────────────────────────────────
document.getElementById('profile-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  showToast('Profile updated successfully!', 'success');
});

// ─── Settings ────────────────────────────────────────────────
document.getElementById('save-settings-btn')?.addEventListener('click', () => {
  showToast('Settings saved!', 'success');
});

// ─── Sidebar Toggle ──────────────────────────────────────────
const sidebar  = document.getElementById('sidebar');
const overlay  = document.getElementById('sidebar-overlay');

function openSidebar() {
  sidebar?.classList.add('open');
  overlay?.classList.add('show');
}
function closeSidebar() {
  sidebar?.classList.remove('open');
  overlay?.classList.remove('show');
}

document.getElementById('burger-toggle')?.addEventListener('click', () => {
  sidebar?.classList.contains('open') ? closeSidebar() : openSidebar();
});
document.getElementById('burger-menu-btn')?.addEventListener('click', closeSidebar);
overlay?.addEventListener('click', closeSidebar);

// ─── Quick Book button ───────────────────────────────────────
document.getElementById('quick-book-btn')?.addEventListener('click', () => {
  switchSection('appointments');
});

// ─── Navigation ─────────────────────────────────────────────
document.querySelectorAll('[data-section]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    switchSection(link.getAttribute('data-section'));
    closeSidebar();
  });
});

function switchSection(sectionId) {
  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
  });

  // Show/hide sections
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`${sectionId}-section`)?.classList.add('active');

  // Breadcrumb
  const labels = {
    overview:     'Overview',
    appointments: 'Book Appointment',
    records:      'My Records',
    billing:      'Billing & Invoices',
    profile:      'My Profile',
    settings:     'Settings'
  };
  safeSet('breadcrumb-current', labels[sectionId] || 'Dashboard');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Toast Notifications ─────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.style.cssText = `
    position: fixed;
    bottom: 28px; right: 28px;
    background: ${type === 'success' ? '#10b981' : (type === 'info' ? '#0284c7' : '#ef4444')};
    color: white;
    padding: 14px 22px;
    border-radius: 12px;
    font-size: 0.875rem;
    font-weight: 600;
    font-family: 'Plus Jakarta Sans', sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    z-index: 99999;
    display: flex; align-items: center; gap: 10px;
    animation: slideInToast 0.3s ease;
    max-width: 380px;
  `;
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      ${type === 'success'
        ? '<polyline points="20 6 9 17 4 12"/>'
        : (type === 'info' ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>')}
    </svg>
    ${message}`;

  const style = document.createElement('style');
  style.textContent = `@keyframes slideInToast { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
  document.head.appendChild(style);

  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3200);
}

// ─── Helpers ─────────────────────────────────────────────────
function safeSet(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function safeVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}
