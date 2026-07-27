import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

const mocks = vi.hoisted(() => ({
  generateDailyBrief: vi.fn(),
  resolveLlm: vi.fn(),
  chatResolved: vi.fn(),
  checkQuota: vi.fn(),
  recordUsage: vi.fn(),
  getServerSupabase: vi.fn(),
  getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
  reserveCostBudget: vi.fn(),
  sendTelegram: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/brief/composer', () => ({
  DEFAULT_WATCHLIST: ['AAPL'],
  generateDailyBrief: mocks.generateDailyBrief,
}));

vi.mock('@/lib/llm/resolve', () => ({
  resolveLlm: mocks.resolveLlm,
}));

vi.mock('@/lib/data/sources/llm', () => ({
  chatResolved: mocks.chatResolved,
}));

vi.mock('@/lib/billing/quota', () => ({
  checkQuota: mocks.checkQuota,
  recordUsage: mocks.recordUsage,
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
  };
});

vi.mock('@/lib/data/sources/telegram', () => ({
  isTelegramConfigured: () => false,
  sendTelegram: mocks.sendTelegram,
}));

vi.mock('@/lib/data/sources/resend', () => ({
  isResendConfigured: () => false,
  sendEmail: mocks.sendEmail,
}));

import { GET as preview } from './route';
import { GET as dailyBriefCron } from '../../cron/daily-brief/route';
import { POST as sendBrief } from '../send/route';

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

function reservation(id: string, costMicrormb: number) {
  return {
    reservationId: id,
    reservedMicrormb: 1_500,
    markIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn(),
  };
}

function brief() {
  return {
    date: '2026-07-28',
    generated_at: '2026-07-28T00:00:00.000Z',
    watchlist_count: 1,
    top: [],
    overall_confidence: 5,
    overall_label: '中性',
    markdown: '# brief',
    html: '<h1>brief</h1>',
    subject: 'brief',
    meta: { duration_ms: 1, failures: 0 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('GET /api/brief/preview durable cost budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlm.mockResolvedValue(provider);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 2, plan: 'free' });
    mocks.getServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'server-user' } },
          error: null,
        }),
      },
    });
    mocks.generateDailyBrief.mockImplementation(async (_watchlist, opts) => {
      if (opts.skipLLM || !opts.llmCall) return brief();
      await opts.llmCall({
        system: 'persona',
        messages: [{ role: 'user', content: 'context' }],
        max_tokens: 400,
      });
      await opts.llmCall({
        system: 'headline',
        messages: [{ role: 'user', content: 'context' }],
        max_tokens: 300,
      });
      return brief();
    });
  });

  it('skipLLM performs no auth, quota, model, budget, or usage activity', async () => {
    const response = await preview(new Request('http://localhost/api/brief/preview?skipLLM=true'));

    expect(response.status).toBe(200);
    expect(mocks.resolveLlm).not.toHaveBeenCalled();
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.chatResolved).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
    expect(mocks.generateDailyBrief).toHaveBeenCalledWith(['AAPL'], {
      topN: 5,
      skipLLM: true,
    });
  });

  it('budgets each underlying model call and writes one completed aggregate feature event', async () => {
    const reservations = [reservation('r1', 100), reservation('r2', 200)];
    mocks.reserveCostBudget
      .mockResolvedValueOnce(reservations[0])
      .mockResolvedValueOnce(reservations[1]);
    mocks.chatResolved
      .mockResolvedValueOnce({ content: '{}', usage: usage(100, 20, 15) })
      .mockResolvedValueOnce({ content: '{}', usage: usage(60, 0, 10) });

    const response = await preview(new Request('http://localhost/api/brief/preview'));

    expect(response.status).toBe(200);
    expect(mocks.reserveCostBudget).toHaveBeenCalledTimes(2);
    expect(mocks.reserveCostBudget.mock.calls.map(([, , request]) => request.maxOutputTokens))
      .toEqual([400, 300]);
    expect(reservations[0].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[1].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[0].settle).toHaveBeenCalledWith(usage(100, 20, 15));
    expect(reservations[1].settle).toHaveBeenCalledWith(usage(60, 0, 10));
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('brief_preview', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 160,
      cacheHitInputTokens: 20,
      cacheMissInputTokens: 140,
      outputTokens: 25,
      costMicrormb: 300,
      byo: false,
      status: 'completed',
    }));
  });

  it.each([
    'daily_cost_exhausted',
    'pricing_unavailable',
    'budget_unavailable',
    'budget_invariant_violation',
  ])('returns HTTP 429 with stable %s metadata', async (errorCode) => {
    mocks.reserveCostBudget.mockRejectedValue(new Error(errorCode));

    const response = await preview(new Request('http://localhost/api/brief/preview'));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      source: 'cost_quota',
      errorCode,
      costLimit: {
        dailyMicrormb: 8_800_000,
        timezone: 'Asia/Shanghai',
      },
    });
    expect(mocks.chatResolved).not.toHaveBeenCalled();
  });

  it('audits failed incurred calls conservatively without writing a completed event', async () => {
    const current = reservation('r1', 100);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.chatResolved.mockRejectedValue(new Error('provider exploded'));
    mocks.generateDailyBrief.mockImplementation(async (_watchlist, opts) => {
      try {
        await opts.llmCall({
          messages: [{ role: 'user', content: 'context' }],
          max_tokens: 400,
        });
      } catch {
        // Composer degrades ordinary provider failures into a partial brief.
      }
      return { ...brief(), meta: { duration_ms: 1, failures: 1 } };
    });

    const response = await preview(new Request('http://localhost/api/brief/preview'));

    expect(response.status).toBe(200);
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledWith('brief_preview', expect.objectContaining({
      inputTokens: 1_000_000,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 400,
      costMicrormb: 1_500,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
  });

  it('waits for a later sibling settlement and includes it in the single failed audit', async () => {
    const failed = reservation('r1', 100);
    failed.settle.mockRejectedValue(new Error('budget_invariant_violation'));
    const sibling = reservation('r2', 222);
    mocks.reserveCostBudget
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(sibling);
    const later = deferred<{ content: string; usage: NormalizedUsage }>();
    mocks.chatResolved
      .mockResolvedValueOnce({ content: '{}', usage: usage(40, 0, 8) })
      .mockImplementationOnce(() => later.promise);
    mocks.generateDailyBrief.mockImplementation(async (_watchlist, opts) => {
      const results = await Promise.allSettled([
        opts.llmCall({
          messages: [{ role: 'user', content: 'first' }],
          max_tokens: 400,
        }),
        opts.llmCall({
          messages: [{ role: 'user', content: 'second' }],
          max_tokens: 300,
        }),
      ]);
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      throw (results[0] as PromiseRejectedResult).reason;
    });

    const responsePromise = preview(new Request('http://localhost/api/brief/preview'));
    let returned = false;
    void responsePromise.then(() => { returned = true; });

    await vi.waitFor(() => expect(mocks.chatResolved).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(mocks.recordUsage).not.toHaveBeenCalled();

    later.resolve({ content: '{}', usage: usage(60, 10, 12) });
    const response = await responsePromise;

    expect(response.status).toBe(429);
    expect((await response.json()).errorCode).toBe('budget_invariant_violation');
    expect(sibling.settle).toHaveBeenCalledWith(usage(60, 10, 12));
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('brief_preview', expect.objectContaining({
      inputTokens: 100,
      cacheHitInputTokens: 10,
      cacheMissInputTokens: 90,
      outputTokens: 20,
      costMicrormb: 1_722,
      usageEstimated: true,
      status: 'failed',
    }));
  });

  it('keeps BYO previews outside platform pricing and budget', async () => {
    mocks.resolveLlm.mockResolvedValue({
      ...provider,
      source: 'user',
      provider: 'custom',
      model: 'private-model',
    });
    mocks.chatResolved.mockResolvedValue({ content: '{}', usage: usage(20, 0, 5) });

    const response = await preview(new Request('http://localhost/api/brief/preview'));

    expect(response.status).toBe(200);
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledWith('brief_preview', expect.objectContaining({
      provider: 'custom',
      model: 'private-model',
      costMicrormb: 0,
      byo: true,
      status: 'completed',
    }));
  });

  it('price-reviews and audits admins without the cap RPC', async () => {
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.chatResolved.mockResolvedValue({ content: '{}', usage: usage(20, 0, 5) });

    const response = await preview(new Request('http://localhost/api/brief/preview'));

    expect(response.status).toBe(200);
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledWith('brief_preview', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: expect.any(Number),
      byo: false,
      status: 'completed',
    }));
  });
});

describe('daily brief non-preview separation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateDailyBrief.mockResolvedValue(brief());
  });

  it('does not install user budget metering in cron or send composition', async () => {
    const cronResponse = await dailyBriefCron(new Request('http://localhost/api/cron/daily-brief'));
    const sendResponse = await sendBrief(new Request('http://localhost/api/brief/send', {
      method: 'POST',
      body: JSON.stringify({ channels: ['telegram'] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(cronResponse.status).toBe(200);
    expect(sendResponse.status).toBe(200);
    expect(mocks.generateDailyBrief).toHaveBeenNthCalledWith(1, ['AAPL'], { topN: 5 });
    expect(mocks.generateDailyBrief).toHaveBeenNthCalledWith(2, ['AAPL'], {
      topN: 5,
      skipLLM: false,
    });
    expect(mocks.resolveLlm).not.toHaveBeenCalled();
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });
});
