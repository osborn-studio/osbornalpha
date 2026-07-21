import { timingSafeEqual } from 'node:crypto';

export function authorizedCronRequest(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
