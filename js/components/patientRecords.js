// Patient Records: searchable list + detail modal (profile, history, Rx, plans).

const PatientRecords = (() => {
  let listRoot = null;
  let searchInput = null;
  let countLabel = null;
  let allPatients = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderList() {
    const q = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const filtered = allPatients.filter(p => {
      const name = p.user ? p.user.name : '';
      const email = p.user ? p.user.email : '';
      return !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });

    if (countLabel) countLabel.textContent = `${filtered.length} patient(s)`;

    if (!filtered.length) {
      listRoot.innerHTML = '<p style="color:#64748b;">No patients found.</p>';
      return;
    }

    listRoot.innerHTML = filtered.map(p => {
      const u = p.user || {};
      const name = u.name || 'Unknown';
      const initial = name.charAt(0).toUpperCase();
      const dob = p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString() : 'N/A';
      return `
        <div class="patient-card" data-pid="${p.user_id || (p.user && p.user.id)}">
          <div class="patient-avatar">${initial}</div>
          <div class="patient-meta">
            <div class="patient-name">${esc(name)}</div>
            <div class="patient-sub">${esc(u.email || '')} • DOB: ${dob} • ${esc(p.gender || 'N/A')}</div>
          </div>
          <button class="btn btn-ghost" data-view="${p.user_id || (p.user && p.user.id)}">View Record</button>
        </div>`;
    }).join('');

    listRoot.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-view')));
    });
  }

  async function openDetail(userId) {
    if (!userId) return;
    Modal.open(`<div class="modal-spinner">Loading patient record…</div>`);
    try {
      const data = await api.get(`/patients/${userId}/history`);
      renderDetail(data);
    } catch (err) {
      Modal.open(`<div class="modal-body"><p class="error">${esc(err.message)}</p></div>`);
    }
  }

  function renderDetail(d) {
    const appts = d.appointments || [];
    const rx = d.prescriptions || [];
    const plans = d.treatmentPlans || [];

    const apptHtml = appts.length ? appts.map(a => {
      const t = a.treatment ? a.treatment.name : 'General Consultation';
      return `<li><span class="badge ${statusBadge(a.status)}">${esc(a.status)}</span>
        ${new Date(a.appointment_date).toLocaleString()} — ${esc(t)}</li>`;
    }).join('') : '<li class="muted">No appointments yet.</li>';

    const rxHtml = rx.length ? rx.map(r => {
      return `<li><strong>${esc(r.medication)}</strong> — ${esc(r.dosage || '')} ${esc(r.frequency || '')} for ${esc(r.duration || '')}
        <div class="muted small">${esc(r.instructions || '')}</div></li>`;
    }).join('') : '<li class="muted">No prescriptions on file.</li>';

    const planHtml = plans.length ? plans.map(p => {
      const items = (p.items || []).map(i =>
        `<li><span class="badge ${statusBadge(i.status)}">${esc(i.status)}</span> ${esc(i.treatment_name)}</li>`
      ).join('');
      return `<div class="plan-mini">
        <div class="plan-mini-head">${esc(p.name)} <span class="muted small">(${esc(p.status)})</span></div>
        <ol class="plan-items">${items || '<li class="muted">No items</li>'}</ol>
        <div class="muted small">Est. cost: ₱${Number(p.total_estimated_cost || 0).toFixed(2)}</div>
      </div>`;
    }).join('') : '<p class="muted">No treatment plans.</p>';

    const allergies = (d.allergies && d.allergies.length) ? d.allergies.join(', ') : 'None recorded';

    Modal.open(`
      <div class="modal-body modal-wide">
        <button class="modal-close" onclick="Modal.close()">×</button>
        <h2 style="font-family:var(--font-display); color:var(--primary-color);">${esc(d.user ? d.user.name : 'Patient')}</h2>
        <div class="detail-grid">
          <div>
            <h4>Demographics</h4>
            <p>Email: ${esc(d.user ? d.user.email : '')}</p>
            <p>Contact: ${esc(d.user ? d.user.contact_number : '')}</p>
            <p>Address: ${esc(d.address || 'N/A')}</p>
            <p>DOB: ${d.date_of_birth ? new Date(d.date_of_birth).toLocaleDateString() : 'N/A'}</p>
            <p>Gender: ${esc(d.gender || 'N/A')}</p>
            <p>Blood Type: ${esc(d.blood_type || 'N/A')}</p>
            <p><strong>Allergies:</strong> ${esc(allergies)}</p>
            <p><strong>Medical Notes:</strong> ${esc(d.medicalHistory || 'None')}</p>
          </div>
          <div>
            <h4>Appointment History</h4>
            <ul class="record-list">${apptHtml}</ul>
            <h4>Prescriptions</h4>
            <ul class="record-list">${rxHtml}</ul>
            <h4>Treatment Plans</h4>
            ${planHtml}
          </div>
        </div>
      </div>
    `);
  }

  function statusBadge(s) {
    return 'badge-' + String(s).toLowerCase().replace(/\s+/g, '-');
  }

  return {
    init(opts) {
      listRoot = opts.listRoot;
      searchInput = opts.searchInput;
      countLabel = opts.countLabel;
      if (searchInput) searchInput.addEventListener('input', renderList);
    },
    async load() {
      try {
        allPatients = await api.get('/patients');
        renderList();
      } catch (err) {
        listRoot.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      }
    }
  };
})();

window.PatientRecords = PatientRecords;
