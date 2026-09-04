import { describe, expect, it } from 'vitest';
import { createRequestSlot } from './request-slot';

describe('request slot', () => {
  it('aborts the previous lease when a new request begins', () => {
    const slot = createRequestSlot();
    const first = slot.begin();
    const second = slot.begin();

    expect(first.signal.aborted).toBe(true);
    expect(slot.isCurrent(first)).toBe(false);
    expect(slot.isCurrent(second)).toBe(true);
  });

  it('invalidates the active lease on cancellation', () => {
    const slot = createRequestSlot();
    const lease = slot.begin();
    slot.cancel();

    expect(lease.signal.aborted).toBe(true);
    expect(slot.isCurrent(lease)).toBe(false);
  });
});
