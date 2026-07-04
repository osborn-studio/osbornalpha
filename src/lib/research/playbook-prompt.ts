/**
 * Playbook action-suggestion prompt assembly + validation (Research OS
 * Phase 3). Pure functions — TDD'd, no IO. The LLM proposes ONE next action
 * for a memo/thesis; the human edits and creates the run themselves — the
 * suggestion is never persisted directly, and nothing here can ever place a
 * real trade (PAPER_TRADE is a paper record only).
 */

import { createHash } from 'node:crypto';
import {
  PROPOSED_ACTIONS,
  type Axiom,
  type InvestmentMemo,
  type ProposedAction,
  type Signal,
  type Thesis,
} from './types';

export type PlaybookSuggestSource =
  | { kind: 'memo'; memo: InvestmentMemo }
  | { kind: 'thesis'; thesis: Thesis };

export interface PlaybookSuggestPrompt {
  system: string;
  user: string;
  /** sha256 of system + user — the suggestion's provenance anchor. */
  prompt_sha256: string;
}

const SYSTEM_PROMPT = `你是一名严谨的 TMT/AI 行业投资研究员，负责基于一份研究材料（memo 或 thesis）与近 7 天的新 signals，建议**一个**下一步研究动作。

可选动作（proposed_action 只能是其一）：
- WATCHLIST     加入观察清单，持续跟踪
- PAPER_TRADE   纸面交易记录（仅记录，系统不会也永远不能执行任何真实交易）
- RESEARCH_MORE 继续研究，补充证据
- UPDATE_THESIS 建议人工修订 thesis 内容
- CLOSE_THESIS  建议关闭该 thesis（高风险，需要人工审批）

硬性规则：
1. 只依据给出的材料与 signals 判断；不得引入外部知识作为"新证据"。
2. 不确定或证据不足时必须选 RESEARCH_MORE；宁保守勿激进。
3. PAPER_TRADE 与 CLOSE_THESIS 属高风险动作，会进入人工审批；rationale 必须解释为何值得人工介入。
4. 禁止任何真实交易措辞（下单、买入、卖出、建仓等执行性指令）；禁止收益承诺话术（必涨/保证/稳赚/无风险）。
5. 必须遵守下方给出的投资公理（axioms）；违反公理的建议会被系统直接拦截。
6. 这是研究辅助，不是投资建议。
7. 输出严格 JSON（不要 markdown code fence），schema 如下：
{
  "proposed_action": "WATCHLIST" | "PAPER_TRADE" | "RESEARCH_MORE" | "UPDATE_THESIS" | "CLOSE_THESIS",
  "rationale": string,          // 2-4 句：为什么是这个动作，对照失效条件/观察指标
  "risks": string[],            // ≥2 条：该动作的主要风险
  "confidence_note": string     // 1-2 句：置信度与不确定性说明
}`;

function memoSection(memo: InvestmentMemo): string {
  const list = (items: string[]) => items.map((s) => `- ${s}`).join('\n') || '- （无）';
  return `来源类型：memo（status=${memo.status}, confidence=${memo.confidence}）
标题：${memo.title}
一句话结论：${memo.one_line_conclusion || '（无）'}
核心 thesis：${memo.thesis || '（无）'}
支持证据：
${memo.supporting_evidence.map((e) => `- ${e.claim}`).join('\n') || '- （无）'}
反方观点：
${memo.counter_arguments.map((e) => `- ${e.claim}`).join('\n') || '- （无）'}
关键变量：
${list(memo.key_variables)}
失效条件：
${list(memo.invalidation_conditions)}
待验证问题：
${list(memo.open_questions)}`;
}

function thesisSection(thesis: Thesis): string {
  return `来源类型：thesis（status=${thesis.status}）
标题：${thesis.title}
正文：${thesis.body}
失效条件：
${thesis.invalidation_conditions.map((c) => `- ${c}`).join('\n') || '- （无）'}
观察指标：
${thesis.watch_metrics.map((m) => `- ${m}`).join('\n') || '- （无）'}
下次复核：${thesis.next_review_at ?? '（未定）'}`;
}

export interface BuildPlaybookSuggestPromptOpts {
  source: PlaybookSuggestSource;
  /** Signals from the last 7 days relevant as fresh context. */
  recentSignals: Signal[];
  /** The five seeded investment axioms — injected verbatim. */
  axioms: Axiom[];
}

export function buildPlaybookSuggestPrompt(
  opts: BuildPlaybookSuggestPromptOpts,
): PlaybookSuggestPrompt {
  const sourceText = opts.source.kind === 'memo'
    ? memoSection(opts.source.memo)
    : thesisSection(opts.source.thesis);

  const signalManifest = opts.recentSignals
    .map((s) =>
      `- ${s.id} | ${s.signal_type} | ${s.direction} | conf=${s.confidence} | ${s.title}\n  ${s.summary}`,
    )
    .join('\n');

  const axiomText = opts.axioms
    .filter((a) => a.enabled)
    .map((a) => `- ${a.code}（${a.severity}）${a.title}：${a.description}`)
    .join('\n');

  const user = `研究材料：
${sourceText}

近 7 天新 signals：
${signalManifest || '（无新 signal）'}

投资公理（必须遵守）：
${axiomText || '（无）'}

请按 system 指定的 JSON schema 输出对该材料的下一步动作建议。`;

  const prompt_sha256 = createHash('sha256').update(SYSTEM_PROMPT + user, 'utf8').digest('hex');
  return { system: SYSTEM_PROMPT, user, prompt_sha256 };
}

// ---------------------------------------------------------------------------
// Suggestion validation

export interface PlaybookSuggestion {
  proposed_action: ProposedAction;
  rationale: string;
  risks: string[];
  confidence_note: string;
  /** Extraction bookkeeping, e.g. {downgraded_from} when the LLM emitted a
   *  non-enum action and was demoted to RESEARCH_MORE. */
  metadata: Record<string, unknown>;
}

/**
 * Normalize raw LLM JSON into a PlaybookSuggestion; returns null for garbage.
 * A non-enum proposed_action is downgraded to RESEARCH_MORE (the conservative
 * default the prompt mandates) and the original recorded in metadata.
 */
export function validatePlaybookSuggestion(raw: unknown): PlaybookSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const metadata: Record<string, unknown> = {};
  let action = o.proposed_action as ProposedAction;
  if (!PROPOSED_ACTIONS.includes(action)) {
    metadata.downgraded_from = typeof o.proposed_action === 'string' ? o.proposed_action : null;
    action = 'RESEARCH_MORE';
  }

  const risks = Array.isArray(o.risks)
    ? (o.risks as unknown[])
        .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
        .map((x) => x.trim())
    : [];

  return {
    proposed_action: action,
    rationale: typeof o.rationale === 'string' ? o.rationale.trim() : '',
    risks,
    confidence_note: typeof o.confidence_note === 'string' ? o.confidence_note.trim() : '',
    metadata,
  };
}
