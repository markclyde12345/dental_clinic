const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');
const seedUsers = require('../utils/seeder');

const DATA_DIR = 'c:\\visualstudio\\Dental_Clinic_Backups';
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const STAFF_FILE = path.join(DATA_DIR, 'staff_schedules.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const createBackup = (filename, data) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const backupPath = path.join(BACKUP_DIR, `${base}_backup_${timestamp}${ext}`);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`[BACKUP] Created backup: ${backupPath}`);
  } catch (err) {
    console.error('[BACKUP ERROR]', err.message);
  }
};


// @desc    Get dashboard stats and overview
// @route   GET /api/admin/stats
// @access  Private (Admin)
const getAdminStats = async (req, res) => {
  try {
    // 1. Count Patients (users where role = 'Patient')
    const { count: totalPatients, error: patientError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'Patient');

    if (patientError) throw patientError;

    // 2. Count Appointments
    const { count: totalAppointments, error: apptError } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true });

    if (apptError) throw apptError;

    // 3. Monthly Revenue (sum of paid invoices, supporting both amount/total_amount and paid_amount schemas)
    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select('*');

    if (invoiceError) throw invoiceError;

    const totalRevenue = invoices.reduce((sum, inv) => {
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      // Fallback: if paid_amount is missing, assume it is fully paid if status is 'paid', else 0
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
      return sum + paid;
    }, 0);

    // 4. Recent Activity (Latest 5 users registered & latest 5 appointments)
    const { data: recentUsers, error: userError } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (userError) throw userError;

    const { data: recentAppointments, error: recentApptError } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status,
        patient:patient_id ( id, name, email )
      `)
      .order('appointment_date', { ascending: false })
      .limit(5);

    if (recentApptError) throw recentApptError;

    res.json({
      stats: {
        totalPatients: totalPatients || 0,
        totalAppointments: totalAppointments || 0,
        totalRevenue: totalRevenue || 0,
      },
      recentUsers: recentUsers || [],
      recentAppointments: recentAppointments || [],
    });
  } catch (error) {
    console.error('[Admin Stats Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get detailed clinic data analytics
// @route   GET /api/admin/analytics
// @access  Private (Admin)
const getAdminAnalytics = async (req, res) => {
  try {
    // 1. Fetch appointments
    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select('id, appointment_date, status, treatment_id');

    if (apptError) throw apptError;

    // 2. Fetch treatments
    const { data: treatments, error: treatError } = await supabase
      .from('treatments')
      .select('id, name, price');

    if (treatError) throw treatError;

    // 3. Fetch invoices
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*');

    if (invError) throw invError;

    // 4. Fetch patient profiles (for demographics)
    const { data: patientProfiles, error: profileError } = await supabase
      .from('patient_profiles')
      .select('gender');

    if (profileError) throw profileError;

    // ─── Compile Demographics ────────────────────────────────────────────────
    const genderStats = { Male: 0, Female: 0, Other: 0, Unspecified: 0 };
    patientProfiles.forEach(p => {
      const g = p.gender || 'Unspecified';
      if (genderStats[g] !== undefined) {
        genderStats[g]++;
      } else {
        genderStats['Unspecified']++;
      }
    });

    // ─── Compile Appointment Status Breakdown ────────────────────────────────
    const appointmentStats = { Pending: 0, Approved: 0, Completed: 0, Cancelled: 0 };
    appointments.forEach(a => {
      const status = a.status || 'Pending';
      // Handle casing
      const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      if (appointmentStats[formattedStatus] !== undefined) {
        appointmentStats[formattedStatus]++;
      } else {
        // Fallback for custom statuses
        if (formattedStatus === 'Active' || formattedStatus === 'Confirmed') {
          appointmentStats['Approved']++;
        } else {
          appointmentStats['Pending']++;
        }
      }
    });

    // ─── Compile Treatment Popularity & Revenue ──────────────────────────────
    const treatmentMap = {};
    treatments.forEach(t => {
      treatmentMap[t.id] = { name: t.name, price: parseFloat(t.price || 0), count: 0, revenue: 0 };
    });

    appointments.forEach(a => {
      if (a.treatment_id && treatmentMap[a.treatment_id]) {
        treatmentMap[a.treatment_id].count++;
        treatmentMap[a.treatment_id].revenue += treatmentMap[a.treatment_id].price;
      }
    });

    const treatmentStats = Object.values(treatmentMap).sort((a, b) => b.count - a.count);

    // ─── Compile Invoices & Financial Analytics ──────────────────────────────
    const financialStats = {
      billed: 0,
      collected: 0,
      unpaidCount: 0,
      paidCount: 0,
      partialCount: 0
    };

    invoices.forEach(inv => {
      const total = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? total : 0);

      financialStats.billed += total;
      financialStats.collected += paid;

      const status = inv.status?.toLowerCase() || 'unpaid';
      if (status === 'paid') {
        financialStats.paidCount++;
      } else if (status === 'partial') {
        financialStats.partialCount++;
      } else {
        financialStats.unpaidCount++;
      }
    });

    res.json({
      demographics: genderStats,
      appointments: appointmentStats,
      treatments: treatmentStats.slice(0, 5), // Top 5 treatments
      financials: financialStats
    });
  } catch (error) {
    console.error('[Admin Analytics Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get detailed stats and notifications for the home tab
// @route   GET /api/admin/detailed-stats
// @access  Private (Admin)
const getDetailedStats = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const startOfMonthStr = todayStr.substring(0, 7) + '-01'; // YYYY-MM-01

    // 1. Fetch appointments
    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( id, name, email, contact_number )
      `);

    if (apptError) throw apptError;

    // 2. Fetch invoices
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('*');

    if (invError) throw invError;

    // ─── Compile Today's stats ───────────────────────────────────────────────
    const todayAppts = appointments.filter(a => {
      if (!a.appointment_date) return false;
      return a.appointment_date.startsWith(todayStr);
    });

    const seenToday = todayAppts.filter(a => a.status?.toLowerCase() === 'completed').length;
    const noShowsToday = todayAppts.filter(a => a.status?.toLowerCase() === 'cancelled').length;

    // Calculate revenue today and this month
    let revenueToday = 0;
    let revenueMonth = 0;

    invoices.forEach(inv => {
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? amt : 0);

      const issuedDate = inv.issued_at || inv.created_at;
      if (issuedDate) {
        if (issuedDate.startsWith(todayStr)) {
          revenueToday += paid;
        }
        if (issuedDate.startsWith(todayStr.substring(0, 7))) {
          revenueMonth += paid;
        }
      }
    });

    // ─── Compile Alerts ──────────────────────────────────────────────────────
    const alerts = [];

    // Overdue payments (unpaid invoices older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const overdueCount = invoices.filter(inv => {
      const status = inv.status?.toLowerCase() || 'unpaid';
      const issuedDate = inv.issued_at || inv.created_at || '';
      return status === 'unpaid' && issuedDate < sevenDaysAgoStr;
    }).length;

    if (overdueCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${overdueCount} patient invoice(s) are overdue for payment.`,
        category: 'Billing'
      });
    }

    // Pending appointment confirmations
    const pendingCount = appointments.filter(a => a.status?.toLowerCase() === 'pending').length;
    if (pendingCount > 0) {
      alerts.push({
        type: 'info',
        message: `${pendingCount} appointment booking(s) are pending confirmation.`,
        category: 'Appointments'
      });
    }

    // Low stock alert (static check linked to mock inventory)
    alerts.push({
      type: 'danger',
      message: 'Low stock warning: "Anesthetic Cartridges" and "Nitrile Gloves (M)" are below threshold.',
      category: 'Inventory'
    });

    res.json({
      todayAppointments: todayAppts,
      stats: {
        seenToday,
        noShowsToday,
        revenueToday,
        revenueMonth
      },
      alerts,
      invoices: invoices || [],
      allAppointments: appointments || []
    });
  } catch (error) {
    console.error('[Admin Detailed Stats Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dental supplies inventory stock levels
// @route   GET /api/admin/inventory
// @access  Private (Admin)
const getInventory = async (req, res) => {
  try {
    let { data: inventory, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Seed defaults if empty
    if (!inventory || inventory.length === 0) {
      const defaultInventory = [
        { name: 'Dental Composite (A2)', category: 'Restorative', stock: 45, unit: 'Syringes', threshold: 15, status: 'In Stock' },
        { name: 'Anesthetic Cartridges (Lidocaine 2%)', category: 'Anesthetics', stock: 8, unit: 'Boxes (100ct)', threshold: 20, status: 'Low Stock' },
        { name: 'Nitrile Gloves (Medium)', category: 'Disposables', stock: 5, unit: 'Boxes (100ct)', threshold: 10, status: 'Low Stock' },
        { name: 'Sterilization Pouches (3.5x9")', category: 'Hygiene', stock: 250, unit: 'Pouches', threshold: 100, status: 'In Stock' },
        { name: 'Saliva Ejectors (Blue)', category: 'Disposables', stock: 120, unit: 'Packs (100ct)', threshold: 50, status: 'In Stock' },
        { name: 'Prophy Paste (Mint/Medium)', category: 'Hygiene', stock: 12, unit: 'Tubs', threshold: 10, status: 'In Stock' },
        { name: 'Cotton Rolls (#2 Medium)', category: 'Disposables', stock: 2, unit: 'Boxes (2000ct)', threshold: 5, status: 'Low Stock' }
      ];

      const { data: seeded, error: seedError } = await supabase
        .from('inventory')
        .insert(defaultInventory)
        .select();

      if (seedError) throw seedError;
      inventory = seeded;
    }

    res.json(inventory);
  } catch (error) {
    console.error('[Admin Get Inventory Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add supply item to inventory
// @route   POST /api/admin/inventory
// @access  Private (Admin)
const addInventory = async (req, res) => {
  try {
    const { name, category, unit, stock, threshold, status } = req.body;
    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(threshold, 10) || 0;
    const calculatedStatus = status || (parsedStock < parsedThreshold ? 'Low Stock' : 'In Stock');

    const { data: newItem, error } = await supabase
      .from('inventory')
      .insert([{
        name,
        category,
        unit,
        stock: parsedStock,
        threshold: parsedThreshold,
        status: calculatedStatus
      }])
      .select()
      .single();

    if (error) throw error;

    const { data: fullList } = await supabase.from('inventory').select('*').order('created_at', { ascending: true });
    if (fullList) createBackup(INVENTORY_FILE, fullList);

    res.status(201).json(newItem);
  } catch (error) {
    console.error('[Admin Add Inventory Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete supply item from inventory
// @route   DELETE /api/admin/inventory/:id
// @access  Private (Admin)
const deleteInventory = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (error) throw error;

    const { data: fullList } = await supabase.from('inventory').select('*').order('created_at', { ascending: true });
    if (fullList) createBackup(INVENTORY_FILE, fullList);

    res.json({ success: true, message: 'Inventory item deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Inventory Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get staff work schedules and availability
// @route   GET /api/admin/staff-schedules
// @access  Private (Admin)
const getStaffSchedules = async (req, res) => {
  try {
    let { data: schedules, error } = await supabase
      .from('staff_schedules')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Seed defaults if empty
    if (!schedules || schedules.length === 0) {
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name, email, role, contact_number, is_active')
        .in('role', ['Admin', 'Dentist', 'Receptionist', 'Accounting']);

      if (!userError && users && users.length > 0) {
        const defaultSchedules = users.map(u => {
          let shift = '08:00 AM - 05:00 PM';
          let availability = u.is_active ? 'On Duty' : 'Off Duty';
          let days = 'Mon - Sat';

          if (u.role === 'Dentist') {
            shift = '09:00 AM - 04:00 PM';
            days = 'Mon, Wed, Fri';
          } else if (u.role === 'Accounting') {
            shift = '08:00 AM - 05:00 PM';
            days = 'Tue, Thu, Sat';
          }

          if (!u.is_active) {
            availability = 'Off Duty';
          } else if (u.name.includes('Sarah') || u.name.includes('Jane')) {
            availability = 'On Duty';
          } else if (u.name.includes('John')) {
            availability = 'On Leave';
          }

          return {
            id: u.id,
            name: u.name,
            email: u.email || 'N/A',
            role: u.role,
            contact: u.contact_number || 'N/A',
            shift,
            days,
            availability
          };
        });

        const { data: seeded, error: seedError } = await supabase
          .from('staff_schedules')
          .insert(defaultSchedules)
          .select();

        if (seedError) throw seedError;
        schedules = seeded;
      }
    }

    res.json(schedules);
  } catch (error) {
    console.error('[Admin Get Staff Schedules Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a staff schedule listing
// @route   POST /api/admin/staff-schedules
// @access  Private (Admin)
const addStaffSchedule = async (req, res) => {
  try {
    const { name, role, shift, days, contact, availability, email } = req.body;

    const { data: newSched, error } = await supabase
      .from('staff_schedules')
      .insert([{
        name,
        email: email || 'N/A',
        role,
        shift,
        days,
        contact,
        availability
      }])
      .select()
      .single();

    if (error) throw error;

    const { data: fullList } = await supabase.from('staff_schedules').select('*').order('created_at', { ascending: true });
    if (fullList) createBackup(STAFF_FILE, fullList);

    res.status(201).json(newSched);
  } catch (error) {
    console.error('[Admin Add Staff Schedule Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a staff schedule listing
// @route   DELETE /api/admin/staff-schedules/:id
// @access  Private (Admin)
const deleteStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('staff_schedules')
      .delete()
      .eq('id', id);

    if (error) throw error;

    const { data: fullList } = await supabase.from('staff_schedules').select('*').order('created_at', { ascending: true });
    if (fullList) createBackup(STAFF_FILE, fullList);

    res.json({ success: true, message: 'Staff schedule listing deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Staff Schedule Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

const resetSeeder = async (req, res) => {
  try {
    await seedUsers();
    res.json({ success: true, message: 'Database reset & seeded successfully' });
  } catch (error) {
    console.error('[Admin Reset Seeder Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { 
  getAdminStats, 
  getAdminAnalytics, 
  getDetailedStats, 
  getInventory, 
  addInventory,
  deleteInventory,
  getStaffSchedules, 
  addStaffSchedule,
  deleteStaffSchedule,
  resetSeeder
};
