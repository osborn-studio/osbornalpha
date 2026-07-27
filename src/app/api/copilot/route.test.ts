import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

const mocks = vi.hoisted(() => ({
  toolChat: vi.fn(),
  anthropicToolChat: vi.fn(),
  resolveLlm: vi.fn(),
  resolvePlatformLlm: vi.fn(),
  checkQuota: vi.fn(),
  usageFinalized: vi.fn(),
  usageFinalizedForUser: vi.fn(),
  beginUsageRun: vi.fn(),
  finalizeUsageRun: vi.fn(),
  reserveCostBudget: vi.fn(),
  createCapExemptCostAudit: vi.fn(),
  getBudgetConfig: vi.fn(() => ({
    dailyLimitMicrormb: 8_800_000,
    usdCnyMicros: 7_200_000,
    reservationTtlSeconds: 300,
  })),
  getServerSupabase: vi.fn(),
  getAdminSupabase: vi.fn(),
  getRequestLocale: vi.fn(),
  apiMessage: vi.fn((_locale: string, key: string) => `localized:${key}`),
  createArtifact: vi.fn(),
  createAiRun: vi.fn(),
  completeAiRun: vi.fn(),
  failAiRun: vi.fn(),
  failStaleAiRuns: vi.fn(),
  radarHandler: vi.fn(),
}));

vi.mock('@/lib/llm/openai-compat', () => ({ toolChat: mocks.toolChat }));
vi.mock('@/lib/llm/anthropic-compat', () => ({ anthropicToolChat: mocks.anthropicToolChat }));
vi.mock('@/lib/llm/resolve', () => ({
  resolveLlm: mocks.resolveLlm,
  resolvePlatformLlm: mocks.resolvePlatformLlm,
}));
vi.mock('@/lib/billing/quota', () => ({
  checkQuota: mocks.checkQuota,
  beginUsageRun: mocks.beginUsageRun,
  finalizeUsageRun: mocks.finalizeUsageRun,
}));
vi.mock('@/lib/billing/cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
    createCapExemptCostAudit: mocks.createCapExemptCostAudit,
    getBudgetConfig: mocks.getBudgetConfig,
  };
});
vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: mocks.getServerSupabase }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: mocks.getAdminSupabase }));
vi.mock('@/lib/i18n/server', () => ({
  getRequestLocale: mocks.getRequestLocale,
  apiMessage: mocks.apiMessage,
}));
vi.mock('@/lib/portfolio/artifacts-store', () => ({ createArtifact: mocks.createArtifact }));
vi.mock('@/lib/copilot/runs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/copilot/runs')>();
  return {
    ...actual,
    createAiRun: mocks.createAiRun,
    completeAiRun: mocks.completeAiRun,
    failAiRun: mocks.failAiRun,
    failStaleAiRuns: mocks.failStaleAiRuns,
  };
});
vi.mock('@/lib/agent/tools', () => ({
  OPENAI_TOOL_DEFS: [{ name: 'radar', description: 'radar', parameters: {} }],
  TOOLS_BY_NAME: { radar: { handler: mocks.radarHandler } },
}));

import { POST } from './route';
import {
  MAX_OUTPUT_TOKENS,
  estimateSerializedTokens,
} from '@/lib/copilot/cost-accounting';

const PLATFORM = {
  source: 'env' as const,
  provider: 'deepseek',
  protocol: 'openai' as const,
  baseUrl: 'https://platform.example',
  apiKey: 'platform-key',
  model: 'deepseek-v4-flash',
  chatPath: '/chat/completions',
};

const UNPRICED_PLATFORM = {
  ...PLATFORM,
  model: 'unreviewed-admin-model',
};

const ADMIN_CEILING_COST_MICRORMB = 1_026_144;

const BYO = {
  source: 'user' as const,
  provider: 'ark',
  protocol: 'openai' as const,
  baseUrl: 'https://byo.example',
  apiKey: 'byo-key',
  model: 'byo-model',
  chatPath: '/chat/completions',
};

const usage = (
  inputTokens: number,
  cacheHitInputTokens: number,
  outputTokens: number,
  estimated = false,
): NormalizedUsage => ({
  inputTokens,
  cacheHitInputTokens,
  cacheMissInputTokens: inputTokens - cacheHitInputTokens,
  outputTokens,
  estimated,
});

function request() {
  return new Request('http://localhost/api/copilot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticker: 'NVDA', question: 'Analyze it' }),
  });
}

async function runRoute() {
  const response = await POST(request());
  return { response, text: await response.text() };
}

function reservation(costMicrormb: number, reservedMicrormb = costMicrormb + 100) {
  const current = {
    reservationId: `reservation-${costMicrormb}`,
    reservedMicrormb,
    durableAudit: undefined as undefined | {
      inputTokens: number;
      cacheHitInputTokens: number;
      cacheMissInputTokens: number;
      outputTokens: number;
      pricingVersion: string;
      usdCnyMicros: number;
      usageEstimated: boolean;
    },
    markIncurred: vi.fn().mockResolvedValue(undefined),
    finalizeIncurred: vi.fn().mockResolvedValue(undefined),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn().mockResolvedValue(undefined),
  };
  current.markIncurred.mockImplementation(async () => {
    current.durableAudit = {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: MAX_OUTPUT_TOKENS,
      pricingVersion: 'deepseek-2026-04-24',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
    };
  });
  return current;
}

describe('Copilot platform cost budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlm.mockResolvedValue(PLATFORM);
    mocks.resolvePlatformLlm.mockReturnValue(null);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 20, plan: 'free' });
    mocks.beginUsageRun.mockResolvedValue(undefined);
    mocks.usageFinalized.mockResolvedValue(undefined);
    mocks.usageFinalizedForUser.mockImplementation(
      async (_userId, _idempotencyKey, feature, meta) => mocks.usageFinalized(feature, meta),
    );
    mocks.finalizeUsageRun.mockImplementation(
      async (...args) => mocks.usageFinalizedForUser(...args),
    );
    mocks.getRequestLocale.mockResolvedValue('en');
    mocks.getServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    });
    mocks.getAdminSupabase.mockReturnValue({ rpc: vi.fn() });
    mocks.createAiRun.mockResolvedValue(null);
    mocks.completeAiRun.mockResolvedValue(undefined);
    mocks.failAiRun.mockResolvedValue(undefined);
    mocks.failStaleAiRuns.mockResolvedValue(0);
    mocks.radarHandler.mockResolvedValue({ score: 1 });
  });

  it('uses the reviewed 1M input ceiling and 9000 output tokens for every platform turn regardless of serialized text', async () => {
    const first = reservation(111);
    const second = reservation(222);
    mocks.radarHandler.mockResolvedValue({ analysis: '复杂中文工具结果'.repeat(800) });
    mocks.reserveCostBudget.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mocks.toolChat
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'radar', arguments: { ticker: 'NVDA' } }],
        finishReason: 'tool_calls',
        usage: usage(100, 40, 10),
      })
      .mockResolvedValueOnce({
        content: 'Final analysis',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(80, 0, 20, true),
      });

    await runRoute();

    expect(MAX_OUTPUT_TOKENS).toBe(9000);
    expect(mocks.toolChat).toHaveBeenCalledTimes(2);
    for (const [, options] of mocks.toolChat.mock.calls) {
      expect(options.max_tokens).toBe(9000);
    }
    expect(mocks.reserveCostBudget).toHaveBeenCalledTimes(2);
    for (let index = 0; index < 2; index++) {
      const [, userId, budgetRequest] = mocks.reserveCostBudget.mock.calls[index];
      const [, modelOptions] = mocks.toolChat.mock.calls[index];
      expect(userId).toBe('user-1');
      expect(budgetRequest).toEqual({
        feature: 'copilot',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 9000,
      });
      const currentReservation = index === 0 ? first : second;
      expect(mocks.reserveCostBudget.mock.invocationCallOrder[index])
        .toBeLessThan(currentReservation.markIncurred.mock.invocationCallOrder[0]);
      expect(currentReservation.markIncurred.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.toolChat.mock.invocationCallOrder[index]);
    }
    expect(estimateSerializedTokens(
      mocks.toolChat.mock.calls[0][1].system,
      mocks.toolChat.mock.calls[0][1].messages.slice(0, 1),
    )).not.toBe(estimateSerializedTokens(
      mocks.toolChat.mock.calls[1][1].system,
      mocks.toolChat.mock.calls[1][1].messages,
    ));
    expect(first.markIncurred).toHaveBeenCalledTimes(1);
    expect(second.markIncurred).toHaveBeenCalledTimes(1);
    expect(first.settle).toHaveBeenCalledWith(usage(100, 40, 10));
    expect(second.settle).toHaveBeenCalledWith(usage(80, 0, 20, true));
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', {
      ticker: 'NVDA',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 180,
      cacheHitInputTokens: 40,
      cacheMissInputTokens: 140,
      outputTokens: 30,
      costMicrormb: 333,
      pricingVersion: 'deepseek-2026-04-24',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
      byo: false,
      status: 'completed',
    });
    expect(mocks.usageFinalizedForUser).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      'copilot',
      expect.objectContaining({ status: 'completed', costMicrormb: 333 }),
    );
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      'copilot',
      expect.objectContaining({
        ticker: 'NVDA',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        byo: false,
      }),
    );
    expect(mocks.finalizeUsageRun).toHaveBeenCalledTimes(1);
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
  });

  it('fails closed before provider network activity when the usage run cannot begin', async () => {
    mocks.createAiRun.mockResolvedValue('run-usage-audit');
    mocks.beginUsageRun.mockRejectedValue(new Error('usage_audit_unavailable'));

    const { response, text } = await runRoute();

    expect(response.status).toBe(503);
    expect(text).toContain('usage_audit_unavailable');
    expect(mocks.toolChat).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.failAiRun).toHaveBeenCalledWith(
      expect.anything(),
      'run-usage-audit',
      expect.objectContaining({ errorCode: 'usage_audit_unavailable' }),
    );
  });

  it('returns 503 when authenticated run storage is unavailable', async () => {
    mocks.getServerSupabase.mockRejectedValue(new Error('database connection detail'));

    const { response, text } = await runRoute();

    expect(response.status).toBe(503);
    expect(text).toBe('authentication unavailable');
    expect(mocks.toolChat).not.toHaveBeenCalled();
    expect(mocks.usageFinalizedForUser).not.toHaveBeenCalled();
  });

  it('keeps an incurred reservation durable when the provider call throws', async () => {
    const current = reservation(100);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.toolChat.mockImplementation(async () => {
      expect(current.durableAudit).toEqual({
        inputTokens: 1_000_000,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 1_000_000,
        outputTokens: MAX_OUTPUT_TOKENS,
        pricingVersion: 'deepseek-2026-04-24',
        usdCnyMicros: 7_200_000,
        usageEstimated: true,
      });
      throw new Error('llm 500: failed');
    });

    const { text } = await runRoute();

    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.finalizeIncurred).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.durableAudit?.usageEstimated).toBe(true);
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 1_000_000,
      outputTokens: MAX_OUTPUT_TOKENS,
      costMicrormb: current.reservedMicrormb,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
    expect(text).toContain('"code":"provider_error"');
    expect(text).toContain('localized:providerFailed');
  });

  it('does not call the provider when marking the reservation incurred fails', async () => {
    const current = reservation(100);
    current.markIncurred.mockRejectedValue(new Error('budget_unavailable'));
    mocks.reserveCostBudget.mockResolvedValue(current);

    const { text } = await runRoute();

    expect(mocks.toolChat).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(text).toContain('"code":"budget_unavailable"');
  });

  it('audits returned usage at full reserved cost when settlement fails transiently', async () => {
    const current = reservation(100);
    current.settle.mockRejectedValue(new Error('budget_unavailable'));
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.toolChat.mockImplementation(async () => {
      expect(current.durableAudit).toEqual({
        inputTokens: 1_000_000,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 1_000_000,
        outputTokens: MAX_OUTPUT_TOKENS,
        pricingVersion: 'deepseek-2026-04-24',
        usdCnyMicros: 7_200_000,
        usageEstimated: true,
      });
      return {
        content: 'Provider returned this answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(45, 5, 9),
      };
    });

    const { text } = await runRoute();

    expect(text).toContain('"code":"budget_unavailable"');
    expect(current.release).not.toHaveBeenCalled();
    expect(current.durableAudit?.outputTokens).toBe(MAX_OUTPUT_TOKENS);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 45,
      cacheHitInputTokens: 5,
      cacheMissInputTokens: 40,
      outputTokens: 9,
      costMicrormb: current.reservedMicrormb,
      usageEstimated: true,
      status: 'failed',
    }));
  });

  it.each([
    ['daily_cost_exhausted', 'dailyCostExhausted'],
    ['pricing_unavailable', 'pricingUnavailable'],
    ['budget_unavailable', 'budgetUnavailable'],
    ['budget_invariant_violation', 'budgetInvariantViolation'],
  ])('preserves %s as a localized stable SSE error and does not call the model', async (code, messageKey) => {
    mocks.reserveCostBudget.mockRejectedValue(new Error(code));

    const { text } = await runRoute();

    expect(mocks.toolChat).not.toHaveBeenCalled();
    expect(text).toContain(`"code":"${code}"`);
    expect(text).toContain(`localized:${messageKey}`);
    if (code === 'daily_cost_exhausted') {
      expect(text).toContain('"reason":"daily_cost_exhausted"');
      expect(text).toContain('"costLimitMicrormb":8800000');
    }
    expect(text).not.toContain('localized:providerFailed');
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: 0,
      byo: false,
      status: 'failed',
    }));
  });

  it('does not reserve a BYO-only run and records it as BYO', async () => {
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    mocks.toolChat.mockImplementation(async () => {
      expect(mocks.beginUsageRun).toHaveBeenCalledTimes(1);
      return {
        content: 'BYO answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(25, 0, 5),
      };
    });

    await runRoute();

    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledOnce();
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'ark',
      model: 'byo-model',
      inputTokens: 25,
      outputTokens: 5,
      costMicrormb: 0,
      byo: true,
      status: 'completed',
    }));
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      'copilot',
      expect.objectContaining({ provider: 'ark', model: 'byo-model', byo: true }),
    );
  });

  it('reserves before a platform fallback and records the completed platform row as non-BYO', async () => {
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    const fallbackReservation = reservation(321);
    mocks.reserveCostBudget.mockResolvedValue(fallbackReservation);
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') throw new Error('llm 401: invalid api key');
      return {
        content: 'Fallback answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(55, 5, 11),
      };
    });

    const { text } = await runRoute();

    expect(text).toContain('"code":"provider_fallback"');
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
    expect(mocks.reserveCostBudget).toHaveBeenCalledTimes(1);
    expect(mocks.reserveCostBudget.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.toolChat.mock.invocationCallOrder[1]);
    expect(mocks.usageFinalized).toHaveBeenCalledOnce();
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: 321,
      byo: false,
      status: 'completed',
    }));
  });

  it('writes one mixed completed run after a successful BYO tool turn falls back to platform', async () => {
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    const fallbackReservation = reservation(321);
    mocks.reserveCostBudget.mockResolvedValue(fallbackReservation);
    let byoCalls = 0;
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') {
        byoCalls += 1;
        if (byoCalls === 1) {
          return {
            content: '',
            toolCalls: [{ id: 'tc-byo', name: 'radar', arguments: { ticker: 'NVDA' } }],
            finishReason: 'tool_calls',
            usage: usage(30, 10, 3),
          };
        }
        throw new Error('llm 401: invalid api key');
      }
      return {
        content: 'Fallback final answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(50, 5, 7, true),
      };
    });

    await runRoute();

    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', {
      ticker: 'NVDA',
      provider: 'mixed',
      model: 'byo-model+deepseek-v4-flash',
      inputTokens: 80,
      cacheHitInputTokens: 15,
      cacheMissInputTokens: 65,
      outputTokens: 10,
      costMicrormb: 321,
      pricingVersion: 'deepseek-2026-04-24',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
      byo: false,
      status: 'completed',
    });
    expect(fallbackReservation.settle).toHaveBeenCalledTimes(1);
  });

  it('lets an admin use the direct platform model without budget RPCs while auditing actual cost', async () => {
    const exemptAudit = reservation(121, ADMIN_CEILING_COST_MICRORMB);
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockImplementation(async () => {
      expect(mocks.beginUsageRun).toHaveBeenCalledTimes(1);
      return {
        content: 'Admin answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(100, 0, 10),
      };
    });

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        feature: 'copilot',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      }),
      expect.any(String),
    );
    expect(mocks.createCapExemptCostAudit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.toolChat.mock.invocationCallOrder[0]);
    expect(exemptAudit.settle).toHaveBeenCalledWith(usage(100, 0, 10));
    expect(mocks.toolChat).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 100,
      outputTokens: 10,
      costMicrormb: 121,
      byo: false,
      status: 'completed',
    }));
  });

  it('rejects an unpriced direct admin platform model before any provider network call', async () => {
    mocks.resolveLlm.mockResolvedValue(UNPRICED_PLATFORM);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });

    const { text } = await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.toolChat).not.toHaveBeenCalled();
    expect(mocks.anthropicToolChat).not.toHaveBeenCalled();
    expect(text).toContain('"code":"pricing_unavailable"');
    expect(text).toContain('localized:pricingUnavailable');
    expect(text).not.toContain('localized:providerFailed');
  });

  it('audits the conservative ceiling when a direct admin platform call fails after network attempt', async () => {
    const exemptAudit = reservation(121, ADMIN_CEILING_COST_MICRORMB);
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockRejectedValue(new Error('llm 500: failed'));

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(exemptAudit.settle).not.toHaveBeenCalled();
    expect(mocks.toolChat).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 9_000,
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
  });

  it('audits the conservative ceiling when a direct admin response has incomplete usage', async () => {
    const exemptAudit = reservation(121, ADMIN_CEILING_COST_MICRORMB);
    exemptAudit.settle.mockResolvedValue({
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
    });
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockResolvedValue({
      content: 'Admin answer with incomplete usage',
      toolCalls: [],
      finishReason: 'stop',
      usage: usage(12, 0, 0, true),
    });

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 9_000,
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
      byo: false,
      status: 'completed',
    }));
  });

  it('lets an admin fallback from BYO to platform without budget RPCs while auditing actual cost', async () => {
    const exemptAudit = reservation(73, ADMIN_CEILING_COST_MICRORMB);
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') throw new Error('llm 401: invalid api key');
      return {
        content: 'Admin fallback answer',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(55, 5, 11),
      };
    });

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(mocks.createCapExemptCostAudit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.toolChat.mock.invocationCallOrder[1]);
    expect(exemptAudit.settle).toHaveBeenCalledWith(usage(55, 5, 11));
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 55,
      outputTokens: 11,
      costMicrormb: 73,
      byo: false,
      status: 'completed',
    }));
  });

  it('rejects an unpriced admin platform fallback before its provider network call', async () => {
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(UNPRICED_PLATFORM);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockRejectedValue(new Error('llm 401: invalid api key'));

    const { text } = await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.toolChat).toHaveBeenCalledTimes(1);
    expect(mocks.toolChat).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'byo-key' }),
      expect.anything(),
    );
    expect(mocks.anthropicToolChat).not.toHaveBeenCalled();
    expect(text).toContain('"code":"pricing_unavailable"');
    expect(text).toContain('localized:pricingUnavailable');
    expect(text).not.toContain('localized:providerFailed');
  });

  it('audits only the conservative platform ceiling when an admin fallback attempt fails', async () => {
    const exemptAudit = reservation(73, ADMIN_CEILING_COST_MICRORMB);
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') throw new Error('llm 401: invalid api key');
      throw new Error('llm 500: platform failed');
    });

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.toolChat).toHaveBeenCalledTimes(2);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 9_000,
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
  });

  it('audits the conservative ceiling when an admin fallback response has incomplete usage', async () => {
    const exemptAudit = reservation(73, ADMIN_CEILING_COST_MICRORMB);
    exemptAudit.settle.mockResolvedValue({
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
    });
    mocks.createCapExemptCostAudit.mockResolvedValue(exemptAudit);
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: -1, plan: 'free' });
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') throw new Error('llm 401: invalid api key');
      return {
        content: 'Admin fallback with incomplete usage',
        toolCalls: [],
        finishReason: 'stop',
        usage: usage(23, 0, 0, true),
      };
    });

    await runRoute();

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 9_000,
      costMicrormb: ADMIN_CEILING_COST_MICRORMB,
      usageEstimated: true,
      byo: false,
      status: 'completed',
    }));
  });

  it('audits settled platform rounds on a failed run without writing a completed count event', async () => {
    const completedRound = reservation(111);
    const failedRound = reservation(222);
    mocks.reserveCostBudget
      .mockResolvedValueOnce(completedRound)
      .mockResolvedValueOnce(failedRound);
    mocks.toolChat
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'radar', arguments: { ticker: 'NVDA' } }],
        finishReason: 'tool_calls',
        usage: usage(70, 20, 7),
      })
      .mockRejectedValueOnce(new Error('llm 500: failed'));

    await runRoute();

    expect(completedRound.settle).toHaveBeenCalledTimes(1);
    expect(failedRound.markIncurred).toHaveBeenCalledTimes(1);
    expect(failedRound.finalizeIncurred).not.toHaveBeenCalled();
    expect(failedRound.release).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledOnce();
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 1_000_070,
      outputTokens: 9_007,
      costMicrormb: 433,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
    expect(mocks.usageFinalized).not.toHaveBeenCalledWith(
      'copilot',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
  });

  it('writes one mixed failed event with all successful-turn tokens and only settled platform cost', async () => {
    mocks.resolveLlm.mockResolvedValue(BYO);
    mocks.resolvePlatformLlm.mockReturnValue(PLATFORM);
    const completedPlatformRound = reservation(222);
    const failedPlatformRound = reservation(333);
    mocks.reserveCostBudget
      .mockResolvedValueOnce(completedPlatformRound)
      .mockResolvedValueOnce(failedPlatformRound);
    let byoCalls = 0;
    let platformCalls = 0;
    mocks.toolChat.mockImplementation(async (cfg) => {
      if (cfg.apiKey === 'byo-key') {
        byoCalls += 1;
        if (byoCalls === 1) {
          return {
            content: '',
            toolCalls: [{ id: 'tc-byo', name: 'radar', arguments: { ticker: 'NVDA' } }],
            finishReason: 'tool_calls',
            usage: usage(20, 5, 2),
          };
        }
        throw new Error('llm 401: invalid api key');
      }
      platformCalls += 1;
      if (platformCalls === 1) {
        return {
          content: '',
          toolCalls: [{ id: 'tc-platform', name: 'radar', arguments: { ticker: 'NVDA' } }],
          finishReason: 'tool_calls',
          usage: usage(40, 10, 4),
        };
      }
      throw new Error('llm 500: platform failed');
    });

    await runRoute();

    expect(completedPlatformRound.settle).toHaveBeenCalledTimes(1);
    expect(failedPlatformRound.markIncurred).toHaveBeenCalledTimes(1);
    expect(failedPlatformRound.finalizeIncurred).not.toHaveBeenCalled();
    expect(failedPlatformRound.release).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'mixed',
      model: 'byo-model+deepseek-v4-flash',
      inputTokens: 1_000_060,
      cacheHitInputTokens: 15,
      cacheMissInputTokens: 1_000_045,
      outputTokens: 9_006,
      costMicrormb: 655,
      usageEstimated: true,
      byo: false,
      status: 'failed',
    }));
  });
});

describe('estimateSerializedTokens', () => {
  it('estimates the exact serialized system-plus-message payload at three characters per token', () => {
    const system = 'system';
    const messages = [{ role: 'user' as const, content: 'hello' }];

    expect(estimateSerializedTokens(system, messages)).toBe(
      Math.ceil(JSON.stringify([{ role: 'system', content: system }, ...messages]).length / 3),
    );
  });

  it('returns a bounded safe non-negative integer when serialization fails or is huge', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(estimateSerializedTokens('system', [cyclic as never])).toBe(Number.MAX_SAFE_INTEGER);
  });
});
