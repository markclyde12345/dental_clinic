const supabase = require('../config/db');

// @desc    Get all available treatments (services catalog)
// @route   GET /api/treatments
// @access  Public / Private
const getTreatments = async (req, res) => {
  try {
    const { data: treatments, error } = await supabase
      .from('treatments')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(treatments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add treatment service
// @route   POST /api/treatments
// @access  Private (Admin / Dentist)
const addTreatment = async (req, res) => {
  const { name, description, price, duration_minutes, durationMinutes, is_active } = req.body;
  try {
    const { data: treatment, error } = await supabase
      .from('treatments')
      .insert([{
        name,
        description,
        price,
        duration_minutes: duration_minutes || durationMinutes || 30,
        is_active: is_active !== undefined ? is_active : true
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(treatment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete treatment service
// @route   DELETE /api/treatments/:id
// @access  Private (Admin / Dentist)
const deleteTreatment = async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('treatments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'Treatment service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTreatments, addTreatment, deleteTreatment };
