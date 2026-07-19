export type AuthErrorCode =
  | 'email_not_confirmed'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'invalid_email'
  | 'network_error'
  | 'auth_error';

export function stableAuthErrorCode(error: unknown): AuthErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/email not confirmed|email.*unconfirmed/i.test(message)) return 'email_not_confirmed';
  if (/invalid login credentials|invalid credentials|wrong password/i.test(message)) return 'invalid_credentials';
  if (/rate.?limit|too many requests|over_email_send_rate_limit/i.test(message)) return 'rate_limited';
  if (/invalid email|email address.*invalid/i.test(message)) return 'invalid_email';
  if (/load failed|failed to fetch|network|connection/i.test(message)) return 'network_error';
  return 'auth_error';
}
