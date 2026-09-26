import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import {
  ingestSource,
  getSource,
  listSources,
  listSourcesForEntity,
  contentHash,
  SourceValidationError,
} from './sources';

let ctx: ResearchCtx;
let store: MockStore;
beforeEach(() => {
  ({ ctx, store } = makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore });
});

const valid = {
  source_type: 'NEWS' as const,
  title: 'NVIDIA announces Blackwell Ultra',
  raw_text: 'NVIDIA today announced the Blackwell Ultra GPU platform.',
};

describe('ingestSource validation', () => {
  it('rejects empty raw_text', async () => {
    await expect(ingestSource(ctx, { ...valid, raw_text: '' })).rejects.toThrow(SourceValidationError);
    await expect(ingestSource(ctx, { ...valid, raw_text: '   ' })).rejects.toThrow(/raw_text/);
  });

  it('rejects unknown source_type', async () => {
    await expect(ingestSource(ctx, { ...valid, source_type: 'TWEET' as any })).rejects.toThrow(/source_type/);
  });

  it('rejects empty title and bad trust_level', async () => {
    await expect(ingestSource(ctx, { ...valid, title: '' })).rejects.toThrow(/title/);
    await expect(ingestSource(ctx, { ...valid, trust_level: 'ULTRA' as any })).rejects.toThrow(/trust_level/);
  });
});

describe('ingestSource behavior', () => {
  it('inserts with sha256 content hash and audit log', async () => {
    const res = await ingestSource(ctx, { ...valid, url: 'https://nvda.example.com', entity_ids: ['e1'] });
    expect(res.duplicate).toBe(false);
    const src = (await getSource(ctx, res.id))!;
    expect(src.content_hash).toBe(contentHash(valid.raw_text));
    expect(src.trust_level).toBe('MEDIUM'); // default
    expect(src.entity_ids).toEqual(['e1']);
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'source.ingest');
    expect(audits).toHaveLength(1);
    expect(audits[0].object_id).toBe(res.id);
  });

  it('is idempotent on identical raw_text', async () => {
    const first = await ingestSource(ctx, valid);
    const second = await ingestSource(ctx, { ...valid, title: 'different title, same body' });
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(store.count('research_source_documents')).toBe(1);
    // No second audit entry for the duplicate.
    expect(store.count('research_audit_log')).toBe(1);
  });
});

describe('listing', () => {
  it('lists newest-first with type filter', async () => {
    const a = await ingestSource(ctx, { ...valid, raw_text: 'body A' });
    const b = await ingestSource(ctx, { ...valid, source_type: 'NOTE', raw_text: 'body B' });
    const all = await listSources(ctx);
    expect(all.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    const notes = await listSources(ctx, { type: 'NOTE' });
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(b.id);
  });

  it('finds sources by entity id via jsonb contains', async () => {
    const hit = await ingestSource(ctx, { ...valid, raw_text: 'about nvda', entity_ids: ['nvda-id', 'other'] });
    await ingestSource(ctx, { ...valid, raw_text: 'about msft', entity_ids: ['msft-id'] });
    const rows = await listSourcesForEntity(ctx, 'nvda-id');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(hit.id);
  });
});

describe('WP-A1 source extension fields', () => {
  it('rowToSource gives legacy rows the backfill defaults', async () => {
    const { rowToSource } = await import('./sources');
    const legacy = { id: 'x', source_type: 'NEWS', title: 't', url: null, author: null, published_at: null, ingested_at: '2026-09-25T00:00:00.000Z', raw_text: 'b', content_hash: 'h', trust_level: 'MEDIUM', entity_ids: [], metadata: {} };
    expect(rowToSource(legacy)).toMatchObject({ available_at: '2026-09-25T00:00:00.000Z', source_version: '1', permission: 'public', event_time: null, cluster_id: null, cluster_first: null, origin_type: null, market: null });
    expect(rowToSource({ ...legacy, available_at: '2026-09-24T00:00:00.000Z', source_version: '3', permission: 'licensed', market: 'HK', origin_type: 'filing', cluster_id: 'c', cluster_first: true, event_time: '2026-09-20T00:00:00.000Z' })).toMatchObject({ available_at: '2026-09-24T00:00:00.000Z', source_version: '3', permission: 'licensed', market: 'HK', origin_type: 'filing', cluster_id: 'c', cluster_first: true, event_time: '2026-09-20T00:00:00.000Z' });
  });

  it('rejects malformed extension fields on ingest', async () => {
    await expect(ingestSource(ctx, { ...valid, permission: 'secret' as any })).rejects.toThrow(/permission/);
    await expect(ingestSource(ctx, { ...valid, market: 'EU' as any })).rejects.toThrow(/market/);
    await expect(ingestSource(ctx, { ...valid, available_at: 'yesterday' })).rejects.toThrow(/available_at/);
    await expect(ingestSource(ctx, { ...valid, event_time: 'soon' })).rejects.toThrow(/event_time/);
  });

  it('defaults availability to the ingestion instant and permission by source type', async () => {
    const news = await getSource(ctx, (await ingestSource(ctx, valid)).id);
    expect(news!.available_at).toBe(news!.ingested_at);
    expect(news!.permission).toBe('public');
    expect(news!.source_version).toBe('1');
    expect(news!.market).toBeNull();
    const note = await getSource(ctx, (await ingestSource(ctx, { ...valid, source_type: 'NOTE', raw_text: 'a private note' })).id);
    expect(note!.permission).toBe('private');
  });

  it('passes explicit extension values through', async () => {
    const res = await ingestSource(ctx, { ...valid, raw_text: 'explicit', available_at: '2026-09-20T00:00:00.000Z', event_time: '2026-09-19T00:00:00.000Z', market: 'US', permission: 'licensed' });
    const src = (await getSource(ctx, res.id))!;
    expect(src).toMatchObject({ available_at: '2026-09-20T00:00:00.000Z', event_time: '2026-09-19T00:00:00.000Z', market: 'US', permission: 'licensed' });
  });
});
