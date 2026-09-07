import { describe, expect, it, vi } from 'vitest';
import {
  deletePerspectiveClaimFeedback,
  parsePerspectiveClaimFeedback,
  savePerspectiveClaimFeedback,
} from './perspective-claim-feedback';

const perspectiveId = '123e4567-e89b-42d3-a456-426614174000';

describe('Perspective claim feedback', () => {
  it('parses a bounded claim-scoped correction', () => {
    expect(parsePerspectiveClaimFeedback({
      perspectiveId, claimId: 'claim_2', verdict: 'unsupported', reason: 'Source does not support the assertion.',
    })).toEqual({
      perspectiveId, claimId: 'claim_2', verdict: 'unsupported', reason: 'Source does not support the assertion.',
    });
    expect(parsePerspectiveClaimFeedback({ perspectiveId, claimId: '../bad', verdict: 'helpful' })).toBeNull();
  });

  it('verifies ownership and claim membership before upserting', async () => {
    const single = vi.fn(async () => ({ data: { id: 'feedback-1', claim_id: 'claim_2' }, error: null }));
    const upsert = vi.fn(() => ({ select: () => ({ single }) }));
    const maybeSingle = vi.fn(async () => ({
      data: { id: perspectiveId, claims: [{ id: 'claim_1' }, { id: 'claim_2' }] }, error: null,
    }));
    const from = vi.fn((table: string) => table === 'perspectives'
      ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }
      : { upsert });
    await savePerspectiveClaimFeedback({ from }, 'user-1', {
      perspectiveId, claimId: 'claim_2', verdict: 'helpful', reason: null,
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', perspective_id: perspectiveId, claim_id: 'claim_2', verdict: 'helpful',
    }), { onConflict: 'user_id,perspective_id,claim_id' });
  });

  it('rejects feedback for a claim not present in the owned Perspective', async () => {
    const from = vi.fn(() => ({
      select: () => ({ eq: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { id: perspectiveId, claims: [{ id: 'claim_1' }] }, error: null }),
      }) }) }),
    }));
    await expect(savePerspectiveClaimFeedback({ from }, 'user-1', {
      perspectiveId, claimId: 'claim_2', verdict: 'incorrect', reason: null,
    })).rejects.toThrow('perspective_claim_not_found');
  });

  it('deletes with the full user, perspective, and claim scope', async () => {
    const eqClaim = vi.fn(async () => ({ error: null }));
    const eqPerspective = vi.fn(() => ({ eq: eqClaim }));
    const eqUser = vi.fn(() => ({ eq: eqPerspective }));
    const from = vi.fn(() => ({ delete: () => ({ eq: eqUser }) }));
    await deletePerspectiveClaimFeedback({ from }, 'user-1', perspectiveId, 'claim_1');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqPerspective).toHaveBeenCalledWith('perspective_id', perspectiveId);
    expect(eqClaim).toHaveBeenCalledWith('claim_id', 'claim_1');
  });
});
