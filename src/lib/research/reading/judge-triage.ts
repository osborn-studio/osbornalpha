/**
 * WP-B4 (Alpha side) runner: validate a Brain items file, select active theses, judge new items
 * with Jev under a budget and merge into the answers document. Pure apart from the injected fetch.
 * The items schema is a verbatim copy of Osborn-brain config/reading-triage-items.schema.json.
 */
import Ajv from 'ajv';
import { fail } from '../ingest/pa-v1/json.js';
import type { Thesis } from '../types';
import itemsSchema from './reading-triage-items.schema.json';
import { answersDocument, estimateForItem, itemsHash, judgeTriageItems, thesesHash, type JudgeTriageResult, type TriageAnswersDocument, type TriageItemsDocument, type TriageThesis } from './triage';

const ajv = new Ajv({ strict: true, allErrors: false });
const validateItems = ajv.compile<TriageItemsDocument>(itemsSchema as object);

export function loadItemsDocument(value: unknown): TriageItemsDocument {
  if (!validateItems(value)) fail('items_schema');
  return value as TriageItemsDocument;
}

const ACTIVE = new Set(['ACTIVE', 'WATCH', 'AT_RISK']);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
/** Structured entries (`ThesisPillar`, `ThesisCatalyst`) carry their wording in `text`; plain strings are accepted too. */
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : x && typeof x === 'object' && typeof (x as { text?: unknown }).text === 'string' ? (x as { text: string }).text : '')).filter(x => x.trim() !== '') : []);

/** Active theses in the triage shape; explicit pillars first, watch metrics as the fallback. */
export function thesesForTriage(theses: Thesis[]): TriageThesis[] {
  return theses.filter(t => ACTIVE.has(t.status)).map(t => {
    const pillars = texts(t.pillars);
    return { id: t.id, title: t.title, pillars: pillars.length ? pillars : strings(t.watch_metrics), invalidation_conditions: strings(t.invalidation_conditions), catalysts: texts(t.catalysts) };
  });
}

export interface RunJudgeTriageInput {
  items: TriageItemsDocument; theses: TriageThesis[]; existing: TriageAnswersDocument | null; fetch: typeof fetch; apiKey: string;
  maxCostUsd: number; now: () => string; dryRun?: boolean;
}
export interface RunJudgeTriageOutput {
  document: TriageAnswersDocument; judged: JudgeTriageResult | null;
  plan: { items: number; to_judge: number; skipped_existing: number; theses: number; estimated_micros: number };
}

export async function runJudgeTriage(input: RunJudgeTriageInput): Promise<RunJudgeTriageOutput> {
  if (input.theses.length === 0) fail('no_active_theses');
  const hash = itemsHash(input.items);
  if (input.existing && input.existing.items_hash !== hash) fail('items_mismatch');
  // Answers are only reusable against the same thesis context and question version.
  if (input.existing && input.existing.theses_hash !== thesesHash(input.theses)) fail('theses_mismatch');
  const existingAnswers = input.existing?.answers ?? [];
  const done = new Set(existingAnswers.map(a => a.item_id));
  const pending = input.items.items.filter(i => !done.has(i.item_id));
  const plan = { items: input.items.items.length, to_judge: pending.length, skipped_existing: input.items.items.length - pending.length, theses: input.theses.length,
    estimated_micros: pending.reduce((sum, i) => sum + estimateForItem(i, input.theses), 0) };
  if (input.dryRun) return { document: answersDocument({ items: input.items, theses: input.theses, answers: existingAnswers, generatedAt: input.now() }), judged: null, plan };
  const judged = await judgeTriageItems({ items: input.items.items, theses: input.theses, existing: existingAnswers, fetch: input.fetch, apiKey: input.apiKey, maxCostUsd: input.maxCostUsd, now: input.now });
  return { document: answersDocument({ items: input.items, theses: input.theses, answers: [...existingAnswers, ...judged.answers], generatedAt: input.now() }), judged, plan };
}
