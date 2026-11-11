const supabase = require('../config/db');

// @desc    Get clinical notes for an appointment
// @route   GET /api/appointments/:id/notes
// @access  Private (Dentist / Dental Assistant)
const getClinicalNotes = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, notes, patient_id')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Appointment not found.' });

    if (req.user && req.user.role === 'Patient' && String(data.patient_id) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to view clinical notes for this appointment.' });
    }

    res.json({ id: data.id, clinical_notes: data.notes || '', notes: data.notes || '' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Save clinical (SOAP) notes for an appointment
// @route   PUT /api/appointments/:id/notes
// @access  Private (Dentist / Dental Assistant)
const saveClinicalNotes = async (req, res) => {
  const { id } = req.params;
  const { clinical_notes, clinicalNotes, notes } = req.body;
  const value = clinical_notes !== undefined ? clinical_notes : (clinicalNotes !== undefined ? clinicalNotes : notes);

  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({ notes: value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, notes')
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: 'Appointment not found.' });

    res.json({ id: data.id, clinical_notes: data.notes, notes: data.notes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getClinicalNotes, saveClinicalNotes };

