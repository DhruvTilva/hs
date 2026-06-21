-- Phase 1 Critical Fix: Fix Discovered Companies RLS
-- Run this in your Supabase SQL Editor

-- 1. Ensure RLS is actually enabled (it usually is)
ALTER TABLE "public"."discovered_companies" ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy that allows anyone (including anonymous users on the frontend) to READ the table
-- This allows the UI to display the companies.
CREATE POLICY "Enable read access for all users"
ON "public"."discovered_companies"
FOR SELECT USING (true);

-- 3. (Optional but recommended) Allow authenticated users to update rows (for marking as skipped, added_to_watchlist, etc.)
CREATE POLICY "Enable update for all users"
ON "public"."discovered_companies"
FOR UPDATE USING (true) WITH CHECK (true);
