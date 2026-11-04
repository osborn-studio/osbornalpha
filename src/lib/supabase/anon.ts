// Anonymous (anon-key) Supabase client for public-read reference data routes, e.g.
// /api/entities/resolve. It authenticates as the `anon` role and therefore RESPECTS row level
// security: it can read only what policies/grants expose to anon (the issuer tables grant anon
// SELECT). Never use it for writes or for anything user-specific.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function getAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not configured — anon client unavailable');
  }
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
