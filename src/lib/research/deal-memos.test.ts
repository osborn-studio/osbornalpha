import { describe, it, expect, beforeEach } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { upsertEntity } from './entities';
import { ingestSource } from './sources';
import {
  generateDealMemo,
  dealGate,
  DealMemoError,
  type DealLlmFn,
} from './deal-memos';
import { listMemos, getMemo } from './memos';
import type { DealMemoDraft } from './types';

let ctx: ResearchCtx;
let store: MockStore;

beforeEach(() => {
  ({ ctx, store } = makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore });
});

function fakeLlm(payload: unknown): DealLlmFn {
  return async () => ({ content: JSON.stringify(payload), model: 'fake-deal-model' });
}

/** A complete deal-memo LLM payload that clears the deal gate. */
function goodPayload(): DealMemoDraft {
  return {
    title: '投资上会报告 · 示例并购标的',
    sections: [
      { id: 'overview', title: '项目概述与交易标的', body_md: '现金收购 60%', tags: { facts: ['尽调已完成'], assumptions: [], inferences: [] } },
    ] as any,
    recommendation: { verdict: 'invest', conditions: [], rationale: '战略协同显著' },
    valuation: {
      valuation_basis: ['DCF', '可比交易'],
      entry_valuation: { pre_money: 2800, post_money: 3000, currency: 'CNY' } as any,
      ownership_and_dilution: { stake_pct: 60 } as any,
      return_profile: { irr: 0.25, moic: 3.2, payback: '5年', scenarios: { base: 'base' } } as any,
      exit_assumptions: { paths: [{ type: 'IPO', window: '3-4年' }] },
      sensitivity: [{ variable: '退出倍数', effect: '±20%' }],
      valuation_risks: [{ risk: '周期', mitigant: '对赌' }],
      public_market_crosscheck: { applicable: false, comps: [], note: null },
    } as any,
  };
}

describe('dealGate', () => {
  it('passes when verdict + a return metric + an exit path are all present', () => {
    const g = dealGate(goodPayload());
    expect(g.ok).toBe(true);
    expect(g.missing).toEqual([]);
  });

  it('flags a missing return metric (all of irr/moic/payback/scenarios empty)', () => {
    const p = goodPayload();
    p.valuation.return_profile = { irr: null, moic: null, payback: null, scenarios: { base: null, upside: null, downside: null } } as any;
    const g = dealGate(p);
    expect(g.ok).toBe(false);
    expect(g.missing).toContain('return_profile');
  });

  it('accepts a scenario-only return profile', () => {
    const p = goodPayload();
    p.valuation.return_profile = { irr: null, moic: null, payback: null, scenarios: { base: 'base案', upside: null, downside: null } } as any;
    expect(dealGate(p).ok).toBe(true);
  });

  it('flags a missing exit path', () => {
    const p = goodPayload();
    p.valuation.exit_assumptions = { paths: [] };
    const g = dealGate(p);
    expect(g.ok).toBe(false);
    expect(g.missing).toContain('exit_assumptions');
  });
});

describe('generateDealMemo', () => {
  it('persists a DRAFT deal memo with sections/recommendation/valuation, provenance, audit', async () => {
    const res = await generateDealMemo(ctx, { target: '示例并购标的', deal_context: '现金收购 60%' }, fakeLlm(goodPayload()));
    expect(res.error).toBeUndefined();
    const memo = res.memo!;
    expect(memo.memo_type).toBe('deal');
    expect(memo.status).toBe('DRAFT');
    expect(memo.deal_context).toBe('现金收购 60%');
    // 8 sections always present (backfilled).
    expect(memo.sections).toHaveLength(8);
    // Recommendation + full 8-field valuation carried.
    expect(memo.recommendation!.verdict).toBe('invest');
    expect(memo.valuation!.valuation_basis).toEqual(['DCF', '可比交易']);
    expect(memo.valuation!.entry_valuation.pre_money).toBe(2800);
    expect(memo.valuation!.public_market_crosscheck).toEqual({ applicable: false, comps: [], note: null });
    // Gate result surfaced (not a 422).
    expect(res.gate!.ok).toBe(true);
    // Provenance complete.
    expect(memo.provenance.model).toBe('fake-deal-model');
    expect(memo.provenance.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(memo.provenance.generated_at).toBeTruthy();
    // Row shape in the store: memo_type column + thesis columns left empty.
    const row = store.rows('research_memos')[0];
    expect(row.memo_type).toBe('deal');
    expect(row.sections).toHaveLength(8);
    expect(row.one_line_conclusion == null || row.one_line_conclusion === '').toBe(true);
    // Audit trail.
    const audit = store.rows('research_audit_log').filter((a) => a.action === 'memo.generate_deal');
    expect(audit).toHaveLength(1);
    expect(audit[0].object_id).toBe(memo.id);
  });

  it('stores a DRAFT even when the gate is incomplete, surfacing the gate result', async () => {
    const p = goodPayload();
    p.valuation.exit_assumptions = { paths: [] };
    p.valuation.return_profile = { irr: null, moic: null, payback: null, scenarios: { base: null, upside: null, downside: null } } as any;
    const res = await generateDealMemo(ctx, { target: '不完整标的' }, fakeLlm(p));
    expect(res.memo).toBeTruthy();
    expect(res.memo!.status).toBe('DRAFT');
    expect(res.gate!.ok).toBe(false);
    expect(res.gate!.missing).toEqual(expect.arrayContaining(['return_profile', 'exit_assumptions']));
    expect(store.count('research_memos')).toBe(1);
  });

  it('binds an entity_id and its sources when provided', async () => {
    const entityId = await upsertEntity(ctx, { type: 'COMPANY', name: '标的公司', ticker: 'TGT' });
    await ingestSource(ctx, {
      source_type: 'NOTE', title: '尽调简报', raw_text: '标的尽调材料', entity_ids: [entityId],
    });
    const res = await generateDealMemo(ctx, { target: '标的公司', entity_id: entityId }, fakeLlm(goodPayload()));
    expect(res.memo!.company_ids).toEqual([entityId]);
    // The entity's source was injected into the prompt provenance.
    expect(res.memo!.provenance.source_document_ids!.length).toBe(1);
  });

  it('generates even with no material for the target (研究对象)', async () => {
    const res = await generateDealMemo(ctx, { target: '无材料标的' }, fakeLlm(goodPayload()));
    expect(res.memo).toBeTruthy();
    expect(res.memo!.provenance.source_document_ids).toEqual([]);
  });

  it('returns a structured error (no crash) on LLM failure / no key / bad JSON', async () => {
    const noKey: DealLlmFn = async () => { throw new Error('No LLM provider configured (set DEEPSEEK_API_KEY)'); };
    const r1 = await generateDealMemo(ctx, { target: 'X' }, noKey);
    expect(r1.memo).toBeUndefined();
    expect(r1.error!.source).toBe('no-key');

    const broken: DealLlmFn = async () => { throw new Error('upstream 500'); };
    const r2 = await generateDealMemo(ctx, { target: 'X' }, broken);
    expect(r2.error!.source).toBe('error');

    const garbage: DealLlmFn = async () => ({ content: 'not json', model: 'm' });
    const r3 = await generateDealMemo(ctx, { target: 'X' }, garbage);
    expect(r3.error!.source).toBe('error');

    expect(store.count('research_memos')).toBe(0);
  });

  it('is read back through listMemos/getMemo with its deal fields intact (T4)', async () => {
    const res = await generateDealMemo(ctx, { target: '示例标的', deal_context: '现金收购' }, fakeLlm(goodPayload()));
    const id = res.memo!.id;
    const listed = (await listMemos(ctx)).find((m) => m.id === id)!;
    expect(listed.memo_type).toBe('deal');
    expect(listed.sections).toHaveLength(8);
    expect(listed.recommendation!.verdict).toBe('invest');
    expect(listed.valuation!.valuation_basis).toEqual(['DCF', '可比交易']);
    const got = await getMemo(ctx, id);
    expect(got!.memo_type).toBe('deal');
    expect(got!.deal_context).toBe('现金收购');
    expect(got!.valuation!.entry_valuation.pre_money).toBe(2800);
  });

  it('validates target length and deal_context length', async () => {
    await expect(generateDealMemo(ctx, { target: '' }, fakeLlm(goodPayload()))).rejects.toThrow(DealMemoError);
    await expect(generateDealMemo(ctx, { target: 'x'.repeat(101) }, fakeLlm(goodPayload()))).rejects.toThrow(DealMemoError);
    await expect(
      generateDealMemo(ctx, { target: 'ok', deal_context: 'y'.repeat(2001) }, fakeLlm(goodPayload())),
    ).rejects.toThrow(DealMemoError);
  });
});
