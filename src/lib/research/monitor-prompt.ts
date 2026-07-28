/**
 * Thesis monitor prompt assembly + verdict validation (Research OS Phase 2).
 * Pure functions — TDD'd, no IO. The LLM reviews new signals/sources against
 * one thesis and returns a verdict; it can only *suggest* a status — the
 * system never auto-transitions (spec §3.3, human adjudication required).
 */

import { createHash } from 'node:crypto';
import {
  THESIS_STATUSES,
  type Signal,
  type SourceDocument,
  type Thesis,
  type ThesisStatus,
} from './types';

export type MonitorVerdictKind = 'SUPPORT' | 'WEAKEN' | 'INVALIDATE' | 'NONE';

const VERDICTS: readonly MonitorVerdictKind[] = ['SUPPORT', 'WEAKEN', 'INVALIDATE', 'NONE'];

export interface MonitorPrompt {
  system: string;
  user: string;
  /** sha256 of system + user, stored in the alert's llm_provenance. */
  prompt_sha256: string;
  /** Signals injected into the prompt — the only citable ids. */
  signal_ids: string[];
  /** Sources injected into the prompt (context material). */
  source_document_ids: string[];
}

const SYSTEM_PROMPT = `你是一名严谨的 TMT/AI 行业投资研究员，负责监控一条投资 thesis 是否被新材料支持、削弱或失效。

硬性规则：
1. 只依据给出的新 signals / 新 sources 判断；不得引入外部知识作为"新证据"。
2. cited_signal_ids 必须来自 signal 清单里的 id；不允许编造 id。
3. 你只能给出建议（suggested_status）；thesis 状态由人工裁决，系统不会自动更改。
4. 与该 thesis 无关或证据不足时输出 verdict "NONE"；宁缺勿滥。
5. 禁止任何收益承诺话术。这是研究辅助，不是投资建议。
6. 输出严格 JSON（不要 markdown code fence），schema 如下：
{
  "verdict": "SUPPORT" | "WEAKEN" | "INVALIDATE" | "NONE",
  "rationale": string,                 // 2-4 句：新材料如何影响该 thesis（对照失效条件/观察指标）
  "cited_signal_ids": string[],        // 依据的 signal id（必须来自清单；NONE 时可为空）
  "suggested_status": "DRAFT" | "ACTIVE" | "WATCH" | "AT_RISK" | "INVALIDATED" | "CLOSED" | null
}`;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[截断，原文 ${text.length} 字符]`;
}

export interface BuildMonitorPromptOpts {
  thesis: Thesis;
  signals: Signal[];
  sources: SourceDocument[];
  /** Per-source raw text excerpt budget. */
  perSourceChars?: number;
}

export function buildMonitorPrompt(opts: BuildMonitorPromptOpts): MonitorPrompt {
  const perSource = opts.perSourceChars ?? 1_500;
  const t = opts.thesis;

  const signalManifest = opts.signals
    .map((s) =>
      `- ${s.id} | ${s.signal_type} | ${s.direction} | conf=${s.confidence} | ${s.title}\n  ${s.summary}`,
    )
    .join('\n');

  const sourceCorpus = opts.sources
    .map((s) =>
      `<source id="${s.id}" title="${s.title}" published_at="${s.published_at ?? 'unknown'}">\n` +
      `${truncate(s.raw_text, perSource)}\n</source>`,
    )
    .join('\n\n');

  const user = `被监控的 thesis：
标题：${t.title}
状态：${t.status}
正文：${t.body}
失效条件：
${t.invalidation_conditions.map((c) => `- ${c}`).join('\n') || '- （无）'}
观察指标：
${t.watch_metrics.map((m) => `- ${m}`).join('\n') || '- （无）'}

新 signals 清单（cited_signal_ids 必须来自这些 id）：
${signalManifest || '（无新 signal）'}

新 sources 摘录（背景材料）：
${sourceCorpus || '（无新 source）'}

请按 system 指定的 JSON schema 输出对该 thesis 的监控判定。`;

  const prompt_sha256 = createHash('sha256').update(SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return {
    system: SYSTEM_PROMPT,
    user,
    prompt_sha256,
    signal_ids: opts.signals.map((s) => s.id),
    source_document_ids: opts.sources.map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Verdict validation

export interface MonitorVerdict {
  verdict: MonitorVerdictKind;
  rationale: string;
  cited_signal_ids: string[];
  suggested_status: ThesisStatus | null;
  /** Hallucinated citations removed during validation (→ event detail). */
  dropped_cited_ids: string[];
}

/**
 * Normalize raw LLM JSON into a MonitorVerdict; returns null for garbage or
 * an invalid verdict enum. Anti-hallucination: cited ids outside the prompt
 * batch are dropped and recorded; a non-NONE verdict left with zero valid
 * citations (while signals were available to cite) is downgraded to NONE.
 */
export function validateMonitorVerdict(
  raw: unknown,
  allowedSignalIds: string[],
): MonitorVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!VERDICTS.includes(o.verdict as MonitorVerdictKind)) return null;

  const allowed = new Set(allowedSignalIds);
  const rawCited = Array.isArray(o.cited_signal_ids)
    ? (o.cited_signal_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const cited = rawCited.filter((id) => allowed.has(id));
  const dropped = rawCited.filter((id) => !allowed.has(id));

  let verdict = o.verdict as MonitorVerdictKind;
  if (verdict !== 'NONE' && cited.length === 0 && allowedSignalIds.length > 0 && rawCited.length > 0) {
    // Every citation was hallucinated — the verdict has no grounding.
    verdict = 'NONE';
  }

  return {
    verdict,
    rationale: typeof o.rationale === 'string' ? o.rationale.trim() : '',
    cited_signal_ids: cited,
    suggested_status: THESIS_STATUSES.includes(o.suggested_status as ThesisStatus)
      ? (o.suggested_status as ThesisStatus)
      : null,
    dropped_cited_ids: dropped,
  };
}
