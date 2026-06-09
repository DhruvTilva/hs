import { NextRequest, NextResponse } from 'next/server';

import { sampleCompanies } from '@/lib/sample-data';
import { createServerSupabase } from '@/lib/supabase';
import type { ApiListResponse, Company } from '@/lib/types';

function response(data: Company[], fallback: boolean) {
  return NextResponse.json({ data, fallback } satisfies ApiListResponse<Company>);
}

async function readRows(): Promise<{ data: Company[]; fallback: boolean }> {
  const client = createServerSupabase();
  if (!client) return { data: sampleCompanies, fallback: true };

  const { data, error } = await client
    .from('companies')
    .select('*')
    .order('priority_base_score', { ascending: false });

  if (error || !data) return { data: sampleCompanies, fallback: true };
  return { data: data as Company[], fallback: false };
}

export async function GET() {
  const rows = await readRows();
  return response(rows.data, rows.fallback);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<Company>;
  const client = createServerSupabase();

  if (!client) {
    return NextResponse.json({ ok: true, fallback: true, data: body });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ ok: false, error: 'Company name is required' }, { status: 400 });
  }

  const payload = {
    name:                body.name.trim(),
    tier:                body.tier ?? null,
    category:            body.category ?? null,
    location:            body.location ?? null,
    website:             body.website ?? null,
    careers_url:         body.careers_url ?? null,
    linkedin_url:        body.linkedin_url ?? null,
    company_size:        body.company_size ?? null,
    ai_focus:            body.ai_focus ?? null,
    funding_stage:       body.funding_stage ?? null,
    notes:               body.notes ?? null,
    priority_base_score: body.priority_base_score ?? 50,
    career_page_watched: false,
    google_alert_set:    false,
    li_alert_set:        false,
  };

  const { data, error } = await client
    .from('companies')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fallback: false, data });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<Company> & { id?: string };
  const client = createServerSupabase();

  if (!client) return NextResponse.json({ ok: true, fallback: true, data: body });
  if (!body.id) return NextResponse.json({ ok: false, error: 'Missing company id' }, { status: 400 });

  const updates: Partial<Company> = {};
  if (body.career_page_watched !== undefined) updates.career_page_watched = body.career_page_watched;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.last_checked !== undefined) updates.last_checked = body.last_checked;

  const { data, error } = await client
    .from('companies')
    .update(updates)
    .eq('id', body.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, fallback: false, data });
}
