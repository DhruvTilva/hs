-- HireSense v2.0 Database Schema Updates
-- Run these queries in your Supabase SQL Editor

-- 1. Create the new Discovered Companies table
CREATE TABLE IF NOT EXISTS discovered_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT,
  website TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  has_website BOOLEAN DEFAULT FALSE,
  has_linkedin BOOLEAN DEFAULT FALSE,
  has_github BOOLEAN DEFAULT FALSE,
  has_funding BOOLEAN DEFAULT FALSE,
  has_technical_founder BOOLEAN DEFAULT FALSE,
  news_mentions INTEGER DEFAULT 0,
  ai_ml_signals TEXT,
  source TEXT,
  source_url TEXT,
  potential_score INTEGER DEFAULT 0,
  potential_tier TEXT DEFAULT 'low',
  added_to_watchlist BOOLEAN DEFAULT FALSE,
  reached_out BOOLEAN DEFAULT FALSE,
  reached_out_date TIMESTAMPTZ,
  skip BOOLEAN DEFAULT FALSE,
  notes TEXT,
  raw_data JSONB,
  discovered_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add new columns to the existing recruiters table (if not already present)
ALTER TABLE recruiters 
ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contact_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Create a table to track scraper runs (used by log_scraper_run in scrapers/common.py)
CREATE TABLE IF NOT EXISTS scraper_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scraper_name TEXT NOT NULL,
  status TEXT NOT NULL,
  records_processed INTEGER DEFAULT 0,
  error_log TEXT,
  run_date TIMESTAMPTZ DEFAULT now()
);
