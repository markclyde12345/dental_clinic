// Treatment Plans: list, create, and manage multi-step plans for patients.

const TreatmentPlans = (() => {
  let listRoot = null;
  let patients = [];
  let catalog = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function statusBadge(s) {
    return 'badge-' + String(s).toLowerCase().replace(/\s+/g, '-');
  }

  async function load() {
    try {
      const [plans, pats, cat] = await Promise.all([
        api.get('/treatment-plans'),
        api.get('/patients'),
        api.get('/treatments')
      ]);
      listRoot.innerHTML = '';
      patients = pats || [];
      catalog = cat || [];

      if (!plans || !plans.length) {
        listRoot.innerHTML = '<p class="muted">No treatment plans yet. Create one to get started.</p>';
        return;
      }

      listRoot.innerHTML = plans.map(p => {
        const items = (p.items || []).map(i =>
          `<li><span class="badge ${statusBadge(i.status)}">${esc(i.status)}</span> ${esc(i.treatment_name)}
             <button class="btn btn-ghost small" data-item-done="${i.id}">Mark done</button></li>`
        ).join('');
        return `
          <div class="plan-card">
            <div class="plan-card-head">
              <div>
                <h3 style="margin:0; font-family:var(--font-display); color:var(--primary-color);">${esc(p.name)}</h3>
                <p class="muted small">Patient: ${esc(p.patient ? p.patient.name : 'N/A')} • Est. ₱${Number(p.total_estimated_cost || 0).toFixed(2)}</p>
              </div>
              <span class="badge ${statusBadge(p.status)}">${esc(p.status)}</span>
            </div>
            <p>${esc(p.description || '')}</p>
            <ol class="plan-items">${items || '<li class="muted">No items</li>'}</ol>
          </div>`;
      }).join('');

      listRoot.querySelectorAll('[data-item-done]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api.put(`/treatment-plans/items/${btn.getAttribute('data-item-done')}`, { status: 'Completed' });
            load();
          } catch (err) { alert(err.message); }
        });
      });
    } catch (err) {
      listRoot.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  }

  function openCreate() {
    const patOptions = patients.map(p =>
      `<option value="${p.user_id || (p.user && p.user.id)}">${esc(p.user ? p.user.name : 'Unknown')}</option>`
    ).join('');
    const treatOptions = catalog.map(x =>
      `<option value="${x.id}">${esc(x.name)}</option>`
    ).join('');

    Modal.open(`
      <div class="modal-body modal-wide">
        <button class="modal-close" onclick="Modal.close()">×</button>
        <h2 style="font-family:var(--font-display); color:var(--primary-color);">New Treatment Plan</h2>
        <label class="field">Patient
          <select id="np-patient" class="input">${patOptions}</select>
        </label>
        <label class="field">Plan Name
          <input id="np-name" class="input" placeholder="e.g. Full Mouth Rehabilitation">
        </label>
        <label class="field">Description
          <textarea id="np-desc" class="input textarea" rows="2"></textarea>
        </label>
        <h4>Steps</h4>
        <div id="np-items"></div>
        <button class="btn btn-ghost" id="np-add-item">+ Add Step</button>
        <div style="margin-top:16px;">
          <button class="btn btn-primary" id="np-save">Create Plan</button>
        </div>
      </div>
    `);

    const itemsWrap = document.getElementById('np-items');
    function addItemRow() {
      const row = document.createElement('div');
      row.className = 'cw-add-row np-item';
      row.innerHTML = `<select class="input np-treat">${treatOptions}</select>
        <input class="input np-seq" type="number" value="1" min="1" style="width:70px;" title="Sequence">
        <input class="input np-notes" placeholder="Notes">`;
      itemsWrap.appendChild(row);
    }
    addItemRow();
    document.getElementById('np-add-item').addEventListener('click', addItemRow);

    document.getElementById('np-save').addEventListener('click', async () => {
      const patientId = document.getElementById('np-patient').value;
      const name = document.getElementById('np-name').value.trim();
      if (!name) return alert('Plan name required.');
      try {
        const plan = await api.post('/treatment-plans', {
          patient_id: patientId,
          name,
          description: document.getElementById('np-desc').value
        });
        const rows = document.querySelectorAll('.np-item');
        for (const row of rows) {
          const tid = row.querySelector('.np-treat').value;
          const seq = parseInt(row.querySelector('.np-seq').value, 10) || 1;
          const notes = row.querySelector('.np-notes').value;
          await api.post(`/treatment-plans/${plan.id}/items`, {
            treatment_id: tid, sequence: seq, notes
          });
        }
        Modal.close();
        load();
      } catch (err) { alert(err.message); }
    });
  }

  return {
    init(opts) { listRoot = opts.listRoot; },
    load,
    openCreate
  };
})();

window.TreatmentPlans = TreatmentPlans;
