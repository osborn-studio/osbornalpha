import { describe, it, expect } from 'vitest';
import {
  handleCheckoutCompleted,
  handleSubscriptionEnded,
  isSubscriptionEndedStatus,
} from './webhook-handlers';

const NOW = new Date('2026-07-03T00:00:00.000Z');

describe('handleCheckoutCompleted', () => {
  it('mode=payment (30-day pass) on a free user: grants pro + expires now+30d', () => {
    const result = handleCheckoutCompleted({ mode: 'payment' }, { plan: 'free', plan_expires_at: null }, NOW);
    expect(result).toEqual({ plan: 'pro', plan_expires_at: '2026-08-02T00:00:00.000Z' });
  });

  it('mode=payment stacks on top of an existing unexpired pass balance', () => {
    const current = { plan: 'pro', plan_expires_at: '2026-07-13T00:00:00.000Z' }; // +10d from now
    const result = handleCheckoutCompleted({ mode: 'payment' }, current, NOW);
    expect(result).toEqual({ plan: 'pro', plan_expires_at: '2026-08-12T00:00:00.000Z' });
  });

  it('mode=subscription: grants pro with expires=null (active subscription)', () => {
    const result = handleCheckoutCompleted({ mode: 'subscription' }, { plan: 'free', plan_expires_at: null }, NOW);
    expect(result).toEqual({ plan: 'pro', plan_expires_at: null });
  });
});

describe('handleSubscriptionEnded', () => {
  it('no pass balance (expires null, i.e. was subscription-only): downgrades to free', () => {
    const result = handleSubscriptionEnded({ plan: 'pro', plan_expires_at: null }, NOW);
    expect(result).toEqual({ plan: 'free', plan_expires_at: null });
  });

  it('expired pass balance: downgrades to free', () => {
    const result = handleSubscriptionEnded({ plan: 'pro', plan_expires_at: '2026-06-01T00:00:00.000Z' }, NOW);
    expect(result).toEqual({ plan: 'free', plan_expires_at: null });
  });

  it('unexpired pass balance protects against downgrade: stays pro with the same expiry', () => {
    const current = { plan: 'pro', plan_expires_at: '2026-07-20T00:00:00.000Z' };
    const result = handleSubscriptionEnded(current, NOW);
    expect(result).toEqual({ plan: 'pro', plan_expires_at: '2026-07-20T00:00:00.000Z' });
  });
});

describe('isSubscriptionEndedStatus', () => {
  it('active and trialing are not "ended"', () => {
    expect(isSubscriptionEndedStatus('active')).toBe(false);
    expect(isSubscriptionEndedStatus('trialing')).toBe(false);
  });

  it('canceled, unpaid, past_due, incomplete_expired are "ended"', () => {
    expect(isSubscriptionEndedStatus('canceled')).toBe(true);
    expect(isSubscriptionEndedStatus('unpaid')).toBe(true);
    expect(isSubscriptionEndedStatus('past_due')).toBe(true);
    expect(isSubscriptionEndedStatus('incomplete_expired')).toBe(true);
  });
});
