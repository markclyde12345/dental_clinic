const supabase = require('../config/db');

// @desc    List prescriptions for an appointment
// @route   GET /api/appointments/:id/prescriptions
// @access  Private
const getAppointmentPrescriptions = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('appointment_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    List all prescriptions for a patient
// @route   GET /api/patients/:id/prescriptions
// @access  Private (Dentist / Receptionist / Patient owner)
const getPatientPrescriptions = async (req, res) => {
  const { id } = req.params;
  try {
    let query = supabase
      .from('prescriptions')
      .select('*, appointment:appointment_id ( id, appointment_date )')
      .eq('patient_id', id)
      .order('created_at', { ascending: false });

    if (req.user.role === 'Patient') {
      query = query.eq('patient_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a prescription during an appointment
// @route   POST /api/appointments/:id/prescriptions
// @access  Private (Dentist / Dental Assistant)
const addPrescription = async (req, res) => {
  const { id } = req.params;
  const { patient_id, patientId, medication, dosage, frequency, duration, instructions } = req.body;

  try {
    // Resolve patient from the appointment if not provided
    let patientUuid = patient_id || patientId;
    if (!patientUuid) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('patient_id')
        .eq('id', id)
        .maybeSingle();
      patientUuid = appt ? appt.patient_id : null;
    }

    if (!patientUuid) {
      return res.status(400).json({ message: 'Unable to resolve patient for this appointment.' });
    }

    const { data, error } = await supabase
      .from('prescriptions')
      .insert([{
        appointment_id: id,
        patient_id: patientUuid,
        dentist_id: req.user.id,
        medication,
        dosage,
        frequency,
        duration,
        instructions
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAppointmentPrescriptions,
  getPatientPrescriptions,
  addPrescription
};
