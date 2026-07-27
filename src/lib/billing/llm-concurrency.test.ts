import { describe, expect, it } from 'vitest';
import { PERSONAS } from '@/lib/data/personas';
import {
  createPersonaConcurrencyLimiter,
  personaConcurrencyFor,
} from './llm-concurrency';
import {
  DEFAULT_DAILY_LIMIT_MICRORMB,
  DEFAULT_USD_CNY_MICROS,
  maxInputTokensFor,
  reservationCostMicrormb,
} from './llm-pricing';

describe('user-driven persona concurrency', () => {
  it('derives a conservative limit and applies the hard cap', () => {
    expect(personaConcurrencyFor({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      maxOutputTokens: 400,
      dailyLimitMicrormb: DEFAULT_DAILY_LIMIT_MICRORMB,
      usdCnyMicros: DEFAULT_USD_CNY_MICROS,
    })).toBe(4);
  });

  it.each([
    ['nine-persona perspectives', PERSONAS.length],
    ['default five-stock brief committee', PERSONAS.length * 5],
  ])('lets a fresh low-actual-cost %s request finish without self-exhaustion', async (_label, count) => {
    expect(PERSONAS).toHaveLength(9);
    const maxReservation = reservationCostMicrormb(
      'deepseek',
      'deepseek-v4-flash',
      maxInputTokensFor('deepseek', 'deepseek-v4-flash'),
      400,
      DEFAULT_USD_CNY_MICROS,
    );
    const limiter = createPersonaConcurrencyLimiter({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      maxOutputTokens: 400,
    });
    let active = 0;
    let maxActive = 0;
    let activeReserved = 0;
    let settledActual = 0;

    const results = await Promise.all(Array.from({ length: count }, (_, index) => (
      limiter.run(async () => {
        active += 1;
        activeReserved += maxReservation;
        maxActive = Math.max(maxActive, active);
        expect(settledActual + activeReserved).toBeLessThanOrEqual(DEFAULT_DAILY_LIMIT_MICRORMB);

        await new Promise<void>((resolve) => setTimeout(resolve, index % 2));

        active -= 1;
        activeReserved -= maxReservation;
        settledActual += 100;
        return index;
      })
    )));

    expect(results).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(maxActive).toBe(4);
    expect(settledActual).toBe(count * 100);
  });
});
