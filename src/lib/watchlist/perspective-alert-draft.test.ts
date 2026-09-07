import { describe, expect, it, vi } from 'vitest';
import { createPerspectiveAlertDraft, parsePerspectiveAlertDraft } from './perspective-alert-draft';

const itemId = '123e4567-e89b-42d3-a456-426614174000';
const perspectiveId = '223e4567-e89b-42d3-a456-426614174000';

describe('Perspective alert draft', () => {
  it('parses bounded claim identifiers and defaults the cooldown', () => {
    expect(parsePerspectiveAlertDraft({ itemId, perspectiveId, claimId: 'claim_2' })).toEqual({
      itemId, perspectiveId, claimId: 'claim_2', cooldownMinutes: 1440,
    });
    expect(parsePerspectiveAlertDraft({ itemId: 'bad', perspectiveId, claimId: 'claim_2' })).toBeNull();
    expect(parsePerspectiveAlertDraft({ itemId, perspectiveId, claimId: '../bad' })).toBeNull();
  });

  it('creates the disabled draft through one atomic RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        alert: { id: 'alert-1', enabled: false },
        origin: { alert_id: 'alert-1', claim_id: 'claim_2' },
      },
      error: null,
    }));
    const result = await createPerspectiveAlertDraft({ rpc } as never, {
      itemId, perspectiveId, claimId: 'claim_2', cooldownMinutes: 60,
    });
    expect(rpc).toHaveBeenCalledWith('create_watchlist_alert_draft_from_claim', {
      p_item_id: itemId,
      p_perspective_id: perspectiveId,
      p_claim_id: 'claim_2',
      p_cooldown_minutes: 60,
    });
    expect(result.alert).toMatchObject({ id: 'alert-1', enabled: false, origin: { claim_id: 'claim_2' } });
  });
});
