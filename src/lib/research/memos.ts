/**
 * Memo engine (Research OS Phase 5 — Supabase Postgres).
 * generate → LLM (existing src/lib/data/sources/llm stack) → validate citations
 * → axiom check → persist with provenance {model, prompt_sha256,
 * source_document_ids, generated_at, edits[]} → research_audit_log.
 *
 * Column mapping: the app-level `provenance` field lives in the
 * research_memos.llm_provenance jsonb column; `enabled` on axioms maps to
 * research_axioms.active.
 */

import { audit, isUuid, type ResearchCtx } from './store';
import { getEntity } from './entities';
import { listSourcesByIds, listSourcesForEntity } from './sources';
import { checkMemoAxioms, hasBlockingFailure } from './axioms';
import { buildMemoPrompt, validateMemoDraft, type MemoDraft } from './memo-prompt';
import {
  RESEARCH_DISCLAIMER,
  type Axiom,
  type AxiomCheckResult,
  type DealRecommendation,
  type DealSection,
  type DealValuation,
  type EvidenceItem,
  type InvestmentMemo,
  type MemoProvenance,
  type MemoType,
  type SourceDocument,
} from './types';

const TABLE = 'research_memos';

export class MemoError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = 'MemoError';
  }
}

// ---------------------------------------------------------------------------
// Row mapping

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function rowToMemo(row: any): InvestmentMemo {
  return {
    id: row.id,
    title: row.title,
    company_ids: arr<string>(row.company_ids),
    theme_ids: arr<string>(row.theme_ids),
    one_line_conclusion: row.one_line_conclusion,
    thesis: row.thesis,
    supporting_evidence: arr<EvidenceItem>(row.supporting_evidence),
    counter_arguments: arr<EvidenceItem>(row.counter_arguments),
    key_variables: arr<string>(row.key_variables),
    invalidation_conditions: arr<string>(row.invalidation_conditions),
    open_questions: arr<string>(row.open_questions),
    related_impacts: arr<string>(row.related_impacts),
    confidence: row.confidence,
    axiom_check_results: arr<AxiomCheckResult>(row.axiom_check_results),
    provenance:
      row.llm_provenance && typeof row.llm_provenance === 'object'
        ? (row.llm_provenance as MemoProvenance)
        : {},
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Deal-memo (memo_type='deal') fields pass through transparently; a thesis
    // memo (default) leaves them absent so existing reads are unaffected (T4).
    memo_type: (row.memo_type as MemoType) ?? 'thesis',
    ...(row.deal_context !== undefined ? { deal_context: row.deal_context } : {}),
    ...(Array.isArray(row.sections) && row.sections.length
      ? { sections: row.sections as DealSection[] }
      : {}),
    ...(row.recommendation && typeof row.recommendation === 'object' && row.recommendation.verdict
      ? { recommendation: row.recommendation as DealRecommendation }
      : {}),
    ...(row.valuation && typeof row.valuation === 'object' && Object.keys(row.valuation).length
      ? { valuation: row.valuation as DealValuation }
      : {}),
  };
}

/** research_axioms.active ↔ app-level Axiom.enabled. */
export async function loadAxioms(ctx: ResearchCtx): Promise<Axiom[]> {
  const { data, error } = await ctx.supabase
    .from('research_axioms')
    .select('*')
    .eq('user_id', ctx.userId)
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    severity: row.severity,
    enabled: !!row.active,
    created_at: row.created_at,
  }));
}

export async function getMemo(ctx: ResearchCtx, id: string): Promise<InvestmentMemo | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToMemo(data) : null;
}

export async function listMemos(ctx: ResearchCtx): Promise<InvestmentMemo[]> {
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToMemo);
}

/**
 * Memos that reference an entity in either company_ids or theme_ids (jsonb
 * arrays). PostgREST `cs` (contains) matches a jsonb array containing the given
 * element; the two column filters are merged by id, newest first.
 */
export async function listMemosForEntity(
  ctx: ResearchCtx,
  entityId: string,
): Promise<InvestmentMemo[]> {
  if (!isUuid(entityId)) return [];
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', ctx.userId)
    .or(`company_ids.cs.["${entityId}"],theme_ids.cs.["${entityId}"]`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(rowToMemo);
}

// ---------------------------------------------------------------------------
// Generation

export interface LlmChatResult {
  content: string;
  model: string;
}

/** Injectable for tests; browser-triggered defaults are strictly BYO. */
export type LlmFn = (prompt: { system: string; user: string }) => Promise<LlmChatResult>;

/**
 * Browser/user production adapter. Research OS is outside the three platform
 * quota features, so this path must never fall back to a shared platform key.
 */
export const defaultLlm: LlmFn = async ({ system, user }) => {
  const [{ resolveUserLlm }, { chatResolved }] = await Promise.all([
    import('@/lib/llm/resolve'),
    import('@/lib/data/sources/llm'),
  ]);
  const resolved = await resolveUserLlm();
  if (!resolved) throw new Error('No user LLM provider configured');
  const r = await chatResolved(resolved, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: 3000,
    temperature: 0.3,
    responseJson: true,
    timeoutMs: 120_000,
  });
  return { content: r.content, model: resolved.model };
};

/**
 * Explicit shared-key adapter for trusted service entry points only. Callers
 * must authenticate before passing this function into a research workflow.
 */
export const trustedPlatformLlm: LlmFn = async ({ system, user }) => {
  const [{ resolvePlatformLlm }, { chatResolved }] = await Promise.all([
    import('@/lib/llm/resolve'),
    import('@/lib/data/sources/llm'),
  ]);
  const resolved = resolvePlatformLlm();
  if (!resolved) throw new Error('No LLM provider configured');
  const r = await chatResolved(resolved, {
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: 3000,
    temperature: 0.3,
    responseJson: true,
    timeoutMs: 120_000,
  });
  return { content: r.content, model: resolved.model };
};

export interface GenerateMemoInput {
  entity_id: string;
  question?: string;
}

export type GenerateMemoResult =
  | { memo: InvestmentMemo; llm: { source: 'llm'; model: string } }
  | { memo: null; llm: { source: 'no-key' | 'error'; message: string } };

/**
 * Generate a memo for an entity from its linked sources.
 * LLM failure / missing key returns a structured result — never throws for
 * provider problems (plan T5: {source:'no-key'|'error'} 不崩).
 */
export async function generateMemo(
  ctx: ResearchCtx,
  input: GenerateMemoInput,
  llm: LlmFn = defaultLlm,
): Promise<GenerateMemoResult> {
  const entity = await getEntity(ctx, input.entity_id);
  if (!entity) throw new MemoError('entity not found', 404);

  const sources = await listSourcesForEntity(ctx, entity.id);
  const prompt = buildMemoPrompt({ entity, sources, question: input.question });

  let content: string;
  let model: string;
  try {
    const r = await llm({ system: prompt.system, user: prompt.user });
    content = r.content;
    model = r.model;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const noKey = /no llm provider configured/i.test(message);
    return { memo: null, llm: { source: noKey ? 'no-key' : 'error', message } };
  }

  const { extractJson } = await import('@/lib/data/sources/llm');
  const parsed = extractJson(content);
  if (!parsed) {
    return { memo: null, llm: { source: 'error', message: 'LLM output was not parseable JSON' } };
  }
  const draft = validateMemoDraft(parsed, prompt.source_document_ids);

  const citedSources = await collectCitedSources(ctx, draft);
  const axiomResults = checkMemoAxioms(draft, citedSources, await loadAxioms(ctx));

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
    title: draft.title,
    company_ids: entity.type === 'THEME' ? [] : [entity.id],
    theme_ids: entity.type === 'THEME' ? [entity.id] : [],
    one_line_conclusion: draft.one_line_conclusion,
    thesis: draft.thesis,
    supporting_evidence: draft.supporting_evidence,
    counter_arguments: draft.counter_arguments,
    key_variables: draft.key_variables,
    invalidation_conditions: draft.invalidation_conditions,
    open_questions: draft.open_questions,
    related_impacts: draft.related_impacts,
    confidence: draft.confidence,
    axiom_check_results: axiomResults,
    llm_provenance: provenance,
    status: 'DRAFT',
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  await audit(ctx, 'memo.generate', id, {
    entity_id: entity.id,
    model,
    prompt_sha256: prompt.prompt_sha256,
    source_count: prompt.source_document_ids.length,
  });
  return { memo: (await getMemo(ctx, id))!, llm: { source: 'llm', model } };
}

async function collectCitedSources(
  ctx: ResearchCtx,
  draft: Pick<MemoDraft, 'supporting_evidence' | 'counter_arguments'>,
): Promise<SourceDocument[]> {
  const ids = new Set<string>();
  for (const ev of [...draft.supporting_evidence, ...draft.counter_arguments]) {
    for (const id of ev.source_document_ids) ids.add(id);
  }
  return listSourcesByIds(ctx, [...ids]);
}

// ---------------------------------------------------------------------------
// Editing + review

const PATCHABLE_FIELDS = [
  'title', 'one_line_conclusion', 'thesis', 'supporting_evidence',
  'counter_arguments', 'key_variables', 'invalidation_conditions',
  'open_questions', 'related_impacts', 'confidence',
] as const;
type PatchableField = (typeof PATCHABLE_FIELDS)[number];

/**
 * Patch editable memo fields; appends {at, fields} to provenance.edits and
 * re-runs the axiom check so the panel is always current.
 */
export async function patchMemo(
  ctx: ResearchCtx,
  id: string,
  patch: Partial<Record<PatchableField, unknown>>,
): Promise<InvestmentMemo> {
  const memo = await getMemo(ctx, id);
  if (!memo) throw new MemoError('memo not found', 404);
  if (memo.status === 'ARCHIVED') throw new MemoError('memo is archived', 409);

  const fields = PATCHABLE_FIELDS.filter((f) => patch[f] !== undefined);
  if (fields.length === 0) throw new MemoError('no editable fields in patch', 400);
  if (patch.confidence !== undefined && !['LOW', 'MEDIUM', 'HIGH'].includes(patch.confidence as string)) {
    throw new MemoError('confidence must be LOW | MEDIUM | HIGH', 400);
  }

  const now = new Date().toISOString();
  const next: Record<string, unknown> = {};
  for (const f of fields) next[f] = patch[f];

  const merged = { ...memo, ...next } as InvestmentMemo;
  const axiomResults = checkMemoAxioms(merged, await collectCitedSources(ctx, merged), await loadAxioms(ctx));
  const provenance: MemoProvenance = {
    ...memo.provenance,
    edits: [...(memo.provenance.edits ?? []), { at: now, fields: [...fields] }],
  };

  const { error } = await ctx.supabase
    .from(TABLE)
    .update({
      ...next,
      axiom_check_results: axiomResults,
      llm_provenance: provenance,
      updated_at: now,
    })
    .eq('user_id', ctx.userId)
    .eq('id', id);
  if (error) throw new Error(error.message);
  await audit(ctx, 'memo.update', id, { fields: [...fields] });
  return (await getMemo(ctx, id))!;
}

export interface ReviewResult {
  ok: boolean;
  memo: InvestmentMemo;
  results: AxiomCheckResult[];
}

/**
 * Review gate: re-runs axioms; any BLOCK failure rejects (API → 422),
 * otherwise the memo becomes REVIEWED with an audit trail.
 */
export async function reviewMemo(ctx: ResearchCtx, id: string): Promise<ReviewResult> {
  const memo = await getMemo(ctx, id);
  if (!memo) throw new MemoError('memo not found', 404);

  const results = checkMemoAxioms(memo, await collectCitedSources(ctx, memo), await loadAxioms(ctx));
  const now = new Date().toISOString();
  if (hasBlockingFailure(results)) {
    const { error } = await ctx.supabase
      .from(TABLE)
      .update({ axiom_check_results: results, updated_at: now })
      .eq('user_id', ctx.userId)
      .eq('id', id);
    if (error) throw new Error(error.message);
    await audit(ctx, 'memo.review', id, { outcome: 'REJECTED_BY_AXIOMS', results });
    return { ok: false, memo: (await getMemo(ctx, id))!, results };
  }
  const { error } = await ctx.supabase
    .from(TABLE)
    .update({ status: 'REVIEWED', axiom_check_results: results, updated_at: now })
    .eq('user_id', ctx.userId)
    .eq('id', id);
  if (error) throw new Error(error.message);
  await audit(ctx, 'memo.review', id, { outcome: 'REVIEWED', results });
  return { ok: true, memo: (await getMemo(ctx, id))!, results };
}

// ---------------------------------------------------------------------------
// Markdown export

function evidenceLines(items: EvidenceItem[], srcIndex: Map<string, number>): string {
  if (items.length === 0) return '- （无）';
  return items.map((ev) => {
    const refs = ev.source_document_ids.map((id) => `[${srcIndex.get(id) ?? '?'}]`).join('');
    const tag = ev.low_confidence ? ' **[LOW_CONFIDENCE：无来源]**' : '';
    return `- ${ev.claim} ${refs}${tag}`.trimEnd();
  }).join('\n');
}

function listLines(items: string[]): string {
  return items.length ? items.map((s) => `- ${s}`).join('\n') : '- （无）';
}

/** Ten-section markdown export with mandatory disclaimer footer. */
export function memoToMarkdown(memo: InvestmentMemo, sources: SourceDocument[]): string {
  const cited = new Set<string>();
  for (const ev of [...memo.supporting_evidence, ...memo.counter_arguments]) {
    for (const id of ev.source_document_ids) cited.add(id);
  }
  const citedSources = sources.filter((s) => cited.has(s.id));
  const srcIndex = new Map(citedSources.map((s, i) => [s.id, i + 1] as const));

  const axiomLines = memo.axiom_check_results.length
    ? memo.axiom_check_results.map((r) =>
        `- ${r.passed ? '✅' : r.severity === 'BLOCK' ? '⛔' : '⚠️'} ${r.axiom_code} (${r.severity}): ${r.message}`,
      ).join('\n')
    : '- （未运行）';

  const refLines = citedSources.length
    ? citedSources.map((s) => `${srcIndex.get(s.id)}. ${s.title}${s.url ? ` — ${s.url}` : ''}（${s.source_type}, trust ${s.trust_level}）`).join('\n')
    : '（无引用来源）';

  return `# ${memo.title}

> status: ${memo.status} · confidence: ${memo.confidence} · generated: ${memo.provenance.generated_at ?? memo.created_at} · model: ${memo.provenance.model ?? 'n/a'}

## 1. 一句话结论
${memo.one_line_conclusion || '（无）'}

## 2. 核心 Thesis
${memo.thesis || '（无）'}

## 3. 支持证据
${evidenceLines(memo.supporting_evidence, srcIndex)}

## 4. 反方观点
${evidenceLines(memo.counter_arguments, srcIndex)}

## 5. 关键变量
${listLines(memo.key_variables)}

## 6. 失效条件
${listLines(memo.invalidation_conditions)}

## 7. 需要继续验证的问题
${listLines(memo.open_questions)}

## 8. 相关公司/产业链影响
${listLines(memo.related_impacts)}

## 9. 引用来源
${refLines}

## 10. Axiom 检查结果
${axiomLines}

---

> 免责声明：${RESEARCH_DISCLAIMER}
`;
}
