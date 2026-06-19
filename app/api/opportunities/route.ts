import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  
  const client = createServerSupabase();
  if (!client) {
    return NextResponse.json({ data: [], fallback: true });
  }

  let query = client.from('opportunities').select('*');

  if (date === '7d') {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('found_at', cutoff);
  }

  const { data, error } = await query.order('found_at', { ascending: false }).limit(100);

  if (error || !data) {
    return NextResponse.json({ data: [], fallback: true });
  }

  return NextResponse.json({ data, fallback: false });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const client = createServerSupabase();
  if (!client) return NextResponse.json({ data: null, ok: true });
  
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

  const { data, error } = await client
    .from('opportunities')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, data });
}
