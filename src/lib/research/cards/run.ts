/**
 * WP-A8 runner: one week of the judgment ledger (S4 pool) → evidence → ≤5 cards
 * (generated through the platform model) → research_cards (Supabase). Idempotent
 * per (week, thesis, kind). Ledger loading is injectable so the pipeline is
 * testable without the S4 pool.
 */
import { randomUUID } from 'node:crypto';
import { listSourcesSince } from '../fanout/run';
import { loadAxioms, type LlmFn } from '../memos';
import { seedAxioms } from '../seed';
import type { Axiom } from '../types';
import { transaction, type S4Actor } from '../s4/db';
import { audit, type ResearchCtx } from '../store';
import { getThesis } from '../theses';
import type { ResearchCard, SourceDocument } from '../types';
import { collectEvidence, hostOf, type LedgerRow } from './evidence';
import { generateCard } from './generate';
import { MAX_EVIDENCE_CARDS, selectCards, type CounterCardReason } from './select';

const CARDS = 'research_cards';
const EPOCH = '1970-01-01T00:00:00.000Z';

export function weekOfMonday(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
export const weekEnd = (weekOf: string): string => new Date(Date.parse(`${weekOf}T00:00:00Z`) + 7 * 86_400_000).toISOString();

/** Default ledger loader: the owner's judgments created inside [weekOf, weekOf+7d). */
export async function loadLedgerWeek(actor: S4Actor, weekOf: string): Promise<LedgerRow[]> {
  return transaction(actor, async db => (await db.query(
    `select id,source_id,thesis_id,question_id,backend,selected,abstained from public.research_judgments
      where user_id=$1 and created_at >= $2::timestamptz and created_at < $3::timestamptz order by created_at,id`,
    [actor.userId, `${weekOf}T00:00:00Z`, weekEnd(weekOf)])).rows as LedgerRow[]);
}

export interface RunCardsOptions { weekOf?: string; llm: LlmFn; loadLedger?: (actor: S4Actor, weekOf: string) => Promise<LedgerRow[]>; dryRun?: boolean; runId?: string }
export const CARD_AXIOMS = ['AX005', 'AX006'] as const;

/**
 * The card gate is mandatory: an installation seeded before AX006 existed gets
 * the seeds backfilled; a deliberately disabled or still-missing card axiom
 * fails the run closed instead of generating unchecked cards.
 */
export async function ensureCardAxioms(ctx: ResearchCtx): Promise<Axiom[]> {
  let axioms = await loadAxioms(ctx);
  const present = (code: string) => axioms.some(a => a.code === code);
  if (!CARD_AXIOMS.every(present)) { await seedAxioms(ctx); axioms = await loadAxioms(ctx); }
  for (const code of CARD_AXIOMS) {
    const a = axioms.find(x => x.code === code);
    if (!a) throw new Error(`card axiom ${code} is missing; seeding failed`);
    if (!a.enabled) throw new Error(`card axiom ${code} is disabled; change cards cannot be generated without the trading-advice gate`);
  }
  return axioms;
}

export interface RunCardsSummary {
  run_id: string; week_of: string; ledger_rows: number; theses_with_evidence: number; excluded_private: number;
  selected: number; counter_card: CounterCardReason; written: number; blocked: number; skipped_existing: number; skipped_limit: number;
  cards: Array<{ kind: string; thesis_id: string; title: string; status: string; support: number; counter: number }>;
}

export async function runCards(ctx: ResearchCtx, actor: S4Actor, opts: RunCardsOptions): Promise<RunCardsSummary> {
  const run_id = opts.runId ?? randomUUID();
  const weekOf = opts.weekOf ?? weekOfMonday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf) || !Number.isFinite(Date.parse(weekOf))) throw new Error('weekOf must be YYYY-MM-DD');
  const rows = await (opts.loadLedger ?? loadLedgerWeek)(actor, weekOf);
  const allSources = await listSourcesSince(ctx, EPOCH);
  const priorHosts = new Set(allSources.filter(s => (s.available_at ?? s.ingested_at) < `${weekOf}T00:00:00.000Z`).map(s => hostOf(s.url)).filter(Boolean));
  const evidence = collectEvidence({ rows, sources: allSources, priorHosts });
  const selection = selectCards(evidence.theses);
  const summary: RunCardsSummary = { run_id, week_of: weekOf, ledger_rows: rows.length, theses_with_evidence: evidence.theses.length, excluded_private: evidence.excluded_private,
    selected: selection.cards.length, counter_card: selection.counter_card, written: 0, blocked: 0, skipped_existing: 0, skipped_limit: 0, cards: [] };
  if (opts.dryRun) {
    summary.cards = selection.cards.map(c => ({ kind: c.kind, thesis_id: c.thesis_id, title: '(dry-run)', status: 'dry-run', support: c.evidence.support.length, counter: c.evidence.counter.length }));
    return summary;
  }
  const { data: existingRows, error: existingError } = await ctx.supabase.from(CARDS).select('thesis_id, kind').eq('user_id', ctx.userId).eq('week_of', weekOf);
  if (existingError) throw new Error(existingError.message);
  const persisted = (existingRows ?? []) as Array<{ thesis_id: string; kind: string }>;
  const existing = new Set(persisted.map(r => `${r.thesis_id}|${r.kind}`));
  // Weekly limits count persisted cards too: ≤MAX_EVIDENCE_CARDS evidence and one counter card per week.
  let evidenceSlots = MAX_EVIDENCE_CARDS - persisted.filter(r => r.kind === 'evidence').length;
  let counterSlots = 1 - persisted.filter(r => r.kind === 'counter').length;
  const axioms = await ensureCardAxioms(ctx);
  const byId = new Map(allSources.map(s => [s.id, s]));
  for (const card of selection.cards) {
    if (existing.has(`${card.thesis_id}|${card.kind}`)) { summary.skipped_existing++; continue; }
    if (card.kind === 'evidence' ? evidenceSlots <= 0 : counterSlots <= 0) { summary.skipped_limit++; continue; }
    if (card.kind === 'evidence') evidenceSlots--; else counterSlots--;
    const thesis = await getThesis(ctx, card.thesis_id);
    if (!thesis) continue;
    const sources = [...card.evidence.support, ...card.evidence.counter].map(e => byId.get(e.source_id)).filter((s): s is SourceDocument => !!s);
    const generated = await generateCard({ card, thesis, sources, weekOf, runId: run_id, llm: opts.llm, axioms, excludedPrivate: evidence.excluded_private });
    const id = randomUUID();
    const row: ResearchCard = { id, created_at: new Date().toISOString(), ...generated };
    const { error } = await ctx.supabase.from(CARDS).insert({ ...row, user_id: ctx.userId });
    if (error) throw new Error(error.message);
    summary.written++;
    if (row.status === 'blocked') summary.blocked++;
    summary.cards.push({ kind: row.kind, thesis_id: row.thesis_id, title: row.title, status: row.status, support: row.evidence.support, counter: row.evidence.counter });
    await audit(ctx, 'card.generate', id, { week_of: weekOf, thesis_id: row.thesis_id, kind: row.kind, status: row.status, model: row.generation.model, prompt_sha256: row.generation.prompt_sha256, assertions: row.assertions.length, unsupported_dropped: row.generation.unsupported_dropped });
  }
  const { cards: _cards, ...detail } = summary;
  await audit(ctx, 'cards.run', null, detail);
  return summary;
}

export async function listCards(ctx: ResearchCtx, weekOf?: string): Promise<ResearchCard[]> {
  let q = ctx.supabase.from(CARDS).select('*').eq('user_id', ctx.userId).order('week_of', { ascending: false }).order('kind', { ascending: true }).order('created_at', { ascending: true }).limit(500);
  if (weekOf) q = q.eq('week_of', weekOf);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(r => ({ id: r.id, week_of: r.week_of, thesis_id: r.thesis_id, kind: r.kind, title: r.title, fields: r.fields ?? {}, assertions: r.assertions ?? [], evidence: r.evidence ?? {}, generation: r.generation ?? {}, axiom_results: r.axiom_results ?? [], status: r.status, created_at: r.created_at }));
}
