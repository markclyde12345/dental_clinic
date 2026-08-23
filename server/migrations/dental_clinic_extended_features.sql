-- =========================================================================
-- DENTIST DASHBOARD EXTENDED FEATURES
-- =========================================================================
-- Adds clinical notes, appointment treatments, prescriptions, and
-- treatment plans to support an enhanced dentist workflow.
-- Apply in the Supabase SQL Editor AFTER complete_schema.sql.
-- =========================================================================

-- ─── 1. Extend appointments ────────────────────────────────────────────────
-- Link appointments to a specific dentist + store clinical (SOAP) notes.
alter table appointments
  add column if not exists dentist_id uuid references users(id) on delete set null;

alter table appointments
  add column if not exists clinical_notes text;

-- Optional: constrain status values (controllers already use these freely).
alter table appointments
  drop constraint if exists appointments_status_check;

alter table appointments
  add constraint appointments_status_check
  check (status in (
    'Pending','Confirmed','In Progress','Completed','Cancelled','Rescheduled'
  ));

-- ─── 2. appointment_treatments (treatments performed in an appointment) ────
create table if not exists appointment_treatments (
  id               uuid primary key default uuid_generate_v4(),
  appointment_id   uuid references appointments(id) on delete cascade,
  treatment_id     uuid references treatments(id) on delete set null,
  treatment_name   text,
  quantity         integer default 1,
  price_at_time    numeric(10,2) default 0,
  notes            text,
  performed_at     timestamp with time zone default now(),
  created_at       timestamp with time zone default now()
);

-- ─── 3. prescriptions ──────────────────────────────────────────────────────
create table if not exists prescriptions (
  id            uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id) on delete cascade,
  patient_id    uuid references users(id) on delete cascade,
  dentist_id    uuid references users(id) on delete set null,
  medication    text not null,
  dosage        text,
  frequency     text,
  duration      text,
  instructions  text,
  created_at    timestamp with time zone default now()
);

-- ─── 4. treatment_plans ────────────────────────────────────────────────────
create table if not exists treatment_plans (
  id                   uuid primary key default uuid_generate_v4(),
  patient_id           uuid references users(id) on delete cascade,
  dentist_id           uuid references users(id) on delete set null,
  name                 text not null,
  description          text,
  total_estimated_cost numeric(10,2) default 0,
  status               text default 'Draft'
                           check (status in ('Draft','Active','Completed','Cancelled')),
  created_at           timestamp with time zone default now(),
  updated_at           timestamp with time zone default now()
);

-- ─── 5. treatment_plan_items ───────────────────────────────────────────────
create table if not exists treatment_plan_items (
  id           uuid primary key default uuid_generate_v4(),
  plan_id      uuid references treatment_plans(id) on delete cascade,
  treatment_id uuid references treatments(id) on delete set null,
  treatment_name text,
  sequence     integer default 1,
  status       text default 'Pending'
                   check (status in ('Pending','In Progress','Completed')),
  notes        text,
  created_at   timestamp with time zone default now()
);

-- ─── Disable RLS for quick development (re-enable + add policies for prod) ──
alter table appointments           disable row level security;
alter table appointment_treatments disable row level security;
alter table prescriptions          disable row level security;
alter table treatment_plans        disable row level security;
alter table treatment_plan_items   disable row level security;
