import { describe, expect, it } from 'vitest';
import { authorizedCronRequest } from './cron-auth';

describe('operational cron authorization', () => {
  it('fails closed when the secret is absent', () => {
    expect(authorizedCronRequest('Bearer anything', undefined)).toBe(false);
  });

  it('accepts only the exact bearer secret', () => {
    expect(authorizedCronRequest('Bearer cron-secret', 'cron-secret')).toBe(true);
    expect(authorizedCronRequest('Bearer cron-secret-x', 'cron-secret')).toBe(false);
    expect(authorizedCronRequest(null, 'cron-secret')).toBe(false);
  });
});
