const supabase = require('../config/db');

// @desc    List treatment plans (optionally filtered by patient)
// @route   GET /api/treatment-plans?patientId=...
// @access  Private
const getTreatmentPlans = async (req, res) => {
  try {
    let query = supabase
      .from('treatment_plans')
      .select(`
        id, name, description, total_estimated_cost, status, created_at, updated_at,
        patient:patient_id ( id, name ),
        dentist:dentist_id ( id, name ),
        items:treatment_plan_items ( id, treatment_name, sequence, status, notes )
      `);

    if (req.query.patientId) {
      query = query.eq('patient_id', req.query.patientId);
    }
    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single treatment plan with items
// @route   GET /api/treatment-plans/:id
// @access  Private
const getTreatmentPlan = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('treatment_plans')
      .select(`
        id, name, description, total_estimated_cost, status, created_at, updated_at,
        patient:patient_id ( id, name ),
        dentist:dentist_id ( id, name ),
        items:treatment_plan_items ( id, treatment_id, treatment_name, sequence, status, notes )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Treatment plan not found.' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a treatment plan
// @route   POST /api/treatment-plans
// @access  Private (Dentist / Receptionist)
const createTreatmentPlan = async (req, res) => {
  const { patient_id, patientId, name, description, total_estimated_cost, status } = req.body;
  try {
    const { data, error } = await supabase
      .from('treatment_plans')
      .insert([{
        patient_id: patient_id || patientId,
        dentist_id: req.user.id,
        name,
        description,
        total_estimated_cost: total_estimated_cost || 0,
        status: status || 'Draft'
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add an item to a treatment plan
// @route   POST /api/treatment-plans/:id/items
// @access  Private (Dentist / Receptionist)
const addTreatmentPlanItem = async (req, res) => {
  const { id } = req.params;
  const { treatment_id, treatmentId, treatment_name, sequence, status, notes } = req.body;

  try {
    let name = treatment_name || null;
    if (treatment_id || treatmentId) {
      const { data: t } = await supabase
        .from('treatments')
        .select('name')
        .eq('id', treatment_id || treatmentId)
        .maybeSingle();
      if (t) name = t.name;
    }

    const { data, error } = await supabase
      .from('treatment_plan_items')
      .insert([{
        plan_id: id,
        treatment_id: treatment_id || treatmentId || null,
        treatment_name: name,
        sequence: sequence || 1,
        status: status || 'Pending',
        notes
      }])
      .select()
      .single();

    if (error) throw error;

    // Keep the plan's estimated total in sync
    await recomputePlanTotal(id);

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a treatment plan item
// @route   PUT /api/treatment-plans/items/:id
// @access  Private (Dentist / Receptionist)
const updateTreatmentPlanItem = async (req, res) => {
  const { id } = req.params;
  const { sequence, status, notes, treatment_name } = req.body;
  try {
    const updateFields = {};
    if (sequence !== undefined) updateFields.sequence = sequence;
    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;
    if (treatment_name !== undefined) updateFields.treatment_name = treatment_name;

    const { data, error } = await supabase
      .from('treatment_plan_items')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Item not found.' });

    if (status !== undefined) {
      const { data: item } = await supabase
        .from('treatment_plan_items')
        .select('plan_id')
        .eq('id', id)
        .maybeSingle();
      if (item) await recomputePlanTotal(item.plan_id);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper: sum treatment prices for a plan's items
const recomputePlanTotal = async (planId) => {
  try {
    const { data: items } = await supabase
      .from('treatment_plan_items')
      .select('treatment_id, sequence')
      .eq('plan_id', planId);

    if (!items || items.length === 0) return;

    let total = 0;
    for (const item of items) {
      if (item.treatment_id) {
        const { data: t } = await supabase
          .from('treatments')
          .select('price')
          .eq('id', item.treatment_id)
          .maybeSingle();
        if (t) total += Number(t.price) || 0;
      }
    }

    await supabase
      .from('treatment_plans')
      .update({ total_estimated_cost: total, updated_at: new Date().toISOString() })
      .eq('id', planId);
  } catch (err) {
    console.error('[recomputePlanTotal]', err.message);
  }
};

// @desc    Delete a treatment plan
// @route   DELETE /api/treatment-plans/:id
// @access  Private (Dentist / Receptionist / Admin)
const deleteTreatmentPlan = async (req, res) => {
  const { id } = req.params;
  try {
    const { error: itemsErr } = await supabase
      .from('treatment_plan_items')
      .delete()
      .eq('plan_id', id);

    if (itemsErr) console.warn('[deleteTreatmentPlan items error]', itemsErr.message);

    const { error } = await supabase
      .from('treatment_plans')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Treatment plan deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

function formatFriendlyToothName(str) {
  if (!str) return '';
  const clean = String(str).trim();
  const digits = clean.match(/\d+/);
  if (digits && DENTIST_TOOTH_MAP[digits[0]]) {
    return DENTIST_TOOTH_MAP[digits[0]];
  }
  return clean.startsWith('#') ? `Tooth ${clean}` : `Tooth #${clean}`;
}

function parsePlanMeta(rawDesc) {
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
      return { ...def, ...JSON.parse(str) };
    } catch (e) {}
  }
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

function parseItemMeta(rawNotes, defaultPrice = 0) {
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
      return { ...def, ...JSON.parse(str) };
    } catch (e) {}
  }
  const tMatch = str.match(/\[Tooth:\s*([^\]]+)\]/i);
  const pMatch = str.match(/\[Priority:\s*([^\]]+)\]/i);
  const insMatch = str.match(/\[Insurance:\s*([^\]]+)\]/i);
  const oopMatch = str.match(/\[OOP:\s*([^\]]+)\]/i);
  const vMatch = str.match(/\[Visit:\s*([^\]]+)\]/i);

  if (tMatch) def.tooth = tMatch[1];
  if (pMatch) def.priority = pMatch[1];
  if (insMatch) def.insurance_covered = parseFloat(insMatch[1].replace(/[^0-9.]/g, '')) || 0;
  if (oopMatch) def.out_of_pocket = parseFloat(oopMatch[1].replace(/[^0-9.]/g, '')) || 0;
  if (vMatch) def.visit = vMatch[1];
  def.notes = str.replace(/\[[^\]]+\]/g, '').trim();
  return def;
}

// @desc    Email a treatment plan directly to the patient's registered email
// @route   POST /api/treatment-plans/:id/send-email
// @access  Private (Dentist / Receptionist / Admin)
const sendTreatmentPlanEmail = async (req, res) => {
  const { id } = req.params;
  const sendEmail = require('../utils/emailService');

  try {
    const { data: plan, error } = await supabase
      .from('treatment_plans')
      .select(`
        id, name, description, total_estimated_cost, status, created_at, updated_at,
        patient_id, dentist_id,
        patient:patient_id ( id, name, email ),
        dentist:dentist_id ( id, name, email ),
        items:treatment_plan_items ( id, treatment_id, treatment_name, sequence, status, notes )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!plan) return res.status(404).json({ message: 'Treatment plan not found.' });

    // Fallback patient lookup if join didn't populate email
    let patient = plan.patient;
    if (!patient || !patient.email) {
      const { data: u } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', plan.patient_id)
        .maybeSingle();
      if (u) patient = u;
    }

    if (!patient || !patient.email) {
      return res.status(400).json({
        message: 'Patient does not have a registered email address on file.'
      });
    }

    // Resolve dentist
    let dentist = plan.dentist;
    if (!dentist || !dentist.name) {
      if (plan.dentist_id) {
        const { data: d } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', plan.dentist_id)
          .maybeSingle();
        if (d) dentist = d;
      }
    }
    const dentistName = dentist?.name
      ? (dentist.name.toLowerCase().startsWith('dr.') ? dentist.name : `Dr. ${dentist.name}`)
      : 'Dr. Clyde Castillo';

    const meta = parsePlanMeta(plan.description);
    const sortedItems = (plan.items || []).sort((a, b) => (a.sequence || 1) - (b.sequence || 1));

    const formatMoney = (n) => '₱' + (Number(n) || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let computedTotalFee = 0;
    let computedInsCovered = 0;
    let computedOop = 0;

    const parsedItems = sortedItems.map((item, idx) => {
      const im = parseItemMeta(item.notes);
      const fee = Number(im.fee) || 0;
      const ins = Number(im.insurance_covered) || 0;
      const oop = Number(im.out_of_pocket) || Math.max(0, fee - ins);

      computedTotalFee += fee;
      computedInsCovered += ins;
      computedOop += oop;

      return {
        stepNumber: item.sequence || idx + 1,
        treatment_name: item.treatment_name || 'Clinical Treatment',
        tooth: formatFriendlyToothName(im.tooth),
        rawTooth: im.tooth,
        priority: im.priority || 'Normal',
        visit: im.visit || `Visit ${idx + 1}`,
        notes: im.notes,
        status: item.status || 'Pending',
        fee,
        insurance_covered: ins,
        out_of_pocket: oop
      };
    });

    // Use plan total if computed was 0
    const finalTotalFee = meta.total_fee || computedTotalFee || Number(plan.total_estimated_cost) || 0;
    const finalInsCovered = meta.insurance_coverage || computedInsCovered || 0;
    const finalOop = meta.out_of_pocket || (finalTotalFee > finalInsCovered ? finalTotalFee - finalInsCovered : computedOop || finalTotalFee);

    // Format target teeth badges
    const rawTeethList = (meta.affected_teeth || '')
      .split(/[,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const teethHtml = rawTeethList.length > 0
      ? rawTeethList.map(t => `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:600;margin:2px 4px 2px 0;">${formatFriendlyToothName(t)}</span>`).join('')
      : '<span style="color:#64748b;font-size:13px;">As indicated in procedural steps below</span>';

    // Format items table rows
    const itemsRows = parsedItems.map(it => `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:12px 10px;font-size:13px;color:#0b3c4d;font-weight:700;text-align:center;">${it.stepNumber}</td>
        <td style="padding:12px 10px;font-size:13px;color:#1e293b;">
          <strong>${it.treatment_name}</strong>
          ${it.tooth ? `<div style="font-size:12px;color:#0284c7;margin-top:2px;">📍 ${it.tooth}</div>` : ''}
          ${it.notes ? `<div style="font-size:12px;color:#64748b;margin-top:2px;font-style:italic;">${it.notes}</div>` : ''}
        </td>
        <td style="padding:12px 10px;font-size:12px;color:#475569;text-align:center;">${it.visit}</td>
        <td style="padding:12px 10px;font-size:12px;text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${it.priority === 'Urgent' ? '#fee2e2;color:#991b1b;' : '#f1f5f9;color:#475569;'}">${it.priority}</span>
        </td>
        <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0b3c4d;text-align:right;">${formatMoney(it.fee)}</td>
      </tr>
    `).join('');

    const formattedDate = new Date(plan.created_at || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const emailSubject = `🦷 Clinical Treatment Plan: ${plan.name} — Fano Dental Clinic`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${emailSubject}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;" cellspacing="0" cellpadding="0">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:#0b3c4d;padding:32px 30px;text-align:center;">
              <h1 style="margin:0 0 6px 0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">Fano Dental Clinic</h1>
              <p style="margin:0;color:#99f6e4;font-size:13px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;">Official Clinical Treatment &amp; Care Plan</p>
            </td>
          </tr>

          <!-- Intro / Greeting -->
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <p style="margin:0 0 14px 0;font-size:16px;color:#0f172a;">Dear <strong>${patient.name || 'Valued Patient'}</strong>,</p>
              <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#475569;">
                <strong>${dentistName}</strong> has prepared your personalized <strong>Clinical Treatment Plan</strong> following your comprehensive oral examination.
                This document serves as your complete digital care pathway, outlining the clinical diagnosis, sequence of recommended procedures, estimated appointments, and financial breakdown.
              </p>

              <!-- Treatment Plan Header Box -->
              <table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:16px 20px;margin-bottom:24px;" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Care Plan Summary</div>
                    <div style="font-size:18px;font-weight:800;color:#0b3c4d;margin:4px 0 8px 0;">${plan.name}</div>
                    <table width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="font-size:12px;color:#475569;">
                          <strong>Date Issued:</strong> ${formattedDate}
                        </td>
                        <td style="font-size:12px;color:#475569;text-align:right;">
                          <strong>Clinical Priority:</strong> 
                          <span style="font-weight:700;color:${meta.priority === 'Urgent' ? '#b91c1c' : '#047857'};">${meta.priority || 'Standard'}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Pillar 1: Diagnosis & Oral Findings -->
              <div style="margin-bottom:24px;border-left:4px solid #0b3c4d;background:#f0fdfa;padding:14px 18px;border-radius:0 8px 8px 0;">
                <div style="font-size:13px;font-weight:700;color:#0f766e;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.5px;">
                  🩺 Clinical Diagnosis &amp; Oral Findings
                </div>
                <p style="margin:0 0 8px 0;font-size:13px;color:#1e293b;line-height:1.5;">
                  ${meta.diagnosis || 'Clinical evaluation and diagnostic assessment completed by attending dental specialist.'}
                </p>
                <div style="margin-top:6px;">
                  <span style="font-size:12px;font-weight:700;color:#047857;margin-right:6px;">Target Teeth / Sites:</span>
                  ${teethHtml}
                </div>
              </div>

              <!-- Pillars 2 & 3: Recommended Procedures & Staging Table -->
              <div style="margin-bottom:24px;">
                <div style="font-size:14px;font-weight:800;color:#0b3c4d;margin-bottom:12px;">
                  📋 Recommended Procedures &amp; Staging (${parsedItems.length} Step${parsedItems.length === 1 ? '' : 's'})
                </div>
                <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                  <thead>
                    <tr style="background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
                      <th style="padding:10px 8px;text-align:center;width:32px;">#</th>
                      <th style="padding:10px 8px;text-align:left;">Procedure &amp; Site</th>
                      <th style="padding:10px 8px;text-align:center;width:70px;">Visit</th>
                      <th style="padding:10px 8px;text-align:center;width:65px;">Priority</th>
                      <th style="padding:10px 8px;text-align:right;width:85px;">Est. Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsRows || '<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8;font-size:13px;">No procedure steps itemized.</td></tr>'}
                  </tbody>
                </table>
              </div>

              <!-- Pillar 4: Financial Summary & Out-of-Pocket Estimate -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                    <strong style="color:#0b3c4d;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">💵 Financial Estimate Breakdown</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;">
                    <table width="100%" cellspacing="0" cellpadding="4">
                      <tr>
                        <td style="font-size:13px;color:#64748b;">Total Estimated Treatment Cost:</td>
                        <td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${formatMoney(finalTotalFee)}</td>
                      </tr>
                      ${finalInsCovered > 0 ? `
                      <tr>
                        <td style="font-size:13px;color:#059669;">Estimated Insurance / HMO Coverage:</td>
                        <td style="font-size:13px;font-weight:700;color:#059669;text-align:right;">-${formatMoney(finalInsCovered)}</td>
                      </tr>
                      ` : ''}
                      <tr style="border-top:2px solid #cbd5e1;">
                        <td style="font-size:14px;font-weight:800;color:#0b3c4d;padding-top:8px;">Estimated Out-of-Pocket Total:</td>
                        <td style="font-size:16px;font-weight:800;color:#0b3c4d;text-align:right;padding-top:8px;">${formatMoney(finalOop)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Pillar 5 & 6: Timeline & Alternatives -->
              ${meta.timeline || meta.visits_count || meta.alternatives ? `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                  ${meta.timeline || meta.visits_count ? `
                    <tr>
                      <td style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;">
                        <strong style="color:#0b3c4d;display:block;margin-bottom:3px;">⏱️ Timeline &amp; Recommended Visits:</strong>
                        ${meta.timeline || `${meta.visits_count || 1} clinical visits scheduled across planned treatment stages.`}
                      </td>
                    </tr>
                    <tr><td style="height:10px;"></td></tr>
                  ` : ''}
                  ${meta.alternatives ? `
                    <tr>
                      <td style="padding:10px 14px;background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;font-size:13px;color:#92400e;">
                        <strong style="color:#b45309;display:block;margin-bottom:3px;">💡 Alternatives Considered:</strong>
                        ${meta.alternatives}
                      </td>
                    </tr>
                  ` : ''}
                </table>
              ` : ''}

              <!-- Clinical Advisory Note -->
              <div style="background:#f8fafc;border-radius:8px;padding:12px 16px;font-size:11px;color:#64748b;line-height:1.5;margin-bottom:24px;border:1px dashed #cbd5e1;">
                <strong>Clinical Note:</strong> This treatment plan is a clinical estimate based on examination and diagnostics. Actual procedures and costs may vary depending on patient clinical response and dental findings during care.
              </div>

              <!-- Attending Dentist Signature -->
              <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;color:#475569;">
                <div>Best regards,</div>
                <div style="font-weight:700;color:#0b3c4d;font-size:14px;margin-top:4px;">${dentistName}</div>
                <div style="font-size:12px;color:#64748b;">Dental Specialist &bull; Fano Dental Clinic</div>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#0b3c4d;font-weight:700;">Fano Dental Clinic</p>
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                📍 123 Dental Street, Your City, Philippines<br>
                📞 (02) 8-XXX-XXXX &nbsp;|&nbsp; ✉️ ${process.env.GMAIL_USER || 'clinic@fanodental.com'}<br>
                <span style="font-size:11px;">Treatment plans are delivered directly to your registered email for your privacy and records.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const plainText = `
Fano Dental Clinic — Clinical Treatment Plan
=============================================
Plan: ${plan.name}
Date: ${formattedDate}
Patient: ${patient.name}
Attending Dentist: ${dentistName}
Priority: ${meta.priority || 'Standard'}

CLINICAL DIAGNOSIS & FINDINGS:
${meta.diagnosis || 'Clinical evaluation completed.'}
Target Teeth: ${rawTeethList.map(t => formatFriendlyToothName(t)).join(', ') || 'As itemized below'}

RECOMMENDED PROCEDURES:
${parsedItems.map(it => `${it.stepNumber}. ${it.treatment_name} | ${it.tooth || 'General'} | ${it.visit} | Priority: ${it.priority} | Fee: ${formatMoney(it.fee)}`).join('\n')}

FINANCIAL BREAKDOWN:
- Total Estimated Cost: ${formatMoney(finalTotalFee)}
- Insurance/HMO Coverage: -${formatMoney(finalInsCovered)}
- Net Patient Out-of-Pocket: ${formatMoney(finalOop)}

TIMELINE & VISITS:
${meta.timeline || `${meta.visits_count || 1} clinical visits scheduled.`}

Fano Dental Clinic
123 Dental Street, Your City, Philippines
(02) 8-XXX-XXXX
    `.trim();

    const emailSent = await sendEmail(patient.email, emailSubject, htmlContent, plainText);

    if (emailSent) {
      console.log(`📧 [Treatment Plan] Sent care plan "${plan.name}" to ${patient.email}`);
      return res.json({
        success: true,
        message: `Treatment plan successfully sent to ${patient.email}`
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Could not deliver email. Please verify mail server configuration.'
      });
    }

  } catch (err) {
    console.error('[sendTreatmentPlanEmail error]:', err);
    return res.status(500).json({ message: err.message || 'Server error sending email.' });
  }
};

module.exports = {
  getTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  addTreatmentPlanItem,
  updateTreatmentPlanItem,
  deleteTreatmentPlan,
  sendTreatmentPlanEmail
};

