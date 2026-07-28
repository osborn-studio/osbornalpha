import { describe, it, expect } from 'vitest';
import {
  DEAL_MEMO_SCHEMA,
  DEAL_SECTION_FRAMEWORK,
  buildDealMemoPrompt,
  validateDealMemoDraft,
  emptyDealValuation,
} from './deal-memo-prompt';
import type { SourceDocument } from './types';

function src(id: string, opts: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    source_type: 'NOTE',
    title: `Source ${id}`,
    ingested_at: '2026-07-01T00:00:00.000Z',
    raw_text: `body of ${id}`,
    content_hash: `hash-${id}`,
    trust_level: 'MEDIUM',
    entity_ids: [],
    ...opts,
  };
}

describe('DEAL_MEMO_SCHEMA', () => {
  it('carries all 8 valuation fields structurally', () => {
    for (const field of [
      'valuation_basis',
      'entry_valuation',
      'ownership_and_dilution',
      'return_profile',
      'exit_assumptions',
      'sensitivity',
      'valuation_risks',
      'public_market_crosscheck',
    ]) {
      expect(DEAL_MEMO_SCHEMA).toContain(field);
    }
    // entry_valuation sub-fields present in schema text.
    for (const sub of ['pre_money', 'post_money', 'ev', 'per_share', 'transaction_value', 'currency']) {
      expect(DEAL_MEMO_SCHEMA).toContain(sub);
    }
    // recommendation verdict enum spelled out.
    expect(DEAL_MEMO_SCHEMA).toContain('invest');
    expect(DEAL_MEMO_SCHEMA).toContain('conditional');
    // 8 sections framework carried.
    expect(DEAL_SECTION_FRAMEWORK).toHaveLength(8);
  });
});

describe('buildDealMemoPrompt', () => {
  it('injects the 8-section framework and primary-market valuation doctrine', () => {
    const p = buildDealMemoPrompt({
      target: '示例并购标的',
      deal_context: '现金收购 60% 股权，估值 30 亿',
      sources: [src('s1'), src('s2', { title: '尽调简报' })],
    });
    // System injects the eight sections.
    expect(p.system).toContain('交易结构与条款');
    expect(p.system).toContain('投资建议');
    // Primary-market valuation keywords are present in the prompt text.
    expect(p.system).toContain('pre_money');
    expect(p.system).toContain('可比交易');
    expect(p.system).toContain('退出倍数');
    // Secondary market is crosscheck only, must not override primary logic.
    expect(p.system).toMatch(/交叉验证|crosscheck/);
    expect(p.system).toContain('不覆盖');
    // Human gate + valuation-not-hand-computed doctrine.
    expect(p.system).toContain('AI 初稿');
    expect(p.system).toContain('DCF');
    // deal_context is authoritative.
    expect(p.system).toContain('权威');
    // User carries target, deal_context, and the source manifest.
    expect(p.user).toContain('示例并购标的');
    expect(p.user).toContain('现金收购 60% 股权');
    expect(p.user).toContain('s1');
    expect(p.user).toContain('尽调简报');
    expect(p.source_document_ids).toEqual(['s1', 's2']);
    expect(p.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles no deal_context and no sources gracefully', () => {
    const p = buildDealMemoPrompt({ target: '裸标的' });
    expect(p.user).toContain('裸标的');
    expect(p.source_document_ids).toEqual([]);
    expect(p.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is hash-stable for identical inputs', () => {
    const a = buildDealMemoPrompt({ target: 'X', deal_context: 'terms', sources: [src('s1')] });
    const b = buildDealMemoPrompt({ target: 'X', deal_context: 'terms', sources: [src('s1')] });
    expect(a.prompt_sha256).toBe(b.prompt_sha256);
  });
});

describe('validateDealMemoDraft', () => {
  it('forces all 8 sections present, backfilling empty shells for missing ones', () => {
    const draft = validateDealMemoDraft({
      title: '投资上会报告 · 示例',
      sections: [{ id: 's1', title: '项目概述与交易标的', body_md: 'body' }],
      recommendation: { verdict: 'invest', rationale: '值得' },
      valuation: {},
    });
    expect(draft.sections).toHaveLength(8);
    // First section preserved; the rest are empty shells.
    expect(draft.sections[0].title).toBe('项目概述与交易标的');
    expect(draft.sections[0].tags).toEqual({ facts: [], assumptions: [], inferences: [] });
    for (const s of draft.sections) {
      expect(s.tags).toEqual(expect.objectContaining({ facts: expect.any(Array) }));
    }
  });

  it('backfills the full 8-field valuation structure even from an empty object', () => {
    const draft = validateDealMemoDraft({ valuation: {} });
    const v = draft.valuation;
    expect(v.valuation_basis).toEqual([]);
    expect(v.entry_valuation).toEqual(emptyDealValuation().entry_valuation);
    expect(v.ownership_and_dilution).toBeDefined();
    expect(v.return_profile.scenarios).toBeDefined();
    expect(v.exit_assumptions.paths).toEqual([]);
    expect(v.sensitivity).toEqual([]);
    expect(v.valuation_risks).toEqual([]);
    expect(v.public_market_crosscheck).toEqual({ applicable: false, comps: [], note: null });
  });

  it('preserves supplied valuation values and coerces numeric entry fields', () => {
    const draft = validateDealMemoDraft({
      valuation: {
        valuation_basis: ['DCF', '可比交易'],
        entry_valuation: { pre_money: 2800, post_money: 3000, currency: 'CNY', per_share: null },
        return_profile: { irr: 0.25, moic: 3.2, payback: '5年', scenarios: { base: 'base案', upside: null } },
        exit_assumptions: { paths: [{ type: 'IPO', window: '3-4年' }, { type: '并购转让' }] },
        sensitivity: [{ variable: '退出倍数', effect: '±20%' }],
        valuation_risks: [{ risk: '周期下行', mitigant: '对赌条款' }],
        public_market_crosscheck: { applicable: true, comps: [{ ticker: 'NVDA', multiple: '30x' }], note: '仅参考' },
      },
    });
    const v = draft.valuation;
    expect(v.valuation_basis).toEqual(['DCF', '可比交易']);
    expect(v.entry_valuation.pre_money).toBe(2800);
    expect(v.entry_valuation.currency).toBe('CNY');
    expect(v.return_profile.irr).toBe(0.25);
    expect(v.return_profile.scenarios?.base).toBe('base案');
    expect(v.exit_assumptions.paths).toEqual([{ type: 'IPO', window: '3-4年' }, { type: '并购转让', window: null }]);
    expect(v.sensitivity).toEqual([{ variable: '退出倍数', effect: '±20%' }]);
    expect(v.public_market_crosscheck.applicable).toBe(true);
    expect(v.public_market_crosscheck.comps[0].ticker).toBe('NVDA');
  });

  it('rejects an illegal verdict, defaulting to conditional', () => {
    const draft = validateDealMemoDraft({ recommendation: { verdict: 'YOLO', rationale: 'x' } });
    expect(draft.recommendation.verdict).toBe('conditional');
    expect(draft.recommendation.conditions).toEqual([]);
  });

  it('keeps a valid verdict and normalizes conditions to a string array', () => {
    const draft = validateDealMemoDraft({
      recommendation: { verdict: 'pass', conditions: ['补尽调', '', 123, '复核估值'], rationale: '不投' },
    });
    expect(draft.recommendation.verdict).toBe('pass');
    expect(draft.recommendation.conditions).toEqual(['补尽调', '复核估值']);
    expect(draft.recommendation.rationale).toBe('不投');
  });

  it('defaults title and survives null/garbage input', () => {
    const d1 = validateDealMemoDraft(null);
    expect(d1.title).toBe('投资上会报告（草稿）');
    expect(d1.sections).toHaveLength(8);
    expect(d1.valuation.valuation_basis).toEqual([]);
    const d2 = validateDealMemoDraft({ title: '   ' });
    expect(d2.title).toBe('投资上会报告（草稿）');
  });
});
