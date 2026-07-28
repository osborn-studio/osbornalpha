import { describe, expect, it } from 'vitest';
import { stableAuthErrorCode } from './errors';

describe('stableAuthErrorCode', () => {
  it('recognizes an unconfirmed email without exposing provider text', () => {
    expect(stableAuthErrorCode(new Error('Email not confirmed'))).toBe('email_not_confirmed');
  });

  it('classifies common authentication failures', () => {
    expect(stableAuthErrorCode(new Error('Invalid login credentials'))).toBe('invalid_credentials');
    expect(stableAuthErrorCode(new Error('email rate limit exceeded'))).toBe('rate_limited');
    expect(stableAuthErrorCode(new TypeError('Load failed'))).toBe('network_error');
  });
});
