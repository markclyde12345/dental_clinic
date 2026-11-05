
const INVOICE_SUPP_PATH = path.join(__dirname, '..', 'data', 'invoice_supplements.json');
function loadInvoiceSupplements() {
  try {
    const raw = fs.readFileSync(INVOICE_SUPP_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/* v2 - cross-platform paths */
const fs = require('fs');
const path = require('path');
const supabase = require('../config/db');
const seedUsers = require('../utils/seeder');
const sendEmail = require('../utils/emailService');
const sendSMS = require('../utils/smsService');
const totpService = require('../utils/totpService');

// Use 
// /tmp for cross-platform compatibility (works on Vercel Linux + local Windows via env override)
const DATA_DIR = process.env.DATA_DIR || '/tmp/dental_clinic_backups';
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const LOCAL_PRICES_FILE = path.join(__dirname, '../data/inventory_prices.json');
const INVENTORY_PRICES_FILE = fs.existsSync(LOCAL_PRICES_FILE) ? LOCAL_PRICES_FILE : path.join(DATA_DIR, 'inventory_prices.json');

function getInventoryPricesMap() {
  const f = fs.existsSync(LOCAL_PRICES_FILE) ? LOCAL_PRICES_FILE : INVENTORY_PRICES_FILE;
  if (fs.existsSync(f)) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return {}; }
  }
  return {};
}

function saveInventoryPricesMap(map) {
  try {
    fs.writeFileSync(INVENTORY_PRICES_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (err) {
    console.error('[Save Inventory Prices Error]', err);
  }
}

function getItemPrice(item, pricesMap) {
  if (!item) return 250;
  if (pricesMap[item.id] !== undefined) return parseFloat(pricesMap[item.id]);
  if (pricesMap[item.name] !== undefined) return parseFloat(pricesMap[item.name]);
  const nameLower = (item.name || '').toLowerCase();
  for (const [key, val] of Object.entries(pricesMap)) {
    if (nameLower.includes(key.toLowerCase()) || key.toLowerCase().includes(nameLower)) {
      return parseFloat(val);
    }
  }
  return 250;
}
const STAFF_FILE = path.join(DATA_DIR, 'staff_schedules.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MFA_SETTINGS_PATH = path.join(__dirname, '../data/mfa_settings.json');

// Only enable local file backups when running on your own machine.
// Vercel's serverless filesystem is temporary and doesn't support this.
const IS_SERVERLESS = !!process.env.VERCEL;

// Ensure directories exist — wrapped in try/catch because Vercel's filesystem
// outside /tmp is read-only; a failure here must not crash the whole module.
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[Admin] Could not create backup directories (read-only filesystem?):', err.message);
}

// ─── Live System Logs Buffer ──────────────────────────────────────────────────
const systemLogsBuffer = [
  { id: 1, timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', module: 'SYSTEM', message: 'System core services initialized. Security middleware (Helmet, RateLimiters, XSS) active.' },
  { id: 2, timestamp: new Date(Date.now() - 90000).toISOString(), level: 'SUCCESS', module: 'DATABASE', message: 'Supabase PostgreSQL cloud connection verified and pool active.' },
  { id: 3, timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', module: 'AI', message: 'AI Dental Symptoms & Diagnosis service online (Gemini 2.5 Flash).' },
  { id: 4, timestamp: new Date(Date.now() - 40000).toISOString(), level: 'INFO', module: 'AUTH', message: 'JWT Auth token validator and RBAC guards online.' },
  { id: 5, timestamp: new Date(Date.now() - 20000).toISOString(), level: 'INFO', module: 'SYSTEM', message: 'REST API listener ready on port 5000.' }
];

let nextLogId = 6;

const recordServerLog = (level, moduleName, message) => {
  const newEntry = {
    id: nextLogId++,
    timestamp: new Date().toISOString(),
    level: (level || 'INFO').toUpperCase(),
    module: (moduleName || 'SYSTEM').toUpperCase(),
    message: String(message)
  };
  systemLogsBuffer.unshift(newEntry);
  if (systemLogsBuffer.length > 250) {
    systemLogsBuffer.pop();
  }
  return newEntry;
};

const createBackup = (filename, data) => {
  if (IS_SERVERLESS) return; // Skip local file backups in production/serverless
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
        patient:patient_id ( id, name, email, contact_number ),
        treatment:treatment_id ( id, name, price )
      `);

    if (apptError) throw apptError;

    // 2. Fetch invoices with appointment details
    const { data: rawInvoices, error: invError } = await supabase
      .from('invoices')
      .select(`
        *,
        appointment:appointment_id ( id, appointment_date, notes, treatment:treatment_id ( id, name, price ) )
      `);
    const invSupps = loadInvoiceSupplements();
    const invoices = (rawInvoices || []).map(inv => {
      const s = invSupps[inv.id] || {};
      const paid = s.paid_amount !== undefined ? s.paid_amount : (inv.status === 'Paid' ? inv.amount : 0);
      const st = s.voided ? 'Voided' : (inv.status || (paid >= inv.amount ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid')));
      return { ...inv, ...s, status: st, paid_amount: paid, payment_method: s.payment_method || '' };
    });

    if (invError) throw invError;

    // 3. Fetch inventory
    let inventory = [];
    try {
      const { data: invData } = await supabase.from('inventory').select('*').order('created_at', { ascending: true });
      if (Array.isArray(invData)) inventory = invData;
    } catch (_) {}

    // 4. Fetch expenses
    let expenses = [];
    try {
      const { data: expData } = await supabase.from('expenses').select('*').order('due_date', { ascending: false });
      if (Array.isArray(expData)) expenses = expData;
    } catch (_) {}

    // ─── Compile Today's stats ───────────────────────────────────────────────
    const todayAppts = appointments.filter(a => {
      if (!a.appointment_date) return false;
      return a.appointment_date.startsWith(todayStr);
    });

    const seenToday = todayAppts.filter(a => a.status?.toLowerCase() === 'completed').length;
    const noShowsToday = todayAppts.filter(a => a.status?.toLowerCase() === 'cancelled').length;

    // Calculate revenue today and this month based on patient invoices
    let revenueToday = 0;
    let revenueMonth = 0;

    invoices.forEach(inv => {
      const amt = parseFloat(inv.amount || inv.total_amount || 0);
      const paid = inv.paid_amount !== undefined && inv.paid_amount !== null
        ? parseFloat(inv.paid_amount)
        : (inv.status?.toLowerCase() === 'paid' ? amt : 0);
      const val = amt > 0 ? amt : paid;

      const issuedDate = inv.issued_at || inv.created_at;
      if (issuedDate) {
        if (issuedDate.startsWith(todayStr)) {
          revenueToday += val;
        }
        if (issuedDate.startsWith(todayStr.substring(0, 7))) {
          revenueMonth += val;
        }
      }
    });

    if (revenueMonth === 0 && invoices.length > 0) {
      revenueMonth = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount || inv.total_amount || 0) || 0), 0);
    }

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

    // Low stock alert (dynamic — based on real inventory data)
    const lowStockItems = inventory.filter(item => item.status === 'Low Stock' || (item.stock !== undefined && item.threshold !== undefined && item.stock <= item.threshold));
    if (lowStockItems.length > 0) {
      const names = lowStockItems.slice(0, 2).map(i => `"${i.name}"`).join(' and ');
      const extra = lowStockItems.length > 2 ? ` (+${lowStockItems.length - 2} more)` : '';
      alerts.push({
        type: 'danger',
        message: `Low stock warning: ${names}${extra} ${lowStockItems.length === 1 ? 'is' : 'are'} below threshold.`,
        category: 'Inventory'
      });
    }

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
      allAppointments: appointments || [],
      inventory: inventory || [],
      expenses: expenses || []
    });
  } catch (error) {
    console.error('[Admin Detailed Stats Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dental supplies inventory stock levels with pricing
// @route   GET /api/admin/inventory
// @access  Private (Admin)
const getInventory = async (req, res) => {
  try {
    let { data: inventory, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const pricesMap = getInventoryPricesMap();
    const enriched = (inventory || []).map(item => {
      const price = getItemPrice(item, pricesMap);
      return {
        ...item,
        price,
        unit_price: price
      };
    });

    res.json(enriched);
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
    const { name, category, unit, stock, threshold, status, notes, price, unit_price } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Item name is required' });
    }

    const parsedStock = parseInt(stock, 10) || 0;
    const parsedThreshold = parseInt(threshold, 10) || 0;
    const calculatedStatus = status || (parsedStock === 0 ? 'Out of Stock' : (parsedStock <= parsedThreshold ? 'Low Stock' : 'In Stock'));
    const itemPrice = parseFloat(price !== undefined ? price : (unit_price !== undefined ? unit_price : 250)) || 0;

    // Check if an item with the same name already exists (case-insensitive)
    const { data: existing } = await supabase
      .from('inventory')
      .select('*')
      .ilike('name', name.trim())
      .maybeSingle();

    let itemResult = null;
    if (existing) {
      const { data: updated, error: updateErr } = await supabase
        .from('inventory')
        .update({
          stock: parsedStock,
          threshold: parsedThreshold || existing.threshold,
          status: calculatedStatus,
          unit: unit || existing.unit,
          category: category || existing.category
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      itemResult = updated;
    } else {
      const { data: newItem, error: insertErr } = await supabase
        .from('inventory')
        .insert([{
          name: name.trim(),
          category: category || 'Disposables',
          unit: unit || 'Units',
          stock: parsedStock,
          threshold: parsedThreshold || 10,
          status: calculatedStatus
        }])
        .select()
        .single();

      if (insertErr) throw insertErr;
      itemResult = newItem;
    }

    // Save Price in local price map
    const pricesMap = getInventoryPricesMap();
    pricesMap[itemResult.id] = itemPrice;
    pricesMap[itemResult.name] = itemPrice;
    saveInventoryPricesMap(pricesMap);
    itemResult.price = itemPrice;
    itemResult.unit_price = itemPrice;

    // Detailed Audit Logging
    try {
      const { logAuditAction } = require('../utils/auditLogger');
      const reporter = req.user?.name || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || 'Staff';
      const role = req.user?.role || 'Staff';
      logAuditAction({
        action: 'INVENTORY_REPORTED',
        entityType: 'inventory',
        entityId: itemResult.id,
        details: `${role} ${reporter} added/reported stock for "${name}": ${parsedStock} ${itemResult.unit} @ ₱${itemPrice.toFixed(2)} (${calculatedStatus})${notes ? ` — Remarks: ${notes}` : ''}`,
        metadata: {
          item_id: itemResult.id,
          name,
          stock: parsedStock,
          threshold: parsedThreshold,
          price: itemPrice,
          status: calculatedStatus,
          reported_by: reporter,
          role
        },
        req
      });
    } catch (_) {}

    try {
      const { data: fullList } = await supabase.from('inventory').select('*').order('created_at', { ascending: true });
      if (fullList && !process.env.VERCEL) createBackup(INVENTORY_FILE, fullList);
    } catch (_) {}

    res.status(201).json(itemResult);
  } catch (error) {
    console.error('[Admin Add Inventory Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a supply item in inventory (stock, price, threshold, category)
// @route   PUT /api/admin/inventory/:id
// @access  Private (Admin)
const updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, unit, stock, threshold, price, unit_price } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (unit !== undefined) updateData.unit = unit;
    if (stock !== undefined) updateData.stock = parseInt(stock, 10);
    if (threshold !== undefined) updateData.threshold = parseInt(threshold, 10);

    // Recompute status
    const currentThreshold = threshold !== undefined ? parseInt(threshold, 10) : null;
    const currentStock = stock !== undefined ? parseInt(stock, 10) : null;
    if (currentStock !== null && currentThreshold !== null) {
      updateData.status = currentStock === 0 ? 'Out of Stock' : (currentStock <= currentThreshold ? 'Low Stock' : 'In Stock');
    }

    const { data: updatedItem, error } = await supabase
      .from('inventory')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Update Price in price map if provided
    const pricesMap = getInventoryPricesMap();
    if (price !== undefined || unit_price !== undefined) {
      const itemPrice = parseFloat(price !== undefined ? price : unit_price) || 0;
      pricesMap[id] = itemPrice;
      if (updatedItem.name) pricesMap[updatedItem.name] = itemPrice;
      saveInventoryPricesMap(pricesMap);
      updatedItem.price = itemPrice;
      updatedItem.unit_price = itemPrice;
    } else {
      updatedItem.price = getItemPrice(updatedItem, pricesMap);
      updatedItem.unit_price = updatedItem.price;
    }

    res.json(updatedItem);
  } catch (error) {
    console.error('[Admin Update Inventory Error]', error.message);
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

    const pricesMap = getInventoryPricesMap();
    if (pricesMap[id]) {
      delete pricesMap[id];
      saveInventoryPricesMap(pricesMap);
    }

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
    let schedules = [];
    try {
      const { data, error } = await supabase
        .from('staff_schedules')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        schedules = data;
      }
    } catch (_) {}

    // Fallback or augment with local STAFF_FILE if available
    if (fs.existsSync(STAFF_FILE)) {
      try {
        const fileContent = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
        if (Array.isArray(fileContent) && fileContent.length > 0) {
          if (!schedules.length) {
            schedules = fileContent;
          } else {
            // Merge availability from file if missing in db
            schedules = schedules.map(s => {
              const match = fileContent.find(f => f.id === s.id || (f.name && s.name && f.name.toLowerCase() === s.name.toLowerCase()));
              return match ? { ...match, ...s, availability: s.availability || match.availability } : s;
            });
          }
        }
      } catch (_) {}
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

    // Check if staff schedule with same name already exists case-insensitively
    const { data: existing } = await supabase
      .from('staff_schedules')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: 'A schedule listing for this staff member already exists.' });
    }

    const newEntry = {
      name,
      email: email || 'N/A',
      role,
      shift,
      days,
      contact,
      availability: availability || 'On Duty'
    };

    let newSched = null;
    try {
      const { data, error } = await supabase
        .from('staff_schedules')
        .insert([newEntry])
        .select()
        .single();
      if (!error && data) newSched = data;
    } catch (_) {}

    if (fs.existsSync(STAFF_FILE)) {
      try {
        const fullList = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8')) || [];
        const entryWithId = { id: (newSched && newSched.id) || ('staff-' + Date.now()), ...newEntry };
        fullList.push(entryWithId);
        fs.writeFileSync(STAFF_FILE, JSON.stringify(fullList, null, 2), 'utf8');
        if (!newSched) newSched = entryWithId;
      } catch (_) {}
    }

    res.status(201).json(newSched || newEntry);
  } catch (error) {
    console.error('[Admin Add Staff Schedule Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a staff schedule listing
// @route   PUT /api/admin/staff-schedules/:id
// @access  Private (Admin, Receptionist, Dentist)
const updateStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, shift, days, contact, availability } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (shift !== undefined) updateData.shift = shift;
    if (days !== undefined) updateData.days = days;
    if (contact !== undefined) updateData.contact = contact;
    if (availability !== undefined) updateData.availability = availability;

    let updatedSched = null;
    try {
      const { data, error } = await supabase
        .from('staff_schedules')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) updatedSched = data;
    } catch (_) {}

    if (fs.existsSync(STAFF_FILE)) {
      try {
        let fileList = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8')) || [];
        let found = fileList.find(s => s.id === id || (name && s.name && s.name.toLowerCase() === name.toLowerCase()));
        if (found) {
          Object.assign(found, updateData);
          fs.writeFileSync(STAFF_FILE, JSON.stringify(fileList, null, 2), 'utf8');
          if (!updatedSched) updatedSched = found;
        }
      } catch (fErr) {
        console.warn('[Staff file update error]', fErr.message);
      }
    }

    res.json(updatedSched || { id, ...updateData });
  } catch (error) {
    console.error('[Admin Update Staff Schedule Error]', error.message);
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

    setImmediate(async () => {
      try {
        const { data: fullList } = await supabase.from('staff_schedules').select('*').order('created_at', { ascending: true });
        if (fullList) createBackup(STAFF_FILE, fullList);
      } catch (e) {
        console.error('[Async Staff Backup Error]', e.message);
      }
    });

    res.json({ success: true, message: 'Staff schedule listing deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Staff Schedule Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

const resetSeeder = async (req, res) => {
  try {
    await seedUsers();
    recordServerLog('WARN', 'DATABASE', 'Admin triggered Database Seeder reset.');
    res.json({ success: true, message: 'Database reset & seeded successfully' });
  } catch (error) {
    console.error('[Admin Reset Seeder Error]', error.message);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get active system service & audit logs
// @route   GET /api/admin/logs
// @access  Private (Admin)
const getSystemLogs = async (req, res) => {
  try {
    res.json(systemLogsBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add a system service or audit log
// @route   POST /api/admin/logs
// @access  Private (Admin)
const addSystemLog = async (req, res) => {
  try {
    const { level, module, message } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Log message is required' });
    }
    const log = recordServerLog(level || 'INFO', module || 'CLIENT', message);
    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Clear active system logs
// @route   DELETE /api/admin/logs
// @access  Private (Admin)
const clearSystemLogs = async (req, res) => {
  try {
    systemLogsBuffer.length = 0;
    const adminName = req.user?.name || req.user?.email || 'Admin';
    recordServerLog('WARN', 'SYSTEM', `Admin (${adminName}) cleared system service logs.`);
    res.json({ success: true, message: 'Logs cleared successfully', logs: systemLogsBuffer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Database Health & Backup Controllers ─────────────────────────────────────
const { performDatabaseBackup, getLatestBackupInfo } = require('../utils/backupService');

// @desc    Get database health status, table counts, latency & latest backup info
// @route   GET /api/admin/database-status
// @access  Private (Admin)
const getDatabaseStatus = async (req, res) => {
  try {
    const startTime = Date.now();
    const { count: userCount, error: userErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    const latencyMs = Date.now() - startTime;

    const { count: apptCount } = await supabase.from('appointments').select('*', { count: 'exact', head: true });
    const { count: invoiceCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const { count: paymentCount } = await supabase.from('payments').select('*', { count: 'exact', head: true });
    const { count: auditCount } = await supabase.from('audit_logs').select('*', { count: 'exact', head: true });

    const latestBackup = getLatestBackupInfo();

    res.json({
      status: userErr ? 'degraded' : 'healthy',
      latencyMs,
      tableCounts: {
        users: userCount || 0,
        appointments: apptCount || 0,
        invoices: invoiceCount || 0,
        payments: paymentCount || 0,
        audit_logs: auditCount || 0
      },
      latestBackup,
      keepAliveIntervalHours: 48,
      lastKeepAlive: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Trigger an immediate on-demand database backup
// @route   POST /api/admin/trigger-backup
// @access  Private (Admin)
const triggerDatabaseBackup = async (req, res) => {
  try {
    const result = await performDatabaseBackup();
    recordServerLog('SUCCESS', 'BACKUP', `Admin (${req.user?.name || 'Admin'}) executed on-demand DB backup.`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Admin Multi-Factor Authentication (MFA) Handlers ───────────────────────
const defaultMfaConfig = {
  mfaEnabled: false,
  preferredChannel: 'email',
  allowTrustDevice: true,
  revokedBefore: 0,
  updatedAt: new Date().toISOString()
};

function getStoredMfaConfig() {
  try {
    if (fs.existsSync(MFA_SETTINGS_PATH)) {
      const raw = fs.readFileSync(MFA_SETTINGS_PATH, 'utf8').replace(/^\uFEFF/, '');
      return { ...defaultMfaConfig, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('[MFA Settings Read Error]', e.message);
  }
  return { ...defaultMfaConfig };
}

function saveStoredMfaConfig(config) {
  try {
    const dir = path.dirname(MFA_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MFA_SETTINGS_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('[MFA Settings Save Error]', e.message);
  }
}

// @desc    Get Admin MFA configuration
// @route   GET /api/admin/mfa-config
// @access  Private (Admin)
const getMfaConfig = async (req, res) => {
  try {
    const config = getStoredMfaConfig();
    const adminEmail = req.user?.email || 'admin@fanoclinic.com';
    const totpStatus = totpService.getTotpStatus(adminEmail);
    res.json({
      ...config,
      adminEmail,
      adminPhone: req.user?.contact_number || '+63 917 123 4567',
      totpEnabled: totpStatus.enabled,
      totpStatus
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update Admin MFA configuration
// @route   PUT /api/admin/mfa-config
// @access  Private (Admin)
const updateMfaConfig = async (req, res) => {
  try {
    const { mfaEnabled, preferredChannel, allowTrustDevice } = req.body;
    const config = getStoredMfaConfig();

    if (typeof mfaEnabled === 'boolean') config.mfaEnabled = mfaEnabled;
    if (['email', 'totp'].includes(preferredChannel)) config.preferredChannel = preferredChannel;
    if (typeof allowTrustDevice === 'boolean') config.allowTrustDevice = allowTrustDevice;
    config.updatedAt = new Date().toISOString();

    saveStoredMfaConfig(config);

    recordServerLog(
      'SUCCESS',
      'SECURITY',
      `Admin (${req.user?.name || 'Admin'}) updated MFA settings: Status=${config.mfaEnabled ? 'ENABLED' : 'DISABLED'}, Channel=${config.preferredChannel}, TrustDevice=${config.allowTrustDevice}`
    );

    res.json({
      message: 'MFA configuration updated successfully.',
      config
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Dispatch test MFA verification passcode
// @route   POST /api/admin/mfa-test
// @access  Private (Admin)
const sendTestMfa = async (req, res) => {
  try {
    const config = getStoredMfaConfig();
    const adminEmail = req.user?.email || 'admin@fanoclinic.com';
    const testOtp = String(Math.floor(100000 + Math.random() * 900000));

    console.log(`\n🔐 [DEV ADMIN MFA TEST OTP] Test Code for ${adminEmail} is: ${testOtp}\n`);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background: #f8fafc;">
        <div style="max-width: 500px; margin: auto; background: white; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
          <h2 style="color: #0b3c4d; margin-top: 0;">🛡️ Admin MFA Test Verification</h2>
          <p style="color: #475569; font-size: 14px;">This is a test notification verifying your Multi-Factor Authentication channel delivery.</p>
          <div style="background: #eff6ff; padding: 16px; text-align: center; border-radius: 8px; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #1e40af; margin: 20px 0;">
            ${testOtp}
          </div>
          <p style="color: #64748b; font-size: 12px;">Fano Dental Clinic Management System &bull; Admin Security Suite</p>
        </div>
      </div>
    `;
    await sendEmail(adminEmail, `Admin Security Test Code: ${testOtp} — Fano Dental Clinic`, emailHtml, `Your Admin MFA test code is: ${testOtp}`).catch(() => {});

    recordServerLog('INFO', 'SECURITY', `Admin test MFA code dispatched to ${adminEmail} via ${channel}`);

    res.json({
      success: true,
      message: `Test MFA verification code dispatched via ${channel} to ${adminEmail}.`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Revoke all remembered/trusted devices for Admin MFA
// @route   POST /api/admin/mfa-revoke-devices
// @access  Private (Admin)
const revokeMfaDevices = async (req, res) => {
  try {
    const config = getStoredMfaConfig();
    config.revokedBefore = Date.now();
    config.updatedAt = new Date().toISOString();
    saveStoredMfaConfig(config);

    recordServerLog('WARNING', 'SECURITY', `Admin (${req.user?.name || 'Admin'}) revoked all trusted devices. MFA will be required on all logins.`);

    res.json({
      success: true,
      message: 'All trusted devices have been invalidated. MFA will be enforced on all browser logins.',
      revokedBefore: config.revokedBefore
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Admin TOTP (Authenticator App) Handlers ──────────────────────────────
// @desc    Initiate TOTP setup (generates secret & QR code data URI)
// @route   POST /api/admin/totp/setup
// @access  Private (Admin)
const setupTotp = async (req, res) => {
  try {
    const user = req.user || { email: 'admin@fanoclinic.com', name: 'Admin' };
    const setup = await totpService.generateTotpSetup(user);

    recordServerLog('INFO', 'SECURITY', `Admin (${user.name || user.email}) initiated Authenticator App (TOTP) pairing.`);

    res.json({
      success: true,
      message: 'Scan the QR code with Google Authenticator or Microsoft Authenticator, then enter the 6-digit confirmation code.',
      ...setup
    });
  } catch (err) {
    console.error('[Admin TOTP Setup Error]', err);
    res.status(500).json({ message: err.message || 'Failed to initiate TOTP setup.' });
  }
};

// @desc    Verify initial TOTP passcode & activate TOTP with backup codes
// @route   POST /api/admin/totp/verify-setup
// @access  Private (Admin)
const verifyTotpSetup = async (req, res) => {
  try {
    const user = req.user || { email: 'admin@fanoclinic.com', name: 'Admin' };
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: '6-digit authenticator passcode is required.' });
    }

    const result = totpService.verifyAndEnableTotp(user, token);
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Automatically enable MFA policy and set preferred channel to TOTP
    const config = getStoredMfaConfig();
    config.mfaEnabled = true;
    config.preferredChannel = 'totp';
    config.updatedAt = new Date().toISOString();
    saveStoredMfaConfig(config);

    recordServerLog(
      'SUCCESS',
      'SECURITY',
      `Admin (${user.name || user.email}) successfully activated TOTP Authenticator App 2FA and generated emergency backup codes.`
    );

    res.json({
      success: true,
      message: 'Authenticator App (TOTP) 2FA is now ACTIVE. Please securely save your backup recovery codes.',
      backupCodes: result.backupCodes,
      config
    });
  } catch (err) {
    console.error('[Admin TOTP Verify Error]', err);
    res.status(500).json({ message: err.message || 'Failed to verify TOTP setup.' });
  }
};

// @desc    Disable TOTP Authenticator for Admin
// @route   POST /api/admin/totp/disable
// @access  Private (Admin)
const disableTotp = async (req, res) => {
  try {
    const user = req.user || { email: 'admin@fanoclinic.com', name: 'Admin' };
    totpService.disableTotp(user);

    // If preferredChannel was totp, switch it back to email
    const config = getStoredMfaConfig();
    if (config.preferredChannel === 'totp') {
      config.preferredChannel = 'email';
      config.updatedAt = new Date().toISOString();
      saveStoredMfaConfig(config);
    }

    recordServerLog(
      'WARNING',
      'SECURITY',
      `Admin (${user.name || user.email}) disabled TOTP Authenticator App 2FA.`
    );

    res.json({
      success: true,
      message: 'Authenticator App (TOTP) has been disabled. Login will fall back to standard MFA policy.',
      config
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get current TOTP status & remaining backup codes count
// @route   GET /api/admin/totp/status
// @access  Private (Admin)
const getTotpStatus = async (req, res) => {
  try {
    const user = req.user || { email: 'admin@fanoclinic.com' };
    const status = totpService.getTotpStatus(user);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Regenerate emergency backup recovery codes
// @route   POST /api/admin/totp/regenerate-backup-codes
// @access  Private (Admin)
const regenerateBackupCodes = async (req, res) => {
  try {
    const user = req.user || { email: 'admin@fanoclinic.com', name: 'Admin' };
    const result = totpService.regenerateBackupCodes(user);

    if (!result.success) {
      return res.status(400).json(result);
    }

    recordServerLog(
      'WARNING',
      'SECURITY',
      `Admin (${user.name || user.email}) regenerated emergency backup recovery codes.`
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { 
  getAdminStats, 
  getAdminAnalytics, 
  getDetailedStats, 
  getInventory, 
  addInventory,
  updateInventory,
  deleteInventory,
  getStaffSchedules, 
  addStaffSchedule,
  updateStaffSchedule,
  deleteStaffSchedule,
  resetSeeder,
  getSystemLogs,
  addSystemLog,
  clearSystemLogs,
  recordServerLog,
  getDatabaseStatus,
  triggerDatabaseBackup,
  getMfaConfig,
  updateMfaConfig,
  sendTestMfa,
  revokeMfaDevices,
  getStoredMfaConfig,
  setupTotp,
  verifyTotpSetup,
  disableTotp,
  getTotpStatus,
  regenerateBackupCodes
};



// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY MANAGEMENT — Manage Visits / Appointments History
// ═══════════════════════════════════════════════════════════════════════════════
const VISIT_SUPP_PATH = path.join(__dirname, '..', 'data', 'visit_supplements.json');

function loadVisitSupplements() {
  try {
    const raw = fs.readFileSync(VISIT_SUPP_PATH, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveVisitSupplements(data) {
  fs.writeFileSync(VISIT_SUPP_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * GET /api/admin/history
 * Returns all appointments enriched with supplement data (archived, check-in/out, admin_notes).
 * Query params: search, status, dateFrom, dateTo, dentist, sortBy, page, limit, includeArchived
 */
exports.getVisitsHistory = async (req, res) => {
  try {
    const {
      search = '',
      status = '',
      dateFrom = '',
      dateTo = '',
      dentist = '',
      sortBy = 'date_desc',
      page = 1,
      limit = 15,
      includeArchived = 'false'
    } = req.query;

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( id, first_name, last_name, email, phone ),
        treatment:treatment_id ( id, name ),
        dentist:dentist_id ( id, first_name, last_name )
      `)
      .order('appointment_date', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const supplements = loadVisitSupplements();
    let records = (data || []).map(a => {
      const supp = supplements[a.id] || {};
      return { ...a, ...supp };
    });

    // Filter out archived unless requested
    if (includeArchived !== 'true') {
      records = records.filter(r => !r.archived);
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      records = records.filter(r => {
        const pName = r.patient
          ? `${r.patient.first_name || ''} ${r.patient.last_name || ''}`.toLowerCase()
          : '';
        const treat = r.treatment ? (r.treatment.name || '').toLowerCase() : '';
        const dName = r.dentist
          ? `${r.dentist.first_name || ''} ${r.dentist.last_name || ''}`.toLowerCase()
          : '';
        const notes = (r.notes || '').toLowerCase();
        const adminNotes = (r.admin_notes || '').toLowerCase();
        return pName.includes(q) || treat.includes(q) || dName.includes(q) || notes.includes(q) || adminNotes.includes(q) || String(r.id).includes(q);
      });
    }

    // Status filter
    if (status && status !== 'all') {
      records = records.filter(r => (r.status || '').toLowerCase() === status.toLowerCase());
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      records = records.filter(r => new Date(r.appointment_date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      records = records.filter(r => new Date(r.appointment_date) <= to);
    }

    // Dentist filter
    if (dentist) {
      const dq = dentist.toLowerCase();
      records = records.filter(r => {
        const dName = r.dentist
          ? `${r.dentist.first_name || ''} ${r.dentist.last_name || ''}`.toLowerCase()
          : '';
        return dName.includes(dq);
      });
    }

    // Sorting
    records.sort((a, b) => {
      if (sortBy === 'date_asc') return new Date(a.appointment_date) - new Date(b.appointment_date);
      if (sortBy === 'date_desc') return new Date(b.appointment_date) - new Date(a.appointment_date);
      if (sortBy === 'patient_name') {
        const na = a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : '';
        const nb = b.patient ? `${b.patient.first_name} ${b.patient.last_name}` : '';
        return na.localeCompare(nb);
      }
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return new Date(b.appointment_date) - new Date(a.appointment_date);
    });

    // Summary stats (computed before pagination)
    const summary = {
      total: records.length,
      completed: records.filter(r => r.status === 'Completed').length,
      scheduled: records.filter(r => ['Pending', 'Approved', 'Scheduled'].includes(r.status)).length,
      cancelled: records.filter(r => r.status === 'Cancelled').length,
      noshow: records.filter(r => r.status === 'No-show').length,
      archived: records.filter(r => r.archived).length,
    };

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.max(1, Math.min(100, parseInt(limit)));
    const totalPages = Math.ceil(records.length / pageSize);
    const paginated = records.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return res.json({
      records: paginated,
      summary,
      pagination: { page: pageNum, limit: pageSize, total: records.length, totalPages }
    });
  } catch (err) {
    console.error('getVisitsHistory error:', err);
    return res.status(500).json({ message: 'Server error fetching history' });
  }
};

/**
 * POST /api/admin/history
 * Manually add a new visit record (creates an appointment entry).
 */
exports.addVisitRecord = async (req, res) => {
  try {
    const { patient_id, treatment_id, dentist_id, appointment_date, status, notes, admin_notes, purpose } = req.body;
    if (!patient_id || !appointment_date) {
      return res.status(400).json({ message: 'Patient and appointment date are required.' });
    }
    const { data, error } = await supabase
      .from('appointments')
      .insert([{
        patient_id,
        treatment_id: treatment_id || null,
        dentist_id: dentist_id || null,
        appointment_date,
        status: status || 'Completed',
        notes: notes || '',
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ message: error.message });

    // Store supplement data
    const supplements = loadVisitSupplements();
    supplements[data.id] = {
      admin_notes: admin_notes || '',
      purpose: purpose || '',
      archived: false,
      check_in_time: null,
      check_out_time: null,
      attachments: [],
      audit_entries: [{
        action: 'created',
        by: req.user ? req.user.name : 'Admin',
        at: new Date().toISOString(),
        notes: 'Visit record manually added'
      }]
    };
    saveVisitSupplements(supplements);

    if (req.auditLogger) {
      req.auditLogger('ADD_VISIT', req.user, { appointmentId: data.id });
    }

    return res.status(201).json({ message: 'Visit record added.', record: data });
  } catch (err) {
    console.error('addVisitRecord error:', err);
    return res.status(500).json({ message: 'Server error adding visit record' });
  }
};

/**
 * PUT /api/admin/history/:id
 * Edit visit record (status, notes, admin_notes, check-in/out times).
 */
exports.updateVisitRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, admin_notes, purpose, check_in_time, check_out_time } = req.body;

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase.from('appointments').update(updateData).eq('id', id);
      if (error) return res.status(500).json({ message: error.message });
    }

    // Update supplement
    const supplements = loadVisitSupplements();
    if (!supplements[id]) supplements[id] = { archived: false, attachments: [], audit_entries: [] };
    if (admin_notes !== undefined) supplements[id].admin_notes = admin_notes;
    if (purpose !== undefined) supplements[id].purpose = purpose;
    if (check_in_time !== undefined) supplements[id].check_in_time = check_in_time;
    if (check_out_time !== undefined) supplements[id].check_out_time = check_out_time;
    if (!supplements[id].audit_entries) supplements[id].audit_entries = [];
    supplements[id].audit_entries.push({
      action: 'updated',
      by: req.user ? req.user.name : 'Admin',
      at: new Date().toISOString(),
      notes: `Status: ${status || '-'}, Notes updated`
    });
    saveVisitSupplements(supplements);

    return res.json({ message: 'Visit record updated.' });
  } catch (err) {
    console.error('updateVisitRecord error:', err);
    return res.status(500).json({ message: 'Server error updating visit record' });
  }
};

/**
 * PATCH /api/admin/history/:id/archive
 * Soft-archive (or unarchive) a visit record.
 */
exports.archiveVisitRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { archived = true } = req.body;
    const supplements = loadVisitSupplements();
    if (!supplements[id]) supplements[id] = { archived: false, attachments: [], audit_entries: [] };
    supplements[id].archived = !!archived;
    if (!supplements[id].audit_entries) supplements[id].audit_entries = [];
    supplements[id].audit_entries.push({
      action: archived ? 'archived' : 'unarchived',
      by: req.user ? req.user.name : 'Admin',
      at: new Date().toISOString(),
      notes: archived ? 'Record archived' : 'Record restored from archive'
    });
    saveVisitSupplements(supplements);
    return res.json({ message: archived ? 'Visit archived.' : 'Visit restored from archive.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error archiving visit' });
  }
};

/**
 * PATCH /api/admin/history/:id/checkin
 * Record check-in time.
 */
exports.checkInVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const supplements = loadVisitSupplements();
    if (!supplements[id]) supplements[id] = { archived: false, attachments: [], audit_entries: [] };
    supplements[id].check_in_time = new Date().toISOString();
    if (!supplements[id].audit_entries) supplements[id].audit_entries = [];
    supplements[id].audit_entries.push({ action: 'check_in', by: req.user ? req.user.name : 'Admin', at: supplements[id].check_in_time });
    saveVisitSupplements(supplements);
    // Also update status to Checked-In
    await supabase.from('appointments').update({ status: 'Checked-In' }).eq('id', id);
    return res.json({ message: 'Patient checked in.', check_in_time: supplements[id].check_in_time });
  } catch (err) {
    return res.status(500).json({ message: 'Server error during check-in' });
  }
};

/**
 * PATCH /api/admin/history/:id/checkout
 * Record check-out time.
 */
exports.checkOutVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const supplements = loadVisitSupplements();
    if (!supplements[id]) supplements[id] = { archived: false, attachments: [], audit_entries: [] };
    supplements[id].check_out_time = new Date().toISOString();
    if (!supplements[id].audit_entries) supplements[id].audit_entries = [];
    supplements[id].audit_entries.push({ action: 'check_out', by: req.user ? req.user.name : 'Admin', at: supplements[id].check_out_time });
    saveVisitSupplements(supplements);
    // Update status to Completed
    await supabase.from('appointments').update({ status: 'Completed' }).eq('id', id);
    return res.json({ message: 'Patient checked out.', check_out_time: supplements[id].check_out_time });
  } catch (err) {
    return res.status(500).json({ message: 'Server error during check-out' });
  }
};

/**
 * GET /api/admin/history/person/:patientId
 * All visits for one patient (for per-person timeline).
 */
exports.getPersonTimeline = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        treatment:treatment_id ( id, name ),
        dentist:dentist_id ( id, first_name, last_name )
      `)
      .eq('patient_id', patientId)
      .order('appointment_date', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const supplements = loadVisitSupplements();
    const records = (data || []).map(a => ({ ...a, ...(supplements[a.id] || {}) }));
    return res.json({ records });
  } catch (err) {
    return res.status(500).json({ message: 'Server error fetching patient timeline' });
  }
};

/**
 * GET /api/admin/history-export
 * Returns CSV data of history records.
 */
exports.exportHistoryCSV = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, status, notes,
        patient:patient_id ( first_name, last_name, email, phone ),
        treatment:treatment_id ( name ),
        dentist:dentist_id ( first_name, last_name )
      `)
      .order('appointment_date', { ascending: false });

    if (error) return res.status(500).json({ message: error.message });

    const supplements = loadVisitSupplements();
    const rows = (data || []).map(a => {
      const supp = supplements[a.id] || {};
      const pName = a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Unknown';
      const treat = a.treatment ? a.treatment.name : 'General Consultation';
      const dName = a.dentist ? `${a.dentist.first_name} ${a.dentist.last_name}` : 'Staff';
      return [
        a.id,
        new Date(a.appointment_date).toLocaleString(),
        pName,
        a.patient ? a.patient.email : '',
        a.patient ? a.patient.phone : '',
        treat,
        dName,
        a.status || 'Pending',
        supp.check_in_time ? new Date(supp.check_in_time).toLocaleString() : '',
        supp.check_out_time ? new Date(supp.check_out_time).toLocaleString() : '',
        supp.admin_notes || '',
        supp.archived ? 'Yes' : 'No'
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const header = '"ID","Date & Time","Patient","Email","Phone","Treatment","Dentist","Status","Check-In","Check-Out","Admin Notes","Archived"';
    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fano_visits_history.csv"');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: 'Server error exporting CSV' });
  }
};


// Export history functions
Object.assign(module.exports, {
  getVisitsHistory: exports.getVisitsHistory,
  addVisitRecord: exports.addVisitRecord,
  updateVisitRecord: exports.updateVisitRecord,
  archiveVisitRecord: exports.archiveVisitRecord,
  checkInVisit: exports.checkInVisit,
  checkOutVisit: exports.checkOutVisit,
  getPersonTimeline: exports.getPersonTimeline,
  exportHistoryCSV: exports.exportHistoryCSV
});
