import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904210000_watchlist_perspective_provenance.sql', import.meta.url),
  'utf8',
);

describe('watchlist perspective provenance migration', () => {
  it('stores reproducible model and evidence metadata with bounded values', () => {
    expect(migration).toContain('model_version text');
    expect(migration).toContain('prompt_version text');
    expect(migration).toContain('evidence_request_id uuid');
    expect(migration).toContain('evidence_result_count_check');
    expect(migration).toContain('evidence_coverage_ratio between 0 and 1');
    expect(migration).toContain('soft UUID link');
  });
});
