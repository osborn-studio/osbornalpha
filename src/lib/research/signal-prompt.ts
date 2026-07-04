/**
 * Signal extraction prompt assembly + draft validation (Research OS Phase 2).
 * Pure functions — TDD'd, no IO. The LLM turns a batch of pending sources
 * into structured signals; every signal must cite source ids from the
 * injected batch (anti-hallucination: signals citing outside ids are
 * dropped, not repaired).
 */

import { createHash } from 'node:crypto';
import {
  SIGNAL_TYPES,
  SIGNAL_DIRECTIONS,
  type Confidence,
  type Entity,
  type SignalDirection,
  type SignalType,
  type SourceDocument,
} from './types';

export interface SignalPrompt {
  system: string;
  user: string;
  /** sha256 of system + user, stored in signal llm_provenance. */
  prompt_sha256: string;
  /** Sources injected into the prompt — the only citable ids. */
  source_document_ids: string[];
}

const SYSTEM_PROMPT = `你是一名严谨的 TMT/AI 行业投资研究员。你的任务是从给定的一批 source documents 中提炼结构化的投资研究信号（signals）。

硬性规则：
1. 每个 signal 必须在 source_ids 中引用来源清单里的 id；不允许引用清单之外的 id。
2. 无研究价值的源可以不产 signal；宁缺勿滥——不要为了凑数硬编信号。
3. entity_names / affected_company_names 尽量使用实体清单中的名称或别名；清单外的名字也可以写，但要精确。
4. 每个 signal 必须至少给出 1 条 research_questions（需要验证的问题）。
5. 禁止任何收益承诺话术。这是研究辅助，不是投资建议。
6. 输出严格 JSON（不要 markdown code fence），schema 如下：
{
  "signals": [
    {
      "title": string,                     // 信号标题（一句话）
      "summary": string,                   // 2-3 句说明信号内容与依据
      "signal_type": "DEVELOPER" | "MODEL_USAGE" | "PRODUCT" | "COMPANY" | "SUPPLY_CHAIN" | "POLICY",
      "direction": "POSITIVE" | "NEGATIVE" | "MIXED" | "UNKNOWN",
      "confidence": "LOW" | "MEDIUM" | "HIGH",
      "entity_names": string[],            // 涉及的实体名（公司/主题/产品等）
      "affected_company_names": string[],  // 受影响的上市/未上市公司名
      "research_questions": string[],      // ≥1 条需要验证的问题
      "source_ids": string[]               // 引用的 source id（必须来自清单）
    }
  ]
}`;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[截断，原文 ${text.length} 字符]`;
}

export interface BuildSignalPromptOpts {
  /** Per-source raw text excerpt budget (default ~2000 chars per plan). */
  perSourceChars?: number;
}

/**
 * Assemble the signal extraction prompt: entity manifest (id+name+aliases)
 * plus per-source excerpts (~2000 chars each).
 */
export function buildSignalPrompt(
  sources: SourceDocument[],
  entities: Entity[],
  opts: BuildSignalPromptOpts = {},
): SignalPrompt {
  const perSource = opts.perSourceChars ?? 2_000;

  const entityManifest = entities
    .map((e) =>
      `- ${e.id} | ${e.type} | ${e.name}${e.ticker ? ` (${e.ticker})` : ''}` +
      (e.aliases.length ? ` | 别名: ${e.aliases.join(', ')}` : ''),
    )
    .join('\n');

  const sourceManifest = sources
    .map((s) => `- ${s.id} | ${s.source_type} | trust=${s.trust_level} | ${s.title}`)
    .join('\n');

  const corpus = sources
    .map((s) =>
      `<source id="${s.id}" title="${s.title}" published_at="${s.published_at ?? 'unknown'}">\n` +
      `${truncate(s.raw_text, perSource)}\n</source>`,
    )
    .join('\n\n');

  const user = `已知实体清单（引用实体时优先使用这些名称）：
${entityManifest || '（无）'}

可引用的 source 清单（source_ids 必须来自这些 id）：
${sourceManifest || '（无）'}

Source 原文摘录：
${corpus || '（无）'}

请按 system 指定的 JSON schema 输出 signals。没有研究价值的源不要产出 signal。`;

  const prompt_sha256 = createHash('sha256').update(SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return {
    system: SYSTEM_PROMPT,
    user,
    prompt_sha256,
    source_document_ids: sources.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Draft validation

export interface SignalDraft {
  title: string;
  summary: string;
  signal_type: SignalType;
  direction: SignalDirection;
  confidence: Confidence;
  entity_names: string[];
  affected_company_names: string[];
  research_questions: string[];
  source_ids: string[];
}

export interface DroppedSignal {
  title: string;
  reason: string;
}

export interface ValidateSignalsResult {
  drafts: SignalDraft[];
  /** Signals rejected during validation (hallucinated citations, bad enums…). */
  dropped: DroppedSignal[];
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .map((x) => x.trim());
}

/**
 * Normalize raw LLM JSON into SignalDrafts.
 * Hard drops (anti-hallucination + schema red lines): source_ids empty or
 * citing ids outside the prompt batch, invalid signal_type, missing
 * title/summary, zero research_questions. Soft normalization: invalid
 * direction → UNKNOWN, invalid confidence → LOW.
 */
export function validateSignalDrafts(
  raw: unknown,
  allowedSourceIds: string[],
): ValidateSignalsResult {
  const allowed = new Set(allowedSourceIds);
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).signals)
      ? (raw as any).signals
      : [];

  const drafts: SignalDraft[] = [];
  const dropped: DroppedSignal[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
    if (!title) {
      dropped.push({ title: '(untitled)', reason: 'missing title' });
      continue;
    }
    if (!summary) {
      dropped.push({ title, reason: 'missing summary' });
      continue;
    }
    if (!SIGNAL_TYPES.includes(o.signal_type as SignalType)) {
      dropped.push({ title, reason: `invalid signal_type: ${String(o.signal_type)}` });
      continue;
    }
    const sourceIds = asStringArray(o.source_ids);
    if (sourceIds.length === 0) {
      dropped.push({ title, reason: 'empty source_ids (uncited signal)' });
      continue;
    }
    const outside = sourceIds.filter((id) => !allowed.has(id));
    if (outside.length > 0) {
      dropped.push({
        title,
        reason: `source_ids outside prompt batch: ${outside.join(', ')}`,
      });
      continue;
    }
    const researchQuestions = asStringArray(o.research_questions);
    if (researchQuestions.length === 0) {
      dropped.push({ title, reason: 'missing research_questions (≥1 required)' });
      continue;
    }

    drafts.push({
      title,
      summary,
      signal_type: o.signal_type as SignalType,
      direction: SIGNAL_DIRECTIONS.includes(o.direction as SignalDirection)
        ? (o.direction as SignalDirection)
        : 'UNKNOWN',
      confidence: o.confidence === 'HIGH' || o.confidence === 'MEDIUM' || o.confidence === 'LOW'
        ? (o.confidence as Confidence)
        : 'LOW',
      entity_names: asStringArray(o.entity_names),
      affected_company_names: asStringArray(o.affected_company_names),
      research_questions: researchQuestions,
      source_ids: sourceIds,
    });
  }
  return { drafts, dropped };
}
