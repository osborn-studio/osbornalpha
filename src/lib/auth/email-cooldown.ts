export const EMAIL_REQUEST_COOLDOWN_MS = 60_000;

export type AuthEmailAction = 'signup' | 'recovery';

export function emailCooldownStorageKey(action: AuthEmailAction): string {
  return `osbornalpha:auth-email:${action}:cooldown-until`;
}

export function remainingEmailCooldownSeconds(cooldownUntil: number, now = Date.now()): number {
  if (!Number.isFinite(cooldownUntil)) return 0;
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
}
