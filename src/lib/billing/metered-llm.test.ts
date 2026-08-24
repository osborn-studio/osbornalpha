import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from './llm-pricing';

const mocks = vi.hoisted(() => ({
  getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
  reserveCostBudget: vi.fn(),
  createCapExemptCostAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

vi.mock('./cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
    createCapExemptCostAudit: mocks.createCapExemptCostAudit,
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

function reservation(costMicrormb = 321, maxOutputTokens = 400) {
  const current = {
    reservationId: 'reservation-1',
    reservedMicrormb: 999,
    durableAudit: undefined as undefined | {
      inputTokens: number;
      cacheHitInputTokens: number;
      cacheMissInputTokens: number;
      outputTokens: number;
      pricingVersion: string;
      usdCnyMicros: number;
      usageEstimated: boolean;
    },
    markIncurred: vi.fn(),
    finalizeIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn(),
  };
  current.markIncurred.mockImplementation(async () => {
    current.durableAudit = {
      inputTokens: 1_000_000,
      cacheHitInputTokens: 0,
      cacheMissInputTokens: 1_000_000,
      outputTokens: maxOutputTokens,
      pricingVersion: 'deepseek-2026-04-24',
      usdCnyMicros: 7_200_000,
      usageEstimated: true,
    };
  });
  return current;
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
    const current = reservation(321, 300);
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
          expect(current.durableAudit).toEqual({
            inputTokens: 1_000_000,
            cacheHitInputTokens: 0,
            cacheMissInputTokens: 1_000_000,
            outputTokens: 300,
            pricingVersion: 'deepseek-2026-04-24',
            usdCnyMicros: 7_200_000,
            usageEstimated: true,
          });
          throw providerError;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(providerError);
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.finalizeIncurred).not.toHaveBeenCalled();
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(current.durableAudit?.usageEstimated).toBe(true);
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

  it('retains the pre-network conservative audit when actual settlement fails', async () => {
    const current = reservation(321, 300);
    current.settle.mockRejectedValue(new Error('budget_unavailable'));
    mocks.reserveCostBudget.mockResolvedValue(current);
    const actualUsage = realUsage(120, 20, 30);

    await expect(runMeteredLlmCall({
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
        expect(current.durableAudit).toEqual({
          inputTokens: 1_000_000,
          cacheHitInputTokens: 0,
          cacheMissInputTokens: 1_000_000,
          outputTokens: 300,
          pricingVersion: 'deepseek-2026-04-24',
          usdCnyMicros: 7_200_000,
          usageEstimated: true,
        });
        return { content: 'provider completed', usage: actualUsage };
      },
    })).rejects.toThrow('budget_unavailable');

    expect(current.durableAudit?.outputTokens).toBe(300);
    expect(current.finalizeIncurred).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
  });

  it('creates a durable cap-exempt incurred audit before admin network and settles actual usage', async () => {
    const events: string[] = [];
    const current = reservation(321);
    mocks.createCapExemptCostAudit.mockImplementation(async () => {
      events.push('audit');
      return current;
    });
    current.settle.mockImplementation(async () => {
      events.push('settle');
      return { costMicrormb: 321, usageEstimated: false };
    });
    const usage = realUsage(100, 0, 25);
    const result = await runMeteredLlmCall({
      feature: 'perspectives',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      userId: 'server-admin',
      budgetExempt: true,
      maxOutputTokens: 400,
      call: async () => {
        events.push('network');
        return { content: 'ok', usage };
      },
    });

    expect(events).toEqual(['audit', 'network', 'settle']);
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledWith(
      { kind: 'admin-db' },
      'server-admin',
      {
        feature: 'perspectives',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        maxInputTokens: 1_000_000,
        maxOutputTokens: 400,
      },
      expect.any(String),
    );
    expect(result.accounting.status).toBe('completed');
    expect(result.accounting.costMicrormb).toBe(321);
    expect(result.accounting.usage).toEqual(usage);
    expect(result.accounting.byo).toBe(false);
  });

  it('uses conservative reviewed cost when an admin provider call fails', async () => {
    const current = reservation(321, 300);
    mocks.createCapExemptCostAudit.mockImplementation(async () => {
      current.durableAudit = {
        inputTokens: 1_000_000,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: 1_000_000,
        outputTokens: 300,
        pricingVersion: 'deepseek-2026-04-24',
        usdCnyMicros: 7_200_000,
        usageEstimated: true,
      };
      return current;
    });
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
        userId: 'server-admin',
        budgetExempt: true,
        maxOutputTokens: 300,
        call: async () => {
          expect(current.durableAudit?.usageEstimated).toBe(true);
          throw providerError;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
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

  it('retains the cap-exempt conservative snapshot when actual settlement fails', async () => {
    const current = reservation(321, 300);
    current.settle.mockRejectedValue(new Error('budget_unavailable'));
    mocks.createCapExemptCostAudit.mockResolvedValue(current);

    await expect(runMeteredLlmCall({
      feature: 'brief_preview',
      provider: {
        source: 'env',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
      userId: 'server-admin',
      budgetExempt: true,
      maxOutputTokens: 300,
      call: async () => ({ content: 'provider completed', usage: realUsage() }),
    })).rejects.toThrow('budget_unavailable');

    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(current.finalizeIncurred).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
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
      userId: 'server-admin',
      budgetExempt: true,
      maxOutputTokens: 400,
      call,
    })).rejects.toThrow('pricing_unavailable');

    expect(call).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).not.toHaveBeenCalled();
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
