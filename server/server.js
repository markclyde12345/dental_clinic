const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xssClean = require('xss-clean');
const hpp = require('hpp');

// ─── Initialize Supabase and run seeder ───────────────────────────────────────
const supabase = require('./config/db');
const seedUsers = require('./utils/seeder');

if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')) {
  seedUsers().then(() => {
    console.log('✅ Supabase connected and seeder finished.');
  }).catch(err => {
    console.error('❌ Seeder error:', err.message);
  });
} else {
  console.warn('⚠️  Supabase is not configured. Please add SUPABASE_URL and SUPABASE_KEY to your .env file.');
}

const app = express();

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
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://*.tile.openstreetmap.org"],
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
    // Allow requests with no origin (e.g. mobile apps, same-origin, curl)
    if (!origin) return callback(null, true);

    if (rawAllowedOrigins.length > 0) {
      if (rawAllowedOrigins.includes(origin)) return callback(null, true);
    } else {
      // Default: allow localhost, 127.0.0.1, and vercel preview/prod domains
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    callback(new Error('CORS policy: origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── Body Parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── Security: Sanitize inputs against XSS ───────────────────────────────────
app.use(xssClean());

// ─── Security: Prevent HTTP Parameter Pollution ───────────────────────────────
app.use(hpp());

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again after 15 minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  skipSuccessfulRequests: true,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);
app.use('/api/auth/verify-otp', authLimiter);

app.get('/api/dentists', async (req, res) => {
  try {
    const { data: dentists, error } = await supabase
      .from('users')
      .select('id, name, email, contact_number')
      .eq('role', 'Dentist')
      .eq('is_active', true);

    if (error) throw error;
    res.json(dentists || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/patients', require('./routes/patientRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/appointments', require('./routes/clinicalNotesRoutes'));
app.use('/api/appointments', require('./routes/appointmentTreatmentRoutes'));
app.use('/api/appointments', require('./routes/prescriptionRoutes'));
app.use('/api/treatment-plans', require('./routes/treatmentPlanRoutes'));
app.use('/api/treatments', require('./routes/treatmentRoutes'));
app.use('/api/invoices', require('./routes/invoiceRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/dentist', require('./routes/dentistRoutes'));

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

