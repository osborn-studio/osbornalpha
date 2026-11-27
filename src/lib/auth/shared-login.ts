// Shared login for the Feishu simulation account: a secret link signs the
// visitor's browser into that one account, so the PM and analysts in the group
// can open the formal site without a password. The account's password is never
// stored or used: the service role mints a one-time magic-link token and the
// caller's own client redeems it.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getFeishuAccountConfig } from '@/lib/feishu/integration-auth';

const tokenFormat = /^[A-Za-z0-9_-]{40,256}$/;

/** The configured link secret and target account, or null while the feature is off. */
export function sharedLoginConfig(): { token: string; ownerId: string } | null {
  const token = process.env.FEISHU_SHARED_LOGIN_TOKEN ?? '';
  const account = getFeishuAccountConfig();
  if (!tokenFormat.test(token) || !account) return null;
  return { token, ownerId: account.ownerId };
}

export function matchesSharedLoginToken(supplied: string, expected: string): boolean {
  if (!tokenFormat.test(supplied)) return false;
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

type AuthClient = Pick<SupabaseClient, 'auth'>;

/** Redeem a fresh one-time token for the owner on `client`; returns the signed-in user id. */
export async function signInAsOwner(admin: AuthClient, client: AuthClient, ownerId: string): Promise<string> {
  const { data: found, error: findError } = await admin.auth.admin.getUserById(ownerId);
  const email = found?.user?.email;
  if (findError || !email) throw new Error('shared_login_account_unavailable');
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error('shared_login_link_failed');
  const { data: session, error: verifyError } = await client.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  const userId = session?.user?.id?.toLowerCase();
  if (verifyError || userId !== ownerId) throw new Error('shared_login_verify_failed');
  return userId;
}
