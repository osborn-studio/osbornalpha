import { describe, expect, it, vi } from 'vitest';
import { authorizeResearchRefresh } from './research-quota';

const plan = { allowed: true, used: 1, limit: 10, plan: 'free' };

describe('research refresh authorization', () => {
  it('maps a plan-limit result from the atomic authorization RPC', async () => {
    await expect(authorizeResearchRefresh({}, {
      authorize: vi.fn(async () => ({ ...plan, allowed: false, reason: 'plan_limit' as const })),
    })).resolves.toMatchObject({ allowed: false, reason: 'plan_limit' });
  });

  it('maps an evidence rate-limit result without client-side compensation', async () => {
    await expect(authorizeResearchRefresh({}, {
      authorize: vi.fn(async () => ({ ...plan, allowed: false, reason: 'rate_limit' as const })),
    })).resolves.toMatchObject({ allowed: false, reason: 'rate_limit' });
  });

  it('propagates an atomic authorization failure', async () => {
    await expect(authorizeResearchRefresh({}, {
      authorize: vi.fn(async () => { throw new Error('quota offline'); }),
    })).rejects.toThrow('quota offline');
  });
});
