-- ═══════════════════════════════════════════════════════════════════
-- SQL SCHEMA FOR AUDIT LOGS (Run in Supabase SQL Editor if desired)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high performance sorting by date and filtering by action
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- Row Level Security (RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated receptionists and admins to view audit logs
CREATE POLICY "Staff can view audit logs"
    ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('Receptionist', 'Admin')
        )
    );

-- Allow server service role / authenticated users to insert audit logs
CREATE POLICY "Enable insert for authenticated users"
    ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- LOCK DOWN ALL "UNRESTRICTED" TABLES WITH ROW LEVEL SECURITY (RLS)
-- Safe to run: Your Node.js backend uses the `service_role` key, which
-- automatically bypasses RLS, while blocking public/anon direct access.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.appointment_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dental_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.hmo_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treatment_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treatment_plans ENABLE ROW LEVEL SECURITY;

