import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

function supabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tier   = searchParams.get('tier')   // high | medium | low
  const added  = searchParams.get('added')  // true | false
  const sort   = searchParams.get('sort') ?? 'score' // score | date
  const showSkipped = searchParams.get('skip') === 'true'

  const db = supabase()
  let query = db
    .from('discovered_companies')
    .select('*')

  if (!showSkipped) query = query.eq('skip', false)
  if (tier)  query = query.eq('potential_tier', tier)
  if (added === 'true')  query = query.eq('added_to_watchlist', true)
  if (added === 'false') query = query.eq('added_to_watchlist', false)

  if (sort === 'date') {
    query = query.order('discovered_at', { ascending: false })
  } else {
    query = query.order('potential_score', { ascending: false })
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const companies = data ?? []
  const high       = companies.filter((c) => c.potential_tier === 'high').length
  const medium     = companies.filter((c) => c.potential_tier === 'medium').length
  const low        = companies.filter((c) => c.potential_tier === 'low').length
  const addedCount = companies.filter((c) => c.added_to_watchlist).length
  const reachedOut = companies.filter((c) => c.reached_out).length

  return NextResponse.json({
    companies,
    total: companies.length,
    high,
    medium,
    low,
    added: addedCount,
    reached_out: reachedOut,
  })
}
