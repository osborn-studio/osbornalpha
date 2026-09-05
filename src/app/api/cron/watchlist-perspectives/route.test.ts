import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/watchlist/cron-jobs', () => ({ runPerspectiveGenerationJob: mocks.run }));

import { GET } from './route';

function request(secret = 'secret') {
  return new Request('https://example.test/api/cron/watchlist-perspectives', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('GET /api/cron/watchlist-perspectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'secret');
    mocks.run.mockResolvedValue({ ok: true, claimed: 1, succeeded: 1, queued: 0, failed: 0 });
  });

  it('fails closed before running queue work', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request())).status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('requires the cron bearer secret', async () => {
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('runs the queue and attaches trace metadata', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('x-cron-run-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 1, succeeded: 1, failed: 0 });
  });

  it('returns a redacted failure envelope', async () => {
    mocks.run.mockRejectedValueOnce(new Error('provider_error:secret details'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret details');
  });
});
