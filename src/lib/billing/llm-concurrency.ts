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
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 1;
  let active = 0;
  const queue: Array<() => void> = [];

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
    queue.shift()?.();
  };

  return {
    limit: safeLimit,
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

export function createPersonaConcurrencyLimiter(input: PersonaConcurrencyInput): ConcurrencyLimiter {
  return createConcurrencyLimiter(personaConcurrencyFor(input));
}
