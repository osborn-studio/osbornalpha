import { describe, expect, it } from 'vitest';
import { changedDecisionFields, decisionRestoreRequest } from './decision-history';

describe('changedDecisionFields', () => {
  it('returns only meaningful decision changes', () => {
    expect(changedDecisionFields({
      before_value: { thesis: 'Old', confidence: 50, tags: ['core'] },
      after_value: { thesis: 'New', confidence: 50, tags: ['core', 'ai'] },
    } as never)).toEqual(['thesis', 'tags']);
  });

  it('builds a validated restore command from a historical snapshot', () => {
    expect(decisionRestoreRequest({
      after_value: {
        thesis: 'Original thesis', notes: null, target_price: 220,
        invalidation_conditions: 'Margins fall', confidence: 70, conviction: 8,
        review_at: null, tags: ['core'], status: 'watching', ignored: 'server metadata',
      },
    } as never, 4)).toEqual({
      expectedVersion: 4,
      thesis: 'Original thesis', notes: null, targetPrice: 220,
      invalidationConditions: 'Margins fall', confidence: 70, conviction: 8,
      reviewAt: null, tags: ['core'], status: 'watching',
    });
  });

  it('rejects a malformed historical snapshot', () => {
    expect(decisionRestoreRequest({ after_value: { confidence: 999 } } as never, 4)).toBeNull();
  });
});
