import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/watchlist-external-scheduler.yml', import.meta.url),
  'utf8',
);

describe('Watchlist external scheduler contract', () => {
  it('runs every five minutes with a secret-authenticated HTTPS production target', () => {
    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}');
    expect(workflow).toContain('WATCHLIST_SCHEDULER_URL: ${{ vars.WATCHLIST_SCHEDULER_URL }}');
    expect(workflow).toContain('https://*');
  });

  it('serially invokes both high-frequency Watchlist endpoints', () => {
    const dispatch = workflow.indexOf('call_cron /api/cron/watchlist-dispatch');
    const perspectives = workflow.indexOf('call_cron /api/cron/watchlist-perspectives');

    expect(dispatch).toBeGreaterThan(-1);
    expect(perspectives).toBeGreaterThan(dispatch);
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('--retry 2 --retry-all-errors --max-time 300');
  });
});
