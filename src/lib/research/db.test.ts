import { describe, it, expect, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  openTestDb, assertEnabled, isResearchEnabled, ResearchDisabled, logAudit,
  applyMigrations, MIGRATIONS, SCHEMA_VERSION, type ResearchDb,
} from './db';
import { readJson, writeJson } from './types';

function insertSource(db: ResearchDb, overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    id: crypto.randomUUID(),
    source_type: 'NEWS',
    title: 'NVIDIA Q1 earnings beat',
    url: 'https://example.com/nvda',
    author: null,
    published_at: null,
    ingested_at: new Date().toISOString(),
    raw_text: 'NVIDIA reported record data center revenue.',
    content_hash: 'abc123',
    trust_level: 'MEDIUM',
    entity_ids: '[]',
    ...overrides,
  };
  db.prepare(
    `insert into source_documents
       (id, source_type, title, url, author, published_at, ingested_at,
        raw_text, content_hash, trust_level, entity_ids)
     values (@id, @source_type, @title, @url, @author, @published_at, @ingested_at,
             @raw_text, @content_hash, @trust_level, @entity_ids)`,
  ).run(row);
  return row;
}

describe('research db schema', () => {
  it('creates all 12 tables', () => {
    const db = openTestDb();
    const tables = db
      .prepare(`select name from sqlite_master where type='table' and name not like 'sqlite_%'`)
      .all()
      .map((r: { name: string }) => r.name)
      .sort();
    expect(tables).toEqual([
      'audit_log', 'axioms', 'entities', 'entity_relations', 'eval_cases',
      'eval_runs', 'memos', 'playbook_runs', 'signals', 'source_documents',
      'theses', 'thesis_events',
    ]);
    db.close();
  });

  it('rejects invalid enum values via CHECK constraints', () => {
    const db = openTestDb();
    expect(() => insertSource(db, { source_type: 'TWEET' })).toThrow(/CHECK/i);
    expect(() => insertSource(db, { trust_level: 'BANANA' })).toThrow(/CHECK/i);
    db.close();
  });

  it('rejects updates to source raw fields (immutability trigger)', () => {
    const db = openTestDb();
    const row = insertSource(db);
    expect(() =>
      db.prepare(`update source_documents set raw_text = 'rewritten by llm' where id = ?`).run(row.id),
    ).toThrow(/immutable/);
    expect(() =>
      db.prepare(`update source_documents set url = 'https://evil.example.com' where id = ?`).run(row.id),
    ).toThrow(/immutable/);
    // Mutable metadata is still updatable.
    db.prepare(`update source_documents set trust_level = 'HIGH', title = 'renamed' where id = ?`).run(row.id);
    const after = db.prepare(`select trust_level, title, raw_text from source_documents where id = ?`).get(row.id);
    expect(after.trust_level).toBe('HIGH');
    expect(after.raw_text).toBe('NVIDIA reported record data center revenue.');
    db.close();
  });

  it('enforces content_hash uniqueness', () => {
    const db = openTestDb();
    insertSource(db, { content_hash: 'same-hash' });
    expect(() => insertSource(db, { content_hash: 'same-hash' })).toThrow(/UNIQUE/i);
    db.close();
  });

  it('logAudit appends audit rows', () => {
    const db = openTestDb();
    logAudit(db, 'source.ingest', 'src-1', { note: 'test' });
    const rows = db.prepare(`select * from audit_log`).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('source.ingest');
    expect(rows[0].target_id).toBe('src-1');
    expect(JSON.parse(rows[0].detail)).toEqual({ note: 'test' });
    db.close();
  });
});

describe('schema migrations (v1 → v2)', () => {
  function signalColumns(db: ResearchDb): string[] {
    return db.prepare(`select name from pragma_table_info('signals')`)
      .all()
      .map((r: { name: string }) => r.name);
  }

  it('openTestDb lands on the latest schema version with v2 columns', () => {
    const db = openTestDb();
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(2);
    expect(signalColumns(db)).toEqual(
      expect.arrayContaining(['metadata', 'llm_provenance']),
    );
    db.close();
  });

  it('upgrades an existing v1 database cleanly, defaulting old rows to {}', () => {
    // Simulate a Phase 1 database: run only the v1 migration.
    const db = new Database(':memory:') as unknown as ResearchDb;
    MIGRATIONS[0](db);
    db.pragma('user_version = 1');
    expect(signalColumns(db)).not.toContain('metadata');

    // A signal written under v1 (no metadata / llm_provenance columns).
    db.prepare(
      `insert into signals
         (id, title, summary, signal_type, direction, confidence, created_at)
       values ('sig-v1', 'old signal', 'written under schema v1',
               'DEVELOPER', 'POSITIVE', 'MEDIUM', '2026-07-01T00:00:00Z')`,
    ).run();

    applyMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    const row = db.prepare(`select * from signals where id = 'sig-v1'`).get();
    expect(row.metadata).toBe('{}');
    expect(row.llm_provenance).toBe('{}');
    // v1 data is untouched.
    expect(row.title).toBe('old signal');
    db.close();
  });

  it('applyMigrations is idempotent at the latest version', () => {
    const db = openTestDb();
    applyMigrations(db);
    applyMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    db.close();
  });
});

describe('env gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('assertEnabled throws ResearchDisabled when env unset', () => {
    vi.stubEnv('RESEARCH_OS_ENABLED', '');
    expect(isResearchEnabled()).toBe(false);
    expect(() => assertEnabled()).toThrow(ResearchDisabled);
  });

  it('assertEnabled passes when RESEARCH_OS_ENABLED=1', () => {
    vi.stubEnv('RESEARCH_OS_ENABLED', '1');
    expect(isResearchEnabled()).toBe(true);
    expect(() => assertEnabled()).not.toThrow();
  });
});

describe('Json column helpers', () => {
  it('round-trips arrays and objects', () => {
    const arr = ['a', 'b'];
    expect(readJson<string[]>(writeJson(arr), [])).toEqual(arr);
    const obj = { k: 1, nested: { x: 'y' } };
    expect(readJson<Record<string, unknown>>(writeJson(obj), {})).toEqual(obj);
  });

  it('falls back on null/invalid text', () => {
    expect(readJson<string[]>(null, [])).toEqual([]);
    expect(readJson<string[]>('not json', ['fb'])).toEqual(['fb']);
    expect(readJson<string[]>('', ['fb'])).toEqual(['fb']);
  });
});
