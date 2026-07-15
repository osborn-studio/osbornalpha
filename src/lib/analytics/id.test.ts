import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsId } from './id';

describe('createAnalyticsId', () => {
  it('uses randomUUID when available', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    expect(createAnalyticsId({ randomUUID })).toBe('00000000-0000-4000-8000-000000000001');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('builds a UUID from random bytes when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    expect(createAnalyticsId({ getRandomValues })).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('still returns a bounded identifier without Web Crypto', () => {
    const id = createAnalyticsId({});
    expect(id).toMatch(/^local-[a-z0-9-]+$/);
    expect(id.length).toBeLessThanOrEqual(120);
  });
});
