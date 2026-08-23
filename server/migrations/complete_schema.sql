-- =========================================================================
-- COMPLETE DENTAL CLINIC SCHEMA
-- =========================================================================
-- This script drops all existing tables and recreates them to perfectly
-- match the requirements of the backend Node/Express controllers.
-- Copy and paste this entire script into your Supabase SQL Editor and click Run.
-- =========================================================================

-- Drop tables in correct dependency order if they exist
drop table if exists chat_messages cascade;
drop table if exists chat_rooms cascade;
drop table if exists invoices cascade;
drop table if exists appointments cascade;
drop table if exists treatments cascade;
drop table if exists patient_profiles cascade;
drop table if exists patients cascade; -- old patients table
drop table if exists users cascade;

-- Enable UUID extension if not enabled
create extension if exists "uuid-ossp";

-- 1. Users Table (Authentication and Profile Info)
create table users (
  id             uuid primary key default uuid_generate_v4(),
  first_name     text not null,
  last_name      text not null,
  name           text not null,
  email          text unique not null,
  password       text not null,
  role           text not null check (role in ('Admin', 'Dentist', 'Dental Assistant', 'Receptionist', 'Patient', 'Accounting')),
  contact_number text,
  address        text,
  is_verified    boolean default false,
  is_active      boolean default true,
  otp_code       text,
  otp_expires    timestamp with time zone,
  otp_attempts   integer default 0,
  created_at     timestamp with time zone default now(),
  updated_at     timestamp with time zone default now()
);

-- 2. Patient Profiles Table (Specific medical information for patients)
create table patient_profiles (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references users(id) on delete cascade unique,
  date_of_birth date,
  gender        text,
  blood_type    text,
  allergies     text[] default '{}',
  medical_notes text,
  created_at    timestamp with time zone default now(),
  updated_at    timestamp with time zone default now()
);

-- 3. Treatments Table (Services offered by the clinic)
create table treatments (
  id               uuid primary key default uuid_generate_v4(),
  name             text unique not null,
  description      text,
  price            numeric(10,2) not null,
  duration_minutes integer default 30,
  is_active        boolean default true,
  created_at       timestamp with time zone default now()
);

-- 4. Appointments Table
create table appointments (
  id               uuid primary key default uuid_generate_v4(),
  patient_id       uuid references users(id) on delete cascade,
  treatment_id     uuid references treatments(id) on delete set null,
  appointment_date timestamp with time zone not null,
  notes            text,
  status           text default 'Pending',
  created_at       timestamp with time zone default now(),
  updated_at       timestamp with time zone default now()
);

-- 5. Invoices Table
create table invoices (
  id             uuid primary key default uuid_generate_v4(),
  patient_id     uuid references users(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  amount         numeric(10,2) not null,
  status         text default 'Unpaid',
  issued_at      timestamp with time zone default now(),
  paid_at        timestamp with time zone
);

-- 6. Chat Rooms Table
create table chat_rooms (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid references users(id) on delete cascade,
  created_by    uuid references users(id) on delete set null,
  title         text not null default 'Chat',
  created_at    timestamp with time zone default now(),
  updated_at    timestamp with time zone default now()
);

-- 7. Chat Messages Table
create table chat_messages (
  id            uuid primary key default uuid_generate_v4(),
  room_id       uuid references chat_rooms(id) on delete cascade,
  sender_id     uuid references users(id) on delete set null,
  content       text not null,
  sent_at       timestamp with time zone default now(),
  is_read       boolean default false
);

-- 8. Inventory Table
create table inventory (
  id            uuid primary key default uuid_generate_v4(),
  name          text unique not null,
  category      text not null,
  unit          text not null,
  stock         integer not null default 0,
  threshold     integer not null default 0,
  status        text not null,
  created_at    timestamp with time zone default now()
);

-- 9. Staff Schedules Table
create table staff_schedules (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  email         text not null,
  role          text not null,
  contact       text not null,
  shift         text not null,
  days          text not null,
  availability  text not null,
  created_at    timestamp with time zone default now()
);

-- Disable Row Level Security (RLS) for testing
alter table users disable row level security;
alter table patient_profiles disable row level security;
alter table treatments disable row level security;
alter table appointments disable row level security;
alter table invoices disable row level security;
alter table chat_rooms disable row level security;
alter table chat_messages disable row level security;
alter table inventory disable row level security;
alter table staff_schedules disable row level security;
