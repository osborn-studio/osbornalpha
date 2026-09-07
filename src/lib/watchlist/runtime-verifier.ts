interface WatchlistRuntimeEnvironment {
  WATCHLIST_RUNTIME_URL?: string;
}

interface WatchlistRuntimeAuthEnvironment {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  WATCHLIST_RUNTIME_EMAIL?: string;
  WATCHLIST_RUNTIME_PASSWORD?: string;
}

export interface WatchlistRuntimeAuth {
  supabaseUrl: string;
  anonKey: string;
  email: string;
  password: string;
}

export function resolveWatchlistRuntimeUrl(
  environment: WatchlistRuntimeEnvironment = {
    WATCHLIST_RUNTIME_URL: process.env.WATCHLIST_RUNTIME_URL,
  },
): string {
  const raw = environment.WATCHLIST_RUNTIME_URL?.trim();
  if (!raw) throw new Error('watchlist_runtime_url_missing');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('watchlist_runtime_url_invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('watchlist_runtime_url_invalid');
  }
  return url.origin;
}

export function isVercelDeploymentProtectionResponse(
  location: string | null,
  body: { protection?: unknown } | null,
): boolean {
  return Boolean(
    location?.includes('vercel.com/sso-api')
      || location?.includes('/sso-api%3F')
      || body?.protection,
  );
}

export function resolveWatchlistRuntimeAuth(
  environment: WatchlistRuntimeAuthEnvironment = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    WATCHLIST_RUNTIME_EMAIL: process.env.WATCHLIST_RUNTIME_EMAIL,
    WATCHLIST_RUNTIME_PASSWORD: process.env.WATCHLIST_RUNTIME_PASSWORD,
  },
): WatchlistRuntimeAuth {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const email = environment.WATCHLIST_RUNTIME_EMAIL?.trim();
  const password = environment.WATCHLIST_RUNTIME_PASSWORD;
  if (!supabaseUrl || !anonKey || !email || !password) {
    throw new Error('watchlist_runtime_auth_missing');
  }
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error('watchlist_runtime_auth_invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || !email.includes('@') || password.length < 8) {
    throw new Error('watchlist_runtime_auth_invalid');
  }
  return { supabaseUrl: parsed.origin, anonKey, email, password };
}

export function isWatchlistOverviewRuntimePayload(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const page = body.page;
  return typeof body.generatedAt === 'string'
    && !Number.isNaN(Date.parse(body.generatedAt))
    && typeof body.ownerId === 'string'
    && (body.dataStatus === 'complete' || body.dataStatus === 'partial')
    && Array.isArray(body.rows)
    && Array.isArray(body.capabilities)
    && !!page && typeof page === 'object' && !Array.isArray(page)
    && typeof (page as Record<string, unknown>).limit === 'number'
    && typeof (page as Record<string, unknown>).hasMore === 'boolean';
}

export const WATCHLIST_RUNTIME_READ_CONTRACTS = {
  '/api/watchlist': { arrays: ['watchlists'] },
  '/api/watchlist/reviews': { arrays: ['rows'], records: ['summary'] },
  '/api/watchlist/alert-preferences': { records: ['preferences'] },
  '/api/watchlist/alerts': { arrays: ['alerts'], records: ['catalog'] },
  '/api/watchlist/alert-events': { arrays: ['events'] },
  '/api/watchlist/trash': { arrays: ['entries'] },
  '/api/watchlist/ui-preferences': { records: ['preferences'], numbers: ['version'] },
} as const;

type WatchlistRuntimeReadPath = keyof typeof WATCHLIST_RUNTIME_READ_CONTRACTS;

export function isWatchlistRuntimeReadPayload(path: WatchlistRuntimeReadPath, value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const contract = WATCHLIST_RUNTIME_READ_CONTRACTS[path] as {
    arrays?: readonly string[];
    records?: readonly string[];
    numbers?: readonly string[];
  };
  return (contract.arrays ?? []).every((key) => Array.isArray(body[key]))
    && (contract.records ?? []).every((key) => (
      !!body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])
    ))
    && (contract.numbers ?? []).every((key) => Number.isSafeInteger(body[key]));
}
