-- =========================================================================
-- DOMEX DAILY REPORT SYSTEM: AUTO-DISPATCH & BRANCH ANALYTICS SCHEMA
-- PostgreSQL / Supabase Migration with Row-Level Security (RLS)
-- =========================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. dispatch_targets Table
-- Stores daily dispatch target numbers for each regional branch.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_name TEXT NOT NULL UNIQUE,
    target INTEGER NOT NULL DEFAULT 0 CHECK (target >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast branch lookups
CREATE INDEX IF NOT EXISTS idx_dispatch_targets_branch_name ON public.dispatch_targets (branch_name);

-- -------------------------------------------------------------------------
-- 2. dispatch_reports Table
-- Stores daily parsed dispatch snapshots, metrics, and items.
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispatch_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_text TEXT DEFAULT '',
    created_by TEXT NOT NULL, -- User ID or Branch Name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_dispatch_reports_date UNIQUE (date)
);

-- Index for querying reports by date
CREATE INDEX IF NOT EXISTS idx_dispatch_reports_date ON public.dispatch_reports (date);

-- -------------------------------------------------------------------------
-- 3. Row-Level Security (RLS) Policies
-- Strictly restricts read/write operations to Regional Managers and Admins.
-- -------------------------------------------------------------------------
ALTER TABLE public.dispatch_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_reports ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user has the special role
CREATE OR REPLACE FUNCTION public.is_dispatch_authorized()
RETURNS BOOLEAN AS $$
BEGIN
  -- Checks user's JWT metadata role or custom claims
  RETURN (
    coalesce(current_setting('request.jwt.claim.role', true), '') IN ('regional_manager', 'admin', 'superadmin', 'special_admin')
    OR (current_setting('request.jwt.claims', true)::jsonb ->> 'is_special_user')::boolean = true
    OR (current_setting('request.jwt.claims', true)::jsonb ->> 'can_access_dispatch')::boolean = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies for dispatch_targets
CREATE POLICY "Allow read dispatch targets for special users"
ON public.dispatch_targets
FOR SELECT
USING (public.is_dispatch_authorized());

CREATE POLICY "Allow insert/update/delete dispatch targets for special users"
ON public.dispatch_targets
FOR ALL
USING (public.is_dispatch_authorized())
WITH CHECK (public.is_dispatch_authorized());

-- Policies for dispatch_reports
CREATE POLICY "Allow read dispatch reports for special users"
ON public.dispatch_reports
FOR SELECT
USING (public.is_dispatch_authorized());

CREATE POLICY "Allow insert/update/delete dispatch reports for special users"
ON public.dispatch_reports
FOR ALL
USING (public.is_dispatch_authorized())
WITH CHECK (public.is_dispatch_authorized());

-- -------------------------------------------------------------------------
-- 4. Initial Seed Data: Standard DOMEX Regional Branches
-- -------------------------------------------------------------------------
INSERT INTO public.dispatch_targets (branch_name, target)
VALUES
    ('Colombo', 500),
    ('Kandy', 300),
    ('Galle', 250),
    ('Embilipitiya', 200),
    ('Middeniya', 150),
    ('Tangalle', 180),
    ('Matara', 220),
    ('Kurunegala', 260),
    ('Negombo', 280),
    ('Gampaha', 350)
ON CONFLICT (branch_name) DO UPDATE
SET target = EXCLUDED.target;
