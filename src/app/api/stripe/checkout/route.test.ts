import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: vi.fn(),
  serverIsSupabaseConfigured: vi.fn(),
}));

import { POST } from './route';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_PASS_30D', 'STRIPE_PRICE_SUB_MONTHLY'] as const;
const ORIGINAL_ENV: Record<string, string | undefined> = {};

function request(body: unknown) {
  return new Request('http://localhost/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL_ENV[k] = process.env[k];
    delete process.env[k];
  }
  vi.mocked(serverIsSupabaseConfigured).mockReset().mockReturnValue(true);
  vi.mocked(getServerSupabase).mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe('POST /api/stripe/checkout', () => {
  it('returns 503 when Supabase is not configured', async () => {
    vi.mocked(serverIsSupabaseConfigured).mockReturnValue(false);
    const res = await POST(request({ mode: 'pass' }));
    expect(res.status).toBe(503);
  });

  it('returns 503 when Stripe is not configured (no STRIPE_SECRET_KEY)', async () => {
    vi.mocked(getServerSupabase).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }) },
    } as any);
    const res = await POST(request({ mode: 'pass' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it('returns 401 when no authenticated user', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_PRICE_PASS_30D = 'price_pass';
    process.env.STRIPE_PRICE_SUB_MONTHLY = 'price_sub';
    vi.mocked(getServerSupabase).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);
    const res = await POST(request({ mode: 'pass' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid mode', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    process.env.STRIPE_PRICE_PASS_30D = 'price_pass';
    process.env.STRIPE_PRICE_SUB_MONTHLY = 'price_sub';
    vi.mocked(getServerSupabase).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }) },
    } as any);
    const res = await POST(request({ mode: 'yearly' }));
    expect(res.status).toBe(400);
  });
});
