import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904430000_perspective_claims.sql', import.meta.url),
  'utf8',
);

describe('perspective claim migration', () => {
  it('adds bounded claim-level evidence storage and a release marker', () => {
    expect(migration).toContain("add column if not exists claims jsonb not null default '[]'::jsonb");
    expect(migration).toContain("jsonb_typeof(claims) = 'array'");
    expect(migration).toContain('jsonb_array_length(claims) <= 6');
    expect(migration).toContain("values ('perspective_claims')");
  });
});
