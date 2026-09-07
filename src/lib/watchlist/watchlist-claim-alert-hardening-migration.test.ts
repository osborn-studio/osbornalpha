import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../../supabase/migrations/20260904550000_watchlist_claim_alert_hardening.sql',
  import.meta.url,
), 'utf8');

describe('watchlist claim alert hardening migration', () => {
  it('prevents duplicate alerts while allowing recreation after alert deletion', () => {
    expect(migration).toContain('create unique index if not exists watchlist_alert_origins_claim_unique_idx');
    expect(migration).toContain('(user_id, perspective_id, claim_id)');
    expect(migration).toContain('where perspective_id is not null');
    expect(migration).toContain("values ('watchlist_claim_alert_hardening')");
  });
});
