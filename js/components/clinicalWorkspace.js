// Clinical Workspace: manage an appointment's lifecycle, SOAP notes,
// performed treatments, prescriptions, and AI suggestions.

const ClinicalWorkspace = (() => {
  let currentAppt = null;
  let treatmentsCatalog = [];
  let busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function statusBadge(s) {
    return 'badge-' + String(s).toLowerCase().replace(/\s+/g, '-');
  }

  async function open(appt) {
    currentAppt = appt;
    Modal.open(`<div class="modal-body modal-wide"><div class="modal-spinner">Loading clinical workspace…</div></div>`);
    try {
      const [full, treatments, rxs] = await Promise.all([
        api.get(`/appointments/${appt.id}`),
        api.get(`/appointments/${appt.id}/treatments`),
        api.get(`/appointments/${appt.id}/prescriptions`)
      ]).catch(async () => {
        // If /appointments/:id isn't available, fall back to provided appt
        const t = await api.get(`/appointments/${appt.id}/treatments`);
        const r = await api.get(`/appointments/${appt.id}/prescriptions`);
        return [appt, t, r];
      });
      currentAppt = full && full.id ? full : appt;
      treatmentsCatalog = await api.get('/treatments');
      render(treatments, rxs);
    } catch (err) {
      Modal.open(`<div class="modal-body"><p class="error">${esc(err.message)}</p>
        <button class="btn btn-ghost" onclick="Modal.close()">Close</button></div>`);
    }
  }

  function render(treatments, rxs) {
    const a = currentAppt;
    const patient = a.patient ? a.patient.name : 'Unknown';
    const t = a.treatment ? a.treatment.name : 'General Consultation';

    const treatOptions = treatmentsCatalog.map(x =>
      `<option value="${x.id}">${esc(x.name)} — ₱${Number(x.price).toFixed(2)} (${x.duration_minutes || 30}m)</option>`
    ).join('');

    Modal.open(`
      <div class="modal-body modal-wide">
        <button class="modal-close" onclick="Modal.close()">×</button>
        <div class="cw-head">
          <div>
            <h2 style="margin:0; font-family:var(--font-display); color:var(--primary-color);">Clinical Workspace</h2>
            <p class="muted">${esc(patient)} • ${new Date(a.appointment_date).toLocaleString()} • ${esc(t)}</p>
          </div>
          <span class="badge ${statusBadge(a.status)}" id="cw-status">${esc(a.status)}</span>
        </div>

        <!-- Status actions -->
        <div class="cw-status-actions">
          <button class="btn btn-ghost" data-act="Confirmed">Confirm</button>
          <button class="btn btn-primary" data-act="In Progress">Start</button>
          <button class="btn btn-success" data-act="Completed">Complete</button>
          <button class="btn btn-danger" data-act="Cancelled">Cancel</button>
          <button class="btn btn-ghost" data-act="Rescheduled">Reschedule</button>
        </div>

        <div class="cw-grid">
          <!-- Clinical notes (SOAP) -->
          <div class="cw-col">
            <h4>Clinical Notes (SOAP)</h4>
            <textarea id="cw-notes" class="input textarea" rows="8"
              placeholder="Document subjective complaints, objective findings, assessment, and plan…">${esc(a.clinical_notes || '')}</textarea>
            <button class="btn btn-ghost" id="cw-save-notes">Save Notes</button>
          </div>

          <!-- Performed treatments -->
          <div class="cw-col">
            <h4>Treatments Performed</h4>
            <div id="cw-treatments">${renderTreatments(treatments)}</div>
            <div class="cw-add-row">
              <select id="cw-treat-select" class="input">${treatOptions}</select>
              <input type="number" id="cw-treat-qty" class="input" value="1" min="1" style="width:70px;">
              <button class="btn btn-primary" id="cw-add-treat">Add</button>
            </div>
          </div>

          <!-- Prescriptions -->
          <div class="cw-col">
            <h4>Prescriptions</h4>
            <div id="cw-rx">${renderRx(rxs)}</div>
            <div class="cw-rx-form">
              <input class="input" id="rx-med" placeholder="Medication">
              <input class="input" id="rx-dose" placeholder="Dosage (e.g. 500mg)">
              <input class="input" id="rx-freq" placeholder="Frequency (e.g. BID)">
              <input class="input" id="rx-dur" placeholder="Duration (e.g. 7 days)">
              <textarea class="input textarea" id="rx-instr" rows="2" placeholder="Instructions"></textarea>
              <button class="btn btn-primary" id="rx-add">Add Prescription</button>
            </div>
          </div>
        </div>

        <!-- AI suggestion -->
        <div class="cw-ai">
          <h4>AI Treatment Suggestion</h4>
          <div class="cw-add-row">
            <input class="input" id="ai-symptoms" placeholder="Describe symptoms / findings…">
            <button class="btn btn-gold" id="ai-ask">Ask AI</button>
          </div>
          <div id="ai-result" class="ai-result muted">Ask the assistant for evidence-based suggestions.</div>
        </div>
      </div>
    `);

    wireActions();
  }

  function renderTreatments(list) {
    if (!list || !list.length) return '<p class="muted small">No treatments recorded.</p>';
    return `<ul class="record-list">` + list.map(tt => `
      <li>
        <strong>${esc(tt.treatment_name)}</strong> × ${tt.quantity}
        <span class="muted small">₱${Number(tt.price_at_time || 0).toFixed(2)}</span>
        <button class="btn btn-danger small" data-del-treat="${tt.id}">×</button>
        <div class="muted small">${esc(tt.notes || '')}</div>
      </li>`).join('') + `</ul>`;
  }

  function renderRx(list) {
    if (!list || !list.length) return '<p class="muted small">No prescriptions.</p>';
    return `<ul class="record-list">` + list.map(r => `
      <li><strong>${esc(r.medication)}</strong> — ${esc(r.dosage || '')} ${esc(r.frequency || '')} for ${esc(r.duration || '')}
        <div class="muted small">${esc(r.instructions || '')}</div></li>`).join('') + `</ul>`;
  }

  function wireActions() {
    const a = currentAppt;

    document.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (busy) return; busy = true;
        const act = btn.getAttribute('data-act');
        try {
          const updated = await api.put(`/appointments/${a.id}`, {
            status: act,
            ...(act === 'In Progress' ? { dentist_id: a.dentist_id } : {})
          });
          document.getElementById('cw-status').textContent = updated.status;
          document.getElementById('cw-status').className = 'badge ' + statusBadge(updated.status);
          currentAppt = { ...currentAppt, status: updated.status };
        } catch (err) { alert(err.message); }
        finally { busy = false; }
      });
    });

    const saveNotes = document.getElementById('cw-save-notes');
    if (saveNotes) saveNotes.addEventListener('click', async () => {
      try {
        await api.put(`/appointments/${a.id}/notes`, { clinical_notes: document.getElementById('cw-notes').value });
        alert('Notes saved.');
      } catch (err) { alert(err.message); }
    });

    const addTreat = document.getElementById('cw-add-treat');
    if (addTreat) addTreat.addEventListener('click', async () => {
      const sel = document.getElementById('cw-treat-select');
      const tid = sel.value;
      const qty = parseInt(document.getElementById('cw-treat-qty').value, 10) || 1;
      try {
        await api.post(`/appointments/${a.id}/treatments`, { treatment_id: tid, quantity: qty });
        const list = await api.get(`/appointments/${a.id}/treatments`);
        document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
        wireDeleteTreat();
      } catch (err) { alert(err.message); }
    });

    const addRx = document.getElementById('rx-add');
    if (addRx) addRx.addEventListener('click', async () => {
      const med = document.getElementById('rx-med').value.trim();
      if (!med) return alert('Medication name required.');
      try {
        await api.post(`/appointments/${a.id}/prescriptions`, {
          medication: med,
          dosage: document.getElementById('rx-dose').value,
          frequency: document.getElementById('rx-freq').value,
          duration: document.getElementById('rx-dur').value,
          instructions: document.getElementById('rx-instr').value
        });
        const list = await api.get(`/appointments/${a.id}/prescriptions`);
        document.getElementById('cw-rx').innerHTML = renderRx(list);
      } catch (err) { alert(err.message); }
    });

    const aiAsk = document.getElementById('ai-ask');
    if (aiAsk) aiAsk.addEventListener('click', async () => {
      const symptoms = document.getElementById('ai-symptoms').value.trim();
      if (!symptoms) return alert('Describe symptoms first.');
      document.getElementById('ai-result').textContent = 'Thinking…';
      try {
        const res = await api.post('/ai/dental', { message: `Dental findings: ${symptoms}. Suggest possible treatments and considerations.` });
        const text = res && res.reply ? res.reply : JSON.stringify(res);
        document.getElementById('ai-result').textContent = text;
      } catch (err) {
        document.getElementById('ai-result').textContent = 'AI unavailable: ' + err.message;
      }
    });

    wireDeleteTreat();
  }

  function wireDeleteTreat() {
    document.querySelectorAll('[data-del-treat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-treat');
        try {
          await api.del(`/appointment-treatments/${id}`);
          const list = await api.get(`/appointments/${currentAppt.id}/treatments`);
          document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
          wireDeleteTreat();
        } catch (err) { alert(err.message); }
      });
    });
  }

  return { open };
})();

window.ClinicalWorkspace = ClinicalWorkspace;
