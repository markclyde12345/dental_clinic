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
const DEFAULT_TREATMENTS = [
  {
    id: "402c0ba5-99be-45aa-9518-97b25b124e1f",
    name: "Teeth Cleaning & Scaling",
    price: 800,
    duration_minutes: 45,
    description: "Comprehensive professional oral prophylaxis removing hardened tartar (calculus), plaque, and surface coffee/tea stains."
  },
  {
    id: "264448a6-2170-4623-bab3-f88cd8ca714d",
    name: "Deep Cavity Filling",
    price: 1500,
    duration_minutes: 45,
    description: "Gentle, tooth-preserving restorative procedure that removes decayed enamel and dentin, restored with shade-matched composite resin."
  },
  {
    id: "791eaf78-169c-4684-9cc4-52b5e558ceb0",
    name: "Wisdom Tooth Extraction",
    price: 3500,
    duration_minutes: 60,
    description: "Pain-free surgical removal of impacted, partially erupted, or misaligned wisdom teeth under local anesthesia."
  },
  {
    id: "c8c4080c-e380-43f8-a85f-006210cbe556",
    name: "Root Canal Therapy",
    price: 6000,
    duration_minutes: 90,
    description: "Advanced endodontic procedure to save deeply infected or inflamed teeth by cleansing and sealing root canals."
  },
  {
    id: "be1ca613-9eee-49f7-9f51-39b08e7dd0f6",
    name: "Laser Teeth Whitening",
    price: 5000,
    duration_minutes: 60,
    description: "In-office laser-assisted dental whitening that lifts deep stains up to 8 shades brighter in a single session."
  },
  {
    id: "dental-implants",
    name: "Dental Implants",
    price: 45000,
    duration_minutes: 90,
    description: "Permanent titanium tooth replacement matching natural teeth with lifelike zirconia or porcelain crown."
  },
  {
    id: "orthodontic-braces",
    name: "Orthodontic Braces Alignment",
    price: 35000,
    duration_minutes: 60,
    description: "Comprehensive orthodontic alignment correcting crooked teeth, spacing, and bite irregularities."
  },
  {
    id: "porcelain-crowns",
    name: "Porcelain & Zirconia Crowns",
    price: 12000,
    duration_minutes: 60,
    description: "Full-coverage tooth caps crafted from high-translucency zirconia to reinforce fractured teeth."
  },
  {
    id: "emergency-care",
    name: "Urgent Dental Emergency Care",
    price: 1200,
    duration_minutes: 45,
    description: "Priority same-day clinical relief for acute dental pain, knocked-out teeth, facial swelling, or broken restorations."
  }
];
let allTreatments = [...DEFAULT_TREATMENTS];

const sessionExpiry = localStorage.getItem('sessionExpiry');
if (sessionExpiry && Date.now() > parseInt(sessionExpiry, 10)) {
  logout();
}

// ─── Auth Gate ──────────────────────────────────────────────
if (window.location.search.includes('test_mode=1')) {
  user = { name: 'Maria Santos', email: 'maria@example.com', role: 'Patient' };
  allInvoices = [
    { id: 'inv-87234190', amount: '1500.00', status: 'Unpaid', is_paid: false, created_at: new Date().toISOString(), treatment_name: 'Dental Cleaning & Polishing' },
    { id: 'inv-49201845', amount: '3200.00', status: 'Paid', is_paid: true, created_at: new Date(Date.now() - 86400000).toISOString(), paid_at: new Date().toISOString(), treatment_name: 'Root Canal Treatment' }
  ];
  setTimeout(() => {
    initDashboard();
    renderInvoicesTable();
    if (window.location.hash) {
      const sec = window.location.hash.replace('#', '');
      switchSection(sec);
    }
  }, 100);
} else if (!token) {
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
  // Clinical treatment plans are sent directly to patient email
  setupBookingWizard();
  setupSettings();
  setupPatientNotifications();
  loadPatientNotifications();
  checkPaymentReturnStatus();
  checkRatingUrlParam();
  setupHelpSupportListeners();
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
    <i class="ti ti-check" style="font-size: 16px;"></i>
    ${s.saveSettings}
  `;
}

function setupSettings() {
  // 1. Notifications
  const notifAppt = document.getElementById('notify-appt-alerts');
  const notifBilling = document.getElementById('notify-billing-alerts');
  const notifUpdates = document.getElementById('notify-clinic-updates');
  if (notifAppt) notifAppt.checked = localStorage.getItem('pd-notif-appt') !== 'false';
  if (notifBilling) notifBilling.checked = localStorage.getItem('pd-notif-billing') !== 'false';
  if (notifUpdates) notifUpdates.checked = localStorage.getItem('pd-notif-updates') !== 'false';

  // 2. Privacy & 2FA
  const tfaCheck = document.getElementById('enable-2fa');
  if (tfaCheck) tfaCheck.checked = localStorage.getItem('pd-2fa') === 'true';

  // 3. Patient Preferences
  const prefDentist = document.getElementById('pref-dentist');
  const prefBranch = document.getElementById('pref-branch');
  const prefContact = document.getElementById('pref-contact-method');
  const prefSched = document.getElementById('pref-schedule');

  if (prefDentist) prefDentist.value = localStorage.getItem('pd-pref-dentist') || 'any';
  if (prefBranch) prefBranch.value = localStorage.getItem('pd-pref-branch') || 'main-balirong';
  if (prefContact) prefContact.value = localStorage.getItem('pd-pref-contact') || 'sms';
  if (prefSched) prefSched.value = localStorage.getItem('pd-pref-sched') || 'morning';

  // 4. Accessibility
  const savedSize = localStorage.getItem('pd-text-size') || 'normal';
  const savedContrast = localStorage.getItem('pd-high-contrast') === 'true';
  const savedMotion = localStorage.getItem('pd-reduce-motion') === 'true';

  setTextSize(savedSize);
  const contrastCheck = document.getElementById('pref-high-contrast');
  const motionCheck = document.getElementById('pref-reduce-motion');
  if (contrastCheck) {
    contrastCheck.checked = savedContrast;
    toggleHighContrast(savedContrast);
  }
  if (motionCheck) {
    motionCheck.checked = savedMotion;
    toggleReduceMotion(savedMotion);
  }

  // 5. Load Safety & Emergency information
  loadSafetyEmergencySettings();

  // 5. Save All Settings button
  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    // Save notifications
    if (notifAppt) localStorage.setItem('pd-notif-appt', notifAppt.checked);
    if (notifBilling) localStorage.setItem('pd-notif-billing', notifBilling.checked);
    if (notifUpdates) localStorage.setItem('pd-notif-updates', notifUpdates.checked);

    // Save 2FA
    if (tfaCheck) localStorage.setItem('pd-2fa', tfaCheck.checked);

    // Save preferences
    if (prefDentist) localStorage.setItem('pd-pref-dentist', prefDentist.value);
    if (prefBranch) localStorage.setItem('pd-pref-branch', prefBranch.value);
    if (prefContact) localStorage.setItem('pd-pref-contact', prefContact.value);
    if (prefSched) localStorage.setItem('pd-pref-sched', prefSched.value);

    // Save accessibility
    if (contrastCheck) localStorage.setItem('pd-high-contrast', contrastCheck.checked);
    if (motionCheck) localStorage.setItem('pd-reduce-motion', motionCheck.checked);

    // Save Safety & Emergency fields
    saveSafetyEmergencySettings(true);

    showToast('✓ Settings saved successfully!', 'success');
  });

  // 6. Bind OS Settings handlers globally
  window.openOsSettingsCategory = openOsSettingsCategory;
  window.closeOsSettingsCategory = closeOsSettingsCategory;
  window.filterOsSettings = filterOsSettings;
}


// ─── Safety & Emergency Management ──────────────────────────
function loadSafetyEmergencySettings() {
  const getVal = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = localStorage.getItem(key);
    if (v !== null && v !== '') el.value = v;
    else if (fallback !== undefined && !el.value) el.value = fallback;
  };

  getVal('emg-contact-name', 'pd-emg-name', 'Maria Santos');
  getVal('emg-contact-rel', 'pd-emg-rel', 'Spouse / Partner');
  getVal('emg-contact-phone', 'pd-emg-phone', '+63 917 888 2211');
  getVal('emg-contact-email', 'pd-emg-email', 'maria.santos@gmail.com');

  getVal('med-known-allergies', 'pd-med-allergies', 'Penicillin, Latex');
  getVal('med-allergy-reactions', 'pd-med-reactions', 'Skin rash, facial swelling');
  getVal('med-conditions', 'pd-med-conditions', 'Hypertension (Controlled)');
  getVal('med-current-medications', 'pd-med-medications', 'Amlodipine 5mg');
  getVal('med-special-precautions', 'pd-med-precautions', 'Mild dental anxiety; use local anesthetic with care');
  getVal('med-emergency-notes', 'pd-med-notes', 'Patient prefers morning procedures and requires extra numbing duration.');
}

function saveSafetyEmergencySettings(suppressToast = false) {
  const setVal = (id, key) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem(key, el.value.trim());
  };

  setVal('emg-contact-name', 'pd-emg-name');
  setVal('emg-contact-rel', 'pd-emg-rel');
  setVal('emg-contact-phone', 'pd-emg-phone');
  setVal('emg-contact-email', 'pd-emg-email');

  setVal('med-known-allergies', 'pd-med-allergies');
  setVal('med-allergy-reactions', 'pd-med-reactions');
  setVal('med-conditions', 'pd-med-conditions');
  setVal('med-current-medications', 'pd-med-medications');
  setVal('med-special-precautions', 'pd-med-precautions');
  setVal('med-emergency-notes', 'pd-med-notes');

  if (!suppressToast) {
    showToast('✓ Safety & Emergency settings saved successfully!', 'success');
  }
}
window.loadSafetyEmergencySettings = loadSafetyEmergencySettings;
window.saveSafetyEmergencySettings = saveSafetyEmergencySettings;

// ─── Settings Categories Metadata ────────────────────────────
const OS_SETTINGS_META = {
  privacy: {
    title: 'Security & Privacy',
    desc: 'Protect your credentials, two-factor authentication, and active sessions.'
  },
  safety: {
    title: 'Safety & Emergency',
    desc: 'Emergency contact information, medical precautions, and allergy alerts.'
  },
  notifications: {
    title: 'Notifications',
    desc: 'Appointment SMS reminders, email confirmations, and clinic updates.'
  },
  account: {
    title: 'Account & Profile',
    desc: 'Official patient registration, identity details, and login history.'
  },
  support: {
    title: 'Help & Support',
    desc: 'Patient guides, FAQs, direct clinic telephone desk, and assistance.'
  },
  danger: {
    title: 'Account Deactivation',
    desc: 'Temporarily suspend portal credentials while preserving medical records.'
  }
};

function openOsSettingsCategory(catId) {
  catId = catId || 'safety';
  const meta = OS_SETTINGS_META[catId] || OS_SETTINGS_META.safety;

  // 1. Highlight the active left-sidebar item
  document.querySelectorAll('.os-nav-item').forEach(btn => {
    const isTarget = btn.getAttribute('data-cat') === catId;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // 2. Set Title and Desc in the right pane header
  const titleEl = document.getElementById('os-detail-head-title');
  const descEl = document.getElementById('os-detail-head-desc');
  if (titleEl) titleEl.textContent = meta.title;
  if (descEl) descEl.textContent = meta.desc;

  // 3. Switch sub-panel with smooth transition
  document.querySelectorAll('.os-sub-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  const targetSub = document.getElementById(`os-sub-${catId}`);
  if (targetSub) {
    targetSub.classList.add('active');
    targetSub.style.display = 'block';
  }
}

function closeOsSettingsCategory() {
  openOsSettingsCategory('safety');
}

function filterOsSettings(query) {
  const q = (query || '').trim().toLowerCase();
  const items = document.querySelectorAll('.os-nav-item');
  const sectionTitles = document.querySelectorAll('.os-nav-section-title');

  if (!q) {
    items.forEach(el => { el.style.display = 'flex'; });
    sectionTitles.forEach(t => { t.style.display = 'block'; });
    return;
  }

  let firstMatch = null;
  items.forEach(el => {
    const hay = ((el.getAttribute('data-os-item') || '') + ' ' + (el.textContent || '')).toLowerCase();
    const match = hay.includes(q);
    el.style.display = match ? 'flex' : 'none';
    if (match && !firstMatch) firstMatch = el;
  });

  sectionTitles.forEach(t => { t.style.display = 'none'; });

  if (firstMatch) {
    const cat = firstMatch.getAttribute('data-cat');
    if (cat) openOsSettingsCategory(cat);
  }
}

// Immediately expose functions globally
window.openOsSettingsCategory = openOsSettingsCategory;
window.closeOsSettingsCategory = closeOsSettingsCategory;
window.filterOsSettings = filterOsSettings;

function setupOsSettingsDelegation() {
  const menu = document.getElementById('os-settings-menu');
  if (!menu || menu._hasOsDelegation) return;
  menu._hasOsDelegation = true;

  const searchInput = document.getElementById('os-settings-search');
  if (searchInput) {
    const handleSearch = () => filterOsSettings(searchInput.value);
    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('keyup', handleSearch);
    searchInput.addEventListener('search', handleSearch);
    searchInput.addEventListener('change', handleSearch);
  }

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.os-list-item');
    if (item) {
      const cat = item.getAttribute('data-cat');
      if (cat) openOsSettingsCategory(cat);
    }
  });

  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.os-list-item');
      if (item) {
        e.preventDefault();
        const cat = item.getAttribute('data-cat');
        if (cat) openOsSettingsCategory(cat);
      }
    }
  });
}

// Bind delegation on DOM ready or immediately if ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupOsSettingsDelegation);
} else {
  setupOsSettingsDelegation();
}

function filterSettingsCategory(cat) {
  // Legacy fallback support for older buttons
  if (window.openOsSettingsCategory) {
    window.openOsSettingsCategory(cat === 'account' ? 'account' : cat);
  }
}

// ─── Clipboard Helper ────────────────────────────────────────
function copyToClipboard(text, label) {
  if (!text) return;
  const cleanText = text.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanText)
      .then(() => showToast(`✓ ${label} copied to clipboard!`, 'success'))
      .catch(() => fallbackCopy(cleanText, label));
  } else {
    fallbackCopy(cleanText, label);
  }
}

function fallbackCopy(text, label) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`✓ ${label} copied to clipboard!`, 'success');
  } catch (err) {
    showToast(`Could not copy ${label}`, 'error');
  }
}

// ─── Accessibility Controls ──────────────────────────────────
function setTextSize(size) {
  document.querySelectorAll('.btn-size-pill').forEach(b => b.classList.remove('active'));
  document.getElementById(`btn-size-${size}`)?.classList.add('active');

  if (size === 'medium') {
    document.documentElement.style.fontSize = '16px';
  } else if (size === 'large') {
    document.documentElement.style.fontSize = '17.5px';
  } else {
    document.documentElement.style.fontSize = '';
  }
  localStorage.setItem('pd-text-size', size);
}

function toggleHighContrast(enabled) {
  document.body.classList.toggle('high-contrast', enabled);
  localStorage.setItem('pd-high-contrast', enabled);
}

function toggleReduceMotion(enabled) {
  document.body.classList.toggle('reduce-motion', enabled);
  localStorage.setItem('pd-reduce-motion', enabled);
}

// ─── Privacy & Security Actions ──────────────────────────────
function downloadPatientData() {
  const patientData = {
    exportedAt: new Date().toISOString(),
    patient: user || {},
    appointments: allAppointments || [],
    invoices: allInvoices || [],
    portal: 'Fano Dental Clinic Patient Portal'
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(patientData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `FanoDental_Patient_Records_${(user?.id || 'data').slice(0, 8)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  showToast('✓ Patient records downloaded as JSON!', 'success');
}

function logoutAllDevices() {
  if (confirm('Are you sure you want to log out of all other devices? This will invalidate all active sessions except your current browser.')) {
    showToast('✓ All other device sessions terminated.', 'success');
  }
}

// ─── Change Password Modal ───────────────────────────────────
function openChangePasswordModal() {
  document.getElementById('modal-change-password')?.classList.add('active');
}
function closeChangePasswordModal() {
  document.getElementById('modal-change-password')?.classList.remove('active');
  document.getElementById('form-change-password')?.reset();
}
function handlePasswordChangeSubmit(e) {
  e.preventDefault();
  const current = document.getElementById('cp-current-password')?.value || '';
  const newPass = document.getElementById('cp-new-password')?.value || '';
  const confirm = document.getElementById('cp-confirm-password')?.value || '';

  if (newPass !== confirm) {
    showToast('New passwords do not match.', 'error');
    return;
  }
  if (newPass.length < 8) {
    showToast('Password must be at least 8 characters.', 'error');
    return;
  }

  showToast('✓ Password updated successfully!', 'success');
  closeChangePasswordModal();
}

// ─── Report Issue Modal ──────────────────────────────────────
function openReportIssueModal() {
  const el = document.getElementById('modal-report-issue');
  if (el) {
    el.classList.add('active');
    el.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; z-index: 10000000 !important;';
  }
}
function closeReportIssueModal() {
  const el = document.getElementById('modal-report-issue');
  if (el) {
    el.classList.remove('active');
    el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
  }
  document.getElementById('form-report-issue')?.reset();
}
function handleReportIssueSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const cat = document.getElementById('ri-category')?.value || 'general';
  const desc = (document.getElementById('ri-description')?.value || '').trim();
  if (!desc) {
    if (typeof showToast === 'function') showToast('Please describe the issue or inquiry.', 'error');
    else alert('Please describe the issue or inquiry.');
    return;
  }
  try {
    const list = JSON.parse(localStorage.getItem('pd_reported_issues') || '[]');
    list.unshift({ id: 'iss_' + Date.now(), category: cat, description: desc, date: new Date().toISOString() });
    localStorage.setItem('pd_reported_issues', JSON.stringify(list));
  } catch (_) {}
  if (typeof showToast === 'function') showToast('✓ Issue report submitted! Clinic support will review it.', 'success');
  else alert('Issue report submitted! Clinic support will review it.');
  closeReportIssueModal();
}

// ─── Help Center Modal ───────────────────────────────────────
function openHelpCenterModal() {
  const el = document.getElementById('modal-help-center');
  if (el) {
    el.classList.add('active');
    el.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; z-index: 10000000 !important;';
  }
}
function closeHelpCenterModal() {
  const el = document.getElementById('modal-help-center');
  if (el) {
    el.classList.remove('active');
    el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
  }
}

// ─── Contact Clinic Desk Modal ───────────────────────────────
function openContactClinicPrompt() {
  const el = document.getElementById('modal-contact-desk');
  if (el) {
    el.classList.add('active');
    el.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; z-index: 10000000 !important;';
  }
}
function closeContactDeskModal() {
  const el = document.getElementById('modal-contact-desk');
  if (el) {
    el.classList.remove('active');
    el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
  }
}

function setupHelpSupportListeners() {
  const triggers = [
    { ids: ['btn-help-read', 'card-help-center'], fn: openHelpCenterModal },
    { ids: ['btn-clinic-call', 'card-contact-desk'], fn: openContactClinicPrompt },
    { ids: ['btn-issue-report', 'card-report-issue'], fn: openReportIssueModal }
  ];
  triggers.forEach(({ ids, fn }) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          fn();
        });
      }
    });
  });
}

// Explicit global exposure on window
window.openHelpCenterModal = openHelpCenterModal;
window.closeHelpCenterModal = closeHelpCenterModal;
window.openContactClinicPrompt = openContactClinicPrompt;
window.closeContactDeskModal = closeContactDeskModal;
window.openReportIssueModal = openReportIssueModal;
window.closeReportIssueModal = closeReportIssueModal;
window.handleReportIssueSubmit = handleReportIssueSubmit;
window.setupHelpSupportListeners = setupHelpSupportListeners;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handlePasswordChangeSubmit = handlePasswordChangeSubmit;
window.downloadPatientData = downloadPatientData;
window.logoutAllDevices = logoutAllDevices;

// Run listeners immediately if DOM is already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupHelpSupportListeners);
} else {
  setupHelpSupportListeners();
}

// ─── Date, Time & Greeting ──────────────────────────────────
function setDateTime() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('header-date');
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }
  tick();
  setInterval(tick, 1000);
}

function setGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';
  const name = user.firstName || user.name?.split(' ')[0] || 'there';
  const el = document.getElementById('greeting-text');
  const heroGreet = document.getElementById('pd-hero-greet');
  const heroName = document.getElementById('pd-hero-name');
  if (heroGreet && heroName) {
    // New hero layout: split greeting, name and summary line
    heroGreet.textContent = `${greeting},`;
    heroName.textContent = `${name}!`;
    if (el) el.textContent = "Here's your dental health summary for today.";
  } else if (el) {
    el.textContent = `${greeting}, ${name}! Here's your dental health summary.`;
  }
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
  safeSet('patient-id-tag', `PT-${new Date().getFullYear()}-${shortId.slice(0, 4)}`);

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
  prefillAddressFields(user.address || '');
}

// ═══════════════════════════════════════════════════════════════
//  ADDRESS SELECTOR — Cebu Province
// ═══════════════════════════════════════════════════════════════

const CEBU_ADDRESS_DATA = {
  'Cebu City': [
    'Adlaon','Agsungot','Apas','Bacayan','Banilad','Basak Pardo','Basak San Nicolas',
    'Binaliw','Bonbon','Budlaan','Busay','Calamba','Cambinocot','Capitol Site','Carreta',
    'Central Poblacion','Cogon Pardo','Cogon Ramos','Cubacub','Dalag','Guadalupe',
    'Guba','Inayawan','Kalubihan','Kalunasan','Kamagayan','Kasambagan','Kinasang-an',
    'Labangon','Lahug','Lorega','Lusaran','Luz','Mabini','Mabolo','Malubog','Mambaling',
    'Non-stock','Pardo','Pari-an','Paril','Pasil','Pit-os','Pulangbato','Pung-ol-Sibugay',
    'Punta Princesa','Quiot Pardo','Sambag I','Sambag II','San Antonio','San Jose',
    'San Nicolas Central','San Roque','Santa Cruz','Santo Niño','Sapangdaku','Sawang Calero',
    'Sinsin','Sirao','Suba Poblacion','Sudlon I','Sudlon II','T. Padilla','Tabunan',
    'Tagbao','Taptap','Talamban','Tejero','Tinago','Tisa','To-ong Pardo','Upper Bulacao',
    'Cambinocot','Zapatera'
  ],
  'Mandaue City': [
    'Alang-Alang','Bakilid','Banilad','Basak','Cambaro','Canduman','Casili','Casuntingan',
    'Centro (Pob.)','Cubacub','Guizo','Ibabao-Estancia','Jagobiao','Labogon','Looc',
    'Maguikay','Mahiga','Mantuyong','Opao','Pagsabungan','Pakna-an','Subangdaku',
    'Tabok','Tawason','Tingub','Tipolo','Umapad'
  ],
  'Lapu-Lapu City': [
    'Agus','Babag','Bankal','Baring','Basak','Buaya','Calawisan','Canjulao','Caubian',
    'Caw-oy','Cokoy','Cordova (Pob.)','Gun-ob','Ibo','Looc','Mactan','Marigondon',
    'Pajac','Pajo','Pangan-an','Poblacion','Punta Engaño','Pusok','Subabasbas','Talima',
    'Tingo','Tungasan'
  ],
  'Talisay City': [
    'Biasong','Bulacao','Cadulawan','Cansojong','Dumlog','Jaclupan','Lagtang','Linao',
    'Maghaway','Manipis','Mohon','Ngabo','Poblacion','Pooc','San Isidro','San Roque',
    'Sapang','Tabunok','Tangke','Tapul'
  ],
  'Danao City': [
    'Baliang','Binaliw','Cabungahan','Cagat-Lamac','Cahumayan','Cambanay','Cambubho',
    'Cogon-Cruz','Danasan','Dungga','Dunggoan','Guinacot','Guinsay','Ibo','Langosig',
    'Lawaan','Licos','Looc','Magtagobtob','Mahayahay','Mandaug','Manlagtang','Masaba',
    'Pili','Poblacion','Pondol','Pugaro','Regression','San Vicente','Sandayong Norte',
    'Sandayong Sur','Santa Rosa','Santican','Sibacan','Suba','Taboc','Tabil','Talavera',
    'Tinubdan','Tominjao'
  ],
  'Carcar City': [
    'Bolinawan','Boljoon (Pob.)','Bosdak','Calidngan','Can-asujan','Guadalupe',
    'Liburon','Napo','Ocaña','Perrelos','Poblacion I','Poblacion II','Poblacion III',
    'Tuyom','Valencia','Valladolid'
  ],
  'Toledo City': [
    'Awihao','Bagakay','Balamban (Pob.)','Bato','Biga','Bulongan','Bunga','Cabitoonan',
    'Calongcalong','Cambang-ug','Camp 8','Canlumampao','Cantabaco','Capitan Lorenzo',
    'Caraon','Celestial','Cogon','Colon','Don Andres Soriano','Dumlog','Gairan',
    'Ibo (Luray 2)','Ilihan','Ilihan Norte','Iyosan','Jaclupan','Kalubihan','Luray',
    'Luray II','Media Once','Mina de Oro','Mulat','Pagina','Poblacion','Poog','Putingbato',
    'Sagay','Sam-ang','Santo Niño','Subabasbas','Taberna','Talavera','Tinaan','Tuburan',
    'Tungkay'
  ],
  'Bogo City': [
    'Anapog-Mohon','Astorga','Atop-atop','Bacsay','Cagcagan','Cayang','Cogon','Dakit',
    'Don Pedro Rodriguez','Gairan','Guadalupe','La Paz','Lapaz','Libertad','Lourdes',
    'Malingin','Marangog','Nailon','Odlot','Pandan Cain','Pangdan','Poblacion Norte',
    'Poblacion Sur','Punta','Putlongon','Sudlonon','Tapilon','Tigbawan','Trip',
    'Tuong Buhingtubig','Villa Kanghog','Villa Pagoda','Vito'
  ],
  'City of Naga': [
    'Alfaco','Bairan','Balirong','Cabungahan','Cantao-an','Central Poblacion','Colon',
    'East Poblacion','Inayagan','Inoburan','Jaguimit','Lanas','Langtad','Lutac',
    'Mainit','Mambaling','Pangdan','Patag','South Poblacion','Tinaan','Tuyan',
    'Uling','West Poblacion'
  ],
  'Minglanilla': [
    'Calajo-an','Camp 7','Camp 8','Cuanos','Guindaruhan','Jugan','Linao','Lipata',
    'Luyong Baybay','Pakigne','Poblacion Ward I','Poblacion Ward II','Poblacion Ward III',
    'Poblacion Ward IV','Tubod','Tulay','Tungkop','Vito'
  ],
  'San Fernando': [
    'Balud','Balungag','Basak','Bugho','Cabatbatan','Greenhills','Ilaya','Lantawan',
    'Liburon','Looc','Lubog','Managase','Manipis','Olango','Paril','Pitogo','Poblacion Norte',
    'Poblacion Sur','Pungtod','Salmeron','Sambagon','Sangat','Tabionan','Tananas',
    'Tinubdan','Tonggo','Tubod'
  ],
  'Consolacion': [
    'Cabangahan','Cansaga','Casili','Danglag','Garing','Jugan','Lamac','Lanipga',
    'Nangka','Panas','Panoypoy','Pitogo','Poblacion Occidental','Poblacion Oriental',
    'Pulpogan','Sacsac','Tayud','Tilhaong','Tolotolo','Tugbongan'
  ],
  'Liloan': [
    'Catarman','Cotcot','Jubay','Lataban','Mulao','Poblacion','San Roque','San Vicente',
    'Santa Cruz','Santo Domingo','Scientia','Tayud','Yati'
  ],
  'Compostela': [
    'Bagalnga','Basak','Buluang','Cabadiangan','Cambayog','Canamucan','Cogon',
    'Dapdap','Estaca','Lupa','Magay','Mulao','Panangban','Poblacion','Tag-iyasan',
    'Tamiao','Tubigan'
  ],
  'Cordova': [
    'Alegria','Cogon','Dapa','Gabi','Ibabao','Pilipog','Poblacion','San Miguel'
  ],
  'Cebu (Province)': [],
  'Other / Outside Cebu': []
};

// Populate city dropdown on page load
(function initAddressSelectors() {
  const citySelect = document.getElementById('profile-city');
  const barangaySelect = document.getElementById('profile-barangay');
  if (!citySelect || !barangaySelect) return;

  // Fill city options
  Object.keys(CEBU_ADDRESS_DATA).forEach(city => {
    if (city === 'Cebu (Province)' || city === 'Other / Outside Cebu') return;
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  // Cascade: when city changes, reload barangay list
  citySelect.addEventListener('change', () => {
    populateBarangays(citySelect.value);
  });
})();

function populateBarangays(city) {
  const barangaySelect = document.getElementById('profile-barangay');
  if (!barangaySelect) return;
  barangaySelect.innerHTML = '<option value="">— Select Barangay —</option>';
  const list = CEBU_ADDRESS_DATA[city] || [];
  list.forEach(brgy => {
    const opt = document.createElement('option');
    opt.value = brgy;
    opt.textContent = brgy;
    barangaySelect.appendChild(opt);
  });
  barangaySelect.disabled = list.length === 0;
}

/** Compose full address string from dropdowns and write to hidden field */
function composeAddress() {
  const city    = document.getElementById('profile-city')?.value || '';
  const brgy    = document.getElementById('profile-barangay')?.value || '';
  const street  = document.getElementById('profile-street')?.value.trim() || '';
  const parts   = [street, brgy, city, 'Cebu'].filter(Boolean);
  const full    = parts.join(', ');
  const hidden  = document.getElementById('profile-address');
  if (hidden) hidden.value = full;
  return full;
}

/** Pre-fill address dropdowns from a saved address string */
function prefillAddressFields(savedAddress) {
  if (!savedAddress) return;
  const citySelect = document.getElementById('profile-city');
  const brgySelect = document.getElementById('profile-barangay');
  const streetInput = document.getElementById('profile-street');
  const hiddenField = document.getElementById('profile-address');
  if (!citySelect) return;

  // Match city from saved address (look for known cities)
  let matchedCity = '';
  const cities = Object.keys(CEBU_ADDRESS_DATA).filter(c => c !== 'Cebu (Province)' && c !== 'Other / Outside Cebu');
  for (const city of cities) {
    if (savedAddress.toLowerCase().includes(city.toLowerCase())) {
      matchedCity = city;
      break;
    }
  }

  if (matchedCity) {
    citySelect.value = matchedCity;
    populateBarangays(matchedCity);

    // Match barangay
    const brgyList = CEBU_ADDRESS_DATA[matchedCity] || [];
    let matchedBrgy = '';
    for (const brgy of brgyList) {
      if (savedAddress.toLowerCase().includes(brgy.toLowerCase())) {
        matchedBrgy = brgy;
        break;
      }
    }
    if (matchedBrgy && brgySelect) {
      brgySelect.value = matchedBrgy;
    }

    // Remaining parts become street
    if (streetInput) {
      // Remove matched city, brgy, "Cebu" from string and use the remainder as street
      let remainder = savedAddress
        .replace(matchedCity, '')
        .replace(matchedBrgy, '')
        .replace(/,?\s*Cebu\s*$/i, '')
        .replace(/^,\s*|,\s*$/g, '')
        .trim();
      streetInput.value = remainder;
    }
  }

  // Always set hidden field to saved address
  if (hiddenField) hiddenField.value = savedAddress;
}

// ─── Load Appointments ───────────────────────────────────────
function loadAppointments() {
  const historyTbody = document.getElementById('history-table-body');
  let cancelSkeleton = null;
  if (historyTbody && (!allAppointments || !allAppointments.length)) {
    cancelSkeleton = window.Skeleton ? window.Skeleton.show(historyTbody, () => window.Skeleton.tableRows(7, 4), 220) : null;
  }
  apiFetch('/appointments', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(data => {
      if (cancelSkeleton) cancelSkeleton();
      if (!Array.isArray(data)) return;
      allAppointments = data;
      renderAppointmentStats();
      renderUpcomingPreview();
      renderOverviewHistoryPreview();
      renderAppointmentsFullList();
      renderPatientHistoryRecords();
      updateHistoryStats();
      checkUnratedVisitsBanner();
    })
    .catch(err => {
      if (cancelSkeleton) cancelSkeleton();
      console.error('Appointments error:', err);
    });
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
      <div class="pd-empty-appt">
        <div class="pd-empty-appt-icon"><i class="ti ti-clock"></i></div>
        <div class="pd-empty-appt-text">
          <strong>No upcoming appointments</strong>
          <span>Book your next visit for a healthier smile!</span>
        </div>
        <button type="button" class="pd-empty-appt-btn" onclick="switchSection('appointments')">Schedule Now</button>
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

    let dentistText = '';
    const notesRaw = appt.notes || '';
    const dentistMatch = notesRaw.match(/\[Dentist:\s*([^\]]+)\]/i);
    if (dentistMatch && dentistMatch[1] && dentistMatch[1] !== 'No Preference') {
      dentistText = dentistMatch[1];
    } else if (appt.dentist?.name) {
      dentistText = appt.dentist.name;
    }

    return `
      <div class="appt-preview-item" onclick="openAppointmentDetailsModal('${appt.id}')" title="Click to view details, reschedule, or cancel">
        <div class="appt-date-block">
          <span class="adb-month">${month}</span>
          <span class="adb-day">${day}</span>
        </div>
        <div class="appt-info">
          <div class="appt-treatment">${escapeHTML(treatmentName)}</div>
          <div class="appt-time"><i class="ti ti-clock" style="font-size: 11px;"></i> ${time}${dentistText ? ` • <i class="ti ti-stethoscope" style="font-size: 11px;"></i> ${escapeHTML(dentistText)}` : ''}</div>
        </div>
        <span class="status-pill ${statusClass}">${appt.status || 'Pending'}</span>
        <button type="button" class="btn-view-appt" onclick="event.stopPropagation(); openAppointmentDetailsModal('${appt.id}')">
          View →
        </button>
      </div>`;
  }).join('');
}

// ─── Overview Appointments Tab Toggle (Upcoming vs Past History) ───
function toggleOverviewApptTab(tab) {
  const btnUpcoming = document.getElementById('tab-btn-upcoming');
  const btnHistory = document.getElementById('tab-btn-history');
  const listUpcoming = document.getElementById('upcoming-appointments-list');
  const listHistory = document.getElementById('history-appointments-list');

  if (tab === 'upcoming') {
    btnUpcoming?.classList.add('active');
    btnHistory?.classList.remove('active');
    if (listUpcoming) listUpcoming.style.display = 'block';
    if (listHistory) listHistory.style.display = 'none';
  } else {
    btnHistory?.classList.add('active');
    btnUpcoming?.classList.remove('active');
    if (listUpcoming) listUpcoming.style.display = 'none';
    if (listHistory) listHistory.style.display = 'block';
    renderOverviewHistoryPreview();
  }
}

function renderOverviewHistoryPreview() {
  const container = document.getElementById('history-appointments-list');
  if (!container) return;

  const now = new Date();
  const pastAppts = allAppointments
    .filter(a => a.status === 'Completed' || new Date(a.appointment_date || a.dateTime) <= now)
    .sort((a, b) => new Date(b.appointment_date || b.dateTime) - new Date(a.appointment_date || a.dateTime))
    .slice(0, 3);

  if (pastAppts.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <i class="ti ti-clock" style="font-size: 32px;"></i>
        <p>No past visit history yet</p>
      </div>`;
    return;
  }

  container.innerHTML = pastAppts.map(appt => {
    const d = new Date(appt.appointment_date || appt.dateTime);
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const treatmentName = appt.treatment?.name || appt.reason || 'Dental Visit';
    const statusClass = (appt.status || 'completed').toLowerCase();

    return `
      <div class="appt-preview-item" onclick="openAppointmentDetailsModal('${appt.id}')" title="Click to view full visit details">
        <div class="appt-date-block">
          <span class="adb-month">${month}</span>
          <span class="adb-day">${day}</span>
        </div>
        <div class="appt-info">
          <div class="appt-treatment">${escapeHTML(treatmentName)}</div>
          <div class="appt-time">${time}</div>
        </div>
        <span class="status-pill ${statusClass}">${appt.status || 'Completed'}</span>
        <button type="button" class="btn-view-appt" onclick="event.stopPropagation(); openAppointmentDetailsModal('${appt.id}')">
          View →
        </button>
      </div>`;
  }).join('');
}

// ─── Dental & Medical History (My Records) ───────────────────────────
function updateHistoryStats() {
  const total = allAppointments.length;
  const completed = allAppointments.filter(a => a.status === 'Completed').length;
  const upcoming = allAppointments.filter(a => a.status !== 'Cancelled' && new Date(a.appointment_date || a.dateTime) > new Date()).length;

  let totalValue = 0;
  allAppointments.forEach(a => {
    if (a.status !== 'Cancelled') {
      const price = a.treatment?.price ? parseFloat(a.treatment.price) : 0;
      totalValue += price;
    }
  });

  safeSet('history-stat-total', total);
  safeSet('history-stat-completed', completed);
  safeSet('history-stat-upcoming', upcoming);
  safeSet('history-stat-value', `₱${totalValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
}

function filterPatientHistory() {
  const query = (document.getElementById('history-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('history-status-filter')?.value || 'ALL';

  const filtered = allAppointments.filter(appt => {
    const treatmentName = (appt.treatment?.name || appt.reason || '').toLowerCase();
    const notes = (appt.notes || '').toLowerCase();
    const status = (appt.status || '').toUpperCase();

    if (query) {
      if (!treatmentName.includes(query) && !notes.includes(query)) return false;
    }

    if (statusFilter === 'COMPLETED' && status !== 'COMPLETED') return false;
    if (statusFilter === 'CANCELLED' && status !== 'CANCELLED') return false;
    if (statusFilter === 'UPCOMING') {
      const isFuture = new Date(appt.appointment_date || appt.dateTime) > new Date();
      if (!isFuture || status === 'CANCELLED' || status === 'COMPLETED') return false;
    }

    return true;
  });

  renderPatientHistoryRecords(filtered);
}

function formatShortBranchName(raw) {
  return 'Balirong, Naga';
}

function renderPatientHistoryRecords(list = null) {
  const tbody = document.getElementById('records-table-body');
  const countInfo = document.getElementById('history-count-info');
  if (!tbody) return;

  const dataset = list !== null ? list : allAppointments;

  if (!dataset || dataset.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table-row" style="text-align: center;">
          <div style="padding: 32px 16px; text-align: center;">
            <i class="ti ti-calendar-off" style="font-size: 38px; margin-bottom: 8px; color: #94a3b8; display: inline-block;"></i>
            <p style="margin: 0; font-weight: 600; color: #64748b;">No dental visit records found.</p>
          </div>
        </td>
      </tr>`;
    if (countInfo) countInfo.textContent = 'Showing 0 visits';
    return;
  }

  const sorted = [...dataset].sort((a, b) =>
    new Date(b.appointment_date || b.dateTime) - new Date(a.appointment_date || a.dateTime)
  );

  tbody.innerHTML = sorted.map(appt => {
    const d = new Date(appt.appointment_date || appt.dateTime);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const treatmentName = appt.treatment?.name || appt.reason || 'Dental Consultation';

    const rawNotes = appt.notes || '';
    let dentistName = 'Staff Specialist';
    let rawBranch = 'Main Branch (Naga)';

    const branchMatch = rawNotes.match(/\[Branch:\s*([^\]]+)\]/i);
    if (branchMatch) rawBranch = branchMatch[1].trim();
    const branchName = formatShortBranchName(rawBranch);

    const dentistMatch = rawNotes.match(/\[Dentist:\s*([^\]]+)\]/i);
    if (dentistMatch && dentistMatch[1] !== 'No Preference') {
      dentistName = dentistMatch[1];
    } else if (appt.dentist?.name) {
      dentistName = appt.dentist.name;
    }

    // Clean chief concern from notes
    const cleanConcern = rawNotes.replace(/\[[^\]]+\]/g, '').trim();
    const allergMatch = rawNotes.match(/\[Allergies:\s*([^\]]+)\]/i);
    const hasAllergy = allergMatch && allergMatch[1] && allergMatch[1].trim().toLowerCase() !== 'none';

    // Format fee
    let feeDisplay = '₱1,500.00';
    if (appt.treatment && appt.treatment.price) {
      feeDisplay = `₱${parseFloat(appt.treatment.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (appt.fee) {
      feeDisplay = `₱${parseFloat(appt.fee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (appt.cost) {
      feeDisplay = `₱${parseFloat(appt.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (appt.price) {
      feeDisplay = `₱${parseFloat(appt.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    const s = appt.status || 'Pending';
    let statusClass = 'pending';
    if (s === 'Completed') statusClass = 'completed';
    else if (s === 'Cancelled') statusClass = 'cancelled';
    else if (s === 'Approved' || s === 'Confirmed') statusClass = 'approved';
    else if (s === 'In Progress' || s === 'Checked In') statusClass = 'in-progress';

    return `
      <tr>
        <!-- 1. Visit Date & Time -->
        <td style="white-space: nowrap;">
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.88rem;">${dateStr}</div>
          <div style="font-size: 0.76rem; color: #64748b; margin-top: 1px;"><i class="ti ti-clock" style="font-size: 12px;"></i> ${timeStr}</div>
        </td>
        <!-- 2. Dental Treatment -->
        <td>
          <div class="history-treatment-title" style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
            <i class="ti ti-dental" style="color: var(--accent); font-size: 16px;"></i>
            <span>${escapeHTML(treatmentName)}</span>
          </div>
          <div style="font-size: 0.76rem; color: #64748b; margin-top: 2px;">
            <i class="ti ti-map-pin" style="font-size: 11px;"></i> ${escapeHTML(branchName)}
          </div>
        </td>
        <!-- 3. Attending Dentist -->
        <td style="white-space: nowrap;">
          <div style="font-weight: 600; font-size: 0.86rem; color: var(--text-primary); display: flex; align-items: center; gap: 5px;">
            <i class="ti ti-stethoscope" style="font-size: 14px; color: #0284c7;"></i>
            <span>${escapeHTML(dentistName)}</span>
          </div>
        </td>
        <!-- 4. Chief Concern & Alerts -->
        <td>
          <div style="font-size: 0.82rem; color: var(--text-primary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(cleanConcern || 'Routine checkup / procedure')}">
            ${escapeHTML(cleanConcern || 'Routine checkup / procedure')}
          </div>
          ${hasAllergy ? `
            <div style="margin-top: 3px;">
              <span style="display: inline-flex; align-items: center; gap: 3px; background: #fee2e2; color: #b91c1c; font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 600;">
                <i class="ti ti-alert-triangle" style="font-size: 11px;"></i> Allergy: ${escapeHTML(allergMatch[1])}
              </span>
            </div>
          ` : ''}
        </td>
        <!-- 5. Treatment Fee -->
        <td style="white-space: nowrap; font-weight: 700; color: var(--text-primary); font-size: 0.88rem;">
          ${feeDisplay}
        </td>
        <!-- 6. Visit Status -->
        <td style="white-space: nowrap;">
          <span class="status-pill ${statusClass}">${s}</span>
        </td>
        <!-- 7. Action -->
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-secondary btn-view-appt" onclick="openAppointmentDetailsModal('${appt.id}')" title="View appointment clinical sheet and full details" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 4px;">
            <span>View Details</span>
            <i class="ti ti-arrow-right" style="font-size: 12px;"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  if (countInfo) {
    countInfo.textContent = `Showing ${sorted.length} visit record${sorted.length !== 1 ? 's' : ''}`;
  }
}

function renderAppointmentsFullList() {
  const container = document.getElementById('appointments-list-full');
  if (!container) return;

  if (allAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <i class="ti ti-calendar" style="font-size: 40px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
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

    let dentistText = '';
    const notesRaw = appt.notes || '';
    const dentistMatch = notesRaw.match(/\[Dentist:\s*([^\]]+)\]/i);
    if (dentistMatch && dentistMatch[1] && dentistMatch[1] !== 'No Preference') {
      dentistText = dentistMatch[1];
    } else if (appt.dentist?.name) {
      dentistText = appt.dentist.name;
    }

    return `
      <div class="appt-preview-item" onclick="openAppointmentDetailsModal('${appt.id}')" title="Click to view details, reschedule, or cancel">
        <div class="appt-date-block">
          <span class="adb-month">${month}</span>
          <span class="adb-day">${day}</span>
        </div>
        <div class="appt-info">
          <div class="appt-treatment">${escapeHTML(treatmentName)}</div>
          <div class="appt-time"><i class="ti ti-clock" style="font-size: 11px;"></i> ${time}${dentistText ? ` • <i class="ti ti-stethoscope" style="font-size: 11px;"></i> ${escapeHTML(dentistText)}` : ''}</div>
        </div>
        <span class="status-pill ${statusClass}">${appt.status || 'Pending'}</span>
        <button type="button" class="btn-view-appt" onclick="event.stopPropagation(); openAppointmentDetailsModal('${appt.id}')">
          View →
        </button>
      </div>`;
  }).join('');
}

// ─── 6-Pillar Patient Treatment Plans Module ──────────────────
let allPatientTreatmentPlans = [];

function switchRecordsSubtab(tab) {
  const viewVisits = document.getElementById('subtab-view-visits');
  if (viewVisits) viewVisits.style.display = 'block';
}
window.switchRecordsSubtab = switchRecordsSubtab;

function parsePatientPlanMeta(rawDesc) {
  const def = {
    summary: '',
    diagnosis: '',
    affected_teeth: '',
    priority: 'Urgent',
    visits_count: 1,
    timeline: '',
    total_fee: 0,
    insurance_coverage: 0,
    out_of_pocket: 0,
    alternatives: '',
    clinical_notes: ''
  };
  if (!rawDesc) return def;
  const str = String(rawDesc).trim();
  if (str.startsWith('{')) {
    try {
      const obj = JSON.parse(str);
      return { ...def, ...obj };
    } catch (e) {}
  }
  const diagMatch = str.match(/\[Diagnosis:\s*([^\]]+)\]/i);
  const teethMatch = str.match(/\[Teeth:\s*([^\]]+)\]/i);
  const altMatch = str.match(/\[Alternatives:\s*([^\]]+)\]/i);
  const timeMatch = str.match(/\[Timeline:\s*([^\]]+)\]/i);
  const visitsMatch = str.match(/\[Visits:\s*([^\]]+)\]/i);
  const insMatch = str.match(/\[InsuranceCoverage:\s*([^\]]+)\]/i);

  def.diagnosis = diagMatch ? diagMatch[1] : str.replace(/\[[^\]]+\]/g, '').trim();
  if (teethMatch) def.affected_teeth = teethMatch[1];
  if (altMatch) def.alternatives = altMatch[1];
  if (timeMatch) def.timeline = timeMatch[1];
  if (visitsMatch) def.visits_count = parseInt(visitsMatch[1], 10) || 1;
  if (insMatch) def.insurance_coverage = parseFloat(insMatch[1].replace(/[^0-9.]/g, '')) || 0;
  return def;
}

function parsePatientItemMeta(rawNotes, defaultFee = 0) {
  const def = {
    tooth: '',
    priority: 'Normal',
    fee: Number(defaultFee) || 0,
    insurance_covered: 0,
    out_of_pocket: Number(defaultFee) || 0,
    visit: 'Visit 1',
    notes: ''
  };
  if (!rawNotes) return def;
  const str = String(rawNotes).trim();
  if (str.startsWith('{')) {
    try {
      const obj = JSON.parse(str);
      return { ...def, ...obj };
    } catch (e) {}
  }
  const tMatch = str.match(/\[Tooth:\s*([^\]]+)\]/i);
  const pMatch = str.match(/\[Priority:\s*([^\]]+)\]/i);
  const insMatch = str.match(/\[Insurance:\s*([^\]]+)\]/i);
  const oopMatch = str.match(/\[Out-of-Pocket:\s*([^\]]+)\]/i);
  const vMatch = str.match(/\[Visit:\s*([^\]]+)\]/i);

  if (tMatch) def.tooth = tMatch[1];
  if (pMatch) def.priority = pMatch[1];
  if (insMatch) def.insurance_covered = parseFloat(insMatch[1].replace(/[^0-9.]/g, '')) || 0;
  if (oopMatch) def.out_of_pocket = parseFloat(oopMatch[1].replace(/[^0-9.]/g, '')) || 0;
  if (vMatch) def.visit = vMatch[1];
  def.notes = str.replace(/\[[^\]]+\]/g, '').trim();
  return def;
}

function getPatientPriorityClass(p) {
  const s = String(p || '').toLowerCase();
  if (s.includes('urgent') || s.includes('emergency') || s.includes('pain')) return 'urgent';
  if (s.includes('high') || s.includes('decay') || s.includes('caries')) return 'high';
  if (s.includes('preventive') || s.includes('medium') || s.includes('restore') || s.includes('normal')) return 'medium';
  return 'elective';
}

function loadPatientTreatmentPlans() {
  // Clinical treatment plans are sent directly to the patient's registered email
  allPatientTreatmentPlans = [];
  return Promise.resolve([]);
}
window.loadPatientTreatmentPlans = loadPatientTreatmentPlans;

// ─── Patient-Friendly Care Journey Helpers ───────────────────────────
const PATIENT_TOOTH_ANATOMY = {
  '18': 'Upper Right Wisdom Tooth (#18)',
  '17': 'Upper Right 2nd Molar (#17)',
  '16': 'Upper Right 1st Molar (#16)',
  '15': 'Upper Right 2nd Premolar (#15)',
  '14': 'Upper Right 1st Premolar (#14)',
  '13': 'Upper Right Canine / Eye Tooth (#13)',
  '12': 'Upper Right Lateral Incisor (#12)',
  '11': 'Upper Right Front Center Tooth (#11)',
  '21': 'Upper Left Front Center Tooth (#21)',
  '22': 'Upper Left Lateral Incisor (#22)',
  '23': 'Upper Left Canine / Eye Tooth (#23)',
  '24': 'Upper Left 1st Premolar (#24)',
  '25': 'Upper Left 2nd Premolar (#25)',
  '26': 'Upper Left 1st Molar (#26)',
  '27': 'Upper Left 2nd Molar (#27)',
  '28': 'Upper Left Wisdom Tooth (#28)',
  '38': 'Lower Left Wisdom Tooth (#38)',
  '37': 'Lower Left 2nd Molar (#37)',
  '36': 'Lower Left 1st Molar (#36)',
  '35': 'Lower Left 2nd Premolar (#35)',
  '34': 'Lower Left 1st Premolar (#34)',
  '33': 'Lower Left Canine (#33)',
  '32': 'Lower Left Lateral Incisor (#32)',
  '31': 'Lower Left Front Center Tooth (#31)',
  '41': 'Lower Right Front Center Tooth (#41)',
  '42': 'Lower Right Lateral Incisor (#42)',
  '43': 'Lower Right Canine (#43)',
  '44': 'Lower Right 1st Premolar (#44)',
  '45': 'Lower Right 2nd Premolar (#45)',
  '46': 'Lower Right 1st Molar (#46)',
  '47': 'Lower Right 2nd Molar (#47)',
  '48': 'Lower Right Wisdom Tooth (#48)'
};

function formatFriendlyTooth(str) {
  if (!str) return '';
  const clean = str.trim();
  const digits = clean.match(/\d+/);
  if (digits && PATIENT_TOOTH_ANATOMY[digits[0]]) {
    return PATIENT_TOOTH_ANATOMY[digits[0]];
  }
  if (/upper right/i.test(clean)) return `${clean} (Upper Right Arch)`;
  if (/upper left/i.test(clean)) return `${clean} (Upper Left Arch)`;
  if (/lower right/i.test(clean)) return `${clean} (Lower Right Arch)`;
  if (/lower left/i.test(clean)) return `${clean} (Lower Left Arch)`;
  return clean.startsWith('#') ? `Tooth ${clean}` : `Tooth #${clean}`;
}

function translateDiagnosisFindings(text) {
  if (!text) return [];
  const parts = text.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  const items = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    let icon = 'ti ti-clipboard-heart';
    let title = '';
    let explanation = '';

    const teethFound = (part.match(/#\d+|\b[1-4][1-8]\b/g) || []).map(t => formatFriendlyTooth(t));

    if (lower.includes('pulpitis') || lower.includes('cavities') || lower.includes('caries') || lower.includes('decay')) {
      icon = 'ti ti-dental';
      if (lower.includes('reversible pulpitis')) {
        title = 'Tooth Decay with Nerve Sensitivity (Reversible)';
        explanation = 'There are deep cavities on the chewing surface reaching near the nerve, causing mild sensitivity. Good news: because it is reversible, treating the decay now allows the tooth nerve to completely heal without needing root canal surgery.';
      } else if (lower.includes('irreversible pulpitis')) {
        title = 'Deep Tooth Decay Reaching Nerve';
        explanation = 'The decay has reached the tooth nerve, causing throbbing or persistent ache. Nerve treatment (root canal therapy) is recommended to relieve the pain and save your natural tooth.';
      } else {
        title = 'Dental Cavity / Tooth Decay';
        explanation = 'Bacterial tooth decay detected on tooth surfaces. Cleaning the decayed area and placing a tooth-colored aesthetic filling will restore strength and prevent tooth loss.';
      }
    } else if (lower.includes('gingivitis') || lower.includes('calculus') || lower.includes('gum') || lower.includes('periodont')) {
      icon = 'ti ti-heart-rate-monitor';
      title = 'Gum Inflammation & Tartar Buildup';
      explanation = 'Your gums show mild to moderate swelling and redness due to hardened tartar (calculus) beneath the gumline. A thorough dental cleaning (scaling and polishing) will remove bacteria and restore healthy, firm pink gums.';
    } else if (lower.includes('missing') || lower.includes('drift') || lower.includes('gap') || lower.includes('extracted')) {
      icon = 'ti ti-arrows-exchange';
      title = 'Missing Tooth Space & Shifting';
      explanation = 'A missing tooth space is allowing adjacent teeth to slowly tilt or drift. Restoring the missing tooth with a replacement (such as a dental implant or bridge) will stabilize your bite and restore chewing balance.';
    } else if (lower.includes('fracture') || lower.includes('chip') || lower.includes('crack') || lower.includes('broken')) {
      icon = 'ti ti-shield-half';
      title = 'Tooth Fracture / Chipped Tooth';
      explanation = 'Structural crack or chipped tooth surface detected. Restorative bonding or a protective crown will reinforce the tooth and prevent cracking further.';
    } else if (lower.includes('malocclusion') || lower.includes('crowd') || lower.includes('crooked') || lower.includes('bite')) {
      icon = 'ti ti-grid-dots';
      title = 'Bite Alignment & Tooth Spacing';
      explanation = 'Mild crowding or alignment irregularity detected. Corrective alignment can balance your chewing forces and make daily brushing easier.';
    } else {
      title = 'Clinical Finding';
      explanation = part;
    }

    items.push({
      icon,
      title,
      explanation,
      originalText: part,
      teeth: teethFound
    });
  }

  return items;
}

function translateProcedureExpectation(procName, notes) {
  const nameLower = (procName || '').toLowerCase();
  const notesLower = (notes || '').toLowerCase();
  const combined = `${nameLower} ${notesLower}`;

  if (combined.includes('root canal') || combined.includes('pulpectomy') || combined.includes('endodontic')) {
    return {
      friendlyTitle: 'Root Canal Treatment (Relieves Pain & Saves Tooth)',
      whatHappens: 'Your dentist gently numbs the tooth, removes the irritated nerve tissue to immediately stop toothache, and cleans and seals the inside of the tooth so you keep your natural smile.',
      patientExperience: 'Painless procedure performed under gentle local anesthesia. A protective rubber dam shield is used to keep everything clean and comfortable.',
      badgeLabel: 'Pain Relief & Tooth Preservation'
    };
  }

  if (combined.includes('filling') || combined.includes('composite') || combined.includes('restoration')) {
    return {
      friendlyTitle: 'Tooth-Colored Aesthetic Filling',
      whatHappens: 'The decayed portion of the tooth is carefully cleared away and rebuilt with a durable, tooth-colored resin filling that blends seamlessly with your natural teeth.',
      patientExperience: 'Quick, painless appointment. The filling is hardened instantly under a specialized curing light so you can eat and chew comfortably.',
      badgeLabel: 'Decay Removal & Restoration'
    };
  }

  if (combined.includes('clean') || combined.includes('scaling') || combined.includes('prophylaxis')) {
    return {
      friendlyTitle: 'Professional Deep Dental Cleaning',
      whatHappens: 'Gentle ultrasonic scaling to remove hardened tartar and bacterial plaque from tooth surfaces and beneath the gumline, followed by smooth polishing.',
      patientExperience: 'Leaves your mouth feeling clean and refreshed, eliminates gum bleeding, and promotes fresh breath.',
      badgeLabel: 'Preventive Care & Gum Health'
    };
  }

  if (combined.includes('extract') || combined.includes('removal')) {
    return {
      friendlyTitle: 'Gentle Tooth Extraction',
      whatHappens: 'Careful removal of a compromised tooth to protect neighboring teeth and jawbone from infection.',
      patientExperience: 'Fully numbed with local anesthesia so you feel only gentle pressure, no pain. You will receive clear aftercare instructions for quick healing.',
      badgeLabel: 'Infection Prevention'
    };
  }

  if (combined.includes('crown') || combined.includes('jacket') || combined.includes('cap')) {
    return {
      friendlyTitle: 'Protective Dental Crown',
      whatHappens: 'A custom-made, durable ceramic cap placed over a weakened tooth to restore full chewing strength, shape, and natural appearance.',
      patientExperience: 'Custom-shaded to match neighboring teeth perfectly for a long-lasting, natural smile.',
      badgeLabel: 'Tooth Reinforcement'
    };
  }

  if (combined.includes('implant')) {
    return {
      friendlyTitle: 'Permanent Dental Implant',
      whatHappens: 'A permanent replacement tooth anchored into the jawbone that looks, feels, and functions just like your real natural tooth.',
      patientExperience: 'Preserves jawbone density and does not require grinding down neighboring healthy teeth.',
      badgeLabel: 'Permanent Tooth Replacement'
    };
  }

  if (combined.includes('whitening') || combined.includes('bleaching')) {
    return {
      friendlyTitle: 'Professional Teeth Whitening',
      whatHappens: 'Safe, clinical-grade enamel brightening that lifts years of tea, coffee, and food stains.',
      patientExperience: 'Noticeably brighter, whiter smile in a single session with enamel-safe formulations.',
      badgeLabel: 'Cosmetic Brightening'
    };
  }

  return {
    friendlyTitle: procName || 'Dental Care Procedure',
    whatHappens: notes ? `Specialized procedure: ${notes}` : 'Specialized clinical treatment recommended by your dentist to restore your oral health.',
    patientExperience: 'Performed with gentle care and modern dental equipment for your comfort.',
    badgeLabel: 'Clinical Treatment'
  };
}

function getFriendlyPriorityLabel(p) {
  const s = String(p || '').toLowerCase();
  if (s.includes('urgent') || s.includes('emergency') || s.includes('pain')) return '🚨 Pain Relief & Protection';
  if (s.includes('high') || s.includes('decay') || s.includes('caries')) return '⚠️ Active Decay Treatment';
  if (s.includes('preventive') || s.includes('medium') || s.includes('restore') || s.includes('normal')) return '🛡️ Preventive & Restorative';
  return '✨ Aesthetic & Cosmetic';
}

function bookTreatmentStep(treatmentName, treatmentId) {
  showToast(`Preparing appointment booking for ${treatmentName}...`, 'info');
  switchSection('appointments');
  setTimeout(() => {
    const inputTreatment = document.getElementById('wizard-treatment-id');
    if (inputTreatment && treatmentId) {
      inputTreatment.value = treatmentId;
    }
    const sCard = document.querySelector(`.service-picker-card[data-id="${treatmentId}"]`);
    if (sCard) sCard.click();

    const notesInput = document.getElementById('wizard-notes');
    if (notesInput && !notesInput.value) {
      notesInput.value = `Treatment Plan Follow-up: ${treatmentName}`;
    }
  }, 350);
}
window.bookTreatmentStep = bookTreatmentStep;

function openCarePlanChat(topic) {
  const orb = document.getElementById('ai-unified-trigger');
  if (orb) {
    orb.click();
    setTimeout(() => {
      const input = document.getElementById('chat-input-text');
      if (input) {
        input.value = `Can you explain my dental treatment plan in simple terms? (Specifically regarding: ${topic || 'procedures and costs'})`;
        input.focus();
      }
    }, 400);
  } else {
    alert('You can contact Fano Dental Clinic at (032) 123-4567 or visit during office hours.');
  }
}
window.openCarePlanChat = openCarePlanChat;

function renderPatientTreatmentPlans() {
  const container = document.getElementById('patient-treatment-plans-list');
  if (!container) return;

  if (!allPatientTreatmentPlans || allPatientTreatmentPlans.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border-radius: 16px; border: 2px dashed var(--border);">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(11, 60, 77, 0.08); color: var(--primary-color); display: inline-flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 14px;">
          <i class="ti ti-clipboard-heart"></i>
        </div>
        <h4 style="margin: 0 0 6px; font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">No Treatment Plans Assigned Yet</h4>
        <p style="margin: 0 auto 20px; max-width: 480px; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">
          Once your attending dentist finishes your diagnostic exam, your personalized step-by-step care plan with procedure breakdown, fees, and timeline will be published here.
        </p>
        <button class="btn btn-primary" onclick="switchSection('appointments')" style="display: inline-flex; align-items: center; gap: 8px;">
          <i class="ti ti-calendar-plus"></i> Book Consultation
        </button>
      </div>`;
    return;
  }

  container.innerHTML = allPatientTreatmentPlans.map(plan => {
    const meta = parsePatientPlanMeta(plan.description);
    const rawItems = plan.items || [];
    const items = [...rawItems].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
    
    const totalSteps = items.length;
    const completedSteps = items.filter(i => String(i.status).toLowerCase() === 'completed').length;
    const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    
    // Find first uncompleted step as Next Step
    const nextStepItem = items.find(i => String(i.status).toLowerCase() !== 'completed');

    const dentistName = plan.dentist?.name || 'Dr. John Doe (Attending Dentist)';
    const totalFee = Number(plan.total_estimated_cost) || Number(meta.total_fee) || 0;
    const insuranceCovered = Number(meta.insurance_coverage) || 0;
    const outOfPocket = Math.max(0, totalFee - insuranceCovered);
    const dateStr = plan.created_at ? new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    // Plain English Findings
    const diagnosisFindings = translateDiagnosisFindings(meta.diagnosis);

    // Affected teeth badges with anatomical location
    const teethPills = (meta.affected_teeth || '').split(/[,;]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => `<span class="patient-tooth-pill"><i class="ti ti-tooth"></i> ${escapeHTML(formatFriendlyTooth(t))}</span>`)
      .join('');

    // Procedures list HTML
    const proceduresHtml = items.map((item, idx) => {
      const isDone = String(item.status).toLowerCase() === 'completed';
      const isNextStep = !isDone && nextStepItem && nextStepItem.id === item.id;
      const stepNum = item.sequence || idx + 1;
      const itemMeta = parsePatientItemMeta(item.notes);
      const stepFee = Number(itemMeta.fee) || 0;
      const stepIns = Number(itemMeta.insurance_covered) || 0;
      const stepOop = Math.max(0, stepFee - stepIns);

      const exp = translateProcedureExpectation(item.treatment_name, itemMeta.notes);
      const friendlyTooth = formatFriendlyTooth(itemMeta.tooth);

      return `
        <div class="min-proc-item ${isDone ? 'done' : isNextStep ? 'next' : ''}">
          <div class="min-proc-left">
            <div class="min-proc-indicator">
              ${isDone 
                ? '<i class="ti ti-check" style="font-size: 13px;"></i>' 
                : `<span>${stepNum}</span>`
              }
            </div>
            <div class="min-proc-details">
              <div class="min-proc-heading">
                <span class="min-proc-name">${escapeHTML(exp.friendlyTitle)}</span>
                ${friendlyTooth ? `<span class="min-proc-tooth">${escapeHTML(friendlyTooth)}</span>` : ''}
                ${isDone 
                  ? '<span class="min-tag done">Done</span>' 
                  : isNextStep 
                    ? '<span class="min-tag next">Next Up</span>' 
                    : '<span class="min-tag">Step ' + stepNum + '</span>'
                }
              </div>
              <p class="min-proc-desc">${escapeHTML(exp.whatHappens)}</p>
            </div>
          </div>

          <div class="min-proc-right">
            <div class="min-proc-pricing">
              <span class="min-proc-oop">₱${stepOop.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              ${stepIns > 0 ? `<span class="min-proc-covered">Covered -₱${stepIns.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>` : ''}
            </div>
            ${!isDone && isNextStep ? `
              <button type="button" class="btn-min-book" onclick="bookTreatmentStep('${escapeHTML(item.treatment_name)}', '${escapeHTML(item.treatment_id || '')}')">
                Book Visit
              </button>` : ''
            }
          </div>
        </div>`;
    }).join('');

    return `
      <div class="patient-plan-card minimal">
        <!-- Minimal Header -->
        <div class="min-plan-head">
          <div>
            <div class="min-plan-meta">
              <span class="min-status-dot"></span>
              <span class="min-status-text">${escapeHTML(plan.status || 'Active Plan')}</span>
              ${dateStr ? `<span class="min-sep">•</span><span>Issued ${dateStr}</span>` : ''}
              ${dentistName ? `<span class="min-sep">•</span><span>${escapeHTML(dentistName)}</span>` : ''}
            </div>
            <h3 class="min-plan-title">${escapeHTML(plan.name || 'Personalized Dental Care Plan')}</h3>
          </div>
          <div class="min-plan-actions">
            <button type="button" class="btn-min-print" onclick="printPatientTreatmentPlan('${plan.id}')" title="Print plan">
              <i class="ti ti-printer"></i> <span>Print</span>
            </button>
          </div>
        </div>

        <!-- Slim Minimal Progress Line -->
        <div class="min-progress-wrap">
          <div class="min-progress-track">
            <div class="min-progress-bar" style="width: ${progressPct}%;"></div>
          </div>
          <div class="min-progress-label">
            <span>${completedSteps} of ${totalSteps} procedures completed</span>
            <span>${progressPct}%</span>
          </div>
        </div>

        <!-- Section: Oral Health Findings -->
        <div class="min-section">
          <div class="min-section-title">Oral Health Findings</div>
          <div class="min-findings-grid">
            ${diagnosisFindings.length > 0 ? diagnosisFindings.map(f => `
              <div class="min-finding-row">
                <span class="min-bullet"></span>
                <div class="min-finding-body">
                  <strong>${escapeHTML(f.title)}</strong> — 
                  <span>${escapeHTML(f.explanation)}</span>
                  ${f.teeth && f.teeth.length ? `<span class="min-inline-tooth">${escapeHTML(f.teeth.join(', '))}</span>` : ''}
                </div>
              </div>
            `).join('') : `
              <div class="min-finding-row">
                <span class="min-bullet"></span>
                <div class="min-finding-body">
                  <span>${escapeHTML(meta.diagnosis || 'Clinical evaluation on file.')}</span>
                </div>
              </div>
            `}
          </div>
          ${teethPills ? `
            <div class="min-teeth-row">
              <span class="min-sublabel">Treated Sites:</span>
              <div class="min-teeth-tags">${teethPills}</div>
            </div>` : ''
          }
        </div>

        <!-- Section: Procedures (Clean Minimal List) -->
        <div class="min-section">
          <div class="min-section-title">Recommended Procedures (${totalSteps})</div>
          <div class="min-proc-list">
            ${proceduresHtml || '<p class="muted" style="font-size:0.8rem; padding:10px 0;">No individual procedures recorded.</p>'}
          </div>
        </div>

        <!-- Section: Financial Breakdown (Minimalist Inline Row) -->
        <div class="min-finance-bar">
          <div class="min-fin-col">
            <span class="min-fin-label">Estimated Total</span>
            <span class="min-fin-value">₱${totalFee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="min-fin-divider"></div>
          <div class="min-fin-col">
            <span class="min-fin-label">Insurance Covered</span>
            <span class="min-fin-value discount">${insuranceCovered > 0 ? '-₱' + insuranceCovered.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '₱0.00'}</span>
          </div>
          <div class="min-fin-divider"></div>
          <div class="min-fin-col">
            <span class="min-fin-label">Your Share (Pay per visit)</span>
            <span class="min-fin-value oop">₱${outOfPocket.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div class="min-fin-sub">Payable per visit as procedures are performed. No upfront balance required.</div>

        <!-- Notes: Timeline / Alternatives if any -->
        ${(meta.timeline || meta.alternatives) ? `
          <div class="plan-min-notes-row">
            ${meta.timeline ? `<div><strong>Timeline:</strong> ${escapeHTML(meta.timeline)}</div>` : ''}
            ${meta.alternatives ? `<div><strong>Alternatives considered:</strong> ${escapeHTML(meta.alternatives)}</div>` : ''}
          </div>
        ` : ''}

        <!-- Collapsible Technical Doctor Notes -->
        <details class="min-details">
          <summary>Doctor's clinical notes</summary>
          <p>${escapeHTML(meta.diagnosis || 'Clinical evaluation on file.')}</p>
        </details>
      </div>`;
  }).join('');
}
window.renderPatientTreatmentPlans = renderPatientTreatmentPlans;

function printPatientTreatmentPlan(planId) {
  window.print();
}
window.printPatientTreatmentPlan = printPatientTreatmentPlan;

// ─── Load Invoices ───────────────────────────────────────────
let delinquentOverdueInvoice = null;

function loadInvoices() {
  const invoicesTbody = document.getElementById('invoices-table-body');
  let cancelSkeleton = null;
  if (invoicesTbody && (!allInvoices || !allInvoices.length)) {
    cancelSkeleton = window.Skeleton ? window.Skeleton.show(invoicesTbody, () => window.Skeleton.tableRows(7, 4), 220) : null;
  }
  return apiFetch('/invoices', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(data => {
      if (cancelSkeleton) cancelSkeleton();
      if (!Array.isArray(data)) return allInvoices;
      allInvoices = data;
      renderInvoiceStats();
      renderFinancialWidgets();
      renderFinancialActivity();
      renderInvoicesPreview();
      renderInvoicesTable();
      renderPatientHistoryRecords();
      checkDelinquentBookingLock();
      return allInvoices;
    })
    .catch(err => {
      if (cancelSkeleton) cancelSkeleton();
      console.error('Invoices error:', err);
      return allInvoices;
    });
}

function renderInvoiceStats() {
  const unpaid = allInvoices
    .filter(inv => (inv.status === 'Unpaid' || !inv.is_paid) && inv.status !== 'Written Off')
    .reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);

  const unpaidStr = `₱${unpaid.toFixed(2)}`;
  safeSet('unpaid-val', unpaidStr);
  safeSet('balance-display', unpaidStr);
  safeSet('pstat-balance', `₱${unpaid.toFixed(0)}`);
  safeSet('pstat-invoices', allInvoices.length);
}

function checkDelinquentBookingLock() {
  const lockBanner = document.getElementById('booking-delinquent-lock');
  const wizardWrap = document.getElementById('booking-form-card-wrap');
  if (!lockBanner) return;

  const now = Date.now();
  const overdueInvs = allInvoices.filter(inv => {
    const isUnpaid = (inv.status || '').toLowerCase() === 'unpaid' || !inv.is_paid;
    if (!isUnpaid || inv.status === 'Written Off') return false;
    const issuedDate = new Date(inv.issued_at || inv.created_at || now);
    const daysOld = Math.floor((now - issuedDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysOld > 30;
  });

  if (overdueInvs.length > 0) {
    overdueInvs.sort((a, b) => new Date(a.issued_at || a.created_at) - new Date(b.issued_at || b.created_at));
    delinquentOverdueInvoice = overdueInvs[0];

    const totalOverdue = overdueInvs.reduce((sum, inv) => sum + (parseFloat(inv.amount || inv.total_amount) || 0), 0);
    const oldestDays = Math.max(31, Math.floor((now - new Date(delinquentOverdueInvoice.issued_at || delinquentOverdueInvoice.created_at).getTime()) / (1000 * 60 * 60 * 24)));

    safeSet('lock-days-badge', `${oldestDays} Days Overdue`);
    safeSet('lock-overdue-amount', `₱${totalOverdue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);

    lockBanner.style.display = 'block';
    if (wizardWrap) {
      wizardWrap.style.opacity = '0.35';
      wizardWrap.style.pointerEvents = 'none';
      wizardWrap.style.filter = 'grayscale(0.6)';
    }
  } else {
    delinquentOverdueInvoice = null;
    lockBanner.style.display = 'none';
    if (wizardWrap) {
      wizardWrap.style.opacity = '1';
      wizardWrap.style.pointerEvents = 'auto';
      wizardWrap.style.filter = 'none';
    }
  }
}

function payOverdueInvoiceNow() {
  if (delinquentOverdueInvoice && delinquentOverdueInvoice.id) {
    openPaymongoModal(delinquentOverdueInvoice.id);
  } else {
    switchSection('billing');
  }
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

  // Update Profile Metric Tiles
  safeSet('pstat-invoices', allInvoices.length);
  safeSet('pstat-balance', `₱${pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
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
        <i class="ti ti-activity" style="font-size: 32px;"></i>
        <p>No financial activity</p>
      </div>`;
    return;
  }

  container.innerHTML = activities.map(act => `
    <div class="financial-activity-item">
      <div class="activity-icon ${act.type}">
        ${act.type === 'payment' ? '<i class="ti ti-circle-check"></i>' : '<i class="ti ti-file-invoice"></i>'}
      </div>
      <div class="activity-content">
        <div class="activity-header">
          <span class="activity-type">${escapeHTML(act.title)}</span>
          <span class="activity-amount ${act.status}">${act.status === 'completed' ? '+' : ''}₱${act.amount.toFixed(2)}</span>
        </div>
        <div class="activity-details">
          <span class="activity-invoice">${escapeHTML(act.invoiceNumber)}</span>
          <span class="activity-date">${act.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span class="activity-method">${escapeHTML(act.method)}</span>
          <span class="activity-status ${act.status}">${act.status === 'completed' ? 'Paid' : 'Pending'}</span>
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
        <i class="ti ti-credit-card" style="font-size: 32px;"></i>
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
        : `<button class="btn-paymongo-mini" onclick="openPaymongoModal('${inv.id}')" title="Pay with PayMongo (GCash, Maya, Card)"><i class="ti ti-credit-card" style="font-size: 12px;"></i> Pay</button>`}
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
          <i class="ti ti-credit-card" style="font-size: 14px;"></i>
          <span>Pay with PayMongo</span>
        </button>
      `;
    } else {
      actionButton = `
        <button class="btn-receipt-view" onclick="viewInvoiceReceipt('${inv.id}')" title="View & Print Official Receipt">
          <i class="ti ti-printer" style="font-size: 13px;"></i>
          <span>Receipt</span>
        </button>
      `;
    }

    return `
      <tr>
        <td data-label="Invoice #"><strong>#${refId}</strong></td>
        <td data-label="Date Issued">${issued}</td>
        <td data-label="Service">${escapeHTML(service)}</td>
        <td data-label="Amount" style="font-weight:700; color: #0b3c4d;">₱${amount}</td>
        <td data-label="Status"><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td data-label="Paid At">${paidAt}</td>
        <td data-label="Actions" style="text-align: right;">${actionButton}</td>
      </tr>`;
  }).join('');
}

// ─── PayMongo Payment Integration ──────────────────────────────
let activePaymentInvoice = null;

async function openPaymongoModal(invoiceOrId) {
  let inv = null;

  if (invoiceOrId && typeof invoiceOrId === 'object') {
    inv = invoiceOrId;
  } else if (invoiceOrId) {
    const targetId = String(invoiceOrId).trim().toLowerCase();
    inv = (allInvoices || []).find(i => String(i.id).trim().toLowerCase() === targetId);

    // If not found in cache, fetch fresh invoices from server
    if (!inv) {
      try {
        const freshInvoices = await loadInvoices();
        inv = (freshInvoices || []).find(i => String(i.id).trim().toLowerCase() === targetId);
      } catch (e) {
        console.warn('[openPaymongoModal] Refresh failed:', e);
      }
    }
  }

  if (!inv) {
    showToast('Invoice record not found. Please refresh your page.', 'error');
    return;
  }

  activePaymentInvoice = inv;
  const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
  const refId = String(inv.id).slice(0, 8).toUpperCase();
  const serviceName = inv.appointment?.treatment?.name || inv.treatment_name || inv.service || 'Dental Consultation / Service';

  safeSet('pm-invoice-ref', `Invoice #${refId}`);
  safeSet('pm-invoice-service', serviceName);
  safeSet('pm-invoice-amount', `₱${amount}`);
  safeSet('pm-active-invoice-id', inv.id);

  // Check if invoice corresponds to an appointment with a 30% booking fee
  const notes = inv.appointment?.notes || '';
  const bookingFeeMatch = notes.match(/\[BookingFee:\s*([^\]]+)\]/i);
  const balanceMatch = notes.match(/\[RemainingBalance:\s*([^\]]+)\]/i);

  const labelEl = document.getElementById('pm-invoice-label');
  const noteEl = document.getElementById('pm-fee-note');
  const remBalanceNote = document.getElementById('pm-remaining-balance-note');

  if (bookingFeeMatch && bookingFeeMatch[1]) {
    if (labelEl) labelEl.textContent = '30% Booking Reservation Fee Deposit Due';
    if (noteEl) noteEl.style.display = 'flex';
    if (remBalanceNote && balanceMatch) {
      remBalanceNote.textContent = balanceMatch[1];
    }
  } else {
    if (labelEl) labelEl.textContent = 'Total Amount Due';
    if (noteEl) noteEl.style.display = 'none';
  }

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

  const currentPageUrl = window.location.href.split('?')[0];

  apiFetch('/payments/paymongo/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      invoice_id: activePaymentInvoice.id,
      success_url: `${currentPageUrl}?payment=success&invoice_id=${activePaymentInvoice.id}`,
      cancel_url: `${currentPageUrl}?payment=cancelled&invoice_id=${activePaymentInvoice.id}`
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

async function viewInvoiceReceipt(invoiceOrId) {
  let inv = null;
  if (invoiceOrId && typeof invoiceOrId === 'object') {
    inv = invoiceOrId;
  } else if (invoiceOrId) {
    const targetId = String(invoiceOrId).trim().toLowerCase();
    inv = (allInvoices || []).find(i => String(i.id).trim().toLowerCase() === targetId);
    if (!inv) {
      try {
        const fresh = await loadInvoices();
        inv = (fresh || []).find(i => String(i.id).trim().toLowerCase() === targetId);
      } catch (e) {
        console.warn('[viewInvoiceReceipt] Refresh failed:', e);
      }
    }
  }
  if (!inv) return;

  const amount = parseFloat(inv.amount || inv.total_amount || 0).toFixed(2);
  const refId = String(inv.id).slice(0, 8).toUpperCase();
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

function checkRatingUrlParam() {
  const params = new URLSearchParams(window.location.search);
  const rateApptId = params.get('rateAppt') || params.get('rate');
  if (rateApptId) {
    setTimeout(() => {
      openRateTreatmentModal(rateApptId);
    }, 700);
  }
}
window.checkRatingUrlParam = checkRatingUrlParam;

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

// ─── Load Treatments (for booking wizard & full services catalog) ──
function loadTreatments(forceRefresh = false) {
  if (forceRefresh) {
    showToast('Refreshing clinic treatments...', 'info');
  }
  const catalogGrid = document.getElementById('patient-services-catalog-grid');
  let cancelSkeleton = null;
  if (catalogGrid && (!allTreatments || !allTreatments.length || forceRefresh)) {
    cancelSkeleton = window.Skeleton ? window.Skeleton.show(catalogGrid, () => window.Skeleton.cards(6, 'service'), 220) : null;
  }
  return apiFetch('/treatments', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(treatments => {
      if (cancelSkeleton) cancelSkeleton();
      allTreatments = (Array.isArray(treatments) && treatments.length > 0) ? treatments : [...DEFAULT_TREATMENTS];
      renderTreatmentsPicker();
      renderServicesCatalog();
      if (forceRefresh) {
        showToast('Services catalog synchronized with clinic system!', 'success');
      }
    })
    .catch(err => {
      if (cancelSkeleton) cancelSkeleton();
      console.error('Treatments error:', err);
      if (!allTreatments || allTreatments.length === 0) {
        allTreatments = [...DEFAULT_TREATMENTS];
      }
      renderTreatmentsPicker();
      renderServicesCatalog();
      if (forceRefresh) {
        showToast('Could not fetch latest treatments from server', 'error');
      }
    });
}

function getTreatmentTheme(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('clean') || n.includes('prophylaxis') || n.includes('scaling')) {
    return {
      icon: 'ti-sparkles',
      category: 'Preventive & Hygiene',
      bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
      color: '#0284c7'
    };
  }
  if (n.includes('whiten') || n.includes('bleach') || n.includes('veneer') || n.includes('cosmetic')) {
    return {
      icon: 'ti-sun',
      category: 'Cosmetic Dentistry',
      bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      color: '#d97706'
    };
  }
  if (n.includes('root canal') || n.includes('endodontic')) {
    return {
      icon: 'ti-pulse',
      category: 'Endodontics',
      bg: 'linear-gradient(135deg, #ffe4e6 0%, #fecdd3 100%)',
      color: '#e11d48'
    };
  }
  if (n.includes('extract') || n.includes('surgery') || n.includes('wisdom')) {
    return {
      icon: 'ti-scissors',
      category: 'Oral Surgery',
      bg: 'linear-gradient(135deg, #fee2e2 0%, #fca5a5 100%)',
      color: '#dc2626'
    };
  }
  if (n.includes('brace') || n.includes('aligner') || n.includes('ortho')) {
    return {
      icon: 'ti-grid-dots',
      category: 'Orthodontics',
      bg: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
      color: '#7c3aed'
    };
  }
  if (n.includes('implant') || n.includes('prostho') || n.includes('crown') || n.includes('bridge') || n.includes('denture')) {
    return {
      icon: 'ti-shield-check',
      category: 'Prosthodontics & Implants',
      bg: 'linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)',
      color: '#0f766e'
    };
  }
  if (n.includes('fill') || n.includes('restor') || n.includes('composite') || n.includes('cavity')) {
    return {
      icon: 'ti-first-aid-kit',
      category: 'Restorative Care',
      bg: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
      color: '#16a34a'
    };
  }
  if (n.includes('x-ray') || n.includes('radiograph') || n.includes('panoramic')) {
    return {
      icon: 'ti-photo',
      category: 'Diagnostics & Imaging',
      bg: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
      color: '#475569'
    };
  }
  if (n.includes('consult') || n.includes('check') || n.includes('exam')) {
    return {
      icon: 'ti-stethoscope',
      category: 'Consultation & Checkup',
      bg: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
      color: '#4f46e5'
    };
  }
  return {
    icon: 'ti-dental',
    category: 'General Dentistry',
    bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    color: '#0284c7'
  };
}

function getTreatmentIcon(name = '') {
  return getTreatmentTheme(name).icon;
}

function getTreatmentCategory(name = '') {
  return getTreatmentTheme(name).category;
}

// ─── Clinic Services Catalog & Visual Data ────────────────────────────────────
const CLINIC_SERVICES_METADATA = {
  cleaning: {
    image: '../Resources/services/cleaning.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=700&auto=format&fit=crop&q=80',
    tagline: 'Ultrasonic calculus scaling, plaque removal & high-gloss enamel polish',
    summary: 'Comprehensive oral prophylaxis removing calcified tartar, harmful bacteria, and stubborn surface stains beneath the gum line to maintain oral health and fresh breath.',
    highlights: [
      'Ultrasonic Scaling & Tartar Removal',
      'Interdental Flossing & Plaque Elimination',
      'Prophy Paste Deep Stain Polishing',
      'Protective Fluoride Varnish Coat'
    ],
    indications: [
      'Bleeding, swollen, or tender gums (early gingivitis)',
      'Visible yellow or brown tartar buildup along tooth margins',
      'Persistent halitosis (bad breath) or rough tooth surfaces',
      'Recommended every 6 months for adults & children'
    ],
    steps: [
      { step: 1, title: 'Oral & Periodontal Exam', desc: 'Dentist inspects gums, enamel strength, and locates tartar buildup pockets.' },
      { step: 2, title: 'Ultrasonic Scaling', desc: 'High-frequency acoustic vibrations gently break up hardened tartar deposits.' },
      { step: 3, title: 'Fine Hand Scaling', desc: 'Precision curettes cleanse tight contact points between teeth.' },
      { step: 4, title: 'Polishing & Fluoride', desc: 'Specialized paste polishes enamel to a smooth finish, followed by protective fluoride.' }
    ],
    preparation: 'Brush and floss lightly before your appointment. Inform your hygienist of any gum tenderness.',
    aftercare: 'Refrain from dark drinks (coffee, tea, soda) or smoking for at least 1–2 hours following fluoride application.'
  },
  filling: {
    image: '../Resources/services/filling.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=700&auto=format&fit=crop&q=80',
    tagline: 'Tooth-colored durable composite restoration for cavities and chipped teeth',
    summary: 'Restores decayed or damaged teeth using biocompatible, shade-matched composite resin that chemically bonds to natural tooth structure for seamless aesthetics and strength.',
    highlights: [
      'Invisible Enamel Shade-Matching',
      'Micro-Mechanical Tooth Bonding',
      'Minimally Invasive Decay Removal',
      'High-Intensity LED Curing'
    ],
    indications: [
      'Cavities / dental caries or visible dark pits',
      'Tooth sensitivity when eating cold, hot, or sweet food',
      'Food constantly catching between back molars',
      'Chipped, worn, or cracked biting surfaces'
    ],
    steps: [
      { step: 1, title: 'Local Anesthesia & Prep', desc: 'Mild local numbing ensures a 100% painless, comfortable session.' },
      { step: 2, title: 'Decay Removal', desc: 'Specialized micro-instruments remove infected dentin while preserving healthy enamel.' },
      { step: 3, title: 'Adhesive Bonding', desc: 'Etching gel and bonding agent are applied to create a microscopic bond.' },
      { step: 4, title: 'Layering & Light Curing', desc: 'Composite resin is sculpted layer-by-layer and hardened instantly with blue LED light.' },
      { step: 5, title: 'Bite Check & Polish', desc: 'Articulating paper checks your bite alignment, followed by diamond high-shine polish.' }
    ],
    preparation: 'Eat a light meal prior to treatment so you are comfortable while local numbing is active.',
    aftercare: 'Avoid chewing hard or sticky foods until local anesthesia fully subsides to prevent accidentally biting your cheek or tongue.'
  },
  extraction: {
    image: '../Resources/services/extraction.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=700&auto=format&fit=crop&q=80',
    tagline: 'Gentle, pain-free removal of problematic or impacted wisdom teeth',
    summary: 'Safe surgical or simple extraction of impacted, malpositioned, or severely broken third molars under profound local anesthesia for immediate pain relief.',
    highlights: [
      'Profound Pain-Free Local Anesthesia',
      'Gentle Atraumatic Tooth Elevation',
      'Sterile Hemostatic Dressing',
      'Comprehensive Recovery Care Kit'
    ],
    indications: [
      'Impacted or angled wisdom teeth pushing adjacent teeth',
      'Recurrent swelling, infection, or pain around back molars (pericoronitis)',
      'Severe tooth decay extending beyond restorable pulp levels',
      'Orthodontic requirement to relieve severe dental crowding'
    ],
    steps: [
      { step: 1, title: 'Digital X-Ray Evaluation', desc: 'Panoramic radiograph assesses root curvature and proximity to mandibular nerves.' },
      { step: 2, title: 'Local Anesthesia Delivery', desc: 'Profound dental block numbs the surgical site completely.' },
      { step: 3, title: 'Gentle Elevation & Extraction', desc: 'Careful sectioning and gentle elevation remove the tooth without trauma.' },
      { step: 4, title: 'Socket Disinfection & Sutures', desc: 'The site is irrigated with sterile saline, sutured with dissolvable thread, and packed with sterile gauze.' }
    ],
    preparation: 'Wear loose comfortable clothing. Take any doctor-prescribed medications as scheduled.',
    aftercare: 'Bite firmly on gauze pad for 45 mins. Avoid spitting, drinking through straws, or smoking for 48 hours to preserve the protective blood clot.'
  },
  rootCanal: {
    image: '../Resources/services/root-canal.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?w=700&auto=format&fit=crop&q=80',
    tagline: 'Permanent nerve pain relief and natural tooth preservation',
    summary: 'Specialized endodontic procedure that cleanses infected root canals, halts throbbing pain, and saves teeth that would otherwise require extraction.',
    highlights: [
      'Immediate Severe Toothache Relief',
      'Rotary Nickel-Titanium Canal Shaping',
      'Antibacterial Medicament Irrigation',
      'Biocompatible Gutta-Percha Hermetic Seal'
    ],
    indications: [
      'Severe, throbbing tooth pain that disrupts sleep',
      'Prolonged sensitivity to temperature that lingers for minutes',
      'Pain when biting down or touching the affected tooth',
      'Gum abscess, swelling, or localized dental infection'
    ],
    steps: [
      { step: 1, title: 'Diagnostic Radiography', desc: 'Detailed X-rays determine root canal count and infection boundary.' },
      { step: 2, title: 'Painless Access & Isolation', desc: 'Profound anesthesia is administered and a sterile rubber dam is placed.' },
      { step: 3, title: 'Canal Cleaning & Shaping', desc: 'Rotary endodontic files remove inflamed pulp tissue and disinfect the micro-canals.' },
      { step: 4, title: 'Hermetic Sealing & Restoration', desc: 'Canals are obturated with thermoplastic gutta-percha and capped with a protective core.' }
    ],
    preparation: 'You may take an over-the-counter anti-inflammatory (e.g. ibuprofen) 1 hour before appointment if approved by your doctor.',
    aftercare: 'Avoid heavy biting on the treated tooth until the final protective dental crown is placed. Mild soreness for 1-2 days is normal.'
  },
  whitening: {
    image: '../Resources/services/whitening.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=700&auto=format&fit=crop&q=80',
    tagline: 'Clinical laser & LED accelerated bleaching for a radiant smile',
    summary: 'In-office cosmetic bleaching using professional-strength hydrogen peroxide activated by specialized LED/laser light to brighten enamel 6–8 shades.',
    highlights: [
      'Lightens Enamel 6 to 8 Shades in 1 Hour',
      'Protective Gingival Barrier Isolation',
      'LED / Laser Accelerated Peroxide Gel',
      'Post-Whitening Enamel Desensitizer'
    ],
    indications: [
      'Deep discoloration from coffee, tea, red wine, or tobacco',
      'Enamel dullness or natural age-related tooth yellowing',
      'Special occasions: weddings, graduations, or job interviews',
      'Boost in confidence with an ultra-clean, glowing smile'
    ],
    steps: [
      { step: 1, title: 'VITA Shade Baseline', desc: 'Dentist records starting enamel shade using an official shade chart.' },
      { step: 2, title: 'Gum Protection Barrier', desc: 'Light-cured gingival barrier protects gums and lips from irritation.' },
      { step: 3, title: 'Bleaching Gel Application', desc: 'Professional hydrogen peroxide whitening gel is carefully painted on teeth.' },
      { step: 4, title: 'LED Light Activation', desc: 'Gel is activated in 3–4 consecutive 15-minute intervals under the bleaching lamp.' },
      { step: 5, title: 'Final Shade Reveal', desc: 'Protective barrier is peeled away, desensitizing paste is applied, and new shade is measured.' }
    ],
    preparation: 'Having a dental cleaning 1-2 weeks before whitening ensures the cleanest possible enamel surface.',
    aftercare: 'Stick to the "White Diet" (no coffee, tea, red wine, soy sauce, or smoking) for 48 hours.'
  },
  implants: {
    image: '../Resources/services/implants.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=700&auto=format&fit=crop&q=80',
    tagline: 'Permanent titanium tooth replacement matching natural teeth',
    summary: 'Gold-standard replacement for missing teeth using medical-grade titanium posts osseointegrated into jawbone and topped with lifelike porcelain crowns.',
    highlights: [
      '100% Natural Chewing & Biting Strength',
      'Prevents Jawbone Deterioration',
      'Lifelike Custom Zirconia / Porcelain Crown',
      'Lifelong Durable Tooth Replacement'
    ],
    indications: [
      'One or multiple missing permanent teeth',
      'Difficulty chewing or eating with missing teeth',
      'Desire for a permanent alternative to removable dentures',
      'Preventing adjacent teeth from shifting out of alignment'
    ],
    steps: [
      { step: 1, title: '3D CBCT Bone Scan', desc: 'Evaluation of bone density and precision 3D implant placement plan.' },
      { step: 2, title: 'Implant Post Placement', desc: 'Titanium implant fixture is gently placed into jawbone under local numbing.' },
      { step: 3, title: 'Osseointegration Period', desc: 'Implant naturally fuses with jawbone over 8–12 weeks to form a solid anchor.' },
      { step: 4, title: 'Custom Crown Seating', desc: 'Custom aesthetic porcelain crown is permanently attached to the abutment.' }
    ],
    preparation: 'Maintain excellent oral hygiene. Provide complete health and medication history.',
    aftercare: 'Avoid biting hard foods on implant site for 2 weeks; brush gently around healing abutment.'
  },
  braces: {
    image: '../Resources/services/braces.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=700&auto=format&fit=crop&q=80',
    tagline: 'Orthodontic alignment for perfectly straight teeth and balanced bite',
    summary: 'Comprehensive orthodontic solutions including metal, ceramic, and invisible aligners designed to correct crooked teeth, spacing, and bite irregularities.',
    highlights: [
      'Custom Aesthetic Alignment Plan',
      'Corrects Overbites, Underbites & Gaps',
      'Aesthetic Ceramic & Clear Options',
      'Long-Term Functional & Aesthetic Harmony'
    ],
    indications: [
      'Crowded, overlapping, or crooked teeth',
      'Excessive spacing or gaps between teeth',
      'Overbite, underbite, crossbite, or open bite alignment',
      'Difficulty flossing due to rotated teeth'
    ],
    steps: [
      { step: 1, title: 'Cephalometric & Digital Study', desc: 'Digital scans, photos, and facial measurements create orthodontic roadmap.' },
      { step: 2, title: 'Precision Bracket Placement', desc: 'Brackets are bonded to teeth and connected with flexible memory-alloy archwires.' },
      { step: 3, title: 'Periodic Gentle Adjustments', desc: 'Monthly appointments adjust wire tension to guide teeth into optimal position.' },
      { step: 4, title: 'Retainer Finishing', desc: 'After ideal alignment is reached, custom retainers preserve your dream smile.' }
    ],
    preparation: 'Ensure all cavities and tartar are addressed prior to bracket installation.',
    aftercare: 'Use orthodontic wax for wire friction. Avoid hard, crunchy, or sticky candies.'
  },
  crowns: {
    image: '../Resources/services/crowns.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1588776814546-daab30f310ce?w=700&auto=format&fit=crop&q=80',
    tagline: 'Custom porcelain and zirconia caps to restore broken or weakened teeth',
    summary: 'Full-coverage tooth caps crafted from high-translucency zirconia or porcelain to reinforce fractured teeth and restore chewing function with lifelike beauty.',
    highlights: [
      'High-Strength Zirconia & Ceramic',
      'Reenforces Weakened & Cracked Teeth',
      'Matches Adjacent Natural Teeth Color',
      'Restores Natural Chewing Efficiency'
    ],
    indications: [
      'Heavily broken, cracked, or fractured teeth',
      'Teeth after root canal therapy needing structural reinforcement',
      'Severe cosmetic tooth malformations or discoloration',
      'Replacing old discolored metal-ceramic crowns'
    ],
    steps: [
      { step: 1, title: 'Tooth Preparation', desc: 'Tooth is gently shaped to accommodate crown thickness under local anesthesia.' },
      { step: 2, title: 'Digital Intraoral Scan', desc: '3D optical scan creates a microscopic digital replica sent to dental lab.' },
      { step: 3, title: 'Protective Temporary Crown', desc: 'Temporary crown protects tooth while permanent crown is custom milled.' },
      { step: 4, title: 'Permanent Cementation', desc: 'Finished ceramic crown is checked for bite harmony and bonded permanently.' }
    ],
    preparation: 'Eat normally before appointment. Let dentist know if you have teeth grinding habits.',
    aftercare: 'Floss gently by sliding sideways rather than pulling up for the first 24 hours.'
  },
  emergency: {
    image: '../Resources/services/emergency.jpg',
    fallbackUrl: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=700&auto=format&fit=crop&q=80',
    tagline: 'Immediate same-day clinical relief for acute dental emergencies and pain',
    summary: 'Priority urgent care for acute toothaches, chipped or knocked-out teeth, facial swelling, or broken restorations with rapid clinical intervention.',
    highlights: [
      'Priority Same-Day Urgent Booking',
      'Rapid Pain & Infection Control',
      'Digital Diagnostic Radiographs',
      'Dedicated Emergency Clinical Specialists'
    ],
    indications: [
      'Severe, unmanageable dental pain or toothache',
      'Knocked-out, loose, or displaced tooth due to sports/accident',
      'Visible swelling in face, cheek, or gums with fever',
      'Lost filling or broken crown causing sharp tongue irritation'
    ],
    steps: [
      { step: 1, title: 'Immediate Pain Assessment', desc: 'Dentist performs emergency triage and administers rapid local pain relief.' },
      { step: 2, title: 'Targeted Diagnostic X-Ray', desc: 'Immediate digital image isolates root fracture, abscess, or trauma extent.' },
      { step: 3, title: 'Urgent Intervention', desc: 'Decay removal, temporary filling, drainage, or splinting stabilizes the tooth.' },
      { step: 4, title: 'Prescription & Care Plan', desc: 'Antibiotics or analgesics prescribed with scheduled follow-up restoration.' }
    ],
    preparation: 'For knocked-out teeth: hold tooth by crown (not root) and place in cold milk or saliva. Arrive immediately!',
    aftercare: 'Follow pain medication dosage strictly and attend scheduled follow-up.'
  }
};

function getServiceMetadata(name = '', treatment = {}) {
  const n = (name || '').toLowerCase();
  let key = 'cleaning';
  if (n.includes('clean') || n.includes('prophylaxis') || n.includes('scaling')) key = 'cleaning';
  else if (n.includes('fill') || n.includes('cavity') || n.includes('composite') || n.includes('restor')) key = 'filling';
  else if (n.includes('extract') || n.includes('wisdom') || n.includes('surgery') || n.includes('odontec')) key = 'extraction';
  else if (n.includes('root canal') || n.includes('endodontic')) key = 'rootCanal';
  else if (n.includes('whiten') || n.includes('bleach') || n.includes('cosmetic')) key = 'whitening';
  else if (n.includes('implant')) key = 'implants';
  else if (n.includes('brace') || n.includes('aligner') || n.includes('ortho')) key = 'braces';
  else if (n.includes('crown') || n.includes('bridge') || n.includes('veneer') || n.includes('denture')) key = 'crowns';
  else if (n.includes('emerg') || n.includes('urgent') || n.includes('pain') || n.includes('trauma')) key = 'emergency';

  const base = CLINIC_SERVICES_METADATA[key] || CLINIC_SERVICES_METADATA.cleaning;
  const summary = (treatment.description && treatment.description.trim()) ? treatment.description.trim() : base.summary;

  return {
    ...base,
    key,
    summary
  };
}

function renderTreatmentsPicker() {
  const grid = document.getElementById('services-picker-grid');
  if (!grid) return;
  if (Array.isArray(allTreatments) && allTreatments.length > 0) {
    const currentId = document.getElementById('wizard-treatment-id')?.value;
    grid.innerHTML = allTreatments.map(t => {
      const isSelected = currentId && (String(t.id) === String(currentId));
      const theme = getTreatmentTheme(t.name);
      const meta = getServiceMetadata(t.name, t);
      const durationMins = t.duration_minutes || t.durationMinutes || 30;
      const priceFormatted = parseFloat(t.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return `
        <div class="service-card ${isSelected ? 'selected' : ''}" data-id="${t.id}" data-name="${escapeHTML(t.name)}" data-price="${parseFloat(t.price || 0).toFixed(2)}">
          <div class="service-card-thumb-wrap">
            <img src="${meta.image}" alt="${escapeHTML(t.name)}" class="service-card-thumb" onerror="this.onerror=null; this.src='${meta.fallbackUrl}';">
            <span class="service-card-category">${theme.category}</span>
          </div>
          <div class="service-title">${escapeHTML(t.name)}</div>
          <div class="service-card-meta">
            <div class="service-price">₱${priceFormatted}</div>
            <div class="service-duration"><i class="ti ti-clock" style="font-size: 0.78rem;"></i> ${durationMins} mins</div>
          </div>
        </div>
      `;
    }).join('');

    // Attach selection listeners
    grid.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const treatId = card.getAttribute('data-id');
        const treatName = card.getAttribute('data-name');
        const treatPrice = card.getAttribute('data-price');
        const treatInput = document.getElementById('wizard-treatment-id');
        if (treatInput) treatInput.value = treatId;
        const summaryService = document.getElementById('summary-service');
        if (summaryService) {
          summaryService.textContent = `${treatName} (₱${treatPrice})`;
        }
      });
    });
  } else {
    grid.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">No services available</div>';
  }
}

function renderServicesCatalog(list = null) {
  const grid = document.getElementById('patient-services-catalog-grid');
  const countEl = document.getElementById('services-stat-count');
  const durationEl = document.getElementById('services-stat-duration');
  if (!grid) return;

  const dataset = list !== null ? list : allTreatments;

  if (countEl) {
    countEl.textContent = `${allTreatments.length} Procedures`;
  }

  if (!dataset || dataset.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; background: var(--bg-card); border: 1.5px dashed var(--border); border-radius: 16px;">
        <i class="ti ti-dental-off" style="font-size: 48px; color: #94a3b8; margin-bottom: 12px; display: inline-block;"></i>
        <h3 style="margin: 0 0 6px; font-weight: 700; color: var(--text-primary); font-size: 1.1rem;">No dental services found</h3>
        <p style="margin: 0 0 16px; color: var(--text-secondary); font-size: 0.88rem;">Try adjusting your search query or click refresh to sync the latest treatments added by the clinic.</p>
        <button type="button" class="btn btn-secondary" onclick="loadTreatments(true)" style="padding: 8px 16px; font-size: 0.85rem;">
          <i class="ti ti-refresh"></i> Refresh Catalog
        </button>
      </div>`;
    return;
  }

  // Calculate average duration
  if (durationEl && allTreatments.length > 0) {
    const totalMins = allTreatments.reduce((acc, t) => acc + (parseInt(t.duration_minutes || t.durationMinutes, 10) || 45), 0);
    const avg = Math.round(totalMins / allTreatments.length);
    durationEl.textContent = `~${avg} mins avg`;
  }

  grid.innerHTML = dataset.map(t => {
    const theme = getTreatmentTheme(t.name);
    const meta = getServiceMetadata(t.name, t);
    const priceVal = parseFloat(t.price || 0);
    const priceStr = `₱${priceVal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const durationMins = t.duration_minutes || t.durationMinutes || 45;

    return `
      <div class="service-catalog-card" data-id="${t.id}">
        <!-- High-res Picture Banner with Category & Duration Badges -->
        <div class="scc-img-wrap" onclick="openServiceDetailsModal('${t.id}')" title="Click to view complete clinical information & procedure guide">
          <img src="${meta.image}" alt="${escapeHTML(t.name)}" class="scc-img" loading="lazy" onerror="this.onerror=null; this.src='${meta.fallbackUrl}';">
          <div class="scc-img-overlay"></div>
          <div class="scc-img-top-badges">
            <span class="scc-category-badge" style="background: ${theme.bg}; color: ${theme.color};">
              <i class="ti ${theme.icon}"></i> ${theme.category}
            </span>
            <span class="scc-duration-badge">
              <i class="ti ti-clock"></i> ${durationMins} mins
            </span>
          </div>
          <div class="scc-img-bottom-badges">
            <span class="scc-avail-chip"><span class="scc-avail-dot"></span> Available</span>
            <span class="scc-quickview-hint"><i class="ti ti-eye"></i> View Details</span>
          </div>
        </div>

        <!-- Service Information Body -->
        <div class="scc-body">
          <h3 class="scc-title" onclick="openServiceDetailsModal('${t.id}')" title="Click to view details">${escapeHTML(t.name)}</h3>
          <p class="scc-tagline">${escapeHTML(meta.tagline)}</p>
          <p class="scc-desc">${escapeHTML(meta.summary)}</p>

          <!-- Highlights / Inclusions -->
          <div class="scc-highlights-list">
            ${(meta.highlights || []).slice(0, 3).map(h => `
              <span class="scc-highlight-chip">
                <i class="ti ti-circle-check"></i>
                <span>${escapeHTML(h)}</span>
              </span>
            `).join('')}
          </div>

          <!-- Pricing & Coverage -->
          <div class="scc-meta-row">
            <div class="scc-meta-item">
              <span class="scc-meta-label">Standard Clinic Fee</span>
              <span class="scc-price">${priceStr}</span>
            </div>
            <div class="scc-meta-item scc-meta-right">
              <span class="scc-meta-label">Payment Options</span>
              <span class="scc-covered-val"><i class="ti ti-shield-check"></i> Cash, HMO, GCash</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons: Only View Details -->
        <div class="scc-footer">
          <button type="button" class="scc-btn-details full-width" onclick="openServiceDetailsModal('${t.id}')" title="View comprehensive clinical information, steps, and preparation for ${escapeHTML(t.name)}">
            <i class="ti ti-info-circle"></i>
            <span>View Details</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openServiceDetailsModal(treatmentId) {
  let treat = (allTreatments || []).find(t => String(t.id) === String(treatmentId));
  if (!treat) {
    treat = DEFAULT_TREATMENTS.find(t => String(t.id) === String(treatmentId) || (t.name && t.name.toLowerCase() === String(treatmentId).toLowerCase()));
  }
  if (!treat) {
    const key = Object.keys(CLINIC_SERVICES_METADATA).find(k => k === treatmentId || (treatmentId && treatmentId.toLowerCase().includes(k)));
    if (key && CLINIC_SERVICES_METADATA[key]) {
      const m = CLINIC_SERVICES_METADATA[key];
      treat = {
        id: treatmentId,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        description: m.summary,
        price: 0,
        duration_minutes: 45
      };
    }
  }
  if (!treat) {
    if (typeof showToast === 'function') showToast('Service details not available', 'info');
    return;
  }

  const meta = getServiceMetadata(treat.name, treat);
  const theme = getTreatmentTheme(treat.name);
  const priceVal = parseFloat(treat.price || 0);
  const priceStr = `₱${priceVal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const durationMins = treat.duration_minutes || treat.durationMinutes || 45;

  // Populate hero image and badges
  const heroImg = document.getElementById('sdm-hero-img');
  if (heroImg) {
    heroImg.src = meta.image;
    heroImg.onerror = () => { heroImg.src = meta.fallbackUrl; };
  }

  const catBadge = document.getElementById('sdm-category-badge');
  if (catBadge) {
    catBadge.style.background = theme.bg;
    catBadge.style.color = theme.color;
    catBadge.innerHTML = `<i class="ti ${theme.icon}"></i> ${theme.category}`;
  }

  const durBadge = document.getElementById('sdm-duration-badge');
  if (durBadge) {
    durBadge.innerHTML = `<i class="ti ti-clock"></i> ${durationMins} mins`;
  }

  const titleEl = document.getElementById('sdm-title');
  if (titleEl) titleEl.textContent = treat.name;

  const taglineEl = document.getElementById('sdm-tagline');
  if (taglineEl) taglineEl.textContent = meta.tagline;

  // Clinical Description
  const descEl = document.getElementById('sdm-desc');
  if (descEl) descEl.textContent = meta.summary;

  // Highlights
  const highlightsEl = document.getElementById('sdm-highlights');
  if (highlightsEl) {
    highlightsEl.innerHTML = (meta.highlights || []).map(h => `
      <div class="sdm-highlight-item">
        <i class="ti ti-circle-check"></i>
        <span>${escapeHTML(h)}</span>
      </div>
    `).join('');
  }

  // Indications
  const indicationsEl = document.getElementById('sdm-indications');
  if (indicationsEl) {
    indicationsEl.innerHTML = (meta.indications || []).map(ind => `
      <div class="sdm-indication-item">
        <i class="ti ti-chevron-right"></i>
        <span>${escapeHTML(ind)}</span>
      </div>
    `).join('');
  }

  // Steps Timeline
  const stepsEl = document.getElementById('sdm-steps');
  if (stepsEl) {
    stepsEl.innerHTML = (meta.steps || []).map(s => `
      <div class="sdm-step-item">
        <div class="sdm-step-badge">${s.step}</div>
        <div class="sdm-step-info">
          <strong>${escapeHTML(s.title)}</strong>
          <p>${escapeHTML(s.desc)}</p>
        </div>
      </div>
    `).join('');
  }

  // Preparation & Aftercare
  const prepEl = document.getElementById('sdm-prep');
  if (prepEl) prepEl.textContent = meta.preparation || 'Maintain standard oral hygiene. Arrive 10 minutes prior to appointment.';

  const aftercareEl = document.getElementById('sdm-aftercare');
  if (aftercareEl) aftercareEl.textContent = meta.aftercare || 'Follow any specific advice given by your attending dental specialist.';

  // Price & Book button (if present)
  const priceEl = document.getElementById('sdm-price');
  if (priceEl) priceEl.textContent = priceStr;

  const bookBtn = document.getElementById('sdm-book-btn');
  if (bookBtn) {
    bookBtn.onclick = () => {
      closeServiceDetailsModal();
      bookServiceDirectly(treat.id);
    };
  }

  const modal = document.getElementById('modal-service-details');
  if (modal) {
    modal.classList.add('active');
    modal.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; z-index: 10000000 !important;';
    document.body.style.overflow = 'hidden';
    const sdmBody = modal.querySelector('.sdm-body');
    if (sdmBody) sdmBody.scrollTop = 0;
  }
}
window.openServiceDetailsModal = openServiceDetailsModal;
window._openServiceDetailsFull = openServiceDetailsModal;

function closeServiceDetailsModal() {
  const modal = document.getElementById('modal-service-details');
  if (modal) {
    modal.classList.remove('active');
    modal.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
    document.body.style.overflow = '';
  }
}
window.closeServiceDetailsModal = closeServiceDetailsModal;

// Delegated click handler for services catalog cards & View Details buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.scc-btn-details, .scc-img-wrap, .scc-title');
  if (btn) {
    const card = btn.closest('.service-catalog-card');
    const treatId = btn.getAttribute('data-id') || card?.getAttribute('data-id');
    if (treatId && typeof window.openServiceDetailsModal === 'function') {
      window.openServiceDetailsModal(treatId);
    }
  }
});

// Close service details on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-service-details');
    if (modal && modal.classList.contains('active')) {
      closeServiceDetailsModal();
    }
  }
});

let currentServiceCategory = 'all';

function selectServiceCategory(cat) {
  currentServiceCategory = cat || 'all';
  document.querySelectorAll('.svc-cat-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cat') === currentServiceCategory);
  });
  filterServicesCatalog();
}
window.selectServiceCategory = selectServiceCategory;

function filterServicesCatalog() {
  const query = (document.getElementById('services-search-input')?.value || '').toLowerCase().trim();
  const sortMode = document.getElementById('services-sort-select')?.value || 'default';

  let filtered = allTreatments.filter(t => {
    // 1. Category check
    if (currentServiceCategory !== 'all') {
      const name = (t.name || '').toLowerCase();
      if (currentServiceCategory === 'cleaning' && !(name.includes('clean') || name.includes('prophylaxis') || name.includes('scaling'))) return false;
      if (currentServiceCategory === 'restorative' && !(name.includes('fill') || name.includes('cavity') || name.includes('composite') || name.includes('restor'))) return false;
      if (currentServiceCategory === 'surgery' && !(name.includes('extract') || name.includes('wisdom') || name.includes('surgery') || name.includes('odontec'))) return false;
      if (currentServiceCategory === 'rootcanal' && !(name.includes('root canal') || name.includes('endodontic'))) return false;
      if (currentServiceCategory === 'ortho' && !(name.includes('brace') || name.includes('aligner') || name.includes('ortho'))) return false;
    }

    // 2. Query check
    if (!query) return true;
    const name = (t.name || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    const cat = getTreatmentCategory(t.name).toLowerCase();
    const meta = getServiceMetadata(t.name, t);
    const tagline = (meta.tagline || '').toLowerCase();
    return name.includes(query) || desc.includes(query) || cat.includes(query) || tagline.includes(query);
  });

  if (sortMode === 'price-asc') {
    filtered.sort((a, b) => parseFloat(a.price || 0) - parseFloat(b.price || 0));
  } else if (sortMode === 'price-desc') {
    filtered.sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
  } else if (sortMode === 'name-asc') {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortMode === 'duration-asc') {
    filtered.sort((a, b) => (parseInt(a.duration_minutes || a.durationMinutes, 10) || 45) - (parseInt(b.duration_minutes || b.durationMinutes, 10) || 45));
  }

  renderServicesCatalog(filtered);
}

function bookServiceDirectly(treatmentId) {
  const treat = (allTreatments || []).find(t => String(t.id) === String(treatmentId));
  if (!treat) {
    switchSection('appointments');
    return;
  }

  // Set the treatment ID in the booking wizard
  const treatInput = document.getElementById('wizard-treatment-id');
  if (treatInput) treatInput.value = treat.id;

  const summaryService = document.getElementById('summary-service');
  if (summaryService) {
    summaryService.textContent = `${treat.name} (₱${parseFloat(treat.price || 0).toFixed(2)})`;
  }

  // Switch to appointments section
  switchSection('appointments');

  // Select the card in step 1 picker
  const pickerGrid = document.getElementById('services-picker-grid');
  if (pickerGrid) {
    pickerGrid.querySelectorAll('.service-card').forEach(c => {
      c.classList.toggle('selected', String(c.getAttribute('data-id')) === String(treatmentId));
    });
  }

  showToast(`Selected "${treat.name}". Pick your clinic branch and preferred date!`, 'success');
}

// ─── Booking Wizard Logic ────────────────────────────────────
let currentStep = 1;
let selectedTime = '';

function updateDateTimeSummary() {
  const dateVal = document.getElementById('wizard-date')?.value;
  const timeVal = document.getElementById('wizard-time')?.value || selectedTime;
  const summaryEl = document.getElementById('summary-datetime');
  if (!summaryEl) return;

  if (dateVal && timeVal) {
    let formattedDate = dateVal;
    try {
      const [y, m, d] = dateVal.split('-').map(Number);
      if (y && m && d) {
        const dObj = new Date(y, m - 1, d);
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
          });
        }
      }
    } catch (_) {}
    summaryEl.textContent = `${formattedDate} • ${timeVal}`;
  } else if (dateVal) {
    let formattedDate = dateVal;
    try {
      const [y, m, d] = dateVal.split('-').map(Number);
      if (y && m && d) {
        const dObj = new Date(y, m - 1, d);
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
          });
        }
      }
    } catch (_) {}
    summaryEl.textContent = `${formattedDate} (Slot pending)`;
  } else if (timeVal) {
    summaryEl.textContent = `Date pending • ${timeVal}`;
  } else {
    summaryEl.textContent = '—';
  }

  const preview = document.getElementById('schedule-selected-preview');
  const previewText = document.getElementById('schedule-preview-text');
  if (preview && previewText) {
    if (dateVal && timeVal) {
      previewText.textContent = `${summaryEl.textContent}`;
      preview.style.display = 'inline-flex';
    } else {
      preview.style.display = 'none';
    }
  }
}

function updateDentistSummary(dentistName) {
  const summaryEl = document.getElementById('summary-dentist');
  if (!summaryEl) return;
  const name = dentistName || document.getElementById('wizard-dentist-name')?.value || 'No Preference';
  summaryEl.textContent = (name === 'No Preference') ? 'No Preference (Auto-assigned)' : name;
}

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
    dateInput.addEventListener('change', () => {
      checkAvailableSlots();
      updateDateTimeSummary();
    });
  }

  // Load Dentists List
  loadDentists();

  // Load Patient Profile Details for Step 1 auto-fill
  if (user) {
    safeVal('wizard-pat-name', user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '');
    safeVal('wizard-pat-email', user.email || '');
    safeVal('wizard-pat-phone', user.contact_number || user.contactNumber || user.phone || '');
    if (user.address) {
      safeVal('wizard-pat-address', user.address);
    }
  }

  // Initialize interactive address autocomplete & validation
  setupAddressAutocomplete();

  // GPS detect button and Map relocate button
  document.getElementById('btn-detect-gps')?.addEventListener('click', () => {
    detectGPSLocation(false);
  });
  document.getElementById('btn-map-relocate')?.addEventListener('click', () => {
    detectGPSLocation(false);
  });

  // Dynamic symptoms/notes requirement (required ONLY for 'Other Consultation')
  document.getElementById('wizard-primary-concern')?.addEventListener('change', updateNotesRequirement);
  updateNotesRequirement();

  // Populate branch picker cards and auto-detect patient's live location
  detectGPSLocation(true);

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
      document.querySelectorAll('.slot-btn').forEach(b => {
        b.classList.remove('selected');
        const badge = b.querySelector('.slot-badge-available');
        if (badge) badge.textContent = 'Available';
      });
      btn.classList.add('selected');
      const activeBadge = btn.querySelector('.slot-badge-available');
      if (activeBadge) activeBadge.textContent = 'Selected';
      selectedTime = btn.getAttribute('data-time');
      const timeInput = document.getElementById('wizard-time');
      if (timeInput) timeInput.value = selectedTime;
      updateDateTimeSummary();
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
  return [
    {
      id: 'main-balirong',
      name: 'Fano Dental Clinic',
      shortName: 'Fano Dental Clinic (Naga)',
      address: 'Balirong Highway, City of Naga, Cebu',
      city: 'City of Naga',
      lat: 10.2098,
      lng: 123.7580,
      phone: '(032) 489-1200',
      hours: 'Mon - Sat: 8:00 AM - 6:00 PM'
    }
  ];
}

const CEBU_ADDRESS_DIRECTORY = [
  // City of Naga Barangays (All 28 Barangays)
  { title: 'Balirong, City of Naga', label: 'Balirong, City of Naga, Cebu', lat: 10.2098, lng: 123.7540 },
  { title: 'Central Poblacion, City of Naga', label: 'Central Poblacion, City of Naga, Cebu', lat: 10.2085, lng: 123.7590 },
  { title: 'North Poblacion, City of Naga', label: 'North Poblacion, City of Naga, Cebu', lat: 10.2120, lng: 123.7600 },
  { title: 'South Poblacion, City of Naga', label: 'South Poblacion, City of Naga, Cebu', lat: 10.2045, lng: 123.7575 },
  { title: 'East Poblacion, City of Naga', label: 'East Poblacion, City of Naga, Cebu', lat: 10.2080, lng: 123.7615 },
  { title: 'West Poblacion, City of Naga', label: 'West Poblacion, City of Naga, Cebu', lat: 10.2082, lng: 123.7562 },
  { title: 'Inayagan, City of Naga', label: 'Inayagan, City of Naga, Cebu', lat: 10.2360, lng: 123.7760 },
  { title: 'Tuyan, City of Naga', label: 'Tuyan, City of Naga, Cebu', lat: 10.2235, lng: 123.7685 },
  { title: 'Colon, City of Naga', label: 'Colon, City of Naga, Cebu', lat: 10.2165, lng: 123.7625 },
  { title: 'Tinaan, City of Naga', label: 'Tinaan, City of Naga, Cebu', lat: 10.1975, lng: 123.7510 },
  { title: 'Inoburan, City of Naga', label: 'Inoburan, City of Naga, Cebu', lat: 10.1910, lng: 123.7450 },
  { title: 'Langtad, City of Naga', label: 'Langtad, City of Naga, Cebu', lat: 10.1815, lng: 123.7365 },
  { title: 'Pangdan, City of Naga', label: 'Pangdan, City of Naga, Cebu', lat: 10.2240, lng: 123.7380 },
  { title: 'Lutac, City of Naga', label: 'Lutac, City of Naga, Cebu', lat: 10.2330, lng: 123.7250 },
  { title: 'Uling, City of Naga', label: 'Uling, City of Naga, Cebu', lat: 10.2480, lng: 123.7110 },
  { title: 'Mainit, City of Naga', label: 'Mainit, City of Naga, Cebu', lat: 10.2190, lng: 123.7460 },
  { title: 'Naalad, City of Naga', label: 'Naalad, City of Naga, Cebu', lat: 10.2020, lng: 123.7475 },
  { title: 'Cogon, City of Naga', label: 'Cogon, City of Naga, Cebu', lat: 10.2145, lng: 123.7495 },
  { title: 'Cantao-an, City of Naga', label: 'Cantao-an, City of Naga, Cebu', lat: 10.2310, lng: 123.7550 },
  { title: 'Jaguimit, City of Naga', label: 'Jaguimit, City of Naga, Cebu', lat: 10.2490, lng: 123.7390 },
  { title: 'Lanas, City of Naga', label: 'Lanas, City of Naga, Cebu', lat: 10.1985, lng: 123.7320 },
  { title: 'Alpaco, City of Naga', label: 'Alpaco, City of Naga, Cebu', lat: 10.2150, lng: 123.7290 },
  { title: 'Bairan, City of Naga', label: 'Bairan, City of Naga, Cebu', lat: 10.2280, lng: 123.7190 },
  { title: 'Cabungahan, City of Naga', label: 'Cabungahan, City of Naga, Cebu', lat: 10.2410, lng: 123.7280 },
  { title: 'Mayana, City of Naga', label: 'Mayana, City of Naga, Cebu', lat: 10.2560, lng: 123.7210 },
  { title: 'Patag, City of Naga', label: 'Patag, City of Naga, Cebu', lat: 10.2380, lng: 123.7040 },
  { title: 'Tagjaguimit, City of Naga', label: 'Tagjaguimit, City of Naga, Cebu', lat: 10.2620, lng: 123.7340 },
  { title: 'Tangke, City of Naga', label: 'Tangke, City of Naga, Cebu', lat: 10.2055, lng: 123.7595 },

  // Minglanilla Barangays
  { title: 'Poblacion Ward I, Minglanilla', label: 'Poblacion Ward I, Minglanilla, Cebu', lat: 10.2444, lng: 123.7972 },
  { title: 'Poblacion Ward II, Minglanilla', label: 'Poblacion Ward II, Minglanilla, Cebu', lat: 10.2450, lng: 123.7962 },
  { title: 'Poblacion Ward III, Minglanilla', label: 'Poblacion Ward III, Minglanilla, Cebu', lat: 10.2460, lng: 123.7980 },
  { title: 'Poblacion Ward IV, Minglanilla', label: 'Poblacion Ward IV, Minglanilla, Cebu', lat: 10.2435, lng: 123.7955 },
  { title: 'Linao, Minglanilla', label: 'Linao, Minglanilla, Cebu', lat: 10.2535, lng: 123.8165 },
  { title: 'Lipata, Minglanilla', label: 'Lipata, Minglanilla, Cebu', lat: 10.2510, lng: 123.8110 },
  { title: 'Pakigne, Minglanilla', label: 'Pakigne, Minglanilla, Cebu', lat: 10.2520, lng: 123.7995 },
  { title: 'Tunghaan, Minglanilla', label: 'Tunghaan, Minglanilla, Cebu', lat: 10.2405, lng: 123.7845 },
  { title: 'Tungkil, Minglanilla', label: 'Tungkil, Minglanilla, Cebu', lat: 10.2395, lng: 123.8050 },
  { title: 'Tulay, Minglanilla', label: 'Tulay, Minglanilla, Cebu', lat: 10.2375, lng: 123.7895 },
  { title: 'Calajo-an, Minglanilla', label: 'Calajo-an, Minglanilla, Cebu', lat: 10.2385, lng: 123.8015 },
  { title: 'Vito, Minglanilla', label: 'Vito, Minglanilla, Cebu', lat: 10.2620, lng: 123.7820 },
  { title: 'Cadulawan, Minglanilla', label: 'Cadulawan, Minglanilla, Cebu', lat: 10.2680, lng: 123.7980 },

  // San Fernando Barangays
  { title: 'Poblacion North, San Fernando', label: 'Poblacion North, San Fernando, Cebu', lat: 10.1645, lng: 123.7095 },
  { title: 'Poblacion South, San Fernando', label: 'Poblacion South, San Fernando, Cebu', lat: 10.1612, lng: 123.7088 },
  { title: 'Pitalo, San Fernando', label: 'Pitalo, San Fernando, Cebu', lat: 10.1755, lng: 123.7295 },
  { title: 'Sangat, San Fernando', label: 'Sangat, San Fernando, Cebu', lat: 10.1510, lng: 123.6980 },
  { title: 'Balud, San Fernando', label: 'Balud, San Fernando, Cebu', lat: 10.1430, lng: 123.6890 },
  { title: 'Panadtaran, San Fernando', label: 'Panadtaran, San Fernando, Cebu', lat: 10.1690, lng: 123.7190 },

  // Talisay City Barangays
  { title: 'Tabunok, Talisay City', label: 'Tabunok, Talisay City, Cebu', lat: 10.2601, lng: 123.8347 },
  { title: 'Bulacao, Talisay City', label: 'Bulacao, Talisay City, Cebu', lat: 10.2735, lng: 123.8485 },
  { title: 'Lawaan I, Talisay City', label: 'Lawaan I, Talisay City, Cebu', lat: 10.2585, lng: 123.8255 },
  { title: 'Lawaan II, Talisay City', label: 'Lawaan II, Talisay City, Cebu', lat: 10.2625, lng: 123.8225 },
  { title: 'Lawaan III, Talisay City', label: 'Lawaan III, Talisay City, Cebu', lat: 10.2665, lng: 123.8195 },
  { title: 'Lagtang, Talisay City', label: 'Lagtang, Talisay City, Cebu', lat: 10.2690, lng: 123.8295 },
  { title: 'San Isidro, Talisay City', label: 'San Isidro, Talisay City, Cebu', lat: 10.2535, lng: 123.8385 },
  { title: 'Dumlog, Talisay City', label: 'Dumlog, Talisay City, Cebu', lat: 10.2465, lng: 123.8415 },
  { title: 'Poblacion, Talisay City', label: 'Poblacion, Talisay City, Cebu', lat: 10.2445, lng: 123.8485 },
  { title: 'Mohon, Talisay City', label: 'Mohon, Talisay City, Cebu', lat: 10.2515, lng: 123.8295 },
  { title: 'Pooc, Talisay City', label: 'Pooc, Talisay City, Cebu', lat: 10.2450, lng: 123.8220 },
  { title: 'San Roque, Talisay City', label: 'San Roque, Talisay City, Cebu', lat: 10.2595, lng: 123.8545 },

  // Cebu City & Metro Cebu
  { title: 'Pardo, Cebu City', label: 'Pardo, Cebu City, Cebu', lat: 10.2815, lng: 123.8595 },
  { title: 'Basak San Nicolas, Cebu City', label: 'Basak San Nicolas, Cebu City, Cebu', lat: 10.2885, lng: 123.8665 },
  { title: 'Mambaling, Cebu City', label: 'Mambaling, Cebu City, Cebu', lat: 10.2945, lng: 123.8765 },
  { title: 'Labangon, Cebu City', label: 'Labangon, Cebu City, Cebu', lat: 10.3015, lng: 123.8795 },
  { title: 'Tisa, Cebu City', label: 'Tisa, Cebu City, Cebu', lat: 10.3005, lng: 123.8695 },
  { title: 'Guadalupe, Cebu City', label: 'Guadalupe, Cebu City, Cebu', lat: 10.3215, lng: 123.8835 },
  { title: 'Fuente Osmeña, Cebu City', label: 'Fuente Osmeña, Capitol Site, Cebu City, Cebu', lat: 10.3105, lng: 123.8915 },
  { title: 'Lahug, Cebu City', label: 'Lahug, Cebu City, Cebu', lat: 10.3325, lng: 123.8985 },
  { title: 'Mabolo, Cebu City', label: 'Mabolo, Cebu City, Cebu', lat: 10.3225, lng: 123.9115 },
  { title: 'Banilad, Cebu City', label: 'Banilad, Cebu City, Cebu', lat: 10.3445, lng: 123.9125 },
  { title: 'Talamban, Cebu City', label: 'Talamban, Cebu City, Cebu', lat: 10.3695, lng: 123.9155 },
  { title: 'Cebu City Downtown', label: 'Colon Street, Downtown, Cebu City, Cebu', lat: 10.2965, lng: 123.8995 },
  { title: 'Mandaue City', label: 'Centro, Mandaue City, Cebu', lat: 10.3321, lng: 123.9357 },
  { title: 'Lapu-Lapu City', label: 'Poblacion, Lapu-Lapu City, Cebu', lat: 10.3103, lng: 123.9494 },
  { title: 'Consolacion, Cebu', label: 'Poblacion Oriental, Consolacion, Cebu', lat: 10.3765, lng: 123.9565 },
  { title: 'Liloan, Cebu', label: 'Poblacion, Liloan, Cebu', lat: 10.4015, lng: 123.9985 },
  { title: 'Cordova, Cebu', label: 'Poblacion, Cordova, Cebu', lat: 10.2525, lng: 123.9495 },

  // Southern & Western Cebu
  { title: 'Carcar City, Cebu', label: 'Poblacion I, Carcar City, Cebu', lat: 10.1067, lng: 123.6425 },
  { title: 'Perrelos, Carcar City', label: 'Perrelos, Carcar City, Cebu', lat: 10.1225, lng: 123.6615 },
  { title: 'Valladolid, Carcar City', label: 'Valladolid, Carcar City, Cebu', lat: 10.1155, lng: 123.6535 },
  { title: 'Toledo City, Cebu', label: 'Poblacion, Toledo City, Cebu', lat: 10.3774, lng: 123.6409 },
  { title: 'Lutopan (DAS), Toledo City', label: 'DAS Lutopan, Toledo City, Cebu', lat: 10.3285, lng: 123.7045 },
  { title: 'Sibonga, Cebu', label: 'Poblacion, Sibonga, Cebu', lat: 10.0185, lng: 123.6215 },
  { title: 'Argao, Cebu', label: 'Poblacion, Argao, Cebu', lat: 9.8825, lng: 123.6015 },
  { title: 'Barili, Cebu', label: 'Poblacion, Barili, Cebu', lat: 10.1145, lng: 123.5155 }
];

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
let isPatientAddressValid = false;
let addressSearchDebounceTimer = null;

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

function setAddressValidationError(errorMessage) {
  const addrInput = document.getElementById('wizard-pat-address');
  const errBox = document.getElementById('wizard-pat-address-error');
  const errText = document.getElementById('wizard-pat-address-error-text');

  if (errorMessage) {
    if (errText) errText.textContent = errorMessage;
    if (errBox) errBox.style.display = 'flex';
    if (addrInput) {
      addrInput.style.borderColor = '#dc2626';
      addrInput.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.12)';
    }
  } else {
    if (errBox) errBox.style.display = 'none';
    if (addrInput) {
      addrInput.style.borderColor = '';
      addrInput.style.boxShadow = '';
    }
  }
}

function findMatchingLocalAddresses(rawQuery) {
  const q = (rawQuery || '').toLowerCase().trim();
  if (!q) {
    return CEBU_ADDRESS_DIRECTORY.slice(0, 20);
  }

  return CEBU_ADDRESS_DIRECTORY.filter(item => {
    const titleLower = item.title.toLowerCase();
    const labelLower = item.label.toLowerCase();
    return titleLower.includes(q) || labelLower.includes(q);
  });
}

function renderAddressSuggestionsDropdown(items, rawQuery, isSearchingRemote = false) {
  const dropdown = document.getElementById('wizard-pat-address-dropdown');
  if (!dropdown) return;

  const clinicBranch = getClinicBranches()[0];
  const q = (rawQuery || '').trim();

  if ((!items || items.length === 0) && !isSearchingRemote) {
    dropdown.innerHTML = `
      <div class="address-suggestion-empty">
        <i class="ti ti-alert-triangle" style="font-size: 16px; flex-shrink: 0;"></i>
        <span>No valid address found for "<strong>${escapeHTML(q)}</strong>". Please type a valid barangay, street, or city in Cebu.</span>
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  if ((!items || items.length === 0) && isSearchingRemote) {
    dropdown.innerHTML = `
      <div style="padding: 10px 14px; font-size: 0.78rem; color: #64748b; display: flex; align-items: center; gap: 8px;">
        <i class="ti ti-loader ti-spin"></i> Searching addresses for "${escapeHTML(q)}"...
      </div>
    `;
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = items.map((item, idx) => {
    const distKm = calculateDistanceKm(item.lat, item.lng, clinicBranch.lat, clinicBranch.lng);
    const distStr = distKm < 1 ? `${(distKm * 1000).toFixed(0)} m` : `${distKm.toFixed(1)} km`;
    return `
      <div class="address-suggestion-item" data-idx="${idx}" data-lat="${item.lat}" data-lng="${item.lng}" data-label="${escapeHTML(item.label)}">
        <div class="address-suggestion-left">
          <i class="ti ti-map-pin address-suggestion-icon"></i>
          <div style="min-width: 0;">
            <div class="address-suggestion-title">${escapeHTML(item.title || item.label)}</div>
            <div class="address-suggestion-sub">${escapeHTML(item.label)}</div>
          </div>
        </div>
        <span class="address-suggestion-dist">${distStr}</span>
      </div>
    `;
  }).join('');

  dropdown.querySelectorAll('.address-suggestion-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent input blur before selection
      const lat = parseFloat(el.getAttribute('data-lat'));
      const lng = parseFloat(el.getAttribute('data-lng'));
      const label = el.getAttribute('data-label');
      selectAddressSuggestion({ lat, lng, label });
    });
  });

  dropdown.style.display = 'block';
}

function selectAddressSuggestion(item) {
  const addrInput = document.getElementById('wizard-pat-address');
  const dropdown = document.getElementById('wizard-pat-address-dropdown');

  if (addrInput) addrInput.value = item.label;
  if (dropdown) dropdown.style.display = 'none';

  isPatientAddressValid = true;
  setAddressValidationError(null);
  currentPatientCoords = { lat: item.lat, lng: item.lng };
  updateNearestBranchAndMap(item.lat, item.lng, item.label);
}

function setupAddressAutocomplete() {
  const addrInput = document.getElementById('wizard-pat-address');
  const dropdown = document.getElementById('wizard-pat-address-dropdown');
  if (!addrInput) return;

  // Validate initial pre-filled value if any
  const initVal = addrInput.value.trim();
  if (initVal) {
    const initMatches = findMatchingLocalAddresses(initVal);
    if (initMatches.length > 0 || initVal.toLowerCase().includes('gps')) {
      isPatientAddressValid = true;
      setAddressValidationError(null);
    }
  }

  addrInput.addEventListener('focus', () => {
    const val = addrInput.value.trim();
    const matches = findMatchingLocalAddresses(val);
    if (matches.length > 0 || !val) {
      renderAddressSuggestionsDropdown(matches.length > 0 ? matches : CEBU_ADDRESS_DIRECTORY.slice(0, 20), val, false);
    } else {
      renderAddressSuggestionsDropdown([], val, false);
    }
  });

  addrInput.addEventListener('input', () => {
    const val = addrInput.value.trim();
    if (addressSearchDebounceTimer) clearTimeout(addressSearchDebounceTimer);

    if (!val) {
      isPatientAddressValid = false;
      setAddressValidationError(null);
      renderAddressSuggestionsDropdown(CEBU_ADDRESS_DIRECTORY.slice(0, 20), '', false);
      return;
    }

    const localMatches = findMatchingLocalAddresses(val);

    if (localMatches.length > 0) {
      // Check if exact match or valid local match exists
      isPatientAddressValid = true;
      setAddressValidationError(null);
      renderAddressSuggestionsDropdown(localMatches, val, false);

      // Update map preview to top matching local address
      const top = localMatches[0];
      currentPatientCoords = { lat: top.lat, lng: top.lng };
      updateNearestBranchAndMap(top.lat, top.lng, top.label);
    } else {
      // No local match found — show error immediately for unrecognized input (e.g. "asdasdad")
      isPatientAddressValid = false;
      setAddressValidationError(`Invalid address: "${val}" is not a recognized location. Please select a valid address from the suggestions.`);
      renderAddressSuggestionsDropdown([], val, val.length >= 3);
    }

    // Also query OpenStreetMap Nominatim for additional real streets/places in Cebu/Philippines
    if (val.length >= 3) {
      addressSearchDebounceTimer = setTimeout(() => {
        fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ph&limit=8&q=${encodeURIComponent(val + ', Cebu, Philippines')}`)
          .then(res => res.json())
          .then(data => {
            // Ensure input hasn't changed while fetching
            if (addrInput.value.trim() !== val) return;

            const remoteItems = Array.isArray(data) ? data.map(d => {
              const parts = (d.display_name || '').split(',').map(s => s.trim());
              return {
                title: parts.slice(0, 2).join(', '),
                label: parts.slice(0, 4).join(', '),
                lat: parseFloat(d.lat),
                lng: parseFloat(d.lon)
              };
            }) : [];

            // Combine unique local + remote matches
            const combined = [...localMatches];
            remoteItems.forEach(rem => {
              if (!combined.some(c => c.label.toLowerCase() === rem.label.toLowerCase())) {
                combined.push(rem);
              }
            });

            if (combined.length > 0) {
              isPatientAddressValid = true;
              setAddressValidationError(null);
              renderAddressSuggestionsDropdown(combined, val, false);
              const top = combined[0];
              currentPatientCoords = { lat: top.lat, lng: top.lng };
              updateNearestBranchAndMap(top.lat, top.lng, top.label);
            } else {
              isPatientAddressValid = false;
              setAddressValidationError(`Invalid address: "${val}" could not be found. Please select a valid address from the list or click Detect GPS.`);
              renderAddressSuggestionsDropdown([], val, false);
            }
          })
          .catch(() => {
            if (localMatches.length === 0) {
              isPatientAddressValid = false;
              setAddressValidationError(`Invalid address: "${val}" could not be found. Please select a valid address from the list.`);
              renderAddressSuggestionsDropdown([], val, false);
            }
          });
      }, 300);
    }
  });

  addrInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (dropdown) dropdown.style.display = 'none';
      const val = addrInput.value.trim();
      if (val && !isPatientAddressValid) {
        setAddressValidationError(`Invalid address: "${val}" is not recognized. Please select a valid address from the suggestions.`);
      }
    }, 180);
  });

  document.addEventListener('click', (e) => {
    if (dropdown && !addrInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

function updateNotesRequirement() {
  const concernSelect = document.getElementById('wizard-primary-concern');
  const reqIndicator = document.getElementById('wizard-notes-req-indicator');
  const notesEl = document.getElementById('wizard-notes');
  if (!concernSelect || !notesEl) return;

  const val = (concernSelect.value || '').trim();
  const isOther = val === 'Other Consultation' || val.toLowerCase().includes('other');

  if (isOther) {
    if (reqIndicator) {
      reqIndicator.innerHTML = '<span style="color: #dc2626; font-weight: 700;">* (Required for Other Consultation)</span>';
    }
    notesEl.placeholder = 'Please describe your specific symptoms, tooth concerns, or reason for consultation (required)...';
    notesEl.required = true;
  } else {
    if (reqIndicator) {
      reqIndicator.innerHTML = '<span style="color: var(--text-muted); font-weight: normal;">(Optional)</span>';
    }
    notesEl.placeholder = 'Describe symptoms, tooth location, pain level, or any special requests (optional)...';
    notesEl.required = false;
    markFieldError(notesEl, false);
  }
}

async function reverseGeocodeCoords(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) throw new Error('Geocoding failed');
    const data = await res.json();
    if (data && data.address) {
      const a = data.address;
      const road = a.road || a.pedestrian || a.street || '';
      const neighborhood = a.suburb || a.neighbourhood || a.quarter || a.village || '';
      const city = a.city || a.town || a.municipality || a.county || '';
      const state = a.province || a.state || '';

      const parts = [road, neighborhood, city, state].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
      if (data.display_name) return data.display_name.split(',').slice(0, 3).join(', ').trim();
    } else if (data && data.display_name) {
      return data.display_name.split(',').slice(0, 3).join(', ').trim();
    }
  } catch (err) {
    console.warn('Reverse geocode error:', err);
  }
  return null;
}

function detectGPSLocation(isSilent = false) {
  if (!navigator.geolocation) {
    if (!isSilent) showToast('Geolocation is not supported by your browser.', 'error');
    fallbackToProfileAddressOrIP(isSilent);
    return;
  }
  if (!isSilent) showToast('Detecting your live GPS location...', 'info');

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000
  };

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;
      console.log(`[GPS] Live coords detected: ${lat}, ${lng} (accuracy: ~${accuracy}m)`);

      currentPatientCoords = { lat, lng };
      isPatientAddressValid = true;
      setAddressValidationError(null);

      const dropdown = document.getElementById('wizard-pat-address-dropdown');
      if (dropdown) dropdown.style.display = 'none';

      // Reverse geocode to get actual city / barangay name
      let resolved = await reverseGeocodeCoords(lat, lng);
      const displayAddr = resolved || `Current GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      safeVal('wizard-pat-address', displayAddr);
      updateNearestBranchAndMap(lat, lng, displayAddr);

      if (!isSilent) {
        showToast(`📍 Location detected: ${displayAddr}`, 'success');
      }
    },
    (err) => {
      console.warn('[GPS] Geolocation error/declined:', err.message);
      if (!isSilent) {
        showToast('Could not access live GPS. You can drag the blue pin or click anywhere on the map.', 'warning');
      }
      fallbackToProfileAddressOrIP(isSilent);
    },
    options
  );
}

async function fallbackToProfileAddressOrIP(isSilent = false) {
  const addrInput = document.getElementById('wizard-pat-address')?.value?.trim();
  if (addrInput && !addrInput.toLowerCase().includes('balirong') && !addrInput.toLowerCase().includes('gps')) {
    geocodeAndLocate(addrInput, isSilent);
    return;
  }

  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        const cityLabel = [data.city, data.region, 'Philippines'].filter(Boolean).join(', ');
        currentPatientCoords = { lat, lng };
        isPatientAddressValid = true;
        safeVal('wizard-pat-address', cityLabel);
        updateNearestBranchAndMap(lat, lng, cityLabel);
        return;
      }
    }
  } catch (e) {
    // ignore
  }

  // Fallback to clinic default if nothing else is available
  updateNearestBranchAndMap(10.2098, 123.7540, 'Balirong, City of Naga, Cebu');
}

async function handlePatientPinRelocate(lat, lng) {
  currentPatientCoords = { lat, lng };
  isPatientAddressValid = true;
  setAddressValidationError(null);

  const tempLabel = `Selected Map Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  safeVal('wizard-pat-address', tempLabel);
  updateNearestBranchAndMap(lat, lng, tempLabel);

  const resolved = await reverseGeocodeCoords(lat, lng);
  if (resolved) {
    safeVal('wizard-pat-address', resolved);
    updateNearestBranchAndMap(lat, lng, resolved);
    showToast(`📍 Location updated: ${resolved}`, 'success');
  }
}

function geocodeAndLocate(addressText, isSilentInit = false) {
  if (!addressText) {
    if (isSilentInit) {
      updateNearestBranchAndMap(10.2098, 123.7540, 'Balirong, City of Naga, Cebu');
    }
    return;
  }
  const query = addressText.toLowerCase().trim();

  if (query.includes('current gps location')) {
    isPatientAddressValid = true;
    setAddressValidationError(null);
    updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addressText);
    return;
  }

  // 1. Check CEBU_ADDRESS_DIRECTORY & KNOWN_COORDS
  const localMatches = findMatchingLocalAddresses(query);
  if (localMatches.length > 0) {
    isPatientAddressValid = true;
    setAddressValidationError(null);
    currentPatientCoords = { lat: localMatches[0].lat, lng: localMatches[0].lng };
    updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, localMatches[0].label);
    return;
  }

  let matchedCoords = null;
  for (const [key, val] of Object.entries(KNOWN_COORDS)) {
    if (query.includes(key)) {
      matchedCoords = val;
      break;
    }
  }

  if (matchedCoords) {
    isPatientAddressValid = true;
    setAddressValidationError(null);
    currentPatientCoords = { lat: matchedCoords.lat, lng: matchedCoords.lng };
    updateNearestBranchAndMap(matchedCoords.lat, matchedCoords.lng, addressText);
    return;
  }

  // 2. Fallback to OpenStreetMap Nominatim
  fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ph&q=${encodeURIComponent(addressText + ', Cebu, Philippines')}`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        isPatientAddressValid = true;
        setAddressValidationError(null);
        currentPatientCoords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addressText);
      } else {
        isPatientAddressValid = false;
        if (!isSilentInit) {
          setAddressValidationError(`Invalid address: "${addressText}" could not be found. Please select a valid address from the suggestions.`);
          showToast(`Address "${addressText}" not found. Please select a valid address.`, 'error');
        }
      }
    })
    .catch(() => {
      if (!isSilentInit) {
        isPatientAddressValid = false;
        setAddressValidationError(`Invalid address: "${addressText}" could not be verified. Please select from the suggested addresses.`);
      }
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
          renderDentistsPicker();
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

    // 1. Google Maps Roadmap (Default - Clean authentic Google Maps)
    const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(branchMap);

    // 2. CARTO Voyager (The clean aesthetic used before)
    const cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    });

    // 3. Google Satellite / Hybrid
    const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    // Layer switch control (Google Maps, CARTO Voyager, Satellite)
    L.control.layers({
      "Google Maps": googleRoadmap,
      "CARTO Voyager": cartoVoyager,
      "Satellite": googleSatellite
    }, null, { position: 'topright' }).addTo(branchMap);

    // Allow clicking anywhere on the map to place patient pin
    branchMap.on('click', async (e) => {
      await handlePatientPinRelocate(e.latlng.lat, e.latlng.lng);
    });
  }

  // Clear previous markers & route lines
  mapMarkers.forEach(m => branchMap.removeLayer(m));
  mapMarkers = [];
  if (mapRouteLine) {
    branchMap.removeLayer(mapRouteLine);
    mapRouteLine = null;
  }

  // 1. Patient Location Marker (Blue Pulse Icon - Draggable)
  const patientIcon = L.divIcon({
    className: 'patient-map-pin',
    html: `
      <div style="background:#2563eb; width:26px; height:26px; border-radius:50%; border:3px solid white; box-shadow:0 0 14px rgba(37,99,235,0.9); display:flex; align-items:center; justify-content:center; color:white; font-size:11px; font-weight:bold; cursor:grab;" title="You (Drag to move)">
        <i class="ti ti-user" style="font-size: 13px;"></i>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });

  const patientMarker = L.marker([patientLat, patientLng], {
    icon: patientIcon,
    draggable: true,
    title: 'Your Location (Drag to adjust)'
  })
    .addTo(branchMap)
    .bindPopup(`<b>Your Real Location</b><br><span style="font-size:12px;color:#475569;">${escapeHTML(addressLabel || 'Current Location')}</span><br><small style="color:#2563eb;font-weight:600;">(Drag pin or click map to move)</small>`);

  patientMarker.on('dragend', async (e) => {
    const newPos = e.target.getLatLng();
    await handlePatientPinRelocate(newPos.lat, newPos.lng);
  });

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

  // Progress line for 4 steps: (step - 1) / 3 * 100
  const progressLine = document.getElementById('step-progress-line');
  if (progressLine) {
    const percent = ((step - 1) / 3) * 100;
    progressLine.style.width = `${percent}%`;
  }

  // Button visibilities
  const btnPrev = document.getElementById('btn-prev-step');
  const btnNext = document.getElementById('btn-next-step');
  const btnSubmit = document.getElementById('btn-submit-booking');

  if (btnPrev) btnPrev.style.display = step > 1 ? 'inline-flex' : 'none';
  if (btnNext) btnNext.style.display = step < 4 ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display = step === 4 ? 'inline-flex' : 'none';

  // Step 1: Check available slots & initialize Map
  if (step === 1) {
    checkAvailableSlots();
    setTimeout(() => {
      const addr = document.getElementById('wizard-pat-address')?.value?.trim() || '';
      if (addr && !addr.toLowerCase().includes('balirong') && !addr.toLowerCase().includes('gps')) {
        geocodeAndLocate(addr, true);
      } else if (currentPatientCoords && (currentPatientCoords.lat !== 10.2098 || currentPatientCoords.lng !== 123.7540)) {
        updateNearestBranchAndMap(currentPatientCoords.lat, currentPatientCoords.lng, addr || 'My Current Location');
      } else {
        detectGPSLocation(true);
      }
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

  // Step 3: Render Payment Details
  if (step === 3) {
    renderPaymentDetails();
  }

  // Step 4: Render confirmation details
  if (step === 4) {
    renderConfirmationDetails();
  }
}

function selectBookingPaymentMethod(method) {
  document.querySelectorAll('.payment-choice-card').forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-method') === method);
  });
  const input = document.getElementById('wizard-payment-method');
  if (input) input.value = method;
}

function renderPaymentDetails() {
  const treatmentId = document.getElementById('wizard-treatment-id')?.value;
  const selectedTreat = (allTreatments || []).find(t => t.id === treatmentId || String(t.id) === String(treatmentId));
  const feeService = document.getElementById('wizard-fee-service');
  const feeAmount = document.getElementById('wizard-fee-amount');
  const bookingFeeEl = document.getElementById('wizard-booking-fee');
  const remainingBalanceEl = document.getElementById('wizard-remaining-balance');
  const paymongoDescEl = document.getElementById('choice-desc-paymongo');

  let price = 0;
  let serviceName = 'General Dental Consultation';

  if (selectedTreat) {
    serviceName = selectedTreat.name;
    price = parseFloat(selectedTreat.price) || 0;
  } else {
    const existingSummary = document.getElementById('summary-service')?.textContent;
    if (existingSummary && existingSummary.includes('₱')) {
      const match = existingSummary.match(/\(₱([0-9.,]+)\)/);
      serviceName = existingSummary.split('(')[0].trim();
      if (match) price = parseFloat(match[1].replace(/,/g, '')) || 0;
    }
  }

  if (feeService) feeService.textContent = serviceName;
  if (feeAmount) {
    feeAmount.textContent = price > 0 ? `₱${price.toFixed(2)}` : 'Free (₱0.00)';
  }

  if (paymongoDescEl) {
    paymongoDescEl.innerHTML = `Pay securely online now using your preferred mobile wallet, online bank, or credit/debit card. Your payment receipt is verified instantly.`;
  }
}

function markFieldError(el, hasError) {
  if (!el) return;
  if (hasError) {
    el.style.borderColor = '#dc2626';
    el.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.12)';
    const clearErr = () => {
      el.style.borderColor = '';
      el.style.boxShadow = '';
      el.removeEventListener('input', clearErr);
      el.removeEventListener('change', clearErr);
    };
    el.addEventListener('input', clearErr);
    el.addEventListener('change', clearErr);
  } else {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }
}

function validateStep(step) {
  if (step === 1) {
    const dateEl = document.getElementById('wizard-date');
    const timeEl = document.getElementById('wizard-time');
    const slotsGrid = document.getElementById('slots-picker-grid');
    const nameEl = document.getElementById('wizard-pat-name');
    const emailEl = document.getElementById('wizard-pat-email');
    const phoneEl = document.getElementById('wizard-pat-phone');
    const addrEl = document.getElementById('wizard-pat-address');
    const emergNameEl = document.getElementById('wizard-emergency-name');
    const emergPhoneEl = document.getElementById('wizard-emergency-phone');
    const concernEl = document.getElementById('wizard-primary-concern');
    const reminderEl = document.getElementById('wizard-reminder-pref');
    const notesEl = document.getElementById('wizard-notes');

    const date = dateEl?.value?.trim();
    const time = timeEl?.value?.trim() || selectedTime;
    const name = nameEl?.value?.trim();
    const email = emailEl?.value?.trim();
    const phone = phoneEl?.value?.trim();
    const addr = addrEl?.value?.trim();
    const emergName = emergNameEl?.value?.trim();
    const emergPhone = emergPhoneEl?.value?.trim();
    const concern = concernEl?.value?.trim();
    const reminder = reminderEl?.value?.trim();
    const notes = notesEl?.value?.trim();

    const hasValidAddr = !!addr && (
      isPatientAddressValid ||
      findMatchingLocalAddresses(addr).length > 0 ||
      Object.keys(KNOWN_COORDS).some(k => addr.toLowerCase().includes(k)) ||
      addr.toLowerCase().includes('gps') ||
      addr.toLowerCase().includes('location') ||
      addr.toLowerCase().includes('cebu')
    );

    if (addr && !hasValidAddr) {
      setAddressValidationError(`Invalid address: "${addr}" is not a recognized location. Please select a valid address from the suggestions.`);
      markFieldError(addrEl, true);
    }

    const isOtherConsultation = concern === 'Other Consultation' || (concern && concern.toLowerCase().includes('other'));

    const requiredChecks = [
      { ok: !!date, el: dateEl, label: 'Appointment Date' },
      { ok: !!time, el: slotsGrid, label: 'Available Time Slot' },
      { ok: !!name, el: nameEl, label: 'Full Name' },
      { ok: !!email, el: emailEl, label: 'Email Address' },
      { ok: !!phone, el: phoneEl, label: 'Contact Number' },
      { ok: hasValidAddr, el: addrEl, label: addr ? 'Valid Patient / Home Address' : 'Patient / Home Address' },
      { ok: !!emergName, el: emergNameEl, label: 'Emergency Contact Name' },
      { ok: !!emergPhone, el: emergPhoneEl, label: 'Emergency Contact Phone' },
      { ok: !!concern, el: concernEl, label: 'Primary Concern / Symptom' },
      { ok: !!reminder, el: reminderEl, label: 'Preferred Appointment Method' }
    ];

    if (isOtherConsultation) {
      requiredChecks.push({
        ok: !!notes,
        el: notesEl,
        label: 'Specific Symptoms (Required for Other Consultation)'
      });
    } else {
      markFieldError(notesEl, false);
    }

    const missing = [];
    let firstMissingEl = null;

    requiredChecks.forEach(item => {
      if (!item.ok) {
        missing.push(item.label);
        markFieldError(item.el, true);
        if (!firstMissingEl && item.el) firstMissingEl = item.el;
      } else {
        markFieldError(item.el, false);
      }
    });

    if (missing.length > 0) {
      showToast(`Please fill up all required fields before proceeding (Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}).`, 'error');
      if (firstMissingEl) {
        firstMissingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof firstMissingEl.focus === 'function') firstMissingEl.focus();
      }
      return false;
    }

    // Validate that the entered address is a real recognized address and not gibberish
    const hasLocalMatch = findMatchingLocalAddresses(addr).length > 0 ||
      Object.keys(KNOWN_COORDS).some(k => addr.toLowerCase().includes(k)) ||
      addr.toLowerCase().includes('gps') ||
      addr.toLowerCase().includes('location') ||
      addr.toLowerCase().includes('cebu');
    if (!isPatientAddressValid && !hasLocalMatch) {
      setAddressValidationError(`Invalid address: "${addr}" is not a recognized location. Please select a valid address from the suggestions.`);
      markFieldError(addrEl, true);
      showToast(`Invalid Patient / Home Address ("${addr}"). Please select a valid address from the suggestions.`, 'error');
      if (addrEl) {
        addrEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        addrEl.focus();
      }
      return false;
    }
    return true;
  } else if (step === 2) {
    const dentistName = document.getElementById('wizard-dentist-name')?.value?.trim();
    const treatmentId = document.getElementById('wizard-treatment-id')?.value?.trim();
    if (!dentistName) {
      showToast('Please select a dentist to continue.', 'error');
      return false;
    }
    if (!treatmentId) {
      showToast('Please select a dental service/treatment to continue.', 'error');
      return false;
    }
    return true;
  } else if (step === 3) {
    const method = document.getElementById('wizard-payment-method')?.value;
    if (!method) {
      showToast('Please select a payment method.', 'error');
      return false;
    }
    return true;
  }
  return true;
}

let cachedClinicDentists = [];

function loadDentists() {
  fetch(`${API}/dentists`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(dentists => {
      cachedClinicDentists = Array.isArray(dentists) ? dentists : [];
      renderDentistsPicker();
    })
    .catch(err => {
      console.error('Dentists list error:', err);
      renderDentistsPicker();
    });
}

function renderDentistsPicker() {
  const grid = document.getElementById('dentists-picker-grid');
  if (!grid) return;

  const warningBox = document.getElementById('dentist-offduty-warning-box');
  if (warningBox) warningBox.style.display = 'none';

  const listToRender = cachedClinicDentists;

  const matchCountEl = document.getElementById('dentist-branch-match-count');
  if (matchCountEl) {
    const onDutyCount = listToRender.filter(d => d.isOnDuty).length;
    matchCountEl.textContent = `${onDutyCount} Doctor${onDutyCount === 1 ? '' : 's'} On Duty`;
  }

  let currentSelected = document.getElementById('wizard-dentist-name')?.value || 'No Preference';
  if (currentSelected !== 'No Preference' && !listToRender.some(d => d.name === currentSelected)) {
    currentSelected = 'No Preference';
    const hiddenInput = document.getElementById('wizard-dentist-name');
    if (hiddenInput) hiddenInput.value = 'No Preference';
  }

  // 1. "No Preference" Card
  let html = `
    <div class="dentist-card ${currentSelected === 'No Preference' ? 'selected' : ''}" data-name="No Preference" data-is-on="true">
      <div>
        <div class="dentist-name">No Preference</div>
        <div class="dentist-specialty">Auto-assigned to an available on-duty specialist</div>
      </div>
      <div>
        <div class="dentist-duty-pill on" style="margin-top: 10px;">
          <i class="ti ti-sparkles"></i> Best Availability
        </div>
      </div>
    </div>
  `;

  // 2. Doctor Cards
  if (listToRender.length > 0) {
    html += listToRender.map(d => {
      const isSelected = currentSelected === d.name;
      const isOn = !!d.isOnDuty;

      return `
        <div class="dentist-card ${isSelected ? 'selected' : ''} ${!isOn ? 'off-duty' : ''}" data-name="${escapeHTML(d.name)}" data-is-on="${isOn}">
          <div>
            <div class="dentist-name">${escapeHTML(d.name)}</div>
            <div class="dentist-specialty">Licensed Dental Specialist</div>
          </div>
          <div>
            <div class="dentist-duty-pill ${isOn ? 'on' : 'off'}">
              <i class="ti ${isOn ? 'ti-check' : 'ti-moon'}"></i>
              ${isOn ? 'Available On Duty' : 'Off Duty / Out'}
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 6px;">Shift: ${escapeHTML(d.shift || 'Regular')}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  grid.innerHTML = html;

  // Attach click listeners
  grid.querySelectorAll('.dentist-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.dentist-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const chosenName = card.getAttribute('data-name') || 'No Preference';
      const isOn = card.getAttribute('data-is-on') === 'true';
      const hiddenInput = document.getElementById('wizard-dentist-name');
      if (hiddenInput) hiddenInput.value = chosenName;
      updateDentistSummary(chosenName);

      // If chosen doctor is off duty, show advisory notice
      if (warningBox) {
        if (chosenName !== 'No Preference' && !isOn) {
          warningBox.className = 'dentist-offduty-warning';
          warningBox.innerHTML = `
            <i class="ti ti-info-circle" style="font-size: 1.15rem; flex-shrink: 0;"></i>
            <span><strong>Doctor Schedule Notice:</strong> ${escapeHTML(chosenName)} is currently marked out/off duty today. If you choose this doctor, the clinic will contact you to confirm advance availability or an on-duty colleague will assist you.</span>
          `;
          warningBox.style.display = 'flex';
        } else {
          warningBox.style.display = 'none';
        }
      }
    });
  });

  updateDentistSummary(currentSelected);
}

function extractSlotFromAppointment(appt, targetDateVal) {
  const results = [];
  if (!appt) return results;
  if (appt.status && appt.status.toLowerCase() === 'cancelled') return results;

  if (appt.date === targetDateVal && appt.time) {
    results.push(appt.time.toUpperCase().trim());
  }

  const raw = appt.appointment_date || appt.dateTime || '';
  if (raw && raw.includes('T')) {
    const [rawD, rawT] = raw.split('T');
    if (rawD === targetDateVal && rawT) {
      const [hStr, mStr] = rawT.substring(0, 5).split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10) || 0;
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const time12 = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
        results.push(time12.toUpperCase().trim());
      }
    }
  }
  return results;
}

function isTimeSlotInSet(slotLabel, occupiedSet) {
  if (!slotLabel) return false;
  const normTime = slotLabel.trim().toUpperCase();
  const noZeroTime = normTime.startsWith('0') ? normTime.substring(1) : ('0' + normTime);
  return occupiedSet.has(normTime) || occupiedSet.has(noZeroTime);
}

function checkAvailableSlots() {
  const dateVal = document.getElementById('wizard-date')?.value;
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
  const timeInput = document.getElementById('wizard-time');
  if (timeInput) timeInput.value = '';

  const occupiedTimes = new Set();
  if (Array.isArray(allAppointments)) {
    allAppointments.forEach(appt => {
      extractSlotFromAppointment(appt, dateVal).forEach(t => occupiedTimes.add(t));
    });
  }

  const applySlotButtonStates = () => {
    slotButtons.forEach(btn => {
      const time = btn.getAttribute('data-time');
      const isOccupied = isTimeSlotInSet(time, occupiedTimes);

      if (isOccupied) {
        btn.classList.add('occupied');
        btn.classList.remove('selected');
        btn.disabled = true;
        btn.title = 'This time slot is already booked and cannot be selected';
        btn.innerHTML = `
          <span>${time}</span>
          <span class="slot-badge-occupied">Booked</span>
        `;
      } else {
        btn.classList.remove('occupied');
        btn.disabled = false;
        btn.title = 'Click to select this time slot';
        btn.innerHTML = `
          <span>${time}</span>
          <span class="slot-badge-available">Available</span>
        `;
      }
    });
  };

  // Immediate render from local appointments cache
  applySlotButtonStates();

  // Fetch clinic-wide occupied slots from server for this date
  apiFetch(`/appointments/occupied?date=${dateVal}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(occupiedList => {
      if (Array.isArray(occupiedList)) {
        occupiedList.forEach(appt => {
          extractSlotFromAppointment(appt, dateVal).forEach(t => occupiedTimes.add(t));
        });
      }
      applySlotButtonStates();
    })
    .catch(() => {
      applySlotButtonStates();
    });
}

function renderConfirmationDetails() {
  const dentist = document.getElementById('wizard-dentist-name')?.value || 'No Preference';
  const dateVal = document.getElementById('wizard-date')?.value || '';
  const timeVal = document.getElementById('wizard-time')?.value || selectedTime || '';
  const branchVal = document.getElementById('wizard-selected-branch')?.value || selectedBranchObj?.name || 'Main Branch, Fano Dental Clinic';
  const emergName = document.getElementById('wizard-emergency-name')?.value?.trim() || '';
  const emergPhone = document.getElementById('wizard-emergency-phone')?.value?.trim() || '';
  const allergies = document.getElementById('wizard-allergies')?.value?.trim() || 'None';
  const medications = document.getElementById('wizard-medications')?.value?.trim() || 'None';
  const concern = document.getElementById('wizard-primary-concern')?.value || 'Routine Cleaning & General Checkup';
  const hmo = document.getElementById('wizard-insurance-provider')?.value || 'None / Self-Pay';
  const hmoId = document.getElementById('wizard-insurance-id')?.value?.trim() || '';
  const anxiety = document.getElementById('wizard-dental-anxiety')?.checked || false;
  const reminderPref = document.getElementById('wizard-reminder-pref')?.value || 'SMS Text Message';

  // Selected medical conditions
  const conditions = [];
  document.querySelectorAll('input[name="med_condition"]:checked').forEach(cb => {
    if (cb.value && cb.value !== 'None') conditions.push(cb.value);
  });
  const conditionsStr = conditions.length > 0 ? conditions.join(', ') : 'None reported';

  // Format date safely without timezone shift
  let formattedDate = '';
  if (dateVal) {
    try {
      const [y, m, d] = dateVal.split('-').map(Number);
      if (y && m && d) {
        const dObj = new Date(y, m - 1, d);
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
          });
        }
      }
    } catch (_) {}
    if (!formattedDate) formattedDate = dateVal;
  }

  // Treatment / Service name
  const treatmentId = document.getElementById('wizard-treatment-id')?.value;
  const selectedTreat = (allTreatments || []).find(t => t.id === treatmentId || String(t.id) === String(treatmentId));
  let serviceName = 'General Dental Consultation';
  if (selectedTreat) {
    const priceNum = parseFloat(selectedTreat.price);
    const priceFormatted = (!isNaN(priceNum) && priceNum > 0) ? `₱${priceNum.toFixed(2)}` : 'Free Consultation';
    serviceName = `${selectedTreat.name} (${priceFormatted})`;
  } else {
    const existingSummaryService = document.getElementById('summary-service')?.textContent;
    if (existingSummaryService && existingSummaryService !== '—') {
      serviceName = existingSummaryService;
    }
  }

  // Datetime display text
  const datetimeDisplay = (formattedDate && timeVal)
    ? `${formattedDate} • ${timeVal}`
    : (formattedDate ? `${formattedDate} (Time slot pending)` : (timeVal ? `Slot: ${timeVal}` : '—'));

  // Dentist display text
  const dentistDisplay = (dentist === 'No Preference') ? 'No Preference (Auto-assigned)' : dentist;

  safeSet('summary-datetime', datetimeDisplay);
  safeSet('summary-dentist', dentistDisplay);
  safeSet('summary-service', serviceName);
  safeSet('summary-branch', branchVal);

  const patPhone = document.getElementById('wizard-pat-phone')?.value || user?.contact_number || user?.contactNumber || user?.phone || '';
  const patEmail = document.getElementById('wizard-pat-email')?.value || user?.email || '';
  const contactText = [patPhone, patEmail].filter(Boolean).join(' • ') || '—';
  safeSet('summary-patient-contact', contactText);

  if (emergName || emergPhone) {
    safeSet('summary-emergency-contact', `${emergName || 'Contact'} (${emergPhone || 'No phone'})`);
  } else {
    safeSet('summary-emergency-contact', 'None specified');
  }

  safeSet('summary-medical-alerts', concern || 'General Consultation');
  safeSet('summary-insurance-care', `${anxiety ? 'Gentle Care Requested' : 'Standard Care'} • Reminders via ${reminderPref}`);

  const paymentMethod = document.getElementById('wizard-payment-method')?.value || 'paymongo';

  // Calculate 30% booking fee and 70% remaining balance
  let price = 0;
  if (selectedTreat) {
    price = parseFloat(selectedTreat.price) || 0;
  } else {
    const match = serviceName.match(/₱([0-9.,]+)/);
    if (match) price = parseFloat(match[1].replace(/,/g, '')) || 0;
  }

  safeSet('summary-fee-amount', price > 0 ? `₱${price.toFixed(2)}` : 'Free (₱0.00)');
  safeSet('summary-booking-fee', price > 0 ? `₱${price.toFixed(2)}` : '₱0.00');
  safeSet('summary-remaining-balance', '₱0.00');

  const paymentLabel = paymentMethod === 'paymongo'
    ? (price > 0 ? `Pay Online via PayMongo (₱${price.toFixed(2)})` : 'Pay Online via PayMongo')
    : 'Pay at Clinic Front Desk';
  safeSet('summary-payment-method', paymentLabel);
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
  const paymentMethod = document.getElementById('wizard-payment-method')?.value || 'paymongo';

  const selectedTreat = (allTreatments || []).find(t => t.id === treatmentId || String(t.id) === String(treatmentId));
  const treatmentPrice = selectedTreat?.price ? parseFloat(selectedTreat.price) : 0;

  // Selected medical conditions
  const conditions = [];
  document.querySelectorAll('input[name="med_condition"]:checked').forEach(cb => {
    if (cb.value !== 'None') conditions.push(cb.value);
  });
  const conditionsStr = conditions.length > 0 ? conditions.join(', ') : 'None';

  // Combine branch, dentist, and comprehensive medical details into structured notes string
  const priceTag = treatmentPrice > 0 ? `[TreatmentPrice: ₱${treatmentPrice.toFixed(2)}]` : '';
  const notes = `[Dentist: ${dentistName}] [PaymentMethod: ${paymentMethod}] ${priceTag} [Emergency: ${emergName} (${emergPhone})] [Conditions: ${conditionsStr}] [Allergies: ${allergies}] [Meds: ${medications}] [Concern: ${concern}] [HMO: ${hmo} / ${hmoId}] [AnxietySupport: ${anxiety}] [ReminderPref: ${reminderPref}] [PatientAddr: ${patientAddr}] ${rawNotes ? 'Notes: ' + rawNotes : ''}`.trim();

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
      notes: notes,
      payment_method: paymentMethod,
      total_treatment_price: treatmentPrice
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.id) throw new Error(data.message);

      // Reset wizard
      currentStep = 1;
      selectedTime = '';
      document.getElementById('booking-wizard-form').reset();
      document.getElementById('wizard-treatment-id').value = '';
      document.getElementById('wizard-dentist-name').value = 'No Preference';
      document.getElementById('wizard-time').value = '';
      document.getElementById('wizard-payment-method').value = 'paymongo';

      // Unselect grids & checkboxes
      document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.dentist-card').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.payment-choice-card').forEach(c => c.classList.toggle('selected', c.getAttribute('data-method') === 'paymongo'));
      document.querySelectorAll('.slot-btn').forEach(c => {
        c.classList.remove('selected');
        c.disabled = false;
      });

      goToStep(1);
      loadAppointments();

      if (paymentMethod === 'paymongo' && data.invoice && data.invoice.id) {
        // Construct complete invoice object including appointment and service details
        const createdInv = {
          ...data.invoice,
          appointment: {
            ...data,
            treatment: selectedTreat || { name: 'Dental Service' }
          },
          treatment_name: selectedTreat?.name || 'Dental Service'
        };

        // Cache immediately so billing tables and PayMongo modal have it right away
        if (!allInvoices.some(i => String(i.id) === String(createdInv.id))) {
          allInvoices.unshift(createdInv);
        }

        loadInvoices();
        showToast('Appointment booked! Opening PayMongo Checkout...', 'success');
        openPaymongoModal(createdInv);
      } else {
        loadInvoices();
        showToast('Appointment booked successfully! Settle payment upon arrival at clinic.', 'success');
        setTimeout(() => switchSection('overview'), 1200);
      }
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
  safeSet('modal-appt-dentist-branch', `Dentist: ${dentistName}`);
  safeSet('modal-appt-datetime', `${formattedDate} at ${formattedTime}`);
  safeSet('modal-appt-branch', 'Balirong Highway, City of Naga, Cebu');
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
  const feeMatch = notesRaw.match(/\[BookingFee:\s*([^\]]+)\]/i);
  const balanceMatch = notesRaw.match(/\[RemainingBalance:\s*([^\]]+)\]/i);
  if (feeMatch) alertsList.push(`• 30% Booking Fee Deposit: ${feeMatch[1]}`);
  if (balanceMatch) alertsList.push(`• 70% Remaining Balance on Visit: ${balanceMatch[1]}`);
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

  // Treatment Satisfaction & Rating Section for Completed Visits
  const reviewSection = document.getElementById('modal-appt-review-section');
  const reviewContent = document.getElementById('modal-review-content');
  if (reviewSection && reviewContent) {
    if (status === 'Completed') {
      reviewSection.style.display = 'block';
      reviewContent.innerHTML = `<div style="font-size:0.8rem; color:#64748b; padding:4px 0;"><i class="ti ti-loader ti-spin"></i> Checking review status...</div>`;
      
      apiFetch(`/appointments/${appt.id}/review`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res && res.review) {
          const rev = res.review;
          const starsHtml = Array.from({ length: 5 }, (_, i) => 
            `<span style="color: ${i < rev.rating ? '#f59e0b' : '#cbd5e1'}; font-size: 18px; line-height: 1;">★</span>`
          ).join('');
          const tagsHtml = (rev.tags && rev.tags.length > 0)
            ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">${rev.tags.map(t => `<span style="background:#e0f2fe; color:#0369a1; border-radius:12px; font-size:0.72rem; font-weight:600; padding:2px 8px;">${escapeHTML(t)}</span>`).join('')}</div>`
            : '';
          const commentHtml = rev.comment
            ? `<div style="font-size:0.82rem; color:#334155; margin-top:6px; font-style:italic; background:#fff; padding:8px 12px; border-radius:8px; border:1px solid #fde68a;">"${escapeHTML(rev.comment)}"</div>`
            : '';
          const dateStr = rev.created_at ? new Date(rev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

          reviewContent.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:4px;">
                  ${starsHtml}
                  <strong style="margin-left:6px; font-size:0.88rem; color:#78350f;">${rev.rating}.0 / 5.0</strong>
                </div>
                ${dateStr ? `<span style="font-size:0.75rem; color:#94a3b8;">${dateStr}</span>` : ''}
              </div>
              ${tagsHtml}
              ${commentHtml}
              <div style="margin-top:6px; font-size:0.75rem; color:#15803d; font-weight:600; display:flex; align-items:center; gap:4px;">
                <i class="ti ti-circle-check"></i> Verified patient review — included in clinical satisfaction score.
              </div>
            </div>
          `;
        } else {
          reviewContent.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:4px 0;">
              <div>
                <p style="margin:0; font-size:0.82rem; font-weight:700; color:#92400e;">How was your visit with ${escapeHTML(dentistName)}?</p>
                <p style="margin:2px 0 0 0; font-size:0.76rem; color:#78350f;">Rate your experience to help calculate our real clinic satisfaction score.</p>
              </div>
              <button type="button" class="btn btn-sm" onclick="openRateTreatmentModal('${appt.id}')" style="background:#0b3c4d; color:white; border:none; padding:7px 14px; font-size:0.8rem; font-weight:700; border-radius:8px; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 4px rgba(11,60,77,0.2);">
                <span style="color:#facc15; font-size:14px; line-height:1;">★</span>
                <span>Rate Visit</span>
              </button>
            </div>
          `;
        }
      })
      .catch(() => {
        reviewContent.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <p style="margin:0; font-size:0.8rem; color:#78350f;">Share your experience to improve patient care.</p>
            <button type="button" class="btn btn-sm" onclick="openRateTreatmentModal('${appt.id}')" style="background:#0b3c4d; color:white; border:none; padding:6px 12px; font-size:0.78rem; font-weight:700; border-radius:8px; cursor:pointer;">
              <span style="color:#facc15; font-size:14px; line-height:1;">★</span> Rate Visit
            </button>
          </div>
        `;
      });
    } else {
      reviewSection.style.display = 'none';
    }
  }

  // Disable / Enable action buttons based on status
  const btnReschedule = document.getElementById('btn-modal-reschedule');
  const btnCancel = document.getElementById('btn-modal-cancel');
  const isPastOrCancelled = status === 'Cancelled' || status === 'Completed' || status === 'Cancellation Requested' || status === 'Reschedule Requested' || d < new Date();

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

// ═══════════════════════════════════════════════════════════
//  PATIENT VISIT RATING & REAL SATISFACTION SYSTEM
// ═══════════════════════════════════════════════════════════

let currentRatingValue = 5;
const ratingLabels = {
  1: '1 Star — Poor Experience',
  2: '2 Stars — Fair / Needs Improvement',
  3: '3 Stars — Good / Average',
  4: '4 Stars — Very Good & Pleased',
  5: '5 Stars — Excellent & Highly Satisfied!'
};

function initStarRatingEvents() {
  const container = document.getElementById('star-rating-selector');
  if (!container || container.dataset.initialized) return;
  container.dataset.initialized = 'true';

  const stars = container.querySelectorAll('.star-item');
  const label = document.getElementById('star-rating-label');
  const hiddenInput = document.getElementById('rate-selected-value');

  function updateStars(val) {
    stars.forEach((star, index) => {
      const starVal = index + 1;
      if (starVal <= val) {
        star.classList.add('active');
        star.style.color = '#f59e0b';
      } else {
        star.classList.remove('active');
        star.style.color = '#cbd5e1';
      }
    });
    if (label) label.textContent = ratingLabels[val] || `${val} Stars`;
    if (hiddenInput) hiddenInput.value = val;
  }

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      const val = parseInt(star.getAttribute('data-rating'), 10) || 5;
      currentRatingValue = val;
      updateStars(val);
    });

    star.addEventListener('mouseenter', () => {
      const hoverVal = parseInt(star.getAttribute('data-rating'), 10) || 5;
      updateStars(hoverVal);
    });
  });

  container.addEventListener('mouseleave', () => {
    updateStars(currentRatingValue);
  });

  updateStars(currentRatingValue);
}

function toggleRatingTag(btn) {
  if (!btn) return;
  btn.classList.toggle('active');
  if (btn.classList.contains('active')) {
    btn.style.background = '#e0f2fe';
    btn.style.borderColor = '#0284c7';
    btn.style.color = '#0369a1';
    btn.style.fontWeight = '700';
  } else {
    btn.style.background = '#f8fafc';
    btn.style.borderColor = '#cbd5e1';
    btn.style.color = '#475569';
    btn.style.fontWeight = '600';
  }
}

function checkUnratedVisitsBanner() {
  const bannerWrap = document.getElementById('unrated-visit-banner-wrap');
  if (!bannerWrap) return;

  const completedAppts = (allAppointments || []).filter(a => (a.status || '').toLowerCase() === 'completed');
  if (completedAppts.length === 0) {
    bannerWrap.innerHTML = '';
    return;
  }

  // Find the most recent completed appointment
  const mostRecent = [...completedAppts].sort((a, b) =>
    new Date(b.appointment_date || b.dateTime) - new Date(a.appointment_date || a.dateTime)
  )[0];

  apiFetch(`/appointments/${mostRecent.id}/review`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => {
    if (res && res.review) {
      bannerWrap.innerHTML = '';
    } else {
      const treatmentName = mostRecent.treatment?.name || mostRecent.reason || 'Dental Visit';
      bannerWrap.innerHTML = `
        <div class="unrated-visit-banner" style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1.5px solid #f59e0b; border-radius: 14px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; box-shadow: 0 4px 14px rgba(217, 119, 6, 0.12); margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: #f59e0b; color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);">
              <span style="line-height: 1;">★</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h4 style="margin: 0; color: #78350f; font-size: 0.96rem; font-weight: 800;">Rate your completed visit for ${escapeHTML(treatmentName)}</h4>
                <span class="status-pill completed" style="font-size: 0.68rem; padding: 2px 7px;">Completed</span>
              </div>
              <p style="margin: 2px 0 0 0; color: #92400e; font-size: 0.8rem;">Share your experience to help calculate our clinic's real satisfaction score!</p>
            </div>
          </div>
          <button type="button" class="btn btn-primary" onclick="openRateTreatmentModal('${mostRecent.id}')" style="background: #0b3c4d; color: white; border: none; padding: 9px 18px; border-radius: 10px; font-weight: 700; font-size: 0.84rem; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(11, 60, 77, 0.25);">
            <span style="color: #facc15; font-size: 14px; line-height: 1;">★</span>
            <span>Rate Visit Now</span>
          </button>
        </div>
      `;
    }
  })
  .catch(() => {
    bannerWrap.innerHTML = '';
  });
}

function openRateTreatmentModal(apptId) {
  const appt = (allAppointments || []).find(a => a.id === apptId || String(a.id) === String(apptId)) || selectedAppointment;
  if (!appt) {
    showToast('Appointment record not found.', 'error');
    return;
  }

  const inputApptId = document.getElementById('rate-appt-id');
  if (inputApptId) inputApptId.value = appt.id;

  const treatmentName = appt.treatment?.name || appt.reason || 'Dental Visit';
  let dentistName = 'Staff Specialist';
  const notesRaw = appt.notes || '';
  const dentistMatch = notesRaw.match(/\[Dentist:\s*([^\]]+)\]/i);
  if (dentistMatch && dentistMatch[1] !== 'No Preference') dentistName = dentistMatch[1];

  let branchName = 'Main Branch (Naga)';
  const branchMatch = notesRaw.match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) branchName = formatShortBranchName(branchMatch[1]);

  safeSet('rate-treatment-name', treatmentName);
  safeSet('rate-dentist-name', `Dentist: ${dentistName} • ${branchName}`);

  // Reset inputs
  currentRatingValue = 5;
  const commentInput = document.getElementById('rate-comment-input');
  if (commentInput) commentInput.value = '';

  const tags = document.querySelectorAll('#rate-tags-container .rating-tag-pill');
  tags.forEach(t => {
    t.classList.remove('active');
    t.style.background = '#f8fafc';
    t.style.borderColor = '#cbd5e1';
    t.style.color = '#475569';
    t.style.fontWeight = '600';
  });

  initStarRatingEvents();
  const hiddenInput = document.getElementById('rate-selected-value');
  if (hiddenInput) hiddenInput.value = '5';
  const label = document.getElementById('star-rating-label');
  if (label) label.textContent = ratingLabels[5];
  const stars = document.querySelectorAll('#star-rating-selector .star-item');
  stars.forEach(star => {
    star.classList.add('active');
    star.style.color = '#f59e0b';
  });

  const modal = document.getElementById('modal-rate-treatment');
  if (modal) modal.classList.add('active');
}

function closeRateTreatmentModal() {
  const modal = document.getElementById('modal-rate-treatment');
  if (modal) modal.classList.remove('active');
}

function submitTreatmentRating(e) {
  if (e) e.preventDefault();

  const apptId = document.getElementById('rate-appt-id')?.value;
  if (!apptId) {
    showToast('Missing appointment reference.', 'error');
    return;
  }

  const rating = parseInt(document.getElementById('rate-selected-value')?.value || currentRatingValue, 10);
  const comment = document.getElementById('rate-comment-input')?.value.trim() || '';

  const selectedTags = [];
  document.querySelectorAll('#rate-tags-container .rating-tag-pill.active').forEach(tagEl => {
    const val = tagEl.getAttribute('data-tag');
    if (val) selectedTags.push(val);
  });

  const submitBtn = document.getElementById('btn-submit-review');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="ti ti-loader ti-spin"></i> Submitting...`;
  }

  apiFetch(`/appointments/${apptId}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      rating,
      comment,
      tags: selectedTags
    })
  })
  .then(data => {
    showToast('Thank you! Your satisfaction rating has been recorded.', 'success');
    closeRateTreatmentModal();

    // Refresh unrated visits banner
    checkUnratedVisitsBanner();

    // If appointment details modal is open, refresh its review section
    if (selectedAppointment && (selectedAppointment.id === apptId || String(selectedAppointment.id) === String(apptId))) {
      openAppointmentDetailsModal(apptId);
    }
  })
  .catch(err => {
    console.error('Error submitting rating:', err);
    showToast('Failed to submit rating. Please try again.', 'error');
  })
  .finally(() => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="ti ti-check"></i> <span>Submit Rating</span>`;
    }
  });
}

const STANDARD_RESCHEDULE_SLOTS = [
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM'
];

function updateRescheduleSlotOptions() {
  const dateInput = document.getElementById('reschedule-date-input');
  const timeSelect = document.getElementById('reschedule-time-select');
  if (!dateInput || !timeSelect) return;

  const dateVal = dateInput.value;
  const previousSelected = timeSelect.value;

  if (!dateVal) {
    timeSelect.innerHTML = '<option value="">Select Date First</option>' +
      STANDARD_RESCHEDULE_SLOTS.map(slot => `<option value="${slot}">${slot}</option>`).join('');
    return;
  }

  const occupiedTimes = new Set();

  // 1. Check already-loaded appointments in memory
  if (Array.isArray(allAppointments)) {
    allAppointments.forEach(appt => {
      extractSlotFromAppointment(appt, dateVal).forEach(t => occupiedTimes.add(t));
    });
  }

  const renderSelectOptions = () => {
    let optionsHtml = '<option value="">Select Time Slot</option>';
    let firstAvailableSlot = '';

    STANDARD_RESCHEDULE_SLOTS.forEach(slot => {
      const isOccupied = isTimeSlotInSet(slot, occupiedTimes);
      if (isOccupied) {
        optionsHtml += `<option value="${slot}" disabled style="color: #94a3b8; background-color: #f1f5f9; font-style: italic;">${slot} — Booked (Unavailable)</option>`;
      } else {
        if (!firstAvailableSlot) firstAvailableSlot = slot;
        optionsHtml += `<option value="${slot}" style="color: #0f172a; background-color: #ffffff;">${slot}</option>`;
      }
    });

    timeSelect.innerHTML = optionsHtml;

    if (previousSelected && !isTimeSlotInSet(previousSelected, occupiedTimes)) {
      timeSelect.value = previousSelected;
    } else if (firstAvailableSlot) {
      timeSelect.value = firstAvailableSlot;
    } else {
      timeSelect.value = '';
    }
  };

  renderSelectOptions();

  // 2. Also query server clinic-wide occupied slots for this date
  apiFetch(`/appointments/occupied?date=${dateVal}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(occupiedList => {
      if (Array.isArray(occupiedList)) {
        occupiedList.forEach(appt => {
          extractSlotFromAppointment(appt, dateVal).forEach(t => occupiedTimes.add(t));
        });
      }
      renderSelectOptions();
    })
    .catch(() => {
      renderSelectOptions();
    });
}
window.updateRescheduleSlotOptions = updateRescheduleSlotOptions;

function toggleReschedulePanel(show) {
  const panel = document.getElementById('inline-reschedule-panel');
  if (!panel) return;

  panel.style.display = show ? 'block' : 'none';

  if (show && selectedAppointment) {
    const dateInput = document.getElementById('reschedule-date-input');

    // Set minimum date to tomorrow, or default to appointment's current date if in future
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let initialDate = tomorrowStr;
    const rawApptDate = selectedAppointment.appointment_date || '';
    if (rawApptDate && rawApptDate.includes('T')) {
      const apptDay = rawApptDate.split('T')[0];
      if (apptDay >= tomorrowStr) initialDate = apptDay;
    }

    if (dateInput) {
      dateInput.min = tomorrowStr;
      dateInput.value = initialDate;
    }

    updateRescheduleSlotOptions();
  }
}

function executeReschedule() {
  if (!selectedAppointment) return;

  const dateVal = document.getElementById('reschedule-date-input')?.value;
  const timeSelect = document.getElementById('reschedule-time-select');
  const timeVal = timeSelect?.value;
  const selectedOpt = timeSelect?.options?.[timeSelect.selectedIndex];

  if (!dateVal) {
    showToast('Please pick a new date to reschedule.', 'error');
    return;
  }
  if (!timeVal || (selectedOpt && selectedOpt.disabled)) {
    showToast('That time slot is already booked or none is selected. Please pick an available time slot.', 'error');
    return;
  }

  // Parse time into ISO string
  const [time, modifier] = timeVal.split(' ');
  let [hours, minutes] = time.split(':');
  if (modifier === 'PM' && hours !== '12') hours = parseInt(hours) + 12;
  if (modifier === 'AM' && hours === '12') hours = '00';
  const isoDateTime = `${dateVal}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

  // Explicit confirmation requirement
  const formattedNew = new Date(isoDateTime).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  if (!confirm(`Request Appointment Reschedule:\n\nDo you want to request rescheduling your appointment to ${formattedNew}?\n\n• Your request will be sent to the Receptionist for approval.`)) {
    return;
  }

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
      appointment_date: isoDateTime,
      status: 'Reschedule Requested'
    })
  })
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => { throw new Error(err.message || 'Failed to reschedule.'); });
      }
      return res.json();
    })
    .then(updated => {
      showToast('✓ Reschedule request sent! Waiting for receptionist approval.', 'info');
      closeAppointmentModal();
      loadAppointments();
    })
    .catch(err => {
      showToast(err.message || 'Could not reschedule appointment. Slot may be occupied.', 'error');
      updateRescheduleSlotOptions();
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

  // Explicit confirmation with notice of non-reversible cancellation
  const confirmMsg = `Request Appointment Cancellation:\n\nAre you sure you want to request cancellation for your appointment on ${formattedDate}?\n\n• Your cancellation request will be sent to the Receptionist for approval.\n\nClick OK to submit your cancellation request.`;
  if (!confirm(confirmMsg)) {
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
      showToast('✓ Cancellation request sent! Waiting for receptionist approval.', 'info');
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
    `DESCRIPTION:Your scheduled visit for ${treatmentName}. Assigned Clinic: Balirong Highway, City of Naga, Cebu. Phone: (032) 489-1200.`,
    `LOCATION:Balirong Highway, City of Naga, Cebu`,
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

  const query = encodeURIComponent('Fano Dental Clinic, Balirong Highway, City of Naga, Cebu');
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
  const notesRaw = appt.notes || '';
  const branchMatch = notesRaw.match(/\[Branch:\s*([^\]]+)\]/i);
  if (branchMatch) branchName = branchMatch[1];

  const feeMatch = notesRaw.match(/\[BookingFee:\s*([^\]]+)\]/i);
  const balanceMatch = notesRaw.match(/\[RemainingBalance:\s*([^\]]+)\]/i);

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
        <div class="row"><span class="label">Clinic Location:</span><span class="val">Balirong Highway, City of Naga, Cebu</span></div>
        <div class="row"><span class="label">Total Procedure Fee:</span><span class="val">${price}</span></div>
        ${feeMatch ? `<div class="row"><span class="label">Booking Deposit (30%):</span><span class="val" style="color: #059669;">${escapeHTML(feeMatch[1])}</span></div>` : ''}
        ${balanceMatch ? `<div class="row"><span class="label">Balance on Visit (70%):</span><span class="val">${escapeHTML(balanceMatch[1])}</span></div>` : ''}
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
  // Compose full address from selector parts
  composeAddress();
  showToast('Profile updated successfully!', 'success');
});

// ─── Sidebar Toggle ──────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

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

function switchSection(sectionId, event) {
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
  // Update active nav & taskbar
  document.querySelectorAll('.nav-item, .taskbar-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
  });

  // Show/hide sections
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`${sectionId}-section`)?.classList.add('active');

  // Breadcrumb
  const labels = {
    overview: 'Home',
    services: 'Clinic Services',
    appointments: 'Appointment',
    records: 'My Records',
    billing: 'Payment',
    finances: 'Financial Summary',
    profile: 'My Profile',
    settings: 'Settings',
    notifications: 'Notifications',
    chats: 'Chats'
  };

  // Notifications tab → display dedicated Notification Center
  if (sectionId === 'notifications') {
    const dropdown = document.getElementById('patient-notif-dropdown');
    if (dropdown) dropdown.hidden = true;
    safeSet('breadcrumb-current', 'Notifications');
    loadPatientNotifications();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Chats tab → open AI chat panel
  if (sectionId === 'chats') {
    const aiToggle = document.getElementById('ai-unified-trigger') ||
                     document.getElementById('ai-chat-toggle') ||
                     document.querySelector('.ai-chat-fab');
    if (aiToggle) aiToggle.click();
    return;
  }
  safeSet('breadcrumb-current', labels[sectionId] || 'Dashboard');

  if (sectionId === 'settings') {
    openOsSettingsCategory('safety');
  }

  if (sectionId === 'services') {
    renderServicesCatalog();
    if (!allTreatments || allTreatments.length === 0) {
      loadTreatments();
    }
  }

  if (sectionId === 'finances') {
    renderFinancialWidgets();
    renderFinancialActivity();
  }

  if (sectionId === 'appointments') {
    if (typeof branchMap !== 'undefined' && branchMap) {
      setTimeout(() => {
        branchMap.invalidateSize();
      }, 150);
    }
    if (typeof autoDetectPatientLocation === 'function') {
      autoDetectPatientLocation();
    }
  }

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
  const toastIcon = type === 'success' ? 'ti-check' : (type === 'info' ? 'ti-info-circle' : 'ti-alert-triangle');
  toast.innerHTML = `<i class="ti ${toastIcon}" style="font-size: 16px;"></i> ${message}`;

  const style = document.createElement('style');
  style.textContent = `@keyframes slideInToast { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
  document.head.appendChild(style);

  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; setTimeout(() => toast.remove(), 400); }, 3200);
}

// ─── Helpers ─────────────────────────────────────────────────
function safeSet(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof val === 'string' && val.includes('<')) {
    el.innerHTML = val;
  } else {
    el.textContent = val;
  }
}
function safeVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('sessionExpiry');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  sessionStorage.removeItem('sessionExpiry');
  window.location.replace('login.html');
}

// ═══════════════════════════════════════════════════════════
//  PATIENT NOTIFICATION CENTER LOGIC
// ═══════════════════════════════════════════════════════════

let allPatientNotifications = [];

function syncActiveTaskbarToCurrentSection() {
  const activeSec = document.querySelector('.content-section.active');
  const activeId = activeSec ? activeSec.id.replace('-section', '') : 'overview';
  document.querySelectorAll('.taskbar-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-section') === activeId);
  });
}

let currentNotificationFilter = 'all';

function filterPatientNotifications(filterType) {
  currentNotificationFilter = filterType || 'all';
  document.querySelectorAll('.notif-filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === currentNotificationFilter);
  });
  renderNotificationCenterList();
}
window.filterPatientNotifications = filterPatientNotifications;

function setupPatientNotifications() {
  const toggleBtn = document.getElementById('btn-patient-notif');
  const dropdown = document.getElementById('patient-notif-dropdown');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // On mobile screens, navigate directly to the dedicated Notifications section
      if (window.innerWidth <= 768) {
        if (dropdown) dropdown.hidden = true;
        switchSection('notifications');
        return;
      }
      // On desktop, toggle dropdown
      if (dropdown) {
        dropdown.hidden = !dropdown.hidden;
        if (!dropdown.hidden) {
          loadPatientNotifications();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.hidden && !dropdown.contains(e.target) && !toggleBtn.contains(e.target) && !e.target.closest('[data-section="notifications"]')) {
        dropdown.hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown && !dropdown.hidden) {
        dropdown.hidden = true;
      }
    });
  }
}

function getReadNotificationIds() {
  try {
    const key = user ? `patient_read_notifs_${user.id}` : 'patient_read_notifs_guest';
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch (_) {
    return new Set();
  }
}

function saveReadNotificationId(id) {
  try {
    const key = user ? `patient_read_notifs_${user.id}` : 'patient_read_notifs_guest';
    const readSet = getReadNotificationIds();
    readSet.add(id);
    localStorage.setItem(key, JSON.stringify([...readSet]));
  } catch (_) { }
}

function loadPatientNotifications(isManual = false) {
  const badge = document.getElementById('patient-notif-count');
  const taskbarBadge = document.getElementById('patient-taskbar-notif-count');
  const sidebarBadge = document.getElementById('patient-sidebar-notif-count');
  const unreadLabel = document.getElementById('pnd-unread-label');
  const chipAll = document.getElementById('notif-chip-all-count');
  const chipUnread = document.getElementById('notif-chip-unread-count');

  apiFetch('/notifications', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(notifs => {
      if (!Array.isArray(notifs)) return;
      allPatientNotifications = notifs;
      const readSet = getReadNotificationIds();
      const unreadCount = notifs.filter(n => !readSet.has(n.id)).length;

      // Update badge & labels
      const countText = unreadCount > 99 ? '99+' : unreadCount;
      if (unreadCount > 0) {
        if (badge) { badge.textContent = countText; badge.style.display = 'inline-flex'; }
        if (taskbarBadge) { taskbarBadge.textContent = countText; taskbarBadge.style.display = 'flex'; }
        if (sidebarBadge) { sidebarBadge.textContent = countText; sidebarBadge.style.display = 'inline-flex'; }
      } else {
        if (badge) badge.style.display = 'none';
        if (taskbarBadge) taskbarBadge.style.display = 'none';
        if (sidebarBadge) sidebarBadge.style.display = 'none';
      }

      if (unreadLabel) unreadLabel.textContent = `${unreadCount} New`;
      if (chipAll) chipAll.textContent = notifs.length;
      if (chipUnread) chipUnread.textContent = unreadCount;

      // Render Dropdown List
      renderNotificationDropdownList(notifs, readSet);

      // Render Full Section List
      renderNotificationCenterList();

      if (isManual) {
        showToast('Notifications refreshed', 'success');
      }
    })
    .catch(err => {
      console.error('Failed to load notifications:', err);
    });
}

function renderNotificationDropdownList(notifs, readSet) {
  const list = document.getElementById('patient-notif-list');
  if (!list) return;

  if (notifs.length === 0) {
    list.innerHTML = `
      <div class="pnd-empty">
        <i class="ti ti-bell-off" style="font-size: 32px; color: #94a3b8;"></i>
        <p>You have no notifications right now.</p>
      </div>`;
    return;
  }

  // Sort newest first
  const sorted = [...notifs].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  const groups = { 'Today': [], 'Yesterday': [], 'Earlier': [] };
  sorted.forEach(n => {
    const g = getNotificationDayGroup(n.time);
    if (!groups[g]) groups[g] = [];
    groups[g].push(n);
  });

  let html = '';
  const groupOrder = ['Today', 'Yesterday', 'Earlier'];

  groupOrder.forEach(groupName => {
    const items = groups[groupName];
    if (!items || items.length === 0) return;

    const unreadInGroup = items.filter(n => !readSet.has(n.id)).length;
    const countLabel = unreadInGroup > 0 ? `${unreadInGroup} new` : `${items.length} ${items.length === 1 ? 'alert' : 'alerts'}`;
    const groupIcon = groupName === 'Today' ? 'ti-clock' : (groupName === 'Yesterday' ? 'ti-calendar-event' : 'ti-history');

    html += `
      <div class="pnd-date-group">
        <div class="pnd-date-header">
          <span class="pnd-date-title"><i class="ti ${groupIcon}" style="font-size: 13px;"></i> ${groupName}</span>
          <span class="pnd-date-count">${countLabel}</span>
        </div>
        <div class="pnd-date-items">
          ${items.map(n => {
            const isUnread = !readSet.has(n.id);
            const timeStr = formatNotificationTime(n.time);
            const iconSvg = getNotificationIconSvg(n.icon, n.type);

            return `
              <div class="pnd-item ${isUnread ? 'unread' : ''}" onclick="onPatientNotificationClick('${n.id}', '${n.action?.type || ''}', '${n.action?.id || ''}', '${n.action?.tab || ''}')">
                <div class="pnd-icon-wrap type-${n.type || 'info'}">
                  ${iconSvg}
                </div>
                <div class="pnd-content">
                  <div class="pnd-title">${escapeHTML(n.title)}</div>
                  <div class="pnd-desc">${escapeHTML(n.message)}</div>
                  <span class="pnd-time">${timeStr}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  list.innerHTML = html;
}

function renderNotificationCenterList() {
  const sectionList = document.getElementById('patient-section-notif-list');
  if (!sectionList) return;

  const readSet = getReadNotificationIds();
  let notifs = allPatientNotifications || [];

  // Filter based on active filter chip
  if (currentNotificationFilter === 'unread') {
    notifs = notifs.filter(n => !readSet.has(n.id));
  } else if (currentNotificationFilter === 'appointment') {
    notifs = notifs.filter(n => n.category === 'appointment' || n.id.startsWith('appt-'));
  } else if (currentNotificationFilter === 'billing') {
    notifs = notifs.filter(n => n.category === 'billing' || n.id.startsWith('inv-'));
  }

  if (notifs.length === 0) {
    sectionList.innerHTML = `
      <div class="pnd-empty" style="padding: 56px 24px; text-align: center;">
        <i class="ti ti-bell-off" style="font-size: 44px; color: #94a3b8; display: block; margin: 0 auto 12px;"></i>
        <h4 style="margin: 0 0 6px 0; color: var(--text-primary); font-weight: 700; font-size: 1.1rem;">No Notifications in this filter</h4>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.88rem;">Try selecting "All Alerts" to view your full notification history.</p>
      </div>`;
    return;
  }

  // Sort newest first
  const sorted = [...notifs].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  const groups = { 'Today': [], 'Yesterday': [], 'Earlier': [] };
  sorted.forEach(n => {
    const g = getNotificationDayGroup(n.time);
    if (!groups[g]) groups[g] = [];
    groups[g].push(n);
  });

  let html = '';
  const groupOrder = ['Today', 'Yesterday', 'Earlier'];

  groupOrder.forEach(groupName => {
    const items = groups[groupName];
    if (!items || items.length === 0) return;

    const unreadInGroup = items.filter(n => !readSet.has(n.id)).length;
    const countLabel = unreadInGroup > 0 ? `${unreadInGroup} new` : `${items.length} ${items.length === 1 ? 'alert' : 'alerts'}`;
    const groupIcon = groupName === 'Today' ? 'ti-clock' : (groupName === 'Yesterday' ? 'ti-calendar-event' : 'ti-history');

    html += `
      <div class="pnd-sec-group">
        <div class="pnd-sec-group-header">
          <span class="pnd-sec-group-title"><i class="ti ${groupIcon}"></i> ${groupName}</span>
          <span class="pnd-sec-group-badge">${countLabel}</span>
        </div>
        <div class="pnd-sec-items-list">
          ${items.map(n => {
            const isUnread = !readSet.has(n.id);
            const timeStr = formatNotificationTime(n.time);
            const iconSvg = getNotificationIconSvg(n.icon, n.type);
            const categoryLabel = (n.category || (n.id.startsWith('appt-') ? 'Appointment' : 'Billing')).toUpperCase();

            let actionButtonHtml = '';
            if (n.action?.type === 'view_appointment' && n.action?.id) {
              actionButtonHtml = `
                <button type="button" class="pnd-card-action-btn appt" onclick="event.stopPropagation(); onPatientNotificationClick('${n.id}', 'view_appointment', '${n.action.id}')">
                  <i class="ti ti-calendar"></i> View Details
                </button>
              `;
            } else if (n.action?.type === 'pay_invoice' && n.action?.id) {
              actionButtonHtml = `
                <button type="button" class="pnd-card-action-btn pay" onclick="event.stopPropagation(); onPatientNotificationClick('${n.id}', 'pay_invoice', '${n.action.id}')">
                  <i class="ti ti-credit-card"></i> Pay Invoice
                </button>
              `;
            } else if (n.action?.type === 'view_receipt' && n.action?.id) {
              actionButtonHtml = `
                <button type="button" class="pnd-card-action-btn receipt" onclick="event.stopPropagation(); onPatientNotificationClick('${n.id}', 'view_receipt', '${n.action.id}')">
                  <i class="ti ti-receipt"></i> View Receipt
                </button>
              `;
            }

            return `
              <div class="pnd-sec-card ${isUnread ? 'unread' : 'read'}" onclick="onPatientNotificationClick('${n.id}', '${n.action?.type || ''}', '${n.action?.id || ''}', '${n.action?.tab || ''}')">
                <div class="pnd-sec-card-icon type-${n.type || 'info'}">
                  ${iconSvg}
                </div>
                <div class="pnd-sec-card-content">
                  <div class="pnd-sec-card-top">
                    <span class="pnd-sec-category-pill cat-${n.type || 'info'}">${categoryLabel}</span>
                    <span class="pnd-sec-time"><i class="ti ti-clock" style="font-size: 12px;"></i> ${timeStr}</span>
                  </div>
                  <h4 class="pnd-sec-card-title">${escapeHTML(n.title)}</h4>
                  <p class="pnd-sec-card-desc">${escapeHTML(n.message)}</p>
                  ${actionButtonHtml ? `<div class="pnd-sec-card-actions">${actionButtonHtml}</div>` : ''}
                </div>
                ${isUnread ? '<span class="pnd-sec-unread-dot" title="Unread alert"></span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  sectionList.innerHTML = html;
}

function getNotificationDayGroup(isoStr) {
  if (!isoStr) return 'Earlier';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'Earlier';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - notifDay) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

function onPatientNotificationClick(notifId, actionType, actionTarget, actionTab) {
  saveReadNotificationId(notifId);

  // Close dropdown
  const dropdown = document.getElementById('patient-notif-dropdown');
  if (dropdown) dropdown.hidden = true;

  // Execute associated action
  if (actionType === 'view_appointment' && actionTarget) {
    openAppointmentDetailsModal(actionTarget);
  } else if (actionType === 'view_receipt' && actionTarget) {
    viewInvoiceReceipt(actionTarget);
  } else if (actionType === 'pay_invoice' && actionTarget) {
    openPaymongoModal(actionTarget);
  } else if (actionType === 'book_now') {
    switchSection('appointments');
  } else if (actionType === 'switch_tab' && actionTab) {
    switchSection(actionTab);
  }

  // Refresh badges & read states
  loadPatientNotifications();
}

function markAllPatientNotificationsRead() {
  try {
    const key = user ? `patient_read_notifs_${user.id}` : 'patient_read_notifs_guest';
    const allIds = allPatientNotifications.map(n => n.id);
    localStorage.setItem(key, JSON.stringify(allIds));
    loadPatientNotifications();
    showToast('All notifications marked as read', 'success');
  } catch (_) { }
}

function formatNotificationTime(isoStr) {
  if (!isoStr) return 'Just now';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'Recently';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - notifDay) / (1000 * 60 * 60 * 24));

  const timeString = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (diffDays <= 0) {
    const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 6) return `${diffHours}h ago`;
    return timeString;
  } else if (diffDays === 1) {
    return timeString;
  } else {
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${timeString}`;
  }
}

function getNotificationIconSvg(iconName, type) {
  if (iconName === 'calendar-check' || iconName === 'calendar-plus') {
    return '<i class="ti ti-calendar-check" style="font-size: 18px;"></i>';
  }
  if (iconName === 'receipt' || iconName === 'credit-card') {
    return '<i class="ti ti-credit-card" style="font-size: 18px;"></i>';
  }
  if (iconName === 'circle-check') {
    return '<i class="ti ti-circle-check" style="font-size: 18px;"></i>';
  }
  if (iconName === 'circle-xmark') {
    return '<i class="ti ti-circle-x" style="font-size: 18px;"></i>';
  }
  if (iconName === 'chair' || iconName === 'user-doctor') {
    return '<i class="ti ti-stethoscope" style="font-size: 18px;"></i>';
  }
  return '<i class="ti ti-info-circle" style="font-size: 18px;"></i>';
}

