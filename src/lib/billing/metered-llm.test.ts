import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from './llm-pricing';

const mocks = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
  reserveCostBudget: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

vi.mock('./cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
  };
});

import {
  aggregateMeteredUsage,
  meteredUsageFromError,
  runMeteredLlmCall,
} from './metered-llm';

const realUsage = (
  inputTokens = 120,
  cacheHitInputTokens = 20,
  outputTokens = 30,
): NormalizedUsage => ({
  inputTokens,
  cacheHitInputTokens,
  cacheMissInputTokens: inputTokens - cacheHitInputTokens,
  outputTokens,
  estimated: false,
});

function reservation(costMicrormb = 321) {
  return {
    reservationId: 'reservation-1',
    reservedMicrormb: 999,
    markIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn(),
  };
}

describe('runMeteredLlmCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reserves the reviewed maximum, marks incurred before network, then settles actual usage', async () => {
    const events: string[] = [];
    const current = reservation();
    current.markIncurred.mockImplementation(async () => {
      events.push('mark');
    });
    current.settle.mockImplementation(async () => {
      events.push('settle');
      return { costMicrormb: 321, usageEstimated: false };
    });
    mocks.reserveCostBudget.mockImplementation(async () => {
      events.push('reserve');
      return current;
    });

    const usage = realUsage();
    const result = await runMeteredLlmCall({
      feature: 'perspectives',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      userId: 'server-derived-user',
      budgetExempt: false,
      maxOutputTokens: 400,
      call: async () => {
        events.push('network');
        return { content: 'ok', usage };
      },
    });

    expect(events).toEqual(['reserve', 'mark', 'network', 'settle']);
    expect(mocks.reserveCostBudget).toHaveBeenCalledWith(
      { kind: 'admin-db' },
      'server-derived-user',
      {
        feature: 'perspectives',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 400,
      },
    );
    expect(current.settle).toHaveBeenCalledWith(usage);
    expect(current.release).not.toHaveBeenCalled();
    expect(result.accounting).toMatchObject({
      status: 'completed',
      costMicrormb: 321,
      usage,
      usageEstimated: false,
      byo: false,
    });
  });

  it('does not call the provider when the durable reservation is denied', async () => {
    mocks.reserveCostBudget.mockRejectedValue(new Error('daily_cost_exhausted'));
    const call = vi.fn();

    await expect(runMeteredLlmCall({
      feature: 'perspectives',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      userId: 'server-derived-user',
      budgetExempt: false,
      maxOutputTokens: 400,
      call,
    })).rejects.toThrow('daily_cost_exhausted');

    expect(call).not.toHaveBeenCalled();
  });

  it('keeps incurred cost durable and attaches conservative failed accounting after provider failure', async () => {
    const current = reservation();
    mocks.reserveCostBudget.mockResolvedValue(current);
    const providerError = new Error('provider exploded');

    let caught: unknown;
    try {
      await runMeteredLlmCall({
        feature: 'brief_preview',
        provider: {
          source: 'env',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
        },
        userId: 'server-derived-user',
        budgetExempt: false,
        maxOutputTokens: 300,
        call: async () => {
          throw providerError;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(providerError);
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(meteredUsageFromError(caught)).toMatchObject({
      status: 'failed',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: 999,
      usageEstimated: true,
      byo: false,
      usage: {
        inputTokens: 1_000_000,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 1_000_000,
        outputTokens: 300,
        estimated: true,
      },
    });
  });

  it('preflights and audits admins without calling the cap RPC', async () => {
    const usage = realUsage(100, 0, 25);
    const result = await runMeteredLlmCall({
      feature: 'perspectives',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      budgetExempt: true,
      maxOutputTokens: 400,
      call: async () => ({ content: 'ok', usage }),
    });

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(result.accounting.status).toBe('completed');
    expect(result.accounting.costMicrormb).toBeGreaterThan(0);
    expect(result.accounting.usage).toEqual(usage);
    expect(result.accounting.byo).toBe(false);
  });

  it('uses conservative reviewed cost when an admin provider call fails', async () => {
    const providerError = new Error('provider exploded');
    let caught: unknown;

    try {
      await runMeteredLlmCall({
        feature: 'brief_preview',
        provider: {
          source: 'env',
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
        },
        budgetExempt: true,
        maxOutputTokens: 300,
        call: async () => {
          throw providerError;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(meteredUsageFromError(caught)).toMatchObject({
      status: 'failed',
      costMicrormb: expect.any(Number),
      usageEstimated: true,
      byo: false,
      usage: {
        inputTokens: 1_000_000,
        cacheMissInputTokens: 1_000_000,
        outputTokens: 300,
        estimated: true,
      },
    });
  });

  it('charges the full reservation for incomplete provider usage', async () => {
    const current = reservation(999);
    current.settle.mockResolvedValue({ costMicrormb: 999, usageEstimated: true });
    mocks.reserveCostBudget.mockResolvedValue(current);
    const incompleteUsage: NormalizedUsage = {
      inputTokens: 12,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 12,
      outputTokens: 0,
      estimated: true,
    };

    const result = await runMeteredLlmCall({
      feature: 'brief_preview',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      userId: 'server-derived-user',
      budgetExempt: false,
      maxOutputTokens: 300,
      call: async () => ({ content: 'partial', usage: incompleteUsage }),
    });

    expect(result.accounting).toMatchObject({
      status: 'completed',
      costMicrormb: 999,
      usageEstimated: true,
      usage: {
        inputTokens: 1_000_000,
        cacheMissInputTokens: 1_000_000,
        outputTokens: 300,
        estimated: true,
      },
    });
  });

  it('rejects unknown admin platform pricing before network', async () => {
    const call = vi.fn();

    await expect(runMeteredLlmCall({
      feature: 'brief_preview',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'unreviewed-model',
      },
      budgetExempt: true,
      maxOutputTokens: 400,
      call,
    })).rejects.toThrow('pricing_unavailable');

    expect(call).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
  });

  it('leaves BYO calls outside pricing and budget while preserving usage for audit', async () => {
    const usage = realUsage(90, 10, 12);
    const result = await runMeteredLlmCall({
      feature: 'brief_preview',
      provider: {
        source: 'user',
        provider: 'custom',
        model: 'private-model',
      },
      budgetExempt: false,
      maxOutputTokens: 400,
      call: async () => ({ content: 'ok', usage }),
    });

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(result.accounting).toMatchObject({
      status: 'completed',
      provider: 'custom',
      model: 'private-model',
      costMicrormb: 0,
      usageEstimated: false,
      byo: true,
      usage,
    });
  });
});

describe('aggregateMeteredUsage', () => {
  it('aggregates actual token/cache/cost totals and preserves failed status', () => {
    const aggregate = aggregateMeteredUsage([
      {
        status: 'completed',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        usage: realUsage(100, 25, 10),
        costMicrormb: 100,
        usageEstimated: false,
        byo: false,
      },
      {
        status: 'failed',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        usage: realUsage(80, 0, 20),
        costMicrormb: 200,
        usageEstimated: true,
        byo: false,
      },
    ]);

    expect(aggregate).toMatchObject({
      status: 'failed',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: 300,
      usageEstimated: true,
      byo: false,
      usage: {
        inputTokens: 180,
        cacheHitInputTokens: 25,
        cacheMissInputTokens: 155,
        outputTokens: 30,
        estimated: true,
      },
    });
  });
});
