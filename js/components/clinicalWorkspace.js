// Clinical Workspace: manage an appointment's lifecycle, SOAP notes,
// performed treatments, prescriptions, and AI clinical suggestions.

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
    return 'badge-' + String(s || 'pending').toLowerCase().replace(/\s+/g, '-');
  }

  function formatDateTime(iso) {
    if (!iso) return 'Not scheduled';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + ' • ' + d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (_) {
      return iso;
    }
  }

  function calcTreatTotal(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    return list.reduce((sum, tt) => {
      const p = Number(tt.price_at_time || 0);
      const q = Number(tt.quantity || 1);
      return sum + (p * q);
    }, 0);
  }

  function updateTreatSummary(list) {
    const el = document.getElementById('cw-treat-summary');
    if (!el) return;
    const count = Array.isArray(list) ? list.length : 0;
    const total = calcTreatTotal(list);
    el.textContent = `${count} ${count === 1 ? 'item' : 'items'} • ₱${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function updateRxSummary(list) {
    const el = document.getElementById('cw-rx-summary');
    if (!el) return;
    const count = Array.isArray(list) ? list.length : 0;
    el.textContent = `${count} ${count === 1 ? 'Rx' : 'prescriptions'}`;
  }

  function updateNotesCounter() {
    const notesEl = document.getElementById('cw-notes');
    const counterEl = document.getElementById('cw-char-count');
    if (!notesEl || !counterEl) return;
    const len = notesEl.value.length;
    const words = notesEl.value.trim() ? notesEl.value.trim().split(/\s+/).length : 0;
    counterEl.textContent = `${len} chars • ${words} words`;
  }

  async function open(appt) {
    currentAppt = appt;
    Modal.open(`
      <div class="modal-body modal-clinical-workspace">
        <div class="cw-loading-state">
          <div class="cw-spinner"></div>
          <p>Loading Clinical Workspace…</p>
        </div>
      </div>
    `);

    try {
      const [full, treatments, rxs] = await Promise.all([
        api.get(`/appointments/${appt.id}`).catch(() => appt),
        api.get(`/appointments/${appt.id}/treatments`).catch(() => []),
        api.get(`/appointments/${appt.id}/prescriptions`).catch(() => [])
      ]);

      currentAppt = (full && full.id) ? full : appt;

      try {
        treatmentsCatalog = await api.get('/treatments');
        if (!Array.isArray(treatmentsCatalog)) treatmentsCatalog = [];
      } catch (_) {
        treatmentsCatalog = [];
      }

      render(treatments || [], rxs || []);
    } catch (err) {
      Modal.open(`
        <div class="modal-body">
          <div class="cw-error-banner">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>Failed to open workspace</strong>
              <p>${esc(err.message || 'Unknown error occurred.')}</p>
            </div>
          </div>
          <div style="text-align:right; margin-top:16px;">
            <button class="btn btn-ghost" onclick="Modal.close()">Close</button>
          </div>
        </div>
      `);
    }
  }

  function render(treatments, rxs) {
    const a = currentAppt;
    const patientName = a.patient && a.patient.name ? a.patient.name : 'Unknown Patient';
    const patientPhone = a.patient && a.patient.phone ? a.patient.phone : '';
    const treatmentName = a.treatment && a.treatment.name ? a.treatment.name : 'General Consultation';
    const appointmentDateStr = formatDateTime(a.appointment_date);
    const initial = patientName.trim().charAt(0).toUpperCase() || 'P';
    const status = a.status || 'Pending';

    const treatOptions = treatmentsCatalog.length ? treatmentsCatalog.map(x =>
      `<option value="${x.id}">${esc(x.name)} — ₱${Number(x.price).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${x.duration_minutes || 30}m)</option>`
    ).join('') : '<option value="" disabled selected>No treatments in catalog</option>';

    Modal.open(`
      <div class="modal-body modal-clinical-workspace">
        <button class="modal-close cw-modal-close" onclick="Modal.close()" title="Close Workspace" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <!-- HEADER BANNER -->
        <div class="cw-header-banner">
          <div class="cw-patient-profile">
            <div class="cw-avatar-initial">${esc(initial)}</div>
            <div class="cw-patient-info">
              <div class="cw-kicker">Clinical Operatory Workspace</div>
              <h2 class="cw-patient-title">${esc(patientName)}</h2>
              <div class="cw-meta-tags">
                <span class="cw-meta-pill" title="Appointment Scheduled Time">
                  <i class="fa-regular fa-clock"></i> ${esc(appointmentDateStr)}
                </span>
                <span class="cw-meta-pill" title="Scheduled Treatment">
                  <i class="fa-solid fa-tooth"></i> ${esc(treatmentName)}
                </span>
                ${patientPhone ? `<span class="cw-meta-pill"><i class="fa-solid fa-phone"></i> ${esc(patientPhone)}</span>` : ''}
                <span class="cw-meta-pill cw-appt-id"><i class="fa-solid fa-hashtag"></i> Appt #${esc(a.id ? String(a.id).slice(0, 8) : '')}</span>
              </div>
            </div>
          </div>
          <div class="cw-status-current-box">
            <span class="cw-status-label">Current Status</span>
            <span class="badge ${statusBadge(status)} cw-status-pill" id="cw-status">
              <span class="cw-status-indicator"></span>
              <span class="cw-status-text">${esc(status)}</span>
            </span>
          </div>
        </div>

        <!-- WORKFLOW PIPELINE BAR -->
        <div class="cw-lifecycle-bar">
          <span class="cw-lifecycle-label"><i class="fa-solid fa-timeline"></i> Lifecycle Stage:</span>
          <div class="cw-status-actions" role="group" aria-label="Appointment status actions">
            <button class="cw-status-btn cw-act-confirm ${status === 'Confirmed' ? 'is-active' : ''}" data-act="Confirmed" title="Mark appointment as confirmed">
              <i class="fa-solid fa-clipboard-check"></i> <span>Confirm</span>
            </button>
            <button class="cw-status-btn cw-act-progress ${status === 'In Progress' ? 'is-active' : ''}" data-act="In Progress" title="Patient is seated in chair / session started">
              <i class="fa-solid fa-play"></i> <span>Start Session</span>
            </button>
            <button class="cw-status-btn cw-act-complete ${status === 'Completed' ? 'is-active' : ''}" data-act="Completed" title="Mark procedure session completed">
              <i class="fa-solid fa-circle-check"></i> <span>Complete</span>
            </button>
            <button class="cw-status-btn cw-act-reschedule ${status === 'Rescheduled' ? 'is-active' : ''}" data-act="Rescheduled" title="Reschedule session">
              <i class="fa-solid fa-calendar-days"></i> <span>Reschedule</span>
            </button>
            <button class="cw-status-btn cw-act-cancel ${status === 'Cancelled' ? 'is-active' : ''}" data-act="Cancelled" title="Cancel this appointment">
              <i class="fa-solid fa-ban"></i> <span>Cancel</span>
            </button>
          </div>
        </div>

        <!-- 2-COLUMN CLINICAL GRID -->
        <div class="cw-grid">

          <!-- LEFT COLUMN: SOAP NOTES + AI ASSISTANT -->
          <div class="cw-col cw-col-main">

            <!-- SOAP NOTES CARD -->
            <div class="cw-card cw-card-soap">
              <div class="cw-card-header">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-soap"><i class="fa-solid fa-notes-medical"></i></div>
                  <div>
                    <h3 class="cw-card-title">Clinical Notes (SOAP)</h3>
                    <p class="cw-card-subtitle">Subjective, Objective, Assessment, Plan documentation</p>
                  </div>
                </div>
                <div class="cw-soap-helpers">
                  <button type="button" class="cw-chip-btn" id="cw-insert-template" title="Insert complete SOAP template outline">
                    <i class="fa-solid fa-table-list"></i> Template
                  </button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="S" title="Insert Subjective section"><b>S</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="O" title="Insert Objective section"><b>O</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="A" title="Insert Assessment section"><b>A</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="P" title="Insert Plan section"><b>P</b></button>
                </div>
              </div>

              <div class="cw-notes-editor-wrap">
                <textarea id="cw-notes" class="cw-textarea" rows="8"
                  placeholder="[S] Subjective: Chief complaint, history of pain…&#10;[O] Objective: Tooth findings, mobility, percussion…&#10;[A] Assessment: Clinical diagnosis, prognosis…&#10;[P] Plan: Treatment performed, follow-up recalls…">${esc(a.clinical_notes || '')}</textarea>
              </div>

              <div class="cw-card-footer cw-soap-footer">
                <div class="cw-notes-info">
                  <span id="cw-char-count" class="cw-char-count">0 chars • 0 words</span>
                  <span id="cw-notes-feedback" class="cw-notes-feedback"></span>
                </div>
                <button class="btn btn-primary cw-btn-save" id="cw-save-notes">
                  <i class="fa-solid fa-floppy-disk"></i> Save Notes
                </button>
              </div>
            </div>

            <!-- AI CLINICAL ASSISTANT CARD -->
            <div class="cw-card cw-card-ai">
              <div class="cw-card-header">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-ai"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                  <div>
                    <h3 class="cw-card-title">AI Dental Clinical Assistant</h3>
                    <p class="cw-card-subtitle">Evidence-based clinical guidelines & differential diagnosis</p>
                  </div>
                </div>
                <span class="cw-ai-badge"><i class="fa-solid fa-bolt"></i> Gemini Clinical</span>
              </div>

              <div class="cw-quick-prompts">
                <span class="cw-quick-prompts-label">Quick Prompts:</span>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Acute irreversible pulpitis lower 1st molar with cold lingering pain.">Pulpitis</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Pericoronitis and swelling around lower 3rd molar.">Pericoronitis</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Deep dentinal caries close to pulp chamber without spontaneous pain.">Deep Caries</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Post-surgical extraction socket bleeding after 2 hours.">Post-Op Bleeding</button>
              </div>

              <div class="cw-ai-search-row">
                <div class="cw-input-with-icon">
                  <i class="fa-solid fa-stethoscope"></i>
                  <input class="input cw-input" id="ai-symptoms" placeholder="Describe symptoms, tooth number, clinical findings…">
                </div>
                <button class="btn btn-gold cw-ai-ask-btn" id="ai-ask">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Ask AI</span>
                </button>
              </div>

              <div id="ai-result" class="cw-ai-result-box">
                <div class="cw-ai-placeholder">
                  <i class="fa-regular fa-comment-dots"></i>
                  <span>Enter clinical findings above and click <b>Ask AI</b> for evidence-based dental considerations.</span>
                </div>
              </div>
              <div class="cw-ai-disclaimer">
                <i class="fa-solid fa-shield-halved"></i> For clinical decision support only. Confirm with standard clinical diagnosis.
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: TREATMENTS + PRESCRIPTIONS -->
          <div class="cw-col cw-col-side">

            <!-- PERFORMED TREATMENTS CARD -->
            <div class="cw-card cw-card-treatments">
              <div class="cw-card-header">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-treat"><i class="fa-solid fa-tooth"></i></div>
                  <div>
                    <h3 class="cw-card-title">Treatments Performed</h3>
                    <p class="cw-card-subtitle">Billable procedures applied to this session</p>
                  </div>
                </div>
                <span class="cw-pill-counter" id="cw-treat-summary">0 items • ₱0.00</span>
              </div>

              <div id="cw-treatments" class="cw-list-container">
                ${renderTreatments(treatments)}
              </div>

              <div class="cw-add-section">
                <label class="cw-field-label"><i class="fa-solid fa-plus-circle"></i> Add Procedure</label>
                <div class="cw-add-row">
                  <select id="cw-treat-select" class="input cw-select" aria-label="Select treatment procedure">${treatOptions}</select>
                  <div class="cw-qty-wrap">
                    <span class="cw-qty-prefix">Qty</span>
                    <input type="number" id="cw-treat-qty" class="input cw-qty-input" value="1" min="1" max="99" aria-label="Treatment quantity">
                  </div>
                  <button class="btn btn-primary cw-add-btn" id="cw-add-treat" title="Add treatment procedure">
                    <i class="fa-solid fa-plus"></i> Add
                  </button>
                </div>
              </div>
            </div>

            <!-- DIGITAL PRESCRIPTIONS CARD -->
            <div class="cw-card cw-card-rx">
              <div class="cw-card-header">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-rx"><i class="fa-solid fa-prescription"></i></div>
                  <div>
                    <h3 class="cw-card-title">Prescriptions (Rx)</h3>
                    <p class="cw-card-subtitle">Medications issued for this patient</p>
                  </div>
                </div>
                <span class="cw-pill-counter" id="cw-rx-summary">0 issued</span>
              </div>

              <div id="cw-rx" class="cw-list-container">
                ${renderRx(rxs)}
              </div>

              <div class="cw-add-section">
                <label class="cw-field-label"><i class="fa-solid fa-file-prescription"></i> Issue New Prescription</label>
                <div class="cw-rx-grid">
                  <input class="input cw-input" id="rx-med" placeholder="Medication (e.g. Amoxicillin)" aria-label="Medication name">
                  <input class="input cw-input" id="rx-dose" placeholder="Dosage (e.g. 500mg)" aria-label="Dosage">
                  <input class="input cw-input" id="rx-freq" placeholder="Frequency (e.g. TID / 8h)" aria-label="Frequency">
                  <input class="input cw-input" id="rx-dur" placeholder="Duration (e.g. 7 days)" aria-label="Duration">
                </div>
                <textarea class="input cw-textarea cw-rx-instructions" id="rx-instr" rows="2"
                  placeholder="Patient instructions (e.g. Take 1 capsule 3 times daily after meals with water)" aria-label="Patient instructions"></textarea>
                <button class="btn btn-primary cw-btn-full" id="rx-add">
                  <i class="fa-solid fa-plus"></i> Issue Prescription
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    `);

    updateNotesCounter();
    updateTreatSummary(treatments);
    updateRxSummary(rxs);
    wireActions();
  }

  function renderTreatments(list) {
    if (!list || !list.length) {
      return `
        <div class="cw-empty-state">
          <i class="fa-solid fa-tooth"></i>
          <span>No procedures recorded yet for this session.</span>
        </div>
      `;
    }
    return `<div class="cw-record-list">` + list.map(tt => {
      const unit = Number(tt.price_at_time || 0);
      const qty = Number(tt.quantity || 1);
      const subtotal = unit * qty;
      return `
        <div class="cw-record-item cw-treat-item">
          <div class="cw-record-content">
            <div class="cw-record-main">
              <strong class="cw-record-name">${esc(tt.treatment_name || 'Dental Procedure')}</strong>
              <span class="cw-multiplier-badge">× ${qty}</span>
            </div>
            <div class="cw-record-meta">
              <span>₱${unit.toLocaleString('en-US', { minimumFractionDigits: 2 })} each</span>
              <span class="cw-meta-dot">•</span>
              <strong class="cw-subtotal-price">₱${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
            ${tt.notes ? `<div class="cw-record-note">${esc(tt.notes)}</div>` : ''}
          </div>
          <button class="cw-del-btn" data-del-treat="${tt.id}" title="Remove this procedure" aria-label="Remove procedure">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    }).join('') + `</div>`;
  }

  function renderRx(list) {
    if (!list || !list.length) {
      return `
        <div class="cw-empty-state">
          <i class="fa-solid fa-pills"></i>
          <span>No prescriptions issued for this patient yet.</span>
        </div>
      `;
    }
    return `<div class="cw-record-list">` + list.map(r => `
      <div class="cw-record-item cw-rx-item">
        <div class="cw-rx-icon"><i class="fa-solid fa-prescription"></i></div>
        <div class="cw-record-content">
          <div class="cw-record-main">
            <strong class="cw-record-name">${esc(r.medication)}</strong>
            ${r.dosage ? `<span class="cw-rx-badge">${esc(r.dosage)}</span>` : ''}
          </div>
          <div class="cw-record-meta">
            ${r.frequency ? `<span><i class="fa-regular fa-clock"></i> ${esc(r.frequency)}</span>` : ''}
            ${r.frequency && r.duration ? `<span class="cw-meta-dot">•</span>` : ''}
            ${r.duration ? `<span><i class="fa-regular fa-calendar"></i> ${esc(r.duration)}</span>` : ''}
          </div>
          ${r.instructions ? `<div class="cw-record-note"><i class="fa-solid fa-info-circle"></i> ${esc(r.instructions)}</div>` : ''}
        </div>
      </div>
    `).join('') + `</div>`;
  }

  function wireActions() {
    const a = currentAppt;

    // Status action buttons
    document.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        const act = btn.getAttribute('data-act');
        const prevText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating…`;

        try {
          const updated = await api.put(`/appointments/${a.id}`, {
            status: act,
            ...(act === 'In Progress' ? { dentist_id: a.dentist_id } : {})
          });

          const newStatus = (updated && updated.status) ? updated.status : act;
          const statusEl = document.getElementById('cw-status');
          if (statusEl) {
            statusEl.className = 'badge ' + statusBadge(newStatus) + ' cw-status-pill';
            const textEl = statusEl.querySelector('.cw-status-text');
            if (textEl) textEl.textContent = newStatus;
            else statusEl.textContent = newStatus;
          }

          document.querySelectorAll('[data-act]').forEach(b => {
            if (b.getAttribute('data-act') === newStatus) {
              b.classList.add('is-active');
            } else {
              b.classList.remove('is-active');
            }
          });

          currentAppt = { ...currentAppt, status: newStatus };

          if (typeof loadQueueView === 'function') loadQueueView();
          if (typeof loadOverview === 'function') loadOverview();
          if (typeof loadTodaySchedule === 'function') loadTodaySchedule();
        } catch (err) {
          alert('Could not update status: ' + err.message);
        } finally {
          btn.innerHTML = prevText;
          busy = false;
        }
      });
    });

    // Notes auto-counter
    const notesEl = document.getElementById('cw-notes');
    if (notesEl) {
      notesEl.addEventListener('input', updateNotesCounter);
    }

    // Save Clinical Notes
    const saveNotes = document.getElementById('cw-save-notes');
    if (saveNotes) {
      saveNotes.addEventListener('click', async () => {
        const text = notesEl ? notesEl.value : '';
        const prevHtml = saveNotes.innerHTML;
        saveNotes.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving…`;
        saveNotes.disabled = true;

        try {
          await api.put(`/appointments/${a.id}/notes`, { clinical_notes: text });
          const feedback = document.getElementById('cw-notes-feedback');
          if (feedback) {
            feedback.innerHTML = `<span class="cw-saved-indicator"><i class="fa-solid fa-circle-check"></i> Notes saved successfully!</span>`;
            setTimeout(() => { feedback.innerHTML = ''; }, 3500);
          }
          currentAppt.clinical_notes = text;
        } catch (err) {
          alert('Error saving notes: ' + err.message);
        } finally {
          saveNotes.innerHTML = prevHtml;
          saveNotes.disabled = false;
        }
      });
    }

    // Quick SOAP Template & Tags
    const templateBtn = document.getElementById('cw-insert-template');
    if (templateBtn && notesEl) {
      templateBtn.addEventListener('click', () => {
        const template =
`[S] SUBJECTIVE:
- Chief Complaint: 
- Pain Level (1-10): 
- Relevant Medical History: No acute contraindications reported.

[O] OBJECTIVE:
- Tooth / Region: 
- Clinical Examination: 
- Mobility / Percussion: 
- Soft Tissue / Periodontal: 

[A] ASSESSMENT:
- Working Diagnosis: 
- Prognosis: 

[P] PLAN:
- Procedure Performed Today: 
- Anesthetic / Materials: 
- Post-Operative Instructions: Provided to patient.
- Next Appointment / Recall: `;

        if (!notesEl.value.trim() || confirm('Insert standard dental SOAP template? (Will append to existing notes)')) {
          notesEl.value = (notesEl.value.trim() ? notesEl.value + '\n\n' : '') + template;
          notesEl.focus();
          updateNotesCounter();
        }
      });
    }

    document.querySelectorAll('[data-soap-tag]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!notesEl) return;
        const tag = chip.getAttribute('data-soap-tag');
        const labels = {
          'S': '\n\n[S] SUBJECTIVE: ',
          'O': '\n\n[O] OBJECTIVE: ',
          'A': '\n\n[A] ASSESSMENT: ',
          'P': '\n\n[P] PLAN: '
        };
        const insert = labels[tag] || `\n\n[${tag}]: `;
        notesEl.value = (notesEl.value.trim() ? notesEl.value : '') + insert;
        notesEl.focus();
        notesEl.setSelectionRange(notesEl.value.length, notesEl.value.length);
        updateNotesCounter();
      });
    });

    // Add Treatment Procedure
    const addTreat = document.getElementById('cw-add-treat');
    if (addTreat) {
      addTreat.addEventListener('click', async () => {
        const sel = document.getElementById('cw-treat-select');
        const tid = sel ? sel.value : null;
        if (!tid) return alert('Please select a valid treatment procedure from the catalog.');
        const qty = parseInt(document.getElementById('cw-treat-qty').value, 10) || 1;

        const prevHtml = addTreat.innerHTML;
        addTreat.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        addTreat.disabled = true;

        try {
          await api.post(`/appointments/${a.id}/treatments`, { treatment_id: tid, quantity: qty });
          const list = await api.get(`/appointments/${a.id}/treatments`);
          document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
          updateTreatSummary(list);
          wireDeleteTreat();
        } catch (err) {
          alert('Could not record treatment: ' + err.message);
        } finally {
          addTreat.innerHTML = prevHtml;
          addTreat.disabled = false;
        }
      });
    }

    // Add Prescription
    const addRx = document.getElementById('rx-add');
    if (addRx) {
      addRx.addEventListener('click', async () => {
        const med = document.getElementById('rx-med').value.trim();
        if (!med) return alert('Medication name is required.');

        const prevHtml = addRx.innerHTML;
        addRx.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Issuing…`;
        addRx.disabled = true;

        try {
          await api.post(`/appointments/${a.id}/prescriptions`, {
            medication: med,
            dosage: document.getElementById('rx-dose').value.trim(),
            frequency: document.getElementById('rx-freq').value.trim(),
            duration: document.getElementById('rx-dur').value.trim(),
            instructions: document.getElementById('rx-instr').value.trim()
          });

          // Reset inputs
          document.getElementById('rx-med').value = '';
          document.getElementById('rx-dose').value = '';
          document.getElementById('rx-freq').value = '';
          document.getElementById('rx-dur').value = '';
          document.getElementById('rx-instr').value = '';

          const list = await api.get(`/appointments/${a.id}/prescriptions`);
          document.getElementById('cw-rx').innerHTML = renderRx(list);
          updateRxSummary(list);
        } catch (err) {
          alert('Could not issue prescription: ' + err.message);
        } finally {
          addRx.innerHTML = prevHtml;
          addRx.disabled = false;
        }
      });
    }

    // AI Clinical Assistant Quick Prompts
    document.querySelectorAll('[data-ai-prompt]').forEach(chip => {
      chip.addEventListener('click', () => {
        const promptInput = document.getElementById('ai-symptoms');
        if (promptInput) {
          promptInput.value = chip.getAttribute('data-ai-prompt');
          promptInput.focus();
        }
      });
    });

    // AI Clinical Assistant Ask
    const aiAsk = document.getElementById('ai-ask');
    if (aiAsk) {
      aiAsk.addEventListener('click', async () => {
        const input = document.getElementById('ai-symptoms');
        const symptoms = input ? input.value.trim() : '';
        if (!symptoms) {
          if (input) input.focus();
          return alert('Please describe the clinical findings or patient symptoms first.');
        }

        const resultBox = document.getElementById('ai-result');
        resultBox.innerHTML = `
          <div class="cw-ai-loading">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Consulting clinical AI models for dental guidance…</span>
          </div>
        `;
        aiAsk.disabled = true;

        try {
          const res = await api.post('/ai/dental', {
            message: `Dental Clinical Findings: ${symptoms}. Please provide: 1) Likely differential diagnosis, 2) Recommended in-clinic dental procedures, 3) Standard pharmacological considerations (if any), and 4) Key post-op advice.`
          });
          const text = (res && res.reply) ? res.reply : (typeof res === 'string' ? res : JSON.stringify(res, null, 2));

          // Format line breaks and bullet points cleanly
          const formatted = esc(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');

          resultBox.innerHTML = `
            <div class="cw-ai-response">
              <div class="cw-ai-response-header">
                <i class="fa-solid fa-wand-magic-sparkles"></i> <strong>Clinical Assessment & Suggestions:</strong>
              </div>
              <div class="cw-ai-response-body">${formatted}</div>
            </div>
          `;
        } catch (err) {
          resultBox.innerHTML = `
            <div class="cw-ai-error">
              <i class="fa-solid fa-circle-exclamation"></i>
              <span>AI Service unavailable: ${esc(err.message)}</span>
            </div>
          `;
        } finally {
          aiAsk.disabled = false;
        }
      });
    }

    wireDeleteTreat();
  }

  function wireDeleteTreat() {
    document.querySelectorAll('[data-del-treat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-treat');
        if (!confirm('Remove this procedure from the session?')) return;

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
          // Try /appointment-treatments/:id first, fallback to /appointments/treatments/:id
          await api.del(`/appointment-treatments/${id}`).catch(async () => {
            return api.del(`/appointments/${currentAppt.id}/treatments/${id}`);
          });

          const list = await api.get(`/appointments/${currentAppt.id}/treatments`);
          document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
          updateTreatSummary(list);
          wireDeleteTreat();
        } catch (err) {
          alert('Could not remove treatment: ' + err.message);
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
        }
      });
    });
  }

  return { open };
})();

window.ClinicalWorkspace = ClinicalWorkspace;
