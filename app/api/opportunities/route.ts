import { NextRequest, NextResponse } from 'next/server';

import { filterOpportunities } from '@/lib/api';
import { sampleOpportunities } from '@/lib/sample-data';
import { createServerSupabase } from '@/lib/supabase';
import type { ApiListResponse, Opportunity, OpportunityStatus } from '@/lib/types';

function response(data: Opportunity[], fallback: boolean) {
  return NextResponse.json({ data, fallback } satisfies ApiListResponse<Opportunity>);
}

function toCsv(rows: Opportunity[]) {
  const header = ['Date', 'Company', 'Role', 'Location', 'Source', 'Score', 'Status'];
  const body = rows.map((row) =>
    [row.found_at ?? '', row.company_name, row.role_title ?? '', row.location ?? '', row.source ?? '', String(row.priority_score ?? ''), row.status ?? '']
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  );
  return [header.map((value) => `"${value}"`).join(','), ...body].join('\n');
}

async function readRows(): Promise<{ data: Opportunity[]; fallback: boolean }> {
  const client = createServerSupabase();
  if (!client) return { data: sampleOpportunities, fallback: true };

  const { data, error } = await client
    .from('opportunities')
    .select('*')
    .order('priority_score', { ascending: false, nullsFirst: false });

  if (error || !data) return { data: sampleOpportunities, fallback: true };
  return { data: data as Opportunity[], fallback: false };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const followup = params.get('followup');
  const signalType = params.get('signal_type');

  // Special query: follow-ups due today
  if (followup === 'today') {
    const client = createServerSupabase();
    if (!client) return response([], false);
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await client
      .from('opportunities')
      .select('*')
      .lte('follow_up_date', today)
      .not('status', 'in', '("rejected","offer")')
      .order('follow_up_date', { ascending: true });
    return response((data ?? []) as Opportunity[], false);
  }

  // Special query: proactive signal type
  if (signalType) {
    const client = createServerSupabase();
    if (!client) return response([], false);
    const { data } = await client
      .from('opportunities')
      .select('*')
      .eq('signal_type', signalType)
      .eq('status', 'new')
      .order('found_at', { ascending: false });
    return response((data ?? []) as Opportunity[], false);
  }

  const rows = await readRows();
  const filter = params.get('filter') || 'all';
  const filtered = filterOpportunities(rows.data, {
    source: params.get('source') || 'all',
    score: params.get('score') || 'all',
    status: params.get('status') || 'all',
    date: filter === 'today' ? 'today' : params.get('date') || 'all',
    date_from: params.get('date_from') || '',
    date_to: params.get('date_to') || '',
    location: params.get('location') || '',
    role: params.get('role') || '',
    company: params.get('company') || '',
  });

  if (params.get('format') === 'csv') {
    return new NextResponse(toCsv(filtered), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="opportunities.csv"',
      },
    });
  }

  return response(filtered, rows.fallback);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<Opportunity>;
  const client = createServerSupabase();
  if (!client) return NextResponse.json({ ok: true, fallback: true, data: body });

  const { data, error } = await client.from('opportunities').insert(body).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, fallback: false, data });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: OpportunityStatus;
    follow_up_date?: string | null;
    notes?: string | null;
    applied_at?: string | null;
  };
  const client = createServerSupabase();
  if (!client) return NextResponse.json({ ok: true, fallback: true, data: body });
  if (!body.id) return NextResponse.json({ ok: false, error: 'Missing opportunity id' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.follow_up_date !== undefined) updates.follow_up_date = body.follow_up_date;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.applied_at !== undefined) updates.applied_at = body.applied_at;
  if (body.status === 'applied' && body.applied_at === undefined) {
    updates.applied_at = new Date().toISOString();
  }

  const { data, error } = await client.from('opportunities').update(updates).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, fallback: false, data });
}
