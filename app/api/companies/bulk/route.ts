import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import type { Company } from '@/lib/types';

export async function POST(request: NextRequest) {
  const { companies } = (await request.json().catch(() => ({ companies: [] }))) as { companies: Partial<Company>[] };
  
  if (!companies || companies.length === 0) {
    return NextResponse.json({ ok: false, error: 'No companies provided' }, { status: 400 });
  }

  const client = createServerSupabase();
  if (!client) {
    // If running without Supabase, just return success
    return NextResponse.json({ ok: true, fallback: true, inserted: companies.length });
  }

  const { data, error } = await client
    .from('companies')
    .insert(companies)
    .select('*');

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fallback: false, data, inserted: data?.length || 0 });
}
