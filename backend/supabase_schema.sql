-- TopListers — Supabase Schema
-- Run this in your Supabase SQL editor (project > SQL editor > new query)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── APPLICATIONS (private — one per user) ──────────────
CREATE TABLE applications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title     TEXT NOT NULL,
  company_name  TEXT NOT NULL,
  location      TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'UK',
  salary_min    INTEGER,
  salary_max    INTEGER,
  job_url       TEXT,
  adzuna_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'saved'
                CHECK (status IN ('saved','applied','interview','offer','rejected','withdrawn')),
  applied_date  DATE,
  followup_date DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security — users can only see their own applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own applications"
  ON applications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── JOB SIGHTINGS (public — anonymous) ─────────────────
CREATE TABLE job_sightings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_title     TEXT NOT NULL,
  company_name  TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2030),
  source_url    TEXT,
  confirmations INTEGER NOT NULL DEFAULT 1,
  is_approved   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO user_id. NO ip address. NO email. Privacy by design.
);

-- Public read, no auth required
ALTER TABLE job_sightings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read approved sightings"
  ON job_sightings FOR SELECT
  USING (is_approved = true);

CREATE POLICY "Anyone can insert sightings"
  ON job_sightings FOR INSERT
  WITH CHECK (true);

-- Index for common queries
CREATE INDEX idx_sightings_country   ON job_sightings(country);
CREATE INDEX idx_sightings_month_year ON job_sightings(year, month);
CREATE INDEX idx_sightings_title     ON job_sightings(job_title);
CREATE INDEX idx_sightings_company   ON job_sightings(company_name);

-- ── ADZUNA CACHE (reduce API calls) ────────────────────
CREATE TABLE adzuna_cache (
  cache_key  TEXT PRIMARY KEY,
  results    JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-clean expired cache entries
CREATE INDEX idx_cache_expires ON adzuna_cache(expires_at);

-- ── HELPER FUNCTION ────────────────────────────────────
CREATE OR REPLACE FUNCTION increment(row_id UUID)
RETURNS INTEGER AS $$
  SELECT confirmations + 1 FROM job_sightings WHERE id = row_id;
$$ LANGUAGE sql;
