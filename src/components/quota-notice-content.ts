export type QuotaNoticeReason = 'quota_exhausted' | 'daily_cost_exhausted';

export interface QuotaNoticeContentInput {
  used: number;
  limit: number;
  plan: string;
  reason?: QuotaNoticeReason;
  costLimitMicrormb?: number;
}

const DEFAULT_DAILY_COST_LIMIT_MICRORMB = 8_800_000;

function formatRmb(micrormb: number): string {
  const safeMicrormb = Number.isFinite(micrormb) && micrormb >= 0
    ? Math.trunc(micrormb)
    : DEFAULT_DAILY_COST_LIMIT_MICRORMB;
  return (safeMicrormb / 1_000_000).toFixed(2);
}

export function quotaNoticeContent(input: QuotaNoticeContentInput) {
  if (input.reason === 'daily_cost_exhausted') {
    const limit = formatRmb(input.costLimitMicrormb ?? DEFAULT_DAILY_COST_LIMIT_MICRORMB);
    return {
      titleKey: 'costTitle' as const,
      titleValues: { limit },
      descriptionKey: 'costDescription' as const,
      descriptionValues: { limit },
      showUpgrade: false,
    };
  }
  return {
    titleKey: 'title' as const,
    titleValues: { used: input.used, limit: input.limit },
    descriptionKey: input.plan === 'pro' ? 'descriptionPro' as const : 'descriptionFree' as const,
    showUpgrade: input.plan !== 'pro',
  };
}
