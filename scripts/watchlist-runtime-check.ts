const baseUrl = (process.env.WATCHLIST_RUNTIME_URL || 'https://stock-monitor-nu.vercel.app').replace(/\/$/, '');

interface Probe {
  path: string;
  expected: number[];
  label: string;
}

const probes: Probe[] = [
  { path: '/watchlist', expected: [200, 307], label: 'Watchlist page' },
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
  if (!item.expected.includes(response.status)) {
    throw new Error(`${item.label}: expected ${item.expected.join('/')} but received ${response.status}${suffix}`);
  }
  console.log(`${item.label}: ${response.status}${suffix}`);
}

async function main() {
  console.log(`Checking Watchlist runtime at ${baseUrl}`);
  for (const item of probes) await probe(item);
  console.log('Watchlist runtime routes are installed and protected.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
