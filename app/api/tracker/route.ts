import { NextRequest, NextResponse } from 'next/server';

import { sampleOpportunities } from '@/lib/sample-data';
import { createServerSupabase } from '@/lib/supabase';
import type { ApiListResponse, Opportunity } from '@/lib/types';

export async function GET() {
  const client = createServerSupabase();
  if (!client) {
    return NextResponse.json({ data: sampleOpportunities, fallback: true } satisfies ApiListResponse<Opportunity>);
  }

  const { data, error } = await client.from('opportunities').select('*').order('found_at', { ascending: false });
  if (error || !data) {
    return NextResponse.json({ data: sampleOpportunities, fallback: true } satisfies ApiListResponse<Opportunity>);
  }

  return NextResponse.json({ data: data as Opportunity[], fallback: false } satisfies ApiListResponse<Opportunity>);
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    follow_up_date?: string | null;
    notes?: string | null;
    applied_at?: string | null;
  };
  const client = createServerSupabase();

  if (!client) {
    return NextResponse.json({ ok: true, fallback: true, data: body });
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: 'Missing opportunity id' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status) updates.status = body.status;
  if (body.follow_up_date !== undefined) updates.follow_up_date = body.follow_up_date;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.applied_at !== undefined) updates.applied_at = body.applied_at;
  if (body.status === 'applied' && body.applied_at === undefined) {
    updates.applied_at = new Date().toISOString();
  }

  const { data, error } = await client.from('opportunities').update(updates).eq('id', body.id).select('*').single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fallback: false, data });
}
