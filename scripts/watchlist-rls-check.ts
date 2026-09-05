import { createClient } from '@supabase/supabase-js';
import {
  evaluateWatchlistRlsObservation,
  watchlistRlsCanaryPassed,
  WATCHLIST_RLS_TABLES,
} from '../src/lib/watchlist/rls-canary';

interface Credentials {
  email: string;
  password: string;
}

interface SessionIdentity {
  userId: string;
  accessToken: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function signIn(url: string, anonKey: string, credentials: Credentials): Promise<SessionIdentity> {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.user || !data.session) throw new Error('rls_canary_authentication_failed');
  return { userId: data.user.id, accessToken: data.session.access_token };
}

async function rowExists(
  baseUrl: string,
  anonKey: string,
  session: SessionIdentity,
  table: string,
  userId: string,
): Promise<boolean> {
  const query = new URLSearchParams({ select: 'user_id', user_id: `eq.${userId}`, limit: '1' });
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      accept: 'application/json',
      apikey: anonKey,
      authorization: `Bearer ${session.accessToken}`,
    },
  });
  if (!response.ok) throw new Error(`${table}_probe_failed_${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`${table}_probe_invalid`);
  return rows.length > 0;
}

async function main(): Promise<void> {
  const baseUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = requiredEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const accountA = await signIn(baseUrl, anonKey, {
    email: requiredEnvironment('E2E_EMAIL'),
    password: requiredEnvironment('E2E_PASSWORD'),
  });
  const accountB = await signIn(baseUrl, anonKey, {
    email: requiredEnvironment('E2E_EMAIL_B'),
    password: requiredEnvironment('E2E_PASSWORD_B'),
  });
  if (accountA.userId === accountB.userId) throw new Error('rls_canary_requires_distinct_accounts');

  const results = [];
  for (const { table, required } of WATCHLIST_RLS_TABLES) {
    const [accountAOwn, accountBOwn, accountAReadsB, accountBReadsA] = await Promise.all([
      rowExists(baseUrl, anonKey, accountA, table, accountA.userId),
      rowExists(baseUrl, anonKey, accountB, table, accountB.userId),
      rowExists(baseUrl, anonKey, accountA, table, accountB.userId),
      rowExists(baseUrl, anonKey, accountB, table, accountA.userId),
    ]);
    results.push(evaluateWatchlistRlsObservation({
      table, required, accountAOwn, accountBOwn, accountAReadsB, accountBReadsA,
    }));
  }

  const ok = watchlistRlsCanaryPassed(results);
  console.log(JSON.stringify({ ok, tables: results }, null, 2));
  if (!ok) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'watchlist_rls_check_failed');
  process.exitCode = 1;
});
