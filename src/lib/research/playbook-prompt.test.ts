import { describe, it, expect } from 'vitest';
import {
  buildPlaybookSuggestPrompt,
  validatePlaybookSuggestion,
} from './playbook-prompt';
import { AXIOM_SEEDS } from './seed';
import type { Axiom, InvestmentMemo, Signal, Thesis } from './types';

function mkThesis(overrides: Partial<Thesis> = {}): Thesis {
  return {
    id: 't-1',
    title: 'NVIDIA 推理需求可持续增长',
    body: '推理 token 经济学支撑数据中心 capex。',
    company_ids: [], theme_ids: [], supporting_evidence_ids: [],
    invalidation_conditions: ['token 单价跌破成本线'],
    watch_metrics: ['NVDA DC 营收 QoQ'],
    status: 'WATCH',
    next_review_at: '2026-07-18',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function mkMemo(): InvestmentMemo {
  return {
    id: 'm-1',
    title: 'ASML 订单周期 memo',
    company_ids: [], theme_ids: [],
    one_line_conclusion: 'EUV 订单进入上行周期',
    thesis: '先进制程扩产驱动。',
    supporting_evidence: [{ claim: '订单积压增长', source_document_ids: ['s-1'] }],
    counter_arguments: [{ claim: '出口管制风险', source_document_ids: ['s-2'] }],
    key_variables: ['EUV ASP'],
    invalidation_conditions: ['订单连续两季下滑'],
    open_questions: ['China 需求占比'],
    related_impacts: [],
    confidence: 'MEDIUM',
    axiom_check_results: [],
    provenance: {},
    status: 'REVIEWED',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
  };
}

function mkSignal(id: string, title: string): Signal {
  return {
    id, title, summary: `${title} 摘要`,
    signal_type: 'MODEL_USAGE', direction: 'POSITIVE', confidence: 'MEDIUM',
    entity_ids: [], source_document_ids: [], affected_company_ids: [],
    research_questions: [], metadata: {}, llm_provenance: {},
    created_at: '2026-07-03T00:00:00Z',
  };
}

const AXIOMS: Axiom[] = AXIOM_SEEDS.map((a, i) => ({
  id: `ax-${i}`, code: a.code, title: a.title, description: a.description,
  severity: a.severity, enabled: true, created_at: '2026-07-01T00:00:00Z',
}));

describe('buildPlaybookSuggestPrompt', () => {
  it('injects thesis full text, watch metrics and invalidation conditions', () => {
    const p = buildPlaybookSuggestPrompt({
      source: { kind: 'thesis', thesis: mkThesis() },
      recentSignals: [mkSignal('sig-1', 'token 增速放缓')],
      axioms: AXIOMS,
    });
    expect(p.user).toContain('NVIDIA 推理需求可持续增长');
    expect(p.user).toContain('token 单价跌破成本线');
    expect(p.user).toContain('NVDA DC 营收 QoQ');
    expect(p.user).toContain('sig-1');
    expect(p.user).toContain('token 增速放缓');
    expect(p.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('injects memo sections including counter-arguments and invalidation conditions', () => {
    const p = buildPlaybookSuggestPrompt({
      source: { kind: 'memo', memo: mkMemo() },
      recentSignals: [],
      axioms: AXIOMS,
    });
    expect(p.user).toContain('ASML 订单周期 memo');
    expect(p.user).toContain('出口管制风险');
    expect(p.user).toContain('订单连续两季下滑');
    expect(p.user).toContain('（无新 signal）');
  });

  it('injects the five axiom texts and the mandatory guardrail language', () => {
    const p = buildPlaybookSuggestPrompt({
      source: { kind: 'thesis', thesis: mkThesis() },
      recentSignals: [],
      axioms: AXIOMS,
    });
    for (const a of AXIOM_SEEDS) expect(p.user).toContain(a.code);
    // Uncertain → RESEARCH_MORE; no real trading; research aid, not advice.
    expect(p.system).toContain('RESEARCH_MORE');
    expect(p.system).toContain('真实交易');
    expect(p.system).toContain('不是投资建议');
    // All five actions enumerated in the schema.
    for (const action of ['WATCHLIST', 'PAPER_TRADE', 'RESEARCH_MORE', 'UPDATE_THESIS', 'CLOSE_THESIS']) {
      expect(p.system).toContain(action);
    }
  });

  it('skips disabled axioms and hashes deterministically per input', () => {
    const disabled = AXIOMS.map((a) => ({ ...a, enabled: a.code !== 'AX002' }));
    const p1 = buildPlaybookSuggestPrompt({
      source: { kind: 'thesis', thesis: mkThesis() }, recentSignals: [], axioms: disabled,
    });
    expect(p1.user).not.toContain('AX002');
    const p2 = buildPlaybookSuggestPrompt({
      source: { kind: 'thesis', thesis: mkThesis() }, recentSignals: [], axioms: disabled,
    });
    expect(p2.prompt_sha256).toBe(p1.prompt_sha256);
    const p3 = buildPlaybookSuggestPrompt({
      source: { kind: 'thesis', thesis: mkThesis({ title: '别的 thesis' }) },
      recentSignals: [], axioms: disabled,
    });
    expect(p3.prompt_sha256).not.toBe(p1.prompt_sha256);
  });
});

describe('validatePlaybookSuggestion', () => {
  it('passes a valid suggestion through', () => {
    const s = validatePlaybookSuggestion({
      proposed_action: 'WATCHLIST',
      rationale: ' 值得跟踪 ',
      risks: ['需求不及预期', '估值过高'],
      confidence_note: '中等置信',
    })!;
    expect(s.proposed_action).toBe('WATCHLIST');
    expect(s.rationale).toBe('值得跟踪');
    expect(s.risks).toEqual(['需求不及预期', '估值过高']);
    expect(s.confidence_note).toBe('中等置信');
    expect(s.metadata).toEqual({});
  });

  it('downgrades a non-enum action to RESEARCH_MORE and records it in metadata', () => {
    const s = validatePlaybookSuggestion({
      proposed_action: 'BUY_NOW',
      rationale: 'r', risks: ['x', 'y'], confidence_note: 'c',
    })!;
    expect(s.proposed_action).toBe('RESEARCH_MORE');
    expect(s.metadata.downgraded_from).toBe('BUY_NOW');
  });

  it('returns null for garbage and filters non-string risks', () => {
    expect(validatePlaybookSuggestion(null)).toBeNull();
    expect(validatePlaybookSuggestion('nope')).toBeNull();
    const s = validatePlaybookSuggestion({
      proposed_action: 'RESEARCH_MORE',
      rationale: 'r',
      risks: ['ok', 42, '', '  trimmed  '],
      confidence_note: 'c',
    })!;
    expect(s.risks).toEqual(['ok', 'trimmed']);
  });
});
