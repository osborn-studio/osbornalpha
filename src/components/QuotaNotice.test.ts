import { describe, expect, it } from 'vitest';
import { quotaNoticeContent } from './quota-notice-content';

describe('QuotaNotice', () => {
  it('keeps the count-exhaustion title and Free upgrade path', () => {
    expect(quotaNoticeContent({
      used: 20, limit: 20, plan: 'free',
    })).toEqual({
      titleKey: 'title', titleValues: { used: 20, limit: 20 },
      descriptionKey: 'descriptionFree', showUpgrade: true,
    });

    expect(quotaNoticeContent({ used: 20, limit: 20, plan: 'free' }).titleKey).toBe('title');
  });

  it('renders a distinct cost-exhaustion notice without a count ratio for Pro', () => {
    expect(quotaNoticeContent({
      used: 0,
      limit: 20,
      plan: 'pro',
      reason: 'daily_cost_exhausted',
      costLimitMicrormb: 8_800_000,
    })).toEqual({
      titleKey: 'costTitle',
      titleValues: { limit: '8.80' },
      descriptionKey: 'costDescription',
      descriptionValues: { limit: '8.80' },
      showUpgrade: false,
    });
  });
});
