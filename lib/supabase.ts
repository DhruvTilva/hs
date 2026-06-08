import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function createConfiguredClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAnonSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  return createConfiguredClient(url, key);
}

export function createServerSupabase(): SupabaseClient | null {
  return getAnonSupabase();
}

export function getServerSupabase(): SupabaseClient | null {
  return createServerSupabase();
}
