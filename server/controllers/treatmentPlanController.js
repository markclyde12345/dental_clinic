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

module.exports = {
  getTreatmentPlans,
  getTreatmentPlan,
  createTreatmentPlan,
  addTreatmentPlanItem,
  updateTreatmentPlanItem
};
