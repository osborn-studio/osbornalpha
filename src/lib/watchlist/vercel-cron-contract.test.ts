import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelCron {
  path: string;
  schedule: string;
}

describe('Watchlist Vercel cron contract', () => {
  it('registers the dispatcher and a shorter recovery loop for AI work', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: VercelCron[];
    };
    const watchlistCrons = (config.crons ?? []).filter((cron) => cron.path.includes('watchlist'));

    expect(watchlistCrons).toEqual([
      { path: '/api/cron/watchlist-dispatch', schedule: '2,17,32,47 * * * *' },
      { path: '/api/cron/watchlist-perspectives', schedule: '*/5 * * * *' },
    ]);
  });
});
