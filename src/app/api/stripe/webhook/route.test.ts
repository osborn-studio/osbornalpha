import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: vi.fn(),
}));

import { POST } from './route';
import { getAdminSupabase } from '@/lib/supabase/admin';

const WHSEC = 'whsec_test_dummy_secret';
const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const;
const ORIGINAL_ENV: Record<string, string | undefined> = {};

function signedRequest(payload: string, secret = WHSEC) {
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  });
}

function fakeEventPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', mode: 'payment', metadata: { user_id: 'u1' } } },
    ...overrides,
  });
}

// Chainable Supabase query-builder mock: .from().select().eq().maybeSingle() /
// .from().insert() / .from().update().eq() — configurable per test.
function makeAdminMock(opts: {
  insertEventResult?: { error: any };
  profile?: { plan: string | null; plan_expires_at: string | null } | null;
  profileByCustomer?: ({ id: string; plan: string | null; plan_expires_at: string | null }) | null;
}) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const insert = vi.fn().mockResolvedValue(opts.insertEventResult ?? { error: null });

  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.profileByCustomer !== undefined ? opts.profileByCustomer : opts.profile ?? null,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });

  const from = vi.fn().mockReturnValue({ insert, update, select });
  return { from, __update: update, __updateEq: updateEq, __insert: insert };
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    ORIGINAL_ENV[k] = process.env[k];
  }
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
  vi.mocked(getAdminSupabase).mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe('POST /api/stripe/webhook', () => {
  it('returns 503 when payments are not configured (missing secret key)', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await POST(signedRequest(fakeEventPayload()));
    expect(res.status).toBe(503);
  });

  it('returns 400 for a bad signature', async () => {
    const payload = fakeEventPayload();
    const res = await POST(signedRequest(payload, 'whsec_wrong_secret'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: fakeEventPayload(),
    }));
    expect(res.status).toBe(400);
  });

  it('grants pro on checkout.session.completed (mode=payment) and writes the update', async () => {
    const admin = makeAdminMock({ profile: { plan: 'free', plan_expires_at: null } });
    vi.mocked(getAdminSupabase).mockReturnValue(admin as any);

    const payload = fakeEventPayload();
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);

    expect(admin.__update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'pro' }));
    expect(admin.__updateEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('deduplicates a repeated event id (unique violation -> 200 duplicate)', async () => {
    const admin = makeAdminMock({ insertEventResult: { error: { code: '23505', message: 'duplicate key' } } });
    vi.mocked(getAdminSupabase).mockReturnValue(admin as any);

    const payload = fakeEventPayload();
    const res = await POST(signedRequest(payload));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    // The handler must not have been reached — no profile update issued.
    expect(admin.__update).not.toHaveBeenCalled();
  });

  it('downgrades to free on customer.subscription.deleted when no pass balance remains', async () => {
    const admin = makeAdminMock({
      profileByCustomer: { id: 'u2', plan: 'pro', plan_expires_at: null },
    });
    vi.mocked(getAdminSupabase).mockReturnValue(admin as any);

    const payload = JSON.stringify({
      id: 'evt_test_2',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } },
    });
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(admin.__update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free', plan_expires_at: null }));
  });

  it('protects an unexpired pass balance on subscription end (stays pro)', async () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const admin = makeAdminMock({
      profileByCustomer: { id: 'u3', plan: 'pro', plan_expires_at: future },
    });
    vi.mocked(getAdminSupabase).mockReturnValue(admin as any);

    const payload = JSON.stringify({
      id: 'evt_test_3',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_2', customer: 'cus_2', status: 'canceled' } },
    });
    const res = await POST(signedRequest(payload));
    expect(res.status).toBe(200);
    expect(admin.__update).toHaveBeenCalledWith(expect.objectContaining({ plan: 'pro', plan_expires_at: future }));
  });
});
