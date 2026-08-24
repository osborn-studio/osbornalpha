/**
 * Eval harness prompt assembly + judge verdict validation (Research OS Phase 4).
 * Pure functions — TDD'd, no IO.
 *
 * builder≠judge role separation: buildEvalGenPrompt and buildEvalJudgePrompt
 * are two independent prompts (same provider, different system roles). The
 * judge prompt NEVER embeds the gen prompt or the source corpus — it sees only
 * the agent output + the case's expected notes/outcome + the rubric.
 *
 * Honest limitation (see EVAL_TIMEBOX_LIMITATION in types.ts): a pretrained
 * LLM carries world knowledge after as_of, so this is not a perfect backtest —
 * the gen prompt forces the time box and the rubric punishes uncited claims.
 */

import { createHash } from 'node:crypto';
import { buildSourceCorpus, MEMO_OUTPUT_SCHEMA } from './memo-prompt';
import type { EvalCase, MemoDraft, SourceDocument } from './types';

export interface EvalPrompt {
  system: string;
  user: string;
  /** sha256 of system + user, stored in the run's provenance. */
  prompt_sha256: string;
}

export interface EvalGenPrompt extends EvalPrompt {
  /** Sources actually injected (newest first, post-budget). */
  source_document_ids: string[];
}

function sha256(system: string, user: string): string {
  return createHash('sha256').update(system + user, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Generation prompt (time-boxed builder)

function genSystemPrompt(asOf: string): string {
  return `你是一名严谨的 TMT/AI 行业投资研究员，正在参加一次历史时间点研究评测。

时间盒硬性规则（最高优先级）：
1. 假设今天是 ${asOf}。你不知道、也不允许使用任何 ${asOf} 之后发生的事实。
2. 只准使用下面提供的 source documents 作为事实依据；每条 supporting_evidence 和 counter_arguments 必须在 source_document_ids 中引用来源清单里的 id。
3. 提供材料之外的任何断言，一律标 LOW_CONFIDENCE：不要写进 evidence，改写成 open_questions 里需要验证的问题。
4. 必须给出至少 2 条反方观点（counter_arguments）和至少 1 条失效条件（invalidation_conditions）。
5. 禁止任何收益承诺话术（必涨、保证、稳赚、无风险等）。这是研究辅助，不是投资建议。
6. 输出严格 JSON（不要 markdown code fence），schema 如下：
${MEMO_OUTPUT_SCHEMA}`;
}

/**
 * Assemble the time-boxed generation prompt for an eval case: as_of time-box
 * instruction + budgeted source manifest/corpus → the §4.4 memo JSON schema
 * (MEMO_OUTPUT_SCHEMA, shared verbatim with the memo generator).
 */
export function buildEvalGenPrompt(
  evalCase: EvalCase,
  sources: SourceDocument[],
): EvalGenPrompt {
  const system = genSystemPrompt(evalCase.as_of);
  const { manifest, corpus, source_document_ids } = buildSourceCorpus(sources);

  const user = `评测案例：${evalCase.title}
今天是 ${evalCase.as_of}。请仅基于以下当时可见的材料，输出你在这个时间点会写的投资 memo。

可引用的 source 清单（引用时必须使用这些 id）：
${manifest || '（无可用 source——所有结论都必须进 open_questions，confidence 必须为 LOW）'}

Source 原文：
${corpus || '（无）'}

请按 system 指定的 JSON schema 输出 memo。`;

  return { system, user, prompt_sha256: sha256(system, user), source_document_ids };
}

// ---------------------------------------------------------------------------
// Judge prompt (separated reviewer)

/** Human-readable guide per default rubric dimension (spec §4.8). */
export const EVAL_DIMENSION_GUIDE: Readonly<Record<string, string>> = {
  factual_accuracy: '事实准确性：memo 的判断与真实后续事件对照有多准确',
  citation_quality: '引用质量：结论是否落在给定材料的引用上；无引用断言按无据处理',
  counter_arguments: '反方观点质量：是否给出实质性、非稻草人的反方论证',
  risk_identification: '风险识别：是否识别了后来真实兑现或差点兑现的关键风险',
  invalidation_quality: '失效条件质量：失效条件是否具体、可观测、可证伪',
  overconfidence: '过度自信（反向）：无据断言越多、置信度标注越虚高，本维度得分越低',
};

const JUDGE_SYSTEM = `你是一名独立、苛刻的投资研究评审员。你会拿到：一份研究 agent 在历史时间点生成的 memo 输出、该案例的真实后续情况（expected/outcome）、以及一套评分 rubric。

评审规则：
1. 你只能依据给你的 memo 输出、真实后续情况和 rubric 打分；不要臆测 agent 看到过什么材料。
2. 对无引用断言与过度自信从严：任何没有 source_document_ids 支撑、或被标记 LOW_CONFIDENCE 却写得斩钉截铁的结论，都要在 citation_quality 和 overconfidence 维度上扣分。
3. 每个维度打 0-10 的整数或小数分；overconfidence 是反向维度——表现越过度自信，分越低。
4. failure_modes 用简短 snake_case 英文标签概括本次输出暴露的失败模式（例如 missed_key_risk, uncited_claim, overconfident_tone）；没有则给空数组。
5. 输出严格 JSON（不要 markdown code fence），schema 如下：
{
  "scores": { "<维度名>": number },            // rubric 中每个维度都必须给分
  "failure_modes": string[],
  "rationale_per_dimension": { "<维度名>": string }
}`;

/**
 * Assemble the judge prompt: agent output + expected notes (+ outcome when
 * recorded) + rubric dimensions with weights. Deliberately does NOT receive
 * the gen prompt or the source corpus (builder≠judge).
 */
export function buildEvalJudgePrompt(
  agentOutput: MemoDraft,
  evalCase: EvalCase,
  rubric: Record<string, number>,
): EvalPrompt {
  const dims = Object.entries(rubric)
    .map(([dim, weight]) =>
      `- ${dim}（权重 ${weight}）：${EVAL_DIMENSION_GUIDE[dim] ?? '按维度名的字面含义评审'}`,
    )
    .join('\n');

  const outcomeBlock = evalCase.outcome.trim()
    ? `\n实际发生的后续（outcome 记录）：\n${evalCase.outcome.trim()}\n`
    : '';

  const user = `评测案例：${evalCase.title}

Agent 的 memo 输出（JSON）：
${JSON.stringify(agentOutput, null, 2)}

真实后续情况（expected notes——对照打分的 ground truth）：
${evalCase.expected.notes || '（未填写——只能按研究纪律维度评分，事实对照类维度按材料内部一致性从严评）'}
${outcomeBlock}
评分 rubric（每个维度 0-10，必须全部给分）：
${dims}

请按 system 指定的 JSON schema 输出评审结果。`;

  return { system: JUDGE_SYSTEM, user, prompt_sha256: sha256(JUDGE_SYSTEM, user) };
}

// ---------------------------------------------------------------------------
// Verdict validation

export interface JudgeVerdict {
  /** Exactly the rubric's keys, each clamped to 0-10. */
  scores: Record<string, number>;
  failure_modes: string[];
  rationale_per_dimension: Record<string, string>;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

/**
 * Validate the judge's raw JSON against the rubric.
 * - Any rubric dimension missing or non-numeric → null (structured failure;
 *   the caller must NOT persist a half-run).
 * - Out-of-range numbers are clamped to [0,10] and 'judge_out_of_range' is
 *   appended to failure_modes.
 * - Score keys outside the rubric are dropped.
 */
export function validateJudgeVerdict(
  raw: unknown,
  rubric: Record<string, number>,
): JudgeVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawScores = obj.scores;
  if (!rawScores || typeof rawScores !== 'object') return null;

  const scores: Record<string, number> = {};
  let outOfRange = false;
  for (const dim of Object.keys(rubric)) {
    const v = (rawScores as Record<string, unknown>)[dim];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const clamped = Math.min(10, Math.max(0, v));
    if (clamped !== v) outOfRange = true;
    scores[dim] = clamped;
  }

  const failure_modes = asStringArray(obj.failure_modes);
  if (outOfRange && !failure_modes.includes('judge_out_of_range')) {
    failure_modes.push('judge_out_of_range');
  }

  const rationale: Record<string, string> = {};
  if (obj.rationale_per_dimension && typeof obj.rationale_per_dimension === 'object') {
    for (const [k, v] of Object.entries(obj.rationale_per_dimension as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim() !== '') rationale[k] = v.trim();
    }
  }

  return { scores, failure_modes, rationale_per_dimension: rationale };
}

/** Weighted mean of dimension scores under the rubric, rounded to 2 decimals. */
export function computeWeightedTotal(
  scores: Record<string, number>,
  rubric: Record<string, number>,
): number {
  let weighted = 0;
  let weightSum = 0;
  for (const [dim, weight] of Object.entries(rubric)) {
    weighted += (scores[dim] ?? 0) * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return 0;
  return Math.round((weighted / weightSum) * 100) / 100;
}
