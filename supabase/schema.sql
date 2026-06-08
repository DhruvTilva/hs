CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier INTEGER,
  category TEXT,
  location TEXT,
  website TEXT,
  careers_url TEXT,
  linkedin_url TEXT,
  company_size TEXT,
  ai_focus TEXT,
  funding_stage TEXT,
  priority_base_score INTEGER DEFAULT 50,
  google_alert_set BOOLEAN DEFAULT FALSE,
  li_alert_set BOOLEAN DEFAULT FALSE,
  career_page_watched BOOLEAN DEFAULT FALSE,
  last_careers_hash TEXT,
  last_checked TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  role_title TEXT,
  location TEXT,
  source TEXT,
  signal_type TEXT,
  apply_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_linkedin TEXT,
  priority_score INTEGER,
  freshness_score INTEGER,
  raw_data JSONB,
  status TEXT DEFAULT 'new',
  found_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  follow_up_date DATE,
  notes TEXT,
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of UUID
);

CREATE TABLE IF NOT EXISTS recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  email TEXT,
  last_active DATE,
  hiring_focus TEXT,
  contacted BOOLEAN DEFAULT FALSE,
  contact_date DATE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS career_page_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  page_hash TEXT,
  page_content_sample TEXT,
  snapshot_at TIMESTAMP DEFAULT NOW(),
  change_detected BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS scraper_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  run_at TIMESTAMP DEFAULT NOW(),
  new_found INTEGER DEFAULT 0,
  errors TEXT,
  status TEXT
);

CREATE INDEX IF NOT EXISTS idx_companies_watch ON companies (career_page_watched, last_checked);
CREATE INDEX IF NOT EXISTS idx_opportunities_found_at ON opportunities (found_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities (status);
CREATE INDEX IF NOT EXISTS idx_scraper_logs_run_at ON scraper_logs (run_at DESC);
