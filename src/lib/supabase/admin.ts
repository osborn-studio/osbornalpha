// ⚠️ SERVICE-ROLE CLIENT — BYPASSES ROW LEVEL SECURITY. ⚠️
//
// This client authenticates as the Supabase service_role and can read/write
// ANY row in ANY table, ignoring every RLS policy. It must ONLY be imported
// from trusted, unauthenticated-by-user system contexts — currently just the
// Stripe webhook route (src/app/api/stripe/webhook/route.ts), which has no
// user session to scope a request to and needs to write another user's
// profile (identified via Stripe metadata, not a cookie).
//
// Do NOT import this from any route that serves a browser-originated request
// with a user session — use getServerSupabase() (src/lib/supabase/server.ts)
// there instead, so RLS keeps doing its job.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable'
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
