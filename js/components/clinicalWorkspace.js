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
      <style>
        .modal-overlay {
          background: rgba(255, 255, 255, 0.85) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
        }
      </style>
      <div class="modal-body modal-clinical-workspace" style="background:#ffffff !important; background-color:#ffffff !important; color:#0f172a !important;">
        <div class="cw-loading-state" style="background:#ffffff !important; color:#0d9488 !important;">
          <div class="cw-spinner" style="border-top-color:#0d9488 !important;"></div>
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
        <div class="modal-body" style="background:#ffffff !important; color:#0f172a !important;">
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
      <style>
        .modal-overlay {
          background: rgba(255, 255, 255, 0.85) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
        }
        .modal-clinical-workspace,
        .modal-clinical-workspace .cw-header-banner,
        .modal-clinical-workspace .cw-lifecycle-bar,
        .modal-clinical-workspace .cw-grid,
        .modal-clinical-workspace .cw-card,
        .modal-clinical-workspace .cw-card-header,
        .modal-clinical-workspace .cw-soap-footer,
        .modal-clinical-workspace .cw-add-section,
        .modal-clinical-workspace .cw-notes-editor-wrap,
        .modal-clinical-workspace .cw-quick-prompts,
        .modal-clinical-workspace .cw-ai-search-row,
        .modal-clinical-workspace .cw-ai-disclaimer,
        .modal-clinical-workspace .cw-list-container,
        .dark-theme .modal-clinical-workspace,
        .dark-theme .modal-clinical-workspace .cw-header-banner,
        .dark-theme .modal-clinical-workspace .cw-lifecycle-bar,
        .dark-theme .modal-clinical-workspace .cw-grid,
        .dark-theme .modal-clinical-workspace .cw-card,
        .dark-theme .modal-clinical-workspace .cw-card-header,
        .dark-theme .modal-clinical-workspace .cw-soap-footer,
        .dark-theme .modal-clinical-workspace .cw-add-section,
        .dark-theme .modal-clinical-workspace .cw-notes-editor-wrap,
        .dark-theme .modal-clinical-workspace .cw-quick-prompts,
        .dark-theme .modal-clinical-workspace .cw-ai-search-row,
        .dark-theme .modal-clinical-workspace .cw-ai-disclaimer,
        .dark-theme .modal-clinical-workspace .cw-list-container {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
        }
        .modal-clinical-workspace .cw-textarea,
        .modal-clinical-workspace .cw-input,
        .modal-clinical-workspace .cw-select,
        .dark-theme .modal-clinical-workspace .cw-textarea,
        .dark-theme .modal-clinical-workspace .cw-input,
        .dark-theme .modal-clinical-workspace .cw-select {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          border: 1px solid #cbd5e1 !important;
        }
        .modal-clinical-workspace .cw-patient-title,
        .dark-theme .modal-clinical-workspace .cw-patient-title {
          color: #0f172a !important;
        }
        .modal-clinical-workspace .cw-card-title,
        .dark-theme .modal-clinical-workspace .cw-card-title {
          color: #0f172a !important;
        }
        .modal-clinical-workspace .cw-card-subtitle,
        .dark-theme .modal-clinical-workspace .cw-card-subtitle {
          color: #64748b !important;
        }
        .modal-clinical-workspace .cw-record-item,
        .dark-theme .modal-clinical-workspace .cw-record-item {
          background: #ffffff !important;
          background-color: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
        }
        .modal-clinical-workspace .cw-record-name,
        .dark-theme .modal-clinical-workspace .cw-record-name {
          color: #0f172a !important;
        }
        .modal-clinical-workspace .cw-status-actions,
        .dark-theme .modal-clinical-workspace .cw-status-actions {
          background: #f8fafc !important;
          border: 1px solid #e2e8f0 !important;
        }
        .modal-clinical-workspace .cw-status-btn,
        .dark-theme .modal-clinical-workspace .cw-status-btn {
          background: #ffffff !important;
          color: #475569 !important;
          border: 1px solid #e2e8f0 !important;
        }
        .modal-clinical-workspace .cw-ai-result-box,
        .dark-theme .modal-clinical-workspace .cw-ai-result-box {
          background: #fafbfc !important;
          color: #1e293b !important;
          border: 1px solid #e2e8f0 !important;
        }
        .modal-clinical-workspace .cw-btn-save,
        .modal-clinical-workspace .cw-add-btn,
        .modal-clinical-workspace .cw-btn-full,
        .dark-theme .modal-clinical-workspace .cw-btn-save,
        .dark-theme .modal-clinical-workspace .cw-add-btn,
        .dark-theme .modal-clinical-workspace .cw-btn-full {
          background: #0d9488 !important;
          background-color: #0d9488 !important;
          color: #ffffff !important;
          border: none !important;
        }
      </style>

      <div class="modal-body modal-clinical-workspace" style="background:#ffffff !important; background-color:#ffffff !important; color:#0f172a !important;">
        <button class="modal-close cw-modal-close" onclick="Modal.close()" title="Close Workspace" aria-label="Close" style="background:#f8fafc !important; color:#64748b !important; border:1px solid #e2e8f0 !important;">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <!-- HEADER BANNER - PURE WHITE -->
        <div class="cw-header-banner" style="background:#ffffff !important; background-color:#ffffff !important; color:#0f172a !important; border-bottom:1px solid #f1f5f9 !important;">
          <div class="cw-patient-profile">
            <div class="cw-avatar-initial" style="background:#f0fdfa !important; color:#0f766e !important; border:2px solid #99f6e4 !important;">${esc(initial)}</div>
            <div class="cw-patient-info">
              <div class="cw-kicker" style="color:#0d9488 !important;">Clinical Operatory Workspace</div>
              <h2 class="cw-patient-title" style="color:#0f172a !important;">${esc(patientName)}</h2>
              <div class="cw-meta-tags">
                <span class="cw-meta-pill" title="Appointment Scheduled Time" style="background:#f8fafc !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
                  <i class="fa-regular fa-clock" style="color:#0d9488 !important;"></i> ${esc(appointmentDateStr)}
                </span>
                <span class="cw-meta-pill" title="Scheduled Treatment" style="background:#f8fafc !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
                  <i class="fa-solid fa-tooth" style="color:#0d9488 !important;"></i> ${esc(treatmentName)}
                </span>
                ${patientPhone ? `<span class="cw-meta-pill" style="background:#f8fafc !important; color:#475569 !important; border:1px solid #e2e8f0 !important;"><i class="fa-solid fa-phone" style="color:#0d9488 !important;"></i> ${esc(patientPhone)}</span>` : ''}
                <span class="cw-meta-pill cw-appt-id" style="background:#f8fafc !important; color:#475569 !important; border:1px solid #e2e8f0 !important;"><i class="fa-solid fa-hashtag" style="color:#0d9488 !important;"></i> Appt #${esc(a.id ? String(a.id).slice(0, 8) : '')}</span>
              </div>
            </div>
          </div>
          <div class="cw-status-current-box">
            <span class="cw-status-label" style="color:#64748b !important;">Current Status</span>
            <span class="badge ${statusBadge(status)} cw-status-pill" id="cw-status">
              <span class="cw-status-indicator"></span>
              <span class="cw-status-text">${esc(status)}</span>
            </span>
          </div>
        </div>

        <!-- WORKFLOW PIPELINE BAR - PURE WHITE -->
        <div class="cw-lifecycle-bar" style="background:#ffffff !important; background-color:#ffffff !important; border-bottom:1px solid #f1f5f9 !important;">
          <span class="cw-lifecycle-label" style="color:#64748b !important;"><i class="fa-solid fa-timeline"></i> Lifecycle Stage:</span>
          <div class="cw-status-actions" role="group" aria-label="Appointment status actions" style="background:#f8fafc !important; border:1px solid #e2e8f0 !important;">
            <button class="cw-status-btn cw-act-confirm ${status === 'Confirmed' ? 'is-active' : ''}" data-act="Confirmed" title="Mark appointment as confirmed" style="background:#ffffff !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
              <i class="fa-solid fa-clipboard-check"></i> <span>Confirm</span>
            </button>
            <button class="cw-status-btn cw-act-progress ${status === 'In Progress' ? 'is-active' : ''}" data-act="In Progress" title="Patient is seated in chair / session started" style="background:#ffffff !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
              <i class="fa-solid fa-play"></i> <span>Start Session</span>
            </button>
            <button class="cw-status-btn cw-act-complete ${status === 'Completed' ? 'is-active' : ''}" data-act="Completed" title="Mark procedure session completed" style="background:#ffffff !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
              <i class="fa-solid fa-circle-check"></i> <span>Complete</span>
            </button>
            <button class="cw-status-btn cw-act-reschedule ${status === 'Rescheduled' ? 'is-active' : ''}" data-act="Rescheduled" title="Reschedule session" style="background:#ffffff !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
              <i class="fa-solid fa-calendar-days"></i> <span>Reschedule</span>
            </button>
            <button class="cw-status-btn cw-act-cancel ${status === 'Cancelled' ? 'is-active' : ''}" data-act="Cancelled" title="Cancel this appointment" style="background:#ffffff !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">
              <i class="fa-solid fa-ban"></i> <span>Cancel</span>
            </button>
          </div>
        </div>

        <!-- 2-COLUMN CLINICAL GRID - PURE WHITE -->
        <div class="cw-grid" style="background:#ffffff !important; background-color:#ffffff !important;">

          <!-- LEFT COLUMN: SOAP NOTES + AI ASSISTANT -->
          <div class="cw-col cw-col-main">

            <!-- SOAP NOTES CARD -->
            <div class="cw-card cw-card-soap" style="background:#ffffff !important; background-color:#ffffff !important; border:1px solid #e2e8f0 !important;">
              <div class="cw-card-header" style="background:#ffffff !important; border-bottom:1px solid #f1f5f9 !important;">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-soap"><i class="fa-solid fa-notes-medical"></i></div>
                  <div>
                    <h3 class="cw-card-title" style="color:#0f172a !important;">Clinical Notes (SOAP)</h3>
                    <p class="cw-card-subtitle" style="color:#64748b !important;">Subjective, Objective, Assessment, Plan documentation</p>
                  </div>
                </div>
                <div class="cw-soap-helpers">
                  <button type="button" class="cw-chip-btn" id="cw-insert-template" title="Insert complete SOAP template outline" style="background:#f8fafc !important; color:#334155 !important; border:1px solid #cbd5e1 !important;">
                    <i class="fa-solid fa-table-list"></i> Template
                  </button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="S" title="Insert Subjective section" style="background:#f8fafc !important; color:#334155 !important; border:1px solid #cbd5e1 !important;"><b>S</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="O" title="Insert Objective section" style="background:#f8fafc !important; color:#334155 !important; border:1px solid #cbd5e1 !important;"><b>O</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="A" title="Insert Assessment section" style="background:#f8fafc !important; color:#334155 !important; border:1px solid #cbd5e1 !important;"><b>A</b></button>
                  <button type="button" class="cw-chip-btn" data-soap-tag="P" title="Insert Plan section" style="background:#f8fafc !important; color:#334155 !important; border:1px solid #cbd5e1 !important;"><b>P</b></button>
                </div>
              </div>

              <div class="cw-notes-editor-wrap" style="background:#ffffff !important;">
                <textarea id="cw-notes" class="cw-textarea" rows="8"
                  style="background:#ffffff !important; background-color:#ffffff !important; color:#1e293b !important; border:1px solid #cbd5e1 !important;"
                  placeholder="[S] Subjective: Chief complaint, history of pain…&#10;[O] Objective: Tooth findings, mobility, percussion…&#10;[A] Assessment: Clinical diagnosis, prognosis…&#10;[P] Plan: Treatment performed, follow-up recalls…">${esc(a.clinical_notes || '')}</textarea>
              </div>

              <div class="cw-card-footer cw-soap-footer" style="background:#ffffff !important; border-top:1px solid #f1f5f9 !important;">
                <div class="cw-notes-info">
                  <span id="cw-char-count" class="cw-char-count" style="color:#94a3b8 !important;">0 chars • 0 words</span>
                  <span id="cw-notes-feedback" class="cw-notes-feedback"></span>
                </div>
                <button class="btn btn-primary cw-btn-save" id="cw-save-notes" style="background:#0d9488 !important; color:#ffffff !important; border:none !important;">
                  <i class="fa-solid fa-floppy-disk"></i> Save Notes
                </button>
              </div>
            </div>

            <!-- AI CLINICAL ASSISTANT CARD -->
            <div class="cw-card cw-card-ai" style="background:#ffffff !important; background-color:#ffffff !important; border:1px solid #fef08a !important;">
              <div class="cw-card-header" style="background:#ffffff !important; border-bottom:1px solid #f1f5f9 !important;">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-ai"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                  <div>
                    <h3 class="cw-card-title" style="color:#0f172a !important;">AI Dental Clinical Assistant</h3>
                    <p class="cw-card-subtitle" style="color:#64748b !important;">Evidence-based clinical guidelines & differential diagnosis</p>
                  </div>
                </div>
                <span class="cw-ai-badge"><i class="fa-solid fa-bolt"></i> Gemini Clinical</span>
              </div>

              <div class="cw-quick-prompts" style="background:#ffffff !important;">
                <span class="cw-quick-prompts-label" style="color:#92400e !important;">Quick Prompts:</span>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Acute irreversible pulpitis lower 1st molar with cold lingering pain." style="background:#fafaf9 !important; color:#57534e !important; border:1px solid #e7e5e4 !important;">Pulpitis</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Pericoronitis and swelling around lower 3rd molar." style="background:#fafaf9 !important; color:#57534e !important; border:1px solid #e7e5e4 !important;">Pericoronitis</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Deep dentinal caries close to pulp chamber without spontaneous pain." style="background:#fafaf9 !important; color:#57534e !important; border:1px solid #e7e5e4 !important;">Deep Caries</button>
                <button type="button" class="cw-prompt-chip" data-ai-prompt="Post-surgical extraction socket bleeding after 2 hours." style="background:#fafaf9 !important; color:#57534e !important; border:1px solid #e7e5e4 !important;">Post-Op Bleeding</button>
              </div>

              <div class="cw-ai-search-row" style="background:#ffffff !important;">
                <div class="cw-input-with-icon">
                  <i class="fa-solid fa-stethoscope"></i>
                  <input class="input cw-input" id="ai-symptoms" placeholder="Describe symptoms, tooth number, clinical findings…" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">
                </div>
                <button class="btn btn-gold cw-ai-ask-btn" id="ai-ask" style="background:#f59e0b !important; color:#ffffff !important; border:none !important;">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Ask AI</span>
                </button>
              </div>

              <div id="ai-result" class="cw-ai-result-box" style="background:#fafbfc !important; color:#1e293b !important; border:1px solid #e2e8f0 !important;">
                <div class="cw-ai-placeholder">
                  <i class="fa-regular fa-comment-dots"></i>
                  <span>Enter clinical findings above and click <b>Ask AI</b> for evidence-based dental considerations.</span>
                </div>
              </div>
              <div class="cw-ai-disclaimer" style="background:#ffffff !important; color:#94a3b8 !important;">
                <i class="fa-solid fa-shield-halved"></i> For clinical decision support only. Confirm with standard clinical diagnosis.
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: TREATMENTS + PRESCRIPTIONS -->
          <div class="cw-col cw-col-side">

            <!-- PERFORMED TREATMENTS CARD -->
            <div class="cw-card cw-card-treatments" style="background:#ffffff !important; background-color:#ffffff !important; border:1px solid #e2e8f0 !important;">
              <div class="cw-card-header" style="background:#ffffff !important; border-bottom:1px solid #f1f5f9 !important;">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-treat"><i class="fa-solid fa-tooth"></i></div>
                  <div>
                    <h3 class="cw-card-title" style="color:#0f172a !important;">Treatments Performed</h3>
                    <p class="cw-card-subtitle" style="color:#64748b !important;">Billable procedures applied to this session</p>
                  </div>
                </div>
                <span class="cw-pill-counter" id="cw-treat-summary" style="background:#f0fdfa !important; color:#0f766e !important; border:1px solid #99f6e4 !important;">0 items • ₱0.00</span>
              </div>

              <div id="cw-treatments" class="cw-list-container" style="background:#ffffff !important;">
                ${renderTreatments(treatments)}
              </div>

              <div class="cw-add-section" style="background:#ffffff !important; border-top:1px solid #f1f5f9 !important;">
                <label class="cw-field-label" style="color:#64748b !important;"><i class="fa-solid fa-plus-circle"></i> Add Procedure</label>
                <div class="cw-add-row">
                  <select id="cw-treat-select" class="input cw-select" aria-label="Select treatment procedure" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">${treatOptions}</select>
                  <div class="cw-qty-wrap" style="background:#ffffff !important; border:1px solid #cbd5e1 !important;">
                    <span class="cw-qty-prefix" style="background:#f8fafc !important; color:#64748b !important;">Qty</span>
                    <input type="number" id="cw-treat-qty" class="input cw-qty-input" value="1" min="1" max="99" aria-label="Treatment quantity" style="background:#ffffff !important; color:#0f172a !important;">
                  </div>
                  <button class="btn btn-primary cw-add-btn" id="cw-add-treat" title="Add treatment procedure" style="background:#0d9488 !important; color:#ffffff !important; border:none !important;">
                    <i class="fa-solid fa-plus"></i> Add
                  </button>
                </div>
              </div>
            </div>

            <!-- DIGITAL PRESCRIPTIONS CARD -->
            <div class="cw-card cw-card-rx" style="background:#ffffff !important; background-color:#ffffff !important; border:1px solid #e2e8f0 !important;">
              <div class="cw-card-header" style="background:#ffffff !important; border-bottom:1px solid #f1f5f9 !important;">
                <div class="cw-card-title-group">
                  <div class="cw-card-icon cw-icon-rx"><i class="fa-solid fa-prescription"></i></div>
                  <div>
                    <h3 class="cw-card-title" style="color:#0f172a !important;">Prescriptions (Rx)</h3>
                    <p class="cw-card-subtitle" style="color:#64748b !important;">Medications issued for this patient</p>
                  </div>
                </div>
                <span class="cw-pill-counter" id="cw-rx-summary" style="background:#f0fdfa !important; color:#0f766e !important; border:1px solid #99f6e4 !important;">0 issued</span>
              </div>

              <div id="cw-rx" class="cw-list-container" style="background:#ffffff !important;">
                ${renderRx(rxs)}
              </div>

              <div class="cw-add-section" style="background:#ffffff !important; border-top:1px solid #f1f5f9 !important;">
                <label class="cw-field-label" style="color:#64748b !important;"><i class="fa-solid fa-file-prescription"></i> Issue New Prescription</label>
                <div class="cw-rx-grid">
                  <input class="input cw-input" id="rx-med" placeholder="Medication (e.g. Amoxicillin)" aria-label="Medication name" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">
                  <input class="input cw-input" id="rx-dose" placeholder="Dosage (e.g. 500mg)" aria-label="Dosage" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">
                  <input class="input cw-input" id="rx-freq" placeholder="Frequency (e.g. TID / 8h)" aria-label="Frequency" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">
                  <input class="input cw-input" id="rx-dur" placeholder="Duration (e.g. 7 days)" aria-label="Duration" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;">
                </div>
                <textarea class="input cw-textarea cw-rx-instructions" id="rx-instr" rows="2"
                  placeholder="Patient instructions (e.g. Take 1 capsule 3 times daily after meals with water)" aria-label="Patient instructions" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #cbd5e1 !important;"></textarea>
                <button class="btn btn-primary cw-btn-full" id="rx-add" style="background:#0d9488 !important; color:#ffffff !important; border:none !important;">
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
        <div class="cw-empty-state" style="color:#94a3b8 !important;">
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
        <div class="cw-record-item cw-treat-item" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #e2e8f0 !important; border-left:3px solid #10b981 !important;">
          <div class="cw-record-content">
            <div class="cw-record-main">
              <strong class="cw-record-name" style="color:#0f172a !important;">${esc(tt.treatment_name || 'Dental Procedure')}</strong>
              <span class="cw-multiplier-badge" style="background:#f1f5f9 !important; color:#475569 !important; border:1px solid #e2e8f0 !important;">× ${qty}</span>
            </div>
            <div class="cw-record-meta" style="color:#64748b !important;">
              <span>₱${unit.toLocaleString('en-US', { minimumFractionDigits: 2 })} each</span>
              <span class="cw-meta-dot">•</span>
              <strong class="cw-subtotal-price" style="color:#0f766e !important;">₱${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
            ${tt.notes ? `<div class="cw-record-note" style="color:#64748b !important;">${esc(tt.notes)}</div>` : ''}
          </div>
          <button class="cw-del-btn" data-del-treat="${tt.id}" title="Remove this procedure" aria-label="Remove procedure" style="background:transparent !important; color:#94a3b8 !important;">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    }).join('') + `</div>`;
  }

  function renderRx(list) {
    if (!list || !list.length) {
      return `
        <div class="cw-empty-state" style="color:#94a3b8 !important;">
          <i class="fa-solid fa-pills"></i>
          <span>No prescriptions issued for this patient yet.</span>
        </div>
      `;
    }
    return `<div class="cw-record-list">` + list.map(r => `
      <div class="cw-record-item cw-rx-item" style="background:#ffffff !important; color:#0f172a !important; border:1px solid #e2e8f0 !important; border-left:3px solid #7c3aed !important;">
        <div class="cw-rx-icon"><i class="fa-solid fa-prescription"></i></div>
        <div class="cw-record-content">
          <div class="cw-record-main">
            <strong class="cw-record-name" style="color:#0f172a !important;">${esc(r.medication)}</strong>
            ${r.dosage ? `<span class="cw-rx-badge">${esc(r.dosage)}</span>` : ''}
          </div>
          <div class="cw-record-meta" style="color:#64748b !important;">
            ${r.frequency ? `<span><i class="fa-regular fa-clock"></i> ${esc(r.frequency)}</span>` : ''}
            ${r.frequency && r.duration ? `<span class="cw-meta-dot">•</span>` : ''}
            ${r.duration ? `<span><i class="fa-regular fa-calendar"></i> ${esc(r.duration)}</span>` : ''}
          </div>
          ${r.instructions ? `<div class="cw-record-note" style="color:#64748b !important;"><i class="fa-solid fa-info-circle"></i> ${esc(r.instructions)}</div>` : ''}
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
