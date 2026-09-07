import {
  isVercelDeploymentProtectionResponse,
  isWatchlistOverviewRuntimePayload,
  isWatchlistRuntimeReadPayload,
  resolveWatchlistRuntimeAuth,
  resolveWatchlistRuntimeUrl,
  WATCHLIST_RUNTIME_READ_CONTRACTS,
} from '../src/lib/watchlist/runtime-verifier';

const baseUrl = resolveWatchlistRuntimeUrl();
const auth = resolveWatchlistRuntimeAuth();

interface Probe {
  path: string;
  expected: number[];
  label: string;
  method?: 'GET' | 'POST';
}

const probes: Probe[] = [
  // Depending on the deployment's auth middleware, an anonymous request may
  // redirect to login or receive a direct 401. Both prove the page is installed.
  { path: '/watchlist', expected: [307, 401], label: 'Watchlist page' },
  // No Authorization header is intentional: an installed route must reject
  // the request without executing the job. A 404 means the deployment is
  // older than the current main branch.
  { path: '/api/cron/watchlist-dispatch', expected: [401], label: 'Watchlist dispatcher cron route' },
  { path: '/api/cron/watchlist-perspectives', expected: [401], label: 'Watchlist perspective worker cron route' },
  { path: '/api/cron/watchlist-metrics', expected: [401], label: 'Watchlist metric worker cron route' },
  { path: '/api/cron/watchlist-research', expected: [401], label: 'Watchlist research worker cron route' },
  { path: '/api/cron/watchlist-alerts', expected: [401], label: 'Watchlist alert worker cron route' },
  { path: '/api/watchlist/overview', expected: [401], label: 'Watchlist overview route' },
  { path: '/api/watchlist/research/jobs?ticker=AAPL', expected: [401], label: 'Watchlist research jobs route' },
  { path: '/api/watchlist/perspective-feedback', expected: [401], label: 'Perspective feedback route' },
  { path: '/api/watchlist/perspective-claim-feedback', expected: [401], label: 'Perspective claim feedback route', method: 'POST' },
];

async function signIn(): Promise<string> {
  const response = await fetch(`${auth.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: auth.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: auth.email, password: auth.password }),
  });
  const body = await response.json().catch(() => null) as { access_token?: unknown } | null;
  if (!response.ok || typeof body?.access_token !== 'string' || !body.access_token) {
    throw new Error(`Watchlist runtime sign-in failed: ${response.status}`);
  }
  return body.access_token;
}

async function probe(item: Probe): Promise<void> {
  const response = await fetch(`${baseUrl}${item.path}`, {
    method: item.method ?? 'GET',
    redirect: 'manual',
    headers: { accept: 'application/json,text/html;q=0.9' },
  });
  const location = response.headers.get('location');
  const suffix = location ? ` location=${location}` : '';
  const body = await response.json().catch(() => null) as { protection?: unknown } | null;
  // Vercel Deployment Protection can terminate the request before Next.js
  // runs. Do not mistake its SSO redirect for the app's auth or Cron guard.
  if (isVercelDeploymentProtectionResponse(location, body)) {
    throw new Error(`${item.label}: deployment_protection_blocked${suffix || ' (Vercel SSO)'}`);
  }
  if (!item.expected.includes(response.status)) {
    throw new Error(`${item.label}: expected ${item.expected.join('/')} but received ${response.status}${suffix}`);
  }
  console.log(`${item.label}: ${response.status}${suffix}`);
}

async function main() {
  console.log(`Checking Watchlist runtime at ${baseUrl}`);
  for (const item of probes) await probe(item);
  const accessToken = await signIn();
  const overviewResponse = await fetch(`${baseUrl}/api/watchlist/overview?limit=1`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  const overviewBody = await overviewResponse.json().catch(() => null);
  if (overviewResponse.status !== 200 || !overviewResponse.headers.get('x-request-id')
    || !isWatchlistOverviewRuntimePayload(overviewBody)) {
    throw new Error(`Authenticated Watchlist overview: invalid response (${overviewResponse.status})`);
  }
  console.log('Authenticated Watchlist overview: 200 contract-valid');

  for (const path of Object.keys(WATCHLIST_RUNTIME_READ_CONTRACTS) as Array<keyof typeof WATCHLIST_RUNTIME_READ_CONTRACTS>) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
    });
    const body = await response.json().catch(() => null);
    if (response.status !== 200 || !response.headers.get('x-request-id')
      || !isWatchlistRuntimeReadPayload(path, body)) {
      throw new Error(`Authenticated ${path}: invalid response (${response.status})`);
    }
    console.log(`Authenticated ${path}: 200 contract-valid`);
  }
  console.log('Watchlist runtime routes are installed, protected, and serving authenticated data.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
