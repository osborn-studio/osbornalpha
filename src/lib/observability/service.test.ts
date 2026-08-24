import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchOperationalAlert } = vi.hoisted(() => ({ dispatchOperationalAlert: vi.fn() }));
vi.mock('./delivery', () => ({ dispatchOperationalAlert }));

import { recordAndDeliverCheck } from './service';

function fakeDb(insertResult: { data: { id: string } | null; error: { code: string } | null }) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return {
    update,
    db: {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(async () => insertResult) })),
        })),
        update,
      })),
    },
  };
}

describe('service alert persistence', () => {
  beforeEach(() => dispatchOperationalAlert.mockReset());

  it('records healthy windows without sending a notification', async () => {
    const { db, update } = fakeDb({ data: { id: 'run-1' }, error: null });
    const result = await recordAndDeliverCheck(db, {
      checkName: 'quote_15m',
      window: { from: '2026-07-21T02:00:00Z', to: '2026-07-21T02:15:00Z' },
      metrics: { batches: 2 },
      violations: [],
    });
    expect(result.status).toBe('healthy');
    expect(dispatchOperationalAlert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('deduplicates a retried cron window before delivery', async () => {
    const { db } = fakeDb({ data: null, error: { code: '23505' } });
    const result = await recordAndDeliverCheck(db, {
      checkName: 'ai_daily',
      window: { from: '2026-07-19T16:00:00Z', to: '2026-07-20T16:00:00Z' },
      metrics: { failure_rate: 0.2 },
      violations: [{ code: 'ai_failure_rate_high', value: 0.2, threshold: 0.1 }],
    });
    expect(result.deduplicated).toBe(true);
    expect(dispatchOperationalAlert).not.toHaveBeenCalled();
  });
});
