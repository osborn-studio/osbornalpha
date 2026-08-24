import { describe, expect, it } from 'vitest';
import { briefSendFailure } from './send-response';

describe('briefSendFailure', () => {
  it('uses the server-localized English error and preserves a cost quota notice', () => {
    expect(briefSendFailure({
      error: 'Today’s platform AI cost budget has been used up.',
      code: 'daily_cost_exhausted',
      quota: {
        used: 0,
        limit: 0,
        plan: 'pro',
        reason: 'daily_cost_exhausted',
        costLimitMicrormb: 8_800_000,
      },
    }, 'Send failed')).toEqual({
      message: 'Today’s platform AI cost budget has been used up.',
      quota: {
        used: 0,
        limit: 0,
        plan: 'pro',
        reason: 'daily_cost_exhausted',
        costLimitMicrormb: 8_800_000,
      },
    });
  });

  it('uses the server-localized Chinese error for Telegram and email without falling back to a raw code', () => {
    expect(briefSendFailure({
      error: '平台 AI 成本预算服务暂不可用，请稍后重试。',
      code: 'budget_unavailable',
    }, '发送失败')).toEqual({
      message: '平台 AI 成本预算服务暂不可用，请稍后重试。',
      quota: null,
    });
  });
});
