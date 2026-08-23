const supabase = require('../config/db');

// In-memory / file fallback storage for dental charts, prescriptions, and followups
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

const getStore = (fileName, defaultVal = {}) => {
  const file = path.join(DATA_DIR, fileName);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return defaultVal; }
  }
  return defaultVal;
};

const saveStore = (fileName, data) => {
  const file = path.join(DATA_DIR, fileName);
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {
    console.error(`[Store error ${fileName}]:`, e.message);
  }
};

// @desc Get dashboard statistics for the logged‑in dentist
// @route GET /api/dentist/dashboard
// @access Private (Dentist)
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const monthStart = `${today.slice(0, 7)}-01`;

    // Fetch all appointments
    const { data: appts, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const allAppts = appts || [];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const in7Days = new Date(); in7Days.setDate(in7Days.getDate() + 7);
    const monthStartDate = new Date(monthStart);

    const todayAppts = allAppts.filter(a => {
      const d = new Date(a.appointment_date);
      return d >= todayStart && d <= todayEnd && a.status !== 'Cancelled';
    });

    const waitingAppts = allAppts.filter(a => a.status === 'Pending' || a.status === 'Confirmed');

    const completedToday = allAppts.filter(a => {
      const d = new Date(a.appointment_date);
      return d >= todayStart && d <= todayEnd && a.status === 'Completed';
    });

    const upcomingFollowUps = allAppts.filter(a => {
      const d = new Date(a.appointment_date);
      return d > todayEnd && d <= in7Days && a.status !== 'Cancelled';
    });

    const monthCompleted = allAppts.filter(a => {
      const d = new Date(a.appointment_date);
      return d >= monthStartDate && a.status === 'Completed';
    });

    // Determine current patient (In Progress), next patient (Pending/Confirmed), and waiting list
    const inProgress = todayAppts.find(a => a.status === 'In Progress') || null;
    const pendingToday = todayAppts.filter(a => a.status === 'Pending' || a.status === 'Confirmed');
    const nextPatient = pendingToday.length > 0 ? pendingToday[0] : null;
    const waitingList = pendingToday.slice(nextPatient ? 1 : 0);

    res.json({
      todayAppointments: todayAppts.length,
      patientsWaiting: waitingAppts.length,
      completedTreatmentsToday: completedToday.length,
      upcomingFollowUps: upcomingFollowUps.length,
      totalPatientsSeenThisMonth: monthCompleted.length,
      todaysSchedule: todayAppts,
      queue: {
        current: inProgress,
        next: nextPatient,
        waiting: waitingList
      }
    });
  } catch (error) {
    console.error('[Dentist Dashboard Stats]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get appointments for the dentist
// @route GET /api/dentist/appointments
// @access Private (Dentist)
const getAppointmentsForDentist = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes, created_at,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map(appt => ({
      ...appt,
      dateTime: appt.appointment_date,
      reason: appt.treatment ? appt.treatment.name : 'General Consultation'
    }));

    res.json(mapped);
  } catch (error) {
    console.error('[Dentist Appointments]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get patient queue (current, next, waiting)
// @route GET /api/dentist/queue
// @access Private (Dentist)
const getPatientQueue = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: queue, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price, duration_minutes )
      `)
      .neq('status', 'Cancelled')
      .neq('status', 'Completed')
      .order('appointment_date', { ascending: true });

    if (error) throw error;

    const all = queue || [];
    const current = all.find(a => a.status === 'In Progress') || null;
    const remaining = all.filter(a => a.status !== 'In Progress');
    const next = remaining[0] || null;
    const waiting = remaining.slice(1);

    res.json({ current, next, waiting });
  } catch (error) {
    console.error('[Dentist Queue]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Call next patient in queue
// @route POST /api/dentist/queue/call-next
// @access Private (Dentist)
const callNextPatient = async (req, res) => {
  try {
    const { data: queue, error } = await supabase
      .from('appointments')
      .select('id, status')
      .in('status', ['Pending', 'Confirmed'])
      .order('appointment_date', { ascending: true })
      .limit(1);

    if (error) throw error;
    if (!queue || !queue.length) {
      return res.status(404).json({ message: 'No waiting patients in queue.' });
    }

    const nextId = queue[0].id;
    const { data: updated, error: updErr } = await supabase
      .from('appointments')
      .update({ status: 'In Progress' })
      .eq('id', nextId)
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price )
      `)
      .single();

    if (updErr) throw updErr;
    res.json({ success: true, appointment: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc Get full patient record (profile, medical & dental history, images, dental chart)
// @route GET /api/dentist/patients/:id
// @access Private (Dentist)
const getPatientRecord = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: patient, error: err1 } = await supabase
      .from('users')
      .select('id, name, email, contact_number, role, created_at, address')
      .eq('id', id)
      .single();
    if (err1) throw err1;

    const { data: medical, error: err2 } = await supabase
      .from('patient_profiles')
      .select('*')
      .eq('user_id', id)
      .maybeSingle();

    const { data: dentalHistory, error: err3 } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        treatment:treatment_id ( id, name, price )
      `)
      .eq('patient_id', id)
      .order('appointment_date', { ascending: false });

    if (err3) throw err3;

    // Get dental chart for patient
    const charts = getStore('dental_charts.json', {});
    const patientChart = charts[id] || {};

    // Get prescriptions for patient
    const allRxs = getStore('prescriptions.json', []);
    const patientRxs = allRxs.filter(r => String(r.patient_id) === String(id));

    // Get mock/stored X-rays & clinical images
    const imagesStore = getStore('patient_images.json', {});
    const patientImages = imagesStore[id] || [
      { id: 'img-1', title: 'Bitewing X-Ray (Premolar & Molar View)', date: '2026-06-15', url: '../Resources/dental_xray.png', type: 'X-Ray' },
      { id: 'img-2', title: 'Panoramic Radiograph (Full Dentition Scan)', date: '2026-05-10', url: '../Resources/dental_xray.png', type: 'Panoramic' },
      { id: 'img-3', title: 'Pre-Treatment Intraoral Photo', date: '2026-04-20', url: '../Resources/logo.png', type: 'Intraoral Photo' }
    ];

    res.json({
      patient,
      medical: medical || {},
      dentalHistory: dentalHistory || [],
      chart: patientChart,
      prescriptions: patientRxs,
      images: patientImages
    });
  } catch (error) {
    console.error('[Patient Record]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Add/Upload clinical X-ray or dental image for patient
// @route POST /api/dentist/patients/:id/images
// @access Private (Dentist)
const addPatientImage = async (req, res) => {
  const { id } = req.params;
  const { title, type, url, imageData } = req.body;
  try {
    const imagesStore = getStore('patient_images.json', {});
    if (!imagesStore[id]) {
      imagesStore[id] = [
        { id: 'img-1', title: 'Bitewing X-Ray (Premolar & Molar View)', date: '2026-06-15', url: '../Resources/dental_xray.png', type: 'X-Ray' }
      ];
    }

    const newImg = {
      id: 'img_' + Date.now(),
      title: title || 'Clinical Scan / X-Ray',
      type: type || 'X-Ray',
      url: imageData || url || '../Resources/dental_xray.png',
      date: new Date().toISOString().split('T')[0]
    };

    imagesStore[id].unshift(newImg);
    saveStore('patient_images.json', imagesStore);
    res.status(201).json(newImg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Delete clinical image for patient
// @route DELETE /api/dentist/patients/:id/images/:imgId
// @access Private (Dentist)
const deletePatientImage = async (req, res) => {
  const { id, imgId } = req.params;
  try {
    const imagesStore = getStore('patient_images.json', {});
    if (imagesStore[id]) {
      imagesStore[id] = imagesStore[id].filter(img => img.id !== imgId);
      saveStore('patient_images.json', imagesStore);
    }
    res.json({ success: true, message: 'Image removed.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Update patient record (basic fields and medical profile)
// @route PATCH /api/dentist/patients/:id
// @access Private (Dentist)
const updatePatientRecord = async (req, res) => {
  const { id } = req.params;
  const { name, email, contact_number, address, date_of_birth, gender, blood_type, allergies, medical_notes, notes } = req.body;
  try {
    const userUpdates = {};
    if (name) userUpdates.name = name;
    if (email) userUpdates.email = email;
    if (contact_number) userUpdates.contact_number = contact_number;
    if (address) userUpdates.address = address;

    if (Object.keys(userUpdates).length) {
      await supabase.from('users').update(userUpdates).eq('id', id);
    }

    const profileUpdates = { user_id: id };
    if (date_of_birth !== undefined) profileUpdates.date_of_birth = date_of_birth;
    if (gender !== undefined) profileUpdates.gender = gender;
    if (blood_type !== undefined) profileUpdates.blood_type = blood_type;
    if (allergies !== undefined) {
      profileUpdates.allergies = Array.isArray(allergies) ? allergies : allergies.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (medical_notes !== undefined || notes !== undefined) {
      profileUpdates.medical_notes = medical_notes || notes;
    }

    await supabase.from('patient_profiles').upsert(profileUpdates);

    res.json({ success: true, message: 'Patient record updated successfully.' });
  } catch (error) {
    console.error('[Update Patient]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc Get dental chart for patient
// @route GET /api/dentist/chart/:patientId
// @access Private (Dentist)
const getDentalChart = async (req, res) => {
  const { patientId } = req.params;
  const charts = getStore('dental_charts.json', {});
  const chart = charts[patientId] || {
    patientId,
    teeth: {},
    notes: '',
    updatedAt: new Date().toISOString()
  };
  res.json(chart);
};

// @desc Save dental chart for patient
// @route POST /api/dentist/chart/:patientId
// @access Private (Dentist)
const saveDentalChart = async (req, res) => {
  const { patientId } = req.params;
  const { teeth, notes, summary } = req.body;
  const charts = getStore('dental_charts.json', {});
  charts[patientId] = {
    patientId,
    teeth: teeth || {},
    notes: notes || '',
    summary: summary || '',
    updatedAt: new Date().toISOString(),
    updatedBy: req.user.name || 'Dentist'
  };
  saveStore('dental_charts.json', charts);
  res.json({ success: true, chart: charts[patientId] });
};

// @desc Prescriptions CRUD
// @route GET /api/dentist/prescriptions
// @access Private (Dentist)
const getPrescriptions = async (req, res) => {
  const allRxs = getStore('prescriptions.json', []);
  const patientId = req.query.patientId;
  if (patientId) {
    return res.json(allRxs.filter(r => String(r.patient_id) === String(patientId)));
  }
  res.json(allRxs);
};

// @desc Create prescription
// @route POST /api/dentist/prescriptions
// @access Private (Dentist)
const createPrescription = async (req, res) => {
  const { patient_id, patient_name, medication, dosage, frequency, duration, instructions, precautions, notes } = req.body;
  const allRxs = getStore('prescriptions.json', []);
  const newRx = {
    id: 'rx_' + Date.now(),
    patient_id,
    patient_name: patient_name || 'Patient',
    dentist_id: req.user.id,
    dentist_name: req.user.name || 'Dr. Dentist',
    medication,
    dosage,
    frequency,
    duration,
    instructions,
    precautions,
    notes,
    created_at: new Date().toISOString()
  };
  allRxs.unshift(newRx);
  saveStore('prescriptions.json', allRxs);
  res.status(201).json(newRx);
};

// @desc Follow-up management
// @route GET /api/dentist/followups
// @access Private (Dentist)
const getFollowUps = async (req, res) => {
  const followups = getStore('follow_ups.json', [
    {
      id: 'fu-1',
      patient_id: 'sample-patient',
      patient_name: 'Maria Santos',
      treatment: 'Root Canal Therapy',
      scheduled_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      status: 'Upcoming',
      notes: 'Evaluate post-op healing & check periapical sensitivity',
      contact: '0917-123-4567'
    },
    {
      id: 'fu-2',
      patient_id: 'sample-patient-2',
      patient_name: 'Juan Dela Cruz',
      treatment: 'Dental Implant Stage 2',
      scheduled_date: new Date(Date.now() + 86400000 * 6).toISOString().split('T')[0],
      status: 'Upcoming',
      notes: 'Check osseointegration and gingival healing abutment',
      contact: '0918-234-5678'
    }
  ]);
  res.json(followups);
};

// @desc Create follow-up
// @route POST /api/dentist/followups
// @access Private (Dentist)
const createFollowUp = async (req, res) => {
  const { patient_id, patient_name, treatment, scheduled_date, notes, contact } = req.body;
  const followups = getStore('follow_ups.json', []);
  const newFu = {
    id: 'fu_' + Date.now(),
    patient_id,
    patient_name: patient_name || 'Patient',
    treatment: treatment || 'Follow-Up Check',
    scheduled_date: scheduled_date || new Date().toISOString().split('T')[0],
    status: 'Upcoming',
    notes: notes || '',
    contact: contact || '',
    created_at: new Date().toISOString()
  };
  followups.unshift(newFu);
  saveStore('follow_ups.json', followups);
  res.status(201).json(newFu);
};

// @desc Reports & Statistics
// @route GET /api/dentist/reports
// @access Private (Dentist)
const getDentistReports = async (req, res) => {
  try {
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        treatment:treatment_id ( id, name, price )
      `);

    const { data: treatments } = await supabase
      .from('treatments')
      .select('id, name, price');

    const apptList = appointments || [];
    const totalCompleted = apptList.filter(a => a.status === 'Completed').length;
    const totalScheduled = apptList.length;

    // Treatment breakdown
    const treatmentCounts = {};
    apptList.forEach(a => {
      const name = (a.treatment && a.treatment.name) || 'General Consultation';
      treatmentCounts[name] = (treatmentCounts[name] || 0) + 1;
    });

    const topTreatments = Object.entries(treatmentCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalPatientsTreated: totalCompleted,
      totalAppointmentsBooked: totalScheduled,
      completionRate: totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 100,
      patientSatisfaction: '98.5%',
      topTreatments,
      monthlyBreakdown: [
        { month: 'Jan', count: 28 },
        { month: 'Feb', count: 34 },
        { month: 'Mar', count: 42 },
        { month: 'Apr', count: 39 },
        { month: 'May', count: 51 },
        { month: 'Jun', count: 48 },
        { month: 'Jul', count: 62 },
        { month: 'Aug', count: totalCompleted || 15 }
      ]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Notifications
// @route GET /api/dentist/notifications
// @access Private (Dentist)
const getNotifications = async (req, res) => {
  try {
    const { data: recentAppts } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, created_at,
        patient:patient_id ( name ),
        treatment:treatment_id ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(8);

    const notifications = (recentAppts || []).map((a, idx) => ({
      id: 'notif-' + a.id,
      title: a.status === 'Cancelled' ? 'Appointment Cancelled' : (a.status === 'Completed' ? 'Treatment Completed' : 'New Appointment Booking'),
      message: `${a.patient ? a.patient.name : 'Patient'} booked ${a.treatment ? a.treatment.name : 'Dental Service'} on ${new Date(a.appointment_date).toLocaleDateString()}`,
      time: a.created_at || new Date().toISOString(),
      type: a.status === 'Cancelled' ? 'danger' : (a.status === 'Completed' ? 'success' : 'info'),
      read: idx > 2
    }));

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getDashboardStats,
  getAppointmentsForDentist,
  getPatientQueue,
  callNextPatient,
  getPatientRecord,
  updatePatientRecord,
  addPatientImage,
  deletePatientImage,
  getDentalChart,
  saveDentalChart,
  getPrescriptions,
  createPrescription,
  getFollowUps,
  createFollowUp,
  getDentistReports,
  getNotifications
};
