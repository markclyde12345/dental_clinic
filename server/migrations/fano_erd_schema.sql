-- =========================================================================
-- FANO: DENTAL CLINIC MANAGEMENT SYSTEM WITH DATA ANALYTICS
-- FIGURE 6: ENTITY RELATIONSHIP DIAGRAM (ERD) SCHEMA
-- =========================================================================
-- Database Engine: PostgreSQL / Supabase
-- Primary Keys (PK): UUID / Serial
-- Foreign Keys (FK): Enforced with Referential Integrity & Cascades
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ROLE TABLE (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS roles (
  role_id      SERIAL PRIMARY KEY,
  rolename     VARCHAR(50) UNIQUE NOT NULL,
  description  TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Default System Roles
INSERT INTO roles (rolename, description) VALUES
  ('Admin', 'Complete system administration and clinical security oversight'),
  ('Dentist', 'Doctor practitioner managing odontogram, treatment plans, and prescriptions'),
  ('Receptionist', 'Front desk staff managing queues, bookings, and cashier bills'),
  ('Dental Assistant', 'Clinical operatory support and chair preparation'),
  ('Accounting', 'Financial ledger, invoicing, and clinic expense management'),
  ('Patient', 'Registered client booking appointments and accessing records')
ON CONFLICT (rolename) DO NOTHING;

-- 2. USERS TABLE (Authentication & Account Profiles)
CREATE TABLE IF NOT EXISTS users (
  user_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id        INT REFERENCES roles(role_id) ON DELETE SET NULL,
  full_name      VARCHAR(100) NOT NULL,
  role           VARCHAR(30) NOT NULL,
  email          VARCHAR(100) UNIQUE NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  contact_number VARCHAR(20),
  address        TEXT,
  active         BOOLEAN DEFAULT TRUE,
  is_verified    BOOLEAN DEFAULT FALSE,
  otp_code       VARCHAR(10),
  otp_expires    TIMESTAMP WITH TIME ZONE,
  otp_attempts   INT DEFAULT 0,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. STAFF TABLE (Clinical and Administrative Personnel)
CREATE TABLE IF NOT EXISTS staff (
  staff_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(100),
  phone       VARCHAR(20),
  role        VARCHAR(50) NOT NULL,
  license_no  VARCHAR(50),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. DENTIST TABLE (Licensed Dental Specialists)
CREATE TABLE IF NOT EXISTS dentist (
  dentist_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id        UUID REFERENCES staff(staff_id) ON DELETE SET NULL,
  name            VARCHAR(100) NOT NULL,
  specialization  VARCHAR(100) DEFAULT 'General Dentistry',
  schedule_at     VARCHAR(100) DEFAULT 'Mon - Sat: 9:00 AM - 6:00 PM',
  status          VARCHAR(30) DEFAULT 'Active',
  type            VARCHAR(50) DEFAULT 'In-House Doctor',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. SCHEDULE TABLE (Operatory & Availability Slots)
CREATE TABLE IF NOT EXISTS schedule (
  schedule_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week   VARCHAR(20) NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  status        VARCHAR(30) DEFAULT 'Active',
  is_available  BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. PATIENT TABLE (Electronic Health Patient Records)
CREATE TABLE IF NOT EXISTS patient (
  patient_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES users(user_id) ON DELETE CASCADE,
  first_name     VARCHAR(50) NOT NULL,
  last_name      VARCHAR(50) NOT NULL,
  date_of_birth  DATE,
  email          VARCHAR(100),
  address        TEXT,
  contact_no     VARCHAR(20),
  gender         VARCHAR(20),
  blood_type     VARCHAR(10),
  allergies      TEXT[] DEFAULT '{}',
  active         BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. APPOINTMENT TABLE (Consultation & Clinical Visits)
CREATE TABLE IF NOT EXISTS appointment (
  appointment_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(user_id) ON DELETE SET NULL,
  patient_id        UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  dentist_id        UUID REFERENCES dentist(dentist_id) ON DELETE SET NULL,
  schedule_id       UUID REFERENCES schedule(schedule_id) ON DELETE SET NULL,
  appointment_time  TIME,
  schedule_at       DATE NOT NULL,
  status            VARCHAR(30) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled')),
  type              VARCHAR(50) DEFAULT 'Consultation',
  notes             TEXT,
  clinical_notes    TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TREATMENT TABLE (Clinical Procedures Rendered)
CREATE TABLE IF NOT EXISTS treatment (
  treatment_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID REFERENCES appointment(appointment_id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  procedure_name  VARCHAR(100) NOT NULL,
  tooth_number    VARCHAR(10),
  notes           TEXT,
  price_charged   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  performed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. PRESCRIPTION TABLE (Medical Rx Dosages)
CREATE TABLE IF NOT EXISTS prescription (
  prescription_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  treatment_id     UUID REFERENCES treatment(treatment_id) ON DELETE CASCADE,
  appointment_id   UUID REFERENCES appointment(appointment_id) ON DELETE CASCADE,
  patient_id       UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  medication       VARCHAR(100) NOT NULL,
  dosage           VARCHAR(50),
  frequency        VARCHAR(50),
  duration_days    INT DEFAULT 7,
  instructions     TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. INVOICE TABLE (Billing Statements & Payments)
CREATE TABLE IF NOT EXISTS invoice (
  invoice_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  appointment_id  UUID REFERENCES appointment(appointment_id) ON DELETE SET NULL,
  total_amount    DECIMAL(10,2) NOT NULL,
  tax             DECIMAL(10,2) DEFAULT 0.00,
  status          VARCHAR(30) DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Partial', 'Cancelled')),
  issued_date     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_date       TIMESTAMP WITH TIME ZONE
);

-- 11. NOTIFICATION TABLE (System Alerts & Reminders)
CREATE TABLE IF NOT EXISTS notification (
  notification_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id       UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  channel          VARCHAR(30) DEFAULT 'Email',
  message          TEXT NOT NULL,
  status           VARCHAR(30) DEFAULT 'Sent',
  sent_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. FEEDBACK TABLE (Post-Visit Patient Reviews)
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID REFERENCES appointment(appointment_id) ON DELETE CASCADE,
  patient_id      UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  ratings         INT CHECK (ratings BETWEEN 1 AND 5),
  comments        TEXT,
  submitted_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. MEDICAL_HISTORY TABLE (Historical Clinical Record Timeline)
CREATE TABLE IF NOT EXISTS medical_history (
  history_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id    UUID REFERENCES patient(patient_id) ON DELETE CASCADE,
  full_name     VARCHAR(100),
  dentist_name  VARCHAR(100),
  schedule      VARCHAR(50),
  status        VARCHAR(30) DEFAULT 'Completed',
  recorded_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. ANALYTICS TABLE (Pre-Computed Clinic Metrics)
CREATE TABLE IF NOT EXISTS analytics (
  analytics_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_appointment  INT DEFAULT 0,
  new_patient        INT DEFAULT 0,
  total_revenue      DECIMAL(12,2) DEFAULT 0.00,
  avg_rating         DECIMAL(3,2) DEFAULT 5.00,
  treatment_done     INT DEFAULT 0,
  calculated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── OPTIONAL / ADVANCED CLINICAL EXTENSIONS ─────────────────────────────
-- (Odontogram Interactive Dental Chart)
CREATE TABLE IF NOT EXISTS dental_charts (
  chart_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id  UUID REFERENCES patient(patient_id) ON DELETE CASCADE UNIQUE,
  chart_type  VARCHAR(20) DEFAULT 'adult' CHECK (chart_type IN ('adult', 'pediatric')),
  teeth_data  JSONB DEFAULT '{}'::jsonb,
  notes       TEXT,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable Row Level Security (RLS) for testing environment
ALTER TABLE roles            DISABLE ROW LEVEL SECURITY;
ALTER TABLE users            DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff            DISABLE ROW LEVEL SECURITY;
ALTER TABLE dentist          DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule         DISABLE ROW LEVEL SECURITY;
ALTER TABLE patient          DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointment      DISABLE ROW LEVEL SECURITY;
ALTER TABLE treatment        DISABLE ROW LEVEL SECURITY;
ALTER TABLE prescription     DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoice          DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification     DISABLE ROW LEVEL SECURITY;
ALTER TABLE feedback         DISABLE ROW LEVEL SECURITY;
ALTER TABLE medical_history  DISABLE ROW LEVEL SECURITY;
ALTER TABLE analytics        DISABLE ROW LEVEL SECURITY;
ALTER TABLE dental_charts    DISABLE ROW LEVEL SECURITY;
