// ⚠️ SERVICE-ROLE CLIENT — BYPASSES ROW LEVEL SECURITY. ⚠️
//
// This client authenticates as the Supabase service_role and can read/write
// ANY row in ANY table, ignoring every RLS policy. It must ONLY be imported
// from trusted system contexts: unauthenticated webhooks that verify their own
// signatures, or admin routes after a user-session and role check has passed.
//
// Browser-originated routes must use getServerSupabase() for their access
// checks before constructing this client. Never use a request parameter or
// cookie value alone to authorize service-role access.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function adminCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable'
    );
  }
  return { url, serviceRoleKey };
}

export function getAdminSupabase(fetcher?: typeof fetch) {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetcher ? { global: { fetch: fetcher } } : {}),
  });
}

// Narrow RPC schema: the legacy Database table shapes omit Relationships/Views
// required by current supabase-js inference. Keep this new RPC fully typed
// without changing every existing table client or casting arguments to never.
type QuoteAlertDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Pick<Database['public']['Functions'], 'quote_alert_window_samples'>;
  };
};
export function getQuoteAlertSupabase() {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<QuoteAlertDatabase>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
