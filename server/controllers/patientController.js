const supabase = require('../config/db');

// @desc    Get all patient profiles (merges users with role 'Patient' and patient_profiles)
// @route   GET /api/patients
// @access  Private (Admin, Receptionist, Dentist)
const getPatients = async (req, res) => {
  try {
    // 1. Fetch all registered users with role 'Patient'
    const { data: patientUsers, error: uErr } = await supabase
      .from('users')
      .select('id, name, first_name, last_name, email, contact_number, address, created_at')
      .eq('role', 'Patient')
      .order('created_at', { ascending: false });

    if (uErr) throw uErr;

    // 2. Fetch all existing patient_profiles
    const { data: profiles, error: pErr } = await supabase
      .from('patient_profiles')
      .select('id, user_id, date_of_birth, gender, blood_type, allergies, medical_notes, created_at');

    if (pErr) console.warn('[Patient Profiles Warning]', pErr.message);

    const profileMap = new Map();
    if (profiles) {
      profiles.forEach(p => {
        if (p.user_id) profileMap.set(p.user_id, p);
      });
    }

    // 3. Merge: Every registered patient has a guaranteed record with user_id as primary id
    const mapped = (patientUsers || []).map(u => {
      const p = profileMap.get(u.id) || {};
      const fullName = u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Patient';
      return {
        id: u.id, // Primary identifier is user_id for appointments & invoicing consistency
        user_id: u.id,
        profile_id: p.id || null,
        date_of_birth: p.date_of_birth || null,
        dob: p.date_of_birth || null,
        gender: p.gender || 'Not specified',
        blood_type: p.blood_type || 'Unknown',
        allergies: Array.isArray(p.allergies) ? p.allergies : (p.allergies ? [p.allergies] : []),
        medical_notes: p.medical_notes || '',
        medicalHistory: p.medical_notes || '',
        address: u.address || p.address || 'N/A',
        created_at: p.created_at || u.created_at,
        user: {
          id: u.id,
          name: fullName,
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          email: u.email || 'No email',
          contact_number: u.contact_number || 'No phone',
          address: u.address || 'N/A'
        }
      };
    });

    res.json(mapped);
  } catch (error) {
    console.error('[getPatients Error]', error);
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
    // 1. Resolve patient profile and user record (accepts either user_id OR profile id)
    let { data: profile, error: pErr } = await supabase
      .from('patient_profiles')
      .select(`
        id, user_id, date_of_birth, gender, blood_type, allergies, medical_notes, created_at,
        user:user_id ( id, name, first_name, last_name, email, contact_number, address )
      `)
      .or(`user_id.eq.${id},id.eq.${id}`)
      .maybeSingle();

    if (pErr) console.warn('[Profile Query Warning]', pErr.message);

    let actualUserId = profile?.user_id || id;
    let userRecord = profile?.user || null;

    // If profile was not found or has no user, lookup users table directly
    if (!userRecord) {
      const { data: userRec } = await supabase
        .from('users')
        .select('id, name, first_name, last_name, email, contact_number, address, created_at')
        .eq('id', actualUserId)
        .maybeSingle();

      if (userRec) {
        actualUserId = userRec.id;
        userRecord = userRec;
      }
    }

    // If still not found, return 404
    if (!userRecord && !profile) {
      return res.status(404).json({ message: 'Patient chart record not found.' });
    }

    // If patient user exists but no profile row exists, initialize default profile object
    if (!profile) {
      profile = {
        id: actualUserId,
        user_id: actualUserId,
        date_of_birth: null,
        gender: 'Not specified',
        blood_type: 'Unknown',
        allergies: [],
        medical_notes: '',
        created_at: userRecord?.created_at || new Date().toISOString(),
        user: userRecord
      };

      // Persist auto-created profile for future queries in background
      supabase
        .from('patient_profiles')
        .upsert([{
          user_id: actualUserId,
          date_of_birth: null,
          gender: 'Not specified',
          blood_type: 'Unknown',
          allergies: [],
          medical_notes: ''
        }], { onConflict: 'user_id' })
        .then(() => {})
        .catch(e => console.warn('[Auto Profile Warning]', e.message));
    }

    // 2. Fetch Appointments for this patient
    const { data: appointments, error: aErr } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .eq('patient_id', actualUserId)
      .order('appointment_date', { ascending: false });

    if (aErr) console.warn('[Appointments Query Warning]', aErr.message);

    // 3. Fetch Prescriptions (return empty array if table not available)
    let prescriptions = [];
    try {
      const { data: rxData } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', actualUserId)
        .order('created_at', { ascending: false });
      if (rxData) prescriptions = rxData;
    } catch (_) {}

    // 4. Fetch Treatment plans (return empty array if table not available)
    let plans = [];
    try {
      const { data: plData } = await supabase
        .from('treatment_plans')
        .select(`
          id, name, description, total_estimated_cost, status, created_at,
          items:treatment_plan_items ( id, treatment_name, sequence, status, notes )
        `)
        .eq('patient_id', actualUserId)
        .order('created_at', { ascending: false });
      if (plData) plans = plData;
    } catch (_) {}

    const patientName = userRecord?.name || `${userRecord?.first_name || ''} ${userRecord?.last_name || ''}`.trim() || 'Patient';

    const patientData = {
      id: actualUserId,
      user_id: actualUserId,
      profile_id: profile.id,
      name: patientName,
      first_name: userRecord?.first_name || '',
      last_name: userRecord?.last_name || '',
      email: userRecord?.email || 'N/A',
      contact_number: userRecord?.contact_number || 'N/A',
      phone: userRecord?.contact_number || 'N/A',
      address: userRecord?.address || 'N/A',
      date_of_birth: profile.date_of_birth || null,
      dob: profile.date_of_birth || null,
      gender: profile.gender || 'Not specified',
      blood_type: profile.blood_type || 'Unknown',
      allergies: Array.isArray(profile.allergies) ? profile.allergies : (profile.allergies ? [profile.allergies] : []),
      medical_notes: profile.medical_notes || '',
      medicalHistory: profile.medical_notes || '',
      created_at: profile.created_at || userRecord?.created_at
    };

    res.json({
      success: true,
      patient: patientData,
      user: userRecord,
      ...profile,
      dob: profile.date_of_birth,
      medicalHistory: profile.medical_notes,
      address: userRecord?.address || null,
      appointments: appointments || [],
      prescriptions: prescriptions,
      treatmentPlans: plans
    });
  } catch (error) {
    console.error('[getPatientWithHistory Error]', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a patient profile (both user account and patient demographics)
// @route   PUT /api/patients/:id
// @access  Private (Admin, Receptionist)
const updatePatientProfile = async (req, res) => {
  const { id } = req.params; // user_id or profile id
  const { firstName, lastName, dob, gender, bloodType, contactNumber, address, allergies, medicalNotes } = req.body;
  try {
    // 1. Resolve actual user_id
    let actualUserId = id;
    const { data: prof } = await supabase
      .from('patient_profiles')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();

    if (prof && prof.user_id) {
      actualUserId = prof.user_id;
    }

    // 2. Update users table details
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const userUpdateFields = {};
    if (firstName) userUpdateFields.first_name = firstName;
    if (lastName) userUpdateFields.last_name = lastName;
    if (fullName) userUpdateFields.name = fullName;
    if (contactNumber !== undefined) userUpdateFields.contact_number = contactNumber;
    if (address !== undefined) userUpdateFields.address = address;

    if (Object.keys(userUpdateFields).length > 0) {
      const { error: userError } = await supabase
        .from('users')
        .update(userUpdateFields)
        .eq('id', actualUserId);

      if (userError) console.warn('[User Update Warning]', userError.message);
    }

    // 3. Parse allergies array
    let allergiesArray = [];
    if (Array.isArray(allergies)) {
      allergiesArray = allergies;
    } else if (typeof allergies === 'string') {
      allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
    }

    // 4. Upsert patient_profiles details
    const { error: profileError } = await supabase
      .from('patient_profiles')
      .upsert([{
        user_id: actualUserId,
        date_of_birth: dob || null,
        gender: gender || 'Male',
        blood_type: bloodType || 'Unknown',
        allergies: allergiesArray,
        medical_notes: medicalNotes || ''
      }], { onConflict: 'user_id' });

    if (profileError) throw profileError;

    res.json({ success: true, message: 'Patient profile updated successfully' });
  } catch (error) {
    console.error('[updatePatientProfile Error]', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getPatients, createPatientProfile, getPatientCount, getPatientWithHistory, updatePatientProfile };
