// Clinical Workspace / Appointment Details Modal
// Displays visit information, patient details, lifecycle status, SOAP notes, and prescriptions.

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
    if (!iso) return { dateStr: 'Not scheduled', timeStr: 'N/A', fullStr: 'Not scheduled' };
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { dateStr: iso, timeStr: '', fullStr: iso };
      const dateStr = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return { dateStr, timeStr, fullStr: `${dateStr} at ${timeStr}` };
    } catch (_) {
      return { dateStr: iso, timeStr: '', fullStr: iso };
    }
  }

  function renderCancelledNotice() {
    return `
      <div class="cw-vd-cancelled-card" style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:14px 18px; display:flex; align-items:center; gap:12px; margin-bottom:20px;">
        <div style="width:38px; height:38px; border-radius:10px; background:#fee2e2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-size:1.15rem; flex-shrink:0;">
          <i class="fa-solid fa-ban"></i>
        </div>
        <div>
          <strong style="display:block; font-size:0.9rem; color:#991b1b; margin-bottom:2px;">Appointment Cancelled</strong>
          <span style="font-size:0.78rem; color:#b91c1c; line-height:1.4; display:block;">This appointment has been cancelled. It cannot be rescheduled, confirmed, started, or completed.</span>
        </div>
      </div>
    `;
  }

  async function open(appt) {
    currentAppt = appt;
    Modal.open(`
      <style>
        .modal-overlay {
          background: rgba(15, 23, 42, 0.45) !important;
          backdrop-filter: blur(4px) !important;
          -webkit-backdrop-filter: blur(4px) !important;
        }
      </style>
      ${window.Skeleton ? window.Skeleton.modal('workspace') : `
        <div class="modal-body cw-vd-modal" style="background:#ffffff !important; border-radius:18px !important; padding:28px !important;">
          <div class="skeleton" style="width:100%; height:220px; border-radius:14px;"></div>
        </div>
      `}
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
        <div class="modal-body" style="background:#ffffff !important; color:#0f172a !important; border-radius:16px;">
          <h3 style="color:#dc2626; margin-top:0;">Error Loading Details</h3>
          <p style="color:#475569;">${esc(err.message || 'Unknown error occurred.')}</p>
          <div style="text-align:right; margin-top:20px;">
            <button class="btn btn-ghost" onclick="Modal.close()">Close</button>
          </div>
        </div>
      `);
    }
  }

  function render(treatments, rxs) {
    const a = currentAppt;
    const patientName = a.patient && a.patient.name ? a.patient.name : 'Unknown Patient';
    const patientPhone = a.patient && (a.patient.contact_number || a.patient.phone) ? (a.patient.contact_number || a.patient.phone) : 'N/A';
    const patientEmail = a.patient && a.patient.email ? a.patient.email : 'N/A';
    const treatmentName = a.treatment && a.treatment.name ? a.treatment.name : (a.reason || 'General Dental Consultation');
    const treatmentPrice = a.treatment && a.treatment.price ? `₱${Number(a.treatment.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '₱1,500.00';
    const durationMins = a.treatment && a.treatment.duration_minutes ? `${a.treatment.duration_minutes} mins` : '45 mins';
    const { dateStr, timeStr, fullStr } = formatDateTime(a.appointment_date);
    const initial = patientName.trim().charAt(0).toUpperCase() || 'P';
    const status = a.status || 'Pending';
    const isCancelled = String(status).trim().toLowerCase().startsWith('cancel');
    const apptId = a.id ? String(a.id) : '';
    const cleanNotes = a.notes ? a.notes.replace(/\[[^\]]+\]/g, '').trim() : '';

    const treatOptions = treatmentsCatalog.length ? treatmentsCatalog.map(x =>
      `<option value="${x.id}">${esc(x.name)} — ₱${Number(x.price).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${x.duration_minutes || 30}m)</option>`
    ).join('') : '<option value="" disabled selected>No treatments in catalog</option>';

    Modal.open(`
      <style>
        .modal-overlay {
          background: rgba(15, 23, 42, 0.45) !important;
          backdrop-filter: blur(5px) !important;
          -webkit-backdrop-filter: blur(5px) !important;
        }
        .cw-vd-modal {
          max-width: 680px !important;
          width: 95vw !important;
          background: #ffffff !important;
          color: #0f172a !important;
          border-radius: 20px !important;
          padding: 28px 32px !important;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.16) !important;
          border: 1px solid #e2e8f0 !important;
          border-top: 4px solid #0d9488 !important;
          max-height: 90vh !important;
          overflow-y: auto !important;
          position: relative;
        }
        .cw-vd-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 18px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 20px;
        }
        .cw-vd-title-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cw-vd-title-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #f0fdfa;
          color: #0d9488;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }
        .cw-vd-title {
          margin: 0;
          font-family: var(--font-display, 'Playfair Display', serif);
          font-size: 1.4rem;
          color: #0f172a;
          font-weight: 700;
        }
        .cw-vd-sub {
          margin: 2px 0 0;
          font-size: 0.78rem;
          color: #64748b;
        }
        .cw-vd-close-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .cw-vd-close-btn:hover {
          background: #fee2e2;
          color: #ef4444;
          border-color: #fca5a5;
        }
        .cw-vd-patient-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .cw-vd-patient-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .cw-vd-avatar {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: #e6f6f9;
          border: 2px solid #bce6ee;
          color: #0b3c4d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.45rem;
          font-weight: 800;
        }
        .cw-vd-pname {
          font-size: 1.15rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
        }
        .cw-vd-pcontact {
          font-size: 0.78rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .cw-vd-pcontact span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .cw-vd-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 580px) {
          .cw-vd-grid { grid-template-columns: 1fr; }
        }
        .cw-vd-tile {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .cw-vd-tile-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #f0fdfa;
          color: #0d9488;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          flex-shrink: 0;
        }
        .cw-vd-tile-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          margin-bottom: 2px;
        }
        .cw-vd-tile-val {
          font-size: 0.92rem;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.35;
        }
        .cw-vd-tile-sub {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }
        .cw-vd-box {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 20px;
        }
        .cw-vd-box-title {
          font-size: 0.74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
        }
        .cw-vd-box-content {
          font-size: 0.86rem;
          color: #334155;
          line-height: 1.5;
        }
        .cw-vd-actions-title {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cw-vd-actions-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 6px;
        }
        .cw-status-btn {
          flex: 1;
          min-width: 90px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 7px 10px;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          color: #475569;
          transition: all 0.15s ease;
        }
        .cw-status-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .cw-act-confirm.is-active { background: #eff6ff !important; color: #1d4ed8 !important; border-color: #93c5fd !important; font-weight: 700 !important; }
        .cw-act-progress.is-active { background: #f0fdfa !important; color: #0f766e !important; border-color: #99f6e4 !important; font-weight: 700 !important; }
        .cw-act-complete.is-active { background: #f0fdf4 !important; color: #15803d !important; border-color: #86efac !important; font-weight: 700 !important; }
        .cw-act-reschedule.is-active { background: #fffbeb !important; color: #b45309 !important; border-color: #fcd34d !important; font-weight: 700 !important; }
        .cw-act-cancel.is-active { background: #fef2f2 !important; color: #b91c1c !important; border-color: #fca5a5 !important; font-weight: 700 !important; }
        .cw-vd-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 14px;
          border-top: 1px solid #f1f5f9;
        }
        .cw-charting-panel {
          display: none;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px dashed #cbd5e1;
        }
        .cw-charting-panel.is-open {
          display: block;
        }
      </style>

      <div class="modal-body cw-vd-modal">
        <!-- TOP HEADER -->
        <div class="cw-vd-header-row">
          <div class="cw-vd-title-wrap">
            <div class="cw-vd-title-icon"><i class="fa-solid fa-calendar-check"></i></div>
            <div>
              <h3 class="cw-vd-title">Appointment Details</h3>
              <p class="cw-vd-sub">Patient visit information & schedule confirmation</p>
            </div>
          </div>
          <button class="cw-vd-close-btn" onclick="Modal.close()" title="Close details">×</button>
        </div>

        <!-- PATIENT BANNER -->
        <div class="cw-vd-patient-banner">
          <div class="cw-vd-patient-left">
            <div class="cw-vd-avatar">${esc(initial)}</div>
            <div>
              <h4 class="cw-vd-pname">${esc(patientName)}</h4>
              <div class="cw-vd-pcontact">
                <span><i class="fa-solid fa-phone" style="color:#0d9488;"></i> ${esc(patientPhone)}</span>
                <span><i class="fa-solid fa-envelope" style="color:#0d9488;"></i> ${esc(patientEmail)}</span>
              </div>
            </div>
          </div>
          <div>
            <span class="badge ${statusBadge(status)}" id="cw-status" style="font-size:0.84rem; padding:6px 14px; border-radius:20px; font-weight:700;">
              ${esc(status)}
            </span>
          </div>
        </div>

        <!-- SPECIFICATIONS GRID (4 TILES) -->
        <div class="cw-vd-grid">
          <!-- Tile 1: Treatment -->
          <div class="cw-vd-tile">
            <div class="cw-vd-tile-icon"><i class="fa-solid fa-tooth"></i></div>
            <div>
              <div class="cw-vd-tile-label">Service / Treatment</div>
              <div class="cw-vd-tile-val">${esc(treatmentName)}</div>
              <div class="cw-vd-tile-sub">Standard Clinic Procedure</div>
            </div>
          </div>

          <!-- Tile 2: Date & Time -->
          <div class="cw-vd-tile">
            <div class="cw-vd-tile-icon"><i class="fa-regular fa-clock"></i></div>
            <div>
              <div class="cw-vd-tile-label">Schedule & Time</div>
              <div class="cw-vd-tile-val">${esc(timeStr)}</div>
              <div class="cw-vd-tile-sub">${esc(dateStr)}</div>
            </div>
          </div>

          <!-- Tile 3: Duration & Fee -->
          <div class="cw-vd-tile">
            <div class="cw-vd-tile-icon"><i class="fa-solid fa-hourglass-half"></i></div>
            <div>
              <div class="cw-vd-tile-label">Duration & Est. Fee</div>
              <div class="cw-vd-tile-val">${esc(treatmentPrice)}</div>
              <div class="cw-vd-tile-sub">Estimated time: ${esc(durationMins)}</div>
            </div>
          </div>

          <!-- Tile 4: Branch & Appt ID -->
          <div class="cw-vd-tile">
            <div class="cw-vd-tile-icon"><i class="fa-solid fa-location-dot"></i></div>
            <div>
              <div class="cw-vd-tile-label">Clinic Location</div>
              <div class="cw-vd-tile-val">Main Branch (Balirong)</div>
              <div class="cw-vd-tile-sub">Reference #${esc(apptId.slice(0, 8))}</div>
            </div>
          </div>
        </div>

        <!-- SPECIAL NOTES / BOOKING COMPLAINTS -->
        <div class="cw-vd-box">
          <div class="cw-vd-box-title">
            <i class="fa-solid fa-comment-medical" style="color:#0d9488;"></i> Special Requests & Notes
          </div>
          <div class="cw-vd-box-content">
            ${cleanNotes ? esc(cleanNotes) : '<span style="color:#94a3b8; font-style:italic;">No special requests or additional complaints recorded for this booking.</span>'}
          </div>
        </div>

        <!-- LIFECYCLE STATUS ACTIONS OR CANCELLED NOTICE -->
        <div id="cw-actions-container">
          ${isCancelled ? renderCancelledNotice() : `
            <div>
              <div class="cw-vd-actions-title">
                <i class="fa-solid fa-arrows-rotate" style="color:#0d9488;"></i> Update Status:
              </div>
              <div class="cw-vd-actions-row" role="group">
                <button class="cw-status-btn cw-act-confirm ${status === 'Confirmed' ? 'is-active' : ''}" data-act="Confirmed">
                  <i class="fa-solid fa-check"></i> Confirm
                </button>
                <button class="cw-status-btn cw-act-progress ${status === 'In Progress' ? 'is-active' : ''}" data-act="In Progress">
                  <i class="fa-solid fa-play"></i> Start
                </button>
                <button class="cw-status-btn cw-act-complete ${status === 'Completed' ? 'is-active' : ''}" data-act="Completed">
                  <i class="fa-solid fa-circle-check"></i> Complete
                </button>
                <button class="cw-status-btn cw-act-reschedule ${status === 'Rescheduled' ? 'is-active' : ''}" data-act="Rescheduled">
                  <i class="fa-solid fa-calendar"></i> Reschedule
                </button>
                <button class="cw-status-btn cw-act-cancel" data-act="Cancelled" style="color:#dc2626;">
                  <i class="fa-solid fa-ban"></i> Cancel
                </button>
              </div>
            </div>
          `}
        </div>

        <!-- COLLAPSIBLE CLINICAL NOTES & RX (OPTIONAL) -->
        <div id="cw-charting-panel" class="cw-charting-panel">
          <h4 style="margin:0 0 10px 0; font-size:0.92rem; color:#0f172a;"><i class="fa-solid fa-notes-medical" style="color:#0d9488;"></i> Clinical SOAP Notes</h4>
          <textarea id="cw-notes" class="input textarea" rows="4" style="width:100%; border:1px solid #cbd5e1; border-radius:10px; padding:10px; font-size:0.86rem; margin-bottom:8px;" placeholder="Document subjective complaints, objective findings, assessment, and plan…">${esc(a.clinical_notes || '')}</textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <span id="cw-notes-feedback" style="font-size:0.78rem; color:#059669; font-weight:600;"></span>
            <button class="btn btn-primary small" id="cw-save-notes" style="background:#0d9488 !important; border:none;">Save Notes</button>
          </div>

          <h4 style="margin:0 0 10px 0; font-size:0.92rem; color:#0f172a;"><i class="fa-solid fa-tooth" style="color:#0d9488;"></i> Treatments Performed</h4>
          <div id="cw-treatments" style="margin-bottom:10px;">${renderTreatments(treatments)}</div>
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <select id="cw-treat-select" class="input" style="flex:1; height:36px; font-size:0.82rem;">${treatOptions}</select>
            <input type="number" id="cw-treat-qty" class="input" value="1" min="1" style="width:65px; height:36px; text-align:center;">
            <button class="btn btn-primary small" id="cw-add-treat" style="background:#0d9488 !important; border:none;">Add</button>
          </div>

          <h4 style="margin:0 0 10px 0; font-size:0.92rem; color:#0f172a;"><i class="fa-solid fa-prescription" style="color:#7c3aed;"></i> Prescriptions (Rx)</h4>
          <div id="cw-rx" style="margin-bottom:10px;">${renderRx(rxs)}</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
            <input class="input" id="rx-med" placeholder="Medication (e.g. Amoxicillin)" style="height:34px; font-size:0.8rem;">
            <input class="input" id="rx-dose" placeholder="Dosage (e.g. 500mg)" style="height:34px; font-size:0.8rem;">
            <input class="input" id="rx-freq" placeholder="Frequency (e.g. TID)" style="height:34px; font-size:0.8rem;">
            <input class="input" id="rx-dur" placeholder="Duration (e.g. 7 days)" style="height:34px; font-size:0.8rem;">
          </div>
          <input class="input" id="rx-instr" placeholder="Instructions" style="width:100%; height:34px; font-size:0.8rem; margin-bottom:8px;">
          <div style="text-align:right;">
            <button class="btn btn-primary small" id="rx-add" style="background:#0d9488 !important; border:none;">Add Prescription</button>
          </div>
        </div>

        <!-- FOOTER ACTIONS -->
        <div class="cw-vd-footer">
          <button type="button" class="btn btn-ghost small" id="cw-toggle-charting" style="color:#0d9488; font-weight:600; font-size:0.82rem;">
            <i class="fa-solid fa-stethoscope"></i> Clinical Charting (SOAP & Rx) <i class="fa-solid fa-chevron-down" id="cw-chevron" style="font-size:0.75rem; transition:transform 0.2s;"></i>
          </button>
          <button class="btn btn-primary" onclick="Modal.close()" style="background:#0d9488 !important; border:none; padding:8px 22px; border-radius:10px; font-weight:600;">
            Close Details
          </button>
        </div>
      </div>
    `);

    wireActions();
  }

  function renderTreatments(list) {
    if (!list || !list.length) {
      return `<p style="font-size:0.8rem; color:#94a3b8; margin:0 0 8px 0; font-style:italic;">No procedures added to this appointment.</p>`;
    }
    return `<div style="display:flex; flex-direction:column; gap:6px;">` + list.map(tt => {
      const unit = Number(tt.price_at_time || 0);
      const qty = Number(tt.quantity || 1);
      const subtotal = unit * qty;
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; font-size:0.82rem;">
          <div>
            <strong>${esc(tt.treatment_name || 'Procedure')}</strong> × ${qty}
            <span style="color:#64748b; margin-left:8px;">₱${unit.toFixed(2)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <strong style="color:#0d9488;">₱${subtotal.toFixed(2)}</strong>
            <button data-del-treat="${tt.id}" style="border:none; background:transparent; color:#ef4444; cursor:pointer;" title="Remove">×</button>
          </div>
        </div>
      `;
    }).join('') + `</div>`;
  }

  function renderRx(list) {
    if (!list || !list.length) {
      return `<p style="font-size:0.8rem; color:#94a3b8; margin:0 0 8px 0; font-style:italic;">No prescriptions issued.</p>`;
    }
    return `<div style="display:flex; flex-direction:column; gap:6px;">` + list.map(r => `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; font-size:0.82rem;">
        <strong>℞ ${esc(r.medication)}</strong> — ${esc(r.dosage || '')} ${esc(r.frequency || '')} for ${esc(r.duration || '')}
        ${r.instructions ? `<div style="color:#64748b; font-size:0.75rem; margin-top:2px;">${esc(r.instructions)}</div>` : ''}
      </div>
    `).join('') + `</div>`;
  }

  function wireActions() {
    const a = currentAppt;

    // Toggle Clinical Charting Panel
    const toggleBtn = document.getElementById('cw-toggle-charting');
    const panel = document.getElementById('cw-charting-panel');
    const chevron = document.getElementById('cw-chevron');
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = panel.classList.toggle('is-open');
        if (chevron) {
          chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
    }

    // Status action buttons
    document.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (busy) return;

        // If appointment is already cancelled, it cannot be confirmed, started, rescheduled, or completed!
        const curStatus = String(currentAppt.status || '').trim().toLowerCase();
        if (curStatus.startsWith('cancel')) {
          alert('This appointment has been cancelled and cannot be confirmed, started, rescheduled, or completed.');
          return;
        }

        const act = btn.getAttribute('data-act');

        if (act === 'Cancelled') {
          if (!confirm('Are you sure you want to cancel this appointment? Once cancelled, it cannot be rescheduled, confirmed, started, or completed.')) {
            return;
          }
        }

        busy = true;
        const prevText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
          const updated = await api.put(`/appointments/${a.id}`, {
            status: act,
            ...(act === 'In Progress' ? { dentist_id: a.dentist_id } : {})
          });

          const newStatus = (updated && updated.status) ? updated.status : act;
          const statusEl = document.getElementById('cw-status');
          if (statusEl) {
            statusEl.className = 'badge ' + statusBadge(newStatus);
            statusEl.textContent = newStatus;
          }

          currentAppt = { ...currentAppt, status: newStatus };

          if (String(newStatus).toLowerCase() === 'cancelled') {
            const container = document.getElementById('cw-actions-container');
            if (container) {
              container.innerHTML = renderCancelledNotice();
            }
          } else {
            document.querySelectorAll('[data-act]').forEach(b => {
              if (b.getAttribute('data-act') === newStatus) {
                b.classList.add('is-active');
              } else {
                b.classList.remove('is-active');
              }
            });
          }

          if (typeof loadQueueView === 'function') loadQueueView();
          if (typeof loadOverview === 'function') loadOverview();
          if (typeof loadTodaySchedule === 'function') loadTodaySchedule();
          if (typeof loadScheduleTable === 'function') loadScheduleTable();
        } catch (err) {
          alert('Could not update status: ' + err.message);
        } finally {
          btn.innerHTML = prevText;
          busy = false;
        }
      });
    });

    // Save Clinical Notes
    const saveNotes = document.getElementById('cw-save-notes');
    const notesEl = document.getElementById('cw-notes');
    if (saveNotes && notesEl) {
      saveNotes.addEventListener('click', async () => {
        const text = notesEl.value;
        const prevHtml = saveNotes.innerHTML;
        saveNotes.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
        saveNotes.disabled = true;

        try {
          await api.put(`/appointments/${a.id}/notes`, { clinical_notes: text });
          const feedback = document.getElementById('cw-notes-feedback');
          if (feedback) {
            feedback.innerHTML = `✓ Notes saved!`;
            setTimeout(() => { feedback.innerHTML = ''; }, 3000);
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

    // Add Treatment Procedure
    const addTreat = document.getElementById('cw-add-treat');
    if (addTreat) {
      addTreat.addEventListener('click', async () => {
        const sel = document.getElementById('cw-treat-select');
        const tid = sel ? sel.value : null;
        if (!tid) return alert('Select a procedure first.');
        const qty = parseInt(document.getElementById('cw-treat-qty').value, 10) || 1;

        try {
          await api.post(`/appointments/${a.id}/treatments`, { treatment_id: tid, quantity: qty });
          const list = await api.get(`/appointments/${a.id}/treatments`);
          document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
          wireDeleteTreat();
        } catch (err) {
          alert('Could not record treatment: ' + err.message);
        }
      });
    }

    // Add Prescription
    const addRx = document.getElementById('rx-add');
    if (addRx) {
      addRx.addEventListener('click', async () => {
        const med = document.getElementById('rx-med').value.trim();
        if (!med) return alert('Medication name required.');

        try {
          await api.post(`/appointments/${a.id}/prescriptions`, {
            medication: med,
            dosage: document.getElementById('rx-dose').value.trim(),
            frequency: document.getElementById('rx-freq').value.trim(),
            duration: document.getElementById('rx-dur').value.trim(),
            instructions: document.getElementById('rx-instr').value.trim()
          });

          document.getElementById('rx-med').value = '';
          document.getElementById('rx-dose').value = '';
          document.getElementById('rx-freq').value = '';
          document.getElementById('rx-dur').value = '';
          document.getElementById('rx-instr').value = '';

          const list = await api.get(`/appointments/${a.id}/prescriptions`);
          document.getElementById('cw-rx').innerHTML = renderRx(list);
          window.dispatchEvent(new CustomEvent('prescription:created'));
        } catch (err) {
          alert('Could not issue prescription: ' + err.message);
        }
      });
    }

    wireDeleteTreat();
  }

  function wireDeleteTreat() {
    document.querySelectorAll('[data-del-treat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-treat');
        try {
          await api.del(`/appointment-treatments/${id}`).catch(async () => {
            return api.del(`/appointments/${currentAppt.id}/treatments/${id}`);
          });

          const list = await api.get(`/appointments/${currentAppt.id}/treatments`);
          document.getElementById('cw-treatments').innerHTML = renderTreatments(list);
          wireDeleteTreat();
        } catch (err) {
          alert('Could not remove treatment: ' + err.message);
        }
      });
    });
  }

  return { open };
})();

window.ClinicalWorkspace = ClinicalWorkspace;
window.openAppointmentDetails = (apptId) => ClinicalWorkspace.open(apptId);
window.viewAppointmentDetails = (apptId) => ClinicalWorkspace.open(apptId);
