import { describe, it, expect } from 'vitest';
import {
  buildEvalGenPrompt,
  buildEvalJudgePrompt,
  validateJudgeVerdict,
  computeWeightedTotal,
  EVAL_DIMENSION_GUIDE,
} from './eval-prompt';
import { MEMO_OUTPUT_SCHEMA } from './memo-prompt';
import { DEFAULT_EVAL_RUBRIC, type EvalCase, type MemoDraft, type SourceDocument } from './types';

const evalCase: EvalCase = {
  id: 'case-1',
  title: 'NVIDIA 2026Q1 财报后判断',
  as_of: '2026-05-29',
  visible_material: ['s1', 's2'],
  expected: { notes: '随后一季 DC 营收继续超预期，但中国区受出口管制拖累。' },
  outcome: '',
  rubric: { ...DEFAULT_EVAL_RUBRIC },
  created_at: '2026-07-04T00:00:00.000Z',
};

function src(id: string, opts: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    source_type: 'NEWS',
    title: `Source ${id}`,
    ingested_at: '2026-05-01T00:00:00.000Z',
    raw_text: `body of ${id}`,
    content_hash: `hash-${id}`,
    trust_level: 'MEDIUM',
    entity_ids: [],
    ...opts,
  };
}

const memo: MemoDraft = {
  title: 'NVDA memo',
  one_line_conclusion: '数据中心需求仍然强劲',
  thesis: '推理需求支撑 capex',
  supporting_evidence: [{ claim: 'DC 营收环比增长', source_document_ids: ['s1'] }],
  counter_arguments: [{ claim: 'ASIC 替代风险', source_document_ids: ['s2'] }],
  key_variables: ['token 单价'],
  invalidation_conditions: ['DC 营收连续两季下滑'],
  open_questions: ['中国区管制影响多大？'],
  related_impacts: ['TSMC 产能'],
  confidence: 'MEDIUM',
};

describe('buildEvalGenPrompt', () => {
  it('injects the time-box instruction with the case as_of date', () => {
    const p = buildEvalGenPrompt(evalCase, [src('s1'), src('s2')]);
    expect(p.system).toContain('假设今天是 2026-05-29');
    expect(p.system).toContain('LOW_CONFIDENCE');
    // 只准使用提供材料 — knowledge outside the material is forbidden.
    expect(p.system).toContain('只准使用');
  });

  it('reuses the §4.4 memo output schema constant verbatim (no fork)', () => {
    const p = buildEvalGenPrompt(evalCase, [src('s1')]);
    expect(p.system).toContain(MEMO_OUTPUT_SCHEMA);
  });

  it('injects the source manifest + corpus and returns injected ids', () => {
    const p = buildEvalGenPrompt(evalCase, [src('s1'), src('s2')]);
    expect(p.user).toContain('- s1 | NEWS | trust=MEDIUM | Source s1');
    expect(p.user).toContain('<source id="s2"');
    expect(p.source_document_ids).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(p.user).toContain(evalCase.title);
  });

  it('is hash-stable and sensitive to the case', () => {
    const a = buildEvalGenPrompt(evalCase, [src('s1')]);
    const b = buildEvalGenPrompt(evalCase, [src('s1')]);
    expect(a.prompt_sha256).toBe(b.prompt_sha256);
    expect(a.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    const c = buildEvalGenPrompt({ ...evalCase, as_of: '2026-01-01' }, [src('s1')]);
    expect(c.prompt_sha256).not.toBe(a.prompt_sha256);
  });
});

describe('buildEvalJudgePrompt', () => {
  it('sees only agent output + expected + rubric — never the gen prompt or corpus', () => {
    const gen = buildEvalGenPrompt(evalCase, [src('s1'), src('s2')]);
    const j = buildEvalJudgePrompt(memo, evalCase, evalCase.rubric);
    // Separated roles: the judge system prompt is a different prompt entirely.
    expect(j.system).not.toBe(gen.system);
    expect(j.system).not.toContain('假设今天是');
    expect(j.user).not.toContain('假设今天是');
    // The judge never sees the raw source corpus.
    expect(j.user).not.toContain('<source id=');
    expect(j.user).not.toContain('body of s1');
    // But it sees the output, expected notes and rubric dimensions.
    expect(j.user).toContain('DC 营收环比增长');
    expect(j.user).toContain(evalCase.expected.notes);
    for (const dim of Object.keys(evalCase.rubric)) {
      expect(j.user).toContain(dim);
    }
  });

  it('injects rubric weights and dimension guides, and demands strictness on uncited claims', () => {
    const rubric = { factual_accuracy: 2, custom_dim: 1 };
    const j = buildEvalJudgePrompt(memo, evalCase, rubric);
    expect(j.user).toContain('factual_accuracy');
    expect(j.user).toContain(EVAL_DIMENSION_GUIDE.factual_accuracy);
    expect(j.user).toContain('custom_dim');
    expect(j.system).toContain('从严');
    expect(j.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes the outcome record when present', () => {
    const j = buildEvalJudgePrompt(memo, { ...evalCase, outcome: '实际上 DC 营收 miss 了' }, evalCase.rubric);
    expect(j.user).toContain('实际上 DC 营收 miss 了');
  });
});

describe('validateJudgeVerdict', () => {
  const rubric = { factual_accuracy: 1, overconfidence: 1 };

  it('accepts a complete verdict and keeps only rubric-keyed scores', () => {
    const v = validateJudgeVerdict({
      scores: { factual_accuracy: 8, overconfidence: 6, invented: 3 },
      failure_modes: ['missed_china_risk'],
      rationale_per_dimension: { factual_accuracy: 'ok', overconfidence: 'mild' },
    }, rubric);
    expect(v).not.toBeNull();
    expect(v!.scores).toEqual({ factual_accuracy: 8, overconfidence: 6 });
    expect(v!.failure_modes).toEqual(['missed_china_risk']);
    expect(v!.rationale_per_dimension.factual_accuracy).toBe('ok');
  });

  it('rejects verdicts with a missing or non-numeric rubric dimension', () => {
    expect(validateJudgeVerdict({ scores: { factual_accuracy: 8 } }, rubric)).toBeNull();
    expect(validateJudgeVerdict({
      scores: { factual_accuracy: 8, overconfidence: 'high' },
    }, rubric)).toBeNull();
    expect(validateJudgeVerdict(null, rubric)).toBeNull();
    expect(validateJudgeVerdict({ failure_modes: [] }, rubric)).toBeNull();
  });

  it('clamps out-of-range scores to 0-10 and records judge_out_of_range', () => {
    const v = validateJudgeVerdict({
      scores: { factual_accuracy: 14, overconfidence: -2 },
      failure_modes: [],
    }, rubric);
    expect(v).not.toBeNull();
    expect(v!.scores).toEqual({ factual_accuracy: 10, overconfidence: 0 });
    expect(v!.failure_modes).toContain('judge_out_of_range');
  });

  it('sanitizes malformed failure_modes / rationale payloads', () => {
    const v = validateJudgeVerdict({
      scores: { factual_accuracy: 5, overconfidence: 5 },
      failure_modes: 'not-an-array',
      rationale_per_dimension: 'nope',
    }, rubric);
    expect(v).not.toBeNull();
    expect(v!.failure_modes).toEqual([]);
    expect(v!.rationale_per_dimension).toEqual({});
  });
});

describe('computeWeightedTotal', () => {
  it('computes the equal-weight mean', () => {
    expect(computeWeightedTotal(
      { a: 8, b: 6 },
      { a: 1, b: 1 },
    )).toBe(7);
  });

  it('respects weights and rounds to 2 decimals', () => {
    expect(computeWeightedTotal(
      { a: 10, b: 0 },
      { a: 3, b: 1 },
    )).toBe(7.5);
    expect(computeWeightedTotal(
      { a: 7, b: 8, c: 9 },
      { a: 1, b: 1, c: 1 },
    )).toBe(8);
  });
});
