import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260904300000_external_evidence_documents.sql', import.meta.url),
  'utf8',
);

describe('external evidence documents migration', () => {
  it('stores bounded document audit projections without changing client table access', () => {
    expect(migration).toContain('document_content_hash text');
    expect(migration).toContain('document_fetched_at timestamptz');
    expect(migration).toContain("document_paragraphs jsonb not null default '[]'::jsonb");
    expect(migration).toContain("document_content_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("values ('external_evidence_documents')");
    expect(migration).not.toContain('grant select');
  });
});
