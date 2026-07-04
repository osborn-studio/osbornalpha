import { describe, it, expect, beforeEach } from 'vitest';
import { openTestDb, type ResearchDb } from './db';
import {
  ingestSource,
  getSource,
  listSources,
  listSourcesForEntity,
  contentHash,
  SourceValidationError,
} from './sources';

let db: ResearchDb;
beforeEach(() => {
  db = openTestDb();
});

const valid = {
  source_type: 'NEWS' as const,
  title: 'NVIDIA announces Blackwell Ultra',
  raw_text: 'NVIDIA today announced the Blackwell Ultra GPU platform.',
};

describe('ingestSource validation', () => {
  it('rejects empty raw_text', () => {
    expect(() => ingestSource(db, { ...valid, raw_text: '' })).toThrow(SourceValidationError);
    expect(() => ingestSource(db, { ...valid, raw_text: '   ' })).toThrow(/raw_text/);
  });

  it('rejects unknown source_type', () => {
    expect(() => ingestSource(db, { ...valid, source_type: 'TWEET' as any })).toThrow(/source_type/);
  });

  it('rejects empty title and bad trust_level', () => {
    expect(() => ingestSource(db, { ...valid, title: '' })).toThrow(/title/);
    expect(() => ingestSource(db, { ...valid, trust_level: 'ULTRA' as any })).toThrow(/trust_level/);
  });
});

describe('ingestSource behavior', () => {
  it('inserts with sha256 content hash and audit log', () => {
    const res = ingestSource(db, { ...valid, url: 'https://nvda.example.com', entity_ids: ['e1'] });
    expect(res.duplicate).toBe(false);
    const src = getSource(db, res.id)!;
    expect(src.content_hash).toBe(contentHash(valid.raw_text));
    expect(src.trust_level).toBe('MEDIUM'); // default
    expect(src.entity_ids).toEqual(['e1']);
    const audits = db.prepare(`select * from audit_log where action='source.ingest'`).all();
    expect(audits).toHaveLength(1);
    expect(audits[0].target_id).toBe(res.id);
  });

  it('is idempotent on identical raw_text', () => {
    const first = ingestSource(db, valid);
    const second = ingestSource(db, { ...valid, title: 'different title, same body' });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(db.prepare(`select count(*) c from source_documents`).get().c).toBe(1);
    // No second audit entry for the duplicate.
    expect(db.prepare(`select count(*) c from audit_log`).get().c).toBe(1);
  });
});

describe('listing', () => {
  it('lists newest-first with type filter', () => {
    const a = ingestSource(db, { ...valid, raw_text: 'body A' });
    const b = ingestSource(db, { ...valid, source_type: 'NOTE', raw_text: 'body B' });
    const all = listSources(db);
    expect(all.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    const notes = listSources(db, { type: 'NOTE' });
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(b.id);
  });

  it('finds sources by entity id via json_each', () => {
    const hit = ingestSource(db, { ...valid, raw_text: 'about nvda', entity_ids: ['nvda-id', 'other'] });
    ingestSource(db, { ...valid, raw_text: 'about msft', entity_ids: ['msft-id'] });
    const rows = listSourcesForEntity(db, 'nvda-id');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hit.id);
  });
});
