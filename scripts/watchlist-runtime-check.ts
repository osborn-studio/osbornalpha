const baseUrl = (process.env.WATCHLIST_RUNTIME_URL || 'https://stock-monitor-nu.vercel.app').replace(/\/$/, '');

interface Probe {
  path: string;
  expected: number[];
  label: string;
}

let protectedProbeCount = 0;

const probes: Probe[] = [
  // Depending on the deployment's auth middleware, an anonymous request may
  // redirect to login or receive a direct 401. Both prove the page is installed.
  { path: '/watchlist', expected: [200, 307, 401], label: 'Watchlist page' },
  // No Authorization header is intentional: an installed route must reject
  // the request without executing the job. A 404 means the deployment is
  // older than the current main branch.
  { path: '/api/cron/watchlist-alerts', expected: [401, 503], label: 'Watchlist alerts cron route' },
  { path: '/api/cron/watchlist-research', expected: [401, 503], label: 'Watchlist research cron route' },
];

async function probe(item: Probe): Promise<void> {
  const response = await fetch(`${baseUrl}${item.path}`, {
    redirect: 'manual',
    headers: { accept: 'application/json,text/html;q=0.9' },
  });
  const location = response.headers.get('location');
  const suffix = location ? ` location=${location}` : '';
  const body = await response.json().catch(() => null) as { protection?: unknown } | null;
  // Vercel Deployment Protection can terminate the request before Next.js
  // runs. Do not mistake its SSO redirect for the app's auth or Cron guard.
  if (location?.includes('vercel.com/sso-api') || location?.includes('/sso-api%3F') || body?.protection) {
    protectedProbeCount += 1;
    console.log(`${item.label}: deployment_protection${suffix || ' (Vercel SSO)'}`);
    return;
  }
  if (!item.expected.includes(response.status)) {
    throw new Error(`${item.label}: expected ${item.expected.join('/')} but received ${response.status}${suffix}`);
  }
  console.log(`${item.label}: ${response.status}${suffix}`);
}

async function main() {
  console.log(`Checking Watchlist runtime at ${baseUrl}`);
  for (const item of probes) await probe(item);
  if (protectedProbeCount > 0) {
    console.log(`Vercel deployment protection blocked ${protectedProbeCount}/${probes.length} app-level probes; rerun with a protection bypass or on the public alias.`);
  } else {
    console.log('Watchlist runtime routes are installed and protected.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
