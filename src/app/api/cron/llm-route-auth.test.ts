import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/brief/radar-digest', () => ({
  buildRadarDigest: vi.fn(async () => {
    throw new Error('LLM work must not start before cron auth');
  }),
}));

vi.mock('@/lib/research/service', () => ({
  getServiceResearchCtx: vi.fn(() => {
    throw new Error('research work must not start before cron auth');
  }),
}));

vi.mock('@/lib/research/signals', () => ({
  extractSignals: vi.fn(),
}));

vi.mock('@/lib/research/monitor', () => ({
  monitorAllTheses: vi.fn(),
}));

import { GET as dailyRadar } from './daily-radar/route';
import {
  GET as researchDailyGet,
  POST as researchDailyPost,
} from './research-daily/route';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('LLM cron route authentication', () => {
  it('fails closed for radar previews when CRON_SECRET is absent', async () => {
    delete process.env.CRON_SECRET;
    const response = await dailyRadar(
      new Request('http://localhost/api/cron/daily-radar?preview=1'),
    );
    expect(response.status).toBe(503);
  });

  it('does not let force bypass radar authentication', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const response = await dailyRadar(
      new Request('http://localhost/api/cron/daily-radar?force=1'),
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ['GET', researchDailyGet],
    ['POST', researchDailyPost],
  ])('fails closed for research %s when CRON_SECRET is absent', async (_method, handler) => {
    delete process.env.CRON_SECRET;
    const response = await handler(
      new Request('http://localhost/api/cron/research-daily?force=1'),
    );
    expect(response.status).toBe(503);
  });

  it('does not let force bypass research authentication', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const response = await researchDailyGet(
      new Request('http://localhost/api/cron/research-daily?force=1'),
    );
    expect(response.status).toBe(401);
  });
});
