import { describe, expect, it, vi } from 'vitest';
import { consumeExternalEvidenceQuota } from './quota';

describe('external evidence quota', () => {
  it('allows non-persistent local development contexts', async () => {
    await expect(consumeExternalEvidenceQuota(null)).resolves.toBe(true);
  });

  it('delegates the atomic counter to the database', async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    await expect(consumeExternalEvidenceQuota({ rpc }, 999)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith('consume_external_evidence_user_quota', {
      p_limit: 200, p_window_seconds: 3600,
    });
  });

  it('fails closed when the quota store is unavailable', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'offline' } }));
    await expect(consumeExternalEvidenceQuota({ rpc })).rejects.toThrow('external_evidence_quota_failed:offline');
  });
});
