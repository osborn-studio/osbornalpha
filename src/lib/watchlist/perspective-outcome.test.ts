import { describe, expect, it, vi } from 'vitest';
import { evaluatePerspectiveOutcome, failPerspectiveEvaluation } from './perspective-outcome';

describe('perspective outcome evaluation', () => {
  it('scores bullish, bearish and neutral directions against the reference price', () => {
    expect(evaluatePerspectiveOutcome('bullish', 100, 110)).toEqual({ returnPct: 10, directionCorrect: true });
    expect(evaluatePerspectiveOutcome('bearish', 100, 90)).toEqual({ returnPct: -10, directionCorrect: true });
    expect(evaluatePerspectiveOutcome('neutral', 100, 104)).toEqual({ returnPct: 4, directionCorrect: true });
    expect(evaluatePerspectiveOutcome('neutral', 100, 108).directionCorrect).toBe(false);
  });

  it('rejects invalid prices rather than emitting misleading returns', () => {
    expect(() => evaluatePerspectiveOutcome('bullish', 0, 10)).toThrow('invalid_perspective_outcome_price');
  });

  it('moves the fifth failed evaluation to a terminal dead letter state', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    await failPerspectiveEvaluation({ from: () => ({ update }) }, 'perspective-1', 'quote unavailable', 5, new Date('2026-09-04T12:00:00Z'));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'dead_letter',
      dead_lettered_at: '2026-09-04T12:00:00.000Z',
    }));
  });
});
