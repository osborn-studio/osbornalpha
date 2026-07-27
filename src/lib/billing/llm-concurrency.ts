import {
  maxInputTokensFor,
  reservationCostMicrormb,
} from './llm-pricing';
import { getBudgetConfig } from './cost-budget';

export const PERSONA_CONCURRENCY_HARD_CAP = 4;

export interface PersonaConcurrencyInput {
  provider: string;
  model: string;
  maxOutputTokens: number;
  dailyLimitMicrormb?: number;
  usdCnyMicros?: number;
}

export function personaConcurrencyFor(input: PersonaConcurrencyInput): number {
  const config = getBudgetConfig();
  const dailyLimitMicrormb = input.dailyLimitMicrormb ?? config.dailyLimitMicrormb;
  const usdCnyMicros = input.usdCnyMicros ?? config.usdCnyMicros;
  const maxReservation = reservationCostMicrormb(
    input.provider,
    input.model,
    maxInputTokensFor(input.provider, input.model),
    input.maxOutputTokens,
    usdCnyMicros,
  );
  const affordable = Math.floor(dailyLimitMicrormb / maxReservation);
  return Math.max(1, Math.min(PERSONA_CONCURRENCY_HARD_CAP, affordable));
}

export interface ConcurrencyLimiter {
  readonly limit: number;
  run<T>(task: () => Promise<T>): Promise<T>;
  runWithBudgetRetry<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 1;
  let active = 0;
  let budgetBlocked = 0;
  const queue: Array<() => void> = [];
  const budgetWaiters: Array<(canRetry: boolean) => void> = [];

  const acquire = (): Promise<void> => {
    if (active < safeLimit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = () => {
    active -= 1;
    budgetWaiters.shift()?.(true);
    queue.shift()?.();
  };

  const run = async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };

  return {
    limit: safeLimit,
    run,
    async runWithBudgetRetry<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        while (true) {
          try {
            return await task();
          } catch (error) {
            if (!(error instanceof Error) || error.message !== 'daily_cost_exhausted') {
              throw error;
            }

            budgetBlocked += 1;
            if (active - budgetBlocked <= 0) {
              budgetBlocked -= 1;
              for (const waiter of budgetWaiters.splice(0)) waiter(false);
              throw error;
            }
            const canRetry = await new Promise<boolean>((resolve) => budgetWaiters.push(resolve));
            budgetBlocked -= 1;
            if (!canRetry) throw error;
          }
        }
      } finally {
        release();
      }
    },
  };
}

export function createPersonaConcurrencyLimiter(input: PersonaConcurrencyInput): ConcurrencyLimiter {
  return createConcurrencyLimiter(personaConcurrencyFor(input));
}
