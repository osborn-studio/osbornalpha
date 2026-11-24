// On-demand scoring of analyst recommendations (POST /api/analyst/scores).
// Same shape as src/lib/portfolio/review-store.ts: no cron, no service role;
// the signed-in user refreshes their own rows. Uses the shared kernel so a
// recommendation and a portfolio decision made at the same time score alike.
// First successful score also writes the recommendation's one-shot fill_price
// (= base close) which the paper book uses as the hypothetical fill.
// Every refresh also writes base_close/base_date to the score row: the same exchange-local bar as
// fill_price, but on the price basis the source reports NOW (qfq re-adjusted after A-share 送转/dividends,
// unadjusted after an HK/US split). The book prefers it over the frozen fill so fill and last_close share
// one basis. Known limit: last_close freezes once a ticker's calls stop being re-scored.

import type { Recommendation, RecommendationScore } from '@/lib/supabase/database.types';
import type { KlineBar } from '@/lib/data/sources/eastmoney';
import { fetchScoringBars } from '@/lib/scoring/daily-bars';
import { exchangeDate, scoreForward } from '@/lib/scoring/forward';
import { readAllRecommendations, readAllScores, requireUser } from './store';

// The original offline recorder imports this constant for its historical 120-bar fixture.
export const KLINE_BARS = 120;

export function needsScoring(rec: Recommendation, score: RecommendationScore | undefined): boolean {
  return rec.withdrawn_at === null && (!score || rec.fill_price === null || score.forward_60d_pct === null);
}

/** Why a candidate was not scored on this refresh. */
export interface SkipReasons {
  /** Missing prices, or an incomplete history that would regress a saved score. */
  price_unavailable: number;
  /** Available history cannot establish the original base session. */
  before_window: number;
  /** Fewer than 5 trading days since the call (or no usable base close yet). */
  too_recent: number;
}

export interface ScoreWrites {
  scoreUpserts: RecommendationScore[];
  fills: Array<{ id: string; fill_price: number; fill_date: string }>;
  skipped: number;
  reasons: SkipReasons;
}

export interface RefreshResult {
  scored: number;
  skipped: number;
  reasons: SkipReasons;
  nextTicker?: string;
}

const noSkips = (): SkipReasons => ({ price_unavailable: 0, before_window: 0, too_recent: 0 });

// At the left edge of a truncated history, a weekend before a Monday bar is provable.
// Other holidays and suspensions are handled naturally when bars bracket the call.
function firstWeekdayOnOrAfter(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) date.setUTCDate(date.getUTCDate() + (weekday === 6 ? 2 : 1));
  return date.toISOString().slice(0, 10);
}

export function buildScoreWrites(
  candidates: Recommendation[],
  barsByTicker: Map<string, KlineBar[] | null>,
  userId: string,
  now: string,
  priorScores: ReadonlyMap<string, RecommendationScore> = new Map(),
  listingDates: ReadonlyMap<string, string> = new Map(),
): ScoreWrites {
  const scoreUpserts: ScoreWrites['scoreUpserts'] = [];
  const fills: ScoreWrites['fills'] = [];
  const reasons = noSkips();
  for (const r of candidates) {
    const bars = barsByTicker.get(r.ticker);
    if (!bars) { reasons.price_unavailable += 1; continue; }
    if (bars.length === 0) { reasons.too_recent += 1; continue; }
    const previous = priorScores.get(r.id);
    const knownBase = r.fill_date ?? previous?.base_date;
    const callDate = exchangeDate(r.recommended_at, r.market);
    const firstDate = bars[0].time;
    if (firstDate > callDate && firstDate !== knownBase && firstDate !== listingDates.get(r.ticker)
        && firstDate !== firstWeekdayOnOrAfter(callDate)) {
      reasons.before_window += 1;
      continue;
    }
    const s = scoreForward({ market: r.market, action: r.action, at: r.recommended_at, confidence: r.confidence }, bars);
    if (!s) { reasons.too_recent += 1; continue; }
    if ((knownBase && s.base_date !== knownBase)
        || (previous?.last_close_date && s.last_close_date < previous.last_close_date)
        || (previous?.forward_20d_pct != null && s.forward_20d_pct === null)
        || (previous?.forward_60d_pct != null && s.forward_60d_pct === null)) {
      reasons.price_unavailable += 1;
      continue;
    }
    scoreUpserts.push({
      recommendation_id: r.id, user_id: userId, scored_at: now,
      forward_5d_pct: s.forward_5d_pct, forward_20d_pct: s.forward_20d_pct, forward_60d_pct: s.forward_60d_pct,
      hit: s.hit, score: s.score, calibration_bucket: s.calibration_bucket,
      last_close: s.last_close, last_close_date: s.last_close_date,
      base_close: s.base_close, base_date: s.base_date,
    });
    // Fill = close of the call's exchange-local day (an intraday look-ahead of a few hours, accepted by design).
    if (r.fill_price === null) fills.push({ id: r.id, fill_price: s.base_close, fill_date: s.base_date });
  }
  const skipped = reasons.price_unavailable + reasons.before_window + reasons.too_recent;
  return { scoreUpserts, fills, skipped, reasons };
}

// Each page scores every pending recommendation on the selected tickers. A ticker cursor
// remains valid when another page finishes scoring and drops records from the candidate set.
const TICKERS_PER_PAGE = 4;

export async function refreshRecommendationScores(afterTicker?: string): Promise<RefreshResult> {
  const { supabase, userId } = await requireUser();
  const [recs, scoreRows] = await Promise.all([readAllRecommendations(supabase, userId), readAllScores(supabase, userId)]);
  const scores = new Map(scoreRows.map((s) => [s.recommendation_id, s]));
  let candidates = recs.filter((r) => needsScoring(r, scores.get(r.id)));
  let nextTicker: string | undefined;
  if (afterTicker !== undefined) {
    const remaining = [...new Set(candidates.map((r) => r.ticker))].filter((ticker) => ticker > afterTicker).sort();
    const page = remaining.slice(0, TICKERS_PER_PAGE);
    if (remaining.length > page.length) nextTicker = page[page.length - 1];
    const selected = new Set(page);
    candidates = candidates.filter((r) => selected.has(r.ticker));
  }
  if (candidates.length === 0) return { scored: 0, skipped: 0, reasons: noSkips() };

  const barsByTicker = await fetchScoringBars(candidates.map((r) => r.ticker));
  // Only a verified listing date can distinguish a new IPO from a provider's truncated history.
  const possibleIpos = candidates.filter((r) => {
    const first = barsByTicker.get(r.ticker)?.[0]?.time;
    return first && first > exchangeDate(r.recommended_at, r.market) && !r.fill_date && !scores.get(r.id)?.base_date;
  });
  const tickers = [...new Set(possibleIpos.map((r) => r.ticker))];
  const listingDates = new Map<string, string>();
  if (tickers.length) {
    const { data } = await supabase.from('stocks_universe').select('ticker,list_date').in('ticker', tickers)
      .returns<Array<{ ticker: string; list_date: string | null }>>();
    for (const row of data ?? []) if (row.list_date) listingDates.set(row.ticker, row.list_date);
  }
  const { scoreUpserts, fills, skipped, reasons } = buildScoreWrites(candidates, barsByTicker, userId, new Date().toISOString(), scores, listingDates);

  // An older refresh must not replace a row committed by a concurrent refresh. Insert new
  // scores only if absent and compare the observed version before updating an existing score.
  const scoreTable = () => (supabase as any).from('recommendation_scores');
  const persisted = new Set<string>();
  const inserts = scoreUpserts.filter((row) => !scores.has(row.recommendation_id));
  if (inserts.length) {
    const { data, error } = await scoreTable().upsert(inserts, {
      onConflict: 'recommendation_id', ignoreDuplicates: true,
    }).select('recommendation_id');
    if (error) throw new Error(error.message);
    for (const row of data) persisted.add(row.recommendation_id);
  }
  const updates = scoreUpserts.filter((row) => scores.has(row.recommendation_id));
  for (let i = 0; i < updates.length; i += 8) {
    await Promise.all(updates.slice(i, i + 8).map(async (row) => {
      const previous = scores.get(row.recommendation_id)!;
      const { data, error } = await scoreTable().update(row).eq('user_id', userId)
        .eq('recommendation_id', row.recommendation_id).eq('scored_at', previous.scored_at).select('recommendation_id');
      if (error) throw new Error(error.message);
      if (data.length) persisted.add(row.recommendation_id);
    }));
  }
  // A previous request can finish its score write and fail before setting the one-shot fill.
  // Repair from that stored base even if today's feed is down or has re-adjusted its prices.
  const pendingFills = new Map(fills.filter((f) => persisted.has(f.id)).map((f) => [f.id, f]));
  for (const r of candidates) {
    const previous = scores.get(r.id);
    if (r.fill_price === null && previous?.base_date && previous.base_close != null) {
      pendingFills.set(r.id, { id: r.id, fill_price: previous.base_close, fill_date: previous.base_date });
    }
  }
  const fillRows = [...pendingFills.values()];
  for (let i = 0; i < fillRows.length; i += 8) {
    await Promise.all(fillRows.slice(i, i + 8).map(async (f) => {
      const { error } = await (supabase as any).from('recommendations')
        .update({ fill_price: f.fill_price, fill_date: f.fill_date })
        .eq('id', f.id).eq('user_id', userId).is('fill_price', null);
      if (error) throw new Error(error.message);
    }));
  }
  return { scored: persisted.size, skipped, reasons, ...(nextTicker ? { nextTicker } : {}) };
}
