import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904460000_perspective_claim_feedback.sql', import.meta.url),
  'utf8',
);

describe('Perspective claim feedback migration', () => {
  it('creates a user-scoped claim feedback table with bounded verdicts', () => {
    expect(migration).toContain('create table if not exists public.perspective_claim_feedback');
    expect(migration).toContain("verdict in ('helpful', 'incorrect', 'outdated', 'unsupported')");
    expect(migration).toContain('unique (user_id, perspective_id, claim_id)');
  });

  it('checks that the claim belongs to the owned Perspective before insertion', () => {
    expect(migration).toContain("jsonb_array_elements(p.claims)");
    expect(migration).toContain("claim ->> 'id' = claim_id");
    expect(migration).toContain("values ('perspective_claim_feedback')");
  });
});
