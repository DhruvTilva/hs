import { NextResponse } from 'next/server';

import { createServerSupabase } from '@/lib/supabase';
import type { ScraperLog } from '@/lib/types';

const IST_RUN_HOURS = [10, 15.5, 21];

function nextRunIST(): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(Date.now() + istOffsetMs);
  const currentHour = nowIst.getUTCHours() + nowIst.getUTCMinutes() / 60;
  const next = IST_RUN_HOURS.find((h) => h > currentHour) ?? IST_RUN_HOURS[0];
  return next === 10 ? '10:00 AM IST' : next === 15.5 ? '3:30 PM IST' : '9:00 PM IST';
}

export async function GET() {
  const client = createServerSupabase();
  const next_run = nextRunIST();

  if (!client) {
    return NextResponse.json({ last_run: null, hours_ago: null, next_run, logs: [] });
  }

  const { data, error } = await client
    .from('scraper_logs')
    .select('id, source, run_at, new_found, errors, status')
    .order('run_at', { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ last_run: null, hours_ago: null, next_run, logs: [] });
  }

  const latest = data[0];
  const runAt = new Date(latest.run_at as string);
  const hours_ago = Math.round((Date.now() - runAt.getTime()) / (1000 * 60 * 60) * 10) / 10;

  return NextResponse.json({
    last_run: latest.run_at,
    hours_ago,
    next_run,
    logs: data as ScraperLog[],
  });
}
