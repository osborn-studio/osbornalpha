import { describe, it, expect } from 'vitest';
import { makeMockCtx, type MockStore } from './test-support';
import type { ResearchCtx } from './store';
import { ingestSource } from './sources';
import {
  EvalError,
  createEvalCase,
  getEvalCase,
  listEvalCases,
  listEvalCaseSummaries,
  getEvalRun,
  listEvalRuns,
  runEval,
  evalAggregate,
} from './evals';
import type { LlmFn } from './memos';
import { DEFAULT_EVAL_RUBRIC } from './types';

function newCtx(): { ctx: ResearchCtx; store: MockStore } {
  return makeMockCtx() as unknown as { ctx: ResearchCtx; store: MockStore };
}

async function seedSources(ctx: ResearchCtx, n = 2): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await ingestSource(ctx, {
      source_type: 'NEWS',
      title: `NVIDIA source ${i}`,
      raw_text: `nvidia raw text ${i}`,
      published_at: `2026-05-0${i}T00:00:00.000Z`,
    });
    ids.push(r.id);
  }
  return ids;
}

function mkCase(ctx: ResearchCtx, sourceIds: string[], extra: Record<string, unknown> = {}) {
  return createEvalCase(ctx, {
    title: 'NVIDIA 2026Q1 财报后判断',
    as_of_date: '2026-05-29',
    source_document_ids: sourceIds,
    expected_notes: '随后 DC 营收继续超预期。',
    ...extra,
  } as any);
}

const GOOD_MEMO = {
  title: 'NVDA 财报后 memo',
  one_line_conclusion: 'DC 需求仍强',
  thesis: '推理需求支撑 capex',
  supporting_evidence: [{ claim: '营收超预期', source_document_ids: [] as string[] }],
  counter_arguments: [{ claim: 'ASIC 替代', source_document_ids: [] as string[] }],
  key_variables: ['token 单价'],
  invalidation_conditions: ['连续两季下滑'],
  open_questions: [],
  related_impacts: ['TSMC'],
  confidence: 'MEDIUM',
};

const GOOD_VERDICT = {
  scores: {
    factual_accuracy: 8, citation_quality: 6, counter_arguments: 7,
    risk_identification: 5, invalidation_quality: 7, overconfidence: 6,
  },
  failure_modes: ['missed_china_risk'],
  rationale_per_dimension: {
    factual_accuracy: '与后续事实基本一致', citation_quality: '部分断言无引用',
    counter_arguments: '给了替代风险', risk_identification: '漏了出口管制',
    invalidation_quality: '条件可观测', overconfidence: '置信度标注克制',
  },
};

/** First call = gen, second call = judge. Records prompts for assertions. */
function twoStageLlm(genPayload: unknown, judgePayload: unknown) {
  const calls: Array<{ system: string; user: string }> = [];
  const llm: LlmFn = async (p) => {
    calls.push(p);
    const payload = calls.length === 1 ? genPayload : judgePayload;
    return { content: JSON.stringify(payload), model: calls.length === 1 ? 'fake-gen-model' : 'fake-judge-model' };
  };
  return { llm, calls };
}

describe('createEvalCase', () => {
  it('persists the case with default rubric, JSON columns and an audit row', async () => {
    const { ctx, store } = newCtx();
    const ids = await seedSources(ctx);
    const c = await mkCase(ctx, ids);
    expect(c.id).toBeTruthy();
    expect(c.as_of).toBe('2026-05-29');
    expect(c.visible_material).toEqual(ids);
    expect(c.expected).toEqual({ notes: '随后 DC 营收继续超预期。' });
    expect(c.rubric).toEqual(DEFAULT_EVAL_RUBRIC);
    expect(await getEvalCase(ctx, c.id)).toEqual(c);
    expect(await listEvalCases(ctx)).toHaveLength(1);
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'eval.case_create');
    expect(audits).toHaveLength(1);
    expect(audits[0].object_id).toBe(c.id);
  });

  it('accepts a rubric override and dedupes source ids', async () => {
    const { ctx } = newCtx();
    const ids = await seedSources(ctx);
    const c = await mkCase(ctx, [ids[0], ids[0], ids[1]], { rubric: { factual_accuracy: 2, hype_resistance: 1 } });
    expect(c.visible_material).toEqual(ids);
    expect(c.rubric).toEqual({ factual_accuracy: 2, hype_resistance: 1 });
  });

  it('rejects bad input: empty title / bad date / empty or unknown sources / bad rubric', async () => {
    const { ctx } = newCtx();
    const ids = await seedSources(ctx);
    await expect(mkCase(ctx, ids, { title: '  ' })).rejects.toThrowError(EvalError);
    await expect(mkCase(ctx, ids, { as_of_date: '2026/05/29' })).rejects.toThrowError(/as_of_date/);
    await expect(mkCase(ctx, ids, { as_of_date: '2026-13-40' })).rejects.toThrowError(/as_of_date/);
    await expect(mkCase(ctx, [])).rejects.toThrowError(/source/);
    await expect(mkCase(ctx, ['nonexistent-id'])).rejects.toThrowError(/not found/);
    await expect(mkCase(ctx, ids, { rubric: {} })).rejects.toThrowError(/rubric/);
    await expect(mkCase(ctx, ids, { rubric: { a: -1 } })).rejects.toThrowError(/rubric/);
    expect(await listEvalCases(ctx)).toHaveLength(0);
  });
});

describe('runEval', () => {
  it('runs gen then judge as two separated calls and persists the full run', async () => {
    const { ctx, store } = newCtx();
    const ids = await seedSources(ctx);
    const c = await mkCase(ctx, ids);
    const { llm, calls } = twoStageLlm(GOOD_MEMO, GOOD_VERDICT);

    const result = await runEval(ctx, c.id, llm);
    expect(result.run).not.toBeNull();
    const run = result.run!;

    // builder≠judge: two calls, distinct system prompts; judge never sees gen prompt.
    expect(calls).toHaveLength(2);
    expect(calls[0].system).toContain('假设今天是 2026-05-29');
    expect(calls[1].system).not.toBe(calls[0].system);
    expect(calls[1].user).not.toContain('<source id=');

    // Scores complete, in range, weighted total.
    expect(run.scores).toEqual(GOOD_VERDICT.scores);
    expect(run.total).toBeCloseTo(6.5, 5);
    expect(run.failure_modes).toEqual(['missed_china_risk']);

    // Full agent output + double provenance.
    expect(run.output.memo.title).toBe('NVDA 财报后 memo');
    expect(run.output.memo.counter_arguments).toHaveLength(1);
    expect(run.output.provenance.gen.model).toBe('fake-gen-model');
    expect(run.output.provenance.judge.model).toBe('fake-judge-model');
    expect(run.output.provenance.gen.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(run.output.provenance.judge.prompt_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(run.output.provenance.gen.prompt_sha256).not.toBe(run.output.provenance.judge.prompt_sha256);
    expect(run.output.rationale_per_dimension.risk_identification).toBe('漏了出口管制');

    // The generated memo is NOT persisted into the memos table (eval-only).
    expect(store.count('research_memos')).toBe(0);

    // Readable back + audit trail.
    expect(await getEvalRun(ctx, run.id)).toEqual(run);
    expect(await listEvalRuns(ctx, c.id)).toHaveLength(1);
    const audits = store.rows('research_audit_log').filter((a) => a.action === 'eval.run');
    expect(audits).toHaveLength(1);
  });

  it('clamps out-of-range judge scores and records judge_out_of_range', async () => {
    const { ctx } = newCtx();
    const c = await mkCase(ctx, await seedSources(ctx));
    const verdict = {
      ...GOOD_VERDICT,
      scores: { ...GOOD_VERDICT.scores, factual_accuracy: 15, overconfidence: -3 },
      failure_modes: [],
    };
    const { llm } = twoStageLlm(GOOD_MEMO, verdict);
    const result = await runEval(ctx, c.id, llm);
    expect(result.run!.scores.factual_accuracy).toBe(10);
    expect(result.run!.scores.overconfidence).toBe(0);
    expect(result.run!.failure_modes).toContain('judge_out_of_range');
  });

  it('gen-stage failure returns a structured error and persists NOTHING', async () => {
    const { ctx, store } = newCtx();
    const c = await mkCase(ctx, await seedSources(ctx));
    const failing: LlmFn = async () => { throw new Error('boom'); };
    const r = await runEval(ctx, c.id, failing);
    expect(r.run).toBeNull();
    expect(r.llm).toMatchObject({ source: 'error', stage: 'gen' });
    expect(await listEvalRuns(ctx, c.id)).toHaveLength(0);
    expect(store.rows('research_audit_log').filter((a) => a.action === 'eval.run')).toHaveLength(0);

    const noKey: LlmFn = async () => { throw new Error('no LLM provider configured'); };
    const r2 = await runEval(ctx, c.id, noKey);
    expect(r2.llm).toMatchObject({ source: 'no-key', stage: 'gen' });
  });

  it('judge-stage failure (throw or invalid verdict) never persists a half-run', async () => {
    const { ctx } = newCtx();
    const c = await mkCase(ctx, await seedSources(ctx));

    let call = 0;
    const judgeThrows: LlmFn = async () => {
      call += 1;
      if (call === 1) return { content: JSON.stringify(GOOD_MEMO), model: 'g' };
      throw new Error('judge down');
    };
    const r1 = await runEval(ctx, c.id, judgeThrows);
    expect(r1.run).toBeNull();
    expect(r1.llm).toMatchObject({ source: 'error', stage: 'judge' });

    const { llm: badVerdict } = twoStageLlm(GOOD_MEMO, { scores: { factual_accuracy: 8 } });
    const r2 = await runEval(ctx, c.id, badVerdict);
    expect(r2.run).toBeNull();
    expect(r2.llm).toMatchObject({ source: 'error', stage: 'judge' });

    const garbageGen: LlmFn = async () => ({ content: 'not json at all — plain prose', model: 'g' });
    const r3 = await runEval(ctx, c.id, garbageGen);
    expect(r3.run).toBeNull();
    expect(r3.llm).toMatchObject({ source: 'error', stage: 'gen' });

    expect(await listEvalRuns(ctx, c.id)).toHaveLength(0);
  });

  it('throws 404 for an unknown case', async () => {
    const { ctx } = newCtx();
    await expect(runEval(ctx, '00000000-0000-4000-8000-0000000000ff', async () => ({ content: '{}', model: 'x' })))
      .rejects.toThrowError(EvalError);
  });
});

describe('aggregate + summaries', () => {
  it('reports per-dimension averages, failure mode counts and case summaries', async () => {
    const { ctx } = newCtx();
    const ids = await seedSources(ctx);
    const c = await mkCase(ctx, ids);
    const { llm: llm1 } = twoStageLlm(GOOD_MEMO, GOOD_VERDICT);
    await runEval(ctx, c.id, llm1);
    const { llm: llm2 } = twoStageLlm(GOOD_MEMO, {
      ...GOOD_VERDICT,
      scores: { ...GOOD_VERDICT.scores, factual_accuracy: 4 },
      failure_modes: ['missed_china_risk', 'overconfident_tone'],
    });
    await runEval(ctx, c.id, llm2);

    const agg = await evalAggregate(ctx);
    expect(agg.case_count).toBe(1);
    expect(agg.run_count).toBe(2);
    expect(agg.dimension_averages.factual_accuracy).toBe(6);
    expect(agg.dimension_averages.citation_quality).toBe(6);
    expect(agg.failure_mode_top[0]).toEqual({ mode: 'missed_china_risk', count: 2 });
    expect(agg.failure_mode_top).toContainEqual({ mode: 'overconfident_tone', count: 1 });
    expect(agg.avg_total).toBeGreaterThan(0);

    const summaries = await listEvalCaseSummaries(ctx);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].run_count).toBe(2);
    expect(summaries[0].last_total).toBeGreaterThan(0);
  });

  it('is empty-safe with no cases or runs', async () => {
    const { ctx } = newCtx();
    const agg = await evalAggregate(ctx);
    expect(agg).toMatchObject({ case_count: 0, run_count: 0, avg_total: null });
    expect(agg.failure_mode_top).toEqual([]);
    expect(await listEvalCaseSummaries(ctx)).toEqual([]);
  });
});
