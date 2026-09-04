// Admin Dashboard Logic

document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

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
  return localStorage.getItem('set-currency') || '₱';
}

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
let user = null;

// Roster memory states
let allAppointments = [];
let allPatients = [];
let allInvoices = [];
let localInventory = null;
let localStaffSchedules = null;
let localUsers = [];


const defaultAdmin = {
  id: 'admin-default-id',
  name: 'Fano Admin',
  first_name: 'Fano',
  last_name: 'Admin',
  email: 'admin@fanoclinic.com',
  role: 'Admin'
};

// Always open dashboard first without forcing a redirect to login.html
function startAdminApp() {
  if (token) {
    fetch(`${AUTH_API}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (res.ok) return res.json();
      return null;
    })
    .then(data => {
      if (data && !data.message) {
        user = data;
      } else {
        user = defaultAdmin;
      }
      renderAdminSidebar();
      initDashboard();
    })
    .catch(() => {
      user = defaultAdmin;
      renderAdminSidebar();
      initDashboard();
    });
  } else {
    user = defaultAdmin;
    renderAdminSidebar();
    initDashboard();
  }
}

startAdminApp();

function renderAdminSidebar() {
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Admin';
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();
}

// ─── Initialize Dashboard Features ──────────────────────────────────────────
function initDashboard() {
  setupTabs();
  setupFilters(); // Attach keypress and select dropdown filters
  initPasswordToggles();
  initSystemLogsListeners(); // Attach live system logs search, filter, and stream controls
  setupAdminNotifications(); // Attach admin alert center listeners
  loadAdminNotifications();  // Initial fetch of admin notifications
  setInterval(() => loadAdminNotifications(), 30000); // Polling every 30s

  // Restore the active tab if page is refreshed or accessed via hash link
  const validTabs = ['overview', 'appointments', 'patients', 'billing', 'staff', 'inventory', 'users', 'history', 'logs', 'settings'];
  const hashTab = (window.location.hash || '').replace('#', '').trim();
  const savedTab = localStorage.getItem('admin_active_tab');
  const initialTab = validTabs.includes(hashTab) ? hashTab : (validTabs.includes(savedTab) ? savedTab : 'overview');

  activateTab(initialTab);
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────
window.activateTab = function(targetTab, skipDataLoad = false) {
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

  // Update breadcrumb label
  const breadcrumbMap = {
    overview: 'Dashboard Overview',
    appointments: 'Appointments Agenda',
    patients: 'Patients Directory',
    billing: 'Billing & Invoices',
    staff: 'Staff Management',
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
    if (!logsPollingInterval) {
      logsPollingInterval = setInterval(loadSystemLogs, 4000);
    }
  } else {
    if (logsPollingInterval) {
      clearInterval(logsPollingInterval);
      logsPollingInterval = null;
    }
  }

  // Persist current active tab so refreshes stay on the exact same page/tab
  try {
    localStorage.setItem('admin_active_tab', targetTab);
    // Keep the URL clean — no #hash fragments appended
    if (window.history && window.history.replaceState && window.location.hash) {
      window.history.replaceState(null, null, window.location.pathname);
    }
  } catch (e) {}

  if (!skipDataLoad) {
    if (targetTab === 'overview') {
      loadStats();
    } else if (targetTab === 'appointments') {
      loadAppointments();
    } else if (targetTab === 'patients') {
      loadPatients();
    } else if (targetTab === 'billing') {
      loadBilling();
    } else if (targetTab === 'staff') {
      loadStaffSchedules();
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
};

function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = tab.getAttribute('data-tab');
      activateTab(targetTab);
    });
  });

  // Handle browser back/forward buttons seamlessly
  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '').replace('#', '').trim();
    const validTabs = ['overview', 'appointments', 'patients', 'billing', 'staff', 'inventory', 'users', 'history', 'logs', 'settings'];
    if (hash && validTabs.includes(hash)) {
      activateTab(hash);
    }
  });
}

// ─── 1. Load Home Overview Stats ──────────────────────────────────────────────
let currentRevenuePeriod = '12months';
let currentFinancialPeriod = '12months';
let currentPatientPeriod = '12months';
let currentExpensesPeriod = '12months';
let chartSelectInitialized = false;

function loadStats() {
  fetch(`${ADMIN_API}/detailed-stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }

    // Cache responses
    allInvoices = data.invoices || [];
    allAppointments = data.allAppointments || [];

    // Fills widgets safely
    const seenEl = document.getElementById('today-seen');
    if (seenEl) seenEl.textContent = data.stats.seenToday || 0;
    
    const noShowEl = document.getElementById('today-noshows');
    if (noShowEl) noShowEl.textContent = data.stats.noShowsToday || 0;
    
    const todayRevEl = document.getElementById('today-revenue');
    if (todayRevEl) todayRevEl.textContent = `${getCurrencySymbol()}${(data.stats.revenueToday || 0).toFixed(2)}`;
    
    const monthRevEl = document.getElementById('month-revenue');
    if (monthRevEl) monthRevEl.textContent = `${getCurrencySymbol()}${(data.stats.revenueMonth || 0).toFixed(2)}`;

    // Populate timeline list safely
    const timeline = document.getElementById('today-appointments-timeline');
    if (timeline) {
      if (data.todayAppointments && data.todayAppointments.length > 0) {
        timeline.innerHTML = data.todayAppointments.map(a => {
          const timeStr = new Date(a.appointment_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const pName = a.patient ? a.patient.name : 'Unknown Patient';
          const contact = a.patient?.contact_number || 'No Phone';
          return `
            <div class="activity-item">
              <div class="activity-main">
                <h5>${escapeHTML(pName)}</h5>
                <p>Time: ${timeStr} | Contact: ${escapeHTML(contact)}</p>
              </div>
              <div style="text-align: right;">
                <span class="badge-staff" style="background:#e3fcef; color:#0e6245; font-size:0.7rem; font-weight:600; text-transform:uppercase;">${a.status}</span>
              </div>
            </div>
          `;
        }).join('');
      } else {
        timeline.innerHTML = `
          <div style="text-align: center; padding: 32px 12px; color: #888;">
            <span style="font-size: 2rem;">🗓️</span>
            <p style="margin-top: 8px; font-size: 0.9rem;">No appointments scheduled for today.</p>
          </div>
        `;
      }
    }

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

    // Render all clinical dashboard cards dynamically based on Supabase database!
    renderRevenueChart(allInvoices, currentRevenuePeriod);
    renderFinancialOverview(allInvoices, currentFinancialPeriod);
    renderPatientData(allAppointments, currentPatientPeriod);
    renderExpensesBreakdown(allInvoices, currentExpensesPeriod);

    // Initialize Period Select listener once
    if (!chartSelectInitialized) {
      const periodSelect = document.getElementById('revenue-period-select');
      if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
          currentRevenuePeriod = e.target.value;
          renderRevenueChart(allInvoices, currentRevenuePeriod);
        });
      }

      const finSelect = document.getElementById('financial-period-select');
      if (finSelect) {
        finSelect.addEventListener('change', (e) => {
          currentFinancialPeriod = e.target.value;
          renderFinancialOverview(allInvoices, currentFinancialPeriod);
          showToast(`Financial Overview updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      const patSelect = document.getElementById('patient-period-select');
      if (patSelect) {
        patSelect.addEventListener('change', (e) => {
          currentPatientPeriod = e.target.value;
          renderPatientData(allAppointments, currentPatientPeriod);
          showToast(`Patient demographics updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      const expSelect = document.getElementById('expenses-period-select');
      if (expSelect) {
        expSelect.addEventListener('change', (e) => {
          currentExpensesPeriod = e.target.value;
          renderExpensesBreakdown(allInvoices, currentExpensesPeriod);
          showToast(`Expenses breakdown updated to: ${e.target.selectedOptions[0].text}`, 'success');
        });
      }

      chartSelectInitialized = true;
    }

    logConsoleEvent('[INFO] Overview stats and dynamic chart rendered.');
  })
  .catch(err => {
    console.error('Error loading stats:', err);
    showToast('Failed to load dashboard overview', 'error');
  });
}

function renderRevenueChart(invoices, period) {
  const svg = document.getElementById('revenue-svg');
  if (!svg) return;

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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[6 - diffDays] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[29 - diffDays] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[3 - diffWeeks] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[11 - diff] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[4 - diff] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        values[invDate.getMonth()] += paid;
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

function renderFinancialOverview(invoices, period) {
  const d = new Date();
  const labels = [];
  const incomeValues = [0, 0, 0, 0, 0, 0];
  const costValues = [0, 0, 0, 0, 0, 0];

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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[5 - diffDays] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[intervalIdx] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[5 - diffWeeks] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[5 - diff] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[5 - diff] += paid;
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
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
          ? parseFloat(inv.paid_amount)
          : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
        incomeValues[intervalIdx] += paid;
      }
    });
  }

  for (let i = 0; i < 6; i++) {
    costValues[i] = incomeValues[i] * 0.45;
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

  const maxVal = Math.max(...incomeValues, ...costValues, 0);
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
    }
  }
}

function renderPatientData(appointments, period) {
  const d = new Date();
  let inPeriodAppointments = [];

  if (period === '7days') {
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 6;
    });
  } else if (period === '30days') {
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 29;
    });
  } else if (period === '4weeks') {
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diffTime = d.getTime() - apptDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      return diffWeeks >= 0 && diffWeeks <= 3;
    });
  } else if (period === '12months') {
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      const diff = (d.getFullYear() - apptDate.getFullYear()) * 12 + (d.getMonth() - apptDate.getMonth());
      return diff >= 0 && diff <= 11;
    });
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 4;
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      const yr = apptDate.getFullYear();
      return yr >= startYear && yr <= d.getFullYear();
    });
  } else {
    inPeriodAppointments = appointments.filter(a => {
      const apptDate = new Date(a.appointment_date);
      return apptDate.getFullYear() === 2026;
    });
  }

  const patientApptCountMap = {};
  appointments.forEach(a => {
    const pid = a.patient_id || a.patient?.id;
    if (pid) {
      patientApptCountMap[pid] = (patientApptCountMap[pid] || 0) + 1;
    }
  });

  let newCount = 0;
  let returningCount = 0;

  inPeriodAppointments.forEach(a => {
    const pid = a.patient_id || a.patient?.id;
    if (pid) {
      if (patientApptCountMap[pid] <= 1) {
        newCount++;
      } else {
        returningCount++;
      }
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
  if (newBar) newBar.style.width = `${newPct}%`;
  const retBar = document.getElementById('patient-bar-ret');
  if (retBar) retBar.style.width = `${retPct}%`;
}

function renderExpensesBreakdown(invoices, period) {
  const d = new Date();
  let inPeriodInvoices = [];

  if (period === '7days') {
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 6;
    });
  } else if (period === '30days') {
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 29;
    });
  } else if (period === '4weeks') {
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const diffTime = d.getTime() - invDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      return diffWeeks >= 0 && diffWeeks <= 3;
    });
  } else if (period === '12months') {
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const diff = (d.getFullYear() - invDate.getFullYear()) * 12 + (d.getMonth() - invDate.getMonth());
      return diff >= 0 && diff <= 11;
    });
  } else if (period === '5years') {
    const startYear = d.getFullYear() - 4;
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      const yr = invDate.getFullYear();
      return yr >= startYear && yr <= d.getFullYear();
    });
  } else {
    inPeriodInvoices = invoices.filter(inv => {
      const issuedStr = inv.issued_at || inv.created_at;
      if (!issuedStr) return false;
      const invDate = new Date(issuedStr);
      return invDate.getFullYear() === 2026;
    });
  }

  const totalPaid = inPeriodInvoices.reduce((sum, inv) => {
    const amt = parseFloat(inv.amount || inv.total_amount || 0);
    const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
      ? parseFloat(inv.paid_amount)
      : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
    return sum + paid;
  }, 0);

  const totalExpense = totalPaid * 0.52;

  const salaries = totalExpense * 0.42;
  const supplies = totalExpense * 0.25;
  const rent = totalExpense * 0.15;
  const equip = totalExpense * 0.12;
  const utils = totalExpense * 0.06;

  const expTotalEl = document.getElementById('expenses-total-value');
  if (expTotalEl) {
    expTotalEl.textContent = `${getCurrencySymbol()}${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const isZeroLegend = totalExpense === 0;
  const salLeg = document.getElementById('exp-legend-salaries');
  if (salLeg) salLeg.textContent = `Salaries: ${isZeroLegend ? '0' : '42'}% (${getCurrencySymbol()}${salaries.toFixed(2)})`;
  const supLeg = document.getElementById('exp-legend-supplies');
  if (supLeg) supLeg.textContent = `Supplies: ${isZeroLegend ? '0' : '25'}% (${getCurrencySymbol()}${supplies.toFixed(2)})`;
  const rentLeg = document.getElementById('exp-legend-rent');
  if (rentLeg) rentLeg.textContent = `Rent: ${isZeroLegend ? '0' : '15'}% (${getCurrencySymbol()}${rent.toFixed(2)})`;
  const eqLeg = document.getElementById('exp-legend-equip');
  if (eqLeg) eqLeg.textContent = `Equipment: ${isZeroLegend ? '0' : '12'}% (${getCurrencySymbol()}${equip.toFixed(2)})`;
  const utLeg = document.getElementById('exp-legend-utils');
  if (utLeg) utLeg.textContent = `Utilities: ${isZeroLegend ? '0' : '6'}% (${getCurrencySymbol()}${utils.toFixed(2)})`;

  const isZero = totalExpense === 0;

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

// ─── 2. Appointments Agenda & Filters ───────────────────────────────────────
function loadAppointments() {
  fetch(APPT_API, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }
    allAppointments = data || [];
    filterAndRenderAppointments();
  })
  .catch(err => {
    console.error('Error loading appointments:', err);
    showToast('Failed to load appointments agenda', 'error');
  });
}

function setupFilters() {
  const roomFilter = document.getElementById('filter-room');
  const statusFilter = document.getElementById('filter-status');
  const searchFilter = document.getElementById('appt-search');

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
    const bloodType = document.getElementById('patient-blood').value;
    const allergies = document.getElementById('patient-allergies').value.trim();
    const medicalNotes = document.getElementById('patient-notes').value.trim();

    const payload = {
      firstName,
      lastName,
      email,
      contactNumber,
      role: 'Patient',
      dob,
      gender,
      bloodType,
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
    .then(res => res.json())
    .then(data => {
      if (data.message && !data.id) {
        showToast(data.message, 'error');
        return;
      }
      
      // Optimistically update patient list immediately for snappy feel
      if (!allPatients) allPatients = [];
      let allergiesArray = [];
      if (typeof allergies === 'string') allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
      allPatients.unshift({
        id: data.id,
        user_id: data.id,
        blood_type: bloodType || 'O+',
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
  const roomVal = document.getElementById('filter-room').value;
  const statusVal = document.getElementById('filter-status').value;
  const searchVal = document.getElementById('appt-search').value.toLowerCase().trim();

  const filtered = allAppointments.filter(a => {
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

  const tbody = document.getElementById('appointments-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #888;">No matching appointments found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const d = new Date(a.appointment_date);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = `${date} at ${time}`;

    const pName = a.patient ? (a.patient.name || `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || 'Unknown Patient') : 'Unknown Patient';
    const email = a.patient ? (a.patient.email || 'No Email') : 'No Email';
    const contact = a.patient ? (a.patient.contact_number || 'N/A') : 'N/A';

    // Parse location from notes: e.g. [Location: South Branch, Fano Dental]
    let location = 'Main Branch, Fano Dental';
    const notesStr = a.notes || '';
    if (notesStr.includes('[Location: ')) {
      const start = notesStr.indexOf('[Location: ') + 11;
      const end = notesStr.indexOf(']', start);
      if (end !== -1) {
        location = notesStr.substring(start, end);
      }
    }

    const status = a.status || 'Pending';
    const statusLower = status.toLowerCase();
    const isLocked = status === 'Completed' || status === 'Cancelled';

    const statusSelectHtml = isLocked
      ? `<span class="status-badge-select status-${statusLower}" style="display: inline-block; cursor: default;" title="Status locked (${escapeHTML(status)})">${status === 'Completed' ? 'Completed' : 'Cancelled'}</span>`
      : `
        <select class="status-badge-select status-${statusLower}" onchange="updateApptStatus('${a.id}', this.value)">
          <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Approved" ${status === 'Approved' ? 'selected' : ''}>Approved</option>
          <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}> Cancelled</option>
        </select>
      `;

    const actionButtonsHtml = `
      <div class="table-action-group">
        <button type="button" class="btn-action-btn btn-edit" onclick="event.preventDefault(); openEditApptModal('${a.id}', '${escapeJS(pName)}', '${a.appointment_date}', '${escapeJS(location)}', '${a.status}', '${escapeJS(notesStr)}')">✏️ Edit</button>
        <button type="button" class="btn-action-btn btn-delete" onclick="event.preventDefault(); deleteAppt('${a.id}')">🗑️ Delete</button>
      </div>
    `;

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(pName)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(email)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(contact)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(dateStr)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(location)}</td>
        <td style="padding: 14px 16px;">${statusSelectHtml}</td>
        <td style="padding: 14px 16px; text-align: right;">${actionButtonsHtml}</td>
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
  const searchVal = document.getElementById('patient-search-input').value.toLowerCase().trim();
  const filtered = allPatients.filter(p => {
    const name = p.user ? (p.user.name || `${p.user.first_name || ''} ${p.user.last_name || ''}`.trim() || '').toLowerCase() : '';
    const email = p.user ? (p.user.email || '').toLowerCase() : '';
    const phone = p.user ? (p.user.contact_number || '') : '';
    return name.includes(searchVal) || email.includes(searchVal) || phone.includes(searchVal);
  });

  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #888;">No patients found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const firstName = p.user ? (p.user.first_name || '') : '';
    const lastName = p.user ? (p.user.last_name || '') : '';
    const name = p.user ? (p.user.name || `${firstName} ${lastName}`.trim() || 'Unknown Patient') : 'Unknown Patient';
    const email = p.user ? p.user.email : 'No Email';
    const gender = p.gender || 'Unspecified';
    const dobVal = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
    const bloodType = p.blood_type || 'Unspecified';
    const allergiesStr = Array.isArray(p.allergies) ? p.allergies.join(', ') : (p.allergies || 'None');
    const phone = p.user ? (p.user.contact_number || p.user.contactNumber || '') : '';
    const notes = p.medical_notes || '';

    // Create variables for safe escaping in onclick
    const escFirstName = escapeJS(firstName);
    const escLastName = escapeJS(lastName);
    const escEmail = escapeJS(email);
    const escGender = escapeJS(gender);
    const escDob = p.date_of_birth || '';
    const escBlood = escapeJS(bloodType);
    const escPhone = escapeJS(phone);
    const escAllergies = escapeJS(allergiesStr);
    const escNotes = escapeJS(notes);

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(name)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(email)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(gender)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(dobVal)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(bloodType)}</td>
        <td style="padding: 14px 16px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(allergiesStr)}">${escapeHTML(allergiesStr)}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
            <button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #8e44ad; color: #8e44ad; width: auto;" onclick="openEditPatientModal('${p.user_id}', '${escFirstName}', '${escLastName}', '${escEmail}', '${escGender}', '${escDob}', '${escBlood}', '${escPhone}', '${escAllergies}', '${escNotes}')">Edit</button>
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
  document.getElementById('edit-appt-id').value = apptId;
  document.getElementById('edit-appt-patient-name').value = name;
  
  if (dateIso) {
    const d = new Date(dateIso);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzoffset)).toISOString().slice(0, 16);
    document.getElementById('edit-appt-date').value = localISOTime;
  } else {
    document.getElementById('edit-appt-date').value = '';
  }

  document.getElementById('edit-appt-location').value = location;
  document.getElementById('edit-appt-status').value = status;
  
  document.getElementById('edit-appointment-form').setAttribute('data-raw-notes', rawNotes);
  document.getElementById('modal-edit-appointment').classList.add('active');
};

function escapeJS(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ─── 4. Billing Ledger & Collections ──────────────────────────────────────────
function loadBilling() {
  fetch(`${ADMIN_API}/detailed-stats`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'error');
      return;
    }

    allInvoices = data.invoices || [];

    let totalBilled = 0;
    let totalCollected = 0;

    allInvoices.forEach(inv => {
      const total = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? total : 0);

      totalBilled += total;
      totalCollected += paid;
    });

    const outstanding = totalBilled - totalCollected;

    document.getElementById('billing-total-billed').textContent = `${getCurrencySymbol()}${totalBilled.toFixed(2)}`;
    document.getElementById('billing-total-collected').textContent = `${getCurrencySymbol()}${totalCollected.toFixed(2)}`;
    document.getElementById('billing-outstanding').textContent = `${getCurrencySymbol()}${outstanding.toFixed(2)}`;

    const tbody = document.getElementById('billing-table-body');
    if (allInvoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #888;">No invoices created yet.</td></tr>';
      return;
    }

    tbody.innerHTML = allInvoices.map(inv => {
      const total = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? total : 0);

      const patientName = inv.patient ? inv.patient.name : (inv.patient_name || 'Patient Roster');
      const invoiceNum = inv.id.substring(0, 8).toUpperCase();
      const issuedVal = inv.issued_at || inv.created_at;
      const issuedDateStr = issuedVal ? new Date(issuedVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';

      let statusBadge = `<span style="background:#fef0f0; color:#f56c6c; font-size:0.75rem; font-weight:700; padding:4px 8px; border-radius:4px; text-transform:uppercase;">Unpaid</span>`;
      if (inv.status?.toLowerCase() === 'paid') {
        statusBadge = `<span style="background:#f0f9eb; color:#67c23a; font-size:0.75rem; font-weight:700; padding:4px 8px; border-radius:4px; text-transform:uppercase;">Paid</span>`;
      } else if (inv.status?.toLowerCase() === 'partial') {
        statusBadge = `<span style="background:#fdf6ec; color:#e6a23c; font-size:0.75rem; font-weight:700; padding:4px 8px; border-radius:4px; text-transform:uppercase;">Partial</span>`;
      }

      const isPaid = inv.status?.toLowerCase() === 'paid';
      const actionButton = isPaid 
        ? `<button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #ccc; color: #aaa; width: auto;" disabled>Settled</button>`
        : `<button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #2ecc71; color: #2ecc71; width: auto;" onclick="openMarkPaidModal('${inv.id}', '${escapeJS(patientName)}', ${total}, '${escapeJS(inv.status || 'Unpaid')}', ${paid})">Mark Paid</button>`;

      return `
        <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
          <td style="padding: 14px 16px; font-weight: 600;">#INV-${invoiceNum}</td>
          <td style="padding: 14px 16px;">${escapeHTML(patientName)}</td>
          <td style="padding: 14px 16px;">${getCurrencySymbol()}${total.toFixed(2)}</td>
          <td style="padding: 14px 16px;">${getCurrencySymbol()}${paid.toFixed(2)}</td>
          <td style="padding: 14px 16px;">${escapeHTML(issuedDateStr)}</td>
          <td style="padding: 14px 16px;">${statusBadge}</td>
          <td style="padding: 14px 16px; text-align: right;">${actionButton}</td>
        </tr>
      `;
    }).join('');

    logConsoleEvent('[INFO] Financial ledger loaded.');
  })
  .catch(err => {
    console.error('Error loading billing ledger:', err);
    showToast('Failed to load billing details', 'error');
  });
}

// ─── 5. Staff schedules ──────────────────────────────────────────────────────
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

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(s.name)}</td>
        <td style="padding: 14px 16px;"><span class="badge-staff" style="background:#f4f0ec; color:var(--dark-color);">${s.role}</span></td>
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

function renderInventoryTable(data) {
  const tbody = document.getElementById('inventory-table-body');
  const lowBadge = document.getElementById('low-stock-count-badge');
  const lowStockItems = data.filter(item => item.status === 'Low Stock').length;

  if (lowBadge) {
    if (lowStockItems > 0) {
      lowBadge.style.display = 'inline-block';
      lowBadge.textContent = `${lowStockItems} Items Low Stock`;
    } else {
      lowBadge.style.display = 'none';
    }
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #888;">No stock listings.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => {
    const isLow = item.status === 'Low Stock';
    const statusBadge = isLow 
      ? `<span style="background:#fef0f0; color:#f56c6c; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">Low Stock</span>`
      : `<span style="background:#f0f9eb; color:#67c23a; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">In Stock</span>`;

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(item.name)}</td>
        <td style="padding: 14px 16px;">${item.category}</td>
        <td style="padding: 14px 16px; font-weight: 600;">${item.stock} ${item.unit}</td>
        <td style="padding: 14px 16px;">${item.threshold} ${item.unit}</td>
        <td style="padding: 14px 16px;">${statusBadge}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
            <button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #8e44ad; color: #8e44ad; width: auto;" onclick="openEditInventoryModal('${item.id}', '${escapeJS(item.name)}', '${escapeJS(item.category)}', '${escapeJS(item.unit)}', ${item.stock}, ${item.threshold})">Edit</button>
            <button onclick="reorderSupply('${escapeHTML(item.name)}')" style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: var(--secondary-color); color: white;">
              Reorder
            </button>
            <button onclick="deleteInventoryItem('${item.id}', '${escapeHTML(item.name)}')" style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: #fee2e2; color: #ef4444; transition: background 0.2s;">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.reorderSupply = function(itemName) {
  showToast(`Reorder request submitted successfully for "${itemName}"!`, 'success');
  logConsoleEvent(`[ALERT] Admin requested reorder for item "${itemName}". PO submitted.`);
};

window.deleteInventoryItem = function(itemId, itemName) {
  showDeleteConfirmation(`Are you sure you want to delete "${itemName}" from inventory?`, () => {
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

// Client-side inventory filter — triggered by search input and dropdowns
window.filterInventory = function() {
  if (!localInventory) return;

  const search = (document.getElementById('inventory-search')?.value || '').toLowerCase().trim();
  const category = document.getElementById('inventory-filter-category')?.value || 'all';
  const status = document.getElementById('inventory-filter-status')?.value || 'all';

  const filtered = localInventory.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search);
    const matchCat = category === 'all' || item.category === category;
    const matchStatus = status === 'all' || item.status === status;
    return matchSearch && matchCat && matchStatus;
  });

  // Render filtered results (skip the badge update to keep it reflecting full inventory)
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #888;">No matching items found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isLow = item.status === 'Low Stock';
    const statusBadge = isLow
      ? `<span style="background:#fef0f0; color:#f56c6c; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">Low Stock</span>`
      : `<span style="background:#f0f9eb; color:#67c23a; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700; text-transform:uppercase;">In Stock</span>`;

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(item.name)}</td>
        <td style="padding: 14px 16px;">${item.category}</td>
        <td style="padding: 14px 16px; font-weight: 600;">${item.stock} ${item.unit}</td>
        <td style="padding: 14px 16px;">${item.threshold} ${item.unit}</td>
        <td style="padding: 14px 16px;">${statusBadge}</td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
            <button class="slot-btn" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 6px; border-color: #8e44ad; color: #8e44ad; width: auto;" onclick="openEditInventoryModal('${item.id}', '${escapeJS(item.name)}', '${escapeJS(item.category)}', '${escapeJS(item.unit)}', ${item.stock}, ${item.threshold})">Edit</button>
            <button onclick="reorderSupply('${escapeHTML(item.name)}')" style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: var(--secondary-color); color: white;">
              Reorder
            </button>
            <button onclick="deleteInventoryItem('${item.id}', '${escapeHTML(item.name)}')" style="padding: 6px 12px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.8rem; background: #fee2e2; color: #ef4444; transition: background 0.2s;">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${escapeHTML(displayName)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(u.email)}</td>
        <td style="padding: 14px 16px;"><span class="badge-staff" style="background:#f4f0ec; color:var(--dark-color);">${u.role}</span></td>
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
    const status = stock < threshold ? 'Low Stock' : 'In Stock';

    fetch(`${ADMIN_API}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, category, unit, stock, threshold, status })
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

    // Prevent duplicate accounts by email or full name
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const isDuplicateAccount = (localUsers || []).some(u => {
      const uEmail = (u.email || '').toLowerCase();
      const uName = (u.name || `${u.first_name || ''} ${u.last_name || ''}`).toLowerCase();
      return uEmail === email || (fullName.length > 3 && uName === fullName);
    });

    if (isDuplicateAccount) {
      showToast(`An account with email "${email}" or name "${firstName} ${lastName}" already exists!`, 'error');
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
let allSystemLogs = [];
let logsPollingInterval = null;

function loadSystemLogs() {
  fetch(`${ADMIN_API}/logs`, {
    headers: { 'Authorization': `Bearer ${token}` }
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
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}

// ─── Sidebar Collapse Toggle ───────────────────────────────────────────────────
const sbCollapseBtn = document.getElementById('sb-collapse-btn');
const sidebarEl = document.getElementById('sidebar');

if (sbCollapseBtn && sidebarEl) {
  sbCollapseBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
  });
}

// ─── Custom Delete Confirmation Modal ──────────────────────────────────────────
let onDeleteConfirmCallback = null;

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
  modal.classList.add('active');
}

const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const modalConfirmDelete = document.getElementById('modal-confirm-delete');

if (btnCancelDelete) {
  btnCancelDelete.addEventListener('click', (e) => {
    e.preventDefault();
    modalConfirmDelete.classList.remove('active');
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
function loadVisitsHistory() {
  if (allAppointments.length === 0) {
    fetch(APPT_API, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        showToast(data.message, 'error');
        return;
      }
      allAppointments = data || [];
      filterAndRenderHistory();
    })
    .catch(err => {
      console.error('Error loading history:', err);
      showToast('Failed to load visits history', 'error');
    });
  } else {
    filterAndRenderHistory();
  }
}

function filterAndRenderHistory() {
  const searchInput = document.getElementById('history-search-input');
  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const statusFilterEl = document.getElementById('history-status-filter');
  const statusFilterVal = statusFilterEl ? statusFilterEl.value : 'all';

  const filtered = allAppointments.filter(a => {
    const patientName = a.patient ? (a.patient.name || `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || '').toLowerCase() : '';
    const treatmentName = a.treatment ? (a.treatment.name || '').toLowerCase() : 'general consultation';
    const status = (a.status || 'Pending').toLowerCase();
    
    const matchesSearch = patientName.includes(searchVal) || treatmentName.includes(searchVal);
    const matchesStatus = (statusFilterVal === 'all' || status === statusFilterVal.toLowerCase());

    return matchesSearch && matchesStatus;
  });

  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding: 24px; text-align: center; color: #888;">No history records found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const date = new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = new Date(a.appointment_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const pName = a.patient ? (a.patient.name || `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || 'Unknown Patient') : 'Unknown Patient';
    const treatment = a.treatment ? a.treatment.name : 'General Consultation';
    const dentistName = a.dentist ? (a.dentist.name || 'Staff') : 'Staff';
    const status = a.status || 'Pending';

    let statusClr = '#888';
    if (status === 'Completed') statusClr = '#2ecc71';
    else if (status === 'Approved') statusClr = '#3498db';
    else if (status === 'Pending') statusClr = '#e6a23c';
    else if (status === 'Cancelled') statusClr = '#e74c3c';

    return `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--dark-color);">
        <td style="padding: 14px 16px; font-weight: 500;">${date} at ${time}</td>
        <td style="padding: 14px 16px;">${escapeHTML(pName)}</td>
        <td style="padding: 14px 16px;">${escapeHTML(treatment)}</td>
        <td style="padding: 14px 16px; font-weight: 600; color: ${statusClr}">${status}</td>
        <td style="padding: 14px 16px;">${escapeHTML(dentistName)}</td>
      </tr>
    `;
  }).join('');
}

// ─── 11. Clinic Settings Functions ─────────────────────────────────────────────
window.switchSettingsSection = function(sectionId, element) {
  document.querySelectorAll('.settings-inner-tab').forEach(t => {
    t.classList.remove('active');
    t.style.color = '#888';
    t.style.borderBottom = 'none';
  });
  
  element.classList.add('active');
  element.style.color = 'var(--secondary-color)';
  element.style.borderBottom = '2px solid var(--secondary-color)';

  document.querySelectorAll('.settings-sec-pane').forEach(p => {
    p.style.display = 'none';
  });

  document.getElementById(`settings-sec-${sectionId}`).style.display = 'block';

  if (sectionId === 'services') {
    loadSettingsTreatments();
  }
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

// Branches management with Leaflet Interactive Map Pinning
let adminMap = null;
let adminNewMarker = null;
let adminBranchMarkers = [];

window.initAdminBranchMap = function() {
  const mapContainer = document.getElementById('admin-branch-map');
  if (!mapContainer || typeof L === 'undefined') return;

  if (!adminMap) {
    adminMap = L.map('admin-branch-map').setView([10.2098, 123.7580], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(adminMap);

    // Map click handler to pin location & auto-fill lat/lng
    adminMap.on('click', function(e) {
      const lat = e.latlng.lat.toFixed(5);
      const lng = e.latlng.lng.toFixed(5);

      const latInput = document.getElementById('branch-input-lat');
      const lngInput = document.getElementById('branch-input-lng');
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;

      if (adminNewMarker) {
        adminNewMarker.setLatLng(e.latlng);
      } else {
        adminNewMarker = L.marker(e.latlng, { draggable: true }).addTo(adminMap);
        adminNewMarker.bindPopup('<b>New Branch Pin</b><br>Drag or click to adjust location').openPopup();

        adminNewMarker.on('dragend', function(event) {
          const pos = event.target.getLatLng();
          if (latInput) latInput.value = pos.lat.toFixed(5);
          if (lngInput) lngInput.value = pos.lng.toFixed(5);
        });
      }

      showToast(`Pin set at Lat: ${lat}, Lng: ${lng}`, 'info');
    });
  } else {
    setTimeout(() => { adminMap.invalidateSize(); }, 200);
  }

  updateAdminMapMarkers();
};

function updateAdminMapMarkers() {
  if (!adminMap || typeof L === 'undefined') return;

  // Clear existing markers
  adminBranchMarkers.forEach(m => adminMap.removeLayer(m));
  adminBranchMarkers = [];

  const detailedBranches = JSON.parse(localStorage.getItem('set-clinic-branches-detailed')) || [
    { name: 'Fano Dental Clinic — Main Branch', address: 'Balirong Highway, City of Naga, Cebu', lat: 10.2098, lng: 123.7580 },
    { name: 'Fano Dental Clinic — Minglanilla', address: 'Poblacion Ward II, Minglanilla, Cebu', lat: 10.2450, lng: 123.7960 }
  ];

  const bounds = [];
  detailedBranches.forEach(b => {
    if (b.lat && b.lng) {
      const marker = L.marker([b.lat, b.lng]).addTo(adminMap);
      marker.bindPopup(`<b>${escapeHTML(b.name)}</b><br>${escapeHTML(b.address || 'Clinic Branch')}`);
      adminBranchMarkers.push(marker);
      bounds.push([b.lat, b.lng]);
    }
  });

  if (bounds.length > 0) {
    adminMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }
}

window.renderBranchesList = function() {
  const listContainer = document.getElementById('settings-branches-list');
  if (!listContainer) return;

  const defaultDetailed = [
    { name: 'Fano Dental Clinic — Main Branch', address: 'Balirong Highway, City of Naga, Cebu', lat: 10.2098, lng: 123.7580 },
    { name: 'Fano Dental Clinic — Minglanilla', address: 'Poblacion Ward II, Minglanilla, Cebu', lat: 10.2450, lng: 123.7960 }
  ];

  const detailedBranches = JSON.parse(localStorage.getItem('set-clinic-branches-detailed')) || defaultDetailed;
  localStorage.setItem('set-clinic-branches-detailed', JSON.stringify(detailedBranches));

  // Maintain string list for legacy selects
  const branchNames = detailedBranches.map(b => typeof b === 'string' ? b : b.name);
  localStorage.setItem('set-clinic-branches', JSON.stringify(branchNames));

  if (detailedBranches.length === 0) {
    listContainer.innerHTML = '<span style="font-size:0.85rem; color:#888; font-style:italic;">No branches configured.</span>';
  } else {
    listContainer.innerHTML = detailedBranches.map((b, idx) => {
      const name = typeof b === 'string' ? b : b.name;
      const addr = typeof b === 'object' && b.address ? b.address : '';
      const lat = typeof b === 'object' && b.lat ? b.lat : '';
      const lng = typeof b === 'object' && b.lng ? b.lng : '';

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f9f9f9; border:1px solid #eee; border-radius:10px; padding:10px 14px; font-size:0.85rem; color:var(--dark-color);">
          <div>
            <div style="font-weight:700; color:var(--secondary-color);">${escapeHTML(name)}</div>
            ${addr ? `<div style="font-size:0.78rem; color:#666;">📍 ${escapeHTML(addr)}</div>` : ''}
            ${lat && lng ? `<div style="font-size:0.74rem; color:#888;">Coordinates: ${lat}, ${lng}</div>` : ''}
          </div>
          <button class="btn-danger-action" style="padding:4px 10px; font-size:0.75rem; border-radius:6px; width:auto; height:auto;" onclick="deleteBranch(${idx})">Delete</button>
        </div>
      `;
    }).join('');
  }

  const editSelect = document.getElementById('edit-appt-location');
  if (editSelect) {
    editSelect.innerHTML = branchNames.map(b => `<option value="${escapeHTML(b)}">${escapeHTML(b)}</option>`).join('');
  }

  // Initialize/refresh map
  setTimeout(() => {
    initAdminBranchMap();
  }, 100);
};

window.deleteBranch = function(idx) {
  const detailedBranches = JSON.parse(localStorage.getItem('set-clinic-branches-detailed')) || [];
  detailedBranches.splice(idx, 1);
  localStorage.setItem('set-clinic-branches-detailed', JSON.stringify(detailedBranches));

  const branchNames = detailedBranches.map(b => typeof b === 'string' ? b : b.name);
  localStorage.setItem('set-clinic-branches', JSON.stringify(branchNames));

  renderBranchesList();
  showToast('Branch removed successfully', 'success');
};

const addBranchForm = document.getElementById('add-branch-form');
if (addBranchForm) {
  addBranchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('branch-input-name');
    const addrInput = document.getElementById('branch-input-address');
    const latInput = document.getElementById('branch-input-lat');
    const lngInput = document.getElementById('branch-input-lng');

    const name = nameInput?.value.trim();
    const address = addrInput?.value.trim() || '';
    const lat = parseFloat(latInput?.value) || 10.2098;
    const lng = parseFloat(lngInput?.value) || 123.7580;

    if (!name) {
      showToast('Branch name is required', 'error');
      return;
    }

    const detailedBranches = JSON.parse(localStorage.getItem('set-clinic-branches-detailed')) || [];
    if (detailedBranches.some(b => (typeof b === 'string' ? b : b.name).toLowerCase() === name.toLowerCase())) {
      showToast('A branch with this name already exists', 'error');
      return;
    }

    detailedBranches.push({ name, address, lat, lng });
    localStorage.setItem('set-clinic-branches-detailed', JSON.stringify(detailedBranches));

    const branchNames = detailedBranches.map(b => b.name);
    localStorage.setItem('set-clinic-branches', JSON.stringify(branchNames));

    nameInput.value = '';
    if (addrInput) addrInput.value = '';
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';

    if (adminNewMarker && adminMap) {
      adminMap.removeLayer(adminNewMarker);
      adminNewMarker = null;
    }

    renderBranchesList();
    showToast('New clinic branch & pin added successfully!', 'success');
  });
}

// Treatments & Services management
window.loadSettingsTreatments = function() {
  fetch(TREATMENT_API, {
    headers: { 'Authorization': `Bearer ${token}` }
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
  fetch(`${TREATMENT_API}/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
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

    fetch(TREATMENT_API, {
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
        button.innerHTML = `
          <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        `;
      } else {
        button.innerHTML = `
          <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
      }
    });
  });
}

// ─── Edit Patient Modal & Handler ─────────────────────────────────────────────
window.openEditPatientModal = function(userId, firstName, lastName, email, gender, dob, bloodType, phone, allergies, medicalNotes) {
  document.getElementById('edit-patient-user-id').value = userId;
  document.getElementById('edit-patient-firstname').value = firstName;
  document.getElementById('edit-patient-lastname').value = lastName;
  document.getElementById('edit-patient-gender').value = gender;

  if (dob) {
    document.getElementById('edit-patient-dob').value = dob.slice(0, 10);
  } else {
    document.getElementById('edit-patient-dob').value = '';
  }

  document.getElementById('edit-patient-blood').value = bloodType;
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
  const bloodType = document.getElementById('edit-patient-blood').value;
  const contactNumber = document.getElementById('edit-patient-phone').value.trim();
  const allergies = document.getElementById('edit-patient-allergies').value.trim();
  const medicalNotes = document.getElementById('edit-patient-notes').value.trim();

  const payload = {
    firstName,
    lastName,
    dob,
    gender,
    bloodType,
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
window.openEditInventoryModal = function(id, name, category, unit, stock, threshold) {
  document.getElementById('edit-inv-id').value = id;
  document.getElementById('edit-inv-name').value = name;
  document.getElementById('edit-inv-category').value = category;
  document.getElementById('edit-inv-unit').value = unit;
  document.getElementById('edit-inv-stock').value = stock;
  document.getElementById('edit-inv-threshold').value = threshold;

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

  const payload = { name, category, unit, stock, threshold };

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
let adminNotificationsList = [];
const ADMIN_READ_NOTIFS_KEY = 'admin_read_notif_ids';

function getAdminReadNotifIds() {
  try {
    const raw = localStorage.getItem(ADMIN_READ_NOTIFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveAdminReadNotifIds(ids) {
  try {
    localStorage.setItem(ADMIN_READ_NOTIFS_KEY, JSON.stringify(ids));
  } catch (_) {}
}

function setupAdminNotifications() {
  const btn = document.getElementById('btn-admin-notif');
  const dropdown = document.getElementById('admin-notif-dropdown');

  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.hidden;
    dropdown.hidden = !isHidden;
    if (isHidden) {
      loadAdminNotifications(false);
    }
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dropdown.hidden) {
      dropdown.hidden = true;
    }
  });
}

async function loadAdminNotifications(forceRefresh = false) {
  const listEl = document.getElementById('admin-notif-list');
  const badgeEl = document.getElementById('admin-notif-count');
  const labelEl = document.getElementById('and-unread-label');

  if (forceRefresh && listEl) {
    listEl.innerHTML = `
      <div class="and-empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        <p>Refreshing clinic alerts...</p>
      </div>
    `;
  }

  try {
    const authToken = localStorage.getItem('token') || sessionStorage.getItem('token');
    const res = await fetch(`${BASE_ORIGIN}/api/notifications`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) throw new Error('Failed to fetch notifications');
    const notifs = await res.json();
    adminNotificationsList = Array.isArray(notifs) ? notifs : [];
    renderAdminNotifications(adminNotificationsList);
  } catch (err) {
    console.error('Error fetching admin notifications:', err);
    if (listEl && (!adminNotificationsList || adminNotificationsList.length === 0)) {
      listEl.innerHTML = `
        <div class="and-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <p>No active alerts right now.</p>
        </div>
      `;
    }
  }
}
window.loadAdminNotifications = loadAdminNotifications;

function renderAdminNotifications(notifs) {
  const listEl = document.getElementById('admin-notif-list');
  const badgeEl = document.getElementById('admin-notif-count');
  const labelEl = document.getElementById('and-unread-label');
  if (!listEl) return;

  const readIds = getAdminReadNotifIds();
  const unreadCount = notifs.filter(n => !readIds.includes(n.id)).length;

  if (badgeEl) {
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badgeEl.style.display = 'inline-block';
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
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <p>No active alerts. System running smoothly.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = notifs.map((n, idx) => {
    const isUnread = !readIds.includes(n.id);
    const typeClass = `type-${n.type || 'info'}`;
    const timeStr = formatAdminNotifTime(n.time);

    let iconSvg = '';
    if (n.icon === 'triangle-exclamation') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else if (n.icon === 'calendar-clock' || n.category === 'operations') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="14" r="3"/><path d="m12 14 1.5 1.5"/></svg>';
    } else if (n.icon === 'shield-check' || n.type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    return `
      <div class="and-item ${isUnread ? 'unread' : ''}" onclick="onAdminNotificationClick('${escapeHtml(n.id)}', ${idx})">
        <div class="and-icon-box ${typeClass}">
          ${iconSvg}
        </div>
        <div class="and-body">
          <div class="and-title">${escapeHtml(n.title)}</div>
          <div class="and-desc">${escapeHtml(n.message)}</div>
          <div class="and-time">${timeStr}</div>
        </div>
        ${isUnread ? '<div class="and-dot"></div>' : ''}
      </div>
    `;
  }).join('');
}

function onAdminNotificationClick(notifId, index) {
  const readIds = getAdminReadNotifIds();
  if (!readIds.includes(notifId)) {
    readIds.push(notifId);
    saveAdminReadNotifIds(readIds);
  }

  const notif = adminNotificationsList[index] || adminNotificationsList.find(n => n.id === notifId);
  const dropdown = document.getElementById('admin-notif-dropdown');
  if (dropdown) dropdown.hidden = true;

  renderAdminNotifications(adminNotificationsList);

  if (notif && notif.action) {
    if (notif.action.type === 'switch_tab' && notif.action.tab) {
      activateTab(notif.action.tab);
    }
  }
}
window.onAdminNotificationClick = onAdminNotificationClick;

function markAllAdminNotificationsRead() {
  const allIds = adminNotificationsList.map(n => n.id);
  saveAdminReadNotifIds(allIds);
  renderAdminNotifications(adminNotificationsList);
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


