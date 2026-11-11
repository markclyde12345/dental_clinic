/**
 * Fano Dental Clinic — Accounting & Financial Control Portal
 * Complete Financial Ledger, Invoicing, Payment Settlements & Reporting
 */

(function() {
  'use strict';

  const BASE_ORIGIN = (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port !== '5000' && window.location.port !== ''
  ) ? 'http://localhost:5000' : '';
  const AUTH_API = `${BASE_ORIGIN}/api/auth`;
  const INVOICE_API = `${BASE_ORIGIN}/api/invoices`;
  const PATIENTS_API = `${BASE_ORIGIN}/api/patients`;
  const ADMIN_API = `${BASE_ORIGIN}/api/admin`;
  const EXPENSE_API = `${BASE_ORIGIN}/api/expenses`;

  function getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }
  let token = getAuthToken();
  let currentUser = null;
  let allInvoices = [];
  let allPatients = [];
  let allInventory = [];
  let allExpenses = [];  // stored in database with local caching
  let currentReceiptInvoice = null;

  // Formatting helpers
  function normalizeCurrencySymbol(val) {
    if (!val || typeof val !== 'string') return '₱';
    const trimmed = val.trim();
    const match = trimmed.match(/\(([^)]+)\)/);
    if (match && match[1]) return match[1].trim();
    if (trimmed.toUpperCase() === 'PHP') return '₱';
    if (trimmed.toUpperCase() === 'USD') return '$';
    if (trimmed.toUpperCase() === 'EUR') return '€';
    if (trimmed.toUpperCase() === 'JPY') return '¥';
    return trimmed;
  }

  function getCurrency() {
    return normalizeCurrencySymbol(localStorage.getItem('acc-currency') || '₱');
  }

  function formatMoney(amount) {
    const cur = getCurrency();
    const num = parseFloat(amount) || 0;
    return `${cur}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function initAccountingLiveClock() {
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

  /* ═══════════════════════════════════════════════════════════
     1. INITIALIZATION & AUTH
     ═══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    initAccountingLiveClock();

    token = getAuthToken();
    const storedUser = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');

    if (!token && !storedUser) {
      window.location.replace('login.html');
      return;
    }

    initSidebarTabs();
    initSettingsForm();
    initInvoiceForms();
    fetchUserProfile();
  });

  async function fetchUserProfile() {
    let cachedUser = null;
    try {
      const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
      if (raw) cachedUser = JSON.parse(raw);
    } catch (_) {}

    try {
      token = getAuthToken();
      if (token) {
        const res = await fetch(`${AUTH_API}/profile`, {
          headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });

        if (res.status === 401) {
          // Token truly expired
          logout();
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data && !data.message) {
            currentUser = data;
          }
        }
      }
    } catch (err) {
      console.warn('Network issue fetching profile, using cached session:', err);
    }

    if (!currentUser && cachedUser) {
      currentUser = cachedUser;
    }

    if (!currentUser) {
      token = getAuthToken();
      if (!token) {
        window.location.replace('login.html');
        return;
      }
      currentUser = { name: 'Finance Staff', role: 'Accounting' };
    }

    // Role verification: Admin, Accounting, Receptionist are authorized
    const role = (currentUser.role || '').toLowerCase();
    if (role === 'patient') {
      window.location.replace('patient-dashboard.html');
      return;
    }

    const displayName = currentUser.name || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'Accountant';
    const userRole = currentUser.role || 'Accounting';

    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = displayName;
    const roleEl = document.getElementById('user-role');
    if (roleEl) roleEl.textContent = userRole;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

    // Safely load all real clinical data independently
    try { await loadInvoices(); } catch (e) { console.warn('Invoices load warning:', e); }
    try { await loadPatients(); } catch (e) { console.warn('Patients load warning:', e); }
    try { await loadInventoryCosts(); } catch (e) { console.warn('Inventory load warning:', e); }
    try { await loadExpenses(); } catch (e) { console.warn('Expenses load warning:', e); }

    startFinanceRealtimeSync();
  }

  /* ═══════════════════════════════════════════════════════════
     2. NAVIGATION & TABS
     ═══════════════════════════════════════════════════════════ */
  function initSidebarTabs() {
    const navLinks = document.querySelectorAll('.sidebar-menu .nav-tab');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-tab');
        switchTab(tab);
      });
    });
  }

  window.switchTab = function(tabId) {
    // Update sidebar active link
    document.querySelectorAll('.sidebar-menu .nav-tab').forEach(link => {
      if (link.getAttribute('data-tab') === tabId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById(`tab-${tabId}`);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // Update header title, subtitle, and breadcrumb
    const tabConfig = {
      overview: { title: 'Financial Control Portal', sub: 'Manage clinic invoices, revenue ledgers, and payment reconciliations', breadcrumb: 'Financial Overview' },
      invoices: { title: 'Clinic Invoices Ledger', sub: 'Browse issued invoices, check payment statuses, and print billing receipts', breadcrumb: 'Invoices Ledger' },
      payments: { title: 'Payments & Collections', sub: 'Audit cash receipts, GCash/Maya settlements, and card transactions', breadcrumb: 'Payments & Collections' },
      expenses: { title: 'Clinic Expenses & Bills', sub: 'Record clinic utility costs, supplier payables, and operational overheads', breadcrumb: 'Expenses & Bills' },
      inventory: { title: 'Inventory Valuation & Costs', sub: 'Monitor clinic stock asset valuations, supply acquisitions, and unit costs', breadcrumb: 'Inventory Costs' },
      reports: { title: 'Financial Reports & Analytics', sub: 'Monthly gross revenue, net margin summaries, and printable balance sheets', breadcrumb: 'Financial Reports' },
      settings: { title: 'Billing Settings & Tax Rates', sub: 'Configure default payment options, invoicing tax presets, and clinic receipt details', breadcrumb: 'Billing Settings' }
    };

    const currentTab = tabConfig[tabId] || { title: 'Financial Control Portal', sub: 'Financial management dashboard', breadcrumb: tabId };
    const titleEl = document.getElementById('page-title');
    const subEl = document.getElementById('page-subtitle');
    const breadcrumb = document.getElementById('breadcrumb-current');

    if (titleEl) titleEl.textContent = currentTab.title;
    if (subEl) subEl.textContent = currentTab.sub;
    if (breadcrumb) breadcrumb.textContent = currentTab.breadcrumb;
  };

  /* ═══════════════════════════════════════════════════════════
     3. DATA LOADING (INVOICES & PATIENTS)
     ═══════════════════════════════════════════════════════════ */
  async function loadInvoices() {
    try {
      const res = await fetch(INVOICE_API, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        allInvoices = Array.isArray(data) ? data : [];
      } else {
        allInvoices = [];
      }
    } catch (err) {
      console.warn('Invoices fetch error:', err);
      allInvoices = [];
    }

    renderAllViews();
    runFinancialReconciliation(false);
  }

  async function loadPatients() {
    try {
      const curToken = getAuthToken();
      const res = await fetch(PATIENTS_API, {
        headers: { 'Authorization': `Bearer ${curToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          allPatients = data;
        }
      }
    } catch (err) {
      console.warn('Patients fetch error:', err);
    }
    populatePatientSelect();
  }

  function populatePatientSelect() {
    const select = document.getElementById('new-inv-patient');
    if (!select) return;

    if (allPatients.length === 0) {
      select.innerHTML = '<option value="">-- No registered patients found --</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Choose Patient --</option>' +
      allPatients.map(p => `<option value="${p.id}">${escapeHtml(p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim())} (${p.email || 'No email'})</option>`).join('');
  }

  
  function getPatientDisplayName(inv) {
    if (inv.patient && inv.patient.name && inv.patient.name.trim() && inv.patient.name.trim() !== 'Patient') {
      return inv.patient.name.trim();
    }
    const pid = inv.patient_id || (inv.patient && inv.patient.id);
    if (pid && Array.isArray(allPatients) && allPatients.length > 0) {
      const found = allPatients.find(p => p.id === pid);
      if (found) {
        const name = (found.name || `${found.firstName || ''} ${found.lastName || ''}`).trim();
        if (name && name !== 'Patient') return name;
        if (found.email) return found.email;
      }
    }
    if (inv.patient && inv.patient.email) return inv.patient.email;
    return 'Walk-in Patient';
  }

  function getPatientContact(inv) {
    if (inv.patient && inv.patient.contact_number) return inv.patient.contact_number;
    if (inv.patient && inv.patient.email) return inv.patient.email;
    const pid = inv.patient_id || (inv.patient && inv.patient.id);
    if (pid && Array.isArray(allPatients) && allPatients.length > 0) {
      const found = allPatients.find(p => p.id === pid);
      if (found) {
        return found.phone || found.contact_number || found.email || '';
      }
    }
    return '';
  }

  /* ═══════════════════════════════════════════════════════════
     4. RENDER FINANCIAL VIEWS & KPIS
     ═══════════════════════════════════════════════════════════ */
  function renderAllViews() {
    renderKPIs();
    renderOverviewTable();
    renderFullInvoicesTable();
    renderPaymentsLog();
    renderReports();
  }

  function renderKPIs() {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let unpaidCount = 0;

    let cashTotal = 0;
    let ewalletTotal = 0;
    let cardTotal = 0;

    allInvoices.forEach(inv => {
      const amount = parseFloat(inv.amount || inv.total_amount || 0);
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
      const paidAmt = isPaid ? amount : (parseFloat(inv.paid_amount) || 0);

      totalBilled += amount;

      if (paidAmt > 0) {
        totalCollected += paidAmt;
        const methodStr = (inv.payment_method || inv.paymentMethod || '').toLowerCase();
        if (methodStr.includes('gcash') || methodStr.includes('maya') || methodStr.includes('wallet')) {
          ewalletTotal += paidAmt;
        } else if (methodStr.includes('card') || methodStr.includes('credit') || methodStr.includes('debit')) {
          cardTotal += paidAmt;
        } else {
          cashTotal += paidAmt;
        }
      }

      if (!isPaid && !isWrittenOff) {
        const balance = Math.max(0, amount - paidAmt);
        if (balance > 0) {
          totalOutstanding += balance;
          unpaidCount++;
        }
      }
    });

    // KPI values
    safeSetText('acc-total-billed', formatMoney(totalBilled));
    safeSetText('acc-total-collected', formatMoney(totalCollected));
    safeSetText('acc-total-outstanding', formatMoney(totalOutstanding));

    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;
    safeSetText('acc-collection-rate', `Collection Rate: ${collectionRate}%`);
    safeSetText('acc-unpaid-count', `${unpaidCount} pending invoices`);

    // Progress Bars — Real breakdown
    const collectedBase = totalCollected > 0 ? totalCollected : 1;
    const cashPct = totalCollected > 0 ? Math.round((cashTotal / collectedBase) * 100) : 0;
    const ewalletPct = totalCollected > 0 ? Math.round((ewalletTotal / collectedBase) * 100) : 0;
    const cardPct = totalCollected > 0 ? Math.round((cardTotal / collectedBase) * 100) : 0;

    safeSetText('cash-share-val', formatMoney(cashTotal));
    const cashBar = document.getElementById('cash-bar');
    if (cashBar) cashBar.style.width = `${cashPct}%`;

    safeSetText('ewallet-share-val', formatMoney(ewalletTotal));
    const ewalletBar = document.getElementById('ewallet-bar');
    if (ewalletBar) ewalletBar.style.width = `${ewalletPct}%`;

    safeSetText('card-share-val', formatMoney(cardTotal));
    const cardBar = document.getElementById('card-bar');
    if (cardBar) cardBar.style.width = `${cardPct}%`;

    updateSidebarBadges();
  }

  function updateSidebarBadges() {
    // 1. Invoices badge: unpaid active invoices count
    let unpaidInvoices = 0;
    (allInvoices || []).forEach(inv => {
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
      if (!isPaid && !isWrittenOff) {
        unpaidInvoices++;
      }
    });

    const invBadge = document.getElementById('sb-invoices-badge');
    if (invBadge) {
      if (unpaidInvoices > 0) {
        invBadge.textContent = unpaidInvoices;
        invBadge.style.display = 'inline-block';
      } else {
        invBadge.style.display = 'none';
      }
    }

    // 2. Expenses badge: unpaid/overdue bills count
    const unpaidExpenses = (allExpenses || []).filter(e => e.status !== 'Paid').length;
    const expBadge = document.getElementById('sb-expenses-badge');
    if (expBadge) {
      if (unpaidExpenses > 0) {
        expBadge.textContent = unpaidExpenses;
        expBadge.style.display = 'inline-block';
      } else {
        expBadge.style.display = 'none';
      }
    }
  }

  function getStatusBadge(status, isPaid, balance = 1) {
    const s = (status || '').toLowerCase();
    if (isPaid || s === 'paid') {
      return `<span class="modern-badge badge-paid"><i class="ti ti-check"></i> Paid</span>`;
    }
    if (s === 'written off') {
      return `<span class="modern-badge badge-baddebt"><i class="ti ti-ban"></i> Bad Debt</span>`;
    }
    if (s === 'partial') {
      return `<span class="modern-badge badge-partial"><i class="ti ti-adjustments"></i> Partial</span>`;
    }
    return `<span class="modern-badge badge-unpaid"><i class="ti ti-clock"></i> Unpaid</span>`;
  }

  function renderOverviewTable() {
    const tbody = document.getElementById('overview-invoices-body');
    if (!tbody) return;

    if (allInvoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state-cell">No billing invoices recorded yet. Click <strong>+ Create Invoice</strong> to issue one.</td></tr>`;
      return;
    }

    const recent = allInvoices.slice(0, 6);
    tbody.innerHTML = recent.map(inv => {
      const invId = inv.id ? (inv.id.length > 8 ? `INV-${inv.id.slice(0, 8).toUpperCase()}` : `INV-${inv.id.toUpperCase()}`) : 'INV-000';
      const patientName = getPatientDisplayName(inv);
      const initial = patientName.charAt(0).toUpperCase() || 'P';
      const amount = parseFloat(inv.amount || inv.total_amount || 0);
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
      const paidAmount = isPaid ? amount : (parseFloat(inv.paid_amount) || 0);
      const balance = isWrittenOff ? 0 : Math.max(0, amount - paidAmount);

      return `
        <tr class="inv-row">
          <td><span class="inv-pill" onclick="copyInvoiceId('${invId}')">#${invId}</span></td>
          <td>
            <div class="patient-cell-compact">
              <div class="patient-avatar-mini">${initial}</div>
              <span class="patient-name-title">${escapeHtml(patientName)}</span>
            </div>
          </td>
          <td><span class="date-main">${formatDate(inv.issued_at || inv.created_at)}</span></td>
          <td><span class="amount-cell amount-billed">${formatMoney(amount)}</span></td>
          <td><span class="amount-cell amount-paid ${paidAmount > 0 ? 'has-paid' : 'zero-paid'}">${formatMoney(paidAmount)}</span></td>
          <td><span class="amount-cell amount-balance ${balance > 0 ? 'balance-alert' : 'balance-cleared'}">${formatMoney(balance)}</span></td>
          <td>${getStatusBadge(inv.status, isPaid, balance)}</td>
          <td style="text-align: right;">
            <div class="row-actions-group">
              ${!isPaid && !isWrittenOff ? `<button type="button" class="btn-action-pill btn-collect" onclick="openRecordPaymentModal('${inv.id}')"><i class="ti ti-cash"></i> Settle</button>` : ''}
              <button type="button" class="btn-action-icon" onclick="viewReceipt('${inv.id}')" title="Receipt"><i class="ti ti-printer"></i></button>
              <button type="button" class="btn-action-icon" onclick="openInvoiceDetailsModal('${inv.id}')" title="Details"><i class="ti ti-eye"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderFullInvoicesTable() {
    const tbody = document.getElementById('full-invoices-body');
    if (!tbody) return;

    if (allInvoices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-state-cell">
            <i class="ti ti-receipt" style="font-size: 2.2rem; color: #94a3b8; display: block; margin-bottom: 10px;"></i>
            No invoices recorded yet. Click <strong>+ New Invoice</strong> to create one.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = allInvoices.map(inv => {
      const invId = inv.id ? (inv.id.length > 8 ? `INV-${inv.id.slice(0, 8).toUpperCase()}` : `INV-${inv.id.toUpperCase()}`) : 'INV-000';
      const patientName = getPatientDisplayName(inv);
      const patientInitial = patientName.charAt(0).toUpperCase() || 'P';
      const patientContact = getPatientContact(inv);

      // Clean treatment & structured metadata parsing (NO RAW BRACKET DUMP)
      let treatmentName = inv.appointment?.treatment?.name || inv.treatment?.name || 'Dental Consultation & Treatment';
      const rawNotes = inv.appointment?.notes || inv.notes || '';
      let dentistName = 'Assigned Doctor';
      let concern = '';
      let hasAlerts = false;

      const dentistMatch = rawNotes.match(/\[Dentist:\s*([^\]]+)\]/i);
      if (dentistMatch && dentistMatch[1] !== 'No Preference' && dentistMatch[1] !== 'N/A') dentistName = dentistMatch[1];

      const concernMatch = rawNotes.match(/\[Concern:\s*([^\]]+)\]/i);
      if (concernMatch && concernMatch[1] !== 'None') concern = concernMatch[1];

      if (/\[(Conditions|Allergies|Meds):\s*(?!None\b)[^\]]+\]/i.test(rawNotes) || /AnxietySupport:\s*Yes/i.test(rawNotes)) {
        hasAlerts = true;
      }

      const amount = parseFloat(inv.amount || inv.total_amount || 0);
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
      const paidAmount = isPaid ? amount : (parseFloat(inv.paid_amount) || 0);
      const balance = isWrittenOff ? 0 : Math.max(0, amount - paidAmount);

      const issuedDate = new Date(inv.issued_at || inv.created_at || Date.now());
      const dateStr = issuedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const daysOld = Math.max(0, Math.floor((Date.now() - issuedDate.getTime()) / (1000 * 60 * 60 * 24)));

      // Status badge
      let statusBadge = '';
      if (isPaid) {
        statusBadge = `<span class="modern-badge badge-paid"><i class="ti ti-check"></i> Paid</span>`;
      } else if (isWrittenOff) {
        statusBadge = `<span class="modern-badge badge-baddebt" title="Written off from active balance"><i class="ti ti-ban"></i> Bad Debt</span>`;
      } else if (balance > 0 && daysOld > 30) {
        statusBadge = `<span class="modern-badge badge-overdue" title="${daysOld} days overdue"><i class="ti ti-alert-triangle"></i> Overdue (${daysOld}d)</span>`;
      } else if (paidAmount > 0 && balance > 0) {
        statusBadge = `<span class="modern-badge badge-partial"><i class="ti ti-adjustments"></i> Partial</span>`;
      } else {
        statusBadge = `<span class="modern-badge badge-unpaid"><i class="ti ti-clock"></i> Unpaid</span>`;
      }

      return `
        <tr class="inv-row ${isPaid ? 'is-settled' : 'is-pending'}" data-inv-id="${inv.id}">
          <!-- Invoice Ref -->
          <td>
            <span class="inv-pill" onclick="copyInvoiceId('${invId}')" title="Click to copy ID">
              #${invId}
            </span>
          </td>

          <!-- Patient -->
          <td>
            <div class="patient-cell-compact">
              <div class="patient-avatar-mini">${patientInitial}</div>
              <div class="patient-info-meta">
                <span class="patient-name-title">${escapeHtml(patientName)}</span>
                ${patientContact ? `<span class="patient-sub-contact">${escapeHtml(patientContact)}</span>` : ''}
              </div>
            </div>
          </td>

          <!-- Treatment & Procedure (CLEAN & GORGEOUS) -->
          <td>
            <div class="treatment-meta-box">
              <div class="treatment-name-bold">
                <i class="ti ti-tooth text-primary"></i>
                <span>${escapeHtml(treatmentName)}</span>
              </div>
              <div class="treatment-pills-row">
                ${dentistName !== 'Assigned Doctor' ? `<span class="info-pill doctor-pill"><i class="ti ti-stethoscope"></i> ${escapeHtml(dentistName)}</span>` : ''}
                ${concern ? `<span class="info-pill concern-pill">${escapeHtml(concern)}</span>` : ''}
                ${hasAlerts ? `<span class="info-pill alert-pill" title="Patient has clinical alerts"><i class="ti ti-heartbeat"></i> Alerts</span>` : ''}
              </div>
            </div>
          </td>

          <!-- Date Issued -->
          <td>
            <div class="date-issued-cell">
              <span class="date-main">${dateStr}</span>
              <span class="date-sub">${daysOld === 0 ? 'Today' : `${daysOld}d ago`}</span>
            </div>
          </td>

          <!-- Total Billed -->
          <td>
            <span class="amount-cell amount-billed">${formatMoney(amount)}</span>
          </td>

          <!-- Paid Amount -->
          <td>
            <span class="amount-cell amount-paid ${paidAmount > 0 ? 'has-paid' : 'zero-paid'}">${formatMoney(paidAmount)}</span>
          </td>

          <!-- Balance Due -->
          <td>
            <span class="amount-cell amount-balance ${balance > 0 ? 'balance-alert' : 'balance-cleared'}">
              ${formatMoney(balance)}
            </span>
          </td>

          <!-- Status -->
          <td>
            ${statusBadge}
          </td>

          <!-- Actions -->
          <td style="text-align: right;">
            <div class="row-actions-group">
              ${!isPaid && !isWrittenOff ? `
                <button type="button" class="btn-action-pill btn-collect" onclick="openRecordPaymentModal('${inv.id}')" title="Collect payment">
                  <i class="ti ti-cash"></i> Collect
                </button>
              ` : ''}
              <button type="button" class="btn-action-icon" onclick="viewReceipt('${inv.id}')" title="Print Official Receipt">
                <i class="ti ti-printer"></i>
              </button>
              <button type="button" class="btn-action-icon" onclick="openInvoiceDetailsModal('${inv.id}')" title="View Full Breakdown & Intake">
                <i class="ti ti-eye"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.setStatusChip = function(status) {
    const filterSelect = document.getElementById('inv-status-filter');
    if (filterSelect) filterSelect.value = status;

    document.querySelectorAll('.status-chip').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });

    filterInvoices();
  };

  window.clearInvSearch = function() {
    const input = document.getElementById('inv-search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('inv-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    filterInvoices();
  };

  window.copyInvoiceId = function(invId) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(invId);
      showToast(`Copied #${invId} to clipboard!`, 'success');
    }
  };

  let currentDetailInvoiceId = null;

  window.openInvoiceDetailsModal = function(invId) {
    const inv = allInvoices.find(i => String(i.id) === String(invId));
    if (!inv) return;
    currentDetailInvoiceId = invId;

    const invIdFormatted = inv.id ? (inv.id.length > 8 ? `INV-${inv.id.slice(0, 8).toUpperCase()}` : `INV-${inv.id.toUpperCase()}`) : 'INV-000';
    const patientName = inv.patient ? (inv.patient.name || inv.patient.email || 'Walk-in Patient') : 'Walk-in Patient';
    const initial = patientName.charAt(0).toUpperCase() || 'P';

    const amount = parseFloat(inv.amount || inv.total_amount || 0);
    const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
    const isWrittenOff = (inv.status || '').toLowerCase() === 'written off';
    const paidAmount = isPaid ? amount : (parseFloat(inv.paid_amount) || 0);
    const balance = isWrittenOff ? 0 : Math.max(0, amount - paidAmount);

    // Set modal header & summary
    const avatarEl = document.getElementById('inv-detail-avatar');
    if (avatarEl) avatarEl.textContent = initial;
    const nameEl = document.getElementById('inv-detail-patient-name');
    if (nameEl) nameEl.textContent = patientName;
    const refEl = document.getElementById('inv-detail-ref-pill');
    if (refEl) refEl.textContent = `#${invIdFormatted}`;

    const amtEl = document.getElementById('inv-detail-amount');
    if (amtEl) amtEl.textContent = formatMoney(amount);
    const paidEl = document.getElementById('inv-detail-paid');
    if (paidEl) paidEl.textContent = formatMoney(paidAmount);
    const balEl = document.getElementById('inv-detail-balance');
    if (balEl) balEl.textContent = formatMoney(balance);

    // Parse Treatment & Clinic notes
    let treatmentName = inv.appointment?.treatment?.name || inv.treatment?.name || 'Dental Consultation & Procedure';
    const rawNotes = inv.appointment?.notes || inv.notes || '';
    let dentistName = 'Staff Doctor';
    let concern = 'Routine Dental Care';
    let allergies = 'None';
    let emergency = 'None';

    const dentistMatch = rawNotes.match(/\[Dentist:\s*([^\]]+)\]/i);
    if (dentistMatch && dentistMatch[1] !== 'No Preference') dentistName = dentistMatch[1];

    const concernMatch = rawNotes.match(/\[Concern:\s*([^\]]+)\]/i);
    if (concernMatch) concern = concernMatch[1];

    const allergyMatch = rawNotes.match(/\[Allergies:\s*([^\]]+)\]/i);
    if (allergyMatch && allergyMatch[1] !== 'None') allergies = allergyMatch[1];

    const emerMatch = rawNotes.match(/\[Emergency:\s*([^\]]+)\]/i);
    if (emerMatch && emerMatch[1] !== 'None') emergency = emerMatch[1];

    const issuedDate = new Date(inv.issued_at || inv.created_at || Date.now());
    const dateStr = issuedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    safeSetText('inv-detail-treatment-name', treatmentName);
    safeSetText('inv-detail-dentist', dentistName);
    safeSetText('inv-detail-date', `Issued: ${dateStr}`);
    safeSetText('inv-detail-concern', concern);
    safeSetText('inv-detail-allergies', allergies);
    safeSetText('inv-detail-emergency', emergency);

    const statusBadgeContainer = document.getElementById('inv-detail-status-badge');
    if (statusBadgeContainer) {
      statusBadgeContainer.innerHTML = getStatusBadge(inv.status, isPaid, balance);
    }

    // Toggle settle button
    const settleBtn = document.getElementById('inv-detail-btn-settle');
    if (settleBtn) {
      settleBtn.style.display = (!isPaid && !isWrittenOff) ? 'inline-flex' : 'none';
    }

    const modal = document.getElementById('modal-invoice-details');
    if (modal) modal.classList.add('open');
  };

  window.printModalReceipt = function() {
    if (currentDetailInvoiceId) {
      closeModal('modal-invoice-details');
      window.viewReceipt(currentDetailInvoiceId);
    }
  };

  window.settleModalInvoice = function() {
    if (currentDetailInvoiceId) {
      closeModal('modal-invoice-details');
      window.openRecordPaymentModal(currentDetailInvoiceId);
    }
  };

  function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  window.filterInvoices = function() {
    const input = document.getElementById('inv-search-input');
    const query = (input?.value || '').toLowerCase().trim();
    const clearBtn = document.getElementById('inv-search-clear');
    if (clearBtn) clearBtn.style.display = query ? 'inline-block' : 'none';

    const statusFilter = document.getElementById('inv-status-filter')?.value || 'all';
    const rows = document.querySelectorAll('#full-invoices-body tr.inv-row');

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const matchesQuery = !query || text.includes(query);
      let matchesStatus = true;

      if (statusFilter === 'Unpaid') {
        matchesStatus = text.includes('unpaid') || text.includes('pending');
      } else if (statusFilter === 'Paid') {
        matchesStatus = text.includes('paid') && !text.includes('unpaid');
      } else if (statusFilter === 'Partial') {
        matchesStatus = text.includes('partial');
      }

      row.style.display = (matchesQuery && matchesStatus) ? '' : 'none';
    });
  };

  function renderPaymentsLog() {
    const tbody = document.getElementById('payments-log-body');
    if (!tbody) return;

    const paidInvoices = allInvoices.filter(inv => inv.status === 'Paid' || inv.is_paid);
    if (paidInvoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #888; padding: 24px;">No settled payments recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = paidInvoices.map((inv, idx) => {
      const orNo = `OR-2026-${String(idx + 101).padStart(4, '0')}`;
      const invId = inv.id ? (inv.id.length > 8 ? `#INV-${inv.id.slice(0, 8).toUpperCase()}` : `#INV-${inv.id}`) : '#INV-000';
      const patientName = inv.patient ? (inv.patient.name || 'Patient') : 'Walk-in Patient';
      const amount = parseFloat(inv.amount || inv.total_amount || 0);
      const methods = ['Cash', 'GCash / E-Wallet', 'Credit Card'];
      const method = inv.payment_method || methods[idx % methods.length];

      return `
        <tr>
          <td><strong style="color: var(--primary-color); font-family: monospace;">${orNo}</strong></td>
          <td>${invId}</td>
          <td><strong>${escapeHtml(patientName)}</strong></td>
          <td>${formatDate(inv.paid_at || inv.issued_at || inv.created_at)}</td>
          <td>${method}</td>
          <td style="font-weight: 700; color: #10b981;">${formatMoney(amount)}</td>
          <td><span class="badge-status badge-paid"><i class="ti ti-check"></i> Cleared &amp; Deposited</span></td>
          <td style="text-align: right;">
            <button type="button" class="btn-text-action" onclick="viewReceipt('${inv.id}')"><i class="ti ti-printer"></i> Voucher</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderReports() {
    const totalCount = allInvoices.length;
    let grossBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    const treatmentMap = {};

    allInvoices.forEach(inv => {
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const paidAmt = isPaid ? amt : (parseFloat(inv.paid_amount) || 0);

      grossBilled += amt;
      totalCollected += paidAmt;
      if (!isPaid && (inv.status || '').toLowerCase() !== 'written off') {
        totalOutstanding += Math.max(0, amt - paidAmt);
      }

      // Group by real treatment procedure
      let tName = inv.appointment?.treatment?.name || inv.treatment?.name;
      if (!tName || tName === 'Dental Consultation & Treatment') {
        const notes = inv.appointment?.notes || inv.notes || '';
        const match = notes.match(/\[Concern:\s*([^\]]+)\]/i);
        if (match && match[1] !== 'None') {
          tName = match[1];
        } else {
          tName = 'General Dental Consultation & Examination';
        }
      }

      if (!treatmentMap[tName]) {
        treatmentMap[tName] = { count: 0, total: 0 };
      }
      treatmentMap[tName].count += 1;
      treatmentMap[tName].total += amt;
    });

    const efficiency = grossBilled > 0 ? Math.round((totalCollected / grossBilled) * 100) : 0;

    safeSetText('statement-generated-date', `Generated on: ${new Date().toLocaleString()}`);
    safeSetText('rep-total-invoices', totalCount);
    safeSetText('rep-gross-billed', formatMoney(grossBilled));
    safeSetText('rep-total-discounts', formatMoney(0));
    safeSetText('rep-net-billed', formatMoney(grossBilled));

    safeSetText('rep-collected', formatMoney(totalCollected));
    safeSetText('rep-outstanding', formatMoney(totalOutstanding));
    safeSetText('rep-efficiency', `${efficiency}%`);

    // Dynamic Top Dental Procedures Table
    const tbody = document.getElementById('treatment-revenue-body');
    if (tbody) {
      const entries = Object.entries(treatmentMap).sort((a, b) => b[1].total - a[1].total);
      if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:20px;">No invoiced dental procedures recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = entries.map(([name, data]) => {
          const avg = data.count > 0 ? data.total / data.count : 0;
          return `
            <tr>
              <td><strong>${escapeHtml(name)}</strong></td>
              <td>${data.count}</td>
              <td>${formatMoney(avg)}</td>
              <td style="text-align: right; font-weight: 700;">${formatMoney(data.total)}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     5. MODALS & FORMS HANDLING
     ═══════════════════════════════════════════════════════════ */
  window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
  };

  window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  };

  window.openCreateInvoiceModal = function() {
    populatePatientSelect();
    document.getElementById('create-invoice-form').reset();
    openModal('modal-create-invoice');
  };

  window.openRecordPaymentModal = function(targetInvoiceId) {
    const select = document.getElementById('pay-inv-select');
    const unpaid = allInvoices.filter(inv => inv.status !== 'Paid' && !inv.is_paid);

    if (unpaid.length === 0 && !targetInvoiceId) {
      showToast('All invoices are already fully settled!', 'success');
      return;
    }

    select.innerHTML = '<option value="">-- Choose Unpaid Invoice --</option>' +
      unpaid.map(inv => {
        const invId = inv.id ? (inv.id.length > 8 ? `#INV-${inv.id.slice(0, 8).toUpperCase()}` : `#INV-${inv.id}`) : '#INV-000';
        const pName = inv.patient ? inv.patient.name : 'Patient';
        const amt = parseFloat(inv.amount || inv.total_amount || 0);
        return `<option value="${inv.id}">${invId} - ${escapeHtml(pName)} (${formatMoney(amt)})</option>`;
      }).join('');

    if (targetInvoiceId) {
      select.value = targetInvoiceId;
      window.onPaymentInvoiceSelected();
    }

    openModal('modal-record-payment');
  };

  window.onPaymentInvoiceSelected = function() {
    const select = document.getElementById('pay-inv-select');
    const invId = select.value;
    const inv = allInvoices.find(i => i.id === invId);
    if (inv) {
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      document.getElementById('pay-amount').value = amt.toFixed(2);
    }
  };

  function initInvoiceForms() {
    // Create Invoice Form
    const createForm = document.getElementById('create-invoice-form');
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const patient_id = document.getElementById('new-inv-patient').value;
        const amount = parseFloat(document.getElementById('new-inv-amount').value);
        const status = document.getElementById('new-inv-status').value;
        const desc = document.getElementById('new-inv-desc').value.trim();

        if (!patient_id || isNaN(amount) || amount <= 0) {
          showToast('Please provide a valid patient and amount.', 'error');
          return;
        }

        try {
          const res = await fetch(INVOICE_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              patient_id,
              amount,
              status,
              notes: desc
            })
          });

          if (res.ok) {
            showToast('Invoice generated successfully!', 'success');
            closeModal('modal-create-invoice');
            await loadInvoices();
          } else {
            const errData = await res.json();
            showToast(errData.message || 'Failed to create invoice.', 'error');
          }
        } catch (err) {
          console.error('Invoice creation error:', err);
          showToast('Failed to connect to server.', 'error');
        }
      });
    }

    // Record Payment Form
    const payForm = document.getElementById('record-payment-form');
    if (payForm) {
      payForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invId = document.getElementById('pay-inv-select').value;
        const method = document.getElementById('pay-method').value;
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const ref = document.getElementById('pay-ref').value.trim();

        if (!invId) {
          showToast('Please select an invoice to settle.', 'error');
          return;
        }

        try {
          const res = await fetch(`${INVOICE_API}/${invId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              status: 'Paid',
              paid_amount: amount,
              payment_method: method,
              reference_no: ref
            })
          });

          if (res.ok) {
            showToast('Payment recorded and invoice settled!', 'success');
            closeModal('modal-record-payment');
            await loadInvoices();
            // Open receipt
            window.viewReceipt(invId);
          } else {
            const errData = await res.json();
            showToast(errData.message || 'Failed to update invoice.', 'error');
          }
        } catch (err) {
          console.error('Payment update error:', err);
          showToast('Failed to connect to server.', 'error');
        }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     6. RECEIPT & PRINTING
     ═══════════════════════════════════════════════════════════ */
  window.viewReceipt = function(invoiceId) {
    const inv = allInvoices.find(i => i.id === invoiceId);
    if (!inv) return;

    currentReceiptInvoice = inv;
    const invIdShort = inv.id ? (inv.id.length > 8 ? inv.id.slice(0, 8).toUpperCase() : inv.id) : '0001';
    const orPrefix = localStorage.getItem('acc-or-prefix') || 'OR-2026-';
    const orNo = `${orPrefix}${invIdShort}`;
    const pName = inv.patient ? (inv.patient.name || 'Patient') : 'Walk-in Patient';
    const amount = parseFloat(inv.amount || inv.total_amount || 0);
    const desc = inv.appointment?.treatment?.name || inv.treatment?.name || (inv.appointment?.notes && !inv.appointment.notes.startsWith('[') ? inv.appointment.notes : (inv.notes && !inv.notes.startsWith('[') ? inv.notes : 'Dental Examination, Prophylaxis & Procedure'));
    const method = inv.payment_method || 'Cash / Electronic Transfer';
    const footerMsg = localStorage.getItem('acc-receipt-footer') || 'Thank you for trusting Fano Dental Clinic! Keep this receipt for your dental health records.';

    document.getElementById('rec-or-no').textContent = orNo;
    document.getElementById('rec-date').textContent = formatDate(inv.paid_at || inv.issued_at || new Date());
    document.getElementById('rec-patient').textContent = pName;
    document.getElementById('rec-method').textContent = method;
    document.getElementById('rec-desc').textContent = desc;
    document.getElementById('rec-amount').textContent = formatMoney(amount);
    document.getElementById('rec-total-paid').textContent = formatMoney(amount);
    document.getElementById('rec-footer-text').textContent = footerMsg;

    openModal('modal-receipt-view');
  };

  window.printCurrentReceipt = function() {
    window.print();
  };

  window.printFinancialStatement = function() {
    window.print();
  };

  window.exportInvoicesCSV = function() {
    if (allInvoices.length === 0) {
      showToast('No invoices to export.', 'error');
      return;
    }

    const headers = ['Invoice ID', 'Patient Name', 'Email', 'Date Issued', 'Billed Amount', 'Paid Amount', 'Status'];
    const rows = allInvoices.map(inv => {
      const invId = inv.id ? (inv.id.length > 8 ? `#INV-${inv.id.slice(0, 8).toUpperCase()}` : `#INV-${inv.id}`) : '#INV-000';
      const patientName = inv.patient ? (inv.patient.name || 'Patient') : 'Walk-in';
      const email = inv.patient ? (inv.patient.email || '') : '';
      const date = formatDate(inv.issued_at || inv.created_at);
      const amount = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.status === 'Paid' || inv.is_paid ? amount : (parseFloat(inv.paid_amount) || 0);
      const status = inv.status || 'Unpaid';

      return [invId, `"${patientName}"`, email, date, amount, paid, status].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Fano_Invoices_Ledger_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Invoices CSV exported successfully!', 'success');
  };

  /* ═══════════════════════════════════════════════════════════
     7. SETTINGS FORM
     ═══════════════════════════════════════════════════════════ */
  /* ═══════════════════════════════════════════════════════════
     7. FINANCIAL SETTINGS ACCORDION & FORMS
     ═══════════════════════════════════════════════════════════ */
  window.toggleSettingsAccordion = function(itemId) {
    const allItems = document.querySelectorAll('.settings-accordion-item');
    const targetItem = document.getElementById(`acc-item-${itemId}`);
    if (!targetItem) return;

    const wasActive = targetItem.classList.contains('active');

    // Collapse all items and reset arrows to ▶
    allItems.forEach(item => {
      item.classList.remove('active');
      const arrow = item.querySelector('.accordion-arrow');
      if (arrow) arrow.className = 'ti ti-chevron-right accordion-arrow';
      const content = item.querySelector('.settings-accordion-content');
      if (content) content.style.setProperty('display', 'none', 'important');
    });

    // If it wasn't already active, expand it and set arrow to ▼
    if (!wasActive) {
      targetItem.classList.add('active');
      const targetArrow = document.getElementById(`arrow-${itemId}`);
      if (targetArrow) targetArrow.className = 'ti ti-chevron-down accordion-arrow';
      const targetContent = targetItem.querySelector('.settings-accordion-content');
      if (targetContent) targetContent.style.setProperty('display', 'block', 'important');
    }
  };

  window.expandAllSettings = function() {
    const allItems = document.querySelectorAll('.settings-accordion-item');
    allItems.forEach(item => {
      item.classList.add('active');
      const arrow = item.querySelector('.accordion-arrow');
      if (arrow) arrow.className = 'ti ti-chevron-down accordion-arrow';
      const content = item.querySelector('.settings-accordion-content');
      if (content) content.style.setProperty('display', 'block', 'important');
    });
  };

  window.collapseAllSettings = function() {
    const allItems = document.querySelectorAll('.settings-accordion-item');
    allItems.forEach(item => {
      item.classList.remove('active');
      const arrow = item.querySelector('.accordion-arrow');
      if (arrow) arrow.className = 'ti ti-chevron-right accordion-arrow';
      const content = item.querySelector('.settings-accordion-content');
      if (content) content.style.setProperty('display', 'none', 'important');
    });
  };

  // Section Save Handlers
  window.saveAccountingSection = function(e) {
    e.preventDefault();
    localStorage.setItem('acc-currency', document.getElementById('setting-currency').value);
    localStorage.setItem('acc-vat', document.getElementById('setting-vat').value);
    localStorage.setItem('acc-fiscal-year', document.getElementById('setting-fiscal-year').value);
    localStorage.setItem('acc-rounding', document.getElementById('setting-rounding').value);
    showToast('Accounting & Currency settings saved successfully!', 'success');
    renderAllViews();
  };

  window.saveInvoiceSection = function(e) {
    e.preventDefault();
    const prefix = document.getElementById('setting-inv-prefix').value.trim() || 'INV-';
    const dueDays = document.getElementById('setting-inv-due-days').value;
    const autoGen = document.getElementById('setting-inv-auto-gen').checked;
    const notes = document.getElementById('setting-inv-notes').value.trim();

    localStorage.setItem('acc-inv-prefix', prefix);
    localStorage.setItem('acc-inv-due-days', dueDays);
    localStorage.setItem('acc-inv-auto-gen', autoGen ? 'true' : 'false');
    localStorage.setItem('acc-inv-notes', notes);
    showToast('Invoice settings saved successfully!', 'success');
  };

  window.saveReceiptSection = function(e) {
    e.preventDefault();
    const orPrefix = document.getElementById('setting-or-prefix').value.trim() || 'OR-2026-';
    const tin = document.getElementById('setting-clinic-tin').value.trim();
    const birPermit = document.getElementById('setting-bir-permit').value.trim();
    const autoReceipt = document.getElementById('setting-auto-issue-receipt').value;
    const footer = document.getElementById('setting-receipt-footer').value.trim();

    localStorage.setItem('acc-or-prefix', orPrefix);
    localStorage.setItem('acc-clinic-tin', tin);
    localStorage.setItem('acc-bir-permit', birPermit);
    localStorage.setItem('acc-auto-receipt', autoReceipt);
    localStorage.setItem('acc-receipt-footer', footer);
    showToast('Receipt & Tax settings saved successfully!', 'success');
  };

  window.savePaymentSection = function(e) {
    e.preventDefault();
    const cash = document.getElementById('pay-method-cash').checked;
    const paymongo = document.getElementById('pay-method-paymongo').checked;
    const bank = document.getElementById('pay-method-bank').checked;
    const check = document.getElementById('pay-method-check').checked;
    const pos = document.getElementById('pay-method-pos').checked;

    localStorage.setItem('acc-pay-cash', cash ? 'true' : 'false');
    localStorage.setItem('acc-pay-paymongo', paymongo ? 'true' : 'false');
    localStorage.setItem('acc-pay-bank', bank ? 'true' : 'false');
    localStorage.setItem('acc-pay-check', check ? 'true' : 'false');
    localStorage.setItem('acc-pay-pos', pos ? 'true' : 'false');
    showToast('Payment Methods updated successfully!', 'success');
  };

  window.saveControlsSection = function(e) {
    e.preventDefault();
    localStorage.setItem('acc-overdue-lock', document.getElementById('setting-overdue-lock').value);
    localStorage.setItem('acc-cash-cap', document.getElementById('setting-cash-cap').value.trim());
    localStorage.setItem('acc-approval-writeoff', document.getElementById('setting-require-approval-writeoff').checked ? 'true' : 'false');
    showToast('Financial Controls saved successfully!', 'success');
  };

  window.saveNotificationsSection = function(e) {
    e.preventDefault();
    localStorage.setItem('acc-notif-sms', document.getElementById('notif-sms-receipt').checked ? 'true' : 'false');
    localStorage.setItem('acc-notif-email', document.getElementById('notif-email-receipt').checked ? 'true' : 'false');
    localStorage.setItem('acc-notif-overdue', document.getElementById('notif-overdue-reminder').checked ? 'true' : 'false');
    showToast('Notification preferences saved!', 'success');
  };

  window.savePermissionsSection = function(e) {
    e.preventDefault();
    localStorage.setItem('acc-perm-receptionist-settle', document.getElementById('perm-receptionist-settle').value);
    localStorage.setItem('acc-perm-writeoff-role', document.getElementById('perm-writeoff-role').value);
    showToast('Financial role permissions updated!', 'success');
  };

  function initSettingsForm() {
    // Load persisted settings
    safeSetVal('setting-currency', localStorage.getItem('acc-currency') || '₱');
    safeSetVal('setting-vat', localStorage.getItem('acc-vat') || '0');
    safeSetVal('setting-fiscal-year', localStorage.getItem('acc-fiscal-year') || 'calendar');
    safeSetVal('setting-rounding', localStorage.getItem('acc-rounding') || '2');

    safeSetVal('setting-inv-prefix', localStorage.getItem('acc-inv-prefix') || 'INV-');
    safeSetVal('setting-inv-due-days', localStorage.getItem('acc-inv-due-days') || '30');
    safeSetChecked('setting-inv-auto-gen', localStorage.getItem('acc-inv-auto-gen') !== 'false');
    if (localStorage.getItem('acc-inv-notes')) safeSetVal('setting-inv-notes', localStorage.getItem('acc-inv-notes'));

    safeSetVal('setting-or-prefix', localStorage.getItem('acc-or-prefix') || 'OR-2026-');
    safeSetVal('setting-clinic-tin', localStorage.getItem('acc-clinic-tin') || '123-456-789-000');
    safeSetVal('setting-bir-permit', localStorage.getItem('acc-bir-permit') || 'BIR-FP-2026-0041');
    safeSetVal('setting-auto-issue-receipt', localStorage.getItem('acc-auto-receipt') || 'yes');
    if (localStorage.getItem('acc-receipt-footer')) safeSetVal('setting-receipt-footer', localStorage.getItem('acc-receipt-footer'));

    safeSetChecked('pay-method-cash', localStorage.getItem('acc-pay-cash') !== 'false');
    safeSetChecked('pay-method-paymongo', localStorage.getItem('acc-pay-paymongo') !== 'false');
    safeSetChecked('pay-method-bank', localStorage.getItem('acc-pay-bank') !== 'false');
    safeSetChecked('pay-method-check', localStorage.getItem('acc-pay-check') !== 'false');
    safeSetChecked('pay-method-pos', localStorage.getItem('acc-pay-pos') === 'true');

    safeSetVal('setting-overdue-lock', localStorage.getItem('acc-overdue-lock') || '30');
    if (localStorage.getItem('acc-cash-cap')) safeSetVal('setting-cash-cap', localStorage.getItem('acc-cash-cap'));
    safeSetChecked('setting-require-approval-writeoff', localStorage.getItem('acc-approval-writeoff') !== 'false');

    safeSetChecked('notif-sms-receipt', localStorage.getItem('acc-notif-sms') !== 'false');
    safeSetChecked('notif-email-receipt', localStorage.getItem('acc-notif-email') !== 'false');
    safeSetChecked('notif-overdue-reminder', localStorage.getItem('acc-notif-overdue') !== 'false');

    safeSetVal('perm-receptionist-settle', localStorage.getItem('acc-perm-receptionist-settle') || 'allowed');
    safeSetVal('perm-writeoff-role', localStorage.getItem('acc-perm-writeoff-role') || 'admin');
  }

  function safeSetVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function safeSetChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  }

  /* ═══════════════════════════════════════════════════════════
     8. TOAST NOTIFICATIONS & LOGOUT
     ═══════════════════════════════════════════════════════════ */
  window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userInfo');
    window.location.replace('login.html');
  };

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ═══════════════════════════════════════════════════════════
     9. EXPENSES & BILLS MODULE
     ═══════════════════════════════════════════════════════════ */

  // ── Seed default expense data if none stored ──────────────────────────────
  const EXPENSE_STORAGE_KEY = 'fano_clinic_expenses';

  function getDefaultExpenses() {
    return [];
  }

  async function loadExpenses() {
    try {
      const res = await fetch(EXPENSE_API, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          allExpenses = data.map(d => ({
            id: d.id,
            ref: d.ref_no || d.ref,
            vendor: d.vendor,
            category: d.category,
            desc: d.description || d.desc,
            amount: d.amount,
            dueDate: d.due_date || d.dueDate,
            paidDate: d.paid_date || d.paidDate,
            status: d.status,
            payMethod: d.payment_method || d.payMethod,
            payRef: d.reference_no || d.payRef
          }));
          saveExpenses();
          renderExpensesTab();
          return;
        }
      }
    } catch (err) {
      console.warn('Expenses API fetch error, using local cache:', err);
    }

    try {
      const raw = localStorage.getItem(EXPENSE_STORAGE_KEY);
      let parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) parsed = [];
      // Clean up legacy mock seeded expenses (exp-001 to exp-007)
      parsed = parsed.filter(e => !['exp-001', 'exp-002', 'exp-003', 'exp-004', 'exp-005', 'exp-006', 'exp-007'].includes(e.id) && !['MERALCO-2026-08', 'PLDT-2026-08', 'SUPPLY-2026-07', 'MAYNILAD-2026-08', 'BDO-LEASE-2026-08', 'PAYROLL-2026-08', 'MAINT-2026-08'].includes(e.ref) && !String(e.id).startsWith('b291316c') && !String(e.id).startsWith('6703390a') && !String(e.id).startsWith('6564b759') && !String(e.id).startsWith('c223b634') && !String(e.id).startsWith('21d518ab') && !String(e.id).startsWith('8ce7b8b8') && !String(e.id).startsWith('b0ad510c'));
      allExpenses = parsed;
    } catch {
      allExpenses = [];
    }
    saveExpenses();
    renderExpensesTab();
  }

  function saveExpenses() {
    localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(allExpenses));
  }

  function renderExpensesTab() {
    renderExpenseKPIs();
    renderExpensesTable(allExpenses);
    updateSidebarBadges();
  }

  function renderExpenseKPIs() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalMonth = 0, totalUnpaid = 0, totalPaid = 0, overdueCount = 0, billCount = (allExpenses || []).length;
    let paidCount = 0;

    (allExpenses || []).forEach(exp => {
      const amt = parseFloat(exp.amount) || 0;
      const due = new Date(exp.dueDate);
      totalMonth += amt;
      if (exp.status === 'Paid') {
        totalPaid += amt;
        paidCount++;
      } else {
        totalUnpaid += amt;
        if (exp.status === 'Overdue' || (exp.status === 'Unpaid' && due < now)) overdueCount++;
      }
    });

    // Real Money Collected from actual clinic appointments & invoices
    let totalCollected = 0;
    (allInvoices || []).forEach(inv => {
      const isPaid = (inv.status || '').toLowerCase() === 'paid' || inv.is_paid;
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      const paidAmt = isPaid ? amt : (parseFloat(inv.paid_amount) || 0);
      totalCollected += paidAmt;
    });

    // Real Net profit: Real money collected from patients minus actual expenses
    const netProfit = totalCollected - totalMonth;

    setText('exp-total-month', formatMoney(totalMonth));
    setText('exp-bill-count', `${billCount} bills tracked`);
    setText('exp-total-unpaid', formatMoney(totalUnpaid));
    setText('exp-overdue-count', `${overdueCount} overdue`);
    setText('exp-total-paid', formatMoney(totalPaid));
    setText('exp-paid-count', `${paidCount} settled`);
    const profitEl = document.getElementById('exp-net-profit');
    if (profitEl) {
      profitEl.textContent = formatMoney(netProfit);
      profitEl.style.color = netProfit >= 0 ? '#10b981' : '#ef4444';
    }
  }

  function getExpenseBadge(status) {
    if (status === 'Paid') return `<span class="badge-status badge-paid"><i class="ti ti-circle-check"></i> Paid</span>`;
    if (status === 'Overdue') return `<span class="badge-status badge-unpaid" style="background: #fef2f2; color: #b91c1c;"><i class="ti ti-alert-circle"></i> Overdue</span>`;
    return `<span class="badge-status badge-hmo" style="background: #fefce8; color: #854d0e;"><i class="ti ti-clock"></i> Unpaid</span>`;
  }

  function renderExpensesTable(list) {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#888; padding:24px;">No expense records found. Click <strong>+ Add Expense</strong> to log a bill.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((exp, idx) => {
      const catIcons = {
        Utilities: '<i class="ti ti-bolt" style="color:#f59e0b; margin-right:4px;"></i>',
        Rent: '<i class="ti ti-building" style="color:#3b82f6; margin-right:4px;"></i>',
        Salaries: '<i class="ti ti-users" style="color:#8b5cf6; margin-right:4px;"></i>',
        Supplies: '<i class="ti ti-first-aid-kit" style="color:#10b981; margin-right:4px;"></i>',
        Equipment: '<i class="ti ti-tool" style="color:#06b6d4; margin-right:4px;"></i>',
        Maintenance: '<i class="ti ti-hammer" style="color:#f97316; margin-right:4px;"></i>',
        Other: '<i class="ti ti-file-text" style="color:#64748b; margin-right:4px;"></i>'
      };
      const icon = catIcons[exp.category] || '<i class="ti ti-file-text" style="color:#64748b; margin-right:4px;"></i>';
      const isPaid = exp.status === 'Paid';

      return `
        <tr>
          <td><strong style="color: var(--primary-color); font-family: monospace;">${escapeHtml(exp.ref)}</strong></td>
          <td><strong>${escapeHtml(exp.vendor)}</strong></td>
          <td><span class="exp-cat-badge">${icon} ${escapeHtml(exp.category)}</span></td>
          <td style="font-size:0.82rem; color:#475569; max-width:180px;">${escapeHtml(exp.desc || '—')}</td>
          <td style="font-weight:700;">${formatMoney(exp.amount)}</td>
          <td style="color:${exp.status === 'Overdue' ? '#b91c1c' : '#475569'};">${exp.dueDate || '—'}</td>
          <td style="color: #10b981;">${exp.paidDate || (isPaid ? 'Recorded' : '—')}</td>
          <td>${getExpenseBadge(exp.status)}</td>
          <td style="text-align:right; white-space:nowrap;">
            ${!isPaid ? `<button type="button" class="btn-text-action" style="color:#10b981; margin-right:6px;" onclick="openPayBillModal(${allExpenses.indexOf(exp)})"><i class="ti ti-cash"></i> Pay</button>` : ''}
            <button type="button" class="btn-text-action" style="color:#ef4444;" onclick="deleteExpense('${exp.id}')" title="Delete"><i class="ti ti-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.filterExpenses = function() {
    const query = (document.getElementById('exp-search-input')?.value || '').toLowerCase();
    const statusF = document.getElementById('exp-status-filter')?.value || 'all';
    const catF = document.getElementById('exp-category-filter')?.value || 'all';

    const filtered = allExpenses.filter(exp => {
      const matchQ = !query || `${exp.vendor} ${exp.category} ${exp.ref} ${exp.desc}`.toLowerCase().includes(query);
      const matchS = statusF === 'all' || exp.status === statusF;
      const matchC = catF === 'all' || exp.category === catF;
      return matchQ && matchS && matchC;
    });
    renderExpensesTable(filtered);
  };

  window.openAddExpenseModal = function() {
    document.getElementById('add-expense-form').reset();
    // Auto-generate reference number
    const nextRef = `BILL-${new Date().getFullYear()}-${String(allExpenses.length + 1).padStart(4, '0')}`;
    document.getElementById('exp-ref').value = nextRef;
    // Default due date to today
    document.getElementById('exp-due-date').valueAsDate = new Date();
    openModal('modal-add-expense');
  };

  window.openPayBillModal = function(idx) {
    const exp = allExpenses[idx];
    if (!exp) return;

    document.getElementById('pay-bill-index').value = idx;
    document.getElementById('pay-bill-date').valueAsDate = new Date();
    document.getElementById('pay-bill-ref').value = '';

    const summary = document.getElementById('pay-bill-summary');
    if (summary) {
      summary.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:0.95rem;">${escapeHtml(exp.vendor)}</strong>
            <div style="color:#64748b; font-size:0.82rem; margin-top:2px;">${escapeHtml(exp.desc || exp.category)} • Ref: ${escapeHtml(exp.ref)}</div>
          </div>
          <strong style="font-size:1.1rem; color:#ef4444;">${formatMoney(exp.amount)}</strong>
        </div>
        <div style="margin-top:8px; font-size:0.8rem; color:#94a3b8;">Due: ${exp.dueDate || 'N/A'} ${exp.status === 'Overdue' ? '<span style="color:#ef4444; font-weight:700;"><i class="ti ti-alert-triangle"></i> OVERDUE</span>' : ''}</div>
      `;
    }

    openModal('modal-pay-bill');
  };

  // Pay Bill form submission
  document.addEventListener('DOMContentLoaded', () => {
    const payBillForm = document.getElementById('pay-bill-form');
    if (payBillForm) {
      payBillForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = parseInt(document.getElementById('pay-bill-index').value);
        const paidDate = document.getElementById('pay-bill-date').value;
        const method = document.getElementById('pay-bill-method').value;
        const ref = document.getElementById('pay-bill-ref').value.trim();

        if (idx >= 0 && idx < allExpenses.length) {
          const exp = allExpenses[idx];
          exp.status = 'Paid';
          exp.paidDate = paidDate;
          exp.payMethod = method;
          exp.payRef = ref;
          saveExpenses();
          renderExpensesTab();
          closeModal('modal-pay-bill');

          // Sync to Database API
          if (exp.id && !String(exp.id).startsWith('exp-')) {
            fetch(`${EXPENSE_API}/${exp.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                status: 'Paid',
                paid_date: paidDate,
                payment_method: method,
                reference_no: ref
              })
            }).catch(e => console.warn('Expense DB update sync error:', e));
          }

          showToast(`Bill paid: ${exp.vendor} — ${formatMoney(exp.amount)}`, 'success');
        }
      });
    }

    // Add Expense form
    const addExpForm = document.getElementById('add-expense-form');
    if (addExpForm) {
      addExpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newExp = {
          id: `exp-${Date.now()}`,
          ref: document.getElementById('exp-ref').value.trim(),
          vendor: document.getElementById('exp-vendor').value.trim(),
          category: document.getElementById('exp-category').value,
          desc: document.getElementById('exp-desc').value.trim(),
          amount: parseFloat(document.getElementById('exp-amount').value) || 0,
          dueDate: document.getElementById('exp-due-date').value,
          paidDate: document.getElementById('exp-paid-date').value || null,
          status: document.getElementById('exp-status').value,
          payMethod: document.getElementById('exp-pay-method').value,
          payRef: document.getElementById('exp-pay-ref').value.trim()
        };

        if (!newExp.vendor || !newExp.category || newExp.amount <= 0) {
          showToast('Please fill in all required fields.', 'error');
          return;
        }

        allExpenses.push(newExp);
        saveExpenses();
        renderExpensesTab();
        closeModal('modal-add-expense');

        // Sync to Database API
        fetch(EXPENSE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(newExp)
        })
        .then(r => r.json())
        .then(saved => {
          if (saved && saved.id) {
            newExp.id = saved.id;
            saveExpenses();
          }
        })
        .catch(e => console.warn('Expense DB insert sync error:', e));

        showToast(`Expense recorded: ${newExp.vendor} — ${formatMoney(newExp.amount)}`, 'success');
      });
    }
  });

  window.deleteExpense = function(expId) {
    if (!confirm('Delete this expense record?')) return;
    allExpenses = allExpenses.filter(e => e.id !== expId);
    saveExpenses();
    renderExpensesTab();

    // Sync deletion to Database API
    if (expId && !String(expId).startsWith('exp-')) {
      fetch(`${EXPENSE_API}/${expId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      }).catch(e => console.warn('Expense DB delete sync error:', e));
    }

    showToast('Expense record removed.', 'success');
  };

  window.clearAllExpenses = async function() {
    if (allExpenses.length === 0) {
      showToast('No expense records to clear.', 'info');
      return;
    }

    if (!confirm(`Are you sure you want to clear all ${allExpenses.length} expense and bill records? This cannot be undone.`)) {
      return;
    }

    allExpenses = [];
    localStorage.removeItem(EXPENSE_STORAGE_KEY);
    renderExpensesTab();

    try {
      await fetch(EXPENSE_API, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
    } catch (err) {
      console.warn('Clear expenses API error:', err);
    }

    showToast('All expense records cleared successfully.', 'success');
  };

  window.exportExpensesCSV = function() {
    if (allExpenses.length === 0) { showToast('No expense records to export.', 'error'); return; }
    const headers = ['Ref #', 'Vendor', 'Category', 'Description', 'Amount', 'Due Date', 'Paid Date', 'Status', 'Pay Method', 'Reference'];
    const rows = allExpenses.map(e => [
      `"${e.ref}"`, `"${e.vendor}"`, e.category, `"${e.desc || ''}"`,
      parseFloat(e.amount).toFixed(2), e.dueDate || '', e.paidDate || '',
      e.status, e.payMethod, `"${e.payRef || ''}"`
    ].join(','));
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `Fano_Expenses_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Expenses CSV exported!', 'success');
  };

  /* ═══════════════════════════════════════════════════════════
     10. INVENTORY COSTS MODULE
     ═══════════════════════════════════════════════════════════ */

  // Estimated unit costs by category (₱ per unit) — for financial planning
  const UNIT_COST_MAP = {
    'Nitrile Powder-Free Exam Gloves (Medium)': 380,
    '3M Filtek Z350 XT Composite Resin (Shade A2)': 1850,
    'Self-Sealing Autoclave Sterilization Pouches': 420,
    'Sodium Hypochlorite 5.25% Endodontic Solution': 350,
    'Orthodontic Superelastic NiTi Archwires': 1200,
    'High-Speed Diamond FG Dental Burs Set': 950,
    'Disposable Low-Volume Saliva Ejectors': 240,
    'Lidocaine 2% with Epinephrine Carpules': 1450,
    // Category fallbacks
    '_PPE & Disposables': 320,
    '_Restorative': 1850,
    '_Sterilization': 420,
    '_Endodontics': 350,
    '_Orthodontics': 1200,
    '_Instruments': 950,
    '_Anesthetics': 1450,
    '_Hygiene': 350,
    '_Equipment': 2500,
    '_Supplies': 450
  };

  function getUnitCost(item) {
    const rawCost = parseFloat(item.unit_cost || item.unitCost || item.cost || item.price);
    if (!isNaN(rawCost) && rawCost > 0) return rawCost;
    return UNIT_COST_MAP[item.name] || UNIT_COST_MAP[`_${item.category}`] || 450;
  }

  window.loadInventoryCosts = async function() {
    const tbody = document.getElementById('inventory-cost-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#888; padding:24px;">Fetching inventory from admin database...</td></tr>`;

    try {
      const res = await fetch(`${ADMIN_API}/inventory`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });

      if (res.ok) {
        allInventory = await res.json();
      } else if (res.status === 403) {
        // Fallback: seed demo data if not authorized yet
        allInventory = getDemoInventory();
        showToast('Using demo inventory — contact Admin to grant Accounting inventory access.', 'error');
      } else {
        allInventory = getDemoInventory();
      }
    } catch (err) {
      console.warn('Inventory fetch error:', err);
      allInventory = getDemoInventory();
    }

    renderInventoryCostsTab();
    return Promise.resolve();
  };

  function getDemoInventory() {
    return [];
  }

  function renderInventoryCostsTab() {
    if (!allInventory || allInventory.length === 0) {
      setText('inv-total-value', formatMoney(0));
      setText('inv-item-count', '0 product types');
      setText('inv-low-stock-count', '0');
      setText('inv-reorder-cost', formatMoney(0));
      setText('inv-out-of-stock', '0');
      setText('inv-summary-count', '0');
      setText('inv-summary-value', formatMoney(0));
      setText('inv-summary-low', '0');
      setText('inv-summary-reorder', formatMoney(0));
      const sumEl = document.getElementById('inv-cost-summary');
      if (sumEl) sumEl.style.display = 'none';
      const tb = document.getElementById('inventory-cost-body');
      if (tb) tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;padding:32px;"><i class="ti ti-package-off" style="font-size:2rem;display:block;margin-bottom:8px;color:#94a3b8;"></i>No inventory items recorded yet. Only items you add will appear here.</td></tr>';
      return;
    }

    let totalValue = 0;
    let lowCount = 0;
    let outCount = 0;
    let reorderCost = 0;

    allInventory.forEach(item => {
      const unitCost = getUnitCost(item);
      const stock = parseInt(item.stock) || 0;
      const threshold = parseInt(item.threshold) || 0;
      const value = unitCost * stock;
      totalValue += value;

      if (stock === 0) outCount++;
      if (stock < threshold && stock > 0) lowCount++;

      // Reorder cost = units needed to reach 2x threshold × unit cost
      if (stock < threshold) {
        const needed = (threshold * 2) - stock;
        reorderCost += needed * unitCost;
      }
    });

    // Update KPIs
    setText('inv-total-value', formatMoney(totalValue));
    setText('inv-item-count', `${allInventory.length} product types`);
    setText('inv-low-stock-count', String(lowCount));
    setText('inv-reorder-cost', formatMoney(reorderCost));
    setText('inv-out-of-stock', String(outCount));

    // Update summary footer
    setText('inv-summary-count', String(allInventory.length));
    setText('inv-summary-value', formatMoney(totalValue));
    setText('inv-summary-low', String(lowCount));
    setText('inv-summary-reorder', formatMoney(reorderCost));
    const sumEl = document.getElementById('inv-cost-summary');
    if (sumEl) sumEl.style.display = 'flex';

    renderInventoryTable(allInventory);
  }

  function renderInventoryTable(list) {
    const tbody = document.getElementById('inventory-cost-body');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#888;padding:24px;">No items match your filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const unitCost = getUnitCost(item);
      const stock = parseInt(item.stock) || 0;
      const threshold = parseInt(item.threshold) || 0;
      const totalVal = unitCost * stock;
      const isLow = stock > 0 && stock < threshold;
      const isOut = stock === 0;

      let stockBadge = `<span class="badge-status badge-paid"><i class="ti ti-check"></i> In Stock</span>`;
      if (isOut) stockBadge = `<span class="badge-status badge-unpaid" style="background:#fef2f2;color:#b91c1c;"><i class="ti ti-alert-circle"></i> Out of Stock</span>`;
      else if (isLow) stockBadge = `<span class="badge-status badge-hmo" style="background:#fefce8;color:#854d0e;"><i class="ti ti-alert-triangle"></i> Low Stock</span>`;

      const needsReorder = isLow || isOut;

      return `
        <tr style="${needsReorder ? 'background: #fffbeb;' : ''}">
          <td><strong>${escapeHtml(item.name)}</strong>${needsReorder ? ' <span style="color:#f59e0b; font-size:0.75rem;"><i class="ti ti-alert-triangle"></i> Reorder</span>' : ''}</td>
          <td><span class="exp-cat-badge">${escapeHtml(item.category)}</span></td>
          <td style="font-weight:700; color:${isOut ? '#b91c1c' : isLow ? '#b45309' : '#1e293b'};">${stock}</td>
          <td style="color:#64748b; font-size:0.85rem;">${escapeHtml(item.unit || '—')}</td>
          <td style="color:#3b82f6; font-weight:600;">${formatMoney(unitCost)}</td>
          <td style="font-weight:700; color: var(--primary-color);">${formatMoney(totalVal)}</td>
          <td style="color:#94a3b8;">${threshold} ${escapeHtml(item.unit || 'units')}</td>
          <td>${stockBadge}</td>
          <td style="text-align:right;">
            ${needsReorder ? `<button type="button" class="btn-text-action" style="color:#10b981;" onclick="quickReorderItem('${escapeHtml(item.name)}', ${unitCost}, ${threshold - stock})"><i class="ti ti-shopping-cart-plus"></i> Reorder</button>` : `<span style="color:#94a3b8; font-size:0.8rem;">—</span>`}
          </td>
        </tr>
      `;
    }).join('');
  }

  window.filterInventoryTable = function() {
    const query = (document.getElementById('inv-search-input')?.value || '').toLowerCase();
    const catF = document.getElementById('inv-cat-filter')?.value || 'all';
    const statusF = document.getElementById('inv-status-filter-inv')?.value || 'all';

    const filtered = allInventory.filter(item => {
      const matchQ = !query || `${item.name} ${item.category}`.toLowerCase().includes(query);
      const matchC = catF === 'all' || item.category === catF;
      const stock = parseInt(item.stock) || 0;
      const threshold = parseInt(item.threshold) || 0;
      let itemStatus = 'In Stock';
      if (stock === 0) itemStatus = 'Out of Stock';
      else if (stock < threshold) itemStatus = 'Low Stock';
      const matchS = statusF === 'all' || itemStatus === statusF;
      return matchQ && matchC && matchS;
    });
    renderInventoryTable(filtered);
  };

  window.quickReorderItem = function(itemName, unitCost, qtyNeeded) {
    openPurchaseOrderModal([{ name: itemName, unitCost, qty: Math.max(qtyNeeded, 1) }]);
  };

  window.openPurchaseOrderModal = function(preItems) {
    const list = preItems || allInventory.filter(i => (parseInt(i.stock) || 0) < (parseInt(i.threshold) || 0));
    const container = document.getElementById('po-items-list');

    if (!container) return;

    if (!list || list.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:#888; padding:20px;"><i class="ti ti-circle-check" style="color:#10b981; margin-right:4px;"></i>All inventory items are adequately stocked!</p>`;
      document.getElementById('po-total-amount').textContent = formatMoney(0);
      openModal('modal-purchase-order');
      return;
    }

    let poTotal = 0;
    container.innerHTML = list.map((item, idx) => {
      const unitCost = item.unitCost || getUnitCost(item);
      const stock = parseInt(item.stock) || 0;
      const threshold = parseInt(item.threshold) || 0;
      const defaultQty = item.qty || Math.max((threshold * 2) - stock, 1);
      const lineTotal = unitCost * defaultQty;
      poTotal += lineTotal;

      return `
        <div class="po-item-row" id="po-row-${idx}" style="display:flex; align-items:center; gap:12px; padding:10px; background:#f8fafc; border-radius:8px; border:1px solid var(--border-color);">
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.9rem;">${escapeHtml(item.name)}</div>
            <div style="font-size:0.78rem; color:#64748b;">Unit Cost: ${formatMoney(unitCost)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.8rem; color:#475569;">Qty:</label>
            <input type="number" class="po-qty-input" data-unit-cost="${unitCost}" value="${defaultQty}" min="1"
              style="width:70px; padding:6px 8px; border:1px solid var(--border-color); border-radius:6px; font-size:0.9rem; text-align:center;"
              oninput="updatePOTotal()">
          </div>
          <div style="min-width:90px; text-align:right;">
            <strong class="po-line-total" style="color: var(--primary-color);">${formatMoney(lineTotal)}</strong>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('po-total-amount').textContent = formatMoney(poTotal);
    document.getElementById('po-delivery-date').valueAsDate = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })();
    openModal('modal-purchase-order');
  };

  window.updatePOTotal = function() {
    let total = 0;
    document.querySelectorAll('.po-qty-input').forEach(input => {
      const unitCost = parseFloat(input.getAttribute('data-unit-cost')) || 0;
      const qty = parseInt(input.value) || 0;
      const lineTotal = unitCost * qty;
      total += lineTotal;
      const row = input.closest('.po-item-row');
      if (row) {
        const lineTotalEl = row.querySelector('.po-line-total');
        if (lineTotalEl) lineTotalEl.textContent = formatMoney(lineTotal);
      }
    });
    setText('po-total-amount', formatMoney(total));
  };

  window.submitPurchaseOrder = function() {
    const vendor = document.getElementById('po-vendor').value.trim() || 'Dental Supply Vendor';
    const deliveryDate = document.getElementById('po-delivery-date').value;
    const totalAmt = document.getElementById('po-total-amount').textContent;

    // Record as a pending expense
    const poRef = `PO-${Date.now()}`;
    const newExp = {
      id: `exp-${Date.now()}`,
      ref: poRef,
      vendor,
      category: 'Supplies',
      desc: `Purchase Order for inventory restock — ${deliveryDate ? `Delivery: ${deliveryDate}` : ''}`,
      amount: parseFloat(totalAmt.replace(/[^\d.]/g, '')) || 0,
      dueDate: deliveryDate || new Date().toISOString().slice(0, 10),
      paidDate: null,
      status: 'Unpaid',
      payMethod: 'Bank Transfer',
      payRef: ''
    };
    allExpenses.push(newExp);
    saveExpenses();
    renderExpensesTab();

    closeModal('modal-purchase-order');
    showToast(`Purchase Order ${poRef} submitted to ${vendor}! Logged as pending expense.`, 'success');
  };

  window.printPurchaseOrder = function() {
    window.print();
  };

  // ─── Financial Reconciliation & Separation of Duties Audit ───────────────────
  window.runFinancialReconciliation = async function(isManual = false) {
    try {
      const url = isManual ? `${INVOICE_API}/reconciliation?log=true` : `${INVOICE_API}/reconciliation`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error('Reconciliation check failed');
      const data = await res.json();

      const badge = document.getElementById('rec-status-badge');
      const unbilledEl = document.getElementById('rec-unbilled-count');
      const discEl = document.getElementById('rec-discrepancy-count');
      const discBox = document.getElementById('rec-discrepancy-container');
      const discList = document.getElementById('rec-discrepancy-list');

      if (unbilledEl && data.summary) unbilledEl.textContent = data.summary.unbilledAppointmentsCount;
      if (discEl && data.summary) discEl.textContent = data.summary.discrepancyCount;

      if (badge) {
        if (data.isReconciled) {
          badge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span> Clean (Balanced)';
          badge.style.color = '#166534';
        } else {
          badge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span> Discrepancies Found';
          badge.style.color = '#b91c1c';
        }
      }

      if (discBox && discList) {
        if (!data.isReconciled && (data.discrepancies.length > 0 || data.unbilledAppointments.length > 0)) {
          discBox.style.display = 'block';
          discList.innerHTML = '';
          data.unbilledAppointments.forEach(u => {
            const li = document.createElement('li');
            li.textContent = `Unbilled Appointment: ${u.patientName} (${u.treatmentName}) on ${new Date(u.date).toLocaleDateString()} — Est: ₱${u.estimatedAmount}`;
            discList.appendChild(li);
          });
          data.discrepancies.forEach(d => {
            const li = document.createElement('li');
            li.textContent = d.description;
            discList.appendChild(li);
          });
        } else {
          discBox.style.display = 'none';
        }
      }

      if (isManual && typeof showToast === 'function') {
        showToast(data.isReconciled ? 'Financial ledger fully reconciled.' : 'Reconciliation detected items requiring review.', data.isReconciled ? 'success' : 'warning');
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
    }
  };

  // Helper
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

})();

