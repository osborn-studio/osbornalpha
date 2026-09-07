import { describe, expect, it } from 'vitest';
import { PERSPECTIVE_EVAL_FIXTURES } from './perspective-eval-fixtures';
import { evaluatePerspectiveFixtures } from './perspective-eval';

describe('fixed Watchlist Perspective evaluation', () => {
  it('covers all supported market families and passes every policy case', () => {
    expect(evaluatePerspectiveFixtures(PERSPECTIVE_EVAL_FIXTURES)).toEqual({
      ok: true,
      total: 7,
      passed: 7,
      failed: [],
      markets: ['A', 'HK', 'US'],
    });
  });
});
