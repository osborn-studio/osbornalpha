import { describe, it, expect } from 'vitest';
import { checkCardAxioms, checkMemoAxioms, hasBlockingFailure, type MemoForCheck } from './axioms';
import { AXIOM_SEEDS } from './seed';
import type { Axiom, SourceDocument } from './types';

const AXIOMS: Axiom[] = AXIOM_SEEDS.map((a, i) => ({
  id: `ax-${i}`,
  code: a.code,
  title: a.title,
  description: a.description,
  severity: a.severity,
  enabled: true,
  created_at: '2026-07-04T00:00:00.000Z',
}));

function src(id: string, trust: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): SourceDocument {
  return {
    id,
    source_type: 'NEWS',
    title: `source ${id}`,
    ingested_at: '2026-07-04T00:00:00.000Z',
    raw_text: 'text',
    content_hash: `hash-${id}`,
    trust_level: trust,
    entity_ids: [],
  };
}

function memo(overrides: Partial<MemoForCheck> = {}): MemoForCheck {
  return {
    one_line_conclusion: 'NVIDIA 推理需求持续超预期',
    thesis: '数据中心 GPU 供不应求将持续到 2027。',
    supporting_evidence: [
      { claim: 'DC 营收创新高', source_document_ids: ['s1'] },
      { claim: '云厂商 capex 上调', source_document_ids: ['s2'] },
    ],
    counter_arguments: [{ claim: 'ASIC 替代风险', source_document_ids: ['s3'] }],
    invalidation_conditions: ['推理单价季度环比下滑超 30%'],
    confidence: 'MEDIUM',
    ...overrides,
  };
}

function result(results: ReturnType<typeof checkMemoAxioms>, code: string) {
  return results.find((r) => r.axiom_code === code)!;
}

const SOURCES = [src('s1'), src('s2'), src('s3')];

describe('AX001 — invalidation conditions required', () => {
  it('fails without invalidation conditions', () => {
    const r = result(checkMemoAxioms(memo({ invalidation_conditions: [] }), SOURCES, AXIOMS), 'AX001');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('BLOCK');
  });

  it('ignores whitespace-only conditions but passes real ones', () => {
    expect(result(checkMemoAxioms(memo({ invalidation_conditions: ['  '] }), SOURCES, AXIOMS), 'AX001').passed).toBe(false);
    expect(result(checkMemoAxioms(memo(), SOURCES, AXIOMS), 'AX001').passed).toBe(true);
  });
});

describe('AX002 — HIGH confidence needs >=3 independent citations', () => {
  it('fails HIGH memo citing fewer than 3 distinct sources', () => {
    const m = memo({
      confidence: 'HIGH',
      supporting_evidence: [
        { claim: 'a', source_document_ids: ['s1'] },
        { claim: 'b', source_document_ids: ['s1'] }, // same source, not independent
      ],
      counter_arguments: [{ claim: 'c', source_document_ids: ['s2'] }],
    });
    const r = result(checkMemoAxioms(m, SOURCES, AXIOMS), 'AX002');
    expect(r.passed).toBe(false);
  });

  it('passes HIGH with 3 distinct sources, and any MEDIUM/LOW memo', () => {
    expect(result(checkMemoAxioms(memo({ confidence: 'HIGH' }), SOURCES, AXIOMS), 'AX002').passed).toBe(true);
    expect(result(checkMemoAxioms(memo({ confidence: 'MEDIUM', supporting_evidence: [] , counter_arguments: []}), SOURCES, AXIOMS), 'AX002').passed).toBe(true);
  });
});

describe('AX003 — counter-arguments required', () => {
  it('fails without counter-arguments', () => {
    const r = result(checkMemoAxioms(memo({ counter_arguments: [] }), SOURCES, AXIOMS), 'AX003');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('BLOCK');
  });

  it('empty-claim counter-arguments do not count; real one passes', () => {
    expect(result(checkMemoAxioms(memo({ counter_arguments: [{ claim: ' ', source_document_ids: [] }] }), SOURCES, AXIOMS), 'AX003').passed).toBe(false);
    expect(result(checkMemoAxioms(memo(), SOURCES, AXIOMS), 'AX003').passed).toBe(true);
  });
});

describe('AX004 — single LOW-trust source evidence (WARN)', () => {
  it('warns when evidence relies on exactly one LOW-trust source', () => {
    const m = memo({
      supporting_evidence: [{ claim: '传闻某大单', source_document_ids: ['low1'] }],
    });
    const r = result(checkMemoAxioms(m, [...SOURCES, src('low1', 'LOW')], AXIOMS), 'AX004');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('WARN');
    expect(r.message).toContain('传闻某大单');
  });

  it('passes when the single source is MEDIUM/HIGH trust or evidence has multiple sources', () => {
    const multi = memo({
      supporting_evidence: [{ claim: 'x', source_document_ids: ['low1', 's1'] }],
    });
    expect(result(checkMemoAxioms(multi, [...SOURCES, src('low1', 'LOW')], AXIOMS), 'AX004').passed).toBe(true);
    expect(result(checkMemoAxioms(memo(), SOURCES, AXIOMS), 'AX004').passed).toBe(true);
  });
});

describe('AX005 — profit-promise language blocked', () => {
  it.each(['必涨', '保证', '稳赚', '无风险'])('blocks conclusion containing %s', (word) => {
    const m = memo({ one_line_conclusion: `这只股票${word}` });
    const r = result(checkMemoAxioms(m, SOURCES, AXIOMS), 'AX005');
    expect(r.passed).toBe(false);
    expect(r.severity).toBe('BLOCK');
  });

  it('also scans the thesis body, passes clean text', () => {
    expect(result(checkMemoAxioms(memo({ thesis: '长期稳赚不赔' }), SOURCES, AXIOMS), 'AX005').passed).toBe(false);
    expect(result(checkMemoAxioms(memo(), SOURCES, AXIOMS), 'AX005').passed).toBe(true);
  });
});

describe('checkMemoAxioms plumbing', () => {
  it('skips disabled and unknown axioms', () => {
    const withExtra: Axiom[] = [
      ...AXIOMS.map((a) => (a.code === 'AX005' ? { ...a, enabled: false } : a)),
      { ...AXIOMS[0], id: 'x', code: 'AX999' },
    ];
    const results = checkMemoAxioms(memo(), SOURCES, withExtra);
    expect(results.map((r) => r.axiom_code)).toEqual(['AX001', 'AX002', 'AX003', 'AX004']);
  });

  it('hasBlockingFailure ignores WARN failures', () => {
    const warnOnly = [{ axiom_code: 'AX004', severity: 'WARN' as const, passed: false, message: '' }];
    expect(hasBlockingFailure(warnOnly)).toBe(false);
    const block = [...warnOnly, { axiom_code: 'AX001', severity: 'BLOCK' as const, passed: false, message: '' }];
    expect(hasBlockingFailure(block)).toBe(true);
  });
});

describe('AX006 — change cards may not contain trading advice (WP-A8 §7.5)', () => {
  const card = (texts: string[]) => texts.map((text, i) => ({ id: `a${i}`, text }));
  it('blocks buy/sell/position/target-price language anywhere in the card', () => {
    for (const bad of ['建议买入并加仓', '目标价 120 元', '仓位控制在三成', '短线做空', '止损位 80', '抄底时机']) {
      const r = checkCardAxioms({ title: 'x', assertions: card([bad]) }, AXIOMS);
      expect(result(r, 'AX006').passed, bad).toBe(false);
      expect(hasBlockingFailure(r), bad).toBe(true);
    }
    expect(result(checkCardAxioms({ title: '必涨的机会', assertions: [] }, AXIOMS), 'AX005').passed).toBe(false);
  });
  it('passes analytical language and reports both card axioms only', () => {
    const r = checkCardAxioms({ title: '推理需求转向', assertions: card(['数据中心营收同比增长 50%', '市场可能低估毛利率韧性']) }, AXIOMS);
    expect(r.map((x) => x.axiom_code).sort()).toEqual(['AX005', 'AX006']);
    expect(hasBlockingFailure(r)).toBe(false);
  });
});
