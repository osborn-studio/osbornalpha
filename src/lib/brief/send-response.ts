export interface BriefSendQuota {
  used: number;
  limit: number;
  plan: string;
  reason?: 'quota_exhausted' | 'daily_cost_exhausted';
  costLimitMicrormb?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function quotaFrom(value: unknown): BriefSendQuota | null {
  if (!isRecord(value)
    || typeof value.used !== 'number'
    || typeof value.limit !== 'number'
    || typeof value.plan !== 'string') return null;
  if (value.reason !== undefined && value.reason !== 'quota_exhausted' && value.reason !== 'daily_cost_exhausted') return null;
  if (value.costLimitMicrormb !== undefined && typeof value.costLimitMicrormb !== 'number') return null;
  return {
    used: value.used,
    limit: value.limit,
    plan: value.plan,
    ...(value.reason ? { reason: value.reason } : {}),
    ...(typeof value.costLimitMicrormb === 'number' ? { costLimitMicrormb: value.costLimitMicrormb } : {}),
  };
}

/** Prefer the server's locale-aware, sanitized message over status/code fallbacks. */
export function briefSendFailure(payload: unknown, fallback: string): { message: string; quota: BriefSendQuota | null } {
  if (!isRecord(payload)) return { message: fallback, quota: null };
  return {
    message: typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback,
    quota: quotaFrom(payload.quota),
  };
}
