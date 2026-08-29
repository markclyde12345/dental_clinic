// ==========================================================================
// DENTIST DASHBOARD — MAIN CONTROLLER & INTERACTIVE MODULES
// Fano Dental Clinic Management System
// ==========================================================================

let currentUser = null;
let allAppointments = [];
let allPatients = [];
let activeQueue = { current: null, next: null, waiting: [] };
let activeChartType = 'adult'; // 'adult' | 'pediatric'
let selectedToothId = null;
let activePatientChart = { teeth: {}, notes: '', summary: '' };
let chairTimerInterval = null;
let chairTimerSeconds = 0;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

async function initDashboard() {
  // Set live header date
  const dateElem = document.getElementById('current-date');
  if (dateElem) {
    dateElem.textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // Auth verification
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) {
    window.location.replace('login.html');
    return;
  }

  try {
    const profile = await api.get('/auth/profile');
    if (!profile || profile.role !== 'Dentist' && profile.role !== 'Admin' && profile.role !== 'Dental Assistant') {
      alert('Access restricted: Dentist clinical account required.');
      logout();
      return;
    }
    currentUser = profile;
    setupUserProfile(profile);
  } catch (err) {
    console.error('Profile auth error:', err);
    logout();
    return;
  }

  // Setup tab routing & interactions
  setupTabs();
  setupNotifDropdown();
  setupScheduleFilters();
  setupChartListeners();

  // Load initial data
  await loadOverview();
  await loadNotifications();
}

// ─── User Profile Setup ──────────────────────────────────────────
function setupUserProfile(user) {
  const rawName = user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Dentist';
  // Avoid double "Dr. Dr."
  const cleanName = rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`;
  const initial = cleanName.replace(/^Dr\.\s*/, '').charAt(0).toUpperCase() || 'D';

  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  const profNameEl = document.getElementById('prof-name');
  const profAvatarEl = document.getElementById('prof-avatar');
  const profEmailEl = document.getElementById('prof-email');
  const profContactEl = document.getElementById('prof-contact');
  const editNameEl = document.getElementById('edit-dentist-name');
  const editPhoneEl = document.getElementById('edit-dentist-phone');

  if (nameEl) nameEl.textContent = cleanName;
  if (avatarEl) avatarEl.textContent = initial;
  if (profNameEl) profNameEl.textContent = cleanName;
  if (profAvatarEl) profAvatarEl.textContent = initial;
  if (profEmailEl) profEmailEl.textContent = user.email || 'dentist@fanoclinic.com';
  if (profContactEl) profContactEl.textContent = user.contact_number || '+63 917 555 0192';
  if (editNameEl) editNameEl.value = cleanName;
  if (editPhoneEl) editPhoneEl.value = user.contact_number || '';
}

// ─── Tab Navigation Routing ─────────────────────────────────────
function setupTabs() {
  const menuLinks = document.querySelectorAll('.sidebar-menu a');
  menuLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = link.getAttribute('data-tab');
      if (tabName) switchTab(tabName);
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = (window.location.hash || '').replace('#', '').trim();
    if (hash) switchTab(hash);
  });

  const validTabs = ['overview', 'schedule', 'queue', 'patients', 'chart', 'treatments', 'prescriptions', 'followups', 'calendar', 'reports', 'profile'];
  const hashTab = (window.location.hash || '').replace('#', '').trim();
  const savedTab = localStorage.getItem('dentist_active_tab');
  const initialTab = validTabs.includes(hashTab) ? hashTab : (validTabs.includes(savedTab) ? savedTab : 'overview');
  if (initialTab !== 'overview') {
    switchTab(initialTab);
  }
}

function switchTab(tabName) {
  if (!tabName) return;
  const menuLinks = document.querySelectorAll('.sidebar-menu a');
  menuLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-tab') === tabName));

  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(p => p.hidden = true);

  const activePanel = document.getElementById('tab-' + tabName);
  if (activePanel) activePanel.hidden = false;

  try {
    localStorage.setItem('dentist_active_tab', tabName);
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, null, '#' + tabName);
    }
  } catch (e) {}

  const titles = {
    overview: 'Dashboard Overview',
    schedule: "Today's Patient Schedule",
    queue: 'Live Patient Queue & Chair',
    patients: 'Patient Electronic Records',
    chart: 'Interactive Dental Charting',
    treatments: 'Treatment Plans & Procedures',
    prescriptions: 'Prescriptions Management (Rx)',
    followups: 'Post-Op Follow-Up Management',
    calendar: 'Clinical Appointments Calendar',
    reports: 'Clinical Reports & Statistics',
    profile: 'Dentist Professional Profile'
  };

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[tabName] || 'Dentist Portal';

  // Lazy tab loaders
  if (tabName === 'overview') loadOverview();
  else if (tabName === 'schedule') loadScheduleTable();
  else if (tabName === 'queue') loadQueueView();
  else if (tabName === 'patients') loadPatientsView();
  else if (tabName === 'chart') initDentalChartTab();
  else if (tabName === 'treatments') loadTreatmentPlansView();
  else if (tabName === 'prescriptions') loadPrescriptionsView();
  else if (tabName === 'followups') loadFollowUpsView();
  else if (tabName === 'calendar') loadCalendarTab();
  else if (tabName === 'reports') loadReportsView();
}
window.switchTab = switchTab;

// ─── 1. OVERVIEW MODULE ──────────────────────────────────────────
async function loadOverview() {
  try {
    const stats = await api.getDentistDashboard();
    
    // Summary Cards
    setVal('stat-today', stats.todayAppointments || 0);
    setVal('stat-waiting', stats.patientsWaiting || 0);
    setVal('stat-completed-today', stats.completedTreatmentsToday || 0);
    setVal('stat-followups', stats.upcomingFollowUps || 0);
    setVal('stat-month-total', stats.totalPatientsSeenThisMonth || 0);
    setVal('nav-queue-count', stats.patientsWaiting || 0);

    // Today's Schedule Table
    const todaySchedule = stats.todaysSchedule || [];
    renderTodayScheduleTable(todaySchedule);

    // Patient Queue Widget
    if (stats.queue) {
      activeQueue = stats.queue;
      renderQueueWidget(stats.queue);
    }
  } catch (err) {
    console.error('Error loading overview:', err);
  }
}

function renderTodayScheduleTable(appointments) {
  const tbody = document.getElementById('today-schedule-tbody');
  if (!tbody) return;

  if (!appointments || !appointments.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">No appointments scheduled for today.</td></tr>`;
    return;
  }

  tbody.innerHTML = appointments.map(appt => {
    const timeStr = new Date(appt.appointment_date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    const patientName = appt.patient ? appt.patient.name : 'Unknown Patient';
    const procedure = appt.treatment ? appt.treatment.name : (appt.notes || 'General Consultation');

    return `
      <tr>
        <td><strong>${timeStr}</strong></td>
        <td>
          <strong>${esc(patientName)}</strong><br>
          <small class="muted">${esc(appt.patient ? appt.patient.contact_number || '' : '')}</small>
        </td>
        <td>${esc(procedure)}</td>
        <td><span class="badge ${badgeClass(appt.status)}">${esc(appt.status)}</span></td>
        <td>
          <button class="btn btn-ghost small" onclick="openClinicalWorkspace('${appt.id}')">
            <i class="fa-solid fa-folder-open"></i> Open
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderQueueWidget(queue) {
  const chairContent = document.getElementById('chair-content');
  const nextBox = document.getElementById('queue-next-box');
  const waitingList = document.getElementById('queue-waiting-list');
  const countEl = document.getElementById('queue-waiting-count');

  if (chairContent) {
    if (queue.current) {
      const p = queue.current.patient || {};
      const t = queue.current.treatment || {};
      chairContent.innerHTML = `
        <div class="active-chair-patient">
          <div>
            <h4>${esc(p.name || 'Patient')}</h4>
            <p>${esc(t.name || 'Consultation')} • Contact: ${esc(p.contact_number || 'N/A')}</p>
          </div>
          <button class="btn btn-success small" onclick="completeCurrentPatient('${queue.current.id}')">
            <i class="fa-solid fa-check"></i> Complete
          </button>
        </div>
      `;
    } else {
      chairContent.innerHTML = `
        <div class="no-patient-in-chair">
          <i class="fa-solid fa-couch"></i>
          <p>No patient currently in chair.</p>
          <button class="btn btn-gold small" onclick="triggerCallNext()">Start Next Patient</button>
        </div>
      `;
    }
  }

  if (nextBox) {
    if (queue.next) {
      const np = queue.next.patient || {};
      nextBox.innerHTML = `
        <div>
          <strong>${esc(np.name || 'Patient')}</strong>
          <div class="muted small">${esc(queue.next.treatment ? queue.next.treatment.name : 'Appointment')}</div>
        </div>
        <button class="btn btn-primary small" onclick="startAppointmentById('${queue.next.id}')">Start</button>
      `;
    } else {
      nextBox.innerHTML = `<span class="muted small">No next patient in line.</span>`;
    }
  }

  if (waitingList) {
    const waiting = queue.waiting || [];
    if (countEl) countEl.textContent = waiting.length;
    if (!waiting.length) {
      waitingList.innerHTML = `<span class="muted small" style="padding:6px;">No patients waiting.</span>`;
    } else {
      waitingList.innerHTML = waiting.map((w, idx) => `
        <div class="queue-item-row">
          <span>#${idx + 2} ${esc(w.patient ? w.patient.name : 'Patient')}</span>
          <span class="badge badge-waiting">Waiting</span>
        </div>
      `).join('');
    }
  }
}

// ─── 2. SCHEDULE MODULE ─────────────────────────────────────────
async function loadScheduleTable() {
  const tbody = document.getElementById('full-schedule-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Loading schedule...</td></tr>`;

  try {
    allAppointments = await api.getDentistAppointments();
    applyScheduleFilters();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading error">${esc(err.message)}</td></tr>`;
  }
}

function setupScheduleFilters() {
  const dateFilter = document.getElementById('schedule-date-filter');
  const statusFilter = document.getElementById('schedule-status-filter');
  const searchFilter = document.getElementById('schedule-search-filter');

  if (dateFilter) dateFilter.addEventListener('change', applyScheduleFilters);
  if (statusFilter) statusFilter.addEventListener('change', applyScheduleFilters);
  if (searchFilter) searchFilter.addEventListener('input', applyScheduleFilters);
}

function applyScheduleFilters() {
  const tbody = document.getElementById('full-schedule-tbody');
  if (!tbody) return;

  const dateVal = document.getElementById('schedule-date-filter')?.value;
  const statusVal = document.getElementById('schedule-status-filter')?.value || 'All';
  const query = (document.getElementById('schedule-search-filter')?.value || '').toLowerCase().trim();

  const filtered = allAppointments.filter(a => {
    if (dateVal) {
      const dStr = new Date(a.appointment_date).toISOString().split('T')[0];
      if (dStr !== dateVal) return false;
    }
    if (statusVal !== 'All' && a.status !== statusVal) return false;
    if (query) {
      const pName = (a.patient && a.patient.name) || '';
      const pEmail = (a.patient && a.patient.email) || '';
      if (!pName.toLowerCase().includes(query) && !pEmail.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No appointments matching filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(appt => {
    const d = new Date(appt.appointment_date);
    const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const p = appt.patient || {};
    const t = appt.treatment || {};

    return `
      <tr>
        <td>
          <strong>${dateFormatted}</strong><br>
          <small class="muted">${timeFormatted}</small>
        </td>
        <td><strong>${esc(p.name || 'Unknown')}</strong></td>
        <td>${esc(p.contact_number || p.email || 'N/A')}</td>
        <td>${esc(t.name || 'General Consultation')}</td>
        <td><span class="badge ${badgeClass(appt.status)}">${esc(appt.status)}</span></td>
        <td><span class="muted small">${esc(appt.notes ? (appt.notes.slice(0, 30) + '...') : 'None')}</span></td>
        <td>
          <button class="btn btn-ghost small" onclick="openClinicalWorkspace('${appt.id}')">
            <i class="fa-solid fa-folder-open"></i> Workspace
          </button>
          <button class="btn btn-ghost small" onclick="quickUpdateStatus('${appt.id}')">
            <i class="fa-solid fa-pen-to-square"></i> Status
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── 3. PATIENT QUEUE MODULE ────────────────────────────────────
async function loadQueueView() {
  try {
    const qData = await api.getDentistQueue();
    const activeChair = document.getElementById('queue-detailed-chair');
    const tbody = document.getElementById('queue-detailed-tbody');

    if (activeChair) {
      if (qData.current) {
        const cp = qData.current.patient || {};
        const ct = qData.current.treatment || {};
        activeChair.innerHTML = `
          <div style="background:var(--primary-subtle); border-radius:14px; padding:20px; border:1px solid rgba(11,60,77,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <span class="badge badge-in-progress">IN TREATMENT</span>
                <h3 style="margin:10px 0 4px 0; color:var(--primary-color);">${esc(cp.name || 'Patient')}</h3>
                <p class="muted small">Procedure: <strong>${esc(ct.name || 'General Dental Examination')}</strong></p>
                <p class="muted small">Contact: ${esc(cp.contact_number || 'N/A')} • Email: ${esc(cp.email || 'N/A')}</p>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary small" onclick="openClinicalWorkspace('${qData.current.id}')">
                  <i class="fa-solid fa-stethoscope"></i> Clinical Notes & Rx
                </button>
                <button class="btn btn-success small" onclick="completeCurrentPatient('${qData.current.id}')">
                  <i class="fa-solid fa-circle-check"></i> Complete Treatment
                </button>
              </div>
            </div>
          </div>
        `;
        startChairTimer();
      } else {
        activeChair.innerHTML = `
          <div style="text-align:center; padding:30px; background:#f8fafc; border-radius:14px; border:1px dashed var(--border-color);">
            <i class="fa-solid fa-chair" style="font-size:2.5rem; color:#94a3b8; margin-bottom:10px;"></i>
            <h4 style="margin:0 0 6px 0; color:var(--primary-color);">Dental Chair is Ready</h4>
            <p class="muted small" style="margin-bottom:14px;">No patient is currently in treatment.</p>
            <button class="btn btn-primary" onclick="triggerCallNext()">
              <i class="fa-solid fa-bullhorn"></i> Call Next Waiting Patient
            </button>
          </div>
        `;
        stopChairTimer();
      }
    }

    if (tbody) {
      const waitingList = [ ...(qData.next ? [qData.next] : []), ...(qData.waiting || []) ];
      if (!waitingList.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-loading">No waiting patients in queue.</td></tr>`;
      } else {
        tbody.innerHTML = waitingList.map((w, idx) => {
          const wp = w.patient || {};
          const wt = w.treatment || {};
          const tTime = new Date(w.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `
            <tr>
              <td><strong>#${idx + 1}</strong></td>
              <td><strong>${esc(wp.name || 'Patient')}</strong></td>
              <td>${tTime}</td>
              <td>${esc(wt.name || 'Consultation')}</td>
              <td><span class="badge badge-waiting">Standard</span></td>
              <td>
                <button class="btn btn-primary small" onclick="startAppointmentById('${w.id}')">
                  <i class="fa-solid fa-play"></i> Call to Chair
                </button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading queue view:', err);
  }
}

function startChairTimer() {
  if (chairTimerInterval) clearInterval(chairTimerInterval);
  chairTimerSeconds = 0;
  chairTimerInterval = setInterval(() => {
    chairTimerSeconds++;
    const h = String(Math.floor(chairTimerSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((chairTimerSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(chairTimerSeconds % 60).padStart(2, '0');
    const el = document.getElementById('timer-display');
    if (el) el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

function stopChairTimer() {
  if (chairTimerInterval) clearInterval(chairTimerInterval);
  const el = document.getElementById('timer-display');
  if (el) el.textContent = '00:00:00';
}

async function triggerCallNext() {
  try {
    const res = await api.callNextQueue();
    if (res.success) {
      alert(`Next patient called: ${res.appointment.patient ? res.appointment.patient.name : 'Patient'}`);
      loadOverview();
      loadQueueView();
    }
  } catch (err) {
    alert(err.message);
  }
}
window.triggerCallNext = triggerCallNext;

async function startAppointmentById(id) {
  try {
    await api.put(`/appointments/${id}`, { status: 'In Progress' });
    loadOverview();
    loadQueueView();
  } catch (err) {
    alert(err.message);
  }
}
window.startAppointmentById = startAppointmentById;

async function completeCurrentPatient(id) {
  if (!confirm('Mark this treatment as completed? An invoice will be generated automatically.')) return;
  try {
    await api.put(`/appointments/${id}`, { status: 'Completed' });
    stopChairTimer();
    alert('Treatment marked as Completed.');
    loadOverview();
    loadQueueView();
  } catch (err) {
    alert(err.message);
  }
}
window.completeCurrentPatient = completeCurrentPatient;

// ─── 4. PATIENT RECORDS MODULE ──────────────────────────────────
async function loadPatientsView() {
  const grid = document.getElementById('patient-cards-grid');
  const countEl = document.getElementById('patient-count');
  if (!grid) return;
  grid.innerHTML = `<div class="table-loading" style="grid-column: 1/-1;">Loading patient records...</div>`;

  try {
    allPatients = await api.get('/patients');
    if (countEl) countEl.textContent = `${allPatients.length} registered patients`;

    renderPatientCards(allPatients);

    const searchInput = document.getElementById('patient-search');
    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase().trim();
        const filtered = allPatients.filter(p => {
          const u = p.user || {};
          return (u.name || '').toLowerCase().includes(q) ||
                 (u.email || '').toLowerCase().includes(q) ||
                 (u.contact_number || '').includes(q);
        });
        renderPatientCards(filtered);
      };
    }
  } catch (err) {
    grid.innerHTML = `<div class="error" style="grid-column: 1/-1;">${esc(err.message)}</div>`;
  }
}

function renderPatientCards(patients) {
  const grid = document.getElementById('patient-cards-grid');
  if (!grid) return;

  if (!patients.length) {
    grid.innerHTML = `<div class="muted small" style="grid-column: 1/-1; padding:30px; text-align:center;">No patient records found.</div>`;
    return;
  }

  grid.innerHTML = patients.map((p, idx) => {
    const u = p.user || {};
    const name = u.name || 'Patient';
    const initial = name.charAt(0).toUpperCase();
    const dob = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : 'N/A';
    const gender = p.gender || 'N/A';
    const blood = p.blood_type || 'N/A';
    const pId = p.user_id || u.id;

    // Use doctor/patient assets if present or gradient avatar
    const photoUrl = p.avatar_url || u.avatar_url || (idx % 2 === 0 ? '../Resources/doctor1.webp' : '../Resources/doctor3.webp');

    return `
      <div class="patient-card-item">
        <div>
          <div class="patient-header">
            <div class="patient-avatar-badge">
              <img src="${photoUrl}" alt="${esc(name)}" class="patient-avatar-img" onerror="this.outerHTML='<span>${initial}</span>'">
            </div>
            <div>
              <h4 class="patient-name-title">${esc(name)}</h4>
              <small class="muted">${esc(u.email || '')}</small>
            </div>
          </div>
          <div class="patient-info-list">
            <div><i class="fa-solid fa-phone"></i> ${esc(u.contact_number || 'No contact')}</div>
            <div><i class="fa-solid fa-cake-candles"></i> DOB: ${dob} (${gender})</div>
            <div><i class="fa-solid fa-droplet"></i> Blood: ${blood}</div>
            <div><i class="fa-solid fa-notes-medical"></i> Allergies: ${esc(p.allergies ? (Array.isArray(p.allergies) ? p.allergies.join(', ') : p.allergies) : 'None')}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn btn-primary small" style="flex:1;" onclick="openPatientRecordModal('${pId}')">
            <i class="fa-solid fa-id-card-clip"></i> View Record
          </button>
          <button class="btn btn-ghost small" onclick="openDentalChartForPatient('${pId}')" title="Dental Chart">
            <i class="fa-solid fa-tooth"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function openPatientRecordModal(userId) {
  Modal.open(`<div class="modal-spinner">Loading electronic medical record...</div>`);
  try {
    const data = await api.getPatientRecord(userId);
    const p = data.patient || {};
    const m = data.medical || {};
    const history = data.dentalHistory || [];
    const images = data.images || [];
    const initial = (p.name || 'P').charAt(0).toUpperCase();
    const photoUrl = p.avatar_url || '../Resources/doctor1.webp';

    const historyHtml = history.length ? history.map(h => `
      <li style="padding:8px 0; border-bottom:1px solid #f1f5f9;">
        <span class="badge ${badgeClass(h.status)}">${esc(h.status)}</span>
        <strong>${new Date(h.appointment_date).toLocaleDateString()}</strong> — ${esc(h.treatment ? h.treatment.name : 'Consultation')}
        <div class="muted small">${esc(h.notes || '')}</div>
      </li>
    `).join('') : '<li class="muted small">No previous dental visits recorded.</li>';

    const imagesHtml = images.length ? images.map(img => `
      <div class="xray-card">
        <button class="xray-del-btn" onclick="deletePatientXray('${p.id}', '${img.id}')" title="Remove X-Ray">×</button>
        <div class="xray-thumb-wrap" onclick="openLightbox('${img.url}', '${esc(img.title)}')">
          <img src="${img.url}" alt="${esc(img.title)}" onerror="this.src='../Resources/dental_xray.png'">
          <div class="xray-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i></div>
        </div>
        <div class="xray-meta">
          <strong>${esc(img.title)}</strong>
          <small>${esc(img.type || 'X-Ray')} • ${esc(img.date || '')}</small>
        </div>
      </div>
    `).join('') : '<p class="muted small">No X-rays or clinical photos uploaded.</p>';

    Modal.open(`
      <div class="modal-body modal-wide">
        <button class="modal-close" onclick="Modal.close()">×</button>
        
        <!-- Patient Profile Hero Header with Picture -->
        <div class="patient-profile-hero">
          <img src="${photoUrl}" alt="${esc(p.name)}" class="patient-large-photo" onerror="this.outerHTML='<div class=\\'patient-large-initials\\'>${initial}</div>'">
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <h2 style="font-family:var(--font-display); color:var(--primary-color); margin:0 0 4px 0;">${esc(p.name || 'Patient Record')}</h2>
                <span class="badge badge-confirmed">Registered Patient</span>
                <span class="muted small" style="margin-left:8px;">ID: #${esc(p.id)}</span>
              </div>
              <button class="btn btn-ghost small" onclick="openEditPatientModal('${p.id}')">
                <i class="fa-solid fa-user-pen"></i> Edit Info
              </button>
            </div>
            <p class="muted small" style="margin:6px 0 0 0;">Member since ${new Date(p.created_at || Date.now()).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}</p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1.25fr; gap:24px;">
          <!-- Left: Demographics & Medical Profile -->
          <div>
            <h4 style="color:var(--primary-color); margin-top:0;">Demographics & Health Profile</h4>
            <div style="background:#f8fafc; padding:14px; border-radius:12px; font-size:0.85rem; line-height:1.7; border:1px solid #e2e8f0;">
              <div><strong>Email:</strong> ${esc(p.email || 'N/A')}</div>
              <div><strong>Phone:</strong> ${esc(p.contact_number || 'N/A')}</div>
              <div><strong>Address:</strong> ${esc(p.address || 'N/A')}</div>
              <div><strong>DOB:</strong> ${m.date_of_birth ? new Date(m.date_of_birth).toLocaleDateString() : 'N/A'} (${esc(m.gender || 'N/A')})</div>
              <div><strong>Blood Type:</strong> ${esc(m.blood_type || 'N/A')}</div>
              <div><strong>Allergies:</strong> <span style="color:#dc2626; font-weight:700;">${esc(m.allergies ? (Array.isArray(m.allergies) ? m.allergies.join(', ') : m.allergies) : 'None Known')}</span></div>
              <div><strong>Medical Notes:</strong> ${esc(m.medical_notes || 'No systemic conditions noted.')}</div>
            </div>

            <!-- Uploaded X-rays & Imaging with Add Button -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; margin-bottom:8px;">
              <h4 style="color:var(--primary-color); margin:0;">
                <i class="fa-solid fa-x-ray"></i> X-Rays & Imaging (${images.length})
              </h4>
              <button class="btn btn-primary small" onclick="openUploadImageModal('${p.id}')">
                <i class="fa-solid fa-upload"></i> + Upload
              </button>
            </div>
            <div class="xray-gallery-grid">
              ${imagesHtml}
            </div>
          </div>

          <!-- Right: Dental History & Actions -->
          <div>
            <h4 style="color:var(--primary-color); margin-top:0;">Clinical Visit History</h4>
            <ul style="list-style:none; padding:0; margin:0; max-height:280px; overflow-y:auto;">
              ${historyHtml}
            </ul>

            <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border-color); display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-primary" onclick="openDentalChartForPatient('${p.id}')">
                <i class="fa-solid fa-tooth"></i> Open Dental Chart
              </button>
              <button class="btn btn-gold" onclick="openNewPrescriptionForPatient('${p.id}', '${esc(p.name)}')">
                <i class="fa-solid fa-prescription"></i> Issue Rx
              </button>
            </div>
          </div>
        </div>
      </div>
    `);
  } catch (err) {
    Modal.open(`<div class="modal-body"><p class="error">${esc(err.message)}</p></div>`);
  }
}
window.openPatientRecordModal = openPatientRecordModal;

// Lightbox for X-rays & Photos
function openLightbox(imageUrl, title) {
  Modal.open(`
    <div class="modal-body lightbox-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="margin:0; font-family:var(--font-display);">${esc(title || 'Clinical Imaging Preview')}</h3>
      <p class="muted small" style="margin-top:4px; color:#cbd5e1 !important;">High-resolution diagnostic view</p>
      <img src="${imageUrl}" alt="${esc(title)}" onerror="this.src='../Resources/dental_xray.png'">
      <div style="margin-top:16px;">
        <button class="btn btn-ghost small" onclick="Modal.close()">Close Preview</button>
      </div>
    </div>
  `);
}
window.openLightbox = openLightbox;

// Upload/Attach new X-ray or intraoral image for patient
function openUploadImageModal(patientId) {
  Modal.open(`
    <div class="modal-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="font-family:var(--font-display); color:var(--primary-color); margin-top:0;">
        <i class="fa-solid fa-x-ray"></i> Upload Patient X-Ray / Clinical Scan
      </h3>
      <form onsubmit="handleUploadPatientImage(event, '${patientId}')">
        <label class="field">
          Image / Scan Title
          <input type="text" id="img-upload-title" class="input" placeholder="e.g. Panoramic Full Mouth OPG" required>
        </label>
        <label class="field">
          Image Category
          <select id="img-upload-type" class="input" required>
            <option value="Bitewing X-Ray">Bitewing Radiograph</option>
            <option value="Panoramic OPG">Panoramic Full Scan</option>
            <option value="Periapical X-Ray">Periapical X-Ray</option>
            <option value="Intraoral Photo">Intraoral Camera Photo</option>
            <option value="Cephalometric">Cephalometric Scan</option>
            <option value="Smile Scan">Smile / Aesthetic Photo</option>
          </select>
        </label>
        <label class="field">
          Select Image File
          <input type="file" id="img-upload-file" class="input" accept="image/*" onchange="previewUploadFile(event)">
        </label>
        <div id="img-preview-box" style="margin-bottom:14px; display:none; text-align:center;">
          <img id="img-preview-tag" src="" style="max-height:120px; border-radius:8px; border:1px solid var(--border-color);">
        </div>
        <div class="form-actions mt-3">
          <button type="submit" class="btn btn-primary">Attach Image to Record</button>
        </div>
      </form>
    </div>
  `);
}
window.openUploadImageModal = openUploadImageModal;

let uploadedImageDataUrl = '';
function previewUploadFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    uploadedImageDataUrl = evt.target.result;
    const box = document.getElementById('img-preview-box');
    const tag = document.getElementById('img-preview-tag');
    if (box && tag) {
      tag.src = uploadedImageDataUrl;
      box.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}
window.previewUploadFile = previewUploadFile;

async function handleUploadPatientImage(e, patientId) {
  e.preventDefault();
  const title = document.getElementById('img-upload-title').value;
  const type = document.getElementById('img-upload-type').value;

  const data = {
    title,
    type,
    url: uploadedImageDataUrl || '../Resources/dental_xray.png',
    imageData: uploadedImageDataUrl || null
  };

  try {
    await api.addPatientImage(patientId, data);
    uploadedImageDataUrl = '';
    alert('Clinical image attached successfully.');
    openPatientRecordModal(patientId);
  } catch (err) {
    alert(err.message);
  }
}
window.handleUploadPatientImage = handleUploadPatientImage;

async function deletePatientXray(patientId, imgId) {
  if (!confirm('Remove this clinical image from the patient record?')) return;
  try {
    await api.deletePatientImage(patientId, imgId);
    openPatientRecordModal(patientId);
  } catch (err) {
    alert(err.message);
  }
}
window.deletePatientXray = deletePatientXray;

// ─── 5. DENTAL CHARTING MODULE ──────────────────────────────────
const ADULT_UPPER_TEETH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const ADULT_LOWER_TEETH = [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17];
const PEDIATRIC_UPPER_TEETH = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const PEDIATRIC_LOWER_TEETH = ['T', 'S', 'R', 'Q', 'P', 'O', 'N', 'M', 'L', 'K'];

async function initDentalChartTab() {
  populateChartPatientSelect();
  renderOdontogram();
}

async function populateChartPatientSelect() {
  const select = document.getElementById('chart-patient-select');
  if (!select) return;
  if (!allPatients.length) {
    allPatients = await api.get('/patients').catch(() => []);
  }
  select.innerHTML = `<option value="">-- Select Patient --</option>` + allPatients.map(p => {
    const u = p.user || {};
    const pId = p.user_id || u.id;
    return `<option value="${pId}">${esc(u.name || 'Patient')} (${esc(u.email || '')})</option>`;
  }).join('');

  select.onchange = async () => {
    const pId = select.value;
    if (!pId) return;
    await loadPatientDentalChart(pId);
  };
}

async function loadPatientDentalChart(patientId) {
  try {
    activePatientChart = await api.getDentalChart(patientId);
    renderOdontogram();
    renderChartSummary();
    const notesEl = document.getElementById('chart-overall-notes');
    if (notesEl) notesEl.value = activePatientChart.notes || '';
  } catch (err) {
    console.error('Failed to load dental chart:', err);
  }
}

function setChartType(type) {
  activeChartType = type;
  document.getElementById('btn-chart-adult')?.classList.toggle('active', type === 'adult');
  document.getElementById('btn-chart-pediatric')?.classList.toggle('active', type === 'pediatric');
  renderOdontogram();
}
window.setChartType = setChartType;

function renderOdontogram() {
  const upperRow = document.getElementById('upper-teeth-row');
  const lowerRow = document.getElementById('lower-teeth-row');
  if (!upperRow || !lowerRow) return;

  const upperTeeth = activeChartType === 'adult' ? ADULT_UPPER_TEETH : PEDIATRIC_UPPER_TEETH;
  const lowerTeeth = activeChartType === 'adult' ? ADULT_LOWER_TEETH : PEDIATRIC_LOWER_TEETH;

  upperRow.innerHTML = upperTeeth.map(tId => renderToothNode(tId)).join('');
  lowerRow.innerHTML = lowerTeeth.map(tId => renderToothNode(tId)).join('');
}

function renderToothNode(toothId) {
  const toothData = (activePatientChart.teeth && activePatientChart.teeth[toothId]) || { condition: 'Healthy' };
  const condition = toothData.condition || 'Healthy';
  const isSelected = selectedToothId === String(toothId);

  return `
    <div class="tooth-node ${isSelected ? 'selected' : ''}" onclick="selectTooth('${toothId}')">
      <span class="tooth-num">#${toothId}</span>
      <i class="fa-solid fa-tooth tooth-icon-shape cond-${condition}"></i>
      <span class="tooth-status-pill cond-${condition}">${condition.slice(0, 4)}</span>
    </div>
  `;
}

function selectTooth(toothId) {
  selectedToothId = String(toothId);
  renderOdontogram();

  const titleEl = document.getElementById('selected-tooth-title');
  const descEl = document.getElementById('selected-tooth-desc');
  const condSelect = document.getElementById('tooth-condition-select');
  const noteInput = document.getElementById('tooth-custom-note');

  const toothData = (activePatientChart.teeth && activePatientChart.teeth[toothId]) || { condition: 'Healthy', note: '' };

  if (titleEl) titleEl.textContent = `Tooth #${toothId}`;
  if (descEl) descEl.textContent = `Current condition: ${toothData.condition || 'Healthy'}`;
  if (condSelect) condSelect.value = toothData.condition || 'Healthy';
  if (noteInput) noteInput.value = toothData.note || '';
}
window.selectTooth = selectTooth;

function applyToothCondition() {
  if (!selectedToothId) {
    alert('Please click on a tooth in the odontogram first.');
    return;
  }
  const condSelect = document.getElementById('tooth-condition-select');
  const noteInput = document.getElementById('tooth-custom-note');

  if (!activePatientChart.teeth) activePatientChart.teeth = {};
  activePatientChart.teeth[selectedToothId] = {
    condition: condSelect.value,
    note: noteInput.value,
    updatedAt: new Date().toISOString()
  };

  renderOdontogram();
  renderChartSummary();
}
window.applyToothCondition = applyToothCondition;

async function saveActiveChart() {
  const select = document.getElementById('chart-patient-select');
  const patientId = select?.value;
  if (!patientId) {
    alert('Please select a patient before saving the dental chart.');
    return;
  }

  const notesEl = document.getElementById('chart-overall-notes');
  if (notesEl) activePatientChart.notes = notesEl.value;

  try {
    await api.saveDentalChart(patientId, activePatientChart);
    alert('Dental chart saved successfully.');
  } catch (err) {
    alert(err.message);
  }
}
window.saveActiveChart = saveActiveChart;

function renderChartSummary() {
  const summaryEl = document.getElementById('chart-summary-list');
  if (!summaryEl) return;

  const teeth = activePatientChart.teeth || {};
  const entries = Object.entries(teeth).filter(([_, data]) => data.condition && data.condition !== 'Healthy');

  if (!entries.length) {
    summaryEl.innerHTML = `<p class="muted small">All charted teeth are sound / healthy.</p>`;
    return;
  }

  summaryEl.innerHTML = entries.map(([tId, data]) => `
    <div class="chart-summary-item">
      <strong>Tooth #${tId}:</strong> <span class="badge ${badgeClass(data.condition)}">${data.condition}</span>
      ${data.note ? `<div class="muted small">${esc(data.note)}</div>` : ''}
    </div>
  `).join('');
}

function openDentalChartForPatient(patientId) {
  switchTab('chart');
  const select = document.getElementById('chart-patient-select');
  if (select) {
    select.value = patientId;
    loadPatientDentalChart(patientId);
  }
}
window.openDentalChartForPatient = openDentalChartForPatient;

// ─── 6. TREATMENT PLANS MODULE ──────────────────────────────────
async function loadTreatmentPlansView() {
  TreatmentPlans.init({ listRoot: document.getElementById('plan-list') });
  TreatmentPlans.load();
}

function openCreatePlanModal() {
  TreatmentPlans.openCreate();
}
window.openCreatePlanModal = openCreatePlanModal;

// ─── 7. PRESCRIPTIONS MANAGEMENT MODULE ─────────────────────────
async function loadPrescriptionsView() {
  const tbody = document.getElementById('prescriptions-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Loading prescriptions...</td></tr>`;

  try {
    const rxs = await api.getPrescriptions();
    if (!rxs.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No prescriptions issued yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rxs.map(r => `
      <tr>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td><strong>${esc(r.patient_name || 'Patient')}</strong></td>
        <td><strong>${esc(r.medication)}</strong></td>
        <td>${esc(r.dosage || '')} ${esc(r.frequency || '')}</td>
        <td>${esc(r.duration || '')}</td>
        <td>${esc(r.dentist_name || 'Dr. Dentist')}</td>
        <td>
          <button class="btn btn-ghost small" onclick="printPrescriptionSlip('${r.id}')">
            <i class="fa-solid fa-print"></i> Print Rx
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading error">${esc(err.message)}</td></tr>`;
  }
}

function openNewPrescriptionModal() {
  openNewPrescriptionForPatient('', '');
}
window.openNewPrescriptionModal = openNewPrescriptionModal;

async function openNewPrescriptionForPatient(patientId, patientName) {
  if (!allPatients.length) allPatients = await api.get('/patients').catch(() => []);
  const patientOptions = allPatients.map(p => {
    const u = p.user || {};
    const pId = p.user_id || u.id;
    const isSel = String(pId) === String(patientId) ? 'selected' : '';
    return `<option value="${pId}" ${isSel}>${esc(u.name || 'Patient')}</option>`;
  }).join('');

  Modal.open(`
    <div class="modal-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="font-family:var(--font-display); color:var(--primary-color); margin-top:0;">
        <i class="fa-solid fa-prescription"></i> Issue Digital Prescription
      </h3>
      <form id="new-rx-form" onsubmit="handleCreatePrescription(event)">
        <label class="field">
          Select Patient
          <select id="rx-patient-select" class="input" required>
            <option value="">-- Choose Patient --</option>
            ${patientOptions}
          </select>
        </label>
        <label class="field">
          Medication Name
          <input list="med-suggestions" id="rx-medication" class="input" placeholder="e.g. Amoxicillin 500mg" required>
          <datalist id="med-suggestions">
            <option value="Amoxicillin 500mg Caps">
            <option value="Co-Amoxiclav 625mg Tabs">
            <option value="Mefenamic Acid 500mg Caps">
            <option value="Ibuprofen 400mg Tabs">
            <option value="Paracetamol 500mg Tabs">
            <option value="Chlorhexidine Gluconate 0.12% Mouthrinse">
            <option value="Clindamycin 300mg Caps">
            <option value="Tranexamic Acid 500mg Caps">
          </datalist>
        </label>
        <div class="form-grid">
          <label class="field">
            Dosage
            <input type="text" id="rx-dosage" class="input" placeholder="e.g. 1 capsule" required>
          </label>
          <label class="field">
            Frequency
            <input type="text" id="rx-frequency" class="input" placeholder="e.g. Every 8 hours (TID)" required>
          </label>
        </div>
        <div class="form-grid">
          <label class="field">
            Duration
            <input type="text" id="rx-duration" class="input" placeholder="e.g. 7 days" required>
          </label>
          <label class="field">
            Timing / Food
            <input type="text" id="rx-timing" class="input" placeholder="e.g. After meals">
          </label>
        </div>
        <label class="field">
          Special Instructions / Precautions
          <textarea id="rx-instructions" class="input textarea" rows="2" placeholder="Take full course. Drink plenty of water..."></textarea>
        </label>
        <div class="form-actions mt-3">
          <button type="submit" class="btn btn-primary">Save & Issue Prescription</button>
        </div>
      </form>
    </div>
  `);
}
window.openNewPrescriptionForPatient = openNewPrescriptionForPatient;

async function handleCreatePrescription(e) {
  e.preventDefault();
  const sel = document.getElementById('rx-patient-select');
  const patientId = sel.value;
  const patientName = sel.options[sel.selectedIndex]?.text || 'Patient';

  const data = {
    patient_id: patientId,
    patient_name: patientName,
    medication: document.getElementById('rx-medication').value,
    dosage: document.getElementById('rx-dosage').value,
    frequency: document.getElementById('rx-frequency').value,
    duration: document.getElementById('rx-duration').value,
    instructions: document.getElementById('rx-instructions').value
  };

  try {
    const rx = await api.createPrescription(data);
    Modal.close();
    alert('Prescription issued successfully.');
    loadPrescriptionsView();
    printPrescriptionSlip(rx.id);
  } catch (err) {
    alert(err.message);
  }
}
window.handleCreatePrescription = handleCreatePrescription;

async function printPrescriptionSlip(rxId) {
  try {
    const rxs = await api.getPrescriptions();
    const rx = rxs.find(x => x.id === rxId);
    if (!rx) return alert('Prescription record not found.');

    const printContainer = document.getElementById('printable-rx-container');
    if (!printContainer) return;

    printContainer.innerHTML = `
      <div class="rx-print-card">
        <div class="rx-print-header">
          <h1>FANO DENTAL CLINIC</h1>
          <p style="margin:4px 0;">123 Dental Healthcare Ave., Metro Manila, Philippines</p>
          <p style="margin:2px 0;">Tel: (02) 8-888-FANO | PRC Reg: 0089421</p>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12pt;">
          <div>
            <strong>PATIENT:</strong> ${esc(rx.patient_name)}<br>
            <strong>DATE:</strong> ${new Date(rx.created_at).toLocaleDateString()}
          </div>
          <div style="text-align:right;">
            <strong>DOCTOR:</strong> ${esc(rx.dentist_name || 'Dr. Dentist')}<br>
            <strong>Rx Ref:</strong> #${esc(rx.id)}
          </div>
        </div>

        <div class="rx-symbol">℞</div>

        <table class="rx-table">
          <thead>
            <tr>
              <th>Medication</th>
              <th>Dosage & Frequency</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${esc(rx.medication)}</strong></td>
              <td>${esc(rx.dosage)} — ${esc(rx.frequency)}</td>
              <td>${esc(rx.duration)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin: 20px 0; font-size:11pt;">
          <strong>Instructions / Sig:</strong><br>
          ${esc(rx.instructions || 'Take as directed.')}
        </div>

        <div class="rx-signature-area">
          <div class="rx-sig-line">
            <strong>${esc(rx.dentist_name || 'Dr. Dentist')}</strong><br>
            <small>Attending Dental Surgeon</small><br>
            <small>Lic No. PRC-0089421</small>
          </div>
        </div>
      </div>
    `;

    window.print();
  } catch (err) {
    alert(err.message);
  }
}
window.printPrescriptionSlip = printPrescriptionSlip;

// ─── 8. FOLLOW-UP MANAGEMENT MODULE ─────────────────────────────
async function loadFollowUpsView() {
  const tbody = document.getElementById('followups-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Loading follow-ups...</td></tr>`;

  try {
    const list = await api.getFollowUps();
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No pending follow-ups.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(f => `
      <tr>
        <td><strong>${new Date(f.scheduled_date).toLocaleDateString()}</strong></td>
        <td><strong>${esc(f.patient_name)}</strong></td>
        <td>${esc(f.contact || 'N/A')}</td>
        <td>${esc(f.treatment)}</td>
        <td><span class="badge ${badgeClass(f.status)}">${esc(f.status)}</span></td>
        <td><span class="muted small">${esc(f.notes || '')}</span></td>
        <td>
          <button class="btn btn-ghost small" onclick="alert('Email reminder queued for patient.')">
            <i class="fa-solid fa-bell"></i> Send Reminder
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading error">${esc(err.message)}</td></tr>`;
  }
}

function openNewFollowUpModal() {
  Modal.open(`
    <div class="modal-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="font-family:var(--font-display); color:var(--primary-color); margin-top:0;">
        <i class="fa-solid fa-clock-rotate-left"></i> Schedule Patient Follow-Up
      </h3>
      <form onsubmit="handleCreateFollowUp(event)">
        <label class="field">
          Patient Name
          <input type="text" id="fu-patient-name" class="input" placeholder="e.g. Juan Dela Cruz" required>
        </label>
        <label class="field">
          Treatment Case
          <input type="text" id="fu-treatment" class="input" placeholder="e.g. Suture Removal / Crown Fitting" required>
        </label>
        <div class="form-grid">
          <label class="field">
            Scheduled Date
            <input type="date" id="fu-date" class="input" required>
          </label>
          <label class="field">
            Contact Number
            <input type="tel" id="fu-contact" class="input" placeholder="0917-XXX-XXXX">
          </label>
        </div>
        <label class="field">
          Follow-Up Goal & Clinical Notes
          <textarea id="fu-notes" class="input textarea" rows="3" placeholder="Check gingival healing, adjust occlusion..."></textarea>
        </label>
        <div class="form-actions mt-3">
          <button type="submit" class="btn btn-primary">Schedule Follow-Up</button>
        </div>
      </form>
    </div>
  `);
}
window.openNewFollowUpModal = openNewFollowUpModal;

async function handleCreateFollowUp(e) {
  e.preventDefault();
  const data = {
    patient_name: document.getElementById('fu-patient-name').value,
    treatment: document.getElementById('fu-treatment').value,
    scheduled_date: document.getElementById('fu-date').value,
    contact: document.getElementById('fu-contact').value,
    notes: document.getElementById('fu-notes').value
  };
  try {
    await api.createFollowUp(data);
    Modal.close();
    alert('Follow-up scheduled.');
    loadFollowUpsView();
  } catch (err) {
    alert(err.message);
  }
}
window.handleCreateFollowUp = handleCreateFollowUp;

// ─── 9. CALENDAR MODULE ─────────────────────────────────────────
async function loadCalendarTab() {
  try {
    const appts = await api.getDentistAppointments();
    CalendarView.init(document.getElementById('calendar-root'), {
      onSelect: (a) => openClinicalWorkspace(a.id)
    });
    CalendarView.setAppointments(appts);

    document.getElementById('cal-prev').onclick = () => CalendarView.prev();
    document.getElementById('cal-next').onclick = () => CalendarView.next();
  } catch (err) {
    document.getElementById('calendar-root').innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

// ─── 10. REPORTS & CLINICAL ANALYTICS ───────────────────────────
async function loadReportsView() {
  try {
    const rep = await api.getDentistReports();
    setVal('rep-total-treated', rep.totalPatientsTreated || 0);
    setVal('rep-completion-rate', (rep.completionRate || 100) + '%');
    setVal('rep-satisfaction', rep.patientSatisfaction || '98.5%');

    // Top treatments
    const topEl = document.getElementById('rep-top-treatments');
    if (topEl) {
      const topList = rep.topTreatments || [];
      const maxCount = Math.max(...topList.map(t => t.count), 1);
      topEl.innerHTML = topList.slice(0, 5).map(t => {
        const pct = Math.round((t.count / maxCount) * 100);
        return `
          <div class="bar-item">
            <div class="bar-labels">
              <span>${esc(t.name)}</span>
              <span>${t.count} procedures</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Monthly bars
    const barEl = document.getElementById('rep-monthly-bars');
    if (barEl) {
      const months = rep.monthlyBreakdown || [];
      const maxM = Math.max(...months.map(m => m.count), 1);
      barEl.innerHTML = months.map(m => {
        const pct = Math.round((m.count / maxM) * 100);
        return `
          <div class="month-col">
            <div class="month-bar" style="height: ${pct}%;" title="${m.count} procedures"></div>
            <span class="month-label">${m.month}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Reports load error:', err);
  }
}

// ─── 11. PROFILE MODULE ─────────────────────────────────────────
function handleSaveProfile(e) {
  e.preventDefault();
  const name = document.getElementById('edit-dentist-name').value;
  const spec = document.getElementById('edit-dentist-spec').value;
  const license = document.getElementById('edit-dentist-license').value;
  const phone = document.getElementById('edit-dentist-phone').value;

  document.getElementById('user-name').textContent = name;
  document.getElementById('prof-name').textContent = name;
  document.getElementById('prof-specialty').textContent = spec;
  document.getElementById('prof-license').textContent = license;
  document.getElementById('prof-contact').textContent = phone;

  alert('Profile updated successfully.');
}
window.handleSaveProfile = handleSaveProfile;

// ─── 12. NOTIFICATIONS & QUICK ACTION ───────────────────────────
async function loadNotifications() {
  try {
    const notifs = await api.getDentistNotifications();
    const listEl = document.getElementById('notif-list');
    const badgeEl = document.getElementById('notif-badge-count');

    if (badgeEl) badgeEl.textContent = notifs.filter(n => !n.read).length || '0';
    if (listEl) {
      if (!notifs.length) {
        listEl.innerHTML = `<div class="muted small" style="text-align:center; padding:10px;">No new alerts.</div>`;
      } else {
        listEl.innerHTML = notifs.map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-title">${esc(n.title)}</div>
            <div>${esc(n.message)}</div>
            <div class="notif-time">${new Date(n.time).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        `).join('');
      }
    }
  } catch (_) {}
}

function setupNotifDropdown() {
  const toggle = document.getElementById('notif-toggle');
  const dropdown = document.getElementById('notif-dropdown');
  const markRead = document.getElementById('mark-all-read');

  if (toggle && dropdown) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
    });
    document.addEventListener('click', () => { dropdown.hidden = true; });
  }

  if (markRead) {
    markRead.addEventListener('click', () => {
      document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
      const badgeEl = document.getElementById('notif-badge-count');
      if (badgeEl) badgeEl.textContent = '0';
    });
  }
}

function openQuickActionModal() {
  Modal.open(`
    <div class="modal-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="font-family:var(--font-display); color:var(--primary-color); margin-top:0;">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Quick Clinical Action
      </h3>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px;">
        <button class="btn btn-primary" style="padding:16px;" onclick="Modal.close(); triggerCallNext();">
          <i class="fa-solid fa-bullhorn"></i> Call Next Patient
        </button>
        <button class="btn btn-gold" style="padding:16px;" onclick="Modal.close(); openNewPrescriptionModal();">
          <i class="fa-solid fa-prescription"></i> Issue Prescription
        </button>
        <button class="btn btn-ghost" style="padding:16px;" onclick="Modal.close(); switchTab('chart');">
          <i class="fa-solid fa-tooth"></i> Open Dental Chart
        </button>
        <button class="btn btn-ghost" style="padding:16px;" onclick="Modal.close(); openNewFollowUpModal();">
          <i class="fa-solid fa-clock-rotate-left"></i> Schedule Follow-Up
        </button>
      </div>
    </div>
  `);
}
window.openQuickActionModal = openQuickActionModal;

// ─── Helpers ────────────────────────────────────────────────────
function openClinicalWorkspace(apptId) {
  api.get(`/appointments/${apptId}`)
    .then(a => ClinicalWorkspace.open(a))
    .catch(err => alert(err.message));
}
window.openClinicalWorkspace = openClinicalWorkspace;

function quickUpdateStatus(apptId) {
  Modal.open(`
    <div class="modal-body">
      <button class="modal-close" onclick="Modal.close()">×</button>
      <h3 style="color:var(--primary-color);">Update Appointment Status</h3>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
        <button class="btn btn-primary" onclick="setApptStatus('${apptId}', 'In Progress')">Mark In Progress (In Chair)</button>
        <button class="btn btn-success" onclick="setApptStatus('${apptId}', 'Completed')">Mark Completed</button>
        <button class="btn btn-ghost" onclick="setApptStatus('${apptId}', 'Pending')">Set Pending / Waiting</button>
        <button class="btn btn-danger" onclick="setApptStatus('${apptId}', 'Cancelled')">Cancel Appointment</button>
      </div>
    </div>
  `);
}
window.quickUpdateStatus = quickUpdateStatus;

async function setApptStatus(apptId, status) {
  try {
    await api.put(`/appointments/${apptId}`, { status });
    Modal.close();
    loadOverview();
    loadScheduleTable();
  } catch (err) {
    alert(err.message);
  }
}
window.setApptStatus = setApptStatus;

function badgeClass(status) {
  return 'badge-' + String(status || '').toLowerCase().replace(/\s+/g, '-');
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}
window.logout = logout;
