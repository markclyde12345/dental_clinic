const supabase = require('../config/db');

// @desc    List treatments performed in an appointment
// @route   GET /api/appointments/:id/treatments
// @access  Private
const getAppointmentTreatments = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('appointment_treatments')
      .select('*')
      .eq('appointment_id', id)
      .order('performed_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a treatment performed during an appointment
// @route   POST /api/appointments/:id/treatments
// @access  Private (Dentist / Dental Assistant)
const addAppointmentTreatment = async (req, res) => {
  const { id } = req.params;
  const { treatment_id, treatmentId, treatment_name, quantity, price_at_time, notes } = req.body;

  try {
    // Resolve treatment catalog info when an id is supplied
    let name = treatment_name || null;
    let price = price_at_time !== undefined ? price_at_time : 0;

    if (treatment_id || treatmentId) {
      const { data: t, error: tErr } = await supabase
        .from('treatments')
        .select('name, price')
        .eq('id', treatment_id || treatmentId)
        .maybeSingle();
      if (tErr) throw tErr;
      if (t) {
        name = t.name;
        if (price === 0) price = t.price;
      }
    }

    const { data, error } = await supabase
      .from('appointment_treatments')
      .insert([{
        appointment_id: id,
        treatment_id: treatment_id || treatmentId || null,
        treatment_name: name,
        quantity: quantity || 1,
        price_at_time: price,
        notes
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a performed-treatment record
// @route   PUT /api/appointment-treatments/:id
// @access  Private (Dentist / Dental Assistant)
const updateAppointmentTreatment = async (req, res) => {
  const { id } = req.params;
  const { quantity, price_at_time, notes, treatment_name } = req.body;
  try {
    const updateFields = {};
    if (quantity !== undefined) updateFields.quantity = quantity;
    if (price_at_time !== undefined) updateFields.price_at_time = price_at_time;
    if (notes !== undefined) updateFields.notes = notes;
    if (treatment_name !== undefined) updateFields.treatment_name = treatment_name;

    const { data, error } = await supabase
      .from('appointment_treatments')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Record not found.' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a performed-treatment record
// @route   DELETE /api/appointment-treatments/:id
// @access  Private (Dentist / Dental Assistant)
const deleteAppointmentTreatment = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('appointment_treatments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Treatment record removed.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAppointmentTreatments,
  addAppointmentTreatment,
  updateAppointmentTreatment,
  deleteAppointmentTreatment
};
