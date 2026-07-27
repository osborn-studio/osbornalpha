import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

const mocks = vi.hoisted(() => ({
  resolveLlm: vi.fn(),
  chatResolved: vi.fn(),
  checkQuota: vi.fn(),
  recordUsageForUser: vi.fn(),
  beginUsageRun: vi.fn(),
  finalizeUsageRun: vi.fn(),
  getServerSupabase: vi.fn(),
  getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
  reserveCostBudget: vi.fn(),
  createCapExemptCostAudit: vi.fn(),
  fetchEastmoneyQuote: vi.fn(),
}));

vi.mock('@/lib/llm/resolve', () => ({
  resolveLlm: mocks.resolveLlm,
}));

vi.mock('@/lib/data/sources/llm', () => ({
  chatResolved: mocks.chatResolved,
  extractJson: (value: string) => JSON.parse(value),
}));

vi.mock('@/lib/billing/quota', () => ({
  checkQuota: mocks.checkQuota,
  recordUsageForUser: mocks.recordUsageForUser,
  beginUsageRun: mocks.beginUsageRun,
  finalizeUsageRun: mocks.finalizeUsageRun,
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: mocks.getServerSupabase,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

vi.mock('@/lib/billing/cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
    createCapExemptCostAudit: mocks.createCapExemptCostAudit,
  };
});

vi.mock('@/lib/data/sources/eastmoney', () => ({
  fetchEastmoneyQuote: mocks.fetchEastmoneyQuote,
}));

vi.mock('@/lib/data/sources/tushare-cached', () => ({
  isTushareConfigured: () => false,
  fetchTushareDailyBasic: vi.fn(),
  fetchTushareFinaIndicator: vi.fn(),
  fetchTushareIncome: vi.fn(),
}));

vi.mock('@/lib/data/personas', () => ({
  PERSONAS: [
    { id: 'value', name: 'Value', prompt: 'value prompt' },
    { id: 'risk', name: 'Risk', prompt: 'risk prompt' },
  ],
  buildUserMessage: () => 'stock context',
}));

import { GET } from './route';

const provider = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.test',
  apiKey: 'secret',
  model: 'deepseek-v4-flash',
  chatPath: '/chat/completions',
  protocol: 'openai' as const,
  source: 'env' as const,
};

const usage = (input: number, hit: number, output: number): NormalizedUsage => ({
  inputTokens: input,
  cacheHitInputTokens: hit,
  cacheMissInputTokens: input - hit,
  outputTokens: output,
  estimated: false,
});

function quote() {
  return {
    ticker: 'AAPL',
    name: 'Apple',
    market: 'US',
    currency: 'USD',
    price: 200,
    change_pct: 1,
    pe_ttm: 30,
    market_cap_label: '3T',
  };
}

function reservation(id: string, costMicrormb: number) {
  return {
    reservationId: id,
    reservedMicrormb: 1_500,
    markIncurred: vi.fn(),
    finalizeIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn(),
  };
}

function perspectiveContent(index: number) {
  return JSON.stringify({
    stance: index === 0 ? 'bullish' : 'bearish',
    confidence: 8,
    summary: `summary-${index}`,
    cites: [],
  });
}

describe('GET /api/perspectives/[ticker] cost budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlm.mockResolvedValue(provider);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 5, plan: 'free' });
    mocks.beginUsageRun.mockResolvedValue(undefined);
    mocks.finalizeUsageRun.mockImplementation(
      async (...args) => mocks.recordUsageForUser(...args),
    );
    mocks.getServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'server-user' } },
          error: null,
        }),
      },
    });
    mocks.fetchEastmoneyQuote.mockResolvedValue(quote());
  });

  it('meters every platform persona call and writes one completed aggregate ticker event', async () => {
    const reservations = [reservation('r1', 110), reservation('r2', 220)];
    mocks.reserveCostBudget
      .mockResolvedValueOnce(reservations[0])
      .mockResolvedValueOnce(reservations[1]);
    mocks.chatResolved
      .mockResolvedValueOnce({ content: perspectiveContent(0), usage: usage(100, 25, 20) })
      .mockResolvedValueOnce({ content: perspectiveContent(1), usage: usage(80, 0, 15) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.perspectives).toHaveLength(2);
    expect(mocks.reserveCostBudget).toHaveBeenCalledTimes(2);
    expect(reservations[0].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[1].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[0].settle).toHaveBeenCalledWith(usage(100, 25, 20));
    expect(reservations[1].settle).toHaveBeenCalledWith(usage(80, 0, 15));
    expect(reservations[0].release).not.toHaveBeenCalled();
    expect(reservations[1].release).not.toHaveBeenCalled();
    expect(mocks.recordUsageForUser).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsageForUser).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      ticker: 'AAPL',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 180,
      cacheHitInputTokens: 25,
      cacheMissInputTokens: 155,
      outputTokens: 35,
      costMicrormb: 330,
      pricingVersion: 'deepseek-2026-04-24',
      byo: false,
      status: 'completed',
      }),
    );
  });

  it('returns a sanitized 503 when server authentication storage is unavailable', async () => {
    mocks.getServerSupabase.mockRejectedValue(new Error('database connection detail'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      source: 'cost_quota',
      errorCode: 'budget_unavailable',
      perspectives: [],
    });
    expect(JSON.stringify(body)).not.toContain('database connection detail');
  });

  it('returns a stable cost-quota response and never calls the provider when reservation is denied', async () => {
    mocks.reserveCostBudget.mockRejectedValue(new Error('daily_cost_exhausted'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      source: 'cost_quota',
      ticker: 'AAPL',
      errorCode: 'daily_cost_exhausted',
      perspectives: [],
      costLimit: {
        dailyMicrormb: 8_800_000,
        timezone: 'Asia/Shanghai',
      },
    });
    expect(mocks.chatResolved).not.toHaveBeenCalled();
  });

  it.each([
    ['budget_unavailable', 503],
    ['pricing_unavailable', 500],
    ['budget_invariant_violation', 500],
  ])('maps stable %s to HTTP %s', async (errorCode, status) => {
    mocks.reserveCostBudget.mockRejectedValue(new Error(errorCode));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({ source: 'cost_quota', errorCode });
    expect(body).not.toHaveProperty('stack');
  });

  it('keeps failed incurred spend and writes a failed conservative audit that does not count quota', async () => {
    const current = reservation('r1', 110);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.chatResolved.mockRejectedValue(new Error('provider exploded'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(mocks.recordUsageForUser).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      ticker: 'AAPL',
      inputTokens: 1_000_000,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 400,
      costMicrormb: 1_500,
      usageEstimated: true,
      byo: false,
      status: 'failed',
      }),
    );
  });

  it('does not count a completed provider call as feature success when its perspective is unusable', async () => {
    const current = reservation('r1', 110);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.chatResolved.mockResolvedValue({ content: 'null', usage: usage(40, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).perspectives).toEqual([]);
    expect(mocks.recordUsageForUser).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      status: 'failed',
      inputTokens: 40,
      outputTokens: 5,
      costMicrormb: 110,
      }),
    );
  });

  it('keeps BYO calls outside platform pricing and budget', async () => {
    mocks.resolveLlm.mockResolvedValue({
      ...provider,
      source: 'user',
      provider: 'custom',
      model: 'private-model',
    });
    mocks.chatResolved.mockResolvedValue({
      content: perspectiveContent(0),
      usage: usage(60, 0, 10),
    });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
        ticker: 'AAPL',
        provider: 'custom',
        model: 'private-model',
        byo: true,
      }),
    );
    expect(mocks.beginUsageRun.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.recordUsageForUser).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      provider: 'custom',
      model: 'private-model',
      costMicrormb: 0,
      byo: true,
      status: 'completed',
      }),
    );
  });

  it('price-reviews and audits admin calls without the cap RPC', async () => {
    const audit = reservation('admin-audit', 73);
    mocks.createCapExemptCostAudit.mockResolvedValue(audit);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.chatResolved.mockResolvedValue({
      content: perspectiveContent(0),
      usage: usage(60, 0, 10),
    });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(mocks.createCapExemptCostAudit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
        ticker: 'AAPL',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        byo: false,
      }),
    );
    expect(mocks.beginUsageRun.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.recordUsageForUser).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: expect.any(Number),
      byo: false,
      status: 'completed',
      }),
    );
  });
});
