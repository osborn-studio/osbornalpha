/**
 * Demo-only scoring fallback (docs/demo/README.md → 录制时发现的问题 #1).
 *
 * The product's score refresh (POST /api/analyst/scores) and decision review refresh
 * (/api/reviews) fetch daily bars from Eastmoney push2his only. When that host is unreachable
 * every candidate is skipped, so the demo ledger would show no fills and no scores.
 *
 * This script writes the same rows the product would write, using the product's own pure
 * functions (needsScoring + buildScoreWrites, needsScoring + buildReviewDrafts) and bars from the
 * local dev server's /api/kline route (Tencent / Sina fallback chain). Adjustment matches the
 * Eastmoney default used by the scorer: A-shares qfq, HK / US unadjusted.
 *
 *   npx tsx docs/demo/record/score-offline.ts
 *
 * Local Supabase only (refuses any other URL); scoped to the demo user.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), true);

import { createClient } from '@supabase/supabase-js';
import type { KlineBar } from '../../../src/lib/data/sources/eastmoney';
import { buildScoreWrites, needsScoring, KLINE_BARS } from '../../../src/lib/analyst/score-store';
import { coerceRecommendationRow, coerceScoreRow } from '../../../src/lib/analyst/store';
import { buildReviewDrafts } from '../../../src/lib/portfolio/review-store';
import { coerceDecisionRow } from '../../../src/lib/portfolio/store';
import { DEMO_EMAIL } from './demo-account';

// Mirrors the private needsScoring() in src/lib/portfolio/review-store.ts (not exported).
const REVIEW_MAX_AGE_MS = 130 * 86_400_000;
function reviewNeedsScoring(decision: { decided_at: string }, review: { forward_60d_pct: unknown } | undefined): boolean {
  if (!review) return true;
  if (review.forward_60d_pct !== null) return false;
  return Date.now() - new Date(decision.decided_at).getTime() < REVIEW_MAX_AGE_MS;
}

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error(`refusing non-local Supabase: ${url || '(unset)'}`);
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const sb = admin as any;

async function bars(ticker: string, market: string): Promise<KlineBar[] | null> {
  const adjust = market === 'A' ? 'qfq' : 'none';
  const res = await fetch(`${BASE}/api/kline/${encodeURIComponent(ticker)}?range=1y&adjust=${adjust}`);
  if (!res.ok) return null;
  const body = await res.json() as { bars?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> };
  const all = (body.bars ?? []).map((b) => ({
    time: new Date(b.time * 1000).toISOString().slice(0, 10),
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }));
  return all.slice(-KLINE_BARS); // same 120-bar window the product scorer requests
}

async function main() {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = list?.users.find((u) => u.email === DEMO_EMAIL);
  if (!user) throw new Error('demo user missing — run seed-demo.ts first');
  const userId = user.id;
  const now = new Date().toISOString();

  // ---- analyst recommendations
  const [{ data: recRows }, { data: scoreRows }] = await Promise.all([
    sb.from('recommendations').select('*').eq('user_id', userId),
    sb.from('recommendation_scores').select('*').eq('user_id', userId),
  ]);
  const recs = (recRows ?? []).map(coerceRecommendationRow);
  const scores = new Map((scoreRows ?? []).map(coerceScoreRow).map((s: any) => [s.recommendation_id, s]));
  const candidates = recs.filter((r: any) => needsScoring(r, scores.get(r.id) as any));
  const barsByTicker = new Map<string, KlineBar[] | null>();
  for (const r of candidates) if (!barsByTicker.has(r.ticker)) barsByTicker.set(r.ticker, await bars(r.ticker, r.market));
  const { scoreUpserts, fills, skipped } = buildScoreWrites(candidates, barsByTicker, userId, now);
  if (scoreUpserts.length) {
    const { error } = await sb.from('recommendation_scores').upsert(scoreUpserts, { onConflict: 'recommendation_id' });
    if (error) throw new Error(error.message);
  }
  for (const f of fills) {
    const { error } = await sb.from('recommendations').update({ fill_price: f.fill_price, fill_date: f.fill_date })
      .eq('id', f.id).eq('user_id', userId).is('fill_price', null);
    if (error) throw new Error(error.message);
  }
  console.log(`[score-offline] recommendations: scored ${scoreUpserts.length}, fills ${fills.length}, skipped ${skipped}`);

  // ---- portfolio decision reviews
  const [{ data: decRows }, { data: revRows }] = await Promise.all([
    sb.from('decisions').select('*').eq('user_id', userId).neq('status', 'cancelled'),
    sb.from('decision_reviews').select('*').eq('user_id', userId),
  ]);
  const decisions = (decRows ?? []).map(coerceDecisionRow);
  const reviews = new Map((revRows ?? []).map((r: any) => [r.decision_id, r]));
  const dCands = decisions.filter((d: any) => reviewNeedsScoring(d, reviews.get(d.id) as any));
  const dBars = new Map<string, KlineBar[] | null>();
  for (const d of dCands) if (!dBars.has(d.ticker)) dBars.set(d.ticker, await bars(d.ticker, d.market));
  const { drafts, skipped: dSkipped } = buildReviewDrafts(dCands, dBars);
  if (drafts.length) {
    const { error } = await sb.from('decision_reviews').upsert(drafts.map((x: any) => ({ ...x, user_id: userId, scored_at: now })), { onConflict: 'decision_id' });
    if (error) throw new Error(error.message);
  }
  console.log(`[score-offline] decisions: scored ${drafts.length}, skipped ${dSkipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
