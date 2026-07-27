import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AdminUnauthenticated extends Error {}
  class AdminForbidden extends Error {}
  return {
    AdminUnauthenticated,
    AdminForbidden,
    requireAdminUser: vi.fn(),
    generateDailyBrief: vi.fn(),
    resolveLlm: vi.fn(),
    chatResolved: vi.fn(),
    checkQuota: vi.fn(),
    usageFinalized: vi.fn(),
    beginUsageRun: vi.fn(),
    finalizeUsageRun: vi.fn(),
    getServerSupabase: vi.fn(),
    getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
    reserveCostBudget: vi.fn(),
    createCapExemptCostAudit: vi.fn(),
    sendTelegram: vi.fn(),
    sendEmail: vi.fn(),
    isTelegramConfigured: vi.fn(),
    isResendConfigured: vi.fn(),
    getRequestLocale: vi.fn(),
    apiMessage: vi.fn(),
  };
});

vi.mock('@/lib/brief/composer', () => ({
  DEFAULT_WATCHLIST: ['AAPL'],
  generateDailyBrief: mocks.generateDailyBrief,
}));
vi.mock('@/lib/llm/resolve', () => ({ resolveLlm: mocks.resolveLlm }));
vi.mock('@/lib/data/sources/llm', () => ({ chatResolved: mocks.chatResolved }));
vi.mock('@/lib/billing/quota', () => ({
  checkQuota: mocks.checkQuota,
  beginUsageRun: mocks.beginUsageRun,
  finalizeUsageRun: mocks.finalizeUsageRun,
}));
vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdminSupabase }));
vi.mock('@/lib/i18n/server', () => ({
  getRequestLocale: mocks.getRequestLocale,
  apiMessage: mocks.apiMessage,
}));
vi.mock('@/lib/admin/auth', () => ({
  AdminUnauthenticated: mocks.AdminUnauthenticated,
  AdminForbidden: mocks.AdminForbidden,
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock('@/lib/billing/cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
    createCapExemptCostAudit: mocks.createCapExemptCostAudit,
  };
});
vi.mock('@/lib/data/sources/telegram', () => ({
  isTelegramConfigured: mocks.isTelegramConfigured,
  sendTelegram: mocks.sendTelegram,
}));
vi.mock('@/lib/data/sources/resend', () => ({
  isResendConfigured: mocks.isResendConfigured,
  sendEmail: mocks.sendEmail,
}));

import { POST } from './route';

const provider = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.test',
  apiKey: 'secret',
  model: 'deepseek-v4-flash',
  chatPath: '/chat/completions',
  protocol: 'openai' as const,
  source: 'env' as const,
};

const normalizedUsage = {
  inputTokens: 40,
  cacheHitInputTokens: 10,
  cacheMissInputTokens: 30,
  outputTokens: 8,
  estimated: false,
};

function reservation() {
  return {
    reservationId: 'r1',
    reservedMicrormb: 1_500,
    markIncurred: vi.fn(),
    finalizeIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb: 123, usageEstimated: false }),
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

function request(body: unknown) {
  return new Request('http://localhost/api/brief/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/brief/send security and metering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: 'server-user' });
    mocks.getServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'server-user' } },
          error: null,
        }),
      },
    });
    mocks.resolveLlm.mockResolvedValue(provider);
    mocks.getRequestLocale.mockResolvedValue('en');
    mocks.apiMessage.mockImplementation((locale: string, key: string) => `localized:${locale}:${key}`);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 2, plan: 'free' });
    mocks.isTelegramConfigured.mockReturnValue(true);
    mocks.isResendConfigured.mockReturnValue(true);
    mocks.reserveCostBudget.mockResolvedValue(reservation());
    mocks.beginUsageRun.mockResolvedValue(undefined);
    mocks.chatResolved.mockResolvedValue({ content: '{}', usage: normalizedUsage });
    mocks.finalizeUsageRun.mockImplementation(async (...args) => {
      await mocks.usageFinalized(...args);
    });
    mocks.generateDailyBrief.mockImplementation(async (_watchlist, opts) => {
      if (opts.mode === 'metered') {
        await opts.llmCall({
          messages: [{ role: 'user', content: 'context' }],
          max_tokens: 400,
        });
      }
      return brief();
    });
  });

  it('requires authentication even for raw send mode', async () => {
    mocks.requireAdminUser.mockRejectedValue(new mocks.AdminUnauthenticated());

    const response = await POST(request({ text: 'ping', channels: ['telegram'] }));

    expect(response.status).toBe(401);
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
    expect(mocks.generateDailyBrief).not.toHaveBeenCalled();
  });

  it('returns 503 rather than 401 when authentication storage is unavailable', async () => {
    mocks.requireAdminUser.mockRejectedValue(new Error('database connection detail'));

    const response = await POST(request({ text: 'hello', channels: [] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'authentication unavailable' });
  });

  it('forbids authenticated non-admin users', async () => {
    mocks.requireAdminUser.mockRejectedValue(new mocks.AdminForbidden());

    const response = await POST(request({ text: 'hello', channels: ['telegram'] }));

    expect(response.status).toBe(403);
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
  });

  it('rejects recipient overrides and malformed manual payloads', async () => {
    for (const body of [
      { text: 'ping', chatId: 'attacker-chat' },
      { text: 'ping', to: 'attacker@example.test' },
      { text: 'x'.repeat(4_001) },
      { text: 'ping', subject: 'x'.repeat(201) },
      { text: 'ping', channels: ['telegram', 'sms'] },
      { text: 'ping', channels: [1] },
      { text: 123 },
      { text: 'ping', subject: 123 },
      { watchlist: 'AAPL' },
      { topN: 'not-a-number' },
      { skipLLM: 'true' },
      { watchlist: ['AAPL', 'bad ticker'] },
      null,
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.sendTelegram).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.generateDailyBrief).not.toHaveBeenCalled();
  });

  it('rejects an oversized watchlist and clamps topN to the safe maximum', async () => {
    const oversized = await POST(request({
      watchlist: Array.from({ length: 11 }, (_, index) => `T${index}`),
    }));
    expect(oversized.status).toBe(400);
    expect(mocks.generateDailyBrief).not.toHaveBeenCalled();

    const bounded = await POST(request({ watchlist: ['AAPL'], topN: 999 }));
    expect(bounded.status).toBe(200);
    expect(mocks.generateDailyBrief).toHaveBeenCalledWith(['AAPL'], expect.objectContaining({
      topN: 5,
      mode: 'metered',
    }));
  });

  it('uses the brief_preview count and per-call durable cost budget', async () => {
    const current = reservation();
    mocks.reserveCostBudget.mockResolvedValue(current);

    const response = await POST(request({ channels: ['telegram'] }));

    expect(response.status).toBe(200);
    expect(mocks.checkQuota).toHaveBeenCalledWith('brief_preview');
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.settle).toHaveBeenCalledWith(normalizedUsage);
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'brief_preview',
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        byo: false,
      }),
    );
    expect(mocks.finalizeUsageRun).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'brief_preview',
      expect.objectContaining({
      inputTokens: 40,
      cacheHitInputTokens: 10,
      cacheMissInputTokens: 30,
      outputTokens: 8,
      costMicrormb: 123,
      byo: false,
      status: 'completed',
      }),
    );
  });

  it('durably begins BYO and admin-exempt runs before provider network activity', async () => {
    const byo = { ...provider, source: 'user' as const };
    mocks.resolveLlm.mockResolvedValue(byo);
    mocks.chatResolved.mockImplementation(async () => {
      expect(mocks.beginUsageRun).toHaveBeenCalledTimes(1);
      return { content: '{}', usage: normalizedUsage };
    });

    const byoResponse = await POST(request({ channels: ['telegram'] }));
    expect(byoResponse.status).toBe(200);
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'brief_preview',
      expect.objectContaining({ byo: true }),
    );

    vi.clearAllMocks();
    mocks.requireAdminUser.mockResolvedValue({ id: 'server-admin' });
    mocks.resolveLlm.mockResolvedValue(provider);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.reserveCostBudget.mockResolvedValue(reservation());
    const adminAudit = reservation();
    mocks.createCapExemptCostAudit.mockResolvedValue(adminAudit);
    mocks.isTelegramConfigured.mockReturnValue(true);
    mocks.isResendConfigured.mockReturnValue(true);
    mocks.finalizeUsageRun.mockImplementation(async (...args) => {
      await mocks.usageFinalized(...args);
    });
    mocks.generateDailyBrief.mockImplementation(async (_watchlist, opts) => {
      await opts.llmCall({ messages: [{ role: 'user', content: 'context' }], max_tokens: 400 });
      return brief();
    });
    mocks.chatResolved.mockImplementation(async () => {
      expect(mocks.beginUsageRun).toHaveBeenCalledTimes(1);
      return { content: '{}', usage: normalizedUsage };
    });

    const adminResponse = await POST(request({ channels: ['telegram'] }));
    expect(adminResponse.status).toBe(200);
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-admin',
      expect.any(String),
      'brief_preview',
      expect.objectContaining({ byo: false }),
    );
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledWith(
      { kind: 'admin-db' },
      'server-admin',
      expect.objectContaining({
        feature: 'brief_preview',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      }),
      expect.any(String),
    );
    expect(mocks.createCapExemptCostAudit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(adminAudit.settle).toHaveBeenCalledWith(normalizedUsage);
  });

  it('keeps authenticated skipLLM sends outside count and cost accounting', async () => {
    const response = await POST(request({ skipLLM: true, channels: ['telegram'] }));

    expect(response.status).toBe(200);
    expect(mocks.generateDailyBrief).toHaveBeenCalledWith(['AAPL'], {
      topN: 5,
      mode: 'skip_llm',
    });
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).not.toHaveBeenCalled();
  });

  it.each([
    ['daily_cost_exhausted', 429],
    ['budget_unavailable', 503],
    ['pricing_unavailable', 500],
    ['budget_invariant_violation', 500],
    ['usage_audit_unavailable', 503],
    ['usage_audit_invariant', 500],
  ])('maps %s to HTTP %s without exposing a stack', async (errorCode, status) => {
    if (String(errorCode).startsWith('usage_audit')) {
      mocks.beginUsageRun.mockRejectedValue(new Error(errorCode));
    } else {
      mocks.reserveCostBudget.mockRejectedValue(new Error(errorCode));
    }

    const response = await POST(request({ channels: ['telegram'] }));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({
      source: 'cost_quota',
      errorCode,
      ...(errorCode === 'daily_cost_exhausted' ? {
        quota: { reason: 'daily_cost_exhausted', costLimitMicrormb: 8_800_000 },
      } : {}),
    });
    expect(body).not.toHaveProperty('stack');
    expect(mocks.chatResolved).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'daily_cost_exhausted', 'dailyCostExhausted'],
    ['zh', 'budget_unavailable', 'budgetUnavailable'],
  ])('returns a localized %s message and separate stable code for %s', async (locale, errorCode, messageKey) => {
    mocks.getRequestLocale.mockResolvedValue(locale);
    mocks.reserveCostBudget.mockRejectedValue(new Error(errorCode));

    const response = await POST(request({ channels: ['telegram'] }));
    const body = await response.json();

    expect(body).toMatchObject({
      source: 'cost_quota',
      error: `localized:${locale}:${messageKey}`,
      code: errorCode,
      errorCode,
      ...(errorCode === 'daily_cost_exhausted' ? {
        quota: { reason: 'daily_cost_exhausted', costLimitMicrormb: 8_800_000 },
      } : {}),
    });
  });
});
