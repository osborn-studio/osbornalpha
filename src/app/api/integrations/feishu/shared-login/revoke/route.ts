import { NextResponse } from 'next/server';
import { signInAsOwner } from '@/lib/auth/shared-login';
import { getFeishuAccountConfig, hasFeishuAccountToken } from '@/lib/feishu/integration-auth';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAnonSupabase } from '@/lib/supabase/anon';

export const dynamic = 'force-dynamic';
const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store', vary: 'Authorization' } });

// Sign every browser out of the shared simulation account (all refresh tokens are revoked;
// access tokens already issued lapse at their expiry). Rotate FEISHU_SHARED_LOGIN_TOKEN too,
// or the old link signs people straight back in.
export async function POST(request: Request) {
  if (process.env.FEISHU_SIMULATION_INGEST_ENABLED !== 'true') return json({ error: 'not_found' }, 404);
  const config = getFeishuAccountConfig();
  if (!config) return json({ error: 'integration_unavailable' }, 503);
  if (!hasFeishuAccountToken(request, config.token)) return json({ error: 'unauthorized' }, 401);
  try {
    const client = getAnonSupabase();
    await signInAsOwner(getAdminSupabase(), client, config.ownerId);
    const { error } = await client.auth.signOut({ scope: 'global' });
    if (error) throw error;
  } catch {
    return json({ error: 'revoke_failed' }, 503);
  }
  return json({ revoked: true }, 200);
}
