import { NextResponse } from 'next/server';

import { createServerSupabase } from '@/lib/supabase';
import type { WeeklyStats } from '@/lib/types';

export async function GET() {
  const empty: WeeklyStats = { found_this_week: 0, applied: 0, interviews: 0, followups_due: 0 };
  const client = createServerSupabase();
  if (!client) return NextResponse.json(empty);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [foundRes, appliedRes, interviewRes, followupRes] = await Promise.all([
    client.from('opportunities').select('id', { count: 'exact', head: true }).gte('found_at', sevenDaysAgo),
    client.from('opportunities').select('id', { count: 'exact', head: true }).eq('status', 'applied').gte('applied_at', sevenDaysAgo),
    client.from('opportunities').select('id', { count: 'exact', head: true }).eq('status', 'interview'),
    client.from('opportunities').select('id', { count: 'exact', head: true }).lte('follow_up_date', today).not('status', 'in', '("rejected","offer")'),
  ]);

  return NextResponse.json({
    found_this_week: foundRes.count ?? 0,
    applied: appliedRes.count ?? 0,
    interviews: interviewRes.count ?? 0,
    followups_due: followupRes.count ?? 0,
  } satisfies WeeklyStats);
}
