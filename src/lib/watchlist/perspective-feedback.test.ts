import { describe, expect, it, vi } from 'vitest';
import { loadPerspectiveAssessments, parsePerspectiveFeedback, savePerspectiveFeedback } from './perspective-feedback';

const id = '11111111-1111-5111-8111-111111111111';

describe('perspective feedback', () => {
  it('parses bounded correction input', () => {
    expect(parsePerspectiveFeedback({
      perspectiveId: id, verdict: 'incorrect', reason: 'Evidence was stale', correctedStance: 'bearish',
    })).toEqual({
      perspectiveId: id, verdict: 'incorrect', reason: 'Evidence was stale', correctedStance: 'bearish',
    });
    expect(parsePerspectiveFeedback({ perspectiveId: 'bad', verdict: 'helpful' })).toBeNull();
  });

  it('checks ownership before upserting feedback', async () => {
    const single = vi.fn(async () => ({ data: { id: 'feedback-1', user_id: 'user-1', perspective_id: id }, error: null }));
    const upsert = vi.fn(() => ({ select: () => ({ single }) }));
    const ownershipQuery: Record<string, unknown> = {};
    ownershipQuery.eq = vi.fn(() => ownershipQuery);
    ownershipQuery.maybeSingle = vi.fn(async () => ({ data: { id }, error: null }));
    const ownership = { select: () => ownershipQuery };
    const client = { from: (table: string) => table === 'perspectives' ? ownership : { upsert } };
    await expect(savePerspectiveFeedback(client, 'user-1', {
      perspectiveId: id, verdict: 'helpful', reason: null, correctedStance: null,
    })).resolves.toMatchObject({ perspective_id: id });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', perspective_id: id }), { onConflict: 'user_id,perspective_id' });
  });

  it('loads whole-Perspective, claim, and outcome assessments in one boundary', async () => {
    const rows = {
      perspective_feedback: [{ perspective_id: id, verdict: 'helpful' }],
      perspective_claim_feedback: [{ perspective_id: id, claim_id: 'claim_1', verdict: 'unsupported' }],
      perspective_outcomes: [{ perspective_id: id, horizon_days: 30 }],
    } as const;
    const from = vi.fn((table: keyof typeof rows) => {
      const query: Record<string, unknown> = {};
      query.eq = vi.fn(() => query);
      query.in = vi.fn(() => query);
      query.order = vi.fn(() => query);
      query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve);
      return { select: () => query };
    });
    const result = await loadPerspectiveAssessments({ from }, 'user-1', [id]);
    expect(result[id]).toMatchObject({
      feedback: { verdict: 'helpful' },
      claimFeedback: [{ claim_id: 'claim_1', verdict: 'unsupported' }],
      outcomes: [{ horizon_days: 30 }],
    });
  });
});
