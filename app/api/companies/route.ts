import { NextRequest, NextResponse } from 'next/server';

import { sampleCompanies } from '@/lib/sample-data';
import { createServerSupabase } from '@/lib/supabase';
import type { ApiListResponse, Company } from '@/lib/types';

function response(data: Company[], fallback: boolean) {
  return NextResponse.json({ data, fallback } satisfies ApiListResponse<Company>);
}

async function readRows(): Promise<{ data: Company[]; fallback: boolean }> {
  const client = createServerSupabase();
  if (!client) {
    return { data: sampleCompanies, fallback: true };
  }

  const { data, error } = await client.from('companies').select('*').order('priority_base_score', { ascending: false });
  if (error || !data) {
    return { data: sampleCompanies, fallback: true };
  }

  return { data: data as Company[], fallback: false };
}

export async function GET() {
  const rows = await readRows();
  return response(rows.data, rows.fallback);
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<Company> & { id?: string };
  const client = createServerSupabase();
  if (!client) {
    return NextResponse.json({ ok: true, fallback: true, data: body });
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: 'Missing company id' }, { status: 400 });
  }

  const updates: Partial<Company> = {};
  if (body.career_page_watched !== undefined) updates.career_page_watched = body.career_page_watched;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.last_checked !== undefined) updates.last_checked = body.last_checked;

  const { data, error } = await client.from('companies').update(updates).eq('id', body.id).select('*').single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, fallback: false, data });
}
