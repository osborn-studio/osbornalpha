/**
 * Deal-memo engine (一级市场兼容 IC memo) — additive memo_type='deal' variant.
 * generate → LLM → validate (8 sections + verdict + 8-field valuation) → persist
 * with provenance → research_audit_log. The §4.4 thesis memo path (memos.ts) is
 * untouched; this file never runs the thesis axiom gate.
 *
 * Deal gate (independent, NOT the thesis axiom gate): verdict present +
 * return_profile has ≥1 of irr/moic/payback/scenarios + exit_assumptions has ≥1
 * path. Per plan T2 the gate does NOT block generation — a deal memo is an AI
 * 初稿 stored as DRAFT even when incomplete; the gate result is returned so the
 * UI/API can surface what's missing.
 *
 * Spec: docs/research-os/2026-07-06-ic-memo-deal-variant-spec.md
 */

import { audit, isUuid, type ResearchCtx } from './store';
import { getEntity } from './entities';
import { listSources } from './sources';
import {
  buildDealMemoPrompt,
  validateDealMemoDraft,
  emptyDealValuation,
} from './deal-memo-prompt';
import type {
  DealMemoDraft,
  DealRecommendation,
  DealSection,
  DealValuation,
  InvestmentMemo,
  MemoProvenance,
  SourceDocument,
} from './types';

const TABLE = 'research_memos';

export class DealMemoError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'DealMemoError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Map a research_memos row into a deal-shaped InvestmentMemo. */
export function rowToDealMemo(row: any): InvestmentMemo {
  return {
    id: row.id,
    title: row.title,
    company_ids: arr<string>(row.company_ids),
    theme_ids: arr<string>(row.theme_ids),
    one_line_conclusion: row.one_line_conclusion ?? '',
    thesis: row.thesis ?? '',
    supporting_evidence: [],
    counter_arguments: [],
    key_variables: [],
    invalidation_conditions: [],
    open_questions: [],
    related_impacts: [],
    confidence: row.confidence ?? 'LOW',
    axiom_check_results: [],
    provenance:
      row.llm_provenance && typeof row.llm_provenance === 'object'
        ? (row.llm_provenance as MemoProvenance)
        : {},
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    memo_type: 'deal',
    deal_context: row.deal_context ?? null,
    sections: arr<DealSection>(row.sections),
    recommendation:
      row.recommendation && typeof row.recommendation === 'object' && row.recommendation.verdict
        ? (row.recommendation as DealRecommendation)
        : { verdict: 'conditional', conditions: [], rationale: '' },
    valuation:
      row.valuation && typeof row.valuation === 'object' && Object.keys(row.valuation).length
        ? (row.valuation as DealValuation)
        : emptyDealValuation(),
  };
}

async function getDealMemo(ctx: ResearchCtx, id: string): Promise<InvestmentMemo | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToDealMemo(data) : null;
}

// ---------------------------------------------------------------------------
// Deal gate (independent of the thesis axiom gate)

export interface DealGateResult {
  ok: boolean;
  /** Which of verdict / return_profile / exit_assumptions is incomplete. */
  missing: string[];
}

function hasReturnMetric(v: DealValuation): boolean {
  const rp = v.return_profile ?? {};
  if (rp.irr != null || rp.moic != null || (rp.payback ?? '').trim() !== '') return true;
  const sc = rp.scenarios ?? {};
  return [sc.base, sc.upside, sc.downside].some((s) => (s ?? '').trim() !== '');
}

/**
 * Deal gate: verdict present + at least one return metric + at least one exit
 * path. Section 8 is the soul of the memo; this reports (not enforces) whether
 * it's complete. Does NOT apply the thesis axiom gate.
 */
export function dealGate(draft: DealMemoDraft): DealGateResult {
  const missing: string[] = [];
  const verdict = draft.recommendation?.verdict;
  if (verdict !== 'invest' && verdict !== 'pass' && verdict !== 'conditional') missing.push('verdict');
  if (!hasReturnMetric(draft.valuation)) missing.push('return_profile');
  if (!(draft.valuation.exit_assumptions?.paths?.length > 0)) missing.push('exit_assumptions');
  return { ok: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Generation

export interface DealLlmChatResult {
  content: string;
  model: string;
}

/** Injectable for tests; defaultDealLlm routes through the existing LLM stack. */
export type DealLlmFn = (prompt: { system: string; user: string }) => Promise<DealLlmChatResult>;

/** Production adapter: reuses src/lib/data/sources/llm (resolveLlm → env DeepSeek). */
export const defaultDealLlm: DealLlmFn = async ({ system, user }) => {
  const { chat } = await import('@/lib/data/sources/llm');
  const r = await chat({
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: 4000,
    temperature: 0.3,
    responseJson: true,
    timeoutMs: 120_000,
  });
  return { content: r.content, model: r.model };
};

export interface GenerateDealMemoInput {
  target: string;
  deal_context?: string;
  entity_id?: string;
}

export interface GenerateDealMemoResult {
  memo?: InvestmentMemo;
  gate?: DealGateResult;
  error?: { source: 'no-key' | 'error'; message: string };
}

/**
 * Sources bound to an entity, via listSources + JS filter. The jsonb
 * `.contains` path errors on the real DB (22P02) — mirror the diligence.ts /
 * sources.ts workaround and filter entity_ids.includes(entityId) in JS.
 */
async function sourcesForEntity(ctx: ResearchCtx, entityId: string): Promise<SourceDocument[]> {
  const all = await listSources(ctx, { limit: 1000 });
  return all.filter((s) => s.entity_ids.includes(entityId));
}

/**
 * Generate a deal memo. LLM failure / missing key returns a structured
 * {error} — never throws for provider problems. The deal gate is reported in
 * the result but never blocks the DRAFT insert (AI 初稿).
 */
export async function generateDealMemo(
  ctx: ResearchCtx,
  input: GenerateDealMemoInput,
  llm: DealLlmFn = defaultDealLlm,
): Promise<GenerateDealMemoResult> {
  const target = (input.target ?? '').trim();
  if (target.length < 1 || target.length > 100) {
    throw new DealMemoError('target must be 1..100 chars', 400);
  }
  const dealContext = input.deal_context?.trim() || undefined;
  if (dealContext && dealContext.length > 2000) {
    throw new DealMemoError('deal_context must be ≤ 2000 chars', 400);
  }

  // Optional entity binding — its sources (incl. diligence briefs stored in the
  // brain) become the research material; a bare target generates without any.
  let companyIds: string[] = [];
  let sources: SourceDocument[] = [];
  if (input.entity_id) {
    const entity = await getEntity(ctx, input.entity_id);
    if (!entity) throw new DealMemoError('entity not found', 404);
    companyIds = entity.type === 'THEME' ? [] : [entity.id];
    sources = await sourcesForEntity(ctx, entity.id);
  }

  const prompt = buildDealMemoPrompt({ target, deal_context: dealContext, sources });

  let content: string;
  let model: string;
  try {
    const r = await llm({ system: prompt.system, user: prompt.user });
    content = r.content;
    model = r.model;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const noKey = /no llm provider configured/i.test(message);
    return { error: { source: noKey ? 'no-key' : 'error', message } };
  }

  const { extractJson } = await import('@/lib/data/sources/llm');
  const parsed = extractJson(content);
  if (!parsed) {
    return { error: { source: 'error', message: 'LLM output was not parseable JSON' } };
  }
  const draft = validateDealMemoDraft(parsed);
  const gate = dealGate(draft);

  const now = new Date().toISOString();
  const provenance: MemoProvenance = {
    model,
    prompt_sha256: prompt.prompt_sha256,
    source_document_ids: prompt.source_document_ids,
    generated_at: now,
    edits: [],
  };
  const id = crypto.randomUUID();
  const { error } = await ctx.supabase.from(TABLE).insert({
    id,
    user_id: ctx.userId,
    memo_type: 'deal',
    title: draft.title,
    company_ids: companyIds,
    theme_ids: [],
    deal_context: dealContext ?? null,
    sections: draft.sections,
    recommendation: draft.recommendation,
    valuation: draft.valuation,
    // thesis-only columns stay empty for a deal memo.
    confidence: 'LOW',
    axiom_check_results: [],
    llm_provenance: provenance,
    status: 'DRAFT',
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'memo.generate_deal', id, {
    target,
    entity_id: input.entity_id ?? null,
    model,
    prompt_sha256: prompt.prompt_sha256,
    source_count: prompt.source_document_ids.length,
    gate_ok: gate.ok,
    gate_missing: gate.missing,
  });
  return { memo: (await getDealMemo(ctx, id))!, gate };
}

// ---------------------------------------------------------------------------
// Markdown export (8 sections + valuation block + disclaimer)

const VERDICT_LABEL: Record<string, string> = {
  invest: '投',
  pass: '不投',
  conditional: '有条件投',
};

function na(v: unknown): string {
  if (v == null || v === '') return '待核实';
  return String(v);
}

function valuationMarkdown(v: DealValuation): string {
  const ev = v.entry_valuation;
  const rp = v.return_profile;
  const sc = rp.scenarios ?? {};
  const paths = v.exit_assumptions.paths.length
    ? v.exit_assumptions.paths.map((p) => `${p.type}（${na(p.window)}）`).join('、')
    : '待核实';
  const sens = v.sensitivity.length
    ? v.sensitivity.map((s) => `- ${s.variable}：${s.effect}`).join('\n')
    : '- 待核实';
  const risks = v.valuation_risks.length
    ? v.valuation_risks.map((r) => `- ${r.risk} → ${na(r.mitigant)}`).join('\n')
    : '- 待核实';
  const comps = v.public_market_crosscheck.comps.length
    ? v.public_market_crosscheck.comps.map((c) => `${na(c.name ?? c.ticker)}（${na(c.multiple)}）`).join('、')
    : '待核实';

  return `### 估值依据
${v.valuation_basis.length ? v.valuation_basis.map((b) => `- ${b}`).join('\n') : '- 待核实'}

### 进入估值
- pre-money：${na(ev.pre_money)} · post-money：${na(ev.post_money)} · EV：${na(ev.ev)}
- equity value：${na(ev.equity_value)} · per share：${na(ev.per_share)} · 交易对价：${na(ev.transaction_value)} · 币种：${na(ev.currency)}

### 持股与稀释
- 持股比例：${na(v.ownership_and_dilution.stake_pct)} · 稀释：${na(v.ownership_and_dilution.dilution)}
- 换股/增资影响：${na(v.ownership_and_dilution.swap_or_raise_note)}

### 回报画像
- IRR：${na(rp.irr)} · MOIC：${na(rp.moic)} · 回收期：${na(rp.payback)}
- 情景 — base：${na(sc.base)} · upside：${na(sc.upside)} · downside：${na(sc.downside)}

### 退出假设
- 退出路径：${paths}

### 敏感性
${sens}

### 估值风险
${risks}

### 二级市场交叉验证（仅交叉验证 · 不覆盖一级逻辑）
- 适用：${v.public_market_crosscheck.applicable ? '是' : '否'} · 可比：${comps}
- 备注：${na(v.public_market_crosscheck.note)}`;
}

const DEAL_DISCLAIMER = 'AI 初稿，关键数据/估值人工复核后用于投委会决策。本内容为研究辅助，不构成投资建议。';

/** Eight-section markdown export for a deal memo, with valuation block + disclaimer. */
export function dealMemoToMarkdown(memo: InvestmentMemo): string {
  const sections = memo.sections ?? [];
  const rec = memo.recommendation ?? { verdict: 'conditional', conditions: [], rationale: '' };
  const valuation = memo.valuation ?? emptyDealValuation();

  const sectionBlocks = sections
    .map((s, i) => {
      const tagLine = (label: string, items: string[]) =>
        items.length ? `\n> ${label}：${items.join('；')}` : '';
      return `## ${i + 1}. ${s.title}
${s.body_md || '（待补充）'}${tagLine('事实', s.tags.facts)}${tagLine('假设', s.tags.assumptions)}${tagLine('推断', s.tags.inferences)}`;
    })
    .join('\n\n');

  const conditions = rec.conditions.length ? rec.conditions.map((c) => `- ${c}`).join('\n') : '- （无）';

  return `# ${memo.title}

> 投资上会报告（一级市场兼容 IC memo） · status: ${memo.status} · generated: ${memo.provenance.generated_at ?? memo.created_at} · model: ${memo.provenance.model ?? 'n/a'}

${memo.deal_context ? `> 交易条款：${memo.deal_context}\n` : ''}
${sectionBlocks}

## 投资建议
- 判断：**${VERDICT_LABEL[rec.verdict] ?? rec.verdict}**
- 理由：${rec.rationale || '待核实'}
- 条件：
${conditions}

## 一级市场估值体系
${valuationMarkdown(valuation)}

---

> 免责声明：${DEAL_DISCLAIMER}
`;
}
