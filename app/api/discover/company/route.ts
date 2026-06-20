import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return createClient(url, key)
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id: string
    added_to_watchlist?: boolean
    skip?: boolean
    reached_out?: boolean
    notes?: string
  }
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const db = supabase()

  // If adding to watchlist → also upsert into companies table
  if (updates.added_to_watchlist === true) {
    // Fetch company details first
    const { data: comp } = await db
      .from('discovered_companies')
      .select('name, website, linkedin_url, location')
      .eq('id', id)
      .single()

    if (comp) {
      await db.from('companies').upsert(
        {
          name: comp.name,
          website: comp.website ?? null,
          linkedin_url: comp.linkedin_url ?? null,
          location: comp.location ?? null,
          tier: 6,
          career_page_watched: false,
          notes: 'Auto-discovered by HireSense',
        },
        { onConflict: 'name', ignoreDuplicates: true },
      )
    }
  }

  // If marking reached_out → set reached_out_date to today
  if (updates.reached_out === true) {
    (updates as Record<string, unknown>).reached_out_date = new Date().toISOString().split('T')[0]
  }

  const { error } = await db
    .from('discovered_companies')
    .update({ ...updates, last_updated: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
