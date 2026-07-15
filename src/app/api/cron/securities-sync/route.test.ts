import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/securities/sync/service', () => ({
  syncSecurityScopes: vi.fn(async () => [{ scope: 'a_stock', status: 'success' }]),
}));

import { GET } from './route';

describe('securities sync cron', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it('fails closed when CRON_SECRET is absent', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request('https://example.com/api/cron/securities-sync?region=asia'));
    expect(response.status).toBe(503);
  });

  it('rejects missing authorization and invalid regions', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect((await GET(new Request('https://example.com/api/cron/securities-sync?region=asia'))).status).toBe(401);
    expect((await GET(new Request('https://example.com/api/cron/securities-sync?region=other', {
      headers: { authorization: 'Bearer cron-secret' },
    }))).status).toBe(400);
  });

  it('runs the approved regional scope with a bearer secret', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const response = await GET(new Request('https://example.com/api/cron/securities-sync?region=asia', {
      headers: { authorization: 'Bearer cron-secret' },
    }));
    expect(response.status).toBe(200);
  });
});
