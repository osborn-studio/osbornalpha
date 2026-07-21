import { afterEach, describe, expect, it } from 'vitest';
import { GET as aiAlert } from './ai/route';
import { GET as quoteAlert } from './quotes/route';
import { GET as authProbe } from '../probes/auth-email/route';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
});

describe('observability cron routes', () => {
  it('returns 503 when CRON_SECRET is absent', async () => {
    delete process.env.CRON_SECRET;
    expect((await aiAlert(new Request('http://localhost/api/cron/alerts/ai'))).status).toBe(503);
  });

  it('returns 401 for an invalid bearer token', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    expect((await quoteAlert(new Request('http://localhost/api/cron/alerts/quotes'))).status).toBe(401);
  });

  it('validates the auth probe flow before touching external services', async () => {
    process.env.CRON_SECRET = 'cron-secret';
    const response = await authProbe(new Request('http://localhost/api/cron/probes/auth-email', {
      headers: { authorization: 'Bearer cron-secret' },
    }));
    expect(response.status).toBe(400);
  });
});
