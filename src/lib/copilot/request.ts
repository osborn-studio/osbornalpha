import { canonicalizeSecurityTicker } from '@/lib/watchlist/security-validation';

export function normalizeCopilotTicker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return canonicalizeSecurityTicker(value);
}
