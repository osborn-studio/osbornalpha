import { describe, expect, it } from 'vitest';
import {
  EMAIL_REQUEST_COOLDOWN_MS,
  emailCooldownStorageKey,
  remainingEmailCooldownSeconds,
} from './email-cooldown';

describe('email request cooldown', () => {
  it('uses a 60-second window for auth emails', () => {
    expect(EMAIL_REQUEST_COOLDOWN_MS).toBe(60_000);
  });

  it('rounds remaining time up and stops at zero', () => {
    expect(remainingEmailCooldownSeconds(61_001, 1_001)).toBe(60);
    expect(remainingEmailCooldownSeconds(1_000, 1_001)).toBe(0);
  });

  it('keeps signup and recovery cooldowns separate without storing an email address', () => {
    expect(emailCooldownStorageKey('signup')).toBe('osbornalpha:auth-email:signup:cooldown-until');
    expect(emailCooldownStorageKey('recovery')).toBe('osbornalpha:auth-email:recovery:cooldown-until');
  });
});
