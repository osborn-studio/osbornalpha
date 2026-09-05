import { describe, expect, it, vi } from 'vitest';
import { parsePerspectiveFeedback, savePerspectiveFeedback } from './perspective-feedback';

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
});
