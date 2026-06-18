import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return createClient(url, key)
}

export async function GET() {
  const db = supabase()

  // Fetch current batch from recruiter_leads (display table)
  const { data: leads, error: leadsError } = await db
    .from('recruiter_leads')
    .select('*')
    .order('discovered_at', { ascending: false })

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 })
  }

  // Fetch all-time count from permanent recruiters table
  const { count: totalAllTime } = await db
    .from('recruiters')
    .select('id', { count: 'exact', head: true })

  const profiles = leads ?? []

  // Stats
  const byCategory: Record<string, number> = {}
  const byLocation: Record<string, number> = {}

  for (const p of profiles) {
    const cat = p.category ?? 'unknown'
    const loc = p.location ?? 'Unknown'
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
    byLocation[loc] = (byLocation[loc] ?? 0) + 1
  }

  return NextResponse.json({
    profiles,
    today_count: profiles.length,
    all_time_count: totalAllTime ?? 0,
    by_category: byCategory,
    by_location: byLocation,
  })
}
