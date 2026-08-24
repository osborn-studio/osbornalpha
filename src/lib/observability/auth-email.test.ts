import { describe, expect, it } from 'vitest';
import {
  classifyAuthEmailSubject,
  emailDeliveryStatus,
  evaluateAuthEmailProbes,
  hashProbeRecipient,
  mergeDeliveryState,
  parseProbeTargets,
} from './auth-email';

describe('auth email probes', () => {
  it('parses real-domain targets without persisting their raw addresses', () => {
    expect(parseProbeTargets('first@qq.com, second@126.com')).toEqual([
      { email: 'first@qq.com', domain: 'qq.com' },
      { email: 'second@126.com', domain: '126.com' },
    ]);
    expect(hashProbeRecipient('FIRST@qq.com', 'hash-secret')).toBe(
      hashProbeRecipient('first@qq.com', 'hash-secret'),
    );
    expect(hashProbeRecipient('first@qq.com', 'hash-secret')).not.toContain('first');
  });

  it('classifies Supabase confirmation and recovery subjects', () => {
    expect(classifyAuthEmailSubject('Confirm Your Signup')).toBe('signup');
    expect(classifyAuthEmailSubject('确认您的注册邮箱')).toBe('signup');
    expect(classifyAuthEmailSubject('Reset Your Password')).toBe('recovery');
    expect(classifyAuthEmailSubject('重置密码')).toBe('recovery');
    expect(classifyAuthEmailSubject('Weekly report')).toBeNull();
  });

  it('maps delivery events and ignores older out-of-order webhooks', () => {
    expect(emailDeliveryStatus('email.delivered')).toBe('delivered');
    expect(emailDeliveryStatus('email.delivery_delayed')).toBe('delayed');
    expect(emailDeliveryStatus('email.bounced')).toBe('failed');
    expect(mergeDeliveryState(
      { status: 'delivered', at: '2026-07-21T02:01:00.000Z' },
      { status: 'delayed', at: '2026-07-21T02:00:00.000Z' },
    )).toEqual({ status: 'delivered', at: '2026-07-21T02:01:00.000Z' });
  });

  it('alerts when either probe flow is not delivered for every configured domain', () => {
    const result = evaluateAuthEmailProbes([
      { domain: 'qq.com', signup_delivery: 'delivered', recovery_delivery: 'delivered' },
      { domain: '126.com', signup_delivery: 'delivered', recovery_delivery: 'failed' },
    ], 2);
    expect(result.metrics).toEqual({
      expected_targets: 2,
      observed_targets: 2,
      signup_delivered: 2,
      recovery_delivered: 1,
      failed_or_missing: 1,
    });
    expect(result.violations.map((item) => item.code)).toEqual(['auth_recovery_probe_failed']);
  });

  it('allows one empty bootstrap window without sending a false alert', () => {
    const result = evaluateAuthEmailProbes([], 2, true);
    expect(result.metrics).toMatchObject({ bootstrap: true, observed_targets: 0 });
    expect(result.violations).toEqual([]);
  });
});
