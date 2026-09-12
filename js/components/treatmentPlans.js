// Treatment Plans: Comprehensive 6-Pillar Clinical Treatment Planner
// 1. Diagnosis/findings (cavities, gum disease, missing teeth, tooth #s)
// 2. Recommended procedures (fillings, root canal, extraction, crown, cleaning, ortho)
// 3. Sequence/priority (urgent pain/infection first, then preventive/cosmetic)
// 4. Cost estimate (per procedure and total, insurance coverage vs out-of-pocket)
// 5. Timeline (number of visits and expected duration)
// 6. Alternatives (other treatment options e.g., implant vs bridge)

const TreatmentPlans = (() => {
  let listRoot = null;
  let patients = [];
  let catalog = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function formatMoney(num) {
    const val = Number(num) || 0;
    return '₱' + val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDuration(totalMins) {
    const mins = Math.max(0, parseInt(totalMins, 10) || 0);
    if (mins === 0) return '0 mins';
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs} hr${hrs > 1 ? 's' : ''} ${rem} min${rem > 1 ? 's' : ''}` : `${hrs} hr${hrs > 1 ? 's' : ''}`;
  }

  const DENTIST_TOOTH_MAP = {
    '18': 'Upper Right Wisdom Tooth (#18)',
    '17': 'Upper Right 2nd Molar (#17)',
    '16': 'Upper Right 1st Molar (#16)',
    '15': 'Upper Right 2nd Premolar (#15)',
    '14': 'Upper Right 1st Premolar (#14)',
    '13': 'Upper Right Canine (#13)',
    '12': 'Upper Right Lateral Incisor (#12)',
    '11': 'Upper Right Front Center (#11)',
    '21': 'Upper Left Front Center (#21)',
    '22': 'Upper Left Lateral Incisor (#22)',
    '23': 'Upper Left Canine (#23)',
    '24': 'Upper Left 1st Premolar (#24)',
    '25': 'Upper Left 2nd Premolar (#25)',
    '26': 'Upper Left 1st Molar (#26)',
    '27': 'Upper Left 2nd Molar (#27)',
    '28': 'Upper Left Wisdom Tooth (#28)',
    '38': 'Lower Left Wisdom Tooth (#38)',
    '37': 'Lower Left 2nd Molar (#37)',
    '36': 'Lower Left 1st Molar (#36)',
    '35': 'Lower Left 2nd Premolar (#35)',
    '34': 'Lower Left 1st Premolar (#34)',
    '33': 'Lower Left Canine (#33)',
    '32': 'Lower Left Lateral Incisor (#32)',
    '31': 'Lower Left Front Center (#31)',
    '41': 'Lower Right Front Center (#41)',
    '42': 'Lower Right Lateral Incisor (#42)',
    '43': 'Lower Right Canine (#43)',
    '44': 'Lower Right 1st Premolar (#44)',
    '45': 'Lower Right 2nd Premolar (#45)',
    '46': 'Lower Right 1st Molar (#46)',
    '47': 'Lower Right 2nd Molar (#47)',
    '48': 'Lower Right Wisdom Tooth (#48)'
  };

  function formatFriendlyTooth(str) {
    if (!str) return '';
    const clean = str.trim();
    const digits = clean.match(/\d+/);
    if (digits && DENTIST_TOOTH_MAP[digits[0]]) {
      return DENTIST_TOOTH_MAP[digits[0]];
    }
    return clean.startsWith('#') ? `Tooth ${clean}` : `Tooth #${clean}`;
  }

  function statusBadge(s) {
    const status = String(s || 'Active').toLowerCase().replace(/\s+/g, '-');
    return 'badge-' + status;
  }

  // Parse structured 6-pillar metadata from plan description
  function parsePlanMetadata(rawDesc) {
    const def = {
      summary: '',
      diagnosis: '',
      affected_teeth: '',
      priority: 'Urgent',
      visits_count: 1,
      timeline: '',
      total_fee: 0,
      insurance_coverage: 0,
      out_of_pocket: 0,
      alternatives: '',
      clinical_notes: ''
    };

    if (!rawDesc) return def;
    const str = String(rawDesc).trim();
    if (str.startsWith('{')) {
      try {
        const obj = JSON.parse(str);
        return { ...def, ...obj };
      } catch (e) {}
    }

    // Regex tag parsing fallback
    const diagMatch = str.match(/\[Diagnosis:\s*([^\]]+)\]/i);
    const teethMatch = str.match(/\[Teeth:\s*([^\]]+)\]/i);
    const altMatch = str.match(/\[Alternatives:\s*([^\]]+)\]/i);
    const timeMatch = str.match(/\[Timeline:\s*([^\]]+)\]/i);
    const visitsMatch = str.match(/\[Visits:\s*([^\]]+)\]/i);
    const insMatch = str.match(/\[InsuranceCoverage:\s*([^\]]+)\]/i);

    def.diagnosis = diagMatch ? diagMatch[1] : str.replace(/\[[^\]]+\]/g, '').trim();
    if (teethMatch) def.affected_teeth = teethMatch[1];
    if (altMatch) def.alternatives = altMatch[1];
    if (timeMatch) def.timeline = timeMatch[1];
    if (visitsMatch) def.visits_count = parseInt(visitsMatch[1], 10) || 1;
    if (insMatch) def.insurance_coverage = parseFloat(insMatch[1].replace(/[^0-9.]/g, '')) || 0;

    return def;
  }

  // Parse structured step item notes
  function parseItemMetadata(rawNotes, defaultPrice = 0) {
    const def = {
      tooth: '',
      priority: 'Normal',
      fee: Number(defaultPrice) || 0,
      insurance_covered: 0,
      out_of_pocket: Number(defaultPrice) || 0,
      visit: 'Visit 1',
      notes: ''
    };

    if (!rawNotes) return def;
    const str = String(rawNotes).trim();
    if (str.startsWith('{')) {
      try {
        const obj = JSON.parse(str);
        return { ...def, ...obj };
      } catch (e) {}
    }

    const tMatch = str.match(/\[Tooth:\s*([^\]]+)\]/i);
    const pMatch = str.match(/\[Priority:\s*([^\]]+)\]/i);
    const insMatch = str.match(/\[Insurance:\s*([^\]]+)\]/i);
    const oopMatch = str.match(/\[Out-of-Pocket:\s*([^\]]+)\]/i);
    const vMatch = str.match(/\[Visit:\s*([^\]]+)\]/i);

    if (tMatch) def.tooth = tMatch[1];
    if (pMatch) def.priority = pMatch[1];
    if (insMatch) def.insurance_covered = parseFloat(insMatch[1].replace(/[^0-9.]/g, '')) || 0;
    if (oopMatch) def.out_of_pocket = parseFloat(oopMatch[1].replace(/[^0-9.]/g, '')) || 0;
    if (vMatch) def.visit = vMatch[1];
    def.notes = str.replace(/\[[^\]]+\]/g, '').trim();

    return def;
  }

  function getPriorityClass(p) {
    const s = String(p || '').toLowerCase();
    if (s.includes('urgent') || s.includes('emergency') || s.includes('pain')) return 'priority-urgent';
    if (s.includes('high') || s.includes('decay') || s.includes('caries')) return 'priority-high';
    if (s.includes('preventive') || s.includes('medium') || s.includes('restore') || s.includes('normal')) return 'priority-medium';
    return 'priority-elective';
  }

  async function load() {
    if (!listRoot) return;
    try {
      listRoot.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--primary-color); margin-bottom: 8px;"></i>
          <p style="margin: 0;">Loading clinical treatment plans & diagnostic catalog...</p>
        </div>`;

      const [plans, pats, cat] = await Promise.all([
        api.get('/treatment-plans'),
        api.get('/patients'),
        api.get('/treatments')
      ]);

      patients = pats || [];
      catalog = cat || [];
      listRoot.innerHTML = '';

      if (!plans || !plans.length) {
        listRoot.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; background: #ffffff; border-radius: 16px; border: 2px dashed #cbd5e1; box-shadow: var(--shadow-sm);">
            <div style="width: 64px; height: 64px; background: rgba(11, 60, 77, 0.08); color: var(--primary-color); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 26px; margin-bottom: 14px;">
              <i class="fa-solid fa-clipboard-list"></i>
            </div>
            <h4 style="margin: 0 0 6px; font-size: 1.15rem; color: var(--dark-color); font-weight: 700;">No Treatment Plans Found</h4>
            <p style="margin: 0 auto 20px; color: #64748b; font-size: 0.88rem; max-width: 480px; line-height: 1.5;">
              Create structured 6-pillar clinical care plans to sequence procedures by priority, calculate insurance vs out-of-pocket fees, and establish timeline & alternatives.
            </p>
            <button class="btn btn-primary" onclick="TreatmentPlans.openCreate()">
              <i class="fa-solid fa-plus"></i> Create Treatment Plan
            </button>
          </div>`;
        return;
      }

      listRoot.innerHTML = plans.map(p => {
        const meta = parsePlanMetadata(p.description);
        const rawItems = p.items || [];
        const items = [...rawItems].sort((a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0));
        const totalSteps = items.length;
        const completedSteps = items.filter(i => String(i.status).toLowerCase() === 'completed').length;
        const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

        const patientName = p.patient ? (p.patient.name || 'Patient') : 'N/A';
        const totalFee = Number(p.total_estimated_cost) || Number(meta.total_fee) || 0;
        const insuranceCovered = Number(meta.insurance_coverage) || 0;
        const outOfPocket = Math.max(0, totalFee - insuranceCovered);
        const createdDate = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

        // Affected teeth pills with anatomy description
        const teethPills = (meta.affected_teeth || '').split(/[,;]+/)
          .map(t => t.trim())
          .filter(Boolean)
          .map(t => `<span class="tp-tooth-tag" title="${esc(formatFriendlyTooth(t))}"><i class="fa-solid fa-tooth"></i> ${esc(formatFriendlyTooth(t))}</span>`)
          .join('');

        // Steps HTML
        const itemsHtml = items.map((i, idx) => {
          const isDone = String(i.status).toLowerCase() === 'completed';
          const itemMeta = parseItemMetadata(i.notes);
          const prioClass = getPriorityClass(itemMeta.priority);
          const stepTooth = itemMeta.tooth ? `<span class="tp-tooth-tag" style="font-size:0.72rem; padding: 2px 7px;" title="${esc(formatFriendlyTooth(itemMeta.tooth))}"><i class="fa-solid fa-tooth"></i> ${esc(formatFriendlyTooth(itemMeta.tooth))}</span>` : '';
          const stepVisit = itemMeta.visit ? `<span class="tp-visit-tag"><i class="fa-regular fa-calendar-check"></i> ${esc(itemMeta.visit)}</span>` : '';

          return `
            <li class="plan-item-row ${isDone ? 'is-completed' : ''}" style="display:flex; flex-direction:column; gap:6px; padding:12px 14px;">
              <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:8px;">
                <div class="plan-item-left">
                  <span class="plan-item-seq">
                    ${isDone ? '<i class="fa-solid fa-check"></i>' : (i.sequence || idx + 1)}
                  </span>
                  <div style="overflow:hidden;">
                    <span class="plan-item-name" title="${esc(i.treatment_name)}">${esc(i.treatment_name || 'Procedure')}</span>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">
                      ${stepTooth}
                      ${stepVisit}
                      <span class="tp-priority-badge ${prioClass}">${esc(itemMeta.priority || 'Normal')}</span>
                    </div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                  <span class="badge ${statusBadge(i.status)}" style="font-size:0.72rem; padding: 2px 8px;">${esc(i.status || 'Pending')}</span>
                  ${!isDone ? `
                    <button class="btn btn-ghost small" data-item-done="${i.id}" style="padding: 3px 8px; font-size: 0.72rem; color: var(--primary-color);" title="Mark procedure completed">
                      <i class="fa-solid fa-check"></i> Complete
                    </button>
                  ` : ''}
                </div>
              </div>
              ${itemMeta.notes ? `<div style="font-size:0.78rem; color:#64748b; padding-left: 32px; line-height: 1.4;"><i class="fa-solid fa-info-circle" style="font-size:0.7rem; margin-right:4px; color:var(--primary-color);"></i>${esc(itemMeta.notes)}</div>` : ''}
            </li>`;
        }).join('');

        return `
          <div class="plan-card">
            <div>
              <!-- Header -->
              <div class="plan-card-head">
                <div style="flex: 1; min-width: 280px;">
                  <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px;">
                    <h3 class="plan-title" style="margin: 0;">${esc(p.name)}</h3>
                    <span class="badge ${statusBadge(p.status)}">${esc(p.status || 'Active')}</span>
                  </div>
                  <div class="plan-meta-row">
                    <span><i class="fa-solid fa-user" style="color:var(--primary-color); margin-right:5px;"></i><strong>Patient:</strong> ${esc(patientName)}</span>
                    ${createdDate ? `<span><i class="fa-regular fa-calendar" style="margin-right:5px;"></i>${createdDate}</span>` : ''}
                    <span class="tp-priority-badge ${getPriorityClass(meta.priority)}">${esc(meta.priority || 'Urgent')} Priority</span>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0;">
                  <button type="button" class="btn btn-ghost small" id="btn-email-plan-${p.id}" onclick="TreatmentPlans.emailCarePlan('${p.id}')" title="Email clinical care plan to patient" style="border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600; white-space: nowrap; padding: 7px 14px; font-size: 0.82rem; background: #ffffff; color: var(--primary-color);">
                    <i class="fa-solid fa-paper-plane" style="color:var(--primary-color); margin-right: 5px;"></i> Send to Email
                  </button>
                  <button type="button" class="btn btn-ghost small" onclick="TreatmentPlans.printCarePlan('${p.id}')" title="Print clinical care plan" style="border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600; white-space: nowrap; padding: 7px 14px; font-size: 0.82rem; background: #ffffff; color: #475569;">
                    <i class="fa-solid fa-print" style="margin-right: 5px;"></i> Print Plan
                  </button>
                  <button type="button" class="btn btn-ghost small" onclick="TreatmentPlans.deletePlan('${p.id}')" title="Delete treatment plan" style="border: 1px solid #fecaca; border-radius: 8px; font-weight: 600; white-space: nowrap; padding: 7px 12px; font-size: 0.82rem; background: #fff5f5; color: #dc2626;">
                    <i class="fa-solid fa-trash-can" style="margin-right: 4px;"></i> Delete
                  </button>
                </div>
              </div>

              <!-- Pillar 1: Diagnosis & Findings -->
              ${meta.diagnosis || teethPills ? `
                <div class="tp-pillar-card" style="background:#f8fafc; border-left:4px solid var(--primary-color);">
                  <div class="tp-pillar-title"><i class="fa-solid fa-stethoscope"></i> Clinical Diagnosis &amp; Oral Findings</div>
                  ${meta.diagnosis ? `<p style="margin:0 0 8px; font-size:0.88rem; color:#334155; line-height:1.5;">${esc(meta.diagnosis)}</p>` : ''}
                  ${teethPills ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;"><span style="font-size:0.75rem; font-weight:700; color:#475569;">Target Teeth / Sites:</span> ${teethPills}</div>` : ''}
                </div>
              ` : ''}

              <!-- Progress bar -->
              <div style="margin: 12px 0 14px;">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:#475569; margin-bottom:5px;">
                  <span>Stage Completion</span>
                  <span>${completedSteps}/${totalSteps} Done (${progressPct}%)</span>
                </div>
                <div style="height: 6px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
                  <div style="height: 100%; width: ${progressPct}%; background: linear-gradient(90deg, var(--primary-color), #059669); border-radius: 999px; transition: width 0.3s ease;"></div>
                </div>
              </div>

              <!-- Pillar 4: Cost Estimate Breakdown -->
              <div class="tp-finances-grid">
                <div class="tp-finance-cell cell-total">
                  <span class="tp-fin-lbl">Total Estimated Cost</span>
                  <span class="tp-fin-val">${formatMoney(totalFee)}</span>
                </div>
                <div class="tp-finance-cell cell-insurance">
                  <span class="tp-fin-lbl">Insurance / HMO Covered</span>
                  <span class="tp-fin-val">${insuranceCovered > 0 ? '-' + formatMoney(insuranceCovered) : '₱0.00'}</span>
                </div>
                <div class="tp-finance-cell cell-oop">
                  <span class="tp-fin-lbl">Patient Out-of-Pocket</span>
                  <span class="tp-fin-val">${formatMoney(outOfPocket)}</span>
                </div>
              </div>

              <!-- Pillar 5: Timeline & Staging -->
              ${meta.timeline || meta.visits_count ? `
                <div class="tp-timeline-box">
                  <strong style="display:block; margin-bottom:2px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">
                    <i class="fa-solid fa-clock-rotate-left"></i> Timeline &amp; Expected Visits: ${meta.visits_count || 1} Visit${(meta.visits_count || 1) > 1 ? 's' : ''}
                  </strong>
                  ${esc(meta.timeline || `${meta.visits_count || 1} clinical visits scheduled across treatment stages.`)}
                </div>
              ` : ''}

              <!-- Pillar 6: Alternatives Considered -->
              ${meta.alternatives ? `
                <div class="tp-alternatives-box">
                  <strong style="display:block; margin-bottom:2px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">
                    <i class="fa-solid fa-code-compare"></i> Treatment Alternatives Considered
                  </strong>
                  ${esc(meta.alternatives)}
                </div>
              ` : ''}
            </div>

            <!-- Pillars 2 & 3: Recommended Procedures & Sequence / Priority -->
            <div style="margin-top: 16px;">
              <div class="plan-items-title">
                <i class="fa-solid fa-list-ol"></i> Recommended Procedures &amp; Care Pathway (${totalSteps} Procedures)
              </div>
              <ul class="plan-items">
                ${itemsHtml || '<li class="muted" style="font-size:0.8rem; padding:6px 0;">No procedures assigned</li>'}
              </ul>
            </div>
          </div>`;
      }).join('');

      // Bind Mark Completed buttons
      listRoot.querySelectorAll('[data-item-done]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const itemId = btn.getAttribute('data-item-done');
          btn.disabled = true;
          btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;
          try {
            await api.put(`/treatment-plans/items/${itemId}`, { status: 'Completed' });
            load();
          } catch (err) {
            alert('Failed to update status: ' + err.message);
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-check"></i> Complete`;
          }
        });
      });
    } catch (err) {
      listRoot.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 24px; background: #fff5f5; border: 1px solid #fee2e2; border-radius: 12px; color: #b91c1c;">
          <h4 style="margin: 0 0 6px;"><i class="fa-solid fa-triangle-exclamation"></i> Error Loading Treatment Plans</h4>
          <p style="margin: 0; font-size: 0.88rem;">${esc(err.message)}</p>
        </div>`;
    }
  }

  function openCreate() {
    // Generate patient options
    const patOptions = (patients || []).map(p => {
      const pId = p.id || p.user_id || (p.user && p.user.id);
      const name = p.name || (p.user && p.user.name) || 'Patient';
      const phone = p.contact_number || p.phone || '';
      return `<option value="${pId}">${esc(name)}${phone ? ` (${esc(phone)})` : ''}</option>`;
    }).join('');

    // Generate procedure catalog options
    const treatOptions = (catalog || []).map(x => {
      const priceNum = Number(x.price || 0);
      const mins = x.duration_minutes || x.durationMinutes || 30;
      return `<option value="${x.id}" data-price="${priceNum}" data-duration="${mins}">${esc(x.name)} — ₱${priceNum.toLocaleString()} (${mins}m)</option>`;
    }).join('');

    Modal.open(`
      <div class="tp-modal-box" style="max-width: 920px;">
        <!-- Header -->
        <div class="tp-modal-header">
          <div class="tp-header-left">
            <div class="tp-header-icon">
              <i class="fa-solid fa-clipboard-check"></i>
            </div>
            <div>
              <h2 class="tp-modal-title">New Clinical Treatment Plan</h2>
              <p class="tp-modal-subtitle">Comprehensive 6-Pillar Care Plan: Diagnosis, Procedures, Priority Sequencing, Cost Breakdown, Timeline, &amp; Alternatives</p>
            </div>
          </div>
          <button type="button" class="tp-close-btn" onclick="Modal.close()" aria-label="Close modal">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="tp-modal-content" style="max-height: calc(85vh - 140px);">
          
          <!-- General Overview Card -->
          <div class="tp-section-card">
            <div class="tp-section-title">
              <i class="fa-solid fa-id-card-clip"></i> Patient &amp; Plan Identification
            </div>
            <div class="tp-grid-2">
              <div class="tp-form-group">
                <label for="np-patient">
                  <i class="fa-solid fa-user" style="color:var(--primary-color);"></i> Select Patient <span class="req">*</span>
                </label>
                <select id="np-patient" class="tp-input">
                  ${patOptions ? `<option value="" disabled selected>-- Select a Patient --</option>${patOptions}` : '<option value="" disabled>No patients registered</option>'}
                </select>
              </div>

              <div class="tp-form-group">
                <label for="np-name">
                  <i class="fa-solid fa-file-medical" style="color:var(--primary-color);"></i> Treatment Plan Name <span class="req">*</span>
                </label>
                <input id="np-name" class="tp-input" placeholder="e.g., Full Mouth Rehabilitation, Caries Control &amp; Ortho" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- PILLAR 1: Diagnosis & Clinical Findings -->
          <div class="tp-section-card">
            <div class="tp-section-title">
              <i class="fa-solid fa-stethoscope"></i> 1. Diagnosis &amp; Clinical Findings
            </div>
            <div class="tp-form-group">
              <label for="np-diagnosis">
                Clinical Pathology &amp; Issues Found <span class="req">*</span>
              </label>
              <textarea id="np-diagnosis" class="tp-input tp-textarea" rows="2" placeholder="e.g., Deep occlusal caries on #14 and #15 with reversible pulpitis; generalized moderate chronic gingivitis; missing #36 with mesial drift..."></textarea>
            </div>
            <div class="tp-form-group" style="margin-top: 10px;">
              <label for="np-teeth">
                <i class="fa-solid fa-tooth" style="color:var(--primary-color);"></i> Affected Teeth / Specific Sites
              </label>
              <input id="np-teeth" class="tp-input" placeholder="e.g., #14, #15, #36, Upper Right Quadrant, Sextant 2">
            </div>
          </div>

          <!-- PILLARS 2 & 3: Recommended Procedures & Priority Sequencing -->
          <div class="tp-section-card">
            <div class="tp-steps-header">
              <div>
                <div class="tp-section-title" style="margin-bottom: 2px;">
                  <i class="fa-solid fa-list-ol"></i> 2 &amp; 3. Recommended Procedures &amp; Priority Sequence
                </div>
                <p class="tp-steps-sub">Sequence urgent issues (pain, infection) first, followed by preventive, restorative, and cosmetic work.</p>
              </div>
              <button type="button" class="btn btn-secondary small" id="np-add-item" style="border-radius: 999px; padding: 6px 14px; font-weight: 700;">
                <i class="fa-solid fa-plus" style="margin-right: 4px;"></i> Add Procedure Step
              </button>
            </div>

            <!-- Steps List Container -->
            <div id="np-items"></div>
          </div>

          <!-- PILLAR 4: Cost Estimate & Insurance Breakdown -->
          <div class="tp-section-card">
            <div class="tp-section-title">
              <i class="fa-solid fa-coins"></i> 4. Cost Estimate &amp; Insurance Breakdown
            </div>
            <p class="tp-steps-sub" style="margin-top:-6px; margin-bottom:12px;">Real-time calculation broken down by insurance coverage vs. patient out-of-pocket payable.</p>
            
            <div class="tp-finances-grid">
              <div class="tp-finance-cell cell-total">
                <span class="tp-fin-lbl">Total Procedures Fee</span>
                <span class="tp-fin-val" id="tp-summary-total-fee">₱0.00</span>
              </div>
              <div class="tp-finance-cell cell-insurance">
                <span class="tp-fin-lbl">HMO / Insurance Covered</span>
                <span class="tp-fin-val" id="tp-summary-insurance-fee">₱0.00</span>
              </div>
              <div class="tp-finance-cell cell-oop">
                <span class="tp-fin-lbl">Patient Out-of-Pocket</span>
                <span class="tp-fin-val" id="tp-summary-oop-fee">₱0.00</span>
              </div>
            </div>
          </div>

          <!-- PILLAR 5: Timeline & Staging -->
          <div class="tp-section-card">
            <div class="tp-section-title">
              <i class="fa-solid fa-clock-rotate-left"></i> 5. Timeline &amp; Expected Visits
            </div>
            <div class="tp-grid-2">
              <div class="tp-form-group">
                <label for="np-visits-count">
                  <i class="fa-regular fa-calendar-check" style="color:var(--primary-color);"></i> Expected Number of Visits
                </label>
                <input id="np-visits-count" class="tp-input" type="number" min="1" max="20" value="3" placeholder="e.g., 3">
              </div>
              <div class="tp-form-group">
                <label for="np-timeline">
                  <i class="fa-solid fa-hourglass-half" style="color:var(--primary-color);"></i> Estimated Duration / Span
                </label>
                <input id="np-timeline" class="tp-input" placeholder="e.g., 3 visits across 2–3 weeks (~45-60 mins per session)">
              </div>
            </div>
          </div>

          <!-- PILLAR 6: Treatment Alternatives Considered -->
          <div class="tp-section-card">
            <div class="tp-section-title">
              <i class="fa-solid fa-code-compare"></i> 6. Treatment Alternatives Considered
            </div>
            <div class="tp-form-group">
              <label for="np-alternatives">
                Alternative Treatment Options &amp; Pros/Cons (e.g. Implant vs. Bridge)
              </label>
              <textarea id="np-alternatives" class="tp-input tp-textarea" rows="2" placeholder="e.g., Option A: 3-Unit Fixed Bridge (faster turnaround, lower upfront cost, crowns adjacent teeth 35 & 37) vs. Option B: Single Dental Implant on #36 (preserves adjacent teeth, 3-4 months osseointegration)..."></textarea>
            </div>
          </div>

          <div style="margin: 16px 0 8px; padding: 12px 16px; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 10px; display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="np-send-email" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
            <label for="np-send-email" style="margin: 0; font-size: 0.85rem; font-weight: 600; color: #115e59; cursor: pointer;">
              <i class="fa-solid fa-paper-plane" style="margin-right: 4px;"></i> Automatically send this treatment plan to patient's registered email
            </label>
          </div>

        </div>

        <!-- Footer -->
        <div class="tp-modal-footer">
          <button type="button" class="btn btn-secondary" onclick="Modal.close()">
            <i class="fa-solid fa-xmark"></i> Cancel
          </button>
          <button type="button" class="btn btn-primary" id="np-save">
            <i class="fa-solid fa-check"></i> Create Clinical Treatment Plan
          </button>
        </div>
      </div>
    `);

    const itemsWrap = document.getElementById('np-items');

    // Recalculate summary metrics across all steps
    function recalculateSummary() {
      const rows = itemsWrap.querySelectorAll('.tp-step-item-rich');
      let totalCost = 0;
      let totalInsurance = 0;
      let count = rows.length;

      rows.forEach((row, idx) => {
        // Update Step Pill badge
        const pill = row.querySelector('.tp-step-num-pill');
        if (pill) pill.textContent = `STEP ${(idx + 1).toString().padStart(2, '0')}`;

        // Get step price and insurance input
        const feeInput = row.querySelector('.np-fee');
        const insInput = row.querySelector('.np-ins');
        const oopBadge = row.querySelector('.np-oop-badge');

        const stepFee = parseFloat(feeInput ? feeInput.value : 0) || 0;
        const stepIns = parseFloat(insInput ? insInput.value : 0) || 0;
        const stepOop = Math.max(0, stepFee - stepIns);

        totalCost += stepFee;
        totalInsurance += stepIns;

        if (oopBadge) oopBadge.textContent = formatMoney(stepOop);

        // Update delete button disabled state if only 1 row
        const delBtn = row.querySelector('.tp-step-del-btn');
        if (delBtn) {
          if (count === 1) {
            delBtn.style.opacity = '0.35';
            delBtn.style.cursor = 'not-allowed';
            delBtn.title = 'At least one procedure step is required';
          } else {
            delBtn.style.opacity = '1';
            delBtn.style.cursor = 'pointer';
            delBtn.title = 'Remove procedure step';
          }
        }
      });

      const totalOop = Math.max(0, totalCost - totalInsurance);

      const totEl = document.getElementById('tp-summary-total-fee');
      const insEl = document.getElementById('tp-summary-insurance-fee');
      const oopEl = document.getElementById('tp-summary-oop-fee');

      if (totEl) totEl.textContent = formatMoney(totalCost);
      if (insEl) insEl.textContent = formatMoney(totalInsurance);
      if (oopEl) oopEl.textContent = formatMoney(totalOop);
    }

    // Add a new step row
    function addItemRow(initialData = {}) {
      const stepIdx = itemsWrap.children.length + 1;
      const row = document.createElement('div');
      row.className = 'tp-step-item-rich';

      const defaultFee = initialData.fee !== undefined ? initialData.fee : 0;
      const defaultIns = initialData.insurance_covered !== undefined ? initialData.insurance_covered : 0;
      const defaultTooth = initialData.tooth || '';
      const defaultPriority = initialData.priority || (stepIdx === 1 ? 'Urgent' : 'High Priority');
      const defaultVisit = initialData.visit || `Visit ${Math.min(stepIdx, 4)}`;

      row.innerHTML = `
        <div class="tp-step-header-bar">
          <div class="tp-step-left-meta">
            <div class="tp-step-num-pill" style="background:var(--primary-subtle); color:var(--primary-color); font-weight:800; padding:3px 8px; border-radius:6px; font-size:0.75rem;">
              STEP ${stepIdx.toString().padStart(2, '0')}
            </div>
            <label style="font-size:0.75rem; font-weight:700; color:#64748b;">Clinical Priority:</label>
            <select class="tp-input np-prio" style="width: auto; padding: 4px 8px; font-size: 0.78rem; height: 32px;">
              <option value="Urgent" ${defaultPriority === 'Urgent' ? 'selected' : ''}>🚨 Urgent (Pain / Infection / Emergency)</option>
              <option value="High Priority" ${defaultPriority === 'High Priority' ? 'selected' : ''}>⚠️ High Priority (Active Caries / Decay)</option>
              <option value="Preventive / Restorative" ${defaultPriority === 'Preventive / Restorative' ? 'selected' : ''}>🛡️ Preventive &amp; Restorative (Fillings, Crowns, Scaling)</option>
              <option value="Elective / Cosmetic" ${defaultPriority === 'Elective / Cosmetic' ? 'selected' : ''}>✨ Elective &amp; Cosmetic (Whitening, Veneers, Ortho)</option>
            </select>
          </div>
          <button type="button" class="tp-step-del-btn" title="Remove procedure step" style="width:30px; height:30px; border-radius:8px;">
            <i class="fa-solid fa-trash-can" style="font-size:0.8rem;"></i>
          </button>
        </div>

        <div class="tp-step-grid-fields">
          <div>
            <label class="tp-step-mini-label"><i class="fa-solid fa-tooth"></i> Procedure</label>
            <select class="tp-input np-treat">
              ${treatOptions || '<option value="">No treatments catalog</option>'}
            </select>
          </div>

          <div>
            <label class="tp-step-mini-label">Tooth # / Site</label>
            <input class="tp-input np-tooth" placeholder="e.g. #14, #15" value="${esc(defaultTooth)}">
          </div>

          <div>
            <label class="tp-step-mini-label">Target Visit</label>
            <input class="tp-input np-visit" placeholder="e.g. Visit 1" value="${esc(defaultVisit)}">
          </div>

          <div>
            <label class="tp-step-mini-label">Procedure Fee (₱)</label>
            <input class="tp-input np-fee" type="number" min="0" step="50" value="${defaultFee}">
          </div>

          <div style="text-align:center;">
            <label class="tp-step-mini-label">Seq</label>
            <input class="tp-input np-seq" type="number" min="1" max="99" value="${stepIdx}" style="text-align:center; padding: 10px 4px;">
          </div>
        </div>

        <div class="tp-step-notes-row">
          <div>
            <label class="tp-step-mini-label">Insurance / HMO Covered Portion (₱)</label>
            <input class="tp-input np-ins" type="number" min="0" step="50" value="${defaultIns}" placeholder="0.00">
          </div>
          <div>
            <label class="tp-step-mini-label">Patient Out-of-Pocket Share</label>
            <div style="background:#ecfdf5; border:1px solid #d1fae5; border-radius:10px; padding:9px 12px; font-weight:800; color:#065f46; font-size:0.9rem;" class="np-oop-badge">
              ₱0.00
            </div>
          </div>
        </div>

        <div>
          <label class="tp-step-mini-label">Clinical Specifics / Technique Notes</label>
          <input class="tp-input np-notes" placeholder="e.g., Deep occlusal caries, pulpectomy, temporary zinc oxide eugenol sedative filling..." value="${esc(initialData.notes || '')}">
        </div>
      `;

      // Select treatment dropdown handler
      const select = row.querySelector('.np-treat');
      const feeInput = row.querySelector('.np-fee');

      if (select) {
        if (initialData.treatment_id) select.value = initialData.treatment_id;
        else if (catalog.length > 0 && !defaultFee) {
          const first = select.options[select.selectedIndex];
          if (first && feeInput) feeInput.value = first.getAttribute('data-price') || 0;
        }

        select.addEventListener('change', () => {
          const opt = select.options[select.selectedIndex];
          if (opt && feeInput) {
            feeInput.value = opt.getAttribute('data-price') || 0;
          }
          recalculateSummary();
        });
      }

      // Input changes recalculate
      if (feeInput) feeInput.addEventListener('input', recalculateSummary);
      const insInput = row.querySelector('.np-ins');
      if (insInput) insInput.addEventListener('input', recalculateSummary);

      // Delete button
      const delBtn = row.querySelector('.tp-step-del-btn');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          if (itemsWrap.children.length <= 1) return;
          row.remove();
          recalculateSummary();
        });
      }

      itemsWrap.appendChild(row);
      recalculateSummary();
    }

    // Initialize with 1 default row
    addItemRow();

    // Add Step button handler
    const addBtn = document.getElementById('np-add-item');
    if (addBtn) {
      addBtn.addEventListener('click', () => addItemRow());
    }

    // Save treatment plan button handler
    const saveBtn = document.getElementById('np-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const patientSelect = document.getElementById('np-patient');
        const patientId = patientSelect ? patientSelect.value : '';
        const nameInput = document.getElementById('np-name');
        const name = nameInput ? nameInput.value.trim() : '';

        const diagInput = document.getElementById('np-diagnosis');
        const diagnosis = diagInput ? diagInput.value.trim() : '';
        const teethInput = document.getElementById('np-teeth');
        const affectedTeeth = teethInput ? teethInput.value.trim() : '';
        const visitsInput = document.getElementById('np-visits-count');
        const visitsCount = parseInt(visitsInput ? visitsInput.value : '3', 10) || 3;
        const timeInput = document.getElementById('np-timeline');
        const timeline = timeInput ? timeInput.value.trim() : '';
        const altInput = document.getElementById('np-alternatives');
        const alternatives = altInput ? altInput.value.trim() : '';

        if (!patientId) {
          alert('Please select a patient for this treatment plan.');
          patientSelect.focus();
          return;
        }

        if (!name) {
          alert('Please enter a plan title (e.g. "Full Mouth Rehabilitation & Caries Control").');
          nameInput.focus();
          return;
        }

        if (!diagnosis) {
          alert('Please enter clinical diagnosis / findings (Pillar 1).');
          diagInput.focus();
          return;
        }

        const stepRows = itemsWrap.querySelectorAll('.tp-step-item-rich');
        if (!stepRows.length) {
          alert('Please include at least one clinical procedure in this plan.');
          return;
        }

        let totalCost = 0;
        let totalInsurance = 0;
        const stepsPayload = [];

        for (const row of stepRows) {
          const select = row.querySelector('.np-treat');
          const tid = select ? select.value : null;
          const seq = parseInt(row.querySelector('.np-seq').value, 10) || 1;
          const tooth = row.querySelector('.np-tooth') ? row.querySelector('.np-tooth').value.trim() : '';
          const priority = row.querySelector('.np-prio') ? row.querySelector('.np-prio').value : 'Normal';
          const visit = row.querySelector('.np-visit') ? row.querySelector('.np-visit').value.trim() : 'Visit 1';
          const fee = parseFloat(row.querySelector('.np-fee') ? row.querySelector('.np-fee').value : 0) || 0;
          const insuranceCovered = parseFloat(row.querySelector('.np-ins') ? row.querySelector('.np-ins').value : 0) || 0;
          const oop = Math.max(0, fee - insuranceCovered);
          const rawNotes = row.querySelector('.np-notes') ? row.querySelector('.np-notes').value.trim() : '';

          if (!tid) {
            alert('Please select a valid procedure for all steps.');
            return;
          }

          totalCost += fee;
          totalInsurance += insuranceCovered;

          // Serialize rich step metadata
          const stepMetaJson = JSON.stringify({
            tooth,
            priority,
            fee,
            insurance_covered: insuranceCovered,
            out_of_pocket: oop,
            visit,
            notes: rawNotes
          });

          stepsPayload.push({
            treatment_id: tid,
            treatment_name: select.options[select.selectedIndex]?.text.split('—')[0].trim() || 'Dental Procedure',
            sequence: seq,
            notes: stepMetaJson
          });
        }

        const netOop = Math.max(0, totalCost - totalInsurance);

        // Serialize rich 6-pillar description
        const planDescriptionJson = JSON.stringify({
          diagnosis,
          affected_teeth: affectedTeeth,
          priority: stepsPayload[0]?.priority || 'Urgent',
          visits_count: visitsCount,
          timeline: timeline || `${visitsCount} clinical visits scheduled across treatment stages.`,
          total_fee: totalCost,
          insurance_coverage: totalInsurance,
          out_of_pocket: netOop,
          alternatives: alternatives || 'No alternative options indicated.'
        });

        const shouldAutoEmail = document.getElementById('np-send-email')?.checked;

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving 6-Pillar Care Plan...`;

        try {
          const plan = await api.post('/treatment-plans', {
            patient_id: patientId,
            name,
            description: planDescriptionJson,
            total_estimated_cost: totalCost,
            status: 'Active'
          });

          // Insert all items sequentially
          for (const item of stepsPayload) {
            await api.post(`/treatment-plans/${plan.id}/items`, item);
          }

          if (shouldAutoEmail) {
            try {
              saveBtn.innerHTML = `<i class="fa-solid fa-paper-plane fa-spin"></i> Sending to Patient Email...`;
              await api.post(`/treatment-plans/${plan.id}/send-email`);
            } catch (emailErr) {
              console.warn('Auto email warning:', emailErr);
            }
          }

          Modal.close();
          load();
        } catch (err) {
          alert('Failed to save treatment plan: ' + err.message);
          saveBtn.disabled = false;
          saveBtn.innerHTML = `<i class="fa-solid fa-check"></i> Create Clinical Treatment Plan`;
        }
      });
    }
  }

  // Email care plan directly to patient
  async function emailCarePlan(planId) {
    const btn = document.getElementById(`btn-email-plan-${planId}`);
    let oldContent = '';
    if (btn) {
      oldContent = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...`;
    }
    try {
      const res = await api.post(`/treatment-plans/${planId}/send-email`);
      alert(res.message || 'Treatment plan emailed successfully to patient!');
    } catch (err) {
      alert('Could not send email: ' + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldContent;
      }
    }
  }

  // Delete treatment plan
  async function deletePlan(planId) {
    if (!confirm('Are you sure you want to delete this clinical treatment plan?')) {
      return;
    }
    try {
      await api.del(`/treatment-plans/${planId}`);
      load();
    } catch (err) {
      alert('Failed to delete treatment plan: ' + (err.message || err));
    }
  }

  // Clinical printable plan function
  function printCarePlan(planId) {
    window.open(`../scratch/print_care_plan.html?planId=${planId}`, '_blank') || window.print();
  }

  return {
    init(opts) {
      listRoot = opts.listRoot;
    },
    load,
    openCreate,
    printCarePlan,
    emailCarePlan,
    deletePlan,
    parsePlanMetadata,
    parseItemMetadata,
    formatMoney
  };
})();

window.TreatmentPlans = TreatmentPlans;

