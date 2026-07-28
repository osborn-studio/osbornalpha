import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { ingestDiligence } from './diligence';
import { contentHash } from './sources';

let ctx: ResearchCtx;
let store: MockStore;
beforeEach(() => {
  ({ ctx, store } = makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore });
});

const base = {
  ticker: '300308.SZ',
  canonical_name: '中际旭创',
  one_line: '全球AI光模块龙头',
  unverified: ['统一社会信用代码', '前十大股东'],
  markdown: '# 尽调简报：中际旭创\n\n## §1 主体与股权\n【事实】…',
  tool_refs: ['search', 'quote', 'financials'],
};

describe('ingestDiligence', () => {
  it('mints v1, creates the COMPANY entity, tags metadata.kind=diligence', async () => {
    const r = await ingestDiligence(ctx, base);
    expect(r.version).toBe(1);
    expect(r.duplicate).toBe(false);
    expect(r.entity_id).toBeTruthy();

    // one entity + one source persisted
    const ents = store.rows('research_entities');
    expect(ents.filter((e: any) => e.ticker === '300308.SZ' && e.type === 'COMPANY')).toHaveLength(1);
    const src = store.rows('research_source_documents').find((s: any) => s.id === r.id) as any;
    expect(src.source_type).toBe('NOTE');
    expect(src.metadata.kind).toBe('diligence');
    expect(src.metadata.ticker).toBe('300308.SZ');
    expect(src.metadata.version).toBe(1);
    expect(src.metadata.supersedes).toBeNull();
    expect(src.metadata.unverified).toEqual(['统一社会信用代码', '前十大股东']);
    expect(src.entity_ids).toEqual([r.entity_id]);
    expect(src.title).toContain('中际旭创');
  });

  it('re-running with new text mints v2 that supersedes v1', async () => {
    const v1 = await ingestDiligence(ctx, base);
    const v2 = await ingestDiligence(ctx, { ...base, markdown: base.markdown + '\n\n（更新版）' });
    expect(v2.version).toBe(2);
    expect(v2.duplicate).toBe(false);
    const src2 = store.rows('research_source_documents').find((s: any) => s.id === v2.id) as any;
    expect(src2.metadata.supersedes).toBe(v1.id);
    // still exactly one COMPANY entity (find-or-create, not duplicated)
    expect(store.rows('research_entities').filter((e: any) => e.ticker === '300308.SZ')).toHaveLength(1);
  });

  it('identical brief text is a duplicate, no new version minted', async () => {
    const v1 = await ingestDiligence(ctx, base);
    const again = await ingestDiligence(ctx, base);
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe(v1.id);
    expect(again.version).toBe(1);
    // only one diligence source exists
    const dilig = store.rows('research_source_documents').filter((s: any) => s.metadata?.kind === 'diligence');
    expect(dilig).toHaveLength(1);
    expect(contentHash(base.markdown)).toBe((dilig[0] as any).content_hash);
  });

  it('rejects missing ticker or empty markdown', async () => {
    await expect(ingestDiligence(ctx, { ...base, ticker: '  ' })).rejects.toThrow(/ticker/);
    await expect(ingestDiligence(ctx, { ...base, markdown: '' })).rejects.toThrow(/markdown/);
  });
});
