/**
 * Memo prompt assembly + draft validation (Research OS Phase 1).
 * Pure functions — TDD'd, no IO. The LLM is asked for the §4.4 ten-section
 * memo as strict JSON; every evidence item must cite source_document_ids from
 * the injected source manifest; claims it cannot cite go to open_questions.
 */

import { createHash } from 'node:crypto';
import type { Confidence, Entity, EvidenceItem, SourceDocument } from './types';

export interface MemoPrompt {
  system: string;
  user: string;
  /** sha256 of system + user, stored in memo provenance. */
  prompt_sha256: string;
  /** Sources actually injected into the prompt (newest first, post-budget). */
  source_document_ids: string[];
}

export interface BuildMemoPromptOpts {
  entity: Entity;
  sources: SourceDocument[];
  question?: string;
  /** Total raw-text budget in characters across all sources. */
  budgetChars?: number;
  /** Per-source cap so one long filing cannot evict everything else. */
  perSourceChars?: number;
}

const SYSTEM_PROMPT = `你是一名严谨的 TMT/AI 行业投资研究员。你的任务是基于给定的 source documents 生成一份结构化投资 memo 草稿。

硬性规则：
1. 只能使用提供的 source documents 作为事实依据；每条 supporting_evidence 和 counter_arguments 必须在 source_document_ids 中引用来源清单里的 id。
2. 无法从 source 中找到依据的判断，不要写进 evidence，改写成 open_questions 里需要验证的问题。
3. 必须给出至少 2 条反方观点（counter_arguments）和至少 1 条失效条件（invalidation_conditions）。
4. 禁止任何收益承诺话术（必涨、保证、稳赚、无风险等）。这是研究辅助，不是投资建议。
5. 输出严格 JSON（不要 markdown code fence），schema 如下：
{
  "title": string,                        // memo 标题
  "one_line_conclusion": string,          // 1. 一句话结论
  "thesis": string,                       // 2. 核心 thesis
  "supporting_evidence": [                // 3. 支持证据（3 条）
    { "claim": string, "source_document_ids": string[] }
  ],
  "counter_arguments": [                  // 4. 反方观点（≥2 条）
    { "claim": string, "source_document_ids": string[] }
  ],
  "key_variables": string[],              // 5. 关键变量
  "invalidation_conditions": string[],    // 6. 失效条件（≥1 条）
  "open_questions": string[],             // 7. 需要继续验证的问题
  "related_impacts": string[],            // 8. 相关公司/产业链影响
  "confidence": "LOW" | "MEDIUM" | "HIGH" // 整体置信度（引用少时必须 LOW/MEDIUM）
}`;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[截断，原文 ${text.length} 字符]`;
}

/**
 * Assemble the memo generation prompt. Sources are injected newest-first and
 * truncated against budgetChars; the id+title manifest always lists every
 * injected source so the model can cite ids verbatim.
 */
export function buildMemoPrompt(opts: BuildMemoPromptOpts): MemoPrompt {
  const budget = opts.budgetChars ?? 24_000;
  const perSource = opts.perSourceChars ?? 8_000;
  const newestFirst = [...opts.sources].sort((a, b) =>
    (b.published_at ?? b.ingested_at).localeCompare(a.published_at ?? a.ingested_at),
  );

  const included: Array<{ src: SourceDocument; body: string }> = [];
  let used = 0;
  for (const src of newestFirst) {
    if (used >= budget) break;
    const body = truncate(src.raw_text, Math.min(perSource, budget - used));
    included.push({ src, body });
    used += body.length;
  }

  const manifest = included
    .map(({ src }) => `- ${src.id} | ${src.source_type} | trust=${src.trust_level} | ${src.title}`)
    .join('\n');
  const corpus = included
    .map(({ src, body }) =>
      `<source id="${src.id}" title="${src.title}" published_at="${src.published_at ?? 'unknown'}">\n${body}\n</source>`,
    )
    .join('\n\n');

  const questionLine = opts.question?.trim()
    ? `研究问题：${opts.question.trim()}`
    : `研究问题：对 ${opts.entity.name} 当前的投资研究要点做一份结构化 memo。`;

  const user = `研究对象：${opts.entity.name}${opts.entity.ticker ? `（${opts.entity.ticker}）` : ''} — ${opts.entity.description ?? ''}
${questionLine}

可引用的 source 清单（引用时必须使用这些 id）：
${manifest || '（无可用 source——所有结论都必须进 open_questions，confidence 必须为 LOW）'}

Source 原文：
${corpus || '（无）'}

请按 system 指定的 JSON schema 输出 memo。`;

  const prompt_sha256 = createHash('sha256').update(SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return {
    system: SYSTEM_PROMPT,
    user,
    prompt_sha256,
    source_document_ids: included.map(({ src }) => src.id),
  };
}

export interface MemoDraft {
  title: string;
  one_line_conclusion: string;
  thesis: string;
  supporting_evidence: EvidenceItem[];
  counter_arguments: EvidenceItem[];
  key_variables: string[];
  invalidation_conditions: string[];
  open_questions: string[];
  related_impacts: string[];
  confidence: Confidence;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim());
}

/**
 * Normalize raw LLM JSON into a MemoDraft and enforce the citation red line:
 * evidence citing ids outside allowedSourceIds has those ids stripped; any
 * evidence left with zero valid citations is flagged low_confidence (kept
 * visible, marked, and mirrored into open_questions for follow-up).
 */
export function validateMemoDraft(raw: unknown, allowedSourceIds: string[]): MemoDraft {
  const allowed = new Set(allowedSourceIds);
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const normalizeEvidence = (v: unknown): { items: EvidenceItem[]; uncited: string[] } => {
    const items: EvidenceItem[] = [];
    const uncited: string[] = [];
    if (Array.isArray(v)) {
      for (const e of v) {
        if (!e || typeof e !== 'object') continue;
        const claim = typeof (e as any).claim === 'string' ? (e as any).claim.trim() : '';
        if (!claim) continue;
        const ids = asStringArray((e as any).source_document_ids).filter((id) => allowed.has(id));
        const item: EvidenceItem = { claim, source_document_ids: ids };
        if (ids.length === 0) {
          item.low_confidence = true;  // 无来源结论 → LOW_CONFIDENCE（合规红线）
          uncited.push(claim);
        }
        items.push(item);
      }
    }
    return { items, uncited };
  };

  const supporting = normalizeEvidence(obj.supporting_evidence);
  const counters = normalizeEvidence(obj.counter_arguments);

  const openQuestions = asStringArray(obj.open_questions);
  for (const claim of [...supporting.uncited, ...counters.uncited]) {
    openQuestions.push(`需要为无来源结论找证据：${claim}`);
  }

  const confidence: Confidence = obj.confidence === 'HIGH' || obj.confidence === 'MEDIUM' || obj.confidence === 'LOW'
    ? obj.confidence
    : 'LOW';

  return {
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'Untitled memo',
    one_line_conclusion: typeof obj.one_line_conclusion === 'string' ? obj.one_line_conclusion.trim() : '',
    thesis: typeof obj.thesis === 'string' ? obj.thesis.trim() : '',
    supporting_evidence: supporting.items,
    counter_arguments: counters.items,
    key_variables: asStringArray(obj.key_variables),
    invalidation_conditions: asStringArray(obj.invalidation_conditions),
    open_questions: openQuestions,
    related_impacts: asStringArray(obj.related_impacts),
    confidence,
  };
}
