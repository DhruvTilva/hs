import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return createClient(url, key)
}

export async function GET() {
  const db = supabase()

  // Fetch from recruiters table
  const { data: profiles, error } = await db
    .from('recruiters')
    .select('*')
    .order('contact_date', { ascending: false, nullsFirst: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { count: totalAllTime } = await db
    .from('recruiters')
    .select('id', { count: 'exact', head: true })

  const validProfiles = profiles ?? []

  // Stats
  const byCategory: Record<string, number> = {}
  const byLocation: Record<string, number> = {}

  for (const p of validProfiles) {
    const cat = p.hiring_focus ?? 'unknown'
    const loc = p.company ?? 'Unknown'
    byCategory[cat] = (byCategory[cat] ?? 0) + 1
    byLocation[loc] = (byLocation[loc] ?? 0) + 1
  }

  return NextResponse.json({
    profiles: validProfiles.map(p => ({
      id: p.id,
      name: p.name,
      linkedin_url: p.linkedin_url,
      company: p.company,
      headline: p.title,
      location: null, // we don't have location in schema, skip or map
      category: p.hiring_focus,
      discovered_at: p.last_active,
      contacted: p.contacted,
      contact_date: p.contact_date,
      notes: p.notes,
    })),
    today_count: validProfiles.filter(p => !p.contacted).length, // using uncontacted as today's batch
    all_time_count: totalAllTime ?? 0,
    by_category: byCategory,
    by_location: byLocation,
  })
}

export async function PATCH(request: Request) {
  const db = supabase()
  const body = await request.json()
  const { id, contacted, notes } = body

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  if (contacted !== undefined) {
    updates.contacted = contacted
    updates.contact_date = contacted ? new Date().toISOString() : null
  }
  if (notes !== undefined) {
    updates.notes = notes
  }

  const { error } = await db
    .from('recruiters')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
