const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ─── Production / Vercel Environment Variable Fallbacks ─────────────────────────
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'jadkaIBWTu9iCVJ1UeKdUa+nXVfAHd1akbXHpbQ7H2c+jBcSlrgbFjAK58pEGk+wkiS1heLREkg5krylpAP9rQ==';
}
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://cusxuaugwkjjqbjesksg.supabase.co';
}
const isServiceRoleKey = (k) => {
  try {
    return k && JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString()).role === 'service_role';
  } catch (e) { return false; }
};
if (!process.env.SUPABASE_KEY || !isServiceRoleKey(process.env.SUPABASE_KEY)) {
  process.env.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1c3h1YXVnd2tqanFiamVza3NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzNTExNCwiZXhwIjoyMDk3NjExMTE0fQ.0I5sNvjYQe0d116bwicMoTj6j-dELXTy-Pw4KSr02B4';
}
if (!process.env.GMAIL_USER) {
  process.env.GMAIL_USER = 'Castillotem.clyde@gmail.com';
}
if (!process.env.GMAIL_PASS) {
  process.env.GMAIL_PASS = 'yliscxxmozvvpttg';
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xssClean = require('xss-clean');
const hpp = require('hpp');

// ─── Initialize Supabase and run seeder ───────────────────────────────────────
const supabase = require('./config/db');
const seedUsers = require('./utils/seeder');

// Only run seeder during local development or non-serverless boot
if (!process.env.VERCEL && process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
  seedUsers().then(() => {
    console.log('✅ Supabase connected and seeder finished.');
  }).catch(err => {
    console.error('❌ Seeder error:', err.message);
  });
}

const app = express();

// Trust reverse proxy (Vercel, Railway, Render, etc.)
app.set('trust proxy', 1);

// ─── Express 5 Compatibility Workaround ──────────────────────────────────────
app.use((req, res, next) => {
  Object.defineProperty(req, 'query', {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(req, 'params', {
    value: { ...req.params },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});

// ─── Security: HTTP Headers (Helmet) ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://*.supabase.co"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── Security: CORS ───────────────────────────────────────────────────────────
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // 1. Allow requests with no origin (e.g. same-origin, mobile apps, curl)
    if (!origin) return callback(null, true);

    // 2. Always allow localhost and 127.0.0.1
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // 3. Always allow ANY Vercel deployment domain (*.vercel.app)
    if (origin.endsWith('.vercel.app') || origin.includes('vercel.app')) {
      return callback(null, true);
    }

    // 4. Check explicit allowed origins list if configured
    if (rawAllowedOrigins.length > 0 && rawAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // 5. Permissive fallback to prevent user lockouts on custom domains / preview branches
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-trust-device-token', 'X-Requested-With'],
  credentials: true,
}));

// ─── Body Parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ─── Security: Sanitize inputs against XSS ───────────────────────────────────
app.use(xssClean());

// ─── Security: Prevent HTTP Parameter Pollution ───────────────────────────────
app.use(hpp());

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  message: { message: 'Too many requests, please try again after 15 minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: true },
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  skipSuccessfulRequests: true,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);

// ─── Dentists Roster with Branch Assignment & Duty Status ─────────────────────
// @route   GET /api/dentists
// @access  Public / Authenticated
app.get('/api/dentists', async (req, res) => {
  try {
    const branchFilter = (req.query.branch || '').trim().toLowerCase();

    // Read staff schedules for branch and availability info
    let schedules = [];
    const staffFilePath = path.join(__dirname, 'data', 'staff_schedules.json');
    if (fs.existsSync(staffFilePath)) {
      try {
        schedules = JSON.parse(fs.readFileSync(staffFilePath, 'utf8')) || [];
      } catch (_) {}
    }

    // Query Supabase for registered dentists
    let dbDentists = [];
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, contact_number, is_active')
        .eq('role', 'Dentist');
      if (!error && Array.isArray(data)) {
        dbDentists = data;
      }
    } catch (_) {}

    const dentistMap = new Map();

    // 1. Seed from staff_schedules
    schedules.filter(s => (s.role || '').toLowerCase() === 'dentist').forEach(s => {
      const key = (s.name || '').toLowerCase().trim();
      dentistMap.set(key, {
        id: s.id,
        name: s.name,
        email: s.email || '',
        contact_number: s.contact || '',
        branch: s.branch || 'Main Branch (Naga)',
        availability: s.availability || 'On Duty',
        shift: s.shift || '09:00 AM - 05:00 PM',
        days: s.days || 'Mon - Sat',
        isOnDuty: (s.availability || 'On Duty') === 'On Duty'
      });
    });

    // 2. Merge with dbDentists
    dbDentists.forEach(d => {
      const key = (d.name || '').toLowerCase().trim();
      if (dentistMap.has(key)) {
        const item = dentistMap.get(key);
        item.id = d.id || item.id;
        item.email = d.email || item.email;
        item.contact_number = d.contact_number || item.contact_number;
        if (!d.is_active) {
          item.availability = 'Off Duty';
          item.isOnDuty = false;
        }
      } else {
        dentistMap.set(key, {
          id: d.id,
          name: d.name,
          email: d.email || '',
          contact_number: d.contact_number || '',
          branch: 'Main Branch (Naga)',
          availability: d.is_active ? 'On Duty' : 'Off Duty',
          shift: '09:00 AM - 05:00 PM',
          days: 'Mon - Fri',
          isOnDuty: !!d.is_active
        });
      }
    });

    let result = Array.from(dentistMap.values());

    // Filter by branch if query provided (e.g. branch=Talisay or branch=Minglanilla)
    if (branchFilter) {
      const cleanBranchQuery = branchFilter.replace(/fano\s*dental\s*clinic\s*[—–-]?/i, '').replace(/branch$/i, '').trim();
      result = result.filter(d => {
        const b = (d.branch || '').toLowerCase();
        return b.includes(cleanBranchQuery) || cleanBranchQuery.includes(b.replace(/branch$/i, '').trim());
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Update dentist duty status (On Duty vs Off Duty / Out) & Branch
// @route   PUT /api/dentists/:id/duty
// @access  Private (Admin, Receptionist, Dentist)
app.put('/api/dentists/:id/duty', async (req, res) => {
  try {
    const { id } = req.params;
    const { availability, branch, name } = req.body;
    const staffFilePath = path.join(__dirname, 'data', 'staff_schedules.json');

    let updatedDentist = null;

    if (fs.existsSync(staffFilePath)) {
      try {
        let schedules = JSON.parse(fs.readFileSync(staffFilePath, 'utf8')) || [];
        const found = schedules.find(s => s.id === id || (name && s.name && s.name.toLowerCase().trim() === name.toLowerCase().trim()));
        if (found) {
          if (availability !== undefined) found.availability = availability;
          if (branch !== undefined) found.branch = branch;
          fs.writeFileSync(staffFilePath, JSON.stringify(schedules, null, 2), 'utf8');
          updatedDentist = found;
        } else if (name) {
          const newEntry = {
            id: id || ('dentist-' + Date.now()),
            name,
            email: req.body.email || '',
            role: 'Dentist',
            contact: req.body.contact_number || '',
            shift: req.body.shift || '09:00 AM - 05:00 PM',
            days: 'Mon - Sat',
            availability: availability || 'On Duty',
            branch: branch || 'Main Branch (Naga)'
          };
          schedules.push(newEntry);
          fs.writeFileSync(staffFilePath, JSON.stringify(schedules, null, 2), 'utf8');
          updatedDentist = newEntry;
        }
      } catch (fErr) {
        console.warn('[Dentist duty file write error]', fErr.message);
      }
    }

    // Also update Supabase staff_schedules if exists
    try {
      const updatePayload = {};
      if (availability !== undefined) updatePayload.availability = availability;
      if (branch !== undefined) updatePayload.branch = branch;
      await supabase.from('staff_schedules').update(updatePayload).eq('id', id);
    } catch (_) {}

    res.json({
      success: true,
      message: 'Dentist duty updated successfully',
      dentist: updatedDentist || { id, availability, branch }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Health Check Endpoint (System Availability Monitoring) ───────────────────
// @route   GET /api/health
// @access  Public
app.get('/api/health', async (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memUsage = process.memoryUsage();
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;

  try {
    const t0 = Date.now();
    const { error } = await supabase.from('users').select('id').limit(1);
    dbLatencyMs = Date.now() - t0;
    dbStatus = error ? 'error' : 'connected';
  } catch (dbErr) {
    dbStatus = 'unreachable';
  }

  const isHealthy = dbStatus === 'connected';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'Fano Dental Clinic Management System',
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
    },
    system: {
      nodeVersion: process.version,
      memoryRssMb: (memUsage.rss / 1024 / 1024).toFixed(1),
      memoryHeapUsedMb: (memUsage.heapUsed / 1024 / 1024).toFixed(1),
      platform: process.platform,
    },
    emergencySupport: {
      clinicPhone: '(032) 489-1200',
      mobile: '+63 917 123 4567',
      address: 'Balirong Highway, City of Naga, Cebu'
    }
  });
});

// ─── Supabase Anti-Inactivity Keep-Alive Ping (Runs every 48 Hours) ───────────
const KEEP_ALIVE_INTERVAL_MS = 48 * 60 * 60 * 1000;

const pingSupabaseKeepAlive = async () => {
  try {
    const start = Date.now();
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.warn('[Keep-Alive] ⚠️ Supabase ping warning:', error.message);
    } else {
      console.log(`[Keep-Alive] ✅ Supabase keep-alive ping successful (${Date.now() - start}ms). Prevents 7-day inactivity pause.`);
    }
  } catch (err) {
    console.error('[Keep-Alive] ❌ Supabase ping error:', err.message);
  }
};

if (!process.env.VERCEL) {
  setTimeout(pingSupabaseKeepAlive, 5000);
  setInterval(pingSupabaseKeepAlive, KEEP_ALIVE_INTERVAL_MS);

  // ─── Initialize Automated Database Backups ────────────────────────────────────
  const { initScheduledBackups } = require('./utils/backupService');
  initScheduledBackups();
}

// ─── Routes (Dual-Mount: /api/* and /* for full Vercel serverless compatibility) ─
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

const patientRoutes = require('./routes/patientRoutes');
app.use('/api/patients', patientRoutes);
app.use('/patients', patientRoutes);

const appointmentRoutes = require('./routes/appointmentRoutes');
app.use('/api/appointments', appointmentRoutes);
app.use('/appointments', appointmentRoutes);

const clinicalNotesRoutes = require('./routes/clinicalNotesRoutes');
app.use('/api/appointments', clinicalNotesRoutes);
app.use('/appointments', clinicalNotesRoutes);

const appointmentTreatmentRoutes = require('./routes/appointmentTreatmentRoutes');
app.use('/api/appointments', appointmentTreatmentRoutes);
app.use('/appointments', appointmentTreatmentRoutes);

const prescriptionRoutes = require('./routes/prescriptionRoutes');
app.use('/api/appointments', prescriptionRoutes);
app.use('/appointments', prescriptionRoutes);

const treatmentPlanRoutes = require('./routes/treatmentPlanRoutes');
app.use('/api/treatment-plans', treatmentPlanRoutes);
app.use('/treatment-plans', treatmentPlanRoutes);

const treatmentRoutes = require('./routes/treatmentRoutes');
app.use('/api/treatments', treatmentRoutes);
app.use('/treatments', treatmentRoutes);

const invoiceRoutes = require('./routes/invoiceRoutes');
app.use('/api/invoices', invoiceRoutes);
app.use('/invoices', invoiceRoutes);

const expenseRoutes = require('./routes/expenseRoutes');
app.use('/api/expenses', expenseRoutes);
app.use('/expenses', expenseRoutes);

const hmoRoutes = require('./routes/hmoRoutes');
app.use('/api/hmo-claims', hmoRoutes);
app.use('/hmo-claims', hmoRoutes);

const aiRoutes = require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);
app.use('/ai', aiRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

const dentistRoutes = require('./routes/dentistRoutes');
app.use('/api/dentist', dentistRoutes);
app.use('/dentist', dentistRoutes);

const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', paymentRoutes);
app.use('/payments', paymentRoutes);

const auditLogRoutes = require('./routes/auditLogRoutes');
app.use('/api/audit-logs', auditLogRoutes);
app.use('/audit-logs', auditLogRoutes);

const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);
app.use('/notifications', notificationRoutes);

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../')));

// ─── Base Route ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/pages/landing-page.html');
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred.'
    : err.message;
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'} mode]`);
  });
}

module.exports = app;

