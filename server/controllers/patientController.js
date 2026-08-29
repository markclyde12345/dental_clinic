const supabase = require('../config/db');

// @desc    Get all patient profiles
// @route   GET /api/patients
// @access  Private (Admin, Receptionist, Dentist)
const getPatients = async (req, res) => {
  try {
    const { data: patients, error } = await supabase
      .from('patient_profiles')
      .select(`
        id, date_of_birth, gender, blood_type, allergies, medical_notes, created_at,
        user:user_id ( id, name, email, contact_number, address )
      `);

    if (error) throw error;

    // Map properties for UI compatibility if needed
    const mapped = patients.map(p => ({
      ...p,
      dob: p.date_of_birth,
      medicalHistory: p.medical_notes,
      address: p.user ? p.user.address : null
    }));

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create patient profile
// @route   POST /api/patients
// @access  Private
const createPatientProfile = async (req, res) => {
  const { dob, date_of_birth, gender, bloodType, blood_type, allergies, medicalHistory, medicalNotes, medical_notes } = req.body;
  try {
    // Check if profile already exists
    const { data: profileExists } = await supabase
      .from('patient_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (profileExists) {
      return res.status(400).json({ message: 'Profile already exists' });
    }

    // Format allergies as PostgreSQL array if it comes as a string or comma-separated list
    let allergiesArray = [];
    if (Array.isArray(allergies)) {
      allergiesArray = allergies;
    } else if (typeof allergies === 'string') {
      allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
    }

    const { data: profile, error } = await supabase
      .from('patient_profiles')
      .insert([{
        user_id: req.user.id,
        date_of_birth: date_of_birth || dob,
        gender,
        blood_type: blood_type || bloodType,
        allergies: allergiesArray,
        medical_notes: medical_notes || medicalNotes || medicalHistory
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get total count of registered patients
// @route   GET /api/patients/count
// @access  Public
const getPatientCount = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'Patient');

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get a single patient with full history (profile, appointments, Rx, plans)
// @route   GET /api/patients/:id/history
// @access  Private (Admin, Receptionist, Dentist, Dental Assistant, Patient owner)
const getPatientWithHistory = async (req, res) => {
  const { id } = req.params;
  try {
    // Profile + demographics
    const { data: profile, error: pErr } = await supabase
      .from('patient_profiles')
      .select(`
        id, date_of_birth, gender, blood_type, allergies, medical_notes, created_at,
        user:user_id ( id, name, email, contact_number, address )
      `)
      .eq('user_id', id)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!profile) {
      return res.status(404).json({ message: 'Patient profile not found.' });
    }

    // Appointments
    const { data: appointments, error: aErr } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        treatment:treatment_id ( id, name, price )
      `)
      .eq('patient_id', id)
      .order('appointment_date', { ascending: false });

    if (aErr) throw aErr;

    // Prescriptions (return empty array if table not available)
    let prescriptions = [];
    try {
      const { data: rxData } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', id)
        .order('created_at', { ascending: false });
      if (rxData) prescriptions = rxData;
    } catch (_) {}

    // Treatment plans (return empty array if table not available)
    let plans = [];
    try {
      const { data: plData } = await supabase
        .from('treatment_plans')
        .select(`
          id, name, description, total_estimated_cost, status, created_at,
          items:treatment_plan_items ( id, treatment_name, sequence, status, notes )
        `)
        .eq('patient_id', id)
        .order('created_at', { ascending: false });
      if (plData) plans = plData;
    } catch (_) {}

    res.json({
      ...profile,
      dob: profile.date_of_birth,
      medicalHistory: profile.medical_notes,
      address: profile.user ? profile.user.address : null,
      appointments: appointments || [],
      prescriptions: prescriptions,
      treatmentPlans: plans
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a patient profile (both user account and patient demographics)
// @route   PUT /api/patients/:id
// @access  Private (Admin, Receptionist)
const updatePatientProfile = async (req, res) => {
  const { id } = req.params; // user_id
  const { firstName, lastName, dob, gender, bloodType, contactNumber, allergies, medicalNotes } = req.body;
  try {
    // 1. Update users table details
    const fullName = `${firstName} ${lastName}`.trim();
    const { error: userError } = await supabase
      .from('users')
      .update({
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        contact_number: contactNumber
      })
      .eq('id', id);

    if (userError) throw userError;

    // 2. Parse allergies array
    let allergiesArray = [];
    if (Array.isArray(allergies)) {
      allergiesArray = allergies;
    } else if (typeof allergies === 'string') {
      allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
    }

    // 3. Update patient_profiles details
    const { error: profileError } = await supabase
      .from('patient_profiles')
      .update({
        date_of_birth: dob,
        gender,
        blood_type: bloodType,
        allergies: allergiesArray,
        medical_notes: medicalNotes
      })
      .eq('user_id', id);

    if (profileError) throw profileError;

    res.json({ success: true, message: 'Patient profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPatients, createPatientProfile, getPatientCount, getPatientWithHistory, updatePatientProfile };
