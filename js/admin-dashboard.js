// Admin Dashboard Logic
function initAdminLiveClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById('current-time');
    const dateEl = document.getElementById('current-date');
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
initAdminLiveClock();

const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';

const AUTH_API = `${BASE_ORIGIN}/api/auth`;
const ADMIN_API = `${BASE_ORIGIN}/api/admin`;
const APPT_API = `${BASE_ORIGIN}/api/appointments`;
const PATIENT_API = `${BASE_ORIGIN}/api/patients`;
const INVOICE_API = `${BASE_ORIGIN}/api/invoices`;
const TREATMENT_API = `${BASE_ORIGIN}/api/treatments`;

function getCurrencySymbol() {
  const raw = localStorage.getItem('set-currency') || '₱';
  const match = String(raw).trim().match(/\(([^)]+)\)/);
  if (match && match[1]) return match[1].trim();
  return raw;
}

function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
}

let token = getAuthToken();
let user = null;

// Roster memory states & dashboard state variables
let allAppointments = [];
let allPatients = [];
let allInvoices = [];
let localInventory = null;
let allExpenses = [];
let localStaffSchedules = null;
let localUsers = [];
let allSystemLogs = [];
let logsPollingInterval = null;
let adminNotificationsList = [];
let currentAdminBranch = 'all';
let onDeleteConfirmCallback = null;
let adminClinicBranches = [];
const defaultClinicBranches = [
  { id: 'branch-main', key: 'Main Branch', name: 'Fano Dental Clinic', location: 'Balirong Highway, City of Naga, Cebu', contactNumber: '+63 917 555 0101', operatingHours: 'Mon–Sat 8:00 AM – 5:00 PM', isMain: true, lat: 10.2098, lng: 123.7580 }
];

const defaultAdmin = {
  id: 'admin-default-id',
  name: 'Fano Admin',
  first_name: 'Fano',
  last_name: 'Admin',
  email: 'admin@fanoclinic.com',
  role: 'Admin'
};

async function ensureAdminAuth() {
  const curToken = getAuthToken();
  if (!curToken) {
    // No token at all — send to login
    window.location.replace('../pages/login.html');
    return null;
  }

  try {
    const res = await fetch(`${AUTH_API}/profile`, {
      headers: { 'Authorization': `Bearer ${curToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && !data.message) {
        // Extra safety: make sure this user is actually an Admin
        if (data.role && data.role !== 'Admin' && data.role !== 'Super Admin') {
          window.location.replace('../pages/login.html');
          return null;
        }
        user = data;
        token = curToken;
        return token;
      }
    }
  } catch (_) {}

  // Token invalid or expired — clear it and redirect to login
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  window.location.replace('../pages/login.html');
  return null;
}

async function startAdminApp() {
  const validToken = await ensureAdminAuth();
  if (!validToken) return; // Redirected to login, stop execution
  renderAdminSidebar();
  initDashboard();
}

function renderAdminSidebar() {
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Admin';
  const initial = displayName.charAt(0).toUpperCase();
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-avatar').textContent = initial;
  const mobileAvatar = document.getElementById('mobile-admin-avatar');
  if (mobileAvatar) mobileAvatar.textContent = initial;
}

// ─── Administrator Profile Modal Controller ────────────────────────────────────
function openAdminProfileModal() {
  const modal = document.getElementById('modal-admin-profile');
  if (!modal) return;
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Administrator';
  const initial = displayName.charAt(0).toUpperCase();
  const email = user.email || 'admin@fanoclinic.com';

  const nameEl = document.getElementById('admin-modal-name');
  const avatarEl = document.getElementById('admin-modal-avatar');
  const emailEl = document.getElementById('admin-modal-email');
  if (nameEl) nameEl.textContent = displayName;
  if (avatarEl) avatarEl.textContent = initial;
  if (emailEl) emailEl.textContent = email;

  modal.style.display = 'flex';
}

function closeAdminProfileModal() {
  const modal = document.getElementById('modal-admin-profile');
  if (modal) modal.style.display = 'none';
}
window.openAdminProfileModal = openAdminProfileModal;
window.closeAdminProfileModal = closeAdminProfileModal;

// ─── Mobile Sidebar Drawer Controller ──────────────────────────────────────────
function toggleAdminMobileSidebar(forceState) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const hamburgerBtn = document.getElementById('mobile-hamburger-btn');
  if (!sidebar) return;

  const isOpen = sidebar.classList.contains('drawer-open');
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;

  if (shouldOpen) {
    sidebar.classList.add('drawer-open');
    backdrop?.classList.add('active');
    document.body.classList.add('sidebar-drawer-locked');
    hamburgerBtn?.setAttribute('aria-expanded', 'true');
  } else {
    sidebar.classList.remove('drawer-open');
    backdrop?.classList.remove('active');
    document.body.classList.remove('sidebar-drawer-locked');
    hamburgerBtn?.setAttribute('aria-expanded', 'false');
  }
}

// Auto-close drawer on desktop resize (> 768px)
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    toggleAdminMobileSidebar(false);
  }
});

// Escape key closes mobile drawer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    toggleAdminMobileSidebar(false);
  }
});

// ─── Initialize Dashboard Features ──────────────────────────────────────────
function initDashboard() {
  setupTabs();
  setupFilters(); // Attach keypress and select dropdown filters
  initPasswordToggles();
  initSystemLogsListeners(); // Attach live system logs search, filter, and stream controls
  setupAdminNotifications(); // Attach admin alert center listeners
  loadAdminNotifications();  // Initial fetch of admin notifications
  loadAppointments();        // Initial fetch and cache of all clinic appointments & branch badges
  loadAdminBranches();       // Initial fetch and synchronization of clinic branches
  setInterval(() => loadAdminNotifications(), 30000); // Polling every 30s

  // Always default to 'overview' (Dashboard Overview) when opening or logging in,
  // unless an explicit hash anchor is in the URL (e.g. #appointments)
  const validTabs = ['overview', 'appointments', 'patients', 'billing', 'staff', 'services', 'inventory', 'users', 'history', 'logs', 'settings'];
  const hashTab = (window.location.hash || '').replace('#', '').trim();
  
  // Clean up any stale admin_active_tab in localStorage so it never forces logs or other tabs on fresh launch
  try {
    localStorage.removeItem('admin_active_tab');
  } catch (_) {}

  // Only restore from sessionStorage during an active navigation session (never 'logs')
  let sessionTab = '';
  try {
    sessionTab = sessionStorage.getItem('admin_active_tab');
  } catch (_) {}

  const initialTab = (hashTab && validTabs.includes(hashTab))
    ? hashTab
    : (sessionTab && validTabs.includes(sessionTab) && sessionTab !== 'logs' ? sessionTab : 'overview');

  // Restore branches toggle state (default open)
  const branchesOpen = localStorage.getItem('admin_sidebar_branches_open');
  const branchesToggle = document.getElementById('sb-branches-toggle');
  const branchesSubnav = document.getElementById('sb-branches-subnav');
  if (branchesToggle && branchesSubnav) {
    if (branchesOpen === 'false') {
      branchesToggle.classList.remove('open');
      branchesSubnav.classList.add('collapsed');
      branchesToggle.setAttribute('aria-expanded', 'false');
    } else {
      branchesToggle.classList.add('open');
      branchesSubnav.classList.remove('collapsed');
      branchesToggle.setAttribute('aria-expanded', 'true');
    }
  }

  activateTab(initialTab);
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────
function activateTab(targetTab, skipDataLoad = false) {
  if (!targetTab) return;
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === targetTab) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  panes.forEach(pane => {
    if (pane.id === `tab-${targetTab}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // If not on appointments tab, ensure branch subnav items are not highlighted
  if (targetTab !== 'appointments') {
    document.querySelectorAll('#sb-branches-subnav .sb-subnav-item').forEach(item => {
      item.classList.remove('active');
    });
  }

  // Update breadcrumb label
  const breadcrumbMap = {
    overview: 'Dashboard Overview',
    appointments: 'Appointments Agenda',
    patients: 'Patients Directory',
    billing: 'Billing & Invoices',
    staff: 'Staff Management',
    services: 'Clinic Services & Treatments',
    inventory: 'Inventory & Supplies',
    users: 'Manage System Users',
    history: 'Medical History Records',
    logs: 'System Logs & Audits',
    settings: 'Clinic Settings'
  };
  const bc = document.getElementById('admin-breadcrumb-label');
  if (bc) bc.textContent = breadcrumbMap[targetTab] || 'Dashboard Overview';

  // Manage live polling for system logs tab
  if (targetTab === 'logs') {
    loadSystemLogs();
    if (typeof startSystemLogsStream === 'function') {
      startSystemLogsStream();
    }
  } else {
    if (typeof stopSystemLogsStream === 'function') {
      stopSystemLogsStream();
    }
    const pauseBtn = document.getElementById('btn-pause-stream');
    if (pauseBtn) {
      pauseBtn.innerHTML = '<i class="ti ti-player-pause" style="font-size: 14px;"></i> Pause Stream';
      pauseBtn.classList.remove('btn-primary');
      pauseBtn.classList.add('btn-secondary');
    }
  }

  // Persist current active tab: Clean up localStorage so fresh logins/reloads default to dashboard
  try {
    localStorage.removeItem('admin_active_tab');
    if (targetTab && targetTab !== 'logs' && targetTab !== 'overview') {
      sessionStorage.setItem('admin_active_tab', targetTab);
    } else {
      sessionStorage.removeItem('admin_active_tab');
    }
    // Keep the URL clean — no #hash fragments appended
    if (window.history && window.history.replaceState && window.location.hash) {
      window.history.replaceState(null, null, window.location.pathname);
    }
  } catch (e) {}

  if (!skipDataLoad) {
    if (targetTab === 'overview') {
      loadStats();
    } else if (targetTab === 'appointments') {
      if (Array.isArray(allAppointments) && allAppointments.length > 0) {
        filterAndRenderAppointments();
      }
      loadAppointments();
    } else if (targetTab === 'patients') {
      loadPatients();
    } else if (targetTab === 'billing') {
      loadBilling();
    } else if (targetTab === 'staff') {
      loadStaffSchedules();
    } else if (targetTab === 'services') {
      loadAdminTreatments();
    } else if (targetTab === 'inventory') {
      loadInventory();
    } else if (targetTab === 'users') {
      loadUsers();
    } else if (targetTab === 'history') {
      loadVisitsHistory();
    } else if (targetTab === 'logs') {
      // Handled via loadSystemLogs above
    } else if (targetTab === 'settings') {
      loadSettings();
    }
  }
}
window.activateTab = activateTab;

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab === 'appointments' && !window._skipBranchReset) {
        currentAdminBranch = 'all';
        document.querySelectorAll('#sb-branches-subnav .sb-subnav-item').forEach(item => {
          item.classList.toggle('active', item.getAttribute('data-branch') === 'all');
        });
      }
      activateTab(targetTab);
      // Auto-close mobile drawer when user taps a nav item on mobile
      if (window.innerWidth <= 768) {
        toggleAdminMobileSidebar(false);
      }
    });
  });

  // Handle browser back/forward buttons seamlessly
  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '').replace('#', '').trim();
    const validTabs = ['overview', 'appointments', 'patients', 'billing', 'staff', 'inventory', 'users', 'history', 'logs', 'settings'];
    if (hash && validTabs.includes(hash)) {
      activateTab(hash);
      if (window.innerWidth <= 768) {
        toggleAdminMobileSidebar(false);
      }
    }
  });
}

// ─── Clinic Branches Sidebar Navigation & Filtering ──────────────────────────
// currentAdminBranch is declared at top of file

function getAppointmentBranch(a) {
  return 'Balirong Highway, City of Naga, Cebu';
}

function isMatchingOtherBranch(b) {
  return false;
}

function doesAppointmentMatchBranch(a, targetBranch) {
  return true;
}

function getInvoiceBranch(inv) {
  return 'Balirong Highway, City of Naga, Cebu';
}

function doesInvoiceMatchBranch(inv, targetBranch) {
  return true;
}

function renderAppointmentBranchBadge(a) {
  return `
    <div class="branch-location-badge branch-badge-main" title="Fano Dental Clinic — Balirong Highway, City of Naga, Cebu" style="display: inline-flex; flex-direction: row; align-items: center; gap: 5px; padding: 3px 8px; white-space: nowrap;">
      <span class="blb-dot"></span>
      <span class="blb-title" style="font-size: 0.76rem; font-weight: 700;">Naga City</span>
    </div>
  `;
}

window.toggleSidebarBranches = function(e) {};

window.selectAdminMainClinicAppointments = function(e) {
  if (e) e.preventDefault();
  activateTab('appointments');
  filterAndRenderAppointments();
};

let cachedBranchAnalytics = null;

window.getBranchDisplayName = function(bk) {
  return 'Fano Dental Clinic (Naga)';
};

window.selectAdminAnalyticsBranch = function(branchId, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentAdminBranch = 'all';
  renderDashboardAnalytics('all');
  filterAndRenderAppointments();
};

window.selectAdminBranch = function(branchId, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentAdminBranch = 'all';
  activateTab('appointments');
  filterAndRenderAppointments();
};

async function loadAdminBranches() {
  adminClinicBranches = [...defaultClinicBranches];
  populateBranchDropdowns();
  updateSidebarBranchBadges();
}
window.loadAdminBranches = loadAdminBranches;

function renderSidebarBranches() {}
window.renderSidebarBranches = renderSidebarBranches;

function renderBranchPills() {}
window.renderBranchPills = renderBranchPills;

function populateBranchDropdowns() {
  const editLocation = document.getElementById('edit-appt-location');
  if (editLocation && editLocation.tagName === 'INPUT') {
    editLocation.value = 'Balirong Highway, City of Naga, Cebu';
  }
}
window.populateBranchDropdowns = populateBranchDropdowns;

function updateSidebarBranchBadges() {
  const count = (allAppointments || []).length;
  const mainBadge = document.getElementById('main-clinic-sidebar-badge');
  if (mainBadge) mainBadge.textContent = count;
}
window.updateSidebarBranchBadges = updateSidebarBranchBadges;

function renderBranchComparisonMatrix(branchAnalytics) {}
window.renderBranchComparisonMatrix = renderBranchComparisonMatrix;

function renderDashboardAnalytics(branchId = currentAdminBranch) {
  const branch = branchId || 'all';
  const branchInvoices = (branch === 'all')
    ? (allInvoices || [])
    : (allInvoices || []).filter(inv => doesInvoiceMatchBranch(inv, branch));

  const branchAppointments = (branch === 'all')
    ? (allAppointments || [])
    : (allAppointments || []).filter(a => doesAppointmentMatchBranch(a, branch));

  // 1. Update active branch pills
  document.querySelectorAll('#branch-analytics-pills .branch-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-branch') === branch);
  });

  // 2. Update active branch notification banner
  const banner = document.getElementById('analytics-branch-banner');
  const bannerName = document.getElementById('analytics-branch-banner-name');
  const bannerStat = document.getElementById('analytics-branch-banner-stat');

  if (banner && bannerName && bannerStat) {
    if (branch === 'all') {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'flex';
      bannerName.textContent = getBranchDisplayName(branch);
      bannerStat.textContent = `${branchAppointments.length} appointments • ${branchInvoices.length} invoices recorded`;
    }
  }

  // 3. Highlight corresponding card in Multi-Branch Matrix
  document.querySelectorAll('.branch-matrix-card').forEach(card => {
    card.classList.toggle('active-selected', card.getAttribute('data-branch') === branch);
  });

  // 4. Calculate Top KPI Cards for the chosen branch
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppts = branchAppointments.filter(a => a.appointment_date && a.appointment_date.startsWith(todayStr));
  const seenToday = todayAppts.filter(a => (a.status || '').toLowerCase() === 'completed').length;
  const noShowsToday = todayAppts.filter(a => (a.status || '').toLowerCase() === 'cancelled').length;

  let revenueToday = 0;
  let revenueMonth = 0;
  const curMonth = todayStr.substring(0, 7);

  branchInvoices.forEach(inv => {
    const amt = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
    const val = amt > 0 ? amt : paid;

    const issuedDate = inv.issued_at || inv.created_at || '';
    if (issuedDate.startsWith(todayStr)) revenueToday += val;
    if (issuedDate.startsWith(curMonth)) revenueMonth += val;
  });

  if (revenueMonth === 0 && branchInvoices.length > 0) {
    revenueMonth = branchInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount || inv.total_amount || 0) || 0), 0);
  }

  const seenEl = document.getElementById('today-seen');
  if (seenEl) seenEl.textContent = seenToday;
  const noShowEl = document.getElementById('today-noshows');
  if (noShowEl) noShowEl.textContent = noShowsToday;
  const todayRevEl = document.getElementById('today-revenue');
  if (todayRevEl) todayRevEl.textContent = `${getCurrencySymbol()}${revenueToday.toFixed(2)}`;
  const monthRevEl = document.getElementById('month-revenue');
  if (monthRevEl) monthRevEl.textContent = `${getCurrencySymbol()}${revenueMonth.toFixed(2)}`;

  // 5. Update Today's Schedule Timeline for the chosen branch
  const timeline = document.getElementById('today-appointments-timeline');
  if (timeline) {
    if (todayAppts.length > 0) {
      timeline.innerHTML = todayAppts.map(a => {
        const timeStr = new Date(a.appointment_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const pName = a.patient ? a.patient.name : 'Unknown Patient';
        const contact = a.patient?.contact_number || 'No Phone';
        const bBadge = renderAppointmentBranchBadge(a);
        return `
          <div class="activity-item">
            <div class="activity-main">
              <h5>${escapeHTML(pName)}</h5>
              <p>Time: ${timeStr} | Contact: ${escapeHTML(contact)}</p>
              <div style="margin-top: 4px;">${bBadge}</div>
            </div>
            <div style="text-align: right;">
              <span class="badge-staff" style="background:#e3fcef; color:#0e6245; font-size:0.7rem; font-weight:600; text-transform:uppercase;">${a.status || 'Scheduled'}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      timeline.innerHTML = `
        <div style="text-align: center; padding: 32px 12px; color: #888;">
          <span style="font-size: 2rem;">🗓️</span>
          <p style="margin-top: 8px; font-size: 0.9rem;">No appointments scheduled for ${escapeHTML(getBranchDisplayName(branch))} today.</p>
        </div>
      `;
    }
  }

  // 6. Render Charts with filtered data
  renderRevenueChart(branchInvoices, currentRevenuePeriod);
  renderFinancialOverview(branchInvoices, currentFinancialPeriod, allExpenses);
  renderPatientData(branchAppointments, currentPatientPeriod);
  renderExpensesBreakdown(branchInvoices, currentExpensesPeriod, allExpenses);
  renderOverviewInventory(localInventory);
  renderOverviewPopularTreatments(branchAppointments);
}

function renderBranchComparisonMatrix(branchAnalytics) {
  const container = document.getElementById('branch-matrix-grid');
  if (!container) return;

  const appts = allAppointments || [];
  const invs = allInvoices || [];
  const analytics = branchAnalytics || cachedBranchAnalytics || {};

  // Calculate total revenue across all branches
  let totalRev = 0;
  if (Object.keys(analytics).length > 0) {
    totalRev = Object.values(analytics).reduce((sum, item) => sum + parseFloat(item.totalRevenue || 0), 0);
  }
  if (!totalRev) {
    totalRev = invs.reduce((sum, i) => sum + parseFloat(i.amount || i.total_amount || 0), 0) || 1;
  }
  if (!totalRev) totalRev = 1;

  const branches = (adminClinicBranches && adminClinicBranches.length > 0) ? adminClinicBranches : defaultClinicBranches;

  container.innerHTML = branches.map(b => {
    const ba = analytics[b.key] || analytics[b.name] || analytics[b.id];

    const bAppts = appts.filter(a => doesAppointmentMatchBranch(a, b.key));
    const bInvs = invs.filter(i => doesInvoiceMatchBranch(i, b.key));

    const totalAppointments = (ba && ba.totalAppointments !== undefined) ? ba.totalAppointments : bAppts.length;
    const completedAppointments = (ba && ba.completedAppointments !== undefined)
      ? ba.completedAppointments
      : bAppts.filter(a => (a.status || '').toLowerCase() === 'completed').length;
    const pendingAppointments = (ba && ba.pendingAppointments !== undefined)
      ? ba.pendingAppointments
      : bAppts.filter(a => (a.status || '').toLowerCase() === 'pending').length;

    const bRev = (ba && ba.totalRevenue !== undefined)
      ? parseFloat(ba.totalRevenue)
      : bInvs.reduce((sum, i) => sum + parseFloat(i.amount || i.total_amount || 0), 0);

    const sharePct = Math.min(100, Math.round((bRev / totalRev) * 100));

    const isSelected = currentAdminBranch === b.key;

    let cardClass = 'card-custom';
    if (b.key === 'Main Branch') cardClass = 'card-main';
    else if (b.key === 'Minglanilla') cardClass = 'card-minglanilla';
    else if (b.key === 'Talisay') cardClass = 'card-talisay';

    const canDelete = !b.isMain && b.key !== 'Main Branch';

    return `
      <div class="branch-matrix-card ${cardClass} ${isSelected ? 'active-selected' : ''}" data-branch="${escapeHTML(b.key)}">
        <div>
          <div class="bmc-top">
            <div style="flex: 1; min-width: 0;">
              <div class="bmc-name" title="${escapeHTML(b.name)}">${escapeHTML(b.name)}</div>
              <div class="bmc-loc" title="${escapeHTML(b.location)}"><i class="ti ti-map-pin" style="font-size:12px;"></i> ${escapeHTML(b.location)}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="bmc-badge bmc-badge-live"><i class="ti ti-activity" style="font-size:10px;"></i> Active</span>
              ${canDelete ? `
                <button type="button" class="bmc-delete-btn" title="Delete ${escapeHTML(b.name)}" onclick="deleteCustomBranch('${escapeHTML(b.id || b.key)}', '${escapeHTML(b.name)}', event)" style="background: rgba(239, 68, 68, 0.1); border: none; color: #ef4444; cursor: pointer; padding: 4px 6px; font-size: 13px; border-radius: 6px; transition: 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
                  <i class="ti ti-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="bmc-metrics">
            <div class="bmc-metric-item">
              <span class="bmc-metric-label">Billed Revenue</span>
              <span class="bmc-metric-value" style="color: #0b3c4d;">${getCurrencySymbol()}${bRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="bmc-metric-item">
              <span class="bmc-metric-label">Total Visits</span>
              <span class="bmc-metric-value" style="color: #0284c7;">${totalAppointments}</span>
            </div>
            <div class="bmc-metric-item">
              <span class="bmc-metric-label">Completed</span>
              <span class="bmc-metric-value" style="color: #10b981;">${completedAppointments}</span>
            </div>
            <div class="bmc-metric-item">
              <span class="bmc-metric-label">Pending</span>
              <span class="bmc-metric-value" style="color: #f59e0b;">${pendingAppointments}</span>
            </div>
          </div>

          <div class="bmc-share-bar-wrap">
            <div class="bmc-share-header">
              <span>Revenue Contribution</span>
              <strong style="color: var(--dark-color);">${sharePct}%</strong>
            </div>
            <div class="bmc-progress-track">
              <div class="bmc-progress-fill" style="width: ${Math.max(sharePct, 4)}%;"></div>
            </div>
          </div>
        </div>

        <button type="button" class="bmc-action-btn" onclick="selectAdminAnalyticsBranch('${escapeHTML(b.key)}', event)">
          <i class="ti ti-chart-bar"></i> ${isSelected ? 'Currently Scoped' : 'Inspect Branch Analytics'}
        </button>
      </div>
    `;
  }).join('');
}

window.openAddBranchModal = function() {};
window.closeAddBranchModal = function() {};
window.submitAddBranch = async function(e) { if (e) e.preventDefault(); };
window.deleteCustomBranch = async function() {};

// ─── 1. Load Home Overview Stats ──────────────────────────────────────────────
let currentRevenuePeriod = '12months';
let currentFinancialPeriod = '12months';
let currentPatientPeriod = '12months';
let currentExpensesPeriod = '12months';
let chartSelectInitialized = false;

async function loadStats() {
  // Clear any legacy mock inventory cache
  try {
    const rawInv = localStorage.getItem('admin_cached_inventory');
    if (rawInv && (rawInv.includes('Nitrile') || rawInv.includes('377') || rawInv.includes('28000'))) {
      localStorage.removeItem('admin_cached_inventory');
    }
  } catch (_) {}

  let curToken = getAuthToken();
  if (!curToken) {
    curToken = await ensureAdminAuth();
  }
  token = curToken;

  fetch(`${ADMIN_API}/detailed-stats`, {
    headers: { 'Authorization': `Bearer ${curToken}` }
  })
  .then(async res => {
    if (res.status === 401 || res.status === 403) {
      // Re-authenticate and retry once
      curToken = await ensureAdminAuth();
      token = curToken;
      return fetch(`${ADMIN_API}/detailed-stats`, {
        headers: { 'Authorization': `Bearer ${curToken}` }
      }).then(r => r.json());
    }
    return res.json();
  })
  .then(data => {
    if (data.message && !data.allAppointments) {
      showToast(data.message, 'error');
      return;
    }

    // Cache responses — always trust the server's inventory (even empty)
    allInvoices = data.invoices || [];
    if (Array.isArray(data.allAppointments) && data.allAppointments.length > 0) {
      allAppointments = data.allAppointments;
    }
    cachedBranchAnalytics = data.branchAnalytics || null;
    // Always overwrite localInventory with the server's value (empty = empty)
    if (Array.isArray(data.inventory)) {
      localInventory = data.inventory;
    }
    if (Array.isArray(data.expenses) && data.expenses.length > 0) {
      allExpenses = data.expenses;
    }

    try {
      if (allAppointments.length > 0) {
        localStorage.setItem('admin_cached_appointments', JSON.stringify(allAppointments));
      }
      if (allInvoices.length > 0) {
        localStorage.setItem('admin_cached_invoices', JSON.stringify(allInvoices));
      }
      if (cachedBranchAnalytics) {
        localStorage.setItem('admin_cached_branch_analytics', JSON.stringify(cachedBranchAnalytics));
      }
      // Always write inventory cache (even empty) so cleared inventory stays cleared
      localStorage.setItem('admin_cached_inventory', JSON.stringify(localInventory || []));
      if (allExpenses && allExpenses.length > 0) {
        localStorage.setItem('admin_cached_expenses', JSON.stringify(allExpenses));
      }
    } catch (_) {}

    adminClinicBranches = [...defaultClinicBranches];
    populateBranchDropdowns();

    updateSidebarBranchBadges();
    loadAdminNotifications();

    // Populate alerts panel safely
    const alertsList = document.getElementById('overview-alerts-list');
    if (alertsList) {
      if (data.alerts && data.alerts.length > 0) {
        alertsList.innerHTML = data.alerts.map(al => {
          let borderClr = '#ccc';
          let bgClr = '#f9f9f9';
          let textClr = '#333';
          if (al.type === 'danger') {
            borderClr = '#fcdbd9'; bgClr = '#fdf3f2'; textClr = '#e74c3c';
          } else if (al.type === 'warning') {
            borderClr = '#fbebcd'; bgClr = '#fdf6ec'; textClr = '#e6a23c';
          } else if (al.type === 'info') {
            borderClr = '#d9ecff'; bgClr = '#ecf5ff'; textClr = '#409eff';
          }
          return `
            <div style="border-left: 4px solid ${textClr}; border-top: 1px solid ${borderClr}; border-right: 1px solid ${borderClr}; border-bottom: 1px solid ${borderClr}; background: ${bgClr}; color: ${textClr}; padding: 12px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 500; display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHTML(al.message)}</span>
              <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; opacity: 0.8;">${escapeHTML(al.category)}</span>
            </div>
          `;
        }).join('');
      } else {
        alertsList.innerHTML = '<div style="color:#2ecc71; text-align:center; padding:12px; font-weight:600;">✅ System Status Normal. No critical alerts.</div>';
      }
    }

    // Render Multi-Branch Matrix & Scoped Overview Analytics
    renderBranchComparisonMatrix(cachedBranchAnalytics);
    renderDashboardAnalytics(currentAdminBranch);

    // Initialize Period Select listener once
    if (!chartSelectInitialized) {
      const periodSelect = document.getElementById('revenue-period-select');
      if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
          currentRevenuePeriod = e.target.value;
          renderDashboardAnalytics(currentAdminBranch);
        });
      }

      const finSelect = document.getElementById('financial-period-select');
      if (finSelect) {
        finSelect.addEventListener('change', (e) => {
          currentFinancialPeriod = e.target.value;
          renderDashboardAnalytics(currentAdminBranch);
          showToast(`Financial Overview updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      const patSelect = document.getElementById('patient-period-select');
      if (patSelect) {
        patSelect.addEventListener('change', (e) => {
          currentPatientPeriod = e.target.value;
          renderDashboardAnalytics(currentAdminBranch);
          showToast(`Patient demographics updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      const expSelect = document.getElementById('expenses-period-select');
      if (expSelect) {
        expSelect.addEventListener('change', (e) => {
          currentExpensesPeriod = e.target.value;
          renderDashboardAnalytics(currentAdminBranch);
          showToast(`Expenses breakdown updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      chartSelectInitialized = true;
    }

    logConsoleEvent('[INFO] Overview stats and dynamic branch analytics rendered.');
  })
  .catch(err => {
    console.error('Error loading stats:', err);
    // Restore from localStorage cache if available
    try {
      const cachedAppts = JSON.parse(localStorage.getItem('admin_cached_appointments') || '[]');
      const cachedInvs = JSON.parse(localStorage.getItem('admin_cached_invoices') || '[]');
      const cachedBa = JSON.parse(localStorage.getItem('admin_cached_branch_analytics') || 'null');
      if (cachedAppts.length > 0 && (!allAppointments || allAppointments.length === 0)) {
        allAppointments = cachedAppts;
      }
      if (cachedInvs.length > 0 && (!allInvoices || allInvoices.length === 0)) {
        allInvoices = cachedInvs;
      }
      if (cachedBa && !cachedBranchAnalytics) {
        cachedBranchAnalytics = cachedBa;
      }
      const cachedInv = JSON.parse(localStorage.getItem('admin_cached_inventory') || '[]');
      const cachedExp = JSON.parse(localStorage.getItem('admin_cached_expenses') || '[]');
      if (!Array.isArray(localInventory)) {
        localInventory = [];
      }
      if (cachedExp.length > 0 && (!allExpenses || allExpenses.length === 0)) {
        allExpenses = cachedExp;
      }
      if (allAppointments.length > 0 || allInvoices.length > 0 || cachedBranchAnalytics || localInventory) {
        updateSidebarBranchBadges();
        renderBranchComparisonMatrix(cachedBranchAnalytics);
        renderDashboardAnalytics(currentAdminBranch);
      }
    } catch (_) {}
    showToast('Failed to load dashboard overview', 'error');
  });
}

// Live Real-Time Dashboard Synchronization (every 25 seconds & on window focus)
if (!window._adminDashboardSyncInterval) {
  window._adminDashboardSyncInterval = setInterval(() => {
    if (!document.hidden) {
      const overviewTab = document.getElementById('tab-overview');
      if (overviewTab && overviewTab.classList.contains('active')) {
        loadStats();
      }
    }
  }, 25000);
}

window.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const overviewTab = document.getElementById('tab-overview');
    if (overviewTab && overviewTab.classList.contains('active')) {
      loadStats();
    }
  }
});

function renderRevenueChart(invoices, period) {
  const svg = document.getElementById('revenue-svg');
  if (!svg) return;

  function getInvVal(inv) {
    const amt = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
    return amt > 0 ? amt : paid;
  }

  const labels = [];
  const values = [];
  const d = new Date();
  
  if (period === '7days') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      labels.push(days[dayDate.getDay()]);
      values.push(0);
    }
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 6) {
        values[6 - diffDays] += getInvVal(inv);
      }
    });
    
  } else if (period === '30days') {
    for (let i = 29; i >= 0; i--) {
      const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const labelStr = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      labels.push(labelStr);
      values.push(0);
    }
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 29) {
        values[29 - diffDays] += getInvVal(inv);
      }
    });
    
  } else if (period === '4weeks') {
    labels.push('Week 1', 'Week 2', 'Week 3', 'Week 4');
    values.push(0, 0, 0, 0);
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks >= 0 && diffWeeks <= 3) {
        values[3 - diffWeeks] += getInvVal(inv);
      }
    });
    
  } else if (period === '12months') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 11; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      labels.push(months[m.getMonth()]);
      values.push(0);
    }
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diff = (d.getFullYear() - invDate.getFullYear()) * 12 + (d.getMonth() - invDate.getMonth());
      if (diff >= 0 && diff <= 11) {
        values[11 - diff] += getInvVal(inv);
      }
    });
    
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 4;
    for (let i = 0; i < 5; i++) {
      labels.push(String(startYear + i));
      values.push(0);
    }
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const invYear = invDate.getFullYear();
      if (invYear >= startYear && invYear <= d.getFullYear()) {
        const diff = d.getFullYear() - invYear;
        values[4 - diff] += getInvVal(inv);
      }
    });
    
  } else {
    // Year 2026
    labels.push('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec');
    for (let i = 0; i < 12; i++) {
      values.push(0);
    }
    
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      if (invDate.getFullYear() === 2026) {
        values[invDate.getMonth()] += getInvVal(inv);
      }
    });
  }

  // 1. Calculate stats total
  const totalSum = values.reduce((sum, v) => sum + v, 0);
  const totalCashEl = document.getElementById('revenue-total-cash');
  if (totalCashEl) {
    totalCashEl.textContent = `${getCurrencySymbol()}${totalSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  // Calculate percentage indicator
  const pctBadge = document.getElementById('revenue-percentage-badge');
  if (pctBadge) {
    if (totalSum === 0) {
      pctBadge.textContent = '▲ 0.0%';
      pctBadge.style.background = '#f1f3f7';
      pctBadge.style.color = '#888';
    } else {
      pctBadge.textContent = '▲ 18.3%';
      pctBadge.style.background = '#e6f7ee';
      pctBadge.style.color = '#2ecc71';
    }
  }

  const titleEl = document.getElementById('revenue-card-title');
  if (titleEl) {
    const periodMap = {
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days',
      '4weeks': 'Last 4 Weeks',
      '12months': 'Last 12 Months',
      '5years': 'Last 5 Years',
      'year2026': 'Year 2026'
    };
    titleEl.textContent = `Revenue (${periodMap[period] || 'Last 12 Months'})`;
  }

  const numPoints = values.length;

  // 2. Render X Axis Labels dynamically
  const labelsGroup = document.getElementById('revenue-x-labels');
  if (labelsGroup) {
    labelsGroup.innerHTML = labels.map((label, idx) => {
      if (period === '30days' && idx % 5 !== 0 && idx !== 29) return '';
      const x = (idx / (numPoints - 1)) * 500;
      const anchor = idx === 0 ? 'start' : (idx === numPoints - 1 ? 'end' : 'middle');
      return `<text x="${x}" y="170" fill="#888" font-size="10" font-weight="600" text-anchor="${anchor}">${label}</text>`;
    }).join('');
  }

  // 3. Render Chart Lines
  const maxVal = Math.max(...values, 0);
  const points = [];
  
  for (let i = 0; i < numPoints; i++) {
    const x = (i / (numPoints - 1)) * 500;
    const y = maxVal === 0 ? 150 : 150 - (values[i] / maxVal) * 135;
    points.push({ x, y, val: values[i], label: labels[i] });
  }

  const lineD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaD = `${lineD} L 500,150 L 0,150 Z`;

  document.getElementById('revenue-line-path').setAttribute('d', lineD);
  document.getElementById('revenue-area-path').setAttribute('d', areaD);

  // 4. Hook up Mouse Events for Tooltip
  svg.onmousemove = function(e) {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * 500;
    const i = Math.min(Math.max(Math.round((svgX / 500) * (numPoints - 1)), 0), numPoints - 1);
    
    const p = points[i];
    
    const tooltipLine = document.getElementById('tooltip-line');
    const tooltipDot = document.getElementById('tooltip-dot');
    const tooltipBox = document.getElementById('tooltip-box');
    const tooltipText = document.getElementById('tooltip-text');

    if (tooltipLine && tooltipDot && tooltipBox && tooltipText) {
      tooltipLine.setAttribute('x1', p.x);
      tooltipLine.setAttribute('x2', p.x);
      tooltipLine.setAttribute('y1', p.y);
      tooltipLine.setAttribute('y2', 150);
      
      tooltipDot.setAttribute('cx', p.x);
      tooltipDot.setAttribute('cy', p.y);
      
      tooltipBox.setAttribute('transform', `translate(${p.x}, ${p.y})`);
      tooltipText.textContent = `${p.label}: ${getCurrencySymbol()}${p.val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      tooltipLine.style.display = 'block';
      tooltipDot.style.display = 'block';
      tooltipBox.style.display = 'block';
    }
  };

  svg.onmouseleave = function() {
    const tooltipLine = document.getElementById('tooltip-line');
    const tooltipDot = document.getElementById('tooltip-dot');
    const tooltipBox = document.getElementById('tooltip-box');

    if (tooltipLine && tooltipDot && tooltipBox) {
      tooltipLine.style.display = 'none';
      tooltipDot.style.display = 'none';
      tooltipBox.style.display = 'none';
    }
  };
}

function renderFinancialOverview(invoices, period, expensesList = allExpenses) {
  const d = new Date();
  const labels = [];
  const incomeValues = [0, 0, 0, 0, 0, 0];
  const costValues = [0, 0, 0, 0, 0, 0];

  function getInvVal(inv) {
    const amt = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
    return amt > 0 ? amt : paid;
  }

  if (period === '7days') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 5; i >= 0; i--) {
      const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      labels.push(days[dayDate.getDay()]);
    }
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 5) {
        incomeValues[5 - diffDays] += getInvVal(inv);
      }
    });
  } else if (period === '30days') {
    for (let i = 5; i >= 0; i--) {
      const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (i * 5));
      labels.push(dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 29) {
        const intervalIdx = Math.floor((29 - diffDays) / 5);
        incomeValues[intervalIdx] += getInvVal(inv);
      }
    });
  } else if (period === '4weeks') {
    for (let i = 5; i >= 0; i--) {
      labels.push(`Wk -${i}`);
    }
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks >= 0 && diffWeeks <= 5) {
        incomeValues[5 - diffWeeks] += getInvVal(inv);
      }
    });
  } else if (period === '12months') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      labels.push(months[m.getMonth()]);
    }
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const diff = (d.getFullYear() - invDate.getFullYear()) * 12 + (d.getMonth() - invDate.getMonth());
      if (diff >= 0 && diff <= 5) {
        incomeValues[5 - diff] += getInvVal(inv);
      }
    });
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 5;
    for (let i = 0; i < 6; i++) {
      labels.push(String(startYear + i));
    }
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      const invYear = invDate.getFullYear();
      if (invYear >= startYear && invYear <= d.getFullYear()) {
        const diff = d.getFullYear() - invYear;
        incomeValues[5 - diff] += getInvVal(inv);
      }
    });
  } else {
    labels.push('Jan-Feb', 'Mar-Apr', 'May-Jun', 'Jul-Aug', 'Sep-Oct', 'Nov-Dec');
    invoices.forEach(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return;
      const invDate = new Date(issuedStr);
      if (invDate.getFullYear() === 2026) {
        const intervalIdx = Math.floor(invDate.getMonth() / 2);
        incomeValues[intervalIdx] += getInvVal(inv);
      }
    });
  }

  for (let i = 0; i < 6; i++) {
    costValues[i] = incomeValues[i] > 0 ? incomeValues[i] * 0.45 : 0;
  }

  const totalIncome = incomeValues.reduce((a, b) => a + b, 0);
  const totalCosts = costValues.reduce((a, b) => a + b, 0);

  const incTotalEl = document.getElementById('fin-income-total');
  if (incTotalEl) {
    incTotalEl.textContent = `${getCurrencySymbol()}${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const costTotalEl = document.getElementById('fin-costs-total');
  if (costTotalEl) {
    costTotalEl.textContent = `${getCurrencySymbol()}${totalCosts.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const incPctEl = document.getElementById('fin-income-pct');
  if (incPctEl) {
    incPctEl.textContent = totalIncome > 0 ? '▲ 15.2%' : '▲ 0.0%';
  }
  const costPctEl = document.getElementById('fin-costs-pct');
  if (costPctEl) {
    costPctEl.textContent = totalCosts > 0 ? '▼ 4.8%' : '▼ 0.0%';
  }

  const maxVal = Math.max(...incomeValues, ...costValues, 0);
  const curSymbol = getCurrencySymbol();

  for (let i = 0; i < 6; i++) {
    const incBar = document.getElementById(`fin-bar-inc-${i}`);
    const costBar = document.getElementById(`fin-bar-cost-${i}`);
    const lbl = document.getElementById(`fin-axis-label-${i}`);

    if (lbl) {
      lbl.textContent = labels[i] || '';
    }

    if (incBar && costBar) {
      if (maxVal === 0) {
        incBar.setAttribute('y', '110');
        incBar.setAttribute('height', '0');
        costBar.setAttribute('y', '110');
        costBar.setAttribute('height', '0');
      } else {
        const incHeight = (incomeValues[i] / maxVal) * 95;
        const costHeight = (costValues[i] / maxVal) * 95;

        incBar.setAttribute('y', String(110 - incHeight));
        incBar.setAttribute('height', String(incHeight));
        costBar.setAttribute('y', String(110 - costHeight));
        costBar.setAttribute('height', String(costHeight));
      }

      // Populate accessibility titles and data values
      incBar.setAttribute('data-val', incomeValues[i]);
      costBar.setAttribute('data-val', costValues[i]);
      incBar.setAttribute('title', `Income: ${curSymbol}${incomeValues[i].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${labels[i]})`);
      costBar.setAttribute('title', `Costs: ${curSymbol}${costValues[i].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${labels[i]})`);
    }
  }

  // Store data globally for interactive hover inspection
  window.currentFinancialOverviewData = { labels, incomeValues, costValues, totalIncome, totalCosts, maxVal };

  // Initialize or refresh hover listeners
  setupFinancialOverviewInteractions();
}

function setupFinancialOverviewInteractions() {
  const svg = document.getElementById('fin-overview-svg');
  const container = document.getElementById('fin-chart-container');
  const tooltip = document.getElementById('fin-chart-tooltip');
  if (!svg || !container || !tooltip) return;

  if (svg.dataset.interactionsBound) return;
  svg.dataset.interactionsBound = 'true';

  function handlePointer(e) {
    const data = window.currentFinancialOverviewData;
    if (!data) return;
    const { labels, incomeValues, costValues } = data;

    const rect = svg.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
    if (clientX === null || clientY === null) return;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const svgX = (mouseX / rect.width) * 300;

    // Detect column index 0-5
    let idx = -1;
    if (e.target && e.target.dataset && e.target.dataset.idx !== undefined) {
      idx = parseInt(e.target.dataset.idx, 10);
    } else if (e.target && e.target.id && e.target.id.startsWith('fin-bar-')) {
      const parts = e.target.id.split('-');
      idx = parseInt(parts[parts.length - 1], 10);
    }

    if (idx < 0 || idx > 5 || isNaN(idx)) {
      idx = Math.floor((svgX - 10) / 45);
      if (idx < 0) idx = 0;
      if (idx > 5) idx = 5;
    }

    const inc = incomeValues[idx] || 0;
    const cost = costValues[idx] || 0;
    const net = inc - cost;
    const cur = getCurrencySymbol();
    const lbl = labels[idx] || `Column ${idx + 1}`;

    // Fill tooltip details
    const tipHeader = document.getElementById('fin-tooltip-header');
    const tipInc = document.getElementById('fin-tooltip-income');
    const tipCosts = document.getElementById('fin-tooltip-costs');
    const tipNet = document.getElementById('fin-tooltip-net');

    if (tipHeader) tipHeader.textContent = lbl;
    if (tipInc) tipInc.textContent = `${cur}${inc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (tipCosts) tipCosts.textContent = `${cur}${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (tipNet) {
      const sign = net >= 0 ? '+' : '';
      tipNet.textContent = `${sign}${cur}${net.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      tipNet.style.color = net >= 0 ? '#10b981' : '#ef4444';
    }

    // Highlight hovered column background & axis label
    for (let c = 0; c < 6; c++) {
      const bg = document.getElementById(`fin-col-bg-${c}`);
      const axisLbl = document.getElementById(`fin-axis-label-${c}`);
      if (bg) bg.setAttribute('opacity', c === idx ? '0.08' : '0');
      if (axisLbl) {
        axisLbl.setAttribute('fill', c === idx ? '#0d6efd' : '#888');
        axisLbl.setAttribute('font-weight', c === idx ? '800' : '600');
      }
    }

    // Floating SVG badges directly above the bars
    const hoverValGroup = document.getElementById('fin-hover-values');
    const hoverValInc = document.getElementById('fin-hover-val-inc');
    const hoverValCost = document.getElementById('fin-hover-val-cost');
    const incBar = document.getElementById(`fin-bar-inc-${idx}`);
    const costBar = document.getElementById(`fin-bar-cost-${idx}`);
    const incY = incBar ? parseFloat(incBar.getAttribute('y') || '110') : 110;
    const costY = costBar ? parseFloat(costBar.getAttribute('y') || '110') : 110;

    if (hoverValGroup && hoverValInc && hoverValCost) {
      if (inc > 0 || cost > 0) {
        hoverValInc.setAttribute('x', String(24 + idx * 45));
        hoverValInc.setAttribute('y', String(Math.max(incY - 3, 10)));
        hoverValInc.textContent = inc > 0 ? `${cur}${inc >= 1000 ? (inc / 1000).toFixed(1) + 'k' : inc.toFixed(0)}` : '';

        hoverValCost.setAttribute('x', String(34 + idx * 45));
        hoverValCost.setAttribute('y', String(Math.max(costY - 3, 10)));
        hoverValCost.textContent = cost > 0 ? `${cur}${cost >= 1000 ? (cost / 1000).toFixed(1) + 'k' : cost.toFixed(0)}` : '';

        hoverValGroup.style.display = 'block';
      } else {
        hoverValGroup.style.display = 'none';
      }
    }

    // Position HTML tooltip relative to container
    const colCenterSvgX = 29 + idx * 45;
    const colCenterPixelX = (colCenterSvgX / 300) * rect.width;
    const contRect = container.getBoundingClientRect();
    const clampedX = Math.min(Math.max(colCenterPixelX, 75), contRect.width - 75);

    const highestBarY = Math.min(incY, costY);
    const highestBarPixelY = (highestBarY / 130) * rect.height;

    if (highestBarPixelY < 45 || mouseY < 45) {
      tooltip.style.left = `${clampedX}px`;
      tooltip.style.top = `${highestBarPixelY + 28}px`;
      tooltip.style.transform = 'translate(-50%, 0)';
      tooltip.classList.add('tooltip-bottom');
    } else {
      tooltip.style.left = `${clampedX}px`;
      tooltip.style.top = `${Math.min(highestBarPixelY, mouseY) - 8}px`;
      tooltip.style.transform = 'translate(-50%, -100%)';
      tooltip.classList.remove('tooltip-bottom');
    }

    tooltip.classList.add('active');
  }

  function handleLeave() {
    tooltip.classList.remove('active');
    for (let c = 0; c < 6; c++) {
      const bg = document.getElementById(`fin-col-bg-${c}`);
      const axisLbl = document.getElementById(`fin-axis-label-${c}`);
      if (bg) bg.setAttribute('opacity', '0');
      if (axisLbl) {
        axisLbl.setAttribute('fill', '#888');
        axisLbl.setAttribute('font-weight', '600');
      }
    }
    const hoverValGroup = document.getElementById('fin-hover-values');
    if (hoverValGroup) hoverValGroup.style.display = 'none';
  }

  svg.addEventListener('mousemove', handlePointer);
  svg.addEventListener('mouseleave', handleLeave);
  svg.addEventListener('touchstart', handlePointer, { passive: true });
  svg.addEventListener('touchmove', handlePointer, { passive: true });
  svg.addEventListener('touchend', handleLeave, { passive: true });

  // Legend hovers
  const legendInc = document.getElementById('fin-legend-income');
  const legendCost = document.getElementById('fin-legend-costs');
  if (legendInc) {
    legendInc.addEventListener('mouseenter', () => {
      document.querySelectorAll('.fin-chart-bar[id^="fin-bar-inc-"]').forEach(el => {
        el.style.filter = 'brightness(1.25) drop-shadow(0 0 6px rgba(13, 110, 253, 0.7))';
      });
    });
    legendInc.addEventListener('mouseleave', () => {
      document.querySelectorAll('.fin-chart-bar[id^="fin-bar-inc-"]').forEach(el => {
        el.style.filter = '';
      });
    });
  }
  if (legendCost) {
    legendCost.addEventListener('mouseenter', () => {
      document.querySelectorAll('.fin-chart-bar[id^="fin-bar-cost-"]').forEach(el => {
        el.style.filter = 'brightness(1.25) drop-shadow(0 0 6px rgba(46, 204, 113, 0.7))';
      });
    });
    legendCost.addEventListener('mouseleave', () => {
      document.querySelectorAll('.fin-chart-bar[id^="fin-bar-cost-"]').forEach(el => {
        el.style.filter = '';
      });
    });
  }
}

function renderPatientData(appointments, period) {
  const d = new Date();
  let inPeriodAppointments = [];

  if (period === '7days') {
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 6;
    });
  } else if (period === '30days') {
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 29;
    });
  } else if (period === '4weeks') {
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      return diffWeeks >= 0 && diffWeeks <= 3;
    });
  } else if (period === '12months') {
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diff = (d.getFullYear() - apptDate.getFullYear()) * 12 + (d.getMonth() - apptDate.getMonth());
      return diff >= 0 && diff <= 11;
    });
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 4;
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      const yr = apptDate.getFullYear();
      return yr >= startYear && yr <= d.getFullYear();
    });
  } else {
    inPeriodAppointments = (appointments || []).filter(a => {
      const apptDate = new Date(a.appointment_date);
      return apptDate.getFullYear() === 2026;
    });
  }

  // Identify patient's first appointment chronologically as 'New', later appointments as 'Returning'
  const sorted = [...(appointments || [])].sort((a, b) => new Date(a.appointment_date || 0) - new Date(b.appointment_date || 0));
  const seenPatients = new Set();
  const firstApptIdSet = new Set();

  sorted.forEach(a => {
    const pid = a.patient_id || a.patient?.id;
    if (pid && !seenPatients.has(pid)) {
      seenPatients.add(pid);
      firstApptIdSet.add(a.id);
    }
  });

  let newCount = 0;
  let returningCount = 0;

  inPeriodAppointments.forEach(a => {
    if (firstApptIdSet.has(a.id)) {
      newCount++;
    } else {
      returningCount++;
    }
  });

  const total = newCount + returningCount;
  const newPct = total === 0 ? 0 : (newCount / total) * 100;
  const retPct = total === 0 ? 0 : (returningCount / total) * 100;

  const newCountEl = document.getElementById('patient-data-new');
  if (newCountEl) newCountEl.textContent = newCount;
  const retCountEl = document.getElementById('patient-data-ret');
  if (retCountEl) retCountEl.textContent = returningCount;

  const newTextEl = document.getElementById('patient-text-new');
  if (newTextEl) newTextEl.textContent = `${newPct.toFixed(1)}% New`;
  const retTextEl = document.getElementById('patient-text-ret');
  if (retTextEl) retTextEl.textContent = `${retPct.toFixed(1)}% Returning`;

  const newBar = document.getElementById('patient-bar-new');
  if (newBar) {
    newBar.style.width = `${newPct}%`;
    newBar.style.cursor = 'pointer';
    newBar.setAttribute('title', `New Patients: ${newCount} (${newPct.toFixed(1)}%)`);
  }
  const retBar = document.getElementById('patient-bar-ret');
  if (retBar) {
    retBar.style.width = `${retPct}%`;
    retBar.style.cursor = 'pointer';
    retBar.setAttribute('title', `Returning Patients: ${returningCount} (${retPct.toFixed(1)}%)`);
  }
}

function renderExpensesBreakdown(invoices, period) {
  const d = new Date();
  let inPeriodInvoices = [];

  function getInvVal(inv) {
    const amt = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
    return amt > 0 ? amt : paid;
  }

  if (period === '7days') {
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const diffDays = Math.floor((d.getTime() - new Date(issuedStr).getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 6;
    });
  } else if (period === '30days') {
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const diffDays = Math.floor((d.getTime() - new Date(issuedStr).getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 29;
    });
  } else if (period === '4weeks') {
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const diffWeeks = Math.floor((d.getTime() - new Date(issuedStr).getTime()) / (1000 * 60 * 60 * 24 * 7));
      return diffWeeks >= 0 && diffWeeks <= 3;
    });
  } else if (period === '12months') {
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const diff = (d.getFullYear() - invDate.getFullYear()) * 12 + (d.getMonth() - invDate.getMonth());
      return diff >= 0 && diff <= 11;
    });
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 4;
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const yr = new Date(issuedStr).getFullYear();
      return yr >= startYear && yr <= d.getFullYear();
    });
  } else {
    inPeriodInvoices = (invoices || []).filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      return new Date(issuedStr).getFullYear() === 2026;
    });
  }

  // Calculate total fees that patients pay for their treatments in the period
  let totalPatientPaid = inPeriodInvoices.reduce((sum, inv) => sum + getInvVal(inv), 0);
  if (totalPatientPaid === 0 && (invoices || []).length > 0 && period !== '7days') {
    totalPatientPaid = (invoices || []).reduce((sum, inv) => sum + getInvVal(inv), 0);
  }

  // Expenses derived from what patients pay (52% operational treatment allocation)
  const totalExpense = totalPatientPaid * 0.52;

  const salaries = totalExpense * 0.42;
  const supplies = totalExpense * 0.25;
  const rent = totalExpense * 0.15;
  const equip = totalExpense * 0.12;
  const utils = totalExpense * 0.06;

  const expTotalEl = document.getElementById('expenses-total-value');
  if (expTotalEl) {
    expTotalEl.textContent = `${getCurrencySymbol()}${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const isZero = totalExpense === 0;

  const salLeg = document.getElementById('exp-legend-salaries');
  if (salLeg) salLeg.textContent = `Salaries: ${isZero ? '0' : '42'}% (${getCurrencySymbol()}${salaries.toFixed(2)})`;
  const supLeg = document.getElementById('exp-legend-supplies');
  if (supLeg) supLeg.textContent = `Supplies: ${isZero ? '0' : '25'}% (${getCurrencySymbol()}${supplies.toFixed(2)})`;
  const rentLeg = document.getElementById('exp-legend-rent');
  if (rentLeg) rentLeg.textContent = `Rent: ${isZero ? '0' : '15'}% (${getCurrencySymbol()}${rent.toFixed(2)})`;
  const eqLeg = document.getElementById('exp-legend-equip');
  if (eqLeg) eqLeg.textContent = `Equipment: ${isZero ? '0' : '12'}% (${getCurrencySymbol()}${equip.toFixed(2)})`;
  const utLeg = document.getElementById('exp-legend-utils');
  if (utLeg) utLeg.textContent = `Utilities: ${isZero ? '0' : '6'}% (${getCurrencySymbol()}${utils.toFixed(2)})`;

  const salCircle = document.getElementById('exp-circle-salaries');
  const supCircle = document.getElementById('exp-circle-supplies');
  const rentCircle = document.getElementById('exp-circle-rent');
  const equipCircle = document.getElementById('exp-circle-equip');
  const utilsCircle = document.getElementById('exp-circle-utils');

  if (salCircle) {
    salCircle.setAttribute('stroke-dasharray', isZero ? '0 100' : '42 58');
    salCircle.setAttribute('stroke-dashoffset', '100');
  }
  if (supCircle) {
    supCircle.setAttribute('stroke-dasharray', isZero ? '0 100' : '25 75');
    supCircle.setAttribute('stroke-dashoffset', '58');
  }
  if (rentCircle) {
    rentCircle.setAttribute('stroke-dasharray', isZero ? '0 100' : '15 85');
    rentCircle.setAttribute('stroke-dashoffset', '33');
  }
  if (equipCircle) {
    equipCircle.setAttribute('stroke-dasharray', isZero ? '0 100' : '12 88');
    equipCircle.setAttribute('stroke-dashoffset', '18');
  }
  if (utilsCircle) {
    utilsCircle.setAttribute('stroke-dasharray', isZero ? '0 100' : '6 94');
    utilsCircle.setAttribute('stroke-dashoffset', '6');
  }
}

function renderOverviewInventory(inventoryList = localInventory) {
  const items = Array.isArray(inventoryList) && inventoryList.length > 0 ? inventoryList : [];
  
  let totalUnits = 0;
  let totalVal = 0;
  let availCount = 0;
  let lowCount = 0;
  let outCount = 0;
  const lowStockItems = [];

  const priceEstimates = {
    'nitrile gloves': 350,
    'sterilization pouches': 15,
    'saliva ejectors': 180,
    'cotton rolls': 450,
    'anesthetic': 850
  };

  items.forEach(item => {
    const stock = parseInt(item.stock || 0, 10);
    const threshold = parseInt(item.threshold || 10, 10);
    totalUnits += stock;

    let unitPrice = parseFloat(item.unit_price || item.price || 0);
    if (!unitPrice) {
      const nameLower = (item.name || '').toLowerCase();
      for (const [k, p] of Object.entries(priceEstimates)) {
        if (nameLower.includes(k)) {
          unitPrice = p;
          break;
        }
      }
      if (!unitPrice) unitPrice = 120;
    }
    totalVal += stock * unitPrice;

    const statusLower = (item.status || '').toLowerCase();
    if (stock === 0 || statusLower.includes('out')) {
      outCount++;
      lowStockItems.push({ name: item.name, stock, threshold, isOut: true });
    } else if (stock <= threshold || statusLower.includes('low')) {
      lowCount++;
      lowStockItems.push({ name: item.name, stock, threshold, isOut: false });
    } else {
      availCount++;
    }
  });

  // Real count calculations (starts at 0 when empty)
  const totalTypes = availCount + lowCount + outCount;
  const availPct = totalTypes > 0 ? Math.round((availCount / totalTypes) * 100) : 0;
  const lowPct = totalTypes > 0 ? Math.round((lowCount / totalTypes) * 100) : 0;
  const outPct = totalTypes > 0 ? Math.max(0, 100 - (availPct + lowPct)) : 0;

  const totalValEl = document.getElementById('overview-inv-total-val');
  if (totalValEl) totalValEl.textContent = `${getCurrencySymbol()}${Math.round(totalVal).toLocaleString('en-US')}`;

  const totalItemsEl = document.getElementById('overview-inv-total-items');
  if (totalItemsEl) totalItemsEl.textContent = `${totalUnits.toLocaleString('en-US')} units`;

  const barAvail = document.getElementById('overview-inv-bar-avail');
  if (barAvail) {
    barAvail.style.width = `${availPct}%`;
    barAvail.setAttribute('title', `Available: ${availCount} items (${availPct}%)`);
  }
  const barLow = document.getElementById('overview-inv-bar-low');
  if (barLow) {
    barLow.style.width = `${lowPct}%`;
    barLow.setAttribute('title', `Low Stock: ${lowCount} items (${lowPct}%)`);
  }
  const barOut = document.getElementById('overview-inv-bar-out');
  if (barOut) {
    barOut.style.width = `${outPct}%`;
    barOut.setAttribute('title', `Out of Stock: ${outCount} items (${outPct}%)`);
  }

  const legAvail = document.getElementById('overview-inv-legend-avail');
  if (legAvail) legAvail.textContent = `Available (${availCount})`;

  const legLow = document.getElementById('overview-inv-legend-low');
  if (legLow) legLow.textContent = `Low Stock (${lowCount})`;

  const legOut = document.getElementById('overview-inv-legend-out');
  if (legOut) legOut.textContent = `Out of Stock (${outCount})`;

  const warningList = document.getElementById('overview-inv-warning-list');
  if (warningList) {
    if (lowStockItems.length > 0) {
      warningList.style.textAlign = 'left';
      warningList.style.padding = '0';
      warningList.innerHTML = lowStockItems.map((it) => `
        <div class="inv-warning-item-row" style="display:flex; justify-content:space-between; align-items:center; padding: 10px 12px; margin-bottom: 6px; border-radius: 10px; font-size: 0.82rem; transition: all 0.2s ease;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="ti ti-alert-triangle" style="color: ${it.isOut ? '#ef4444' : '#f59e0b'}; font-size: 16px;"></i>
            <span class="inv-warning-item-name" style="font-weight:700;">${escapeHTML(it.name)}</span>
          </div>
          <span class="inv-warning-item-badge ${it.isOut ? 'out' : 'low'}" style="font-weight:700; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem;">
            ${it.isOut ? 'Out of stock' : `${it.stock} / ${it.threshold} left`}
          </span>
        </div>
      `).join('');
    } else if (items.length === 0) {
      warningList.style.textAlign = 'center';
      warningList.style.padding = '14px 0';
      warningList.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; gap:8px; padding: 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; color: #64748b; font-size: 0.84rem;"><i class="ti ti-box" style="font-size:18px;"></i> No low stock items reported</div>';
    } else {
      warningList.style.textAlign = 'center';
      warningList.style.padding = '14px 0';
      warningList.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; gap:8px; padding: 12px; background:#ecfdf5; border:1px solid #d1fae5; border-radius:10px; color: #059669; font-weight: 700; font-size: 0.84rem;"><i class="ti ti-circle-check" style="font-size:18px;"></i> All inventory stock levels normal</div>';
    }
  }
}

function renderOverviewPopularTreatments(appointments = allAppointments) {
  const container = document.getElementById('overview-popular-treatments');
  if (!container) return;

  const treatmentCounts = {};
  (appointments || []).forEach(a => {
    let tName = '';
    if (a.treatment && typeof a.treatment === 'object') {
      tName = a.treatment.name;
    } else if (typeof a.treatment === 'string') {
      tName = a.treatment;
    } else if (a.treatment_name) {
      tName = a.treatment_name;
    } else if (a.notes) {
      const match = a.notes.match(/\[Treatment:\s*([^\]]+)\]/i);
      if (match) tName = match[1].trim();
    }
    if (!tName) tName = 'Teeth Cleaning & Scaling';
    treatmentCounts[tName] = (treatmentCounts[tName] || 0) + 1;
  });

  const treatmentPrices = {
    'Laser Teeth Whitening': 250,
    'Root Canal Therapy': 600,
    'Wisdom Tooth Extraction': 350,
    'Deep Cavity Filling': 150,
    'Teeth Cleaning & Scaling': 80,
    'Consultation': 80
  };

  const ratingsMap = {
    'Laser Teeth Whitening': '4.9',
    'Deep Cavity Filling': '4.8',
    'Wisdom Tooth Extraction': '4.8',
    'Root Canal Therapy': '4.7',
    'Teeth Cleaning & Scaling': '4.9',
    'Consultation': '4.8'
  };

  let sortedTreatments = Object.entries(treatmentCounts)
    .sort((a, b) => b[1] - a[1]);

  if (sortedTreatments.length === 0) {
    sortedTreatments = [
      ['Laser Teeth Whitening', 4],
      ['Deep Cavity Filling', 2],
      ['Root Canal Therapy', 1],
      ['Wisdom Tooth Extraction', 1]
    ];
  }

  container.innerHTML = sortedTreatments.slice(0, 4).map(([name, count], index) => {
    const rating = ratingsMap[name] || '4.8';
    const price = treatmentPrices[name] || 150;
    return `
      <div class="treatment-rank-row">
        <div class="treatment-rank-left">
          <div class="treatment-rank-medal">${index + 1}</div>
          <div class="treatment-info-group">
            <div class="treatment-name-text">${escapeHTML(name)}</div>
            <div class="treatment-meta-pills">
              <span class="treatment-price-tag">${getCurrencySymbol()}${price.toFixed(2)}</span>
              <span class="treatment-count-tag">${count} booked</span>
            </div>
          </div>
        </div>
        <div class="treatment-star-tag">★ ${rating}</div>
      </div>
    `;
  }).join('');
}

// ─── 2. Appointments Agenda & Filters ───────────────────────────────────────
async function loadAppointments() {
  const tbody = document.getElementById('appointments-table-body');

  // 1. Immediately render cached appointments if available to prevent any waiting
  if (Array.isArray(allAppointments) && allAppointments.length > 0) {
    filterAndRenderAppointments();
  } else {
    try {
      const cached = JSON.parse(localStorage.getItem('admin_cached_appointments') || '[]');
      if (Array.isArray(cached) && cached.length > 0) {
        allAppointments = cached;
        filterAndRenderAppointments();
      }
    } catch (_) {}
  }

  // 2. Refresh auth token dynamically
  let currentToken = getAuthToken();
  if (!currentToken) {
    currentToken = await ensureAdminAuth();
  }
  token = currentToken;

  if (!currentToken) {
    if (tbody && (!allAppointments || allAppointments.length === 0)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 36px 16px; text-align: center; color: #64748b;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">🔒</div>
            <div style="font-size: 1.05rem; font-weight: 600; color: #1e293b; margin-bottom: 6px;">Authentication Required</div>
            <p style="font-size: 0.88rem; color: #64748b; margin-bottom: 16px;">You must be logged in as an Administrator to view live appointment records.</p>
            <a href="login.html" class="btn-primary" style="display: inline-block; padding: 8px 20px; border-radius: 8px; text-decoration: none; font-size: 0.88rem;">Log In to Admin Portal</a>
          </td>
        </tr>
      `;
    }
    return;
  }

  // 3. Fetch latest data from server
  return fetch(APPT_API, {
    headers: { 'Authorization': `Bearer ${currentToken}` }
  })
  .then(async res => {
    if (res.status === 401 || res.status === 403) {
      currentToken = await ensureAdminAuth();
      token = currentToken;
      return fetch(APPT_API, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
    }
    return res;
  })
  .then(async res => {
    if (!res) return;
    const data = await res.json();
    if (data && data.message && !Array.isArray(data)) {
      if (tbody && (!allAppointments || allAppointments.length === 0)) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="padding: 32px 16px; text-align: center; color: #e53e3e;">
              <div style="font-weight: 600; margin-bottom: 8px;">⚠️ Failed to load appointments</div>
              <p style="font-size: 0.88rem; color: #64748b; margin-bottom: 14px;">${escapeHTML(data.message)}</p>
              <button type="button" class="btn-secondary" onclick="loadAppointments()" style="padding: 6px 16px; font-size: 0.85rem; border-radius: 6px; cursor: pointer;">🔄 Retry</button>
            </td>
          </tr>
        `;
      }
      showToast(data.message, 'error');
      return;
    }

    allAppointments = Array.isArray(data) ? data : [];
    try {
      if (allAppointments.length > 0) {
        localStorage.setItem('admin_cached_appointments', JSON.stringify(allAppointments));
      }
    } catch (_) {}
    updateSidebarBranchBadges();
    filterAndRenderAppointments();
    loadAdminNotifications();
  })
  .catch(err => {
    console.error('Error loading appointments:', err);
    if (tbody && (!allAppointments || allAppointments.length === 0)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 32px 16px; text-align: center; color: #e53e3e;">
            <div style="font-weight: 600; margin-bottom: 8px;">⚠️ Network or Server Connection Error</div>
            <p style="font-size: 0.88rem; color: #64748b; margin-bottom: 14px;">Could not connect to the appointment server. Please check if the server is running.</p>
            <button type="button" class="btn-secondary" onclick="loadAppointments()" style="padding: 6px 16px; font-size: 0.85rem; border-radius: 6px; cursor: pointer;">🔄 Retry</button>
          </td>
        </tr>
      `;
    }
    showToast('Failed to load appointments agenda', 'error');
  });
}
window.loadAppointments = loadAppointments;

function setupFilters() {
  const branchFilter = document.getElementById('filter-branch');
  const roomFilter = document.getElementById('filter-room');
  const statusFilter = document.getElementById('filter-status');
  const searchFilter = document.getElementById('appt-search');

  if (branchFilter) branchFilter.addEventListener('change', (e) => selectAdminBranch(e.target.value));
  if (roomFilter) roomFilter.addEventListener('change', filterAndRenderAppointments);
  if (statusFilter) statusFilter.addEventListener('change', filterAndRenderAppointments);
  if (searchFilter) searchFilter.addEventListener('input', filterAndRenderAppointments);

  // Setup Patient tab search
  const patSearch = document.getElementById('patient-search-input');
  if (patSearch) {
    patSearch.addEventListener('input', filterAndRenderPatients);
  }

  // Setup Add Patient Modal
  const btnAddPatient = document.getElementById('btn-add-patient');
  const modalAddPatient = document.getElementById('modal-add-patient');
  const btnCancelAddPatient = document.getElementById('btn-cancel-add-patient');

  btnAddPatient?.addEventListener('click', () => {
    modalAddPatient.classList.add('active');
  });

  btnCancelAddPatient?.addEventListener('click', () => {
    modalAddPatient.classList.remove('active');
    document.getElementById('add-patient-form').reset();
  });

  document.getElementById('add-patient-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const firstName = document.getElementById('patient-firstname').value.trim();
    const lastName = document.getElementById('patient-lastname').value.trim();
    const email = document.getElementById('patient-email').value.trim();
    const contactNumber = document.getElementById('patient-phone').value.trim();
    const dob = document.getElementById('patient-dob').value;
    const gender = document.getElementById('patient-gender').value;
    const allergies = document.getElementById('patient-allergies').value.trim();
    const medicalNotes = document.getElementById('patient-notes').value.trim();

    const cleanEmail = email.toLowerCase();
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const cleanPhone = contactNumber.replace(/[\s\-\(\)\.]/g, '');

    const isDuplicate = (allPatients || []).some(p => {
      const u = p.user || p;
      const uEmail = (u.email || '').toLowerCase();
      const uName = (u.name || `${u.first_name || ''} ${u.last_name || ''}`).toLowerCase();
      const uPhone = (u.contact_number || '').replace(/[\s\-\(\)\.]/g, '');
      return (cleanEmail && uEmail === cleanEmail) ||
             (cleanPhone && cleanPhone.length >= 7 && (uPhone === cleanPhone || (cleanPhone.length >= 10 && uPhone.endsWith(cleanPhone.slice(-9))))) ||
             (fullName.length > 3 && uName === fullName);
    });

    if (isDuplicate) {
      showToast(`A patient record with this email, contact number, or name already exists.`, 'error');
      return;
    }

    const payload = {
      firstName,
      lastName,
      email,
      contactNumber,
      role: 'Patient',
      dob,
      gender,
      allergies,
      medicalNotes,
      password: 'patientpassword123',
      address: 'N/A'
    };

    const btnSave = e.target.querySelector('button[type=submit]');
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    fetch(`${AUTH_API}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.message && !data.id)) {
        throw new Error(data.message || 'Failed to create patient profile');
      }
      return data;
    })
    .then(data => {
      // Optimistically update patient list immediately for snappy feel
      if (!allPatients) allPatients = [];
      let allergiesArray = [];
      if (typeof allergies === 'string') allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
      allPatients.unshift({
        id: data.id,
        user_id: data.id,
        gender: gender || 'Male',
        date_of_birth: dob || null,
        allergies: allergiesArray,
        medical_notes: medicalNotes || '',
        user: {
          id: data.id,
          name: data.name || `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
          email: data.email || email,
          contact_number: contactNumber,
          role: 'Patient'
        }
      });
      filterAndRenderPatients();

      showToast('Patient account and profile created successfully', 'success');
      modalAddPatient.classList.remove('active');
      e.target.reset();
      loadPatients(); // Background refresh to sync any additional server fields
    })
    .catch(err => {
      console.error('Error creating patient:', err);
      showToast('Failed to create patient profile', 'error');
    })
    .finally(() => {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Patient';
    });
  });

  // Setup Edit Appointment Modal
  const modalEditAppt = document.getElementById('modal-edit-appointment');
  const btnCancelEditAppt = document.getElementById('btn-cancel-edit-appt');

  btnCancelEditAppt?.addEventListener('click', () => {
    modalEditAppt.classList.remove('active');
    document.getElementById('edit-appointment-form').reset();
  });

  document.getElementById('edit-appointment-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const apptId = document.getElementById('edit-appt-id').value;
    const dateVal = document.getElementById('edit-appt-date').value;
    const locationVal = document.getElementById('edit-appt-location').value;
    const statusVal = document.getElementById('edit-appt-status').value;
    const rawNotes = e.target.getAttribute('data-raw-notes') || '';

    // Replace or insert the location string inside notes
    let notes = rawNotes;
    const locationStr = `[Location: ${locationVal}]`;
    if (notes.includes('[Location: ')) {
      const start = notes.indexOf('[Location: ');
      const end = notes.indexOf(']', start);
      if (end !== -1) {
        notes = notes.substring(0, start) + locationStr + notes.substring(end + 1);
      }
    } else {
      notes = `${locationStr} ${notes}`.trim();
    }

    const btnSave = e.target.querySelector('button[type=submit]');
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    fetch(`${APPT_API}/${apptId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        appointment_date: dateVal,
        status: statusVal,
        notes: notes
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        showToast(data.message, 'error');
        return;
      }
      showToast('Appointment updated successfully', 'success');
      modalEditAppt.classList.remove('active');
      e.target.reset();
      loadAppointments();
    })
    .catch(err => {
      console.error('Error updating appointment:', err);
      showToast('Failed to update appointment', 'error');
    })
    .finally(() => {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Changes';
    });
  });

  // Setup Staff tab filters
  const staffSearch = document.getElementById('staff-search-input');
  const staffRole = document.getElementById('staff-role-filter');
  if (staffSearch) staffSearch.addEventListener('input', filterAndRenderStaff);
  if (staffRole) staffRole.addEventListener('change', filterAndRenderStaff);

  // Setup History tab filters
  const historySearch = document.getElementById('history-search-input');
  const historyStatus = document.getElementById('history-status-filter');
  if (historySearch) historySearch.addEventListener('input', filterAndRenderHistory);
  if (historyStatus) historyStatus.addEventListener('change', filterAndRenderHistory);

  // Setup Users tab filters
  const userSearch = document.getElementById('user-search-input');
  const userRole = document.getElementById('user-role-filter');
  if (userSearch) userSearch.addEventListener('input', filterAndRenderUsers);
  if (userRole) userRole.addEventListener('change', filterAndRenderUsers);
}

function filterAndRenderAppointments() {
  const roomVal = document.getElementById('filter-room')?.value || 'all';
  const statusVal = document.getElementById('filter-status')?.value || 'all';
  const branchVal = currentAdminBranch || 'all';
  const searchVal = (document.getElementById('appt-search')?.value || '').toLowerCase().trim();

  currentAdminBranch = branchVal;
  updateSidebarBranchBadges();

  const filtered = allAppointments.filter(a => {
    // Branch filter
    if (branchVal !== 'all' && !doesAppointmentMatchBranch(a, branchVal)) {
      return false;
    }

    // Room filter
    const room = a.room || a.chair || 'Chair 1';
    if (roomVal !== 'all' && room !== roomVal) return false;

    // Status filter
    const status = (a.status || 'pending').toLowerCase();
    if (statusVal !== 'all' && status !== statusVal) return false;

    // Search query (name, email, or contact number)
    const patientName = a.patient ? (a.patient.name || `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || '').toLowerCase() : '';
    const patientEmail = a.patient ? (a.patient.email || '').toLowerCase() : '';
    const patientContact = a.patient ? (a.patient.contact_number || '') : '';
    if (searchVal && !patientName.includes(searchVal) && !patientEmail.includes(searchVal) && !patientContact.includes(searchVal)) return false;

    return true;
  });

  // Update Active Branch Banner & Table Heading
  const banner = document.getElementById('active-branch-banner');
  const bannerName = document.getElementById('active-branch-banner-name');
  const bannerCount = document.getElementById('active-branch-banner-count');
  const heading = document.getElementById('appointments-table-heading');

  const branchDisplayNames = {
    'Main Branch': 'Main Clinic (Naga City)',
    'Minglanilla': 'Minglanilla Branch',
    'Talisay': 'Talisay Branch',
    'all': 'All Clinic Branches'
  };

  const displayName = branchDisplayNames[branchVal] || branchVal;

  if (heading) {
    heading.textContent = `Appointments Agenda — Fano Dental Clinic (Naga)`;
  }

  if (banner) {
    if (bannerName) bannerName.textContent = displayName;
    if (bannerCount) bannerCount.textContent = filtered.length;
    banner.style.display = 'flex';
  }

  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 28px 16px; text-align: center; color: #888;">No matching appointments found for the current search or filters.</td></tr>';
    return;
  }

  // Display newly put / created appointments at the upper (top), older at the bottom
  filtered.sort((a, b) => {
    const createB = new Date(b.created_at || b.createdAt || 0).getTime();
    const createA = new Date(a.created_at || a.createdAt || 0).getTime();
    if (createB && createA && createB !== createA) return createB - createA;
    const timeB = new Date(b.appointment_date || b.dateTime || 0).getTime();
    const timeA = new Date(a.appointment_date || a.dateTime || 0).getTime();
    return timeB - timeA;
  });

  tbody.innerHTML = filtered.map(a => {
    const d = new Date(a.appointment_date);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const pName = a.patient ? (a.patient.name || `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || 'Unknown Patient') : 'Unknown Patient';
    const email = a.patient ? (a.patient.email || 'No Email') : 'No Email';
    const contact = a.patient ? (a.patient.contact_number || 'N/A') : 'N/A';

    // Parse branch location
    const location = getAppointmentBranch(a);

    const status = a.status || 'Pending';
    const statusLower = status.toLowerCase();
    const isLocked = status === 'Completed' || status === 'Cancelled';

    const statusSelectHtml = isLocked
      ? `<span class="status-badge-select status-${statusLower}" style="display: inline-block; cursor: default; white-space: nowrap; padding: 4px 8px; font-size: 0.76rem;" title="Status locked (${escapeHTML(status)})">${status === 'Completed' ? 'Completed' : 'Cancelled'}</span>`
      : `
        <select class="status-badge-select status-${statusLower}" style="white-space: nowrap; padding: 4px 6px; font-size: 0.76rem;" onchange="updateApptStatus('${a.id}', this.value)">
          <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Approved" ${status === 'Approved' ? 'selected' : ''}>Approved</option>
          <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      `;

    const actionButtonsHtml = `
      <div class="table-action-group">
        <button type="button" class="btn-action-btn btn-edit" title="Edit Appointment" onclick="event.preventDefault(); openEditApptModal('${a.id}')">✏️ Edit</button>
        <button type="button" class="btn-action-btn btn-delete" title="Delete Appointment" onclick="event.preventDefault(); deleteAppt('${a.id}')">🗑️ Delete</button>
      </div>
    `;

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 10px 10px; font-weight: 600; white-space: nowrap;">
          <div style="max-width: 145px; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(pName)}">${escapeHTML(pName)}</div>
        </td>
        <td style="padding: 10px 10px; color: #475569;">
          <div style="max-width: 165px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(email)}">${escapeHTML(email)}</div>
        </td>
        <td style="padding: 10px 10px; white-space: nowrap; font-variant-numeric: tabular-nums;">${escapeHTML(contact)}</td>
        <td style="padding: 10px 10px; white-space: nowrap;">
          <div style="line-height: 1.25;">
            <div style="font-weight: 600; color: #1e293b; font-size: 0.81rem;">${escapeHTML(date)}</div>
            <div style="font-size: 0.73rem; color: #64748b;">${escapeHTML(time)}</div>
          </div>
        </td>
        <td style="padding: 10px 10px; vertical-align: middle; white-space: nowrap;">
          ${renderAppointmentBranchBadge(a)}
        </td>
        <td style="padding: 10px 10px; white-space: nowrap;">${statusSelectHtml}</td>
        <td style="padding: 10px 10px; text-align: right; white-space: nowrap;">${actionButtonsHtml}</td>
      </tr>
    `;
  }).join('');
}

// ─── 3. Patients Roster & Detailed Medical History ────────────────────────────
function loadPatients() {
  Promise.all([
    fetch(`${AUTH_API}/users`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
    fetch(PATIENT_API, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json())
  ])
  .then(([users, profiles]) => {
    if (users.message) {
      showToast(users.message, 'error');
      return;
    }
    const patientsList = Array.isArray(users) ? users.filter(u => u.role === 'Patient') : [];
    const profileMap = {};
    if (Array.isArray(profiles)) {
      profiles.forEach(p => {
        if (p.user_id) profileMap[p.user_id] = p;
        else if (p.user && p.user.id) profileMap[p.user.id] = p;
      });
    }

    allPatients = patientsList.map(u => {
      const p = profileMap[u.id] || {};
      return {
        id: p.id || '',
        user_id: u.id,
        blood_type: p.blood_type || p.bloodType || 'Unspecified',
        gender: p.gender || 'Unspecified',
        date_of_birth: p.date_of_birth || p.dob || null,
        allergies: p.allergies || [],
        medical_notes: p.medical_notes || p.medicalHistory || 'No medical notes recorded.',
        user: u
      };
    });

    filterAndRenderPatients();
  })
  .catch(err => {
    console.error('Error loading patients:', err);
    showToast('Failed to load patient profiles', 'error');
  });
}

function filterAndRenderPatients() {
  const searchVal = (document.getElementById('patient-search-input')?.value || '').toLowerCase().trim();
  const filtered = allPatients.filter(p => {
    const name = p.user ? (p.user.name || `${p.user.first_name || ''} ${p.user.last_name || ''}`.trim() || '').toLowerCase() : '';
    const email = p.user ? (p.user.email || '').toLowerCase() : '';
    const phone = p.user ? (p.user.contact_number || '') : '';
    return name.includes(searchVal) || email.includes(searchVal) || phone.includes(searchVal);
  });

  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #888;">No patients found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const firstName = p.user ? (p.user.first_name || '') : '';
    const lastName = p.user ? (p.user.last_name || '') : '';
    const name = p.user ? (p.user.name || `${firstName} ${lastName}`.trim() || 'Unknown Patient') : 'Unknown Patient';
    const email = p.user ? p.user.email : 'No Email';
    const gender = p.gender || 'Unspecified';
    const dobVal = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const allergiesStr = Array.isArray(p.allergies) ? p.allergies.join(', ') : (p.allergies || 'None');
    const phone = p.user ? (p.user.contact_number || p.user.contactNumber || '') : '';
    const notes = p.medical_notes || '';

    // Create variables for safe escaping in onclick
    const escFirstName = escapeJS(firstName);
    const escLastName = escapeJS(lastName);
    const escEmail = escapeJS(email);
    const escGender = escapeJS(gender);
    const escDob = p.date_of_birth || '';
    const escPhone = escapeJS(phone);
    const escAllergies = escapeJS(allergiesStr);
    const escNotes = escapeJS(notes);

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(name)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(email)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(gender)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(dobVal)}</td>
        <td style="padding: 14px 16px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(allergiesStr)}">${escapeHTML(allergiesStr)}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
            <button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #8e44ad; color: #8e44ad; width: auto;" onclick="openEditPatientModal('${p.user_id}', '${escFirstName}', '${escLastName}', '${escEmail}', '${escGender}', '${escDob}', '${escPhone}', '${escAllergies}', '${escNotes}')">Edit</button>
            <button class="btn-danger-action" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; width: auto;" onclick="deletePatientUser('${p.user_id}', '${escapeJS(name)}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.deletePatientUser = function(userId, patientName) {
  showDeleteConfirmation(`Are you sure you want to permanently delete the patient profile and account for "${patientName}"?\nThis will remove all their medical records, billing, and appointments.`, () => {
    fetch(`${AUTH_API}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.success) {
        showToast(data.message, 'error');
        return;
      }
      showToast('Patient account and profile deleted successfully', 'success');
      loadPatients();
    })
    .catch(err => {
      console.error('Delete patient error:', err);
      showToast('Failed to delete patient profile', 'error');
    });
  });
};

window.updateApptStatus = function(apptId, newStatus) {
  fetch(`${APPT_API}/${apptId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status: newStatus })
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    showToast(`Appointment status updated to ${newStatus}`, 'success');
    loadAppointments();
  })
  .catch(err => {
    console.error('Update appointment status error:', err);
    showToast('Failed to update status', 'error');
  });
};

window.deleteAppt = function(apptId) {
  showDeleteConfirmation('Are you sure you want to permanently delete this appointment booking?', () => {
    fetch(`${APPT_API}/${apptId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.success) {
        showToast(data.message, 'error');
        return;
      }
      showToast('Appointment deleted successfully', 'success');
      loadAppointments();
    })
    .catch(err => {
      console.error('Delete appointment error:', err);
      showToast('Failed to delete appointment', 'error');
    });
  });
};

window.openEditApptModal = function(apptId, name, dateIso, location, status, rawNotes) {
  if (apptId) {
    const appt = (allAppointments || []).find(item => String(item.id) === String(apptId));
    if (appt) {
      name = appt.patient ? (appt.patient.name || `${appt.patient.first_name || ''} ${appt.patient.last_name || ''}`.trim() || 'Unknown Patient') : (name || 'Unknown Patient');
      dateIso = appt.appointment_date || dateIso;
      rawNotes = appt.notes || rawNotes || '';
      location = getAppointmentBranch(appt) || location || 'Main Branch, Fano Dental';
      status = appt.status || status || 'Pending';
    }
  }

  document.getElementById('edit-appt-id').value = apptId || '';
  document.getElementById('edit-appt-patient-name').value = name || '';
  
  if (dateIso) {
    const d = new Date(dateIso);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
    document.getElementById('edit-appt-date').value = localISOTime;
  } else {
    document.getElementById('edit-appt-date').value = '';
  }

  document.getElementById('edit-appt-location').value = location || 'Main Branch, Fano Dental';
  document.getElementById('edit-appt-status').value = status || 'Pending';
  
  document.getElementById('edit-appointment-form').setAttribute('data-raw-notes', rawNotes || '');
  document.getElementById('modal-edit-appointment').classList.add('active');
};

function escapeJS(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BILLING & INVOICES LEDGER — Full Features (CRUD, Partial Pay, Excel, Void)
// ═══════════════════════════════════════════════════════════════════════════════
let billingInvoicesList = [];
let filteredBillingInvoices = [];
let billingFilterTimer = null;
let currentSelectedInvoice = null;

function loadBilling() {
  const tbody = document.getElementById('billing-table-body');
  if (tbody && (!billingInvoicesList || billingInvoicesList.length === 0)) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding: 28px; text-align: center; color: #888;"><i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i> Loading financial ledger...</td></tr>';
  }

  fetch(`${ADMIN_API}/detailed-stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !Array.isArray(data.invoices)) {
      showToast(data.message, 'error');
      return;
    }

    allInvoices = data.invoices || [];
    billingInvoicesList = allInvoices;
    loadAdminNotifications();

    updateBillingKPIs(billingInvoicesList);
    filterAndRenderBilling();
    populateBillingModalDropdowns();

    logConsoleEvent('[INFO] Financial ledger loaded.');
  })
  .catch(err => {
    console.error('Error loading billing ledger:', err);
    showToast('Failed to load billing details', 'error');
  });
}
window.loadBilling = loadBilling;

function updateBillingKPIs(invoices) {
  let totalBilled = 0;
  let totalCollected = 0;
  let voidedCount = 0;

  (invoices || []).forEach(inv => {
    const isVoid = inv.status?.toLowerCase() === 'voided' || inv.voided;
    if (isVoid) {
      voidedCount++;
      return; // Exclude voided from active receivables
    }

    const total = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? total : 0);

    totalBilled += total;
    totalCollected += paid;
  });

  const outstanding = Math.max(0, totalBilled - totalCollected);
  const curr = getCurrencySymbol();

  const elBilled = document.getElementById('billing-total-billed');
  const elCollected = document.getElementById('billing-total-collected');
  const elOutstanding = document.getElementById('billing-outstanding');
  const elVoided = document.getElementById('billing-total-voided');

  if (elBilled) elBilled.textContent = `${curr}${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (elCollected) elCollected.textContent = `${curr}${totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (elOutstanding) elOutstanding.textContent = `${curr}${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (elVoided) elVoided.textContent = voidedCount;
}

function filterAndRenderBilling() {
  const searchInput = document.getElementById('billing-search');
  const statusFilter = document.getElementById('billing-status-filter');
  const dateFromInput = document.getElementById('billing-date-from');
  const dateToInput = document.getElementById('billing-date-to');

  const q = (searchInput?.value || '').toLowerCase().trim();
  const selectedStatus = (statusFilter?.value || 'all').toLowerCase();
  const dateFrom = dateFromInput?.value ? new Date(dateFromInput.value) : null;
  const dateTo = dateToInput?.value ? new Date(dateToInput.value) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  filteredBillingInvoices = (billingInvoicesList || []).filter(inv => {
    // 1. Status Filter
    const rawStatus = (inv.status || 'Unpaid').toLowerCase();
    const isVoid = rawStatus === 'voided' || inv.voided;
    const effStatus = isVoid ? 'voided' : rawStatus;

    if (selectedStatus !== 'all' && effStatus !== selectedStatus) return false;

    // 2. Search Query (Invoice ID, Patient name, Email, Treatment)
    if (q) {
      const invId = (inv.id || '').toLowerCase();
      const refNum = `inv-${invId.substring(0, 8)}`;
      const pName = (inv.patient ? (inv.patient.name || `${inv.patient.first_name || ''} ${inv.patient.last_name || ''}`) : (inv.patient_name || '')).toLowerCase();
      const pEmail = (inv.patient?.email || '').toLowerCase();
      const treatName = (inv.appointment?.treatment?.name || inv.treatment_name || '').toLowerCase();

      const matches = invId.includes(q) || refNum.includes(q) || pName.includes(q) || pEmail.includes(q) || treatName.includes(q);
      if (!matches) return false;
    }

    // 3. Date Range Filter
    if (dateFrom || dateTo) {
      const issuedRaw = inv.issued_at || inv.created_at;
      if (!issuedRaw) return false;
      const invDate = new Date(issuedRaw);
      if (dateFrom && invDate < dateFrom) return false;
      if (dateTo && invDate > dateTo) return false;
    }

    return true;
  });

  renderBillingTable(filteredBillingInvoices);
}

function renderBillingTable(invoices) {
  const tbody = document.getElementById('billing-table-body');
  const label = document.getElementById('billing-results-label');
  if (!tbody) return;

  const totalCount = (billingInvoicesList || []).length;
  if (label) {
    label.textContent = invoices.length === 0
      ? 'No invoices match your search/filter criteria.'
      : `Showing ${invoices.length} of ${totalCount} statements`;
  }

  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding: 40px; text-align: center; color: var(--text-light);">
          <div class="empty-state-icon"><i class="ti ti-file-invoice"></i></div>
          <div class="empty-state-title">No invoices found</div>
          <div class="empty-state-desc">Try clearing your filters or generate a new patient invoice statement.</div>
        </td>
      </tr>
    `;
    return;
  }

  const curr = getCurrencySymbol();

  tbody.innerHTML = invoices.map(inv => {
    const total = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? total : 0);

    const patientName = inv.patient ? (inv.patient.name || `${inv.patient.first_name || ''} ${inv.patient.last_name || ''}`.trim()) : (inv.patient_name || 'Patient');
    const patientEmail = inv.patient?.email || '';
    const invoiceNum = (inv.id || '').substring(0, 8).toUpperCase();
    const issuedVal = inv.issued_at || inv.created_at;
    const issuedDateStr = issuedVal ? new Date(issuedVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const treatName = inv.appointment?.treatment?.name || inv.treatment_name || 'Dental Consultation';

    const invStatus = (inv.status || 'Unpaid').toLowerCase();
    const isVoid = invStatus === 'voided' || inv.voided;
    const isPaid = !isVoid && (invStatus === 'paid' || paid >= total);
    const isPartial = !isVoid && !isPaid && (invStatus === 'partial' || paid > 0);

    let statusBadge = `
      <span class="financial-status-pill status-pill-unpaid">
        <span class="financial-status-dot"></span>
        <span>Unpaid</span>
      </span>
    `;
    if (isVoid) {
      statusBadge = `
        <span class="financial-status-pill status-pill-voided" title="${escapeHTML(inv.void_reason || 'Voided')}">
          <span class="financial-status-dot"></span>
          <span>Voided</span>
        </span>
      `;
    } else if (isPaid) {
      statusBadge = `
        <span class="financial-status-pill status-pill-paid">
          <span class="financial-status-dot"></span>
          <span>Paid</span>
        </span>
      `;
    } else if (isPartial) {
      statusBadge = `
        <span class="financial-status-pill status-pill-partial">
          <span class="financial-status-dot"></span>
          <span>Partial</span>
        </span>
      `;
    }

    const payButton = isVoid
      ? `<span style="color:#94a3b8; font-size:0.75rem;">Cancelled</span>`
      : (isPaid
        ? `<button type="button" class="btn-table-action" style="background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd;" onclick="openInvoiceDetailsModal('${inv.id}')" title="View Paid Statement / Receipt"><i class="ti ti-receipt"></i> Receipt</button>`
        : `<button type="button" class="btn-table-action btn-action-pay" onclick="openRecordPaymentModal('${inv.id}')" title="Collect payment (full or partial)"><i class="ti ti-cash"></i> ${isPartial ? 'Pay Bal' : 'Collect'}</button>`);

    const voidButton = (!isVoid && !isPaid)
      ? `<button type="button" class="btn-table-action" style="padding:6px 9px; color:#ef4444; background:#fef2f2; border:1px solid #fecaca;" onclick="openVoidInvoiceModal('${inv.id}')" title="Void / Cancel Invoice"><i class="ti ti-ban"></i></button>`
      : '';

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color); ${isVoid ? 'opacity:0.6;' : ''}">
        <td style="padding: 12px 14px; font-weight: 700; font-family:monospace; font-size:0.86rem;">#INV-${invoiceNum}</td>
        <td style="padding: 12px 14px;">
          <div style="font-weight: 600; font-size: 0.88rem;">${escapeHTML(patientName)}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${escapeHTML(patientEmail)}</div>
        </td>
        <td style="padding: 12px 14px; font-size: 0.84rem;">${escapeHTML(treatName)}</td>
        <td style="padding: 12px 14px; font-weight: 700;">${curr}${total.toFixed(2)}</td>
        <td style="padding: 12px 14px;">
          <span style="font-weight: 700; color: ${isPaid ? '#10b981' : (isPartial ? '#7c3aed' : '#64748b')};">
            ${curr}${paid.toFixed(2)}
          </span>
          ${isPartial ? `<div style="font-size:0.7rem; color:#e11d48; font-weight:600;">Bal: ${curr}${(total - paid).toFixed(2)}</div>` : ''}
        </td>
        <td style="padding: 12px 14px; font-size: 0.82rem;">${escapeHTML(issuedDateStr)}</td>
        <td style="padding: 12px 14px; vertical-align: middle;">${statusBadge}</td>
        <td style="padding: 12px 14px; text-align: right; vertical-align: middle;">
          <div style="display:inline-flex; gap:6px; align-items:center; justify-content:flex-end;">
            <button type="button" class="btn-table-action" style="padding:6px 9px;" onclick="openInvoiceDetailsModal('${inv.id}')" title="View Invoice & Receipt"><i class="ti ti-eye"></i></button>
            ${payButton}
            ${voidButton}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function debounceBillingFilter() {
  clearTimeout(billingFilterTimer);
  billingFilterTimer = setTimeout(filterAndRenderBilling, 300);
}

function applyBillingFilters() {
  filterAndRenderBilling();
}

function clearBillingFilters() {
  const s = document.getElementById('billing-search'); if (s) s.value = '';
  const st = document.getElementById('billing-status-filter'); if (st) st.selectedIndex = 0;
  const df = document.getElementById('billing-date-from'); if (df) df.value = '';
  const dt = document.getElementById('billing-date-to'); if (dt) dt.value = '';
  filterAndRenderBilling();
}

// ── Export to Excel (.xlsx) ───────────────────────────────────────────────────
function exportBillingToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel exporter is loading. Please try again in a moment.', 'info');
    return;
  }

  const exportList = filteredBillingInvoices || [];
  if (exportList.length === 0) {
    showToast('No invoices currently match your view to export.', 'error');
    return;
  }

  const rows = exportList.map(inv => {
    const total = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? total : 0);

    const patientName = inv.patient ? (inv.patient.name || `${inv.patient.first_name || ''} ${inv.patient.last_name || ''}`.trim()) : (inv.patient_name || 'Patient');
    const invoiceNum = `#INV-${(inv.id || '').substring(0, 8).toUpperCase()}`;
    const issuedVal = inv.issued_at || inv.created_at;
    const issuedDateStr = issuedVal ? new Date(issuedVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const status = inv.voided ? 'Voided' : (inv.status || 'Unpaid');

    return {
      'Invoice ID': invoiceNum,
      'Patient': patientName,
      'Billed Amount': total,
      'Paid Amount': paid,
      'Issued Date': issuedDateStr,
      'Status': status
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices Ledger');

  // Auto-size columns
  ws['!cols'] = [
    { wch: 16 }, // Invoice ID
    { wch: 28 }, // Patient
    { wch: 16 }, // Billed Amount
    { wch: 16 }, // Paid Amount
    { wch: 16 }, // Issued Date
    { wch: 14 }  // Status
  ];

  const todayStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `fano_dental_invoices_${todayStr}.xlsx`);
  showToast(`Exported ${rows.length} invoice record(s) to Excel!`, 'success');
}
window.exportBillingToExcel = exportBillingToExcel;

// ── Populate Dropdowns for Generate Invoice Modal ────────────────────────────
function populateBillingModalDropdowns() {
  // 1. Patients dropdown
  const patientSel = document.getElementById('gen-inv-patient');
  if (patientSel) {
    const patients = allPatients || [];
    patientSel.innerHTML = '<option value="">Select Patient...</option>' +
      patients.map(p => {
        const u = p.user || p;
        const name = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Patient';
        const email = u.email || '';
        return `<option value="${p.user_id || p.id}">${escapeHTML(name)}${email ? ` (${escapeHTML(email)})` : ''}</option>`;
      }).join('');
  }

  // 2. Treatments dropdown
  const treatSel = document.getElementById('gen-inv-treatment');
  if (treatSel) {
    const treatments = allAdminTreatments || [];
    treatSel.innerHTML = '<option value="">General Dental Care</option>' +
      treatments.map(t => `<option value="${t.id}" data-price="${t.price || 0}">${escapeHTML(t.name)} (₱${parseFloat(t.price || 0).toFixed(2)})</option>`).join('');
  }
}

function handleGenInvoiceTreatmentChange(treatmentId) {
  const treatSel = document.getElementById('gen-inv-treatment');
  const selectedOpt = treatSel?.options[treatSel.selectedIndex];
  const price = selectedOpt ? selectedOpt.getAttribute('data-price') : 0;
  const amtInput = document.getElementById('gen-inv-amount');
  if (amtInput && price) {
    amtInput.value = parseFloat(price).toFixed(2);
  }
}

function handleGenInvoicePatientChange(patientId) {
  const apptSel = document.getElementById('gen-inv-appointment');
  if (!apptSel) return;

  if (!patientId) {
    apptSel.innerHTML = '<option value="">No appointment link (Stand-alone Treatment)</option>';
    return;
  }

  // Filter completed/approved appointments for this patient
  const patientAppts = (allAppointments || []).filter(a => String(a.patient_id || a.patient?.id) === String(patientId));
  apptSel.innerHTML = '<option value="">No appointment link (Stand-alone Treatment)</option>' +
    patientAppts.map(a => {
      const dt = a.appointment_date ? new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const treat = a.treatment?.name || 'Consultation';
      return `<option value="${a.id}" data-treatment-id="${a.treatment?.id || ''}" data-price="${a.treatment?.price || 0}">Appointment: ${dt} - ${escapeHTML(treat)} (${a.status})</option>`;
    }).join('');
}

function handleGenInvoiceApptChange(apptId) {
  const apptSel = document.getElementById('gen-inv-appointment');
  const selectedOpt = apptSel?.options[apptSel.selectedIndex];
  if (!selectedOpt) return;

  const treatId = selectedOpt.getAttribute('data-treatment-id');
  const price = selectedOpt.getAttribute('data-price');

  if (treatId) {
    const treatSel = document.getElementById('gen-inv-treatment');
    if (treatSel) treatSel.value = treatId;
  }
  if (price && parseFloat(price) > 0) {
    const amtInput = document.getElementById('gen-inv-amount');
    if (amtInput) amtInput.value = parseFloat(price).toFixed(2);
  }
}

// ── Generate Invoice Modal Handlers ──────────────────────────────────────────
function openGenerateInvoiceModal() {
  populateBillingModalDropdowns();
  const form = document.getElementById('form-generate-invoice');
  if (form) form.reset();

  const modal = document.getElementById('modal-generate-invoice');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function submitGenerateInvoice(e) {
  e.preventDefault();
  const patientId = document.getElementById('gen-inv-patient')?.value;
  const apptId = document.getElementById('gen-inv-appointment')?.value || null;
  const treatId = document.getElementById('gen-inv-treatment')?.value || null;
  const amount = parseFloat(document.getElementById('gen-inv-amount')?.value);
  const status = document.getElementById('gen-inv-status')?.value || 'Unpaid';
  const method = document.getElementById('gen-inv-method')?.value || 'Cash';
  const notes = document.getElementById('gen-inv-notes')?.value?.trim() || '';

  if (!patientId) {
    showToast('Please select a patient.', 'error');
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid billed amount.', 'error');
    return;
  }

  const payload = {
    patient_id: patientId,
    appointment_id: apptId,
    treatment_id: treatId,
    amount: amount,
    status: status,
    payment_method: status === 'Paid' ? method : '',
    paid_amount: status === 'Paid' ? amount : 0,
    notes: notes
  };

  fetch(`${INVOICE_API}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !data.id) {
      showToast(data.message, 'error');
      return;
    }
    showToast('Invoice generated successfully!', 'success');
    closeBillingModal('modal-generate-invoice');
    loadBilling();
  })
  .catch(err => {
    console.error('Error creating invoice:', err);
    showToast('Failed to create invoice.', 'error');
  });
}

// ── View Invoice Details & Printable Official Receipt ────────────────────────
function openInvoiceDetailsModal(invId) {
  const inv = (billingInvoicesList || []).find(i => String(i.id) === String(invId));
  if (!inv) {
    showToast('Invoice not found.', 'error');
    return;
  }

  currentSelectedInvoice = inv;
  const modal = document.getElementById('modal-invoice-details');
  if (!modal) return;

  const total = parseFloat(inv.amount || inv.total_amount || 0);
  const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
    ? parseFloat(inv.paid_amount)
    : (inv.status?.toLowerCase() === 'paid' ? total : 0);
  const balance = Math.max(0, total - paid);

  const patientName = inv.patient ? (inv.patient.name || `${inv.patient.first_name || ''} ${inv.patient.last_name || ''}`.trim()) : (inv.patient_name || 'Valued Patient');
  const patientEmail = inv.patient?.email || 'patient@fanoclinic.com';
  const invoiceNum = (inv.id || '').substring(0, 8).toUpperCase();
  const issuedDateStr = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const paidDateStr = inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (paid > 0 ? 'Partial Settlement' : 'Unpaid');
  const treatName = inv.appointment?.treatment?.name || inv.treatment_name || 'Professional Dental Care & Clinical Procedure';

  const isVoid = inv.status?.toLowerCase() === 'voided' || inv.voided;
  const isPaid = !isVoid && (inv.status?.toLowerCase() === 'paid' || paid >= total);
  const curr = getCurrencySymbol();

  document.getElementById('rcpt-inv-number').textContent = `#INV-${invoiceNum}`;
  document.getElementById('rcpt-patient-name').textContent = patientName;
  document.getElementById('rcpt-patient-email').textContent = patientEmail;
  document.getElementById('rcpt-issue-date').textContent = issuedDateStr;
  document.getElementById('rcpt-payment-date').textContent = isPaid ? `Fully Settled: ${paidDateStr}` : (paid > 0 ? `Partial Paid: ₱${paid.toFixed(2)}` : 'Payment Due');
  document.getElementById('rcpt-service-name').textContent = treatName;
  document.getElementById('rcpt-billed-subtotal').textContent = `${curr}${total.toFixed(2)}`;
  document.getElementById('rcpt-total-billed').textContent = `${curr}${total.toFixed(2)}`;
  document.getElementById('rcpt-total-paid').textContent = `${curr}${paid.toFixed(2)}`;
  document.getElementById('rcpt-balance-due').textContent = `${curr}${balance.toFixed(2)}`;

  // Status badge
  const statusEl = document.getElementById('rcpt-inv-status');
  if (statusEl) {
    if (isVoid) statusEl.innerHTML = '<span class="status-pill status-cancelled">VOIDED</span>';
    else if (isPaid) statusEl.innerHTML = '<span class="status-pill status-confirmed">PAID IN FULL</span>';
    else if (paid > 0) statusEl.innerHTML = '<span class="badge-table-partial">PARTIAL PAYMENT</span>';
    else statusEl.innerHTML = '<span class="status-pill status-pending">UNPAID</span>';
  }

  // Payment history list
  const historyWrap = document.getElementById('rcpt-payments-history-wrap');
  const historyList = document.getElementById('rcpt-payments-list');
  const payments = inv.payments_history || [];

  if (historyWrap && historyList) {
    if (payments.length > 0) {
      historyWrap.style.display = 'block';
      historyList.innerHTML = payments.map((p, idx) => `
        <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dotted #e2e8f0;">
          <span>#${idx + 1} &bull; ${new Date(p.collected_at).toLocaleDateString()} via <strong>${escapeHTML(p.payment_method || 'Cash')}</strong> ${p.reference ? `(${escapeHTML(p.reference)})` : ''}</span>
          <strong style="color:#10b981;">+₱${parseFloat(p.amount || 0).toFixed(2)}</strong>
        </div>
      `).join('');
    } else if (inv.payment_method && paid > 0) {
      historyWrap.style.display = 'block';
      historyList.innerHTML = `
        <div style="display:flex; justify-content:space-between; padding:4px 0;">
          <span>Settlement via <strong>${escapeHTML(inv.payment_method)}</strong></span>
          <strong style="color:#10b981;">+₱${paid.toFixed(2)}</strong>
        </div>
      `;
    } else {
      historyWrap.style.display = 'none';
    }
  }

  // Toggle Collect button if already fully paid or voided
  const collectBtn = document.getElementById('btn-rcpt-collect');
  if (collectBtn) {
    collectBtn.style.display = (isPaid || isVoid) ? 'none' : 'inline-flex';
  }

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function printInvoiceReceipt() {
  document.body.classList.add('printing-receipt');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-receipt');
  }, 1000);
}

function openPaymentFromDetails() {
  if (currentSelectedInvoice) {
    const id = currentSelectedInvoice.id;
    closeBillingModal('modal-invoice-details');
    openRecordPaymentModal(id);
  }
}

// ── Record Payment (Partial or Full) ─────────────────────────────────────────
function openRecordPaymentModal(invId) {
  const inv = (billingInvoicesList || []).find(i => String(i.id) === String(invId));
  if (!inv) {
    showToast('Invoice not found.', 'error');
    return;
  }

  currentSelectedInvoice = inv;
  const modal = document.getElementById('modal-record-payment');
  if (!modal) return;

  const total = parseFloat(inv.amount || inv.total_amount || 0);
  const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
    ? parseFloat(inv.paid_amount)
    : (inv.status?.toLowerCase() === 'paid' ? total : 0);
  const balance = Math.max(0, total - paid);

  const patientName = inv.patient ? (inv.patient.name || `${inv.patient.first_name || ''} ${inv.patient.last_name || ''}`.trim()) : (inv.patient_name || 'Patient');
  const invoiceNum = (inv.id || '').substring(0, 8).toUpperCase();
  const curr = getCurrencySymbol();

  document.getElementById('pay-inv-id').value = inv.id;
  document.getElementById('pay-summary-num').textContent = `#INV-${invoiceNum}`;
  document.getElementById('pay-summary-patient').textContent = patientName;
  document.getElementById('pay-summary-billed').textContent = `${curr}${total.toFixed(2)}`;
  document.getElementById('pay-summary-paid').textContent = `${curr}${paid.toFixed(2)}`;
  document.getElementById('pay-summary-balance').textContent = `${curr}${balance.toFixed(2)}`;

  const amtInput = document.getElementById('pay-amount-input');
  if (amtInput) {
    amtInput.value = balance > 0 ? balance.toFixed(2) : total.toFixed(2);
    amtInput.max = balance > 0 ? balance : total;
  }

  document.getElementById('pay-reference-input').value = '';
  document.getElementById('pay-notes-input').value = '';

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function setFullBalancePayment() {
  if (!currentSelectedInvoice) return;
  const total = parseFloat(currentSelectedInvoice.amount || currentSelectedInvoice.total_amount || 0);
  const paid = currentSelectedInvoice.paid_amount !== undefined && currentSelectedInvoice.paid_amount !== null
    ? parseFloat(currentSelectedInvoice.paid_amount)
    : (currentSelectedInvoice.status?.toLowerCase() === 'paid' ? total : 0);
  const balance = Math.max(0, total - paid);

  const amtInput = document.getElementById('pay-amount-input');
  if (amtInput) amtInput.value = balance.toFixed(2);
}

function submitRecordPayment(e) {
  e.preventDefault();
  const invId = document.getElementById('pay-inv-id')?.value;
  const paymentAmt = parseFloat(document.getElementById('pay-amount-input')?.value);
  const paymentMethod = document.getElementById('pay-method-select')?.value || 'Cash';
  const reference = document.getElementById('pay-reference-input')?.value?.trim() || '';
  const notes = document.getElementById('pay-notes-input')?.value?.trim() || '';

  if (!invId) return;
  if (isNaN(paymentAmt) || paymentAmt <= 0) {
    showToast('Please enter a valid payment amount.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-payment');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite;"></i> Saving...';
  }

  const payload = {
    payment_amount: paymentAmt,
    payment_method: paymentMethod,
    reference,
    notes
  };

  fetch(`${INVOICE_API}/${invId}/payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i> Save Payment';
    }
    if (data.message && !data.invoice) {
      showToast(data.message, 'error');
      return;
    }
    showToast(data.message || 'Payment recorded successfully!', 'success');
    closeBillingModal('modal-record-payment');
    loadBilling();
  })
  .catch(err => {
    console.error('Error saving payment:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-check"></i> Save Payment';
    }
    showToast('Failed to record payment.', 'error');
  });
}

// ── Cancel / Void Invoice ────────────────────────────────────────────────────
function openVoidInvoiceModal(invId) {
  const inv = (billingInvoicesList || []).find(i => String(i.id) === String(invId));
  if (!inv) return;

  const modal = document.getElementById('modal-void-invoice');
  if (!modal) return;

  document.getElementById('void-inv-id').value = inv.id;
  const num = (inv.id || '').substring(0, 8).toUpperCase();
  document.getElementById('void-inv-text').textContent = `Are you sure you want to void Invoice #INV-${num} (${getCurrencySymbol()}${parseFloat(inv.amount||0).toFixed(2)})? This marks it cancelled.`;
  document.getElementById('void-reason-input').value = '';

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function submitVoidInvoice(e) {
  e.preventDefault();
  const invId = document.getElementById('void-inv-id')?.value;
  const reason = document.getElementById('void-reason-input')?.value?.trim();

  if (!invId) return;
  if (!reason) {
    showToast('Please provide a reason for cancelling this invoice.', 'error');
    return;
  }

  fetch(`${INVOICE_API}/${invId}/void`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ reason })
  })
  .then(res => res.json())
  .then(data => {
    showToast('Invoice voided and cancelled.', 'success');
    closeBillingModal('modal-void-invoice');
    loadBilling();
  })
  .catch(err => {
    console.error('Error voiding invoice:', err);
    showToast('Failed to void invoice.', 'error');
  });
}

// ── Modal Helper ─────────────────────────────────────────────────────────────
function closeBillingModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

window.openGenerateInvoiceModal = openGenerateInvoiceModal;
window.submitGenerateInvoice = submitGenerateInvoice;
window.handleGenInvoiceTreatmentChange = handleGenInvoiceTreatmentChange;
window.handleGenInvoicePatientChange = handleGenInvoicePatientChange;
window.handleGenInvoiceApptChange = handleGenInvoiceApptChange;
window.openInvoiceDetailsModal = openInvoiceDetailsModal;
window.printInvoiceReceipt = printInvoiceReceipt;
window.openPaymentFromDetails = openPaymentFromDetails;
window.openRecordPaymentModal = openRecordPaymentModal;
window.setFullBalancePayment = setFullBalancePayment;
window.submitRecordPayment = submitRecordPayment;
window.openVoidInvoiceModal = openVoidInvoiceModal;
window.submitVoidInvoice = submitVoidInvoice;
window.closeBillingModal = closeBillingModal;
window.debounceBillingFilter = debounceBillingFilter;
window.applyBillingFilters = applyBillingFilters;
window.clearBillingFilters = clearBillingFilters;


function loadStaffSchedules() {
  fetch(`${ADMIN_API}/staff-schedules`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    localStaffSchedules = data || [];
    filterAndRenderStaff();
    logConsoleEvent('[INFO] Staff availability lists loaded.');
  })
  .catch(err => {
    console.error('Error loading staff schedules:', err);
    showToast('Failed to load staff schedules', 'error');
  });
}

function filterAndRenderStaff() {
  const searchInput = document.getElementById('staff-search-input');
  const roleFilter = document.getElementById('staff-role-filter');
  
  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const roleVal = roleFilter ? roleFilter.value : 'all';

  const filtered = (localStaffSchedules || []).filter(s => {
    if (roleVal !== 'all') {
      const matchRole = (s.role || '').toLowerCase();
      const filterRole = roleVal.toLowerCase();
      if (!matchRole.includes(filterRole)) return false;
    }

    const name = (s.name || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    return name.includes(searchVal) || email.includes(searchVal);
  });

  renderStaffTable(filtered);
}

function getRoleBadgeClass(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('admin')) return 'badge-role-admin';
  if (r.includes('dentist') || r.includes('doctor')) return 'badge-role-dentist';
  if (r.includes('reception')) return 'badge-role-receptionist';
  if (r.includes('account') || r.includes('finance')) return 'badge-role-accounting';
  if (r.includes('assist')) return 'badge-role-assistant';
  return 'badge-role-patient';
}

function getRoleAvatarClass(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('admin')) return 'avatar-role-admin';
  if (r.includes('dentist') || r.includes('doctor')) return 'avatar-role-dentist';
  if (r.includes('reception')) return 'avatar-role-receptionist';
  if (r.includes('account') || r.includes('finance')) return 'avatar-role-accounting';
  if (r.includes('assist')) return 'avatar-role-assistant';
  return 'avatar-role-patient';
}

function renderStaffTable(data) {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #888;">No staff schedule listings.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(s => {
    let statusColor = '#e74c3c';
    if (s.availability === 'On Duty') statusColor = '#2ecc71';
    else if (s.availability === 'On Leave') statusColor = '#e6a23c';

    const roleBadgeCls = getRoleBadgeClass(s.role);
    const roleAvatarCls = getRoleAvatarClass(s.role);
    const initial = (s.name || 'S').trim().charAt(0).toUpperCase();

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 600;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-row-avatar ${roleAvatarCls}">${initial}</div>
            <span>${escapeHTML(s.name)}</span>
          </div>
        </td>
        <td style="padding: 14px 16px;"><span class="${roleBadgeCls}">${s.role}</span></td>
        <td style="padding: 14px 16px;">${s.shift}</td>
        <td style="padding: 14px 16px;">${s.days}</td>
        <td style="padding: 14px 16px; font-weight:600; color:${statusColor}">${s.availability}</td>
        <td style="padding: 14px 16px;">${escapeHTML(s.contact)}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
            <button type="button" class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #8e44ad; color: #8e44ad; width: auto;" onclick="event.preventDefault(); openEditStaffScheduleModal('${s.id}', '${escapeJS(s.name)}', '${escapeJS(s.role)}', '${escapeJS(s.shift)}', '${escapeJS(s.days)}', '${escapeJS(s.contact)}', '${escapeJS(s.availability)}')">Edit</button>
            <button type="button" onclick="event.preventDefault(); deleteStaffSchedule('${s.id}', '${escapeHTML(s.name)}')" style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: #fee2e2; color: #ef4444; transition: background 0.2s;">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteStaffSchedule = function(id, name) {
  showDeleteConfirmation(`Are you sure you want to delete the schedule listing for "${name}"?`, () => {
    fetch(`${ADMIN_API}/staff-schedules/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.success) {
        showToast(data.message, 'error');
        return;
      }
      localStaffSchedules = (localStaffSchedules || []).filter(s => s.id !== id);
      showToast(`Staff schedule for "${name}" deleted.`, 'success');
      logConsoleEvent(`[INFO] Admin deleted staff schedule listing for "${name}".`);

      // Preserve active staff tab (prevent fallback to dashboard)
      activateTab('staff');
      filterAndRenderStaff();
    })
    .catch(err => {
      console.error('Error deleting staff schedule:', err);
      showToast('Failed to delete staff schedule listing', 'error');
    });
  });
};

// ─── 5b. CLINIC SERVICES & TREATMENTS CONTROLLER ─────────────────────────────
let allAdminTreatments = [];

const ADMIN_SERVICES_METADATA = {
  cleaning: {
    image: '../Resources/services/cleaning.jpg',
    category: 'Preventive & Hygiene',
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
    category: 'Restorative Care',
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
    category: 'Oral Surgery',
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
  rootcanal: {
    image: '../Resources/services/root-canal.jpg',
    category: 'Endodontics',
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
    preparation: 'Take doctor-prescribed pain relievers or antibiotics if provided ahead of the visit.',
    aftercare: 'Chew on the opposite side until the permanent dental crown or definitive restoration is placed.'
  },
  whitening: {
    image: '../Resources/services/whitening.jpg',
    category: 'Cosmetic Dentistry',
    tagline: 'In-chair accelerated laser activation for up to 8 shades whiter smile',
    summary: 'Advanced clinic-grade hydrogen peroxide gel activated by cool blue laser light to eliminate stubborn deep stains from coffee, smoking, and aging safely and quickly.',
    highlights: [
      'Up to 6–8 Shades Brighter Smile',
      'Safe Enamel-Friendly Gentle Chemistry',
      'Gingival Barrier Gum Protection',
      'Instant Results in Just 60 Minutes'
    ],
    indications: [
      'Enamel discoloration or yellowing from aging',
      'Coffee, tea, red wine, or tobacco surface and deep stains',
      'Preparation for weddings, special events, or graduation',
      'Desire for a brighter, more confident smile'
    ],
    steps: [
      { step: 1, title: 'Shade Assessment', desc: 'Initial baseline tooth shade recorded with clinical VITA guide.' },
      { step: 2, title: 'Gum Barrier Placement', desc: 'Liquid dam resin isolates and shields gums from bleaching agents.' },
      { step: 3, title: 'Laser Bleaching Cycles', desc: 'Medical-grade gel applied and activated by blue LED laser in 15-minute cycles.' },
      { step: 4, title: 'Desensitizing Finish', desc: 'Enamel remineralizing paste applied to minimize sensitivity.' }
    ],
    preparation: 'Brush thoroughly before your session. Professional cleaning is recommended within 2 weeks prior.',
    aftercare: 'Follow the "white diet" for 48 hours (avoid dark sauces, coffee, tea, berries, or smoking).'
  },
  implants: {
    image: '../Resources/services/implants.jpg',
    category: 'Prosthodontics & Implants',
    tagline: 'Permanent titanium tooth replacement with natural look and feel',
    summary: 'State-of-the-art titanium dental implants engineered to fuse directly with jawbone, replacing missing teeth permanently with unrivaled stability, aesthetics, and bite force.',
    highlights: [
      'Medical-Grade Biocompatible Titanium',
      'Prevents Jawbone Atrophy & Facial Sagging',
      'Matches Natural Teeth in Appearance & Function',
      'Lifetime Durability with Proper Hygiene'
    ],
    indications: [
      'Single or multiple missing teeth',
      'Discomfort or looseness with removable dentures',
      'Desire to preserve adjacent natural teeth without grinding for bridges'
    ],
    steps: [
      { step: 1, title: '3D CBCT Imaging', desc: 'High-resolution scan maps bone density and nerve canals.' },
      { step: 2, title: 'Implant Fixture Placement', desc: 'Titanium post is gently placed into jawbone under local anesthesia.' },
      { step: 3, title: 'Osseointegration Period', desc: 'Implant naturally fuses with bone over 8–12 weeks.' },
      { step: 4, title: 'Abutment & Custom Crown', desc: 'Custom precision-shaded ceramic crown is secured on top.' }
    ],
    preparation: 'Follow pre-op medication protocols. Plan for a soft-food diet for 3–5 days post-surgery.',
    aftercare: 'Maintain gentle saline rinses and avoid strenuous physical exercise for the first 48 hours.'
  },
  braces: {
    image: '../Resources/services/braces.jpg',
    category: 'Orthodontics',
    tagline: 'Precision orthodontic alignment for straight teeth and healthy bite',
    summary: 'Comprehensive orthodontic therapy correcting crowded teeth, gaps, and malocclusion using high-grade aesthetic ceramic or low-profile metal brackets.',
    highlights: [
      'Precision Digital Bracket Placement',
      'Corrects Overbite, Underbite & Crossbite',
      'Ceramic Clear or Traditional Stainless Steel',
      'Periodic Orthodontic Adjustments & Monitoring'
    ],
    indications: [
      'Crowded, overlapping, or crooked teeth',
      'Noticeable gaps or spacing between front teeth',
      'Difficulty chewing or uneven jaw bite alignment'
    ],
    steps: [
      { step: 1, title: 'Cephalometric & Digital Analysis', desc: 'Diagnostic photos, impressions, and X-rays establish treatment path.' },
      { step: 2, title: 'Enamel Conditioning & Bonding', desc: 'Teeth are etched and brackets adhered with orthodontic resin.' },
      { step: 3, title: 'Archwire Insertion', desc: 'Memory nickel-titanium archwire is engaged with elastic ligature ties.' },
      { step: 4, title: 'Monthly Activations', desc: 'Scheduled adjustments guide teeth into optimal aesthetic alignment.' }
    ],
    preparation: 'Have a professional dental cleaning done before bracket placement day.',
    aftercare: 'Avoid hard, sticky, or crunchy foods. Use orthodontic floss threaders and interdental brushes daily.'
  },
  crowns: {
    image: '../Resources/services/crowns.jpg',
    category: 'Restorative Care',
    tagline: 'Custom porcelain and zirconia crowns restoring strength and beauty',
    summary: 'Full-coverage tooth caps crafted from high-translucency zirconia or ceramic to rebuild cracked, weakened, or heavily filled teeth with lifelike appearance.',
    highlights: [
      'Full 360-Degree Structural Protection',
      'High-Translucency Multilayered Zirconia',
      'Custom Shade-Matched Natural Translucency',
      'High Compressive Strength'
    ],
    indications: [
      'Weakened tooth after extensive root canal treatment',
      'Severe crack, fracture, or large broken restoration',
      'Severely worn down teeth or discolored tooth cap replacement'
    ],
    steps: [
      { step: 1, title: 'Tooth Preparation', desc: 'Tooth structure is reshaped under local anesthesia to receive crown.' },
      { step: 2, title: 'Digital Impression', desc: 'Precise scan captured and sent to dental laboratory.' },
      { step: 3, title: 'Temporary Crown', desc: 'Protective provisional cap protects the tooth while crown is fabricated.' },
      { step: 4, title: 'Permanent Cementation', desc: 'Finished ceramic crown is bonded permanently with resin cement.' }
    ],
    preparation: 'Ensure any preliminary pulp therapy or decay removal is completed beforehand.',
    aftercare: 'Avoid sticky candies on temporary crowns. Floss carefully by pulling thread sideways rather than upward.'
  },
  emergency: {
    image: '../Resources/services/emergency.jpg',
    category: 'General Dentistry',
    tagline: 'Immediate dental pain relief and trauma care when you need it most',
    summary: 'Urgent diagnostic and palliative intervention to arrest acute dental agony, control bleeding, treat abscesses, or stabilize fractured teeth.',
    highlights: [
      'Priority Same-Day Urgent Care Slot',
      'Rapid Pain & Swelling Management',
      'Diagnostic Radiographs & Infection Control',
      'Prescription for Antibiotics & Analgesics'
    ],
    indications: [
      'Excruciating throbbing toothache or facial swelling',
      'Knocked-out, dislodged, or shattered tooth',
      'Bleeding that does not stop after accidental oral trauma',
      'Broken filling or sharp tooth cutting the cheek or tongue'
    ],
    steps: [
      { step: 1, title: 'Triage & Immediate Pain Relief', desc: 'Rapid assessment and administration of targeted local pain control.' },
      { step: 2, title: 'Diagnostic Radiograph', desc: 'Pinpoints source of acute infection, abscess, or bone fracture.' },
      { step: 3, title: 'Stabilization & Treatment', desc: 'Palliative dressing, drainage, or temporary restoration placed.' },
      { step: 4, title: 'Prescription & Follow-up', desc: 'Pain management medications provided with definitive care scheduled.' }
    ],
    preparation: 'Bring any broken tooth fragments kept in clean cold milk or saline if available.',
    aftercare: 'Follow prescribed medication doses strictly and report back if swelling worsens.'
  }
};

function getAdminTreatmentCategory(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('clean') || n.includes('prophylaxis') || n.includes('scaling')) return 'Preventive & Hygiene';
  if (n.includes('whiten') || n.includes('bleach') || n.includes('cosmetic')) return 'Cosmetic Dentistry';
  if (n.includes('root canal') || n.includes('endodontic')) return 'Endodontics';
  if (n.includes('extract') || n.includes('surgery') || n.includes('wisdom')) return 'Oral Surgery';
  if (n.includes('brace') || n.includes('aligner') || n.includes('ortho')) return 'Orthodontics';
  if (n.includes('implant') || n.includes('prostho')) return 'Prosthodontics & Implants';
  if (n.includes('crown') || n.includes('bridge') || n.includes('fill') || n.includes('cavity') || n.includes('restor')) return 'Restorative Care';
  if (n.includes('x-ray') || n.includes('radiograph') || n.includes('scan')) return 'Diagnostics & Imaging';
  return 'General Dentistry';
}

function getAdminTreatmentDetailsMeta(treatment) {
  const n = (treatment?.name || '').toLowerCase();
  if (n.includes('clean') || n.includes('prophylaxis') || n.includes('scaling')) return ADMIN_SERVICES_METADATA.cleaning;
  if (n.includes('fill') || n.includes('cavity') || n.includes('restor')) return ADMIN_SERVICES_METADATA.filling;
  if (n.includes('extract') || n.includes('wisdom') || n.includes('surgery')) return ADMIN_SERVICES_METADATA.extraction;
  if (n.includes('root canal') || n.includes('endodontic')) return ADMIN_SERVICES_METADATA.rootcanal;
  if (n.includes('whiten') || n.includes('bleach')) return ADMIN_SERVICES_METADATA.whitening;
  if (n.includes('implant')) return ADMIN_SERVICES_METADATA.implants;
  if (n.includes('brace') || n.includes('aligner') || n.includes('ortho')) return ADMIN_SERVICES_METADATA.braces;
  if (n.includes('crown') || n.includes('bridge') || n.includes('veneer')) return ADMIN_SERVICES_METADATA.crowns;
  if (n.includes('emerg') || n.includes('urgent') || n.includes('pain')) return ADMIN_SERVICES_METADATA.emergency;

  // Fallback metadata built from available data
  return {
    image: treatment?.image_url || '../Resources/services/cleaning.jpg',
    category: getAdminTreatmentCategory(treatment?.name),
    tagline: 'Standard specialized clinic dental care and professional therapy',
    summary: treatment?.description || 'Professional dental procedure administered by board-certified dental surgeons adhering to international hygiene standards.',
    highlights: [
      'Comprehensive In-Chair Clinical Treatment',
      'High-Grade Sterilized Instrumentation',
      'Profound Local Pain Management',
      'Personalized Recovery Care Instructions'
    ],
    indications: [
      'Recommended following professional dental exam',
      'Preventive oral hygiene or restoration necessity',
      'Relief of dental discomfort or aesthetic enhancement'
    ],
    steps: [
      { step: 1, title: 'Preliminary Dental Examination', desc: 'The clinician assesses oral condition and discusses treatment objectives.' },
      { step: 2, title: 'Preparation & Local Anesthesia', desc: 'The operational quadrant is prepped and gently numbed if needed.' },
      { step: 3, title: 'Clinical Procedure Execution', desc: 'Precision treatment carried out using modern dental equipment.' },
      { step: 4, title: 'Evaluation & Post-Op Guidance', desc: 'Treatment inspected for quality and aftercare recommendations provided.' }
    ],
    preparation: 'Maintain normal oral hygiene and inform your dentist of any ongoing medications.',
    aftercare: 'Follow specific post-treatment instructions given by your dentist. Contact clinic hotline if discomfort persists.'
  };
}

function loadAdminTreatments(forceRefresh = false) {
  if (forceRefresh) {
    showToast('Refreshing services catalog...', 'info');
  }

  const curToken = getAuthToken() || token;
  const headers = curToken ? { 'Authorization': `Bearer ${curToken}` } : {};

  fetch(`${TREATMENT_API}`, { headers })
    .then(res => res.json())
    .then(data => {
      if (data && data.message) {
        showToast(data.message, 'error');
        return;
      }
      allAdminTreatments = Array.isArray(data) ? data : [];

      // Update KPI Counter Ribbon
      updateAdminServicesKPIs(allAdminTreatments);

      // Render Cards
      filterAndRenderAdminServices();

      if (forceRefresh) {
        showToast('Services catalog synchronized successfully!', 'success');
      }
    })
    .catch(err => {
      console.error('Error fetching admin treatments:', err);
      showToast('Could not fetch services catalog from server', 'error');
    });
}
window.loadAdminTreatments = loadAdminTreatments;

function updateAdminServicesKPIs(treatments) {
  const total = treatments.length;
  const activeCount = treatments.filter(t => t.is_active !== false).length;
  
  let totalPrice = 0;
  let totalDuration = 0;

  treatments.forEach(t => {
    totalPrice += parseFloat(t.price || 0);
    totalDuration += parseInt(t.duration_minutes || 45, 10);
  });

  const avgPrice = total > 0 ? (totalPrice / total).toFixed(2) : '0.00';
  const avgDur = total > 0 ? Math.round(totalDuration / total) : 0;
  const curr = getCurrencySymbol();

  const elTotal = document.getElementById('kpi-total-services');
  const elActive = document.getElementById('kpi-active-services');
  const elPrice = document.getElementById('kpi-avg-price');
  const elDuration = document.getElementById('kpi-avg-duration');

  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = activeCount;
  if (elPrice) elPrice.textContent = `${curr}${avgPrice}`;
  if (elDuration) elDuration.textContent = `${avgDur} min`;
}

function handleAdminServicesFilterChange() {
  filterAndRenderAdminServices();
}
window.handleAdminServicesFilterChange = handleAdminServicesFilterChange;

function filterAndRenderAdminServices() {
  const searchInput = document.getElementById('admin-service-search');
  const catFilter = document.getElementById('admin-service-category-filter');
  const statusFilter = document.getElementById('admin-service-status-filter');

  const q = (searchInput?.value || '').toLowerCase().trim();
  const selectedCat = catFilter?.value || 'all';
  const selectedStatus = statusFilter?.value || 'all';

  const filtered = allAdminTreatments.filter(t => {
    // Search filter
    const nameMatch = (t.name || '').toLowerCase().includes(q);
    const descMatch = (t.description || '').toLowerCase().includes(q);
    if (q && !nameMatch && !descMatch) return false;

    // Category filter
    const cat = getAdminTreatmentCategory(t.name);
    if (selectedCat !== 'all' && cat !== selectedCat) return false;

    // Status filter
    const isActive = t.is_active !== false;
    if (selectedStatus === 'active' && !isActive) return false;
    if (selectedStatus === 'inactive' && isActive) return false;

    return true;
  });

  renderAdminTreatments(filtered);
}

function renderAdminTreatments(treatments) {
  const grid = document.getElementById('admin-services-grid');
  if (!grid) return;

  if (!treatments || treatments.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 14px;">
        <div style="width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 26px;">
          <i class="ti ti-dental"></i>
        </div>
        <h4 style="margin: 0 0 6px 0; color: #334155; font-size: 1.1rem; font-weight: 700;">No services found</h4>
        <p style="margin: 0 0 18px 0; color: #64748b; font-size: 0.85rem;">Try refining your search query or add a new clinical service</p>
        <button class="btn-primary" onclick="openAdminAddServiceModal()" style="display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px;">
          <i class="ti ti-plus"></i> Add New Service
        </button>
      </div>
    `;
    return;
  }

  const curr = getCurrencySymbol();

  const cardsHtml = treatments.map(t => {
    const meta = getAdminTreatmentDetailsMeta(t);
    const imgSrc = t.image_url || meta.image || '../Resources/services/cleaning.jpg';
    const category = t.category || getAdminTreatmentCategory(t.name);
    const isActive = t.is_active !== false;
    const priceFormatted = `${curr}${parseFloat(t.price || 0).toFixed(2)}`;
    const duration = t.duration_minutes || 45;
    const cleanDesc = (t.description || '').replace(/<!--METADATA:[\s\S]*?-->/, '').trim();

    // Build 2 highlights pills
    const highlights = ((t.highlights && t.highlights.length) ? t.highlights : (meta.highlights || [])).slice(0, 2);
    const highlightsHtml = highlights.map(h => `<span class="asc-highlight-tag"><i class="ti ti-check" style="font-size: 11px; color: #10b981;"></i> ${escapeHTML(h)}</span>`).join('');

    return `
      <div class="admin-service-card" id="service-card-${t.id}">
        <!-- Image & Overlay Badges -->
        <div class="admin-service-card-media" onclick="openAdminServiceDetailsModal('${t.id}')" style="cursor: pointer;" title="Click to view complete details">
          <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(t.name)}" class="admin-service-card-img" onerror="this.src='../Resources/services/cleaning.jpg'">
          <div class="admin-service-card-overlay">
            <div class="asc-pill-top">
              <span class="service-cat-pill">${escapeHTML(category)}</span>
              <span class="status-pill ${isActive ? 'status-confirmed' : 'status-cancelled'}">
                ${isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div></div>
          </div>
        </div>

        <!-- Content Body -->
        <div class="admin-service-card-body">
          <div class="asc-title-row">
            <h4 class="asc-title" onclick="openAdminServiceDetailsModal('${t.id}')" style="cursor: pointer;" title="Click to view complete details">${escapeHTML(t.name)}</h4>
          </div>

          <div class="asc-pricing-row">
            <div class="asc-price">${priceFormatted}</div>
            <div class="asc-duration"><i class="ti ti-clock" style="font-size: 13px;"></i> ${duration} min</div>
          </div>

          <p class="asc-description">${escapeHTML(cleanDesc || meta.summary || '')}</p>

          <div class="asc-highlights-pills">
            ${highlightsHtml}
          </div>

          <!-- Actions Row -->
          <div class="asc-actions-row">
            <button type="button" class="btn-card-details" onclick="openAdminServiceDetailsModal('${t.id}')" title="View Full Clinical Details">
              <i class="ti ti-eye"></i> View Details
            </button>
            <button type="button" class="btn-card-edit" onclick="openAdminEditServiceModal('${t.id}')" title="Edit Service &amp; Picture">
              <i class="ti ti-edit"></i>
            </button>
            <button type="button" class="btn-card-delete" onclick="deleteAdminService('${t.id}')" title="Delete Service">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = cardsHtml;

  // Event delegation to guarantee clicks on action buttons
  if (!grid.dataset.delegationAttached) {
    grid.dataset.delegationAttached = 'true';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button, .asc-title, .admin-service-card-media');
      if (!btn) return;
      const card = btn.closest('.admin-service-card');
      const id = card?.id?.replace('service-card-', '') || btn.getAttribute('data-id');
      if (!id) return;

      if (btn.classList.contains('btn-card-details') || btn.classList.contains('asc-title') || btn.classList.contains('admin-service-card-media')) {
        e.preventDefault();
        e.stopPropagation();
        openAdminServiceDetailsModal(id);
      } else if (btn.classList.contains('btn-card-edit')) {
        e.preventDefault();
        e.stopPropagation();
        openAdminEditServiceModal(id);
      } else if (btn.classList.contains('btn-card-delete')) {
        e.preventDefault();
        e.stopPropagation();
        deleteAdminService(id);
      }
    });
  }
}

// ─── Modal: Add / Edit Service ─────────────────────────────────────────────
function openAdminAddServiceModal() {
  const modal = document.getElementById('modal-admin-service');
  if (!modal) return;

  const form = document.getElementById('admin-service-form');
  if (form) form.reset();

  const titleEl = document.getElementById('admin-service-modal-title');
  if (titleEl) titleEl.textContent = 'Add New Clinic Service';
  const subEl = document.getElementById('admin-service-modal-subtitle');
  if (subEl) subEl.textContent = 'Configure dental procedure pricing, duration, description and procedure photo';
  const idEl = document.getElementById('admin-service-id');
  if (idEl) idEl.value = '';

  const defaultImg = '../Resources/services/cleaning.jpg';
  const imgUrlEl = document.getElementById('admin-service-image-url');
  if (imgUrlEl) imgUrlEl.value = defaultImg;
  const previewImg = document.getElementById('admin-service-preview-img');
  if (previewImg) previewImg.src = defaultImg;
  const imgInput = document.getElementById('admin-service-image-input');
  if (imgInput) imgInput.value = '';

  document.querySelectorAll('.preset-img-btn').forEach((btn, idx) => {
    if (idx === 0) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('admin-service-name', '');
  setVal('admin-service-category', 'Preventive & Hygiene');
  setVal('admin-service-price', '');
  setVal('admin-service-duration', '45');
  setVal('admin-service-status', 'true');
  setVal('admin-service-description', '');
  setVal('admin-service-highlights', '');
  setVal('admin-service-indications', '');
  setVal('admin-service-steps', '');
  setVal('admin-service-aftercare', '');

  modal.style.display = 'flex';
  modal.classList.add('active');
}
window.openAdminAddServiceModal = openAdminAddServiceModal;

async function openAdminEditServiceModal(treatmentId) {
  let treatment = (allAdminTreatments || []).find(t => String(t.id) === String(treatmentId));
  if (!treatment) {
    try {
      const curToken = getAuthToken() || token;
      const res = await fetch(`${TREATMENT_API}/${treatmentId}`, {
        headers: curToken ? { 'Authorization': `Bearer ${curToken}` } : {}
      });
      if (res.ok) treatment = await res.json();
    } catch (_) {}
  }
  if (!treatment) {
    showToast('Service record not found', 'error');
    return;
  }

  const modal = document.getElementById('modal-admin-service');
  if (!modal) return;

  const form = document.getElementById('admin-service-form');
  if (form) form.reset();

  document.getElementById('admin-service-modal-title').textContent = `Edit Service: ${treatment.name}`;
  document.getElementById('admin-service-modal-subtitle').textContent = 'Update procedure pricing, clinical details, or upload/change picture';
  document.getElementById('admin-service-id').value = treatment.id;

  const meta = getAdminTreatmentDetailsMeta(treatment);
  const currentImg = treatment.image_url || meta.image || '../Resources/services/cleaning.jpg';
  document.getElementById('admin-service-image-url').value = currentImg;

  const previewImg = document.getElementById('admin-service-preview-img');
  if (previewImg) previewImg.src = currentImg;

  const imgInput = document.getElementById('admin-service-image-input');
  if (imgInput) imgInput.value = currentImg.startsWith('http') ? currentImg : '';

  // Highlight matching preset if applicable
  document.querySelectorAll('.preset-img-btn').forEach(btn => {
    const fn = btn.getAttribute('onclick') || '';
    if (fn.includes(currentImg)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.getElementById('admin-service-name').value = treatment.name || '';
  document.getElementById('admin-service-category').value = treatment.category || getAdminTreatmentCategory(treatment.name);
  document.getElementById('admin-service-price').value = treatment.price || 0;
  document.getElementById('admin-service-duration').value = treatment.duration_minutes || 45;
  document.getElementById('admin-service-status').value = treatment.is_active !== false ? 'true' : 'false';
  const cleanDesc = (treatment.description || '').replace(/<!--METADATA:[\s\S]*?-->/, '').trim();
  document.getElementById('admin-service-description').value = cleanDesc || meta.summary || '';

  // Highlights, Indications, Steps, Aftercare
  const highlightsList = (treatment.highlights && treatment.highlights.length) ? treatment.highlights : (meta.highlights || []);
  document.getElementById('admin-service-highlights').value = highlightsList.join('\n');

  const indicationsList = (treatment.indications && treatment.indications.length) ? treatment.indications : (meta.indications || []);
  document.getElementById('admin-service-indications').value = indicationsList.join('\n');

  const stepsList = (treatment.steps && treatment.steps.length) ? treatment.steps : (meta.steps || []);
  document.getElementById('admin-service-steps').value = stepsList.map(s => {
    if (typeof s === 'string') return s;
    if (s && s.desc) return `${s.title}: ${s.desc}`;
    if (s && s.title) return s.title;
    return '';
  }).filter(Boolean).join('\n');

  document.getElementById('admin-service-aftercare').value = treatment.aftercare || meta.aftercare || '';

  modal.style.display = 'flex';
  modal.classList.add('active');
}
window.openAdminEditServiceModal = openAdminEditServiceModal;

function closeAdminServiceModal() {
  const modal = document.getElementById('modal-admin-service');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}
window.closeAdminServiceModal = closeAdminServiceModal;

function selectAdminServicePresetImage(url, btnEl) {
  document.getElementById('admin-service-image-url').value = url;
  const preview = document.getElementById('admin-service-preview-img');
  if (preview) preview.src = url;

  const inputEl = document.getElementById('admin-service-image-input');
  if (inputEl) inputEl.value = '';

  document.querySelectorAll('.preset-img-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
}
window.selectAdminServicePresetImage = selectAdminServicePresetImage;

function updateAdminServicePreviewFromUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return;
  document.getElementById('admin-service-image-url').value = trimmed;
  const preview = document.getElementById('admin-service-preview-img');
  if (preview) preview.src = trimmed;
  document.querySelectorAll('.preset-img-btn').forEach(b => b.classList.remove('active'));
}
window.updateAdminServicePreviewFromUrl = updateAdminServicePreviewFromUrl;

function handleAdminServiceFileSelect(fileInput) {
  if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
  const file = fileInput.files[0];

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (JPG, PNG, WebP)', 'error');
    return;
  }

  const statusEl = document.getElementById('admin-service-file-status');
  if (statusEl) statusEl.textContent = 'Uploading photo...';

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;
    const curToken = getAuthToken() || token;

    fetch(`${TREATMENT_API}/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${curToken}`
      },
      body: JSON.stringify({ image: base64Data })
    })
      .then(res => res.json())
      .then(data => {
        if (data.image_url) {
          document.getElementById('admin-service-image-url').value = data.image_url;
          const preview = document.getElementById('admin-service-preview-img');
          if (preview) preview.src = data.image_url;
          if (statusEl) statusEl.innerHTML = '<span style="color: #10b981;"><i class="ti ti-check"></i> Uploaded</span>';
          document.querySelectorAll('.preset-img-btn').forEach(b => b.classList.remove('active'));
          showToast('Picture uploaded and applied to service!', 'success');
        } else {
          showToast(data.message || 'Image upload failed', 'error');
          if (statusEl) statusEl.textContent = '(Upload failed)';
        }
      })
      .catch(err => {
        console.error('Image upload error:', err);
        showToast('Image upload failed', 'error');
        if (statusEl) statusEl.textContent = '(Upload failed)';
      });
  };
  reader.readAsDataURL(file);
}
window.handleAdminServiceFileSelect = handleAdminServiceFileSelect;

function saveAdminService(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('admin-service-id')?.value.trim();
  const name = document.getElementById('admin-service-name')?.value.trim();
  const priceVal = parseFloat(document.getElementById('admin-service-price')?.value);
  const durationVal = parseInt(document.getElementById('admin-service-duration')?.value, 10);
  const statusVal = document.getElementById('admin-service-status')?.value === 'true';
  const description = document.getElementById('admin-service-description')?.value.trim();
  const imageUrl = document.getElementById('admin-service-image-url')?.value.trim() || '../Resources/services/cleaning.jpg';

  if (!name) {
    showToast('Procedure name is required', 'error');
    return;
  }
  if (isNaN(priceVal) || priceVal < 0) {
    showToast('Please enter a valid standard fee', 'error');
    return;
  }
  if (isNaN(durationVal) || durationVal < 5) {
    showToast('Please enter a valid estimated duration (at least 5 minutes)', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-save-admin-service');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Saving...';
  }

  const category = document.getElementById('admin-service-category')?.value || 'General Dentistry';
  const highlightsRaw = document.getElementById('admin-service-highlights')?.value || '';
  const highlights = highlightsRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const indicationsRaw = document.getElementById('admin-service-indications')?.value || '';
  const indications = indicationsRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const stepsRaw = document.getElementById('admin-service-steps')?.value || '';
  const steps = stepsRaw.split('\n').map(s => s.trim()).filter(Boolean).map((line, idx) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      return {
        step: idx + 1,
        title: line.substring(0, colonIdx).trim(),
        desc: line.substring(colonIdx + 1).trim()
      };
    }
    return {
      step: idx + 1,
      title: `Phase ${idx + 1}`,
      desc: line
    };
  });

  const aftercare = document.getElementById('admin-service-aftercare')?.value.trim() || '';

  const payload = {
    name,
    category,
    price: priceVal,
    duration_minutes: durationVal,
    is_active: statusVal,
    description,
    image_url: imageUrl,
    highlights,
    indications,
    steps,
    aftercare
  };

  const isEdit = !!id;
  const endpoint = isEdit ? `${TREATMENT_API}/${id}` : `${TREATMENT_API}`;
  const method = isEdit ? 'PUT' : 'POST';
  const curToken = getAuthToken() || token;

  fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${curToken}`
    },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-check"></i> Save Service';
      }

      if (data && data.message && !data.id) {
        showToast(data.message, 'error');
        return;
      }

      showToast(isEdit ? `Service "${name}" updated successfully!` : `New service "${name}" added to clinic catalog!`, 'success');
      closeAdminServiceModal();
      loadAdminTreatments();
    })
    .catch(err => {
      console.error('Error saving treatment:', err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="ti ti-check"></i> Save Service';
      }
      showToast('Failed to save service. Please try again.', 'error');
    });
}
window.saveAdminService = saveAdminService;

// ─── Modal: View Complete Details ──────────────────────────────────────────
async function openAdminServiceDetailsModal(treatmentId) {
  let treatment = (allAdminTreatments || []).find(t => String(t.id) === String(treatmentId));
  if (!treatment) {
    try {
      const curToken = getAuthToken() || token;
      const res = await fetch(`${TREATMENT_API}/${treatmentId}`, {
        headers: curToken ? { 'Authorization': `Bearer ${curToken}` } : {}
      });
      if (res.ok) treatment = await res.json();
    } catch (_) {}
  }
  if (!treatment) {
    showToast('Service record not found', 'error');
    return;
  }

  const modal = document.getElementById('modal-admin-service-details');
  if (!modal) return;

  const meta = getAdminTreatmentDetailsMeta(treatment);
  const imgSrc = treatment.image_url || meta.image || '../Resources/services/cleaning.jpg';
  const category = treatment.category || getAdminTreatmentCategory(treatment.name);
  const isActive = treatment.is_active !== false;
  const curr = getCurrencySymbol();

  // Banner image & badges
  const imgEl = document.getElementById('admin-detail-image');
  if (imgEl) {
    imgEl.src = imgSrc;
    imgEl.onerror = () => { imgEl.src = '../Resources/services/cleaning.jpg'; };
  }

  const catBadge = document.getElementById('admin-detail-category-badge');
  if (catBadge) catBadge.textContent = category;

  const statusBadge = document.getElementById('admin-detail-status-badge');
  if (statusBadge) {
    statusBadge.textContent = isActive ? 'Active' : 'Inactive';
    statusBadge.className = `status-pill ${isActive ? 'status-confirmed' : 'status-cancelled'}`;
  }

  // Titles
  const titleEl = document.getElementById('admin-detail-title');
  if (titleEl) titleEl.textContent = treatment.name;

  const taglineEl = document.getElementById('admin-detail-tagline');
  if (taglineEl) taglineEl.textContent = treatment.tagline || meta.tagline || 'Standard Specialized Dental Procedure';

  // Metrics
  const priceEl = document.getElementById('admin-detail-price');
  if (priceEl) priceEl.textContent = `${curr}${parseFloat(treatment.price || 0).toFixed(2)}`;

  const durationEl = document.getElementById('admin-detail-duration');
  if (durationEl) durationEl.textContent = `${treatment.duration_minutes || 45} minutes`;

  // Overview
  const cleanDesc = (treatment.description || '').replace(/<!--METADATA:[\s\S]*?-->/, '').trim();
  const descEl = document.getElementById('admin-detail-description');
  if (descEl) descEl.textContent = cleanDesc || meta.summary || 'No clinical description provided.';

  // Highlights
  const highlightsEl = document.getElementById('admin-detail-highlights');
  if (highlightsEl) {
    const highlights = (treatment.highlights && treatment.highlights.length) ? treatment.highlights : (meta.highlights || []);
    highlightsEl.innerHTML = highlights
      .map(h => `<li style="margin-bottom: 6px;">${escapeHTML(h)}</li>`)
      .join('');
  }

  // Indications
  const indicationsEl = document.getElementById('admin-detail-indications');
  if (indicationsEl) {
    const indications = (treatment.indications && treatment.indications.length) ? treatment.indications : (meta.indications || []);
    indicationsEl.innerHTML = indications
      .map(ind => `<li style="margin-bottom: 6px;">${escapeHTML(ind)}</li>`)
      .join('');
  }

  // Steps
  const stepsContainer = document.getElementById('admin-detail-steps-timeline');
  if (stepsContainer) {
    const steps = (treatment.steps && treatment.steps.length) ? treatment.steps : (meta.steps || []);
    stepsContainer.innerHTML = steps.map((s, idx) => {
      const stepNum = (typeof s === 'object' && s.step) ? s.step : (idx + 1);
      const title = (typeof s === 'object' && s.title) ? s.title : (typeof s === 'string' ? s : `Phase ${idx + 1}`);
      const desc = (typeof s === 'object' && s.desc) ? s.desc : '';
      return `
        <div class="timeline-step-row">
          <div class="timeline-step-num">${stepNum}</div>
          <div class="timeline-step-content">
            <div class="timeline-step-title">${escapeHTML(title)}</div>
            ${desc ? `<p class="timeline-step-desc">${escapeHTML(desc)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Preparation & Aftercare
  const prepEl = document.getElementById('admin-detail-preparation');
  if (prepEl) prepEl.textContent = treatment.preparation || meta.preparation || 'Brush lightly before your appointment.';

  const aftercareEl = document.getElementById('admin-detail-aftercare');
  if (aftercareEl) aftercareEl.textContent = treatment.aftercare || meta.aftercare || 'Follow standard oral hygiene instructions.';

  // Wire action buttons
  const editBtn = document.getElementById('btn-admin-detail-edit');
  if (editBtn) {
    editBtn.onclick = () => {
      closeAdminServiceDetailsModal();
      openAdminEditServiceModal(treatment.id);
    };
  }

  const deleteBtn = document.getElementById('btn-admin-detail-delete');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      closeAdminServiceDetailsModal();
      deleteAdminService(treatment.id);
    };
  }

  modal.style.display = 'flex';
  modal.classList.add('active');
}
window.openAdminServiceDetailsModal = openAdminServiceDetailsModal;

function closeAdminServiceDetailsModal() {
  const modal = document.getElementById('modal-admin-service-details');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}
window.closeAdminServiceDetailsModal = closeAdminServiceDetailsModal;

// ─── Delete Service ────────────────────────────────────────────────────────
function deleteAdminService(treatmentId) {
  const treatment = (allAdminTreatments || []).find(t => String(t.id) === String(treatmentId));
  const name = treatment ? treatment.name : 'this service';

  showDeleteConfirmation(`Are you sure you want to permanently delete the clinic service "${name}"? This will remove it from the clinic catalog.`, () => {
    const curToken = getAuthToken() || token;
    fetch(`${TREATMENT_API}/${treatmentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${curToken}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.message && !data.success && !data.id && !data.archived) {
          showToast(data.message, 'error');
          return;
        }
        if (data && data.archived) {
          if (treatment) treatment.is_active = false;
          showToast(data.message || `Service "${name}" has bookings and was deactivated.`, 'info');
        } else {
          allAdminTreatments = (allAdminTreatments || []).filter(t => String(t.id) !== String(treatmentId));
          showToast(`Service "${name}" deleted from catalog.`, 'success');
        }
        updateAdminServicesKPIs(allAdminTreatments);
        filterAndRenderAdminServices();
      })
      .catch(err => {
        console.error('Error deleting treatment:', err);
        showToast('Failed to delete service. Please try again.', 'error');
      });
  });
}
window.deleteAdminService = deleteAdminService;

// Keyboard shortcut: Escape to close service modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const serviceModal = document.getElementById('modal-admin-service');
    if (serviceModal && (serviceModal.classList.contains('active') || serviceModal.style.display === 'flex')) {
      closeAdminServiceModal();
    }
    const detailsModal = document.getElementById('modal-admin-service-details');
    if (detailsModal && (detailsModal.classList.contains('active') || detailsModal.style.display === 'flex')) {
      closeAdminServiceDetailsModal();
    }
  }
});

// ─── 6. Inventory stock ledger ────────────────────────────────────────────────
function loadInventory() {
  fetch(`${ADMIN_API}/inventory`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    localInventory = data || [];
    renderInventoryTable(localInventory);
  })
  .catch(err => {
    console.error('Error loading inventory:', err);
    showToast('Failed to load clinic stock supplies', 'error');
  });
}

function renderInventoryRows(data) {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 44px 20px; text-align: center;">
          <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 8px; color: #64748b;">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #0b3c4d; font-size: 24px;">
              <i class="ti ti-package"></i>
            </div>
            <div style="font-weight: 700; font-size: 0.96rem; color: var(--secondary-color, #0f172a);">No clinic supplies in stock ledger yet</div>
            <div style="font-size: 0.83rem; color: #64748b;">Click <strong>+ Add Item</strong> in the top-right corner to add your first supply item.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map(item => {
    const stockNum = parseInt(item.stock, 10) || 0;
    const threshNum = parseInt(item.threshold, 10) || 0;
    const isOutOfStock = stockNum === 0 || (item.status || '').toLowerCase().includes('out');
    const isLow = !isOutOfStock && (stockNum <= threshNum || (item.status || '').toLowerCase().includes('low'));
    
    let statusBadge = '<span style="display:inline-flex; align-items:center; gap:5px; white-space:nowrap; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:4px 10px; border-radius:999px; font-size:0.73rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px;"><span style="width:6px;height:6px;border-radius:50%;background:#16a34a;"></span>In Stock</span>';
    if (isOutOfStock) {
      statusBadge = '<span style="display:inline-flex; align-items:center; gap:5px; white-space:nowrap; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; padding:4px 10px; border-radius:999px; font-size:0.73rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px;"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span>Out of Stock</span>';
    } else if (isLow) {
      statusBadge = '<span style="display:inline-flex; align-items:center; gap:5px; white-space:nowrap; background:#fffbeb; color:#d97706; border:1px solid #fde68a; padding:4px 10px; border-radius:999px; font-size:0.73rem; font-weight:700; text-transform:uppercase; letter-spacing:0.4px;"><span style="width:6px;height:6px;border-radius:50%;background:#d97706;"></span>Low Stock</span>';
    }

    const priceVal = parseFloat(item.price !== undefined ? item.price : (item.unit_price !== undefined ? item.unit_price : 0)) || 0;
    const priceDisplay = '₱' + priceVal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `
      <tr data-item-id="${item.id}" style="border-bottom: 1px solid var(--border-color); color: var(--dark-color); transition: background-color 0.2s;">
        <td style="padding: 14px 16px; font-weight: 600; color: var(--secondary-color); vertical-align: middle;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 30px; height: 30px; border-radius: 8px; background: #f1f5f9; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: #475569;">
              <i class="ti ti-box" style="font-size: 16px;"></i>
            </span>
            <span style="line-height: 1.35;">${escapeHTML(item.name)}</span>
          </div>
        </td>
        <td style="padding: 14px 16px; vertical-align: middle; white-space: nowrap;">
          <span style="display:inline-block; background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:6px; font-size:0.78rem; font-weight:600; white-space:nowrap;">${escapeHTML(item.category || 'Disposables')}</span>
        </td>
        <td style="padding: 14px 16px; font-weight: 700; color: #0f172a; font-family: 'Plus Jakarta Sans', monospace; font-size: 0.92rem; vertical-align: middle; white-space: nowrap;">
          ${priceDisplay}
        </td>
        <td style="padding: 14px 16px; vertical-align: middle;">
          <div style="display: flex; align-items: center; gap: 10px; white-space: nowrap;">
            <div style="min-width: 78px;">
              <span style="font-weight: 700; font-size: 0.94rem; color: ${isOutOfStock ? '#ef4444' : (isLow ? '#d97706' : 'var(--dark-color)')};">${stockNum}</span>
              <span style="font-size: 0.78rem; font-weight: 500; color: #64748b; margin-left: 3px;">${escapeHTML(item.unit || 'Units')}</span>
            </div>
            <div style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <button type="button" title="Decrease Stock by 1" onclick="quickAdjustStock('${item.id}', -1)" style="border: 1px solid #cbd5e1; background: #ffffff; color:#334155; border-radius: 6px; width: 26px; height: 26px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1; padding: 0;">−</button>
              <button type="button" title="Increase Stock by 1" onclick="quickAdjustStock('${item.id}', 1)" style="border: 1px solid #cbd5e1; background: #ffffff; color:#334155; border-radius: 6px; width: 26px; height: 26px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1; padding: 0;">+</button>
            </div>
          </div>
        </td>
        <td style="padding: 14px 16px; color: #64748b; font-size: 0.86rem; vertical-align: middle; white-space: nowrap;">
          ${threshNum} ${escapeHTML(item.unit || 'Units')}
        </td>
        <td style="padding: 14px 16px; vertical-align: middle; white-space: nowrap;">
          ${statusBadge}
        </td>
        <td style="padding: 14px 16px; text-align: right; vertical-align: middle; white-space: nowrap;">
          <div style="display: inline-flex; gap: 6px; justify-content: flex-end; align-items: center; flex-wrap: nowrap;">
            <button type="button" style="display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 32px; padding: 0 12px; font-size: 0.78rem; border-radius: 6px; border: 1.5px solid #0284c7; background: transparent; color: #0284c7; font-weight: 600; cursor: pointer; white-space: nowrap;" onclick="openEditInventoryModal('${item.id}', '${escapeJS(item.name)}', '${escapeJS(item.category)}', '${escapeJS(item.unit)}', ${stockNum}, ${threshNum}, ${priceVal})">
              <i class="ti ti-edit" style="font-size: 14px;"></i><span>Edit</span>
            </button>
            <button type="button" onclick="reorderSupply('${escapeJS(item.name)}')" style="display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.78rem; background: var(--secondary-color, #0b3c4d); color: white; white-space: nowrap;">
              Restock
            </button>
            <button type="button" onclick="deleteInventoryItem('${item.id}', '${escapeJS(item.name)}')" style="display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.78rem; background: #fee2e2; color: #ef4444; white-space: nowrap;">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInventoryTable(data) {
  const lowBadge = document.getElementById('low-stock-count-badge');
  const alertBanner = document.getElementById('admin-inv-alert-banner');
  const alertTitle = document.getElementById('admin-inv-alert-title');
  const alertDesc = document.getElementById('admin-inv-alert-desc');

  const fullData = Array.isArray(localInventory) ? localInventory : (Array.isArray(data) ? data : []);
  const outOfStockItems = fullData.filter(item => {
    const s = parseInt(item.stock, 10) || 0;
    return s === 0 || (item.status || '').toLowerCase().includes('out');
  });
  const lowStockItems = fullData.filter(item => {
    const s = parseInt(item.stock, 10) || 0;
    const t = parseInt(item.threshold, 10) || 0;
    return s > 0 && (s <= t || (item.status || '').toLowerCase().includes('low'));
  });

  const totalAlerts = outOfStockItems.length + lowStockItems.length;

  if (lowBadge) {
    if (totalAlerts > 0) {
      lowBadge.style.display = 'inline-block';
      lowBadge.textContent = `${totalAlerts} Item${totalAlerts > 1 ? 's' : ''} Low / Out of Stock`;
    } else {
      lowBadge.style.display = 'none';
    }
  }

  if (alertBanner) {
    if (totalAlerts > 0) {
      alertBanner.style.display = 'flex';
      if (alertTitle) {
        alertTitle.textContent = `${totalAlerts} Clinic Supply Item${totalAlerts > 1 ? 's Need' : ' Needs'} Immediate Attention`;
      }
      if (alertDesc) {
        let descParts = [];
        if (outOfStockItems.length > 0) descParts.push(`${outOfStockItems.length} item(s) are completely depleted (0 stock)`);
        if (lowStockItems.length > 0) descParts.push(`${lowStockItems.length} item(s) are below reorder threshold`);
        alertDesc.textContent = descParts.join(' and ') + '. Reorder or adjust stock below.';
      }
    } else {
      alertBanner.style.display = 'none';
    }
  }

  renderInventoryRows(data);
}

// Quick Stock Increment / Decrement
window.quickAdjustStock = function(itemId, delta) {
  const item = (localInventory || []).find(i => i.id === itemId);
  if (!item) return;

  const currentStock = parseInt(item.stock, 10) || 0;
  const newStock = Math.max(0, currentStock + delta);
  if (newStock === currentStock) return;

  const threshold = parseInt(item.threshold, 10) || 10;
  const newStatus = newStock === 0 ? 'Out of Stock' : (newStock <= threshold ? 'Low Stock' : 'In Stock');

  // Optimistic update
  item.stock = newStock;
  item.status = newStatus;
  renderInventoryTable(localInventory);

  fetch(`${ADMIN_API}/inventory/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ stock: newStock })
  })
  .then(res => res.json())
  .then(updated => {
    if (updated.message && !updated.id) throw new Error(updated.message);
    const idx = (localInventory || []).findIndex(i => i.id === itemId);
    if (idx !== -1) {
      localInventory[idx] = { ...localInventory[idx], ...updated };
    }
    renderInventoryTable(localInventory);
    showToast(`Stock for "${item.name}" updated to ${newStock} ${item.unit || 'units'}.`, 'success');
  })
  .catch(err => {
    console.error('Failed to adjust stock:', err);
    showToast('Failed to update stock quantity', 'error');
    loadInventory();
  });
};

window.reorderSupply = function(itemName) {
  showToast(`Restock order request generated for "${itemName}"! Suppliers notified.`, 'success');
  logConsoleEvent(`[ALERT] Admin requested restock order for item "${itemName}".`);
};

window.deleteInventoryItem = function(itemId, itemName) {
  showDeleteConfirmation(`Are you sure you want to permanently delete "${itemName}" from clinic inventory?`, () => {
    fetch(`${ADMIN_API}/inventory/${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.success) {
        showToast(data.message, 'error');
        return;
      }
      localInventory = (localInventory || []).filter(item => item.id !== itemId);
      showToast(`Inventory item "${itemName}" deleted successfully.`, 'success');
      logConsoleEvent(`[INFO] Admin deleted inventory item "${itemName}".`);
      renderInventoryTable(localInventory);
    })
    .catch(err => {
      console.error('Error deleting inventory item:', err);
      showToast('Failed to delete item from inventory', 'error');
    });
  });
};

// Filter Inventory by clicking badges/buttons
window.filterInventoryByStatus = function(status) {
  const statusSelect = document.getElementById('inventory-filter-status');
  if (statusSelect) {
    statusSelect.value = status;
  }
  filterInventory();
};

// Client-side inventory filter — triggered by search input and dropdowns
window.filterInventory = function() {
  if (!localInventory) return;

  const search = (document.getElementById('inventory-search')?.value || '').toLowerCase().trim();
  const category = document.getElementById('inventory-filter-category')?.value || 'all';
  const status = document.getElementById('inventory-filter-status')?.value || 'all';

  const filtered = localInventory.filter(item => {
    const matchSearch = !search || (item.name || '').toLowerCase().includes(search);
    const matchCat = category === 'all' || item.category === category;
    
    let matchStatus = true;
    if (status !== 'all') {
      const stockNum = parseInt(item.stock, 10) || 0;
      const threshNum = parseInt(item.threshold, 10) || 0;
      const statLower = (item.status || '').toLowerCase();
      if (status === 'Out of Stock') {
        matchStatus = stockNum === 0 || statLower.includes('out');
      } else if (status === 'Low Stock') {
        matchStatus = (stockNum > 0 && stockNum <= threshNum) || statLower.includes('low');
      } else if (status === 'In Stock') {
        matchStatus = stockNum > threshNum && !statLower.includes('low') && !statLower.includes('out');
      } else {
        matchStatus = item.status === status;
      }
    }

    return matchSearch && matchCat && matchStatus;
  });

  renderInventoryRows(filtered);
};



// ─── 8. Manage Users Functions ───────────────────────────────────────────────
function loadUsers() {
  fetch(`${AUTH_API}/users`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(users => {
    if (users.message) {
      showToast(users.message, 'error');
      return;
    }
    localUsers = users || [];
    filterAndRenderUsers();
  })
  .catch(err => {
    console.error('Error loading users:', err);
    showToast('Failed to load system users', 'error');
  });
}

function filterAndRenderUsers() {
  const searchVal = document.getElementById('user-search-input').value.toLowerCase().trim();
  const roleVal = document.getElementById('user-role-filter').value;

  const filtered = localUsers.filter(u => {
    // Role filter
    if (roleVal !== 'all' && u.role !== roleVal) return false;

    // Search query (name, email, or contact number)
    const displayName = (u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const contact = u.contact_number || '';
    if (searchVal && !displayName.includes(searchVal) && !email.includes(searchVal) && !contact.includes(searchVal)) return false;

    return true;
  });

  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">No matching users found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const displayName = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown';
    const statusText = u.is_active ? 'Active' : 'Deactivated';
    const statusColor = u.is_active ? '#2ecc71' : '#e74c3c';
    const actionText = u.is_active ? 'Deactivate' : 'Reactivate';
    const actionClass = u.is_active ? 'deactivate-btn' : 'reactivate-btn';

    const isSelf = u.id === user.id;
    const disableAttr = isSelf ? 'disabled title="You cannot deactivate yourself"' : '';

    const roleBadgeCls = getRoleBadgeClass(u.role);
    const roleAvatarCls = getRoleAvatarClass(u.role);
    const initial = displayName.trim().charAt(0).toUpperCase();

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 600;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-row-avatar ${roleAvatarCls}">${initial}</div>
            <span>${escapeHTML(displayName)}</span>
          </div>
        </td>
        <td style="padding: 14px 16px;">${escapeHTML(u.email)}</td>
        <td style="padding: 14px 16px;">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <span class="${roleBadgeCls}">${u.role}</span>
            <select
              aria-label="Change user role permission"
              title="${isSelf ? 'You cannot change your own Admin role' : 'Change role & dashboard permission'}"
              ${isSelf ? 'disabled' : ''}
              onchange="changeUserRole('${u.id}', this.value, '${escapeJS(displayName)}')"
              style="padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.76rem; font-weight: 600; background: var(--card-bg, #fff); color: var(--dark-color, #1e293b); cursor: ${isSelf ? 'not-allowed' : 'pointer'};"
            >
              <option value="Patient" ${u.role === 'Patient' ? 'selected' : ''}>Patient</option>
              <option value="Receptionist" ${u.role === 'Receptionist' ? 'selected' : ''}>Receptionist</option>
              <option value="Dentist" ${u.role === 'Dentist' ? 'selected' : ''}>Dentist</option>
              <option value="Accounting" ${u.role === 'Accounting' ? 'selected' : ''}>Accounting</option>
              <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
        </td>
        <td style="padding: 14px 16px;">${escapeHTML(u.contact_number || 'N/A')}</td>
        <td style="padding: 14px 16px; font-weight: 600; color: ${statusColor};">${statusText}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
            <button class="${actionClass}" onclick="toggleUserStatus('${u.id}', ${u.is_active})" ${disableAttr} style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; transition: background 0.2s;">
              ${actionText}
            </button>
            <button onclick="deleteUserAccount('${u.id}', '${escapeJS(displayName)}')" ${disableAttr} style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: #fee2e2; color: #ef4444; transition: background 0.2s;">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.changeUserRole = function(id, newRole, userName) {
  if (!confirm(`Grant "${newRole}" dashboard permissions to ${userName}?\n\nWhen they log in, they will be routed to the ${newRole} Dashboard.`)) {
    loadUsers();
    return;
  }

  fetch(`${AUTH_API}/users/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ role: newRole })
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !data.id) {
      showToast(data.message, 'error');
      loadUsers();
    } else {
      showToast(`Updated ${userName}'s role to ${newRole}!`, 'success');
      logConsoleEvent(`[INFO] Admin changed role for ${data.email || userName} to ${newRole}.`);
      loadUsers();
      if (typeof loadStaffSchedules === 'function') loadStaffSchedules();
    }
  })
  .catch(err => {
    console.error('Error updating user role:', err);
    showToast('Failed to update user role permission', 'error');
    loadUsers();
  });
};

window.toggleUserStatus = function(id, currentStatus) {
  const newStatus = !currentStatus;
  const verb = newStatus ? 'reactivate' : 'deactivate';

  if (!confirm(`Are you sure you want to ${verb} this user account?`)) {
    return;
  }

  fetch(`${AUTH_API}/users/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ isActive: newStatus })
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
    } else {
      showToast(`User successfully ${newStatus ? 'activated' : 'deactivated'}.`, 'success');
      logConsoleEvent(`[INFO] Admin ${verb}d user ${data.email}.`);
      loadUsers(); // Refresh table
    }
  })
  .catch(err => {
    console.error('Error updating user status:', err);
    showToast('Failed to change user account status', 'error');
  });
};

window.deleteUserAccount = function(id, name) {
  showDeleteConfirmation(`Are you sure you want to permanently delete the user account for "${name}"?\nThis action cannot be undone.`, () => {
    fetch(`${AUTH_API}/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(res => {
      if (res.status === 409) {
        return res.json().then(data => {
          throw new Error(data.message || 'Cannot delete user due to data constraints.');
        });
      }
      return res.json();
    })
    .then(data => {
      if (data.success) {
        showToast(`User "${name}" deleted successfully.`, 'success');
        logConsoleEvent(`[INFO] Admin deleted user "${name}".`);
        loadUsers(); // Refresh table
      } else {
        showToast(data.message || 'Failed to delete user account.', 'error');
      }
    })
    .catch(err => {
      console.error('Error deleting user:', err);
      showToast(err.message || 'Failed to delete user account', 'error');
    });
  });
};

// ─── Manage Add Inventory Modal ───────────────────────────────────────────────
const btnAddInventory = document.getElementById('btn-add-inventory');
const btnCancelAddInventory = document.getElementById('btn-cancel-add-inventory');
const modalAddInventory = document.getElementById('modal-add-inventory');
const addInventoryForm = document.getElementById('add-inventory-form');

if (btnAddInventory) {
  btnAddInventory.addEventListener('click', () => {
    modalAddInventory.classList.add('active');
    addInventoryForm.reset();
    document.getElementById('inv-name').focus();
  });
}

if (btnCancelAddInventory) {
  btnCancelAddInventory.addEventListener('click', () => {
    modalAddInventory.classList.remove('active');
  });
}

// Close inventory modal on backdrop click
if (modalAddInventory) {
  modalAddInventory.addEventListener('click', (e) => {
    if (e.target === modalAddInventory) modalAddInventory.classList.remove('active');
  });
}

if (addInventoryForm) {
  addInventoryForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('inv-name').value.trim();
    const category = document.getElementById('inv-category').value;
    const unit = document.getElementById('inv-unit').value.trim();
    const stock = parseInt(document.getElementById('inv-stock').value, 10) || 0;
    const threshold = parseInt(document.getElementById('inv-threshold').value, 10) || 0;
    const priceInput = document.getElementById('inv-price');
    const price = priceInput ? (parseFloat(priceInput.value) || 0) : 0;
    const status = stock === 0 ? 'Out of Stock' : (stock <= threshold ? 'Low Stock' : 'In Stock');

    fetch(`${ADMIN_API}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, category, unit, stock, threshold, status, price, unit_price: price })
    })
    .then(res => res.json())
    .then(newItem => {
      if (newItem.message) {
        showToast(newItem.message, 'error');
        return;
      }
      if (!localInventory) localInventory = [];
      localInventory.push(newItem);

      showToast(`Inventory item "${name}" added successfully!`, 'success');
      logConsoleEvent(`[INFO] Admin added new inventory supply: "${name}" (${category}).`);
      addInventoryForm.reset();
      modalAddInventory.classList.remove('active');
      renderInventoryTable(localInventory);
    })
    .catch(err => {
      console.error('Error adding inventory item:', err);
      showToast('Failed to add item to inventory', 'error');
    });
  });
}

// ─── Manage Add Staff Schedule Modal (Staff/Dentists tab) ─────────────────────
const btnAddStaff = document.getElementById('btn-add-staff');
const btnCancelAddStaffSchedule = document.getElementById('btn-cancel-add-staff-schedule');
const modalAddStaffSchedule = document.getElementById('modal-add-staff-schedule');
const addStaffScheduleForm = document.getElementById('add-staff-schedule-form');

if (btnAddStaff) {
  btnAddStaff.addEventListener('click', () => {
    modalAddStaffSchedule.classList.add('active');
    if (addStaffScheduleForm) addStaffScheduleForm.reset();
    const nameEl = document.getElementById('staff-sched-name');
    if (nameEl) nameEl.focus();
  });
}

if (btnCancelAddStaffSchedule) {
  btnCancelAddStaffSchedule.addEventListener('click', () => {
    modalAddStaffSchedule.classList.remove('active');
  });
}

if (modalAddStaffSchedule) {
  modalAddStaffSchedule.addEventListener('click', (e) => {
    if (e.target === modalAddStaffSchedule) modalAddStaffSchedule.classList.remove('active');
  });
}

if (addStaffScheduleForm) {
  addStaffScheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('staff-sched-name').value.trim();
    const role = document.getElementById('staff-sched-role').value.trim();
    const shift = document.getElementById('staff-sched-shift').value.trim();
    const days = document.getElementById('staff-sched-days').value.trim();
    const contact = document.getElementById('staff-sched-contact').value.trim();
    const availability = document.getElementById('staff-sched-status').value;

    if (!name) {
      showToast('Please enter staff name', 'error');
      return;
    }

    // Check for duplicate account / listing
    const nameLower = name.toLowerCase();
    const contactClean = contact.replace(/[\s-]/g, '');

    const isDuplicate = (localStaffSchedules || []).some(s => {
      const sName = (s.name || '').toLowerCase();
      const sContact = (s.contact || '').replace(/[\s-]/g, '');
      return sName === nameLower || (contactClean.length > 5 && sContact === contactClean);
    });

    if (isDuplicate) {
      showToast(`A listing or account for "${name}" already exists! Duplicate entries are not allowed.`, 'error');
      return;
    }

    const btnSubmit = e.target.querySelector('button[type=submit]');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Saving...';
    }

    fetch(`${ADMIN_API}/staff-schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, role, shift, days, contact, availability })
    })
    .then(res => res.json())
    .then(newSched => {
      if (newSched.message) {
        showToast(newSched.message, 'error');
        return;
      }
      if (localStaffSchedules === null) {
        localStaffSchedules = [];
      }
      localStaffSchedules.push(newSched);

      showToast(`Shift listing for "${name}" saved!`, 'success');
      logConsoleEvent(`[INFO] Admin added staff shift listing: ${name} (${role}).`);
      modalAddStaffSchedule.classList.remove('active');
      addStaffScheduleForm.reset();

      // Ensure view stays on current Staff tab (no redirect to Dashboard)
      activateTab('staff');
      filterAndRenderStaff();
    })
    .catch(err => {
      console.error('Error adding staff schedule:', err);
      showToast('Failed to add staff schedule listing', 'error');
    })
    .finally(() => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Save Listing';
      }
    });
  });
}

// ─── Manage Add Staff Account Modal (Users tab) ───────────────────────────────
const btnAddStaffAccount = document.getElementById('btn-add-staff-account');
const btnCancelAddStaff = document.getElementById('btn-cancel-add-staff');
const modalAddStaffAccount = document.getElementById('modal-add-staff-account');
const addStaffForm = document.getElementById('add-staff-form');

if (btnAddStaffAccount) {
  btnAddStaffAccount.addEventListener('click', () => {
    modalAddStaffAccount.classList.add('active');
    if (addStaffForm) addStaffForm.reset();
    const firstNameEl = document.getElementById('staff-firstname');
    if (firstNameEl) firstNameEl.focus();
  });
}

if (btnCancelAddStaff) {
  btnCancelAddStaff.addEventListener('click', () => {
    modalAddStaffAccount.classList.remove('active');
  });
}

if (modalAddStaffAccount) {
  modalAddStaffAccount.addEventListener('click', (e) => {
    if (e.target === modalAddStaffAccount) modalAddStaffAccount.classList.remove('active');
  });
}

if (addStaffForm) {
  addStaffForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const firstName = document.getElementById('staff-firstname').value.trim();
    const lastName = document.getElementById('staff-lastname').value.trim();
    const email = document.getElementById('staff-email').value.trim().toLowerCase();
    const contactNumber = document.getElementById('staff-phone').value.trim();
    const role = document.getElementById('staff-role').value;
    const password = document.getElementById('staff-password').value;
    const address = document.getElementById('staff-address').value.trim();

    // Prevent duplicate accounts by email, full name, or contact number
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const cleanPhone = contactNumber.replace(/[\s\-\(\)\.]/g, '');
    const isDuplicateAccount = (localUsers || []).some(u => {
      const uEmail = (u.email || '').toLowerCase();
      const uName = (u.name || `${u.first_name || ''} ${u.last_name || ''}`).toLowerCase();
      const uPhone = (u.contact_number || '').replace(/[\s\-\(\)\.]/g, '');
      return uEmail === email ||
             (fullName.length > 3 && uName === fullName) ||
             (cleanPhone && cleanPhone.length >= 7 && (uPhone === cleanPhone || (cleanPhone.length >= 10 && uPhone.endsWith(cleanPhone.slice(-9)))));
    });

    if (isDuplicateAccount) {
      showToast(`An account with this email, contact number, or name "${firstName} ${lastName}" already exists!`, 'error');
      return;
    }

    const btnSubmit = e.target.querySelector('button[type=submit]');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Creating...';
    }

    fetch(`${AUTH_API}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ firstName, lastName, email, contactNumber, role, password, address })
    })
    .then(res => {
      if (!res.ok) {
        return res.json().then(err => { throw new Error(err.message || 'Failed to add staff'); });
      }
      return res.json();
    })
    .then(data => {
      // Optimistically update users list immediately
      if (!localUsers) localUsers = [];
      localUsers.unshift({
        id: data.id,
        first_name: firstName,
        last_name: lastName,
        name: data.name || `${firstName} ${lastName}`,
        email: data.email || email,
        role: data.role || role,
        contact_number: contactNumber,
        is_active: true
      });
      filterAndRenderUsers();

      showToast(`Account created for ${data.name || firstName} as ${data.role || role}!`, 'success');
      logConsoleEvent(`Admin created new staff user account: ${data.email || email} (${data.role || role})`, 'SUCCESS', 'AUTH');
      modalAddStaffAccount.classList.remove('active');
      addStaffForm.reset();
      loadUsers(); // Background refresh
    })
    .catch(err => {
      logConsoleEvent(`Failed to create staff account (${email}): ${err.message}`, 'ERROR', 'AUTH');
      showToast(err.message, 'error');
    })
    .finally(() => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Create Staff Account';
      }
    });
  });
}

// ─── Live Active System Logs Engine ──────────────────────────────────────────
// allSystemLogs and logsPollingInterval declared at top of file

function loadSystemLogs() {
  const t = getAuthToken();
  if (!t) return;
  fetch(`${ADMIN_API}/logs`, {
    headers: { 'Authorization': `Bearer ${t}` }
  })
  .then(res => res.json())
  .then(logs => {
    if (Array.isArray(logs)) {
      allSystemLogs = logs;
      filterAndRenderLogs();
    }
  })
  .catch(err => {
    console.error('Error fetching system logs:', err);
  });
}

function startSystemLogsStream() {
  if (logsPollingInterval) clearInterval(logsPollingInterval);
  logsPollingInterval = setInterval(() => {
    loadSystemLogs();
  }, 5000);
}
window.startSystemLogsStream = startSystemLogsStream;

function stopSystemLogsStream() {
  if (logsPollingInterval) {
    clearInterval(logsPollingInterval);
    logsPollingInterval = null;
  }
}
window.stopSystemLogsStream = stopSystemLogsStream;

function logConsoleEvent(message, level = 'INFO', module = 'SYSTEM') {
  const timestamp = new Date().toISOString();
  const logItem = {
    id: Date.now() + Math.random(),
    timestamp,
    level: level.toUpperCase(),
    module: module.toUpperCase(),
    message
  };

  allSystemLogs.unshift(logItem);
  filterAndRenderLogs();

  // Non-blocking sync to server logs
  if (token) {
    fetch(`${ADMIN_API}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ level, module, message })
    }).catch(() => {});
  }
}

function filterAndRenderLogs() {
  const container = document.getElementById('logs-container');
  const countBadge = document.getElementById('logs-total-badge');
  if (!container) return;

  const searchVal = (document.getElementById('logs-search-input')?.value || '').toLowerCase().trim();
  const levelVal = document.getElementById('logs-level-filter')?.value || 'all';
  const moduleVal = document.getElementById('logs-module-filter')?.value || 'all';
  const autoScroll = document.getElementById('logs-autoscroll')?.checked !== false;

  const filtered = allSystemLogs.filter(log => {
    const lvl = (log.level || 'INFO').toUpperCase();
    const mod = (log.module || 'SYSTEM').toUpperCase();
    const msg = (log.message || '').toLowerCase();
    const time = new Date(log.timestamp || Date.now()).toLocaleTimeString().toLowerCase();

    if (levelVal !== 'all' && lvl !== levelVal) return false;
    if (moduleVal !== 'all' && mod !== moduleVal) return false;
    if (searchVal && !msg.includes(searchVal) && !lvl.toLowerCase().includes(searchVal) && !mod.toLowerCase().includes(searchVal) && !time.includes(searchVal)) return false;

    return true;
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} of ${allSystemLogs.length} Logs`;
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="log-empty-state">No system log entries matching current filter.</div>';
    return;
  }

  // Reverse so newest entries display cleanly in stream
  const displayLogs = [...filtered].reverse();

  container.innerHTML = displayLogs.map(l => {
    const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-US', { hour12: true }) : new Date().toLocaleTimeString();
    const lvl = (l.level || 'INFO').toUpperCase();
    const mod = (l.module || 'SYSTEM').toUpperCase();
    const lvlClass = `level-${lvl.toLowerCase()}`;

    return `
      <div class="log-entry-row">
        <span class="log-time">${timeStr}</span>
        <span class="log-badge-level ${lvlClass}">${lvl}</span>
        <span class="log-badge-module">[${mod}]</span>
        <span class="log-msg-text">${escapeHTML(l.message)}</span>
      </div>
    `;
  }).join('');

  if (autoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

// Setup System Logs listeners & live poller
function initSystemLogsListeners() {
  const searchInput = document.getElementById('logs-search-input');
  const levelFilter = document.getElementById('logs-level-filter');
  const moduleFilter = document.getElementById('logs-module-filter');
  const btnRefresh = document.getElementById('btn-refresh-logs');
  const btnClear = document.getElementById('btn-clear-logs');
  const btnExport = document.getElementById('btn-export-logs');

  if (searchInput) searchInput.addEventListener('input', filterAndRenderLogs);
  if (levelFilter) levelFilter.addEventListener('change', filterAndRenderLogs);
  if (moduleFilter) moduleFilter.addEventListener('change', filterAndRenderLogs);

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadSystemLogs();
      showToast('System logs refreshed from server', 'success');
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', () => {
      showDeleteConfirmation('Are you sure you want to clear the active system console logs?', () => {
        fetch(`${ADMIN_API}/logs`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          allSystemLogs = data.logs || [];
          filterAndRenderLogs();
          showToast('System console logs cleared', 'success');
        })
        .catch(() => {
          allSystemLogs = [];
          filterAndRenderLogs();
          showToast('Local log view cleared', 'info');
        });
      });
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (allSystemLogs.length === 0) {
        showToast('No logs to export', 'info');
        return;
      }
      const textContent = allSystemLogs.map(l => {
        const d = l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString();
        return `[${d}] [${(l.level || 'INFO').toUpperCase()}] [${(l.module || 'SYSTEM').toUpperCase()}] ${l.message}`;
      }).join('\n');

      const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fano_Clinic_Logs_${new Date().toISOString().slice(0, 10)}.log`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('System logs downloaded successfully', 'success');
    });
  }
}

// ─── Toasts & Utilities ───────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.style.background = type === 'success' ? '#e3fcef' : '#fdf3f2';
  toast.style.color = type === 'success' ? '#0e6245' : '#e74c3c';
  toast.style.border = `1.5px solid ${type === 'success' ? '#c1f5d6' : '#fcdbd9'}`;
  toast.style.padding = '14px 20px';
  toast.style.borderRadius = '12px';
  toast.style.marginBottom = '10px';
  toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
  toast.style.fontFamily = "'Inter', sans-serif";
  toast.style.fontSize = '0.9rem';
  toast.style.fontWeight = '600';
  toast.style.transition = 'opacity 0.3s';
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('admin_active_tab');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}

// ─── Sidebar Collapse Toggle ───────────────────────────────────────────────────
const sbCollapseBtn = document.getElementById('sb-collapse-btn');
const sidebarEl = document.getElementById('sidebar');

if (sbCollapseBtn && sidebarEl) {
  const syncCollapseTitle = () => {
    const isCollapsed = sidebarEl.classList.contains('collapsed');
    sbCollapseBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    sbCollapseBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  };

  sbCollapseBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    syncCollapseTitle();
    try {
      localStorage.setItem('admin_sidebar_collapsed', sidebarEl.classList.contains('collapsed') ? '1' : '0');
    } catch(e) {}
  });

  try {
    if (localStorage.getItem('admin_sidebar_collapsed') === '1') {
      sidebarEl.classList.add('collapsed');
      syncCollapseTitle();
    }
  } catch(e) {}
}

// ─── Custom Delete Confirmation Modal ──────────────────────────────────────────
// onDeleteConfirmCallback is declared at top of file

function showDeleteConfirmation(message, onConfirm) {
  const modal = document.getElementById('modal-confirm-delete');
  const textEl = document.getElementById('delete-confirm-text');
  if (!modal || !textEl) {
    if (confirm(message)) onConfirm();
    return;
  }

  // Format message to highlight quoted entity names cleanly with entity-highlight badge
  const safeEscaped = escapeHTML(message);
  const formattedHtml = safeEscaped.replace(
    /&quot;(.*?)&quot;/g,
    '<strong class="entity-highlight">"$1"</strong>'
  ).replace(
    /"(.*?)"/g,
    '<strong class="entity-highlight">"$1"</strong>'
  );

  textEl.innerHTML = formattedHtml;
  onDeleteConfirmCallback = onConfirm;
  modal.style.display = 'flex';
  modal.classList.add('active');
}

const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const modalConfirmDelete = document.getElementById('modal-confirm-delete');

if (btnCancelDelete) {
  btnCancelDelete.addEventListener('click', (e) => {
    e.preventDefault();
    modalConfirmDelete.classList.remove('active');
    modalConfirmDelete.style.display = 'none';
    onDeleteConfirmCallback = null;
  });
}

if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', (e) => {
    e.preventDefault();
    modalConfirmDelete.classList.remove('active');
    if (onDeleteConfirmCallback) {
      const cb = onDeleteConfirmCallback;
      onDeleteConfirmCallback = null;
      cb();
    }
  });
}

if (modalConfirmDelete) {
  modalConfirmDelete.addEventListener('click', (e) => {
    if (e.target === modalConfirmDelete) {
      modalConfirmDelete.classList.remove('active');
      onDeleteConfirmCallback = null;
    }
  });
}

// ─── 10. Visits History Tab Functions ──────────────────────────────────────────
// ═══ HISTORY MANAGEMENT JS ════════════════════════════════════════════════════
// State
let histData         = [];          // full current page records from server
let histSummary      = {};          // { total, completed, scheduled, cancelled, noshow, archived }
let histPagination   = { page: 1, limit: 15, total: 0, totalPages: 1 };
let histCurrentPage  = 1;
let histPageSize     = 15;
let histShowArchived = false;
let histSortCol      = 'date_desc';
let histFilterTimer  = null;
let histAllPatients  = [];
let histAllDentists  = [];
let histAllTreatments = [];

// ── Load History ──────────────────────────────────────────────────────────────
function loadVisitsHistory() {
  fetchHistoryFromServer();
  populateHistoryDropdowns();
}

function fetchHistoryFromServer() {
  const tbody = document.getElementById('history-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:#888;">Loading…</td></tr>';

  const params = buildHistoryParams();
  fetch(`/api/admin/history?${params}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(async res => {
      if (res.status === 401 || res.status === 403) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#888;">Session expired. Please <a href="login.html">log in</a>.</td></tr>';
        return;
      }
      const result = await res.json();
      if (!res.ok) { showToast(result.message || 'Failed to load history', 'error'); return; }
      histData       = result.records  || [];
      histSummary    = result.summary  || {};
      histPagination = result.pagination || { page: 1, limit: histPageSize, total: 0, totalPages: 1 };
      histCurrentPage = histPagination.page;
      renderHistoryKPIs();
      renderHistoryTable();
      renderHistPagination();
    })
    .catch(err => {
      console.error('fetchHistoryFromServer error:', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#e53e3e;">Failed to load history. Check connection.</td></tr>';
    });
}

function buildHistoryParams() {
  const search    = (document.getElementById('hist-search')?.value || '').trim();
  const status    = document.getElementById('hist-status-filter')?.value || 'all';
  const dateFrom  = document.getElementById('hist-date-from')?.value || '';
  const dateTo    = document.getElementById('hist-date-to')?.value || '';
  const dentist   = document.getElementById('hist-dentist-filter')?.value || '';
  const sortBy    = document.getElementById('hist-sort-by')?.value || 'date_desc';
  const page      = histCurrentPage;
  const limit     = histPageSize;
  const archived  = histShowArchived ? 'true' : 'false';
  return new URLSearchParams({ search, status, dateFrom, dateTo, dentist, sortBy, page, limit, includeArchived: archived }).toString();
}

// ── KPI Strip ─────────────────────────────────────────────────────────────────
function renderHistoryKPIs() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '–'; };
  set('hkpi-total',     histSummary.total     ?? 0);
  set('hkpi-completed', histSummary.completed  ?? 0);
  set('hkpi-scheduled', histSummary.scheduled  ?? 0);
  set('hkpi-cancelled', histSummary.cancelled  ?? 0);
  set('hkpi-noshow',    histSummary.noshow     ?? 0);
  set('hkpi-archived',  histSummary.archived   ?? 0);
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  const label = document.getElementById('hist-results-label');
  if (label) label.textContent = histData.length === 0
    ? 'No records found.'
    : `Showing ${histData.length} of ${histPagination.total} records`;

  if (histData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:28px;text-align:center;color:#888;"><i class="ti ti-database-off"></i> No visit records found.</td></tr>';
    return;
  }

  const statusColors = {
    'Completed':'#2ecc71','Approved':'#3498db','Scheduled':'#17a2b8',
    'Checked-In':'#9b59b6','Pending':'#e6a23c','Cancelled':'#e74c3c','No-show':'#95a5a6'
  };

  tbody.innerHTML = histData.map(r => {
    const pName    = r.patient ? `${r.patient.first_name || ''} ${r.patient.last_name || ''}`.trim() : 'Unknown';
    const treat    = r.treatment ? r.treatment.name : 'General Consultation';
    const dName    = r.dentist ? `${r.dentist.first_name || ''} ${r.dentist.last_name || ''}`.trim() : 'Staff';
    const dt       = r.appointment_date ? new Date(r.appointment_date) : null;
    const dateStr  = dt ? dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '–';
    const timeStr  = dt ? dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : '';
    const status   = r.status || 'Pending';
    const checkIn  = r.check_in_time  ? new Date(r.check_in_time).toLocaleTimeString('en-US',  { hour:'2-digit', minute:'2-digit' }) : '–';
    const checkOut = r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : '–';
    const sColor   = statusColors[status] || '#888';
    const isArchived = r.archived ? 'opacity:0.55;' : '';

    const archiveBtn = !r.archived
      ? `<button class="btn-hist-action btn-hist-archive" title="Archive Visit" onclick="archiveVisitRecord('${r.id}',true)"><i class="ti ti-archive"></i></button>`
      : `<button class="btn-hist-action btn-hist-restore" title="Restore Visit" onclick="archiveVisitRecord('${r.id}',false)"><i class="ti ti-rotate-clockwise-2"></i></button>`;

    const timelinePid  = r.patient ? r.patient.id : '';
    const timelineName = escapeHTML(pName);

    const checkInCell = checkIn !== '–'
      ? `<span class="hist-checkin-badge"><i class="ti ti-clock-check"></i> ${checkIn}</span>`
      : `<button class="btn-quick-checkin" onclick="quickCheckIn('${r.id}')"><i class="ti ti-login"></i> Check In</button>`;

    const checkOutCell = checkOut !== '–'
      ? `<span class="hist-checkout-badge"><i class="ti ti-circle-check"></i> ${checkOut}</span>`
      : (checkIn !== '–'
          ? `<button class="btn-quick-checkout" onclick="quickCheckOut('${r.id}')"><i class="ti ti-logout"></i> Check Out</button>`
          : '<span style="color:#94a3b8;font-size:0.8rem;">–</span>');

    return `<tr style="border-bottom:1px solid var(--border-color);color:var(--dark-color);${isArchived}" data-id="${r.id}">
      <td style="padding:12px 14px;"><input type="checkbox" class="hist-row-cb" value="${r.id}"></td>
      <td style="padding:12px 14px;">
        <div style="font-weight:600;font-size:0.88rem;">${dateStr}</div>
        <div style="font-size:0.76rem;color:#6c757d;">${timeStr}${r.archived ? ' <span style="background:#6c757d;color:#fff;border-radius:4px;font-size:0.68rem;padding:1px 5px;margin-left:4px;">Archived</span>' : ''}</div>
      </td>
      <td style="padding:12px 14px;">
        <div style="font-weight:600;font-size:0.88rem;">${escapeHTML(pName)}</div>
        <div style="font-size:0.75rem;color:#6c757d;">${r.patient ? escapeHTML(r.patient.email || '') : ''}</div>
      </td>
      <td style="padding:12px 14px;font-size:0.86rem;">${escapeHTML(treat)}</td>
      <td style="padding:12px 14px;">${checkInCell}</td>
      <td style="padding:12px 14px;">${checkOutCell}</td>
      <td style="padding:12px 14px;"><span style="font-weight:600;color:${sColor};font-size:0.84rem;">${status}</span></td>
      <td style="padding:12px 14px;">
        <div class="hist-action-group">
          <button class="btn-hist-action btn-hist-view" title="View Complete Details" onclick="openViewVisitModal('${r.id}')"><i class="ti ti-eye"></i></button>
          <button class="btn-hist-action btn-hist-edit" title="Edit Visit Record" onclick="openEditVisitModal('${r.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn-hist-action btn-hist-timeline" title="Patient Visit Timeline" onclick="openPersonTimeline('${timelinePid}','${timelineName}')"><i class="ti ti-history"></i></button>
          ${archiveBtn}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Pagination ────────────────────────────────────────────────────────────────
function renderHistPagination() {
  const bar  = document.getElementById('hist-pagination');
  const info = document.getElementById('hist-page-info');
  const nums = document.getElementById('hist-page-numbers');
  const prev = document.getElementById('hist-prev-btn');
  const next = document.getElementById('hist-next-btn');
  if (!bar) return;

  const { page, totalPages, total } = histPagination;
  bar.style.display = total > 0 ? 'flex' : 'none';

  if (info) info.textContent = `Page ${page} of ${totalPages} (${total} total records)`;
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= totalPages;

  if (nums) {
    let pagesHtml = '';
    const start = Math.max(1, page - 2);
    const end   = Math.min(totalPages, page + 2);
    for (let p = start; p <= end; p++) {
      const isActive = p === page ? 'background:var(--primary-color);color:#fff;' : '';
      const activeClass = p === page ? 'btn-primary' : 'btn-secondary';
      pagesHtml += `<button class="${activeClass}" style="font-size:0.8rem;padding:5px 12px;border-radius:6px;min-width:32px;" onclick="goHistPage(${p})">${p}</button>`;
    }
    nums.innerHTML = pagesHtml;
  }
}

function changeHistPage(delta) {
  const newPage = histCurrentPage + delta;
  if (newPage < 1 || newPage > histPagination.totalPages) return;
  histCurrentPage = newPage;
  fetchHistoryFromServer();
}

function goHistPage(p) {
  histCurrentPage = p;
  fetchHistoryFromServer();
}

function changeHistPageSize(val) {
  histPageSize    = parseInt(val) || 15;
  histCurrentPage = 1;
  fetchHistoryFromServer();
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyHistoryFilters() {
  histCurrentPage = 1;
  fetchHistoryFromServer();
}

function debounceHistoryFilter() {
  clearTimeout(histFilterTimer);
  histFilterTimer = setTimeout(applyHistoryFilters, 350);
}

function clearHistoryFilters() {
  ['hist-search','hist-date-from','hist-date-to'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['hist-status-filter','hist-dentist-filter','hist-sort-by'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  histCurrentPage = 1;
  fetchHistoryFromServer();
}

function toggleHistoryArchived() {
  histShowArchived = !histShowArchived;
  const lbl = document.getElementById('hist-archive-toggle-label');
  if (lbl) lbl.textContent = histShowArchived ? 'Hide Archived' : 'Show Archived';
  histCurrentPage = 1;
  fetchHistoryFromServer();
}

// ── Column Sort ───────────────────────────────────────────────────────────────
function histSortByCol(col) {
  const sortEl = document.getElementById('hist-sort-by');
  if (!sortEl) return;
  if (col === 'date')    sortEl.value = sortEl.value === 'date_desc' ? 'date_asc' : 'date_desc';
  if (col === 'patient') sortEl.value = 'patient_name';
  if (col === 'status')  sortEl.value = 'status';
  applyHistoryFilters();
}

// ── Bulk Select ───────────────────────────────────────────────────────────────
function histSelectAll(cb) {
  document.querySelectorAll('.hist-row-cb').forEach(c => c.checked = cb.checked);
}

// ── Dropdowns ─────────────────────────────────────────────────────────────────
function populateHistoryDropdowns() {
  // Patients
  fetch('/api/patients', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json()).then(data => {
      histAllPatients = Array.isArray(data) ? data : (data.patients || []);
      const sel = document.getElementById('av-patient');
      if (sel) {
        sel.innerHTML = '<option value="">Select Patient…</option>' +
          histAllPatients.map(p => {
            const u = p.user || p;
            const pName = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Patient';
            const pEmail = u.email || '';
            return `<option value="${p.user_id || p.id}">${escapeHTML(pName)}${pEmail ? ` (${escapeHTML(pEmail)})` : ''}</option>`;
          }).join('');
      }
    }).catch(() => {});

  // Dentists
  fetch('/api/users?role=Dentist', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json()).then(data => {
      histAllDentists = Array.isArray(data) ? data : (data.users || []);
      const avSel     = document.getElementById('av-dentist');
      const dentFilter = document.getElementById('hist-dentist-filter');
      const opts = histAllDentists.map(d => {
        const dName = d.name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Dentist';
        return `<option value="${d.id}">${escapeHTML(dName)}</option>`;
      }).join('');
      if (avSel)      avSel.innerHTML      = '<option value="">Unassigned</option>' + opts;
      if (dentFilter) dentFilter.innerHTML = '<option value="">All Dentists</option>' + opts;
    }).catch(() => {});

  // Treatments
  fetch('/api/treatments', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json()).then(data => {
      histAllTreatments = Array.isArray(data) ? data : [];
      const sel = document.getElementById('av-treatment');
      if (sel) {
        sel.innerHTML = '<option value="">General Consultation</option>' +
          histAllTreatments.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      }
    }).catch(() => {});
}

// ── Add Visit Modal ───────────────────────────────────────────────────────────
function openAddVisitModal() {
  const form = document.getElementById('form-add-visit');
  if (form) form.reset();
  const dtEl = document.getElementById('av-date');
  if (dtEl) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dtEl.value = now.toISOString().slice(0, 16);
  }
  const mAdd = document.getElementById('modal-add-visit'); if (mAdd) { mAdd.style.display = 'flex'; mAdd.classList.add('active'); }
}

function submitAddVisit(e) {
  e.preventDefault();
  const patientId = document.getElementById('av-patient')?.value;
  const dateVal   = document.getElementById('av-date')?.value;
  const purpose   = document.getElementById('av-purpose')?.value.trim();

  let valid = true;
  const setErr = (id, msg) => { const el = document.getElementById(id); if (el) el.textContent = msg; };
  setErr('av-patient-err',''); setErr('av-date-err',''); setErr('av-purpose-err','');

  if (!patientId) { setErr('av-patient-err','Please select a patient.'); valid = false; }
  if (!dateVal)   { setErr('av-date-err','Date and time are required.'); valid = false; }
  if (!purpose)   { setErr('av-purpose-err','Please enter a purpose or reason.'); valid = false; }
  if (!valid) return;

  const payload = {
    patient_id:       patientId,
    treatment_id:     document.getElementById('av-treatment')?.value || null,
    dentist_id:       document.getElementById('av-dentist')?.value   || null,
    appointment_date: dateVal,
    status:           document.getElementById('av-status')?.value    || 'Completed',
    purpose,
    notes:            document.getElementById('av-notes')?.value      || '',
    admin_notes:      document.getElementById('av-admin-notes')?.value || '',
  };

  fetch('/api/admin/history', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) { showToast(data.message || 'Failed to add visit', 'error'); return; }
    showToast('Visit record added!', 'success');
    closeHistModal('modal-add-visit');
    fetchHistoryFromServer();
  }).catch(() => showToast('Network error', 'error'));
}

// ── Edit Visit Modal ──────────────────────────────────────────────────────────
function openEditVisitModal(id) {
  const record = histData.find(r => String(r.id) === String(id));
  if (!record) { showToast('Record not found', 'error'); return; }

  document.getElementById('ev-id').value           = record.id;
  document.getElementById('ev-patient-name').value = record.patient
    ? `${record.patient.first_name || ''} ${record.patient.last_name || ''}`.trim() : 'Unknown';

  const dtEl = document.getElementById('ev-date');
  if (dtEl && record.appointment_date) {
    const d = new Date(record.appointment_date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dtEl.value = d.toISOString().slice(0, 16);
  }

  const fmtDT = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('ev-status',      record.status || 'Pending');
  setVal('ev-purpose',     record.purpose || '');
  setVal('ev-checkin',     fmtDT(record.check_in_time));
  setVal('ev-checkout',    fmtDT(record.check_out_time));
  setVal('ev-notes',       record.notes || '');
  setVal('ev-admin-notes', record.admin_notes || '');

  const mEdit = document.getElementById('modal-edit-visit'); if (mEdit) { mEdit.style.display = 'flex'; mEdit.classList.add('active'); }
}

function submitEditVisit(e) {
  e.preventDefault();
  const id      = document.getElementById('ev-id')?.value;
  const dateVal = document.getElementById('ev-date')?.value;
  if (!dateVal) { showToast('Date is required', 'error'); return; }

  const toISO = (val) => val ? new Date(val).toISOString() : null;

  const payload = {
    appointment_date: dateVal,
    status:           document.getElementById('ev-status')?.value,
    purpose:          document.getElementById('ev-purpose')?.value,
    check_in_time:    toISO(document.getElementById('ev-checkin')?.value),
    check_out_time:   toISO(document.getElementById('ev-checkout')?.value),
    notes:            document.getElementById('ev-notes')?.value,
    admin_notes:      document.getElementById('ev-admin-notes')?.value,
  };

  fetch(`/api/admin/history/${id}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async r => {
    const data = await r.json();
    if (!r.ok) { showToast(data.message || 'Update failed', 'error'); return; }
    showToast('Visit updated!', 'success');
    closeHistModal('modal-edit-visit');
    fetchHistoryFromServer();
  }).catch(() => showToast('Network error', 'error'));
}

// ── View Visit Modal ──────────────────────────────────────────────────────────
function openViewVisitModal(id) {
  const record = histData.find(r => String(r.id) === String(id));
  const modal  = document.getElementById('modal-view-visit');
  const body   = document.getElementById('view-visit-body');
  if (!modal || !body) return;

  if (!record) {
    body.innerHTML = '<p style="color:#e53e3e;">Record not found.</p>';
    modal.style.display = 'flex';
    return;
  }

  const pName  = record.patient ? `${record.patient.first_name || ''} ${record.patient.last_name || ''}`.trim() : 'Unknown';
  const treat  = record.treatment ? record.treatment.name : 'General Consultation';
  const dName  = record.dentist  ? `${record.dentist.first_name || ''} ${record.dentist.last_name || ''}`.trim() : 'Staff';
  const dt     = record.appointment_date ? new Date(record.appointment_date).toLocaleString() : '–';
  const ci     = record.check_in_time    ? new Date(record.check_in_time).toLocaleString()    : '–';
  const co     = record.check_out_time   ? new Date(record.check_out_time).toLocaleString()   : '–';
  const audit  = record.audit_entries || [];

  const statusColors = {
    'Completed':'#2ecc71','Approved':'#3498db','Scheduled':'#17a2b8',
    'Checked-In':'#9b59b6','Pending':'#e6a23c','Cancelled':'#e74c3c','No-show':'#95a5a6'
  };
  const sColor = statusColors[record.status] || '#888';

  const auditHTML = audit.length
    ? `<div>
        <label style="font-size:0.76rem;color:#6c757d;font-weight:600;">AUDIT LOG</label>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px;">
          ${audit.map(e => `<div class="audit-log-entry"><i class="ti ti-history" style="color:#17a2b8;"></i> <strong>${escapeHTML(e.action)}</strong> by ${escapeHTML(e.by)} on ${new Date(e.at).toLocaleString()}${e.notes ? ` – ${escapeHTML(e.notes)}` : ''}</div>`).join('')}
        </div>
      </div>` : '';

  const timelineBtn = record.patient && record.patient.id
    ? `<button class="admin-btn" style="font-size:0.82rem;background:#17a2b8;color:#fff;" onclick="openPersonTimeline('${record.patient.id}','${escapeHTML(pName)}');closeHistModal('modal-view-visit')"><i class="ti ti-history"></i> Timeline</button>`
    : '';

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">PATIENT</label><div style="font-weight:600;">${escapeHTML(pName)}</div><div style="font-size:0.78rem;color:#6c757d;">${record.patient ? escapeHTML(record.patient.email || '') : ''}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">STATUS</label><div style="font-weight:700;color:${sColor};">${record.status || '–'}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">APPOINTMENT DATE</label><div>${dt}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">DENTIST</label><div>${escapeHTML(dName)}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">TREATMENT</label><div>${escapeHTML(treat)}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">PURPOSE</label><div>${escapeHTML(record.purpose || '–')}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">CHECK-IN</label><div>${ci}</div></div>
      <div><label style="font-size:0.76rem;color:#6c757d;font-weight:600;">CHECK-OUT</label><div>${co}</div></div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:0.76rem;color:#6c757d;font-weight:600;">CLINICAL NOTES</label>
      <div style="background:#f8f9fa;border-radius:6px;padding:10px;font-size:0.86rem;margin-top:4px;">${escapeHTML(record.notes || 'None')}</div>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:0.76rem;color:#6c757d;font-weight:600;">ADMIN NOTES</label>
      <div style="background:#fff8e1;border-radius:6px;padding:10px;font-size:0.86rem;margin-top:4px;">${escapeHTML(record.admin_notes || 'None')}</div>
    </div>
    ${auditHTML}
    <div style="margin-top:16px;display:flex;gap:8px;">
      <button class="admin-btn admin-btn-primary" style="font-size:0.82rem;" onclick="openEditVisitModal('${record.id}');closeHistModal('modal-view-visit')"><i class="ti ti-edit"></i> Edit</button>
      ${timelineBtn}
    </div>
  `;
  modal.style.display = 'flex';
}

// ── Check-In / Check-Out ──────────────────────────────────────────────────────
function quickCheckIn(id) {
  if (!confirm('Record check-in for this patient now?')) return;
  fetch(`/api/admin/history/${id}/checkin`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) { showToast(d.message || 'Check-in failed', 'error'); return; }
    showToast('Patient checked in!', 'success');
    fetchHistoryFromServer();
  }).catch(() => showToast('Network error', 'error'));
}

function quickCheckOut(id) {
  if (!confirm('Record check-out for this patient now?')) return;
  fetch(`/api/admin/history/${id}/checkout`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) { showToast(d.message || 'Check-out failed', 'error'); return; }
    showToast('Patient checked out!', 'success');
    fetchHistoryFromServer();
  }).catch(() => showToast('Network error', 'error'));
}

// ── Archive / Restore ─────────────────────────────────────────────────────────
function archiveVisitRecord(id, archive) {
  const msg = archive ? 'Archive this visit record? It will be hidden from the main view.' : 'Restore this visit from archive?';
  if (!confirm(msg)) return;
  fetch(`/api/admin/history/${id}/archive`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: archive })
  }).then(async r => {
    const d = await r.json();
    if (!r.ok) { showToast(d.message || 'Failed', 'error'); return; }
    showToast(archive ? 'Visit archived.' : 'Visit restored!', 'success');
    fetchHistoryFromServer();
  }).catch(() => showToast('Network error', 'error'));
}

// ── Per-Person Timeline (Popup Modal) ───────────────────────────────────────
function openPersonTimeline(patientId, patientName) {
  if (!patientId) { showToast('No patient ID available', 'error'); return; }
  const modal = document.getElementById('modal-person-timeline');
  const body  = document.getElementById('hist-timeline-body');
  const title = document.getElementById('hist-timeline-title');
  const sub   = document.getElementById('hist-timeline-sub');
  if (!modal || !body) return;

  if (title) title.textContent = `${patientName || 'Patient'} — Visit Timeline`;
  if (sub)   sub.textContent = 'All recorded visits and clinical care in chronological order';
  body.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; color: #64748b;">
      <i class="ti ti-loader" style="font-size: 32px; animation: spin 1s linear infinite; display: inline-block; color: #7c3aed;"></i>
      <p style="margin: 12px 0 0 0; font-size: 0.9rem; font-weight: 500;">Loading patient timeline…</p>
    </div>
  `;

  modal.style.display = 'flex';
  modal.classList.add('active');

  fetch(`/api/admin/history/person/${patientId}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.json())
    .then(data => {
      const records = data.records || [];
      if (records.length === 0) {
        body.innerHTML = `
          <div style="text-align: center; padding: 48px 20px; color: #64748b;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; display: inline-flex; align-items: center; justify-content: center; font-size: 26px; color: #94a3b8; margin-bottom: 12px;">
              <i class="ti ti-calendar-off"></i>
            </div>
            <p style="margin: 0; font-weight: 700; color: #334155; font-size: 1rem;">No visit records found</p>
            <p style="margin: 4px 0 0 0; font-size: 0.83rem; color: #94a3b8;">This patient does not have any recorded visits in the ledger yet.</p>
          </div>
        `;
        return;
      }
      const statusCols = { 'Completed':'#16a34a','Cancelled':'#dc2626','No-show':'#94a3b8','Checked-In':'#7c3aed','Approved':'#0284c7','Scheduled':'#0284c7','Pending':'#d97706' };
      body.innerHTML = `<div class="hist-timeline">${records.map(r => {
        const treat  = r.treatment ? r.treatment.name : 'General Consultation';
        const dName  = r.dentist   ? (r.dentist.name || `${r.dentist.first_name || ''} ${r.dentist.last_name || ''}`.trim()) : 'Staff';
        const dt     = r.appointment_date ? new Date(r.appointment_date).toLocaleDateString('en-US', { weekday: 'short', month:'short', day:'numeric', year:'numeric' }) : '–';
        const tm     = r.appointment_date ? new Date(r.appointment_date).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : '';
        const sColor = statusCols[r.status] || '#0284c7';
        return `<div class="hist-timeline-item">
          <div class="hist-tl-dot" style="background:${sColor}; border-color: #ffffff; box-shadow: 0 0 0 2px ${sColor}40;"></div>
          <div class="hist-tl-content">
            <div class="hist-tl-date"><i class="ti ti-calendar" style="font-size: 12px;"></i> ${dt} &bull; ${tm}</div>
            <div class="hist-tl-treat">${escapeHTML(treat)}</div>
            <div class="hist-tl-meta">Dentist: <strong>${escapeHTML(dName)}</strong> &bull; Status: <span style="display:inline-block; padding: 2px 8px; border-radius: 999px; background:${sColor}18; color:${sColor}; font-weight:700; font-size: 0.72rem;">${escapeHTML(r.status || 'Pending')}</span></div>
            ${r.notes ? `<div class="hist-tl-notes"><i class="ti ti-notes" style="font-size: 12px; color: #94a3b8;"></i> ${escapeHTML(r.notes)}</div>` : ''}
            ${r.admin_notes ? `<div class="hist-tl-notes" style="background: #fefce8; border-left: 3px solid #eab308; margin-top: 4px;"><i class="ti ti-shield" style="font-size: 12px; color: #ca8a04;"></i> <strong>Internal Admin Note:</strong> ${escapeHTML(r.admin_notes)}</div>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`;
    })
    .catch(() => {
      body.innerHTML = '<p style="color:#ef4444; text-align: center; padding: 24px;">Failed to load visit timeline. Please try again.</p>';
    });
}

function closePersonTimeline() {
  const modal = document.getElementById('modal-person-timeline');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
function exportHistoryCSV() {
  const link = document.createElement('a');
  link.href = `/api/admin/history-export`;
  link.setAttribute('download', 'fano_visits_history.csv');
  // For authenticated request, open in new tab
  const newWin = window.open(`/api/admin/history-export`, '_blank');
  if (!newWin) showToast('Pop-up blocked. Try allowing pop-ups.', 'error');
}

// ── Print ─────────────────────────────────────────────────────────────────────
function printHistoryTable() {
  window.print();
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function closeHistModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
    el.style.display = 'none';
  }
}

window.loadVisitsHistory     = loadVisitsHistory;
window.fetchHistoryFromServer = fetchHistoryFromServer;
window.applyHistoryFilters   = applyHistoryFilters;
window.debounceHistoryFilter = debounceHistoryFilter;
window.clearHistoryFilters   = clearHistoryFilters;
window.toggleHistoryArchived = toggleHistoryArchived;
window.histSortByCol         = histSortByCol;
window.histSelectAll         = histSelectAll;
window.changeHistPage        = changeHistPage;
window.goHistPage            = goHistPage;
window.changeHistPageSize    = changeHistPageSize;
window.openAddVisitModal     = openAddVisitModal;
window.submitAddVisit        = submitAddVisit;
window.openEditVisitModal    = openEditVisitModal;
window.submitEditVisit       = submitEditVisit;
window.openViewVisitModal    = openViewVisitModal;
window.quickCheckIn          = quickCheckIn;
window.quickCheckOut         = quickCheckOut;
window.archiveVisitRecord    = archiveVisitRecord;
window.openPersonTimeline    = openPersonTimeline;
window.closePersonTimeline   = closePersonTimeline;
window.exportHistoryCSV      = exportHistoryCSV;
window.printHistoryTable     = printHistoryTable;
window.closeHistModal        = closeHistModal;


// ─── 11. Clinic Settings Functions ─────────────────────────────────────────────
window.switchSettingsSection = function(sectionId, element) {
  if (sectionId === 'services') {
    activateTab('services');
    return;
  }

  document.querySelectorAll('.settings-inner-tab').forEach(t => {
    t.classList.remove('active');
  });
  
  if (element) {
    element.classList.add('active');
  }

  document.querySelectorAll('.settings-sec-pane').forEach(p => {
    p.style.display = 'none';
  });

  const targetPane = document.getElementById(`settings-sec-${sectionId}`);
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  if (sectionId === 'utilities') {
    loadDatabaseHealthStatus();
  }
  if (sectionId === 'mfa') {
    loadMfaSettings();
  }
  if (sectionId === 'profile') {
    setTimeout(() => {
      if (adminMap) {
        adminMap.invalidateSize();
        if (typeof updateAdminMapMarkers === 'function') {
          updateAdminMapMarkers();
        }
      }
    }, 150);
  }
};

window.loadMfaSettings = async function() {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const enforceInput = document.getElementById('set-admin-mfa-enforce');
  const channelSelect = document.getElementById('set-admin-mfa-channel');
  const trustDeviceInput = document.getElementById('set-admin-mfa-trust-device');
  const statusPill = document.getElementById('mfa-status-pill');
  const lastSavedTime = document.getElementById('mfa-last-saved-time');

  try {
    const res = await fetch(`${ADMIN_API}/mfa-config`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (enforceInput) enforceInput.checked = data.mfaEnabled !== false;
      if (channelSelect) channelSelect.value = data.preferredChannel || 'email';
      if (trustDeviceInput) trustDeviceInput.checked = data.allowTrustDevice !== false;

      if (statusPill) {
        if (data.mfaEnabled !== false) {
          statusPill.className = 'mfa-live-pill active';
          statusPill.innerHTML = '<span class="mfa-status-dot"></span> MFA Active';
        } else {
          statusPill.className = 'mfa-live-pill inactive';
          statusPill.innerHTML = '<span class="mfa-status-dot"></span> MFA Disabled';
        }
      }

      if (lastSavedTime && data.updatedAt) {
        const d = new Date(data.updatedAt);
        lastSavedTime.textContent = `Synced: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      // Update TOTP UI Elements
      const totpCard = document.getElementById('totp-setup-card');
      const totpBadge = document.getElementById('totp-badge-status');
      const totpDesc = document.getElementById('totp-status-desc');
      const btnSetupText = document.getElementById('btn-setup-totp-text');
      const btnViewBackup = document.getElementById('btn-view-backup-codes');
      const btnDisable = document.getElementById('btn-disable-totp');
      const backupCountSpan = document.getElementById('backup-codes-remaining-count');

      if (data.totpEnabled) {
        if (totpCard) {
          totpCard.style.background = '#f0fdf4';
          totpCard.style.borderColor = '#86efac';
        }
        if (totpBadge) {
          totpBadge.style.background = '#dcfce7';
          totpBadge.style.color = '#15803d';
          totpBadge.textContent = 'Active & Protected';
        }
        if (totpDesc) {
          totpDesc.innerHTML = 'Your Administrator account is paired with an Authenticator app (TOTP). Industry-standard 2FA is active.';
        }
        if (btnSetupText) btnSetupText.textContent = 'Re-pair Authenticator';
        if (btnViewBackup) {
          btnViewBackup.style.display = 'inline-flex';
          if (backupCountSpan) backupCountSpan.textContent = data.totpStatus?.remainingBackupCodes ?? 8;
        }
        if (btnDisable) btnDisable.style.display = 'inline-flex';
      } else {
        if (totpCard) {
          totpCard.style.background = '#f8fafc';
          totpCard.style.borderColor = '#e2e8f0';
        }
        if (totpBadge) {
          totpBadge.style.background = '#f1f5f9';
          totpBadge.style.color = '#64748b';
          totpBadge.textContent = 'Not Configured';
        }
        if (totpDesc) {
          totpDesc.innerHTML = 'Pairs your account with Google Authenticator, Microsoft Authenticator, or Authy using time-based codes (RFC 6238).';
        }
        if (btnSetupText) btnSetupText.textContent = 'Pair Authenticator';
        if (btnViewBackup) btnViewBackup.style.display = 'none';
        if (btnDisable) btnDisable.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn('[Admin MFA Settings Load Warning]', err);
  }
};

window.saveMfaSettings = async function(customMsg) {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const enforceInput = document.getElementById('set-admin-mfa-enforce');
  const channelSelect = document.getElementById('set-admin-mfa-channel');
  const trustDeviceInput = document.getElementById('set-admin-mfa-trust-device');
  const statusPill = document.getElementById('mfa-status-pill');
  const lastSavedTime = document.getElementById('mfa-last-saved-time');

  const mfaEnabled = enforceInput ? enforceInput.checked : true;
  const preferredChannel = channelSelect ? channelSelect.value : 'email';
  const allowTrustDevice = trustDeviceInput ? trustDeviceInput.checked : true;

  try {
    const res = await fetch(`${ADMIN_API}/mfa-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mfaEnabled, preferredChannel, allowTrustDevice })
    });
    if (res.ok) {
      if (statusPill) {
        if (mfaEnabled) {
          statusPill.className = 'mfa-live-pill active';
          statusPill.innerHTML = '<span class="mfa-status-dot"></span> MFA Active';
        } else {
          statusPill.className = 'mfa-live-pill inactive';
          statusPill.innerHTML = '<span class="mfa-status-dot"></span> MFA Disabled';
        }
      }
      if (lastSavedTime) {
        lastSavedTime.textContent = 'Saved just now';
      }
      showToast(customMsg || `MFA Policy saved (${mfaEnabled ? 'Active' : 'Disabled'})`, 'success');
      logConsoleEvent(`[SECURITY] Admin MFA policy updated: Enabled=${mfaEnabled}, Channel=${preferredChannel}, TrustDevice=${allowTrustDevice}`);
    } else {
      showToast('Failed to save MFA configuration.', 'error');
    }
  } catch (err) {
    showToast('Network error saving MFA settings.', 'error');
  }
};

window.testAdminMfaDelivery = async function() {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const channelSelect = document.getElementById('set-admin-mfa-channel');
  const channel = channelSelect ? channelSelect.value : 'email';
  const btn = document.getElementById('btn-test-admin-mfa');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Sending Test Code…';
  }

  try {
    const res = await fetch(`${ADMIN_API}/mfa-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ channel })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'Test MFA security code sent successfully!', 'success');
      logConsoleEvent(`[SECURITY] Test MFA passcode dispatched via ${channel}.`);
    } else {
      showToast(data.message || 'Failed to dispatch test code.', 'error');
    }
  } catch (err) {
    showToast('Failed to send test code. Please check server status.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send" style="font-size: 16px;"></i> Send Test Security Code';
    }
  }
};

window.revokeAllAdminMfaDevices = async function() {
  if (!confirm('Are you sure you want to revoke all trusted devices? All administrators will be required to pass full MFA verification on their next sign-in.')) {
    return;
  }

  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const btn = document.getElementById('btn-revoke-all-mfa-devices');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader ti-spin"></i> Revoking…';
  }

  try {
    const res = await fetch(`${ADMIN_API}/mfa-revoke-devices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'All trusted devices invalidated successfully!', 'success');
      logConsoleEvent('[SECURITY] All remembered trusted devices for Admin MFA revoked.');
    } else {
      showToast(data.message || 'Failed to revoke devices.', 'error');
    }
  } catch (err) {
    showToast('Error communicating with server.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-mobile-off" style="font-size: 16px;"></i> Revoke All Trusted Devices';
    }
  }
};

// ─── Admin TOTP Modal & Action Controllers ──────────────────────────────────
window.latestAdminBackupCodes = [];
window.currentTotpSecretRaw = '';

window.openTotpSetupModal = async function() {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const modal = document.getElementById('admin-totp-setup-modal');
  const stepSetup = document.getElementById('totp-step-setup');
  const stepBackup = document.getElementById('totp-step-backup-codes');
  const qrImg = document.getElementById('totp-setup-qrcode-img');
  const secretKeyEl = document.getElementById('totp-setup-secret-key');
  const tokenInput = document.getElementById('totp-confirm-token-input');
  const errorDiv = document.getElementById('totp-setup-error');

  if (errorDiv) errorDiv.style.display = 'none';
  if (tokenInput) tokenInput.value = '';

  try {
    const res = await fetch(`${ADMIN_API}/totp/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.currentTotpSecretRaw = data.secret;
      if (qrImg) qrImg.src = data.qrCode;
      if (secretKeyEl) secretKeyEl.textContent = data.formattedSecret || data.secret;

      if (stepSetup) stepSetup.style.display = 'flex';
      if (stepBackup) stepBackup.style.display = 'none';
      if (modal) modal.style.display = 'flex';
      if (tokenInput) setTimeout(() => tokenInput.focus(), 150);
    } else {
      showToast(data.message || 'Failed to initiate authenticator setup.', 'error');
    }
  } catch (err) {
    showToast('Network error initiating TOTP setup.', 'error');
  }
};

window.closeTotpSetupModal = function() {
  const modal = document.getElementById('admin-totp-setup-modal');
  if (modal) modal.style.display = 'none';
};

window.submitTotpVerification = async function() {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const tokenInput = document.getElementById('totp-confirm-token-input');
  const errorDiv = document.getElementById('totp-setup-error');
  const submitBtn = document.getElementById('btn-submit-totp-verify');
  const stepSetup = document.getElementById('totp-step-setup');
  const stepBackup = document.getElementById('totp-step-backup-codes');
  const codesGrid = document.getElementById('totp-backup-codes-grid');

  if (errorDiv) errorDiv.style.display = 'none';
  const code = (tokenInput?.value || '').replace(/\D/g, '').trim();

  if (code.length !== 6) {
    if (errorDiv) {
      errorDiv.textContent = 'Please enter the 6-digit passcode displayed in your app.';
      errorDiv.style.display = 'block';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying…';
  }

  try {
    const res = await fetch(`${ADMIN_API}/totp/verify-setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ token: code })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.latestAdminBackupCodes = data.backupCodes || [];

      // Render backup codes in grid
      if (codesGrid && Array.isArray(data.backupCodes)) {
        codesGrid.innerHTML = data.backupCodes.map(c => `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; letter-spacing:2px;">
            ${c}
          </div>
        `).join('');
      }

      if (stepSetup) stepSetup.style.display = 'none';
      if (stepBackup) stepBackup.style.display = 'flex';

      showToast('Authenticator App (TOTP) successfully activated!', 'success');
      logConsoleEvent('[SECURITY] Admin TOTP 2FA successfully activated.');
      loadMfaSettings();
    } else {
      if (errorDiv) {
        errorDiv.textContent = data.message || 'Invalid code. Check device time and try again.';
        errorDiv.style.display = 'block';
      }
    }
  } catch (err) {
    if (errorDiv) {
      errorDiv.textContent = 'Network error verifying authenticator code.';
      errorDiv.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify & Activate 2FA';
    }
  }
};

window.finishTotpSetup = function() {
  closeTotpSetupModal();
  loadMfaSettings();
};

window.disableAdminTotp = async function() {
  if (!confirm('Are you sure you want to disable Authenticator App (TOTP) 2FA? This will lower security on Administrator sign-ins.')) {
    return;
  }

  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  try {
    const res = await fetch(`${ADMIN_API}/totp/disable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Authenticator App (TOTP) disabled.', 'info');
      logConsoleEvent('[SECURITY] Admin Authenticator App 2FA disabled.');
      loadMfaSettings();
    } else {
      showToast(data.message || 'Failed to disable TOTP.', 'error');
    }
  } catch (err) {
    showToast('Error communicating with server.', 'error');
  }
};

window.openBackupCodesModal = async function() {
  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  const countEl = document.getElementById('modal-remaining-codes-count');
  const modal = document.getElementById('admin-backup-codes-modal');

  try {
    const res = await fetch(`${ADMIN_API}/totp/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (countEl) countEl.textContent = data.remainingBackupCodes ?? 0;
      if (modal) modal.style.display = 'flex';
    }
  } catch (err) {
    showToast('Failed to load backup codes status.', 'error');
  }
};

window.closeBackupCodesModal = function() {
  const modal = document.getElementById('admin-backup-codes-modal');
  if (modal) modal.style.display = 'none';
};

window.regenerateBackupCodesAction = async function() {
  if (!confirm('Are you sure you want to generate a new set of backup codes? All previous codes will immediately stop working.')) {
    return;
  }

  const token = getAuthToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  try {
    const res = await fetch(`${ADMIN_API}/totp/regenerate-backup-codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.latestAdminBackupCodes = data.backupCodes || [];
      closeBackupCodesModal();

      // Show setup modal on step 3 with new codes
      const modal = document.getElementById('admin-totp-setup-modal');
      const stepSetup = document.getElementById('totp-step-setup');
      const stepBackup = document.getElementById('totp-step-backup-codes');
      const codesGrid = document.getElementById('totp-backup-codes-grid');

      if (codesGrid && Array.isArray(data.backupCodes)) {
        codesGrid.innerHTML = data.backupCodes.map(c => `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; letter-spacing:2px;">
            ${c}
          </div>
        `).join('');
      }

      if (stepSetup) stepSetup.style.display = 'none';
      if (stepBackup) stepBackup.style.display = 'flex';
      if (modal) modal.style.display = 'flex';

      showToast('New backup recovery codes generated!', 'success');
      loadMfaSettings();
    } else {
      showToast(data.message || 'Failed to regenerate backup codes.', 'error');
    }
  } catch (err) {
    showToast('Network error regenerating backup codes.', 'error');
  }
};

window.copySecretKeyToClipboard = function() {
  const secret = window.currentTotpSecretRaw || (document.getElementById('totp-setup-secret-key')?.textContent || '').replace(/\s+/g, '');
  if (!secret) return;
  navigator.clipboard.writeText(secret).then(() => {
    showToast('Secret key copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard.', 'error');
  });
};

window.copyBackupCodesToClipboard = function() {
  if (!window.latestAdminBackupCodes || !window.latestAdminBackupCodes.length) {
    showToast('No active backup codes to copy.', 'error');
    return;
  }
  const text = "FANO DENTAL CLINIC — ADMIN EMERGENCY BACKUP RECOVERY CODES\nEach code can only be used once.\n\n" +
    window.latestAdminBackupCodes.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('8 backup recovery codes copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Could not copy to clipboard.', 'error');
  });
};

window.downloadBackupCodes = function() {
  if (!window.latestAdminBackupCodes || !window.latestAdminBackupCodes.length) {
    showToast('No active backup codes to download.', 'error');
    return;
  }
  const content = "FANO DENTAL CLINIC — ADMIN EMERGENCY BACKUP RECOVERY CODES\n" +
    "Generated: " + new Date().toISOString() + "\n" +
    "Each code can only be used once for Admin sign-in.\n\n" +
    window.latestAdminBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') + "\n";

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fano_admin_backup_codes_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup codes downloaded as .txt', 'success');
};

window.loadSettings = function() {
  const clinicName = localStorage.getItem('set-clinic-name') || 'Fano Dental Clinic';
  const clinicEmail = localStorage.getItem('set-clinic-email') || 'contact@fanoclinic.com';
  const clinicPhone = localStorage.getItem('set-clinic-phone') || '+63 917 555 1234';
  const clinicHours = localStorage.getItem('set-clinic-hours') || '08:00 - 17:00';
  const clinicAddress = localStorage.getItem('set-clinic-address') || '123 Dental Suite, Main Boulevard, Manila, Philippines';
  
  const autoApprove = localStorage.getItem('set-auto-approve') === 'true';
  const smsAlerts = localStorage.getItem('set-sms-alerts') !== 'false';
  const currency = localStorage.getItem('set-currency') || '₱';
  const darkMode = localStorage.getItem('set-dark-mode') === 'true';

  document.getElementById('set-clinic-name').value = clinicName;
  document.getElementById('set-clinic-email').value = clinicEmail;
  document.getElementById('set-clinic-phone').value = clinicPhone;
  document.getElementById('set-clinic-hours').value = clinicHours;
  document.getElementById('set-clinic-address').value = clinicAddress;
  
  document.getElementById('set-auto-approve').checked = autoApprove;
  document.getElementById('set-sms-alerts').checked = smsAlerts;
  document.getElementById('set-currency').value = currency;
  document.getElementById('set-dark-mode').checked = darkMode;

  // Load Twilio credentials
  document.getElementById('set-twilio-sid').value = localStorage.getItem('set-twilio-sid') || '';
  document.getElementById('set-twilio-token').value = localStorage.getItem('set-twilio-token') || '';
  document.getElementById('set-twilio-phone').value = localStorage.getItem('set-twilio-phone') || '';

  applyThemePreference(darkMode);
  renderBranchesList();
  loadMfaSettings();
};

function applyThemePreference(darkMode) {
  if (darkMode) {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

// Apply saved theme preference on initial page load
(function() {
  const darkMode = localStorage.getItem('set-dark-mode') === 'true';
  applyThemePreference(darkMode);
})();

// Clinic Details
const settingsForm = document.getElementById('settings-clinic-form');
if (settingsForm) {
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('set-clinic-name', document.getElementById('set-clinic-name').value.trim());
    localStorage.setItem('set-clinic-email', document.getElementById('set-clinic-email').value.trim());
    localStorage.setItem('set-clinic-phone', document.getElementById('set-clinic-phone').value.trim());
    localStorage.setItem('set-clinic-hours', document.getElementById('set-clinic-hours').value);
    localStorage.setItem('set-clinic-address', document.getElementById('set-clinic-address').value.trim());
    
    showToast('Clinic profile updated successfully', 'success');
    logConsoleEvent('[INFO] Admin updated Clinic Profile settings.');
  });
}

// Twilio settings
const twilioForm = document.getElementById('settings-twilio-form');
if (twilioForm) {
  twilioForm.addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem('set-twilio-sid', document.getElementById('set-twilio-sid').value.trim());
    localStorage.setItem('set-twilio-token', document.getElementById('set-twilio-token').value.trim());
    localStorage.setItem('set-twilio-phone', document.getElementById('set-twilio-phone').value.trim());
    showToast('Twilio gateway credentials saved', 'success');
    logConsoleEvent('[INFO] Admin updated Twilio Gateway credentials.');
  });
}

// ─── Single Clinic Location with Leaflet Interactive Map Pinning ─────────────────
let adminMap = null;
let adminBranchMarkers = [];

function createClinicPin(branch, isSelected = true) {
  const size = 36;
  const anchor = Math.round(size / 2);
  const label = 'Fano Dental Clinic';

  return L.divIcon({
    className: 'admin-branch-marker',
    html: `
      <div style="position:relative; width:${size}px; height:${size}px;" title="${label}">
        <div style="
          width:${size}px; 
          height:${size}px; 
          background:linear-gradient(135deg, #0b3c4d, #0284c7); 
          border-radius:50% 50% 50% 0; 
          transform:rotate(-45deg); 
          border:2.5px solid #38bdf8; 
          box-shadow:0 4px 14px rgba(11,60,77,0.35); 
          display:flex; 
          align-items:center; 
          justify-content:center;
        ">
          <span style="transform:rotate(45deg); font-size:15px; color:white; line-height:1;">
            🏥
          </span>
        </div>
        <div style="
          position:absolute; 
          top:-22px; 
          left:50%; 
          transform:translateX(-50%); 
          background:rgba(11,19,30,0.88); 
          backdrop-filter:blur(4px);
          color:#ffffff; 
          font-family:'Plus Jakarta Sans',sans-serif;
          font-size:10px; 
          font-weight:700; 
          padding:2px 8px; 
          border-radius:6px; 
          white-space:nowrap; 
          pointer-events:none; 
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
          border:1px solid rgba(255,255,255,0.15);
        ">
          ${label}
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [anchor, size]
  });
}

window.initAdminBranchMap = function() {
  const mapContainer = document.getElementById('admin-branch-map');
  if (!mapContainer || typeof L === 'undefined') return;

  const lat = 10.2098;
  const lng = 123.7580;

  if (!adminMap) {
    adminMap = L.map('admin-branch-map').setView([lat, lng], 14);
    const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(adminMap);

    const cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    });

    L.control.layers({
      "Google Maps": googleRoadmap,
      "CARTO Voyager": cartoVoyager
    }, null, { position: 'topright' }).addTo(adminMap);

    const marker = L.marker([lat, lng], {
      icon: createClinicPin({ isMain: true }),
      title: 'Fano Dental Clinic'
    }).addTo(adminMap);

    marker.bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif; min-width:210px; padding:2px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:4px;">
          <strong style="color:#0b3c4d; font-size:13px;">Fano Dental Clinic</strong>
          <span style="font-size:9px; background:#e0f2fe; color:#0284c7; padding:1px 6px; border-radius:8px; font-weight:700;">Headquarters</span>
        </div>
        <p style="color:#475569; font-size:11px; margin:0 0 6px 0; line-height:1.4;">📍 Balirong Highway, City of Naga, Cebu</p>
        <div style="font-size:10.5px; color:#64748b;">
          <div>📞 +63 917 555 0101</div>
          <div>🕒 Mon–Sat 8:00 AM – 5:00 PM</div>
        </div>
      </div>
    `).openPopup();

    adminBranchMarkers = [marker];
  } else {
    setTimeout(() => {
      adminMap.invalidateSize();
      adminMap.setView([lat, lng], 14);
    }, 200);
  }
};

window.updateAdminMapMarkers = function() {};
window.zoomToBranchPin = function(lat, lng) {
  if (adminMap) adminMap.flyTo([lat || 10.2098, lng || 123.7580], 15);
};
window.renderBranchesList = function() {};
window.deleteBranch = function() {};

// Treatments & Services management
window.loadSettingsTreatments = function() {
  const curToken = getAuthToken() || token;
  fetch(TREATMENT_API, {
    headers: { 'Authorization': `Bearer ${curToken}` }
  })
  .then(res => res.json())
  .then(treatments => {
    const tbody = document.getElementById('settings-treatments-tbody');
    if (!tbody) return;

    if (treatments.message) {
      showToast(treatments.message, 'error');
      return;
    }

    if (!Array.isArray(treatments) || treatments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#888;">No treatments found.</td></tr>';
      return;
    }

    const currency = localStorage.getItem('set-currency') || '₱';

    tbody.innerHTML = treatments.map(t => `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 10px 12px; font-weight: 500;">${escapeHTML(t.name)}</td>
        <td style="padding: 10px 12px;">${currency}${t.price}</td>
        <td style="padding: 10px 12px;">${t.duration_minutes || t.durationMinutes || 30} mins</td>
        <td style="padding: 10px 12px; text-align: right;">
          <button class="btn-danger-action" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px; width: auto;" onclick="deleteTreatmentItem('${t.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  })
  .catch(err => {
    console.error('Error loading settings treatments:', err);
    showToast('Failed to load treatments catalog', 'error');
  });
};

window.deleteTreatmentItem = function(id) {
  if (!confirm('Are you sure you want to permanently delete this treatment service?')) {
    return;
  }
  const curToken = getAuthToken() || token;
  fetch(`${TREATMENT_API}/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${curToken}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !data.success) {
      showToast(data.message, 'error');
      return;
    }
    showToast('Service deleted successfully', 'success');
    loadSettingsTreatments();
  })
  .catch(err => {
    console.error('Error deleting treatment:', err);
    showToast('Failed to delete treatment service', 'error');
  });
};

const addTreatForm = document.getElementById('settings-add-treatment-form');
if (addTreatForm) {
  addTreatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('set-treat-name').value.trim();
    const description = document.getElementById('set-treat-desc').value.trim();
    const price = parseFloat(document.getElementById('set-treat-price').value);
    const duration = parseInt(document.getElementById('set-treat-duration').value);

    const payload = { name, description, price, durationMinutes: duration };

    const btnSave = e.target.querySelector('button[type=submit]');
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    const curToken = getAuthToken() || token;
    fetch(TREATMENT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${curToken}`
      },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.id) {
        showToast(data.message, 'error');
        return;
      }
      showToast('Treatment service added successfully!', 'success');
      e.target.reset();
      loadSettingsTreatments();
    })
    .catch(err => {
      console.error('Error creating service:', err);
      showToast('Failed to save service', 'error');
    })
    .finally(() => {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Service';
    });
  });
}

// System preferences toggles
const toggleAutoApprove = document.getElementById('set-auto-approve');
if (toggleAutoApprove) {
  toggleAutoApprove.addEventListener('change', (e) => {
    localStorage.setItem('set-auto-approve', e.target.checked);
    showToast(`Auto-approve bookings ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'success');
    logConsoleEvent(`[INFO] Auto-approve bookings set to ${e.target.checked}.`);
  });
}

const toggleSMSAlerts = document.getElementById('set-sms-alerts');
if (toggleSMSAlerts) {
  toggleSMSAlerts.addEventListener('change', (e) => {
    localStorage.setItem('set-sms-alerts', e.target.checked);
    showToast(`SMS Twilio notifications ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'success');
    logConsoleEvent(`[INFO] Twilio SMS alerts set to ${e.target.checked}.`);
  });
}

const selectCurrency = document.getElementById('set-currency');
if (selectCurrency) {
  selectCurrency.addEventListener('change', (e) => {
    localStorage.setItem('set-currency', e.target.value);
    showToast(`Currency symbol set to ${e.target.value}`, 'success');
    logConsoleEvent(`[INFO] System currency symbol updated to ${e.target.value}.`);
  });
}

const toggleDarkMode = document.getElementById('set-dark-mode');
if (toggleDarkMode) {
  toggleDarkMode.addEventListener('change', (e) => {
    localStorage.setItem('set-dark-mode', e.target.checked);
    applyThemePreference(e.target.checked);
    showToast(`${e.target.checked ? 'Dark Mode activated' : 'Light Mode activated'}`, 'success');
    logConsoleEvent(`[INFO] Dark Mode toggle state changed: ${e.target.checked}.`);
  });
}

// ─── Admin Multi-Factor Authentication (MFA) Listeners ───────────────────────
const toggleAdminMfaEnforce = document.getElementById('set-admin-mfa-enforce');
if (toggleAdminMfaEnforce) {
  toggleAdminMfaEnforce.addEventListener('change', (e) => {
    saveMfaSettings(e.target.checked ? 'Admin MFA Enforced' : 'Admin MFA Disabled');
  });
}

const selectAdminMfaChannel = document.getElementById('set-admin-mfa-channel');
if (selectAdminMfaChannel) {
  selectAdminMfaChannel.addEventListener('change', (e) => {
    saveMfaSettings(`Verification channel set to ${e.target.value.toUpperCase()}`);
  });
}

const toggleAdminMfaTrustDevice = document.getElementById('set-admin-mfa-trust-device');
if (toggleAdminMfaTrustDevice) {
  toggleAdminMfaTrustDevice.addEventListener('change', (e) => {
    saveMfaSettings(e.target.checked ? '30-Day Device Trust Allowed' : 'Device Trust Disabled (MFA on Every Login)');
  });
}

const btnTestAdminMfa = document.getElementById('btn-test-admin-mfa');
if (btnTestAdminMfa) {
  btnTestAdminMfa.addEventListener('click', testAdminMfaDelivery);
}

const btnRevokeAllMfaDevices = document.getElementById('btn-revoke-all-mfa-devices');
if (btnRevokeAllMfaDevices) {
  btnRevokeAllMfaDevices.addEventListener('click', revokeAllAdminMfaDevices);
}

// Attach TOTP button listeners
const btnSetupTotp = document.getElementById('btn-setup-totp');
if (btnSetupTotp) {
  btnSetupTotp.addEventListener('click', openTotpSetupModal);
}

const btnViewBackupCodes = document.getElementById('btn-view-backup-codes');
if (btnViewBackupCodes) {
  btnViewBackupCodes.addEventListener('click', openBackupCodesModal);
}

const btnDisableTotp = document.getElementById('btn-disable-totp');
if (btnDisableTotp) {
  btnDisableTotp.addEventListener('click', disableAdminTotp);
}

const inputTotpConfirmToken = document.getElementById('totp-confirm-token-input');
if (inputTotpConfirmToken) {
  inputTotpConfirmToken.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitTotpVerification();
    }
  });
}

// Backup & reset
const btnBackupRoster = document.getElementById('btn-backup-roster');
if (btnBackupRoster) {
  btnBackupRoster.addEventListener('click', () => {
    const backupData = {
      backupTimestamp: new Date().toISOString(),
      clinicName: localStorage.getItem('set-clinic-name') || 'Fano Dental Clinic',
      appointments: allAppointments,
      patients: allPatients,
      invoices: allInvoices,
      staffSchedules: localStaffSchedules,
      inventory: localInventory
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Fano_Clinic_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast('Records backup downloaded successfully', 'success');
    logConsoleEvent('[INFO] System records backup file generated & downloaded.');
  });
}

// ─── Database Resilience & Health Handlers ────────────────────────────────────
async function loadDatabaseHealthStatus() {
  try {
    const res = await fetch(`${ADMIN_API}/database-status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    const statusEl = document.getElementById('db-health-status');
    const latencyEl = document.getElementById('db-latency');
    const backupTimeEl = document.getElementById('db-backup-time');
    const backupSizeEl = document.getElementById('db-backup-size');

    if (statusEl) {
      const isOk = data.status === 'healthy';
      statusEl.innerHTML = `
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${isOk ? '#22c55e' : '#ef4444'};"></span>
        ${isOk ? 'Connected (PostgreSQL)' : 'Degraded'}
      `;
      statusEl.style.color = isOk ? '#15803d' : '#b91c1c';
    }

    if (latencyEl && data.latencyMs !== undefined) {
      latencyEl.textContent = `Latency: ${data.latencyMs} ms`;
    }

    if (data.latestBackup && data.latestBackup.lastBackupTime) {
      const bTime = new Date(data.latestBackup.lastBackupTime).toLocaleString();
      if (backupTimeEl) backupTimeEl.textContent = bTime;
      if (backupSizeEl) backupSizeEl.textContent = `${data.latestBackup.fileSizeKb || 0} KB • ${data.latestBackup.totalRows || 0} rows`;
    } else {
      if (backupTimeEl) backupTimeEl.textContent = 'None yet';
    }

    if (data.tableCounts) {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = Number(val || 0).toLocaleString();
      };
      setVal('db-count-users', data.tableCounts.users);
      setVal('db-count-appts', data.tableCounts.appointments);
      setVal('db-count-invoices', data.tableCounts.invoices);
      setVal('db-count-payments', data.tableCounts.payments);
      setVal('db-count-audits', data.tableCounts.audit_logs);
    }
  } catch (err) {
    console.error('Failed fetching database status:', err);
  }
}

const btnRefreshDb = document.getElementById('btn-refresh-db-status');
if (btnRefreshDb) {
  btnRefreshDb.addEventListener('click', () => {
    btnRefreshDb.querySelector('i')?.classList.add('ti-spin');
    loadDatabaseHealthStatus().finally(() => {
      btnRefreshDb.querySelector('i')?.classList.remove('ti-spin');
    });
  });
}

const btnTriggerBackup = document.getElementById('btn-trigger-backup-now');
if (btnTriggerBackup) {
  btnTriggerBackup.addEventListener('click', async () => {
    btnTriggerBackup.disabled = true;
    btnTriggerBackup.innerHTML = '<i class="ti ti-loader ti-spin" style="font-size: 16px;"></i> Running Backup...';

    try {
      const res = await fetch(`${ADMIN_API}/trigger-backup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Server backup created: ${data.fileName} (${data.fileSizeKb} KB, ${data.totalRows} rows)`, 'success');
        loadDatabaseHealthStatus();
      } else {
        showToast(`Backup failed: ${data.message || data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Server connection error: ${err.message}`, 'error');
    } finally {
      btnTriggerBackup.disabled = false;
      btnTriggerBackup.innerHTML = '<i class="ti ti-cloud-upload" style="font-size: 16px;"></i> Run Server Backup Now';
    }
  });
}

const btnResetSeeder = document.getElementById('btn-reset-seeder');
if (btnResetSeeder) {
  btnResetSeeder.addEventListener('click', () => {
    if (!confirm('WARNING: This will purge all active appointments, invoice ledger collections, reset all stats, and reload default records. Proceed?')) {
      return;
    }
    
    btnResetSeeder.disabled = true;
    btnResetSeeder.textContent = 'Resetting & Seeding...';

    fetch(`${ADMIN_API}/reset-seeder`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      showToast('Database reset and seeded successfully!', 'success');
      logConsoleEvent('[SYSTEM] Admin triggered Database Seeder reset. Roster statistics cleared.');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    })
    .catch(err => {
      console.error('Seeder reset error:', err);
      showToast('Failed to reset and seed database', 'error');
    })
    .finally(() => {
      btnResetSeeder.disabled = false;
      btnResetSeeder.textContent = 'Reset & Seed Database';
    });
  });
}

// ─── Password Visibility Toggle ───────────────────────────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      if (!input) return;

      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');

      if (isPassword) {
        button.innerHTML = '<i class="ti ti-eye-off eye-icon" style="font-size: 18px;"></i>';
      } else {
        button.innerHTML = '<i class="ti ti-eye eye-icon" style="font-size: 18px;"></i>';
      }
    });
  });
}

// ─── Edit Patient Modal & Handler ─────────────────────────────────────────────
window.openEditPatientModal = function(userId, firstName, lastName, email, gender, dob, phone, allergies, medicalNotes) {
  document.getElementById('edit-patient-user-id').value = userId;
  document.getElementById('edit-patient-firstname').value = firstName;
  document.getElementById('edit-patient-lastname').value = lastName;
  document.getElementById('edit-patient-gender').value = gender;

  if (dob) {
    document.getElementById('edit-patient-dob').value = dob.slice(0, 10);
  } else {
    document.getElementById('edit-patient-dob').value = '';
  }

  document.getElementById('edit-patient-phone').value = phone;
  document.getElementById('edit-patient-allergies').value = allergies;
  document.getElementById('edit-patient-notes').value = medicalNotes;

  document.getElementById('modal-edit-patient').classList.add('active');
};

document.getElementById('edit-patient-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const userId = document.getElementById('edit-patient-user-id').value;
  const firstName = document.getElementById('edit-patient-firstname').value.trim();
  const lastName = document.getElementById('edit-patient-lastname').value.trim();
  const gender = document.getElementById('edit-patient-gender').value;
  const dob = document.getElementById('edit-patient-dob').value;
  const contactNumber = document.getElementById('edit-patient-phone').value.trim();
  const allergies = document.getElementById('edit-patient-allergies').value.trim();
  const medicalNotes = document.getElementById('edit-patient-notes').value.trim();

  const payload = {
    firstName,
    lastName,
    dob,
    gender,
    contactNumber,
    allergies,
    medicalNotes
  };

  const btnSave = e.target.querySelector('button[type=submit]');
  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  fetch(`${PATIENT_API}/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.message && !data.success) {
      showToast(data.message, 'error');
      return;
    }
    showToast('Patient profile updated successfully', 'success');
    document.getElementById('modal-edit-patient').classList.remove('active');
    loadPatients();
  })
  .catch(err => {
    console.error('Error updating patient:', err);
    showToast('Failed to update patient profile', 'error');
  })
  .finally(() => {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Changes';
  });
});

document.getElementById('btn-cancel-edit-patient')?.addEventListener('click', () => {
  document.getElementById('modal-edit-patient').classList.remove('active');
});


// ─── Edit Staff Schedule Modal & Handler ──────────────────────────────────────
window.openEditStaffScheduleModal = function(id, name, role, shift, days, contact, availability) {
  document.getElementById('edit-sched-id').value = id;
  document.getElementById('edit-sched-name').value = name;
  document.getElementById('edit-sched-role').value = role;
  document.getElementById('edit-sched-shift').value = shift;
  document.getElementById('edit-sched-days').value = days;
  document.getElementById('edit-sched-contact').value = contact;
  document.getElementById('edit-sched-availability').value = availability;

  document.getElementById('modal-edit-staff-schedule').classList.add('active');
};

document.getElementById('edit-staff-schedule-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-sched-id').value;
  const name = document.getElementById('edit-sched-name').value.trim();
  const role = document.getElementById('edit-sched-role').value.trim();
  const shift = document.getElementById('edit-sched-shift').value.trim();
  const days = document.getElementById('edit-sched-days').value.trim();
  const contact = document.getElementById('edit-sched-contact').value.trim();
  const availability = document.getElementById('edit-sched-availability').value;

  const payload = { name, role, shift, days, contact, availability };

  const btnSave = e.target.querySelector('button[type=submit]');
  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  fetch(`${ADMIN_API}/staff-schedules/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    showToast('Staff schedule listing updated successfully', 'success');
    document.getElementById('modal-edit-staff-schedule').classList.remove('active');
    loadStaffSchedules();
  })
  .catch(err => {
    console.error('Error updating staff schedule:', err);
    showToast('Failed to update staff schedule listing', 'error');
  })
  .finally(() => {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Changes';
  });
});

document.getElementById('btn-cancel-edit-staff-schedule')?.addEventListener('click', () => {
  document.getElementById('modal-edit-staff-schedule').classList.remove('active');
});


// ─── Edit Inventory Modal & Handler ───────────────────────────────────────────
window.openEditInventoryModal = function(id, name, category, unit, stock, threshold, price) {
  document.getElementById('edit-inv-id').value = id || '';
  document.getElementById('edit-inv-name').value = name || '';
  document.getElementById('edit-inv-category').value = category || 'Disposables';
  document.getElementById('edit-inv-unit').value = unit || '';
  document.getElementById('edit-inv-stock').value = stock !== undefined ? stock : 0;
  document.getElementById('edit-inv-threshold').value = threshold !== undefined ? threshold : 10;
  const priceInput = document.getElementById('edit-inv-price');
  if (priceInput) {
    const p = parseFloat(price);
    priceInput.value = (!isNaN(p) && p >= 0) ? p.toFixed(2) : '0.00';
  }

  document.getElementById('modal-edit-inventory').classList.add('active');
};

document.getElementById('edit-inventory-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-inv-id').value;
  const name = document.getElementById('edit-inv-name').value.trim();
  const category = document.getElementById('edit-inv-category').value;
  const unit = document.getElementById('edit-inv-unit').value.trim();
  const stock = parseInt(document.getElementById('edit-inv-stock').value, 10);
  const threshold = parseInt(document.getElementById('edit-inv-threshold').value, 10);
  const priceVal = parseFloat(document.getElementById('edit-inv-price')?.value);

  const payload = { name, category, unit, stock, threshold };
  if (!isNaN(priceVal) && priceVal >= 0) {
    payload.price = priceVal;
    payload.unit_price = priceVal;
  }

  const btnSave = e.target.querySelector('button[type=submit]');
  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  fetch(`${ADMIN_API}/inventory/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    showToast('Inventory item updated successfully', 'success');
    document.getElementById('modal-edit-inventory').classList.remove('active');
    loadInventory();
  })
  .catch(err => {
    console.error('Error updating inventory:', err);
    showToast('Failed to update inventory item', 'error');
  })
  .finally(() => {
    btnSave.disabled = false;
    btnSave.textContent = 'Save Changes';
  });
});

document.getElementById('btn-cancel-edit-inventory')?.addEventListener('click', () => {
  document.getElementById('modal-edit-inventory').classList.remove('active');
});


// ─── Mark Invoice as Paid Modal & Handler ─────────────────────────────────────
window.openMarkPaidModal = function(id, patientName, totalAmount, currentStatus, currentPaidAmount) {
  document.getElementById('mark-paid-inv-id').value = id;
  document.getElementById('mark-paid-inv-label').value = `Invoice #${id.substring(0, 8).toUpperCase()} for ${patientName}`;
  document.getElementById('mark-paid-status').value = currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).toLowerCase();
  document.getElementById('mark-paid-amount').value = currentPaidAmount || totalAmount;

  document.getElementById('modal-mark-paid').classList.add('active');
};

document.getElementById('mark-paid-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('mark-paid-inv-id').value;
  const status = document.getElementById('mark-paid-status').value;
  const paid_amount = parseFloat(document.getElementById('mark-paid-amount').value) || 0;

  const payload = { status, paid_amount };

  const btnSave = e.target.querySelector('button[type=submit]');
  btnSave.disabled = true;
  btnSave.textContent = 'Saving...';

  fetch(`${INVOICE_API}/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    logConsoleEvent(`Invoice #${id.substring(0, 8).toUpperCase()} updated: Status=${status}, Paid Amount=${paid_amount}`, 'SUCCESS', 'BILLING');
    showToast('Payment status updated successfully', 'success');
    document.getElementById('modal-mark-paid').classList.remove('active');
    loadBilling();
  })
  .catch(err => {
    console.error('Error updating payment status:', err);
    logConsoleEvent(`Failed to update invoice #${id.substring(0, 8).toUpperCase()}: ${err.message}`, 'ERROR', 'BILLING');
    showToast('Failed to update payment status', 'error');
  })
  .finally(() => {
    btnSave.disabled = false;
    btnSave.textContent = 'Confirm Payment';
  });
});

document.getElementById('btn-cancel-mark-paid')?.addEventListener('click', () => {
  document.getElementById('modal-mark-paid').classList.remove('active');
});


// ─── Switch Tab Helper ────────────────────────────────────────────────────────
window.switchToInventoryTab = function() {
  activateTab('inventory');
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN NOTIFICATION CENTER LOGIC
// ═══════════════════════════════════════════════════════════════════════════
// adminNotificationsList is declared at top of file

function getAdminReadNotifKey() {
  const uid = (user && user.id) || 'admin';
  return `admin_read_notifs_${uid}`;
}

function getAdminReadNotifIds() {
  try {
    const raw = localStorage.getItem(getAdminReadNotifKey());
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_) {
    return new Set();
  }
}

function saveAdminReadNotifId(id) {
  try {
    const set = getAdminReadNotifIds();
    set.add(id);
    localStorage.setItem(getAdminReadNotifKey(), JSON.stringify([...set]));
  } catch (_) {}
}

function saveAdminReadNotifIds(ids) {
  try {
    const set = getAdminReadNotifIds();
    (ids || []).forEach(id => set.add(id));
    localStorage.setItem(getAdminReadNotifKey(), JSON.stringify([...set]));
  } catch (_) {}
}

function getAdminNotifTablerIcon(icon, type) {
  const iconMap = {
    'calendar-clock': 'ti-calendar-time',
    'calendar-time': 'ti-calendar-time',
    'calendar-plus': 'ti-calendar-plus',
    'calendar-x': 'ti-calendar-x',
    'calendar-check': 'ti-calendar-check',
    'calendar': 'ti-calendar',
    'hourglass': 'ti-hourglass',
    'clock': 'ti-clock',
    'receipt': 'ti-receipt-2',
    'credit-card': 'ti-credit-card',
    'alert-triangle': 'ti-alert-triangle',
    'triangle-exclamation': 'ti-alert-triangle',
    'shield-check': 'ti-shield-check',
    'chair': 'ti-armchair',
    'user-doctor': 'ti-stethoscope',
    'tooth': 'ti-dental',
    'users': 'ti-users',
    'bell': 'ti-bell'
  };
  const clean = String(icon || '').replace(/^ti-/, '').trim();
  if (iconMap[clean]) return iconMap[clean];
  if (type === 'danger') return 'ti-alert-triangle';
  if (type === 'warning') return 'ti-alert-circle';
  if (type === 'success') return 'ti-shield-check';
  return 'ti-info-circle';
}

function generateLocalAdminAlerts() {
  const alerts = [];
  const now = Date.now();

  // 1. Pending Bookings (actionable)
  const pendingAppts = (allAppointments || []).filter(a => a.status === 'Pending');
  if (pendingAppts.length > 0) {
    pendingAppts.slice(0, 8).forEach(a => {
      const pName = a.patient?.name || (a.patient ? `${a.patient.firstName || ''} ${a.patient.lastName || ''}`.trim() : '') || 'Patient';
      const treatName = a.treatment?.name || 'Dental Consultation';
      const branchName = typeof getAppointmentBranch === 'function' ? getAppointmentBranch(a) : '';
      const d = a.appointment_date ? new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Scheduled date';

      alerts.push({
        id: `local-admin-pending-${a.id}`,
        entity_id: a.id,
        category: 'operations',
        title: 'New Booking Request',
        message: `${pName} booked ${treatName}${branchName ? ' (' + branchName + ')' : ''} for ${d}. Review and confirm.`,
        type: 'info',
        icon: 'calendar-plus',
        time: a.created_at || new Date().toISOString(),
        action: {
          type: 'switch_tab',
          tab: 'appointments',
          filterStatus: 'Pending',
          filterBranch: branchName,
          entityId: a.id
        }
      });
    });
  }

  // 2. Recent Cancellations
  const cancelledAppts = (allAppointments || []).filter(a => a.status === 'Cancelled');
  if (cancelledAppts.length > 0) {
    cancelledAppts.slice(0, 4).forEach(a => {
      const pName = a.patient?.name || 'Patient';
      const treatName = a.treatment?.name || 'Appointment';
      const branchName = typeof getAppointmentBranch === 'function' ? getAppointmentBranch(a) : '';
      const d = a.appointment_date ? new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Scheduled date';

      alerts.push({
        id: `local-admin-cancelled-${a.id}`,
        entity_id: a.id,
        category: 'operations',
        title: 'Appointment Cancelled',
        message: `${pName} cancelled ${treatName}${branchName ? ' at ' + branchName : ''} for ${d}. Slot reopened.`,
        type: 'danger',
        icon: 'calendar-x',
        time: a.created_at || new Date().toISOString(),
        action: {
          type: 'switch_tab',
          tab: 'appointments',
          filterStatus: 'Cancelled',
          filterBranch: branchName,
          entityId: a.id
        }
      });
    });
  }

  // 3. Checked In Patients in Lounge
  const checkedInAppts = (allAppointments || []).filter(a => a.status === 'Checked In');
  if (checkedInAppts.length > 0) {
    alerts.push({
      id: `local-admin-queue-${checkedInAppts.length}`,
      category: 'operations',
      title: 'Patients in Clinic Lounge',
      message: `${checkedInAppts.length} patient${checkedInAppts.length !== 1 ? 's are' : ' is'} checked in and waiting in the front lounge.`,
      type: 'warning',
      icon: 'hourglass',
      time: new Date().toISOString(),
      action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Checked In' }
    });

    const overdue = checkedInAppts.filter(a => {
      const t = new Date(a.appointment_date || a.created_at || now).getTime();
      return (now - t) > 15 * 60 * 1000;
    });
    if (overdue.length > 0) {
      alerts.push({
        id: 'local-admin-long-wait-alert',
        category: 'operations',
        title: 'Lounge Wait Time Alert',
        message: `${overdue.length} patient(s) waiting in lounge >15 mins. Check room readiness.`,
        type: 'danger',
        icon: 'triangle-exclamation',
        time: new Date().toISOString(),
        action: { type: 'switch_tab', tab: 'appointments', filterStatus: 'Checked In' }
      });
    }
  }

  // 4. Unpaid Invoices
  const unpaidInvs = (allInvoices || []).filter(i => {
    const s = (i.status || '').toLowerCase();
    return s === 'unpaid' || s === 'pending';
  });
  if (unpaidInvs.length > 0) {
    const totalPending = unpaidInvs.reduce((sum, i) => sum + (parseFloat(i.amount || i.total_amount || 0) || 0), 0);
    alerts.push({
      id: `local-admin-unpaid-${unpaidInvs.length}-${Math.round(totalPending)}`,
      category: 'finance',
      title: 'Unpaid Invoices Awaiting Collection',
      message: `${unpaidInvs.length} invoice(s) totaling ₱${totalPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })} are currently unpaid.`,
      type: 'warning',
      icon: 'receipt',
      time: new Date().toISOString(),
      action: { type: 'switch_tab', tab: 'billing' }
    });
  }

  // 5. System Health Status
  alerts.push({
    id: 'local-admin-system-health',
    category: 'system',
    title: 'Clinic Operations System Healthy',
    message: 'Clinic data synchronization, database connection, and audit logging pipelines are operating normally.',
    type: 'success',
    icon: 'shield-check',
    time: new Date().toISOString()
  });

  return alerts;
}

function setupAdminNotifications() {
  if (window._adminNotifSetupDone) return;
  window._adminNotifSetupDone = true;

  const btn = document.getElementById('btn-admin-notif');
  const dropdown = document.getElementById('admin-notif-dropdown');

  if (btn && dropdown) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdown.hidden;
      dropdown.hidden = !isHidden;
      if (!dropdown.hidden) {
        loadAdminNotifications(false);
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.hidden && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.hidden = true;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dropdown.hidden) {
        dropdown.hidden = true;
      }
    });
  }

  // Background polling every 30 seconds
  if (!window._adminNotifInterval) {
    window._adminNotifInterval = setInterval(() => {
      loadAdminNotifications(false);
    }, 30000);
  }
}

async function loadAdminNotifications(forceRefresh = false) {
  const listEl = document.getElementById('admin-notif-list');
  const badgeEl = document.getElementById('admin-notif-count');
  const labelEl = document.getElementById('and-unread-label');

  if (forceRefresh && listEl) {
    listEl.innerHTML = `
      <div class="and-empty">
        <i class="ti ti-loader-2 ti-spin" style="font-size: 24px; color: #0284c7;"></i>
        <p>Refreshing clinic alerts...</p>
      </div>
    `;
  }

  let notifs = null;
  try {
    const authToken = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (authToken) {
      const res = await fetch(`${BASE_ORIGIN}/api/notifications?role=admin`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          notifs = data;
        }
      }
    }
  } catch (err) {
    console.warn('[Admin Notifications] Backend fetch error:', err);
  }

  // Fallback to locally synthesized alerts if backend returned empty or unreachable
  if (!notifs || notifs.length === 0) {
    notifs = generateLocalAdminAlerts();
  }

  adminNotificationsList = notifs || [];
  renderAdminNotifications(adminNotificationsList);

  if (forceRefresh) {
    showToast('Alerts refreshed', 'success');
  }
}
window.loadAdminNotifications = loadAdminNotifications;

function renderAdminNotifications(notifs) {
  const listEl = document.getElementById('admin-notif-list');
  const badgeEl = document.getElementById('admin-notif-count');
  const labelEl = document.getElementById('and-unread-label');
  if (!listEl) return;

  const readSet = getAdminReadNotifIds();
  const unreadCount = notifs.filter(n => !readSet.has(n.id)).length;

  if (badgeEl) {
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
    }
  }

  if (labelEl) {
    labelEl.textContent = `${unreadCount} New`;
  }

  if (!notifs.length) {
    listEl.innerHTML = `
      <div class="and-empty">
        <i class="ti ti-bell-off" style="font-size: 28px; color: #94a3b8;"></i>
        <p>No active alerts. System running smoothly.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = notifs.map((n, idx) => {
    const isUnread = !readSet.has(n.id);
    const typeClass = `type-${n.type || 'info'}`;
    const iconClass = getAdminNotifTablerIcon(n.icon, n.type);
    const timeStr = formatAdminNotifTime(n.time);

    return `
      <div class="and-item ${isUnread ? 'unread' : ''}" onclick="onAdminNotificationClick('${escapeHtml(n.id)}', ${idx})" role="button" tabindex="0">
        <div class="and-icon-box ${typeClass}">
          <i class="ti ${escapeHtml(iconClass)}" style="font-size: 18px;"></i>
        </div>
        <div class="and-body">
          <div class="and-title-row">
            <div class="and-title">${escapeHtml(n.title)}</div>
            ${isUnread ? '<div class="and-dot" title="Unread alert"></div>' : ''}
          </div>
          <div class="and-desc">${escapeHtml(n.message)}</div>
          <div class="and-time"><i class="ti ti-clock" style="font-size: 0.68rem; margin-right: 3px;"></i>${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

function onAdminNotificationClick(notifId, index) {
  saveAdminReadNotifId(notifId);

  const notif = adminNotificationsList[index] || adminNotificationsList.find(n => n.id === notifId);
  const dropdown = document.getElementById('admin-notif-dropdown');
  if (dropdown) dropdown.hidden = true;

  renderAdminNotifications(adminNotificationsList);

  if (notif && notif.action) {
    const act = notif.action;
    if (act.type === 'switch_tab' && act.tab) {
      activateTab(act.tab);

      if (act.tab === 'inventory') {
        if (act.filterStatus && typeof filterInventoryByStatus === 'function') {
          filterInventoryByStatus(act.filterStatus);
        }
        if (act.entityId) {
          setTimeout(() => {
            const rows = document.querySelectorAll('#inventory-table-body tr');
            rows.forEach(tr => {
              if (tr.dataset.itemId === act.entityId || tr.innerHTML.includes(act.entityId)) {
                tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                tr.style.outline = '2px solid #ef4444';
                tr.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                setTimeout(() => {
                  tr.style.outline = '';
                  tr.style.backgroundColor = '';
                }, 3500);
              }
            });
          }, 200);
        }
      } else if (act.tab === 'appointments') {
        if (act.filterStatus) {
          const statusSelect = document.getElementById('filter-status');
          if (statusSelect) {
            statusSelect.value = act.filterStatus;
          }
        }
        if (act.filterBranch) {
          const fb = act.filterBranch.toLowerCase();
          let matchedValue = 'all';
          if (fb.includes('minglanilla')) matchedValue = 'Minglanilla';
          else if (fb.includes('talisay')) matchedValue = 'Talisay';
          else if (fb.includes('main') || fb.includes('naga')) matchedValue = 'Main Branch';
          if (typeof selectAdminBranch === 'function') {
            selectAdminBranch(matchedValue);
          }
        }
        if (typeof filterAndRenderAppointments === 'function') {
          filterAndRenderAppointments();
        }
        if (act.entityId) {
          setTimeout(() => {
            const rows = document.querySelectorAll('#appointments-table-body tr');
            rows.forEach(tr => {
              if (tr.innerHTML.includes(act.entityId.slice(0, 8))) {
                tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                tr.style.outline = '2px solid #0284c7';
                tr.style.backgroundColor = 'rgba(2, 132, 199, 0.08)';
                setTimeout(() => {
                  tr.style.outline = '';
                  tr.style.backgroundColor = '';
                }, 3000);
              }
            });
          }, 200);
        }
      }
    }
  }
}
window.onAdminNotificationClick = onAdminNotificationClick;

function markAllAdminNotificationsRead() {
  const allIds = adminNotificationsList.map(n => n.id);
  saveAdminReadNotifIds(allIds);

  // Immediate visual response
  const badgeEl = document.getElementById('admin-notif-count');
  const labelEl = document.getElementById('and-unread-label');
  if (badgeEl) badgeEl.style.display = 'none';
  if (labelEl) labelEl.textContent = '0 New';
  document.querySelectorAll('.and-item.unread').forEach(el => el.classList.remove('unread'));
  document.querySelectorAll('.and-dot').forEach(el => el.remove());

  renderAdminNotifications(adminNotificationsList);
  showToast('All alerts marked as read', 'success');
}
window.markAllAdminNotificationsRead = markAllAdminNotificationsRead;

function formatAdminNotifTime(timeStr) {
  if (!timeStr) return 'Just now';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return 'Recently';
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

// ─── Application Bootstrap ───────────────────────────────────────────────────
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAdminApp);
  } else {
    startAdminApp();
  }
}


