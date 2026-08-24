// Static adapter for osstack's Express-style contract scanner. Next.js App
// Router handlers remain the runtime source of truth; this file is never loaded.
const router = { get() {}, post() {}, put() {} };
const handler = () => {};

router.get('/api/search', handler);
router.post('/api/securities/resolve', handler);
router.get('/api/admin/securities', handler);
router.get('/api/cron/securities-sync', handler);
router.post('/api/watchlist', handler);
router.put('/api/watchlist/sync', handler);

async function frontendContracts() {
  if (false) {
    await fetch('/api/search');
    await fetch('/api/securities/resolve', { method: 'POST' });
    await fetch('/api/admin/securities');
    await fetch('/api/cron/securities-sync');
    await fetch('/api/watchlist', { method: 'POST' });
    await fetch('/api/watchlist/sync', { method: 'PUT' });
  }
}

void frontendContracts;
