import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface VercelCron {
  path: string;
  schedule: string;
}

describe('Watchlist Vercel cron contract', () => {
  it('keeps high-frequency Watchlist work on the external scheduler', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: VercelCron[];
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    const watchlistCrons = (config.crons ?? []).filter((cron) => cron.path.includes('watchlist'));

    expect(watchlistCrons).toEqual([]);
    expect(config.git?.deploymentEnabled?.main).not.toBe(false);
  });
});
