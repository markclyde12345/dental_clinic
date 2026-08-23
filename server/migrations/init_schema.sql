/*
  ============================================================
  Fano Dental Clinic — Initial Supabase Schema
  ============================================================
  HOW TO RUN:
    1. Open your Supabase project → SQL Editor
    2. Paste the entire contents of this file and click "Run"
  ============================================================
*/

-- ─── Extensions ───────────────────────────────────────────
-- Enable uuid generation (may already be enabled on Supabase)
create extension if not exists "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────
-- Stores staff accounts AND patient accounts in one table.
-- The 'role' column distinguishes between them.
create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  first_name      text not null,
  last_name       text not null,
  -- 'name' is a plain stored column (NOT generated) so the app can insert it freely
  name            text,
  email           text unique not null,
  password        text not null,
  role            text not null check (role in ('Admin','Dentist','Dental Assistant','Receptionist','Patient','Accounting')),
  contact_number  text,
  address         text,
  is_active       boolean default true,
  is_verified     boolean default false,
  otp_code        text,
  otp_expires     timestamp with time zone,
  otp_attempts    integer default 0,
  created_at      timestamp with time zone default now(),
  updated_at      timestamp with time zone default now()
);

-- ─── Patients ─────────────────────────────────────────────
-- Additional patient-specific data (linked to users.id when they register)
create table if not exists patients (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references users(id) on delete set null,
  first_name  text not null,
  last_name   text not null,
  email       text unique,
  phone       text,
  address     text,
  birth_date  date,
  gender      text check (gender in ('Male','Female','Other')),
  created_at  timestamp with time zone default now(),
  updated_at  timestamp with time zone default now()
);

-- ─── Appointments ─────────────────────────────────────────
create table if not exists appointments (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid references patients(id) on delete cascade,
  dentist_id   uuid references users(id) on delete set null,
  start_time   timestamp with time zone not null,
  end_time     timestamp with time zone,
  status       text default 'scheduled' check (status in ('scheduled','completed','canceled','no-show')),
  notes        text,
  created_at   timestamp with time zone default now(),
  updated_at   timestamp with time zone default now()
);

-- ─── Treatments ───────────────────────────────────────────
create table if not exists treatments (
  id             uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id) on delete cascade,
  description    text,
  cost           numeric(10,2) default 0,
  performed_at   timestamp with time zone default now(),
  created_at     timestamp with time zone default now()
);

-- ─── Invoices ─────────────────────────────────────────────
create table if not exists invoices (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid references patients(id) on delete cascade,
  total_amount numeric(10,2) not null default 0,
  paid_amount  numeric(10,2) default 0,
  status       text default 'unpaid' check (status in ('unpaid','paid','partial')),
  notes        text,
  issued_at    timestamp with time zone default now(),
  paid_at      timestamp with time zone,
  created_at   timestamp with time zone default now(),
  updated_at   timestamp with time zone default now()
);

-- ─── Row Level Security ───────────────────────────────────
-- Disable RLS on all tables for quick development / testing.
-- Re-enable and add policies before going to production!
alter table users         disable row level security;
alter table patients      disable row level security;
alter table appointments  disable row level security;
alter table treatments    disable row level security;
alter table invoices      disable row level security;
