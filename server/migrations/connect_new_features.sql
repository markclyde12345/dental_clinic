-- =========================================================================
-- FANO DENTAL CLINIC — DATABASE SCHEMA EXPANSION
-- =========================================================================
-- Copy and paste this script into your Supabase Dashboard -> SQL Editor and click RUN.
-- =========================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Prescriptions Table
create table if not exists prescriptions (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  patient_id    uuid references users(id) on delete cascade,
  dentist_id    uuid references users(id) on delete set null,
  medication     text not null,
  dosage         text,
  frequency      text,
  duration       text,
  instructions   text,
  created_at     timestamp with time zone default now()
);

-- 2. Treatment Plans & Plan Items
create table if not exists treatment_plans (
  id                   uuid primary key default gen_random_uuid(),
  patient_id           uuid references users(id) on delete cascade,
  dentist_id           uuid references users(id) on delete set null,
  name                 text not null,
  description          text,
  total_estimated_cost numeric(10,2) default 0,
  status               text default 'Draft' check (status in ('Draft', 'Active', 'Completed', 'Cancelled')),
  created_at           timestamp with time zone default now(),
  updated_at           timestamp with time zone default now()
);

create table if not exists treatment_plan_items (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid references treatment_plans(id) on delete cascade,
  treatment_id   uuid references treatments(id) on delete set null,
  treatment_name text,
  sequence       integer default 1,
  status         text default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  notes          text,
  created_at     timestamp with time zone default now()
);

-- 3. Appointment Treatments (Procedures Done in an Appointment)
create table if not exists appointment_treatments (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  treatment_id   uuid references treatments(id) on delete set null,
  treatment_name text,
  quantity       integer default 1,
  price_at_time  numeric(10,2) default 0,
  notes          text,
  performed_at   timestamp with time zone default now(),
  created_at     timestamp with time zone default now()
);

-- 4. Interactive Dental Charts (Odontogram Data)
create table if not exists dental_charts (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references users(id) on delete cascade unique,
  dentist_id  uuid references users(id) on delete set null,
  chart_type  text default 'adult' check (chart_type in ('adult', 'pediatric')),
  teeth_data  jsonb default '{}'::jsonb,
  notes       text,
  created_at  timestamp with time zone default now(),
  updated_at  timestamp with time zone default now()
);

-- 5. Post-Op Patient Follow-ups
create table if not exists follow_ups (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid references users(id) on delete cascade,
  dentist_id     uuid references users(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  follow_up_date date not null,
  status         text default 'Pending' check (status in ('Pending', 'Contacted', 'Completed', 'No Answer')),
  notes          text,
  created_at     timestamp with time zone default now()
);

-- 6. Clinic Expenses & Utility Bills
create table if not exists expenses (
  id             uuid primary key default gen_random_uuid(),
  ref_no         text unique not null,
  vendor         text not null,
  category       text not null,
  description    text,
  amount         numeric(10,2) not null,
  due_date       date not null,
  paid_date      date,
  status         text default 'Unpaid' check (status in ('Unpaid', 'Paid', 'Overdue')),
  payment_method text,
  reference_no   text,
  created_at     timestamp with time zone default now()
);

-- 7. Remove legacy HMO Claims table if present
drop table if exists hmo_claims cascade;

-- 8. Dentists Roster & Specialization Table
create table if not exists dentists (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id) on delete cascade unique,
  name           text not null,
  specialization text not null,
  license_no     text not null,
  room_assigned  text not null,
  availability   text default 'On Duty',
  created_at     timestamp with time zone default now()
);

-- 9. Accountancy & Financial Ledger Table
create table if not exists accountancy (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references users(id) on delete set null,
  invoice_id       uuid references invoices(id) on delete set null,
  expense_id       uuid references expenses(id) on delete set null,
  transaction_type text not null check (transaction_type in ('Income', 'Expense')),
  amount           numeric(10,2) not null,
  payment_method   text not null,
  status           text default 'Completed',
  recorded_at      timestamp with time zone default now()
);

-- 10. Disable RLS for smooth development (re-enable policies when ready for production)
alter table if exists prescriptions          disable row level security;
alter table if exists treatment_plans        disable row level security;
alter table if exists treatment_plan_items   disable row level security;
alter table if exists appointment_treatments disable row level security;
alter table if exists dental_charts          disable row level security;
alter table if exists follow_ups             disable row level security;
alter table if exists expenses               disable row level security;
alter table if exists dentists               disable row level security;
alter table if exists accountancy            disable row level security;
