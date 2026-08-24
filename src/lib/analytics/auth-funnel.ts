const ANALYTICS_ID = /^[A-Za-z0-9][A-Za-z0-9-]{15,119}$/;
const UNIQUE_USER_MILESTONES = new Set([
  'email_confirmation_succeeded',
  'first_login_succeeded',
]);

export function sanitizeAnalyticsId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return ANALYTICS_ID.test(trimmed) ? trimmed : null;
}

export function authCallbackUrl(origin: string, anonymousId: string): string {
  const url = new URL('/auth/callback', origin);
  const safeId = sanitizeAnalyticsId(anonymousId);
  if (safeId) url.searchParams.set('aid', safeId);
  return url.toString();
}

export function isDuplicateAuthMilestone(eventName: string, errorCode: string | null | undefined): boolean {
  return errorCode === '23505' && UNIQUE_USER_MILESTONES.has(eventName);
}
