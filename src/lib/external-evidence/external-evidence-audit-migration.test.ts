import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260904230000_external_evidence_audit_snapshot.sql',
  import.meta.url,
);

describe('external evidence audit snapshot migration', () => {
  it('adds versioned query and result hashes without a plaintext query column', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    expect(migration).toContain('audit_version integer not null default 1');
    expect(migration).toContain('query_plan jsonb');
    expect(migration).toContain('result_citation_ids text[]');
    expect(migration).toContain('result_set_hash text');
    expect(migration).not.toMatch(/add column[^;]*\bquery\s+text/i);
  });
});
