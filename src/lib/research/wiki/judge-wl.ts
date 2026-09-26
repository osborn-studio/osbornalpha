/**
 * WP-B3 (Alpha side) runner: validate a Brain pairs file, re-check that every referenced
 * Source is public, judge new pairs with Jev under a budget, and merge into the answers
 * document. Pure apart from the injected fetch and ctx; the script owns file I/O.
 * The pairs schema is a verbatim copy of Osborn-brain config/wiki-wl-pairs.schema.json.
 */
import Ajv from 'ajv';
import { fail } from '../ingest/pa-v1/json.js';
import type { ResearchCtx } from '../store';
import pairsSchema from './wiki-wl-pairs.schema.json';
import { answersDocument, buildWlRequest, estimateForPair, judgeWlPairs, pairsHash, type JudgeResult, type WlAnswersDocument, type WlPairsDocument } from './wl';

/** 100 UUIDs ≈ 3.7 KB of query string: safely under gateway request-line limits. */
const PUBLIC_CHECK_BATCH = 100;
const ajv = new Ajv({ strict: true, allErrors: false });
const validatePairs = ajv.compile<WlPairsDocument>(pairsSchema as object);

export function loadPairsDocument(value: unknown): WlPairsDocument {
  if (!validatePairs(value)) fail('pairs_schema');
  return value as WlPairsDocument;
}

/** Every candidate and cited source must exist for this owner with permission = public. */
export async function verifyPublicSources(ctx: ResearchCtx, doc: WlPairsDocument): Promise<{ checked: number }> {
  const ids = [...new Set(doc.pairs.flatMap(p => [p.candidate.source_id, ...p.cited_snippets.map(s => s.source_id)]))].sort();
  if (ids.length === 0) return { checked: 0 };
  // Bounded batches: PostgREST caps a response at max_rows (1000) and long id lists blow the URL limit.
  const seen = new Map<string, string>();
  for (let i = 0; i < ids.length; i += PUBLIC_CHECK_BATCH) {
    const batch = ids.slice(i, i + PUBLIC_CHECK_BATCH);
    const { data, error } = await ctx.supabase.from('research_source_documents').select('id,permission').eq('user_id', ctx.userId).in('id', batch);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) seen.set(r.id, r.permission);
  }
  for (const id of ids) if (seen.get(id) !== 'public') fail('not_public');
  return { checked: ids.length };
}

export interface RunJudgeInput {
  pairs: WlPairsDocument;
  existing: WlAnswersDocument | null;
  fetch: typeof fetch;
  apiKey: string;
  maxCostUsd: number;
  now: () => string;
  dryRun?: boolean;
}
export interface RunJudgeOutput {
  document: WlAnswersDocument;
  judged: JudgeResult | null;
  plan: { pairs: number; to_judge: number; skipped_existing: number; estimated_micros: number };
}

export async function runJudgeWl(input: RunJudgeInput): Promise<RunJudgeOutput> {
  const hash = pairsHash(input.pairs);
  if (input.existing && input.existing.pairs_hash !== hash) fail('pairs_mismatch');
  const existingAnswers = input.existing?.answers ?? [];
  const done = new Set(existingAnswers.map(a => a.pair_id));
  const pending = input.pairs.pairs.filter(p => !done.has(p.pair_id));
  const plan = { pairs: input.pairs.pairs.length, to_judge: pending.length, skipped_existing: input.pairs.pairs.length - pending.length,
    estimated_micros: pending.reduce((sum, p) => sum + estimateForPair(p), 0) };
  if (input.dryRun) return { document: answersDocument({ pairs: input.pairs, answers: existingAnswers, generatedAt: input.now() }), judged: null, plan };
  const judged = await judgeWlPairs({ pairs: input.pairs.pairs, existing: existingAnswers, fetch: input.fetch, apiKey: input.apiKey, maxCostUsd: input.maxCostUsd, now: input.now });
  return { document: answersDocument({ pairs: input.pairs, answers: [...existingAnswers, ...judged.answers], generatedAt: input.now() }), judged, plan };
}
export { buildWlRequest };
