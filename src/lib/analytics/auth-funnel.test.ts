import { describe, expect, it } from 'vitest';
import { authCallbackUrl, isDuplicateAuthMilestone, sanitizeAnalyticsId } from './auth-funnel';

describe('auth funnel identity', () => {
  it('carries a valid anonymous identity through the email callback', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(authCallbackUrl('https://osbornalpha.com', id)).toBe(
      'https://osbornalpha.com/auth/callback?aid=550e8400-e29b-41d4-a716-446655440000',
    );
    expect(sanitizeAnalyticsId(id)).toBe(id);
  });

  it('rejects malformed callback identities', () => {
    expect(sanitizeAnalyticsId('')).toBeNull();
    expect(sanitizeAnalyticsId('../../login?token=secret')).toBeNull();
    expect(sanitizeAnalyticsId('a'.repeat(121))).toBeNull();
  });

  it('only treats unique auth milestone conflicts as successful deduplication', () => {
    expect(isDuplicateAuthMilestone('first_login_succeeded', '23505')).toBe(true);
    expect(isDuplicateAuthMilestone('watchlist_viewed', '23505')).toBe(false);
    expect(isDuplicateAuthMilestone('first_login_succeeded', '42501')).toBe(false);
  });
});
