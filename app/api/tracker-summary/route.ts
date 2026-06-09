import { NextResponse } from 'next/server';

import { createServerSupabase } from '@/lib/supabase';
import type { TrackerSummary } from '@/lib/types';

export async function GET() {
  const empty: TrackerSummary = { new: 0, applied: 0, followed_up: 0, interview: 0, offer: 0, rejected: 0 };
  const client = createServerSupabase();
  if (!client) return NextResponse.json(empty);

  const { data, error } = await client
    .from('opportunities')
    .select('status');

  if (error || !data) return NextResponse.json(empty);

  const counts: TrackerSummary = { new: 0, applied: 0, followed_up: 0, interview: 0, offer: 0, rejected: 0 };
  for (const row of data) {
    const s = row.status as keyof TrackerSummary;
    if (s in counts) counts[s]++;
  }

  return NextResponse.json(counts);
}
