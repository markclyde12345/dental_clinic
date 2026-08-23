/*
  Core tables for Dental Clinic backend – patients, appointments, treatments, invoices.
  Copy/paste this into Supabase SQL editor or run via CLI.
*/

-- Patients
create table patients (
  id          uuid primary key default uuid_generate_v4(),
  first_name  text not null,
  last_name   text not null,
  email       text unique,
  phone       text,
  address     text,
  birth_date  date,
  gender      text,
  created_at  timestamp with time zone default now(),
  updated_at  timestamp with time zone default now()
);

-- Appointments
create table appointments (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid references patients(id) on delete cascade,
  dentist_id   uuid references users(id),
  start_time   timestamp with time zone not null,
  end_time     timestamp with time zone,
  status       text default 'scheduled',
  notes        text,
  created_at   timestamp with time zone default now(),
  updated_at   timestamp with time zone default now()
);

-- Treatments
create table treatments (
  id            uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id) on delete cascade,
  description   text,
  cost          numeric(10,2),
  performed_at  timestamp with time zone default now()
);

-- Invoices
create table invoices (
  id           uuid primary key default uuid_generate_v4(),
  patient_id   uuid references patients(id) on delete cascade,
  total_amount numeric(10,2) not null,
  paid_amount  numeric(10,2) default 0,
  status       text default 'unpaid',
  issued_at    timestamp with time zone default now(),
  paid_at      timestamp with time zone
);

-- Optional: disable RLS for quick testing (remove for production)
alter table patients       disable row level security;
alter table appointments   disable row level security;
alter table treatments     disable row level security;
alter table invoices       disable row level security;
