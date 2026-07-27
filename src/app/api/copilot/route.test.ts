import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

const mocks = vi.hoisted(() => ({
  toolChat: vi.fn(),
  anthropicToolChat: vi.fn(),
  resolveLlm: vi.fn(),
  resolvePlatformLlm: vi.fn(),
  checkQuota: vi.fn(),
  recordUsage: vi.fn(),
  reserveCostBudget: vi.fn(),
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
  recordUsage: mocks.recordUsage,
}));
vi.mock('@/lib/billing/cost-budget', () => ({
  reserveCostBudget: mocks.reserveCostBudget,
  getBudgetConfig: mocks.getBudgetConfig,
}));
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
  conservativeInputTokenEstimate,
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

function reservation(costMicrormb: number) {
  return {
    reservationId: `reservation-${costMicrormb}`,
    reservedMicrormb: costMicrormb + 100,
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Copilot platform cost budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlm.mockResolvedValue(PLATFORM);
    mocks.resolvePlatformLlm.mockReturnValue(null);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 20, plan: 'free' });
    mocks.recordUsage.mockResolvedValue(undefined);
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

  it('uses 9000 output tokens, reserves before every platform turn, settles, and aggregates one successful ledger row', async () => {
    const first = reservation(111);
    const second = reservation(222);
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
        estimatedInputTokens: conservativeInputTokenEstimate(
          modelOptions.system,
          modelOptions.messages.slice(0, index === 0 ? 1 : 3),
        ),
        maxOutputTokens: 9000,
      });
      expect(mocks.reserveCostBudget.mock.invocationCallOrder[index])
        .toBeLessThan(mocks.toolChat.mock.invocationCallOrder[index]);
    }
    expect(first.settle).toHaveBeenCalledWith(usage(100, 40, 10));
    expect(second.settle).toHaveBeenCalledWith(usage(80, 0, 20, true));
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', {
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
    expect(mocks.checkQuota).toHaveBeenCalledTimes(1);
  });

  it('releases the current reservation when the provider call throws', async () => {
    const current = reservation(100);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.toolChat.mockRejectedValue(new Error('llm 500: failed'));

    const { text } = await runRoute();

    expect(current.release).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 0,
      outputTokens: 0,
      costMicrormb: 0,
      byo: false,
      status: 'failed',
    }));
    expect(text).toContain('"code":"provider_error"');
    expect(text).toContain('localized:providerFailed');
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
    expect(text).not.toContain('localized:providerFailed');
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
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
    mocks.toolChat.mockResolvedValue({
      content: 'BYO answer',
      toolCalls: [],
      finishReason: 'stop',
      usage: usage(25, 0, 5),
    });

    await runRoute();

    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'ark',
      model: 'byo-model',
      inputTokens: 25,
      outputTokens: 5,
      costMicrormb: 0,
      byo: true,
      status: 'completed',
    }));
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
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
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

    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', {
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
    expect(failedRound.release).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledOnce();
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
      inputTokens: 70,
      outputTokens: 7,
      costMicrormb: 111,
      byo: false,
      status: 'failed',
    }));
    expect(mocks.recordUsage).not.toHaveBeenCalledWith(
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
    expect(failedPlatformRound.release).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith('copilot', expect.objectContaining({
      provider: 'mixed',
      model: 'byo-model+deepseek-v4-flash',
      inputTokens: 60,
      cacheHitInputTokens: 15,
      cacheMissInputTokens: 45,
      outputTokens: 6,
      costMicrormb: 222,
      byo: false,
      status: 'failed',
    }));
  });
});

describe('conservativeInputTokenEstimate', () => {
  it('estimates the exact serialized system-plus-message payload at three characters per token', () => {
    const system = 'system';
    const messages = [{ role: 'user' as const, content: 'hello' }];

    expect(conservativeInputTokenEstimate(system, messages)).toBe(
      Math.ceil(JSON.stringify([{ role: 'system', content: system }, ...messages]).length / 3),
    );
  });

  it('returns a bounded safe non-negative integer when serialization fails or is huge', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(conservativeInputTokenEstimate('system', [cyclic as never])).toBe(Number.MAX_SAFE_INTEGER);
  });
});
