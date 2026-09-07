import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/watchlist-production-release.yml', import.meta.url),
  'utf8',
);

describe('Watchlist production release contract', () => {
  it('applies migrations before production checks and deployment', () => {
    const migration = workflow.indexOf('supabase db push');
    const schema = workflow.indexOf('npm run watchlist:production-check');
    const provider = workflow.indexOf('npm run watchlist:provider-check');
    const rls = workflow.indexOf('npm run watchlist:rls-check');
    const delivery = workflow.indexOf('npm run watchlist:delivery-check');
    const deploy = workflow.indexOf('vercel@59.11.7 deploy');

    expect(migration).toBeGreaterThan(-1);
    expect(schema).toBeGreaterThan(migration);
    expect(provider).toBeGreaterThan(schema);
    expect(rls).toBeGreaterThan(provider);
    expect(delivery).toBeGreaterThan(rls);
    expect(deploy).toBeGreaterThan(delivery);
  });

  it('requires two runtime identities and an explicit provider policy', () => {
    for (const name of [
      'WATCHLIST_RUNTIME_EMAIL',
      'WATCHLIST_RUNTIME_PASSWORD',
      'WATCHLIST_RUNTIME_EMAIL_B',
      'WATCHLIST_RUNTIME_PASSWORD_B',
      'WATCHLIST_REQUIRED_PROVIDERS',
      'RESEND_API_KEY',
      'WATCHLIST_DELIVERY_CANARY_EMAIL',
      'WATCHLIST_DELIVERY_CANARY_FROM',
    ]) {
      expect(workflow).toContain(`test -n "$${name}"`);
    }
  });
});
