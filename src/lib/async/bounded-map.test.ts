import { describe, expect, it } from 'vitest';
import { boundedMap } from './bounded-map';

describe('boundedMap', () => {
  it('preserves order, isolates failures, and respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const result = await boundedMap([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (value === 3) throw new Error('failed');
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(result.map((item) => item.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    expect(result[0]).toEqual({ status: 'fulfilled', value: 2 });
  });
});
