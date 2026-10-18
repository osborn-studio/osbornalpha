// Equal-weight paper book for one analyst. Pure and replayable: every input is
// already stored (recommendations with their one-shot fill_price, plus scores
// carrying last_close), so no live quotes are needed and the same rows always
// produce the same book.
//
// Rules (spec §6): buy/add opens 1 notional unit at fill_price; trim removes 1
// unit; sell removes all units; hold/pass leave the book alone. Unpriced rows,
// sells with no position, and withdrawn rows are counted, never booked. No cash,
// NAV, fees, FX or corporate-action adjustments.

import type { Market, Recommendation, RecommendationScore } from '@/lib/supabase/database.types';

export interface BookInput { recommendation: Recommendation; score: RecommendationScore | null }

export interface BookPosition {
  ticker: string;
  market: Market;
  units: number;
  avg_fill: number;
  last_close: number | null;
  last_close_date: string | null;
  unrealized_pct: number | null;
  /** Share of open units (units / total open units). Equal-notional-per-unit model, not market-value or cost weight; spans all markets. */
  weight: number;
  opened_at: string;
}

export interface ClosedLot {
  ticker: string;
  market: Market;
  units: number;
  avg_fill: number;
  exit_price: number;
  realized_pct: number;
  closed_at: string;
  recommendation_id: string;
}

export interface BookSummary {
  recommendations: number;
  scorable: number;
  hits: number;
  hit_rate: number | null;
  n_score: number;
  /** Mean direction-adjusted score (20d, or 5d when 20d is missing) over scored rows. */
  avg_score: number | null;
  open_positions: number;
  avg_unrealized_pct: number | null;
  n_unrealized: number;
  closed_lots: number;
  closed_units: number;
  avg_realized_pct: number | null;
  unpriced: number;
  no_position_to_sell: number;
}

export interface Book { positions: BookPosition[]; closed: ClosedLot[]; summary: BookSummary }

interface Open { ticker: string; market: Market; units: number; avg_fill: number; opened_at: string }

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pctChange = (from: number, to: number) => round2((to / from - 1) * 100);

function byTime(a: BookInput, b: BookInput): number {
  const ra = a.recommendation, rb = b.recommendation;
  return ra.recommended_at.localeCompare(rb.recommended_at)
    || ra.created_at.localeCompare(rb.created_at)
    || ra.id.localeCompare(rb.id);
}

export function buildBook(rows: BookInput[]): Book {
  const live = rows.filter((r) => r.recommendation.withdrawn_at === null).sort(byTime);
  const open = new Map<string, Open>();
  const closed: ClosedLot[] = [];
  let unpriced = 0;
  let noPositionToSell = 0;

  for (const { recommendation: r } of live) {
    if (r.action === 'hold' || r.action === 'pass') continue;
    if (r.fill_price === null) { unpriced += 1; continue; }
    const key = `${r.market}:${r.ticker}`;
    const pos = open.get(key);
    if (r.action === 'buy' || r.action === 'add') {
      if (!pos) open.set(key, { ticker: r.ticker, market: r.market, units: 1, avg_fill: r.fill_price, opened_at: r.recommended_at });
      else {
        pos.avg_fill = (pos.avg_fill * pos.units + r.fill_price) / (pos.units + 1);
        pos.units += 1;
      }
      continue;
    }
    // sell / trim
    if (!pos) { noPositionToSell += 1; continue; }
    const units = r.action === 'sell' ? pos.units : 1;
    closed.push({
      ticker: r.ticker, market: r.market, units, avg_fill: pos.avg_fill, exit_price: r.fill_price,
      realized_pct: pctChange(pos.avg_fill, r.fill_price), closed_at: r.recommended_at, recommendation_id: r.id,
    });
    pos.units -= units;
    if (pos.units === 0) open.delete(key);
  }

  // Newest score per market:ticker supplies the book's last price. Rows are already in
  // recommended_at order, so on a last_close_date tie the later recommendation wins.
  const lastByKey = new Map<string, { close: number; date: string }>();
  for (const { recommendation: r, score: s } of live) {
    if (!s || s.last_close === null || s.last_close_date === null) continue;
    const key = `${r.market}:${r.ticker}`;
    const cur = lastByKey.get(key);
    if (!cur || s.last_close_date >= cur.date) lastByKey.set(key, { close: s.last_close, date: s.last_close_date });
  }

  const closedUnits = closed.reduce((a, c) => a + c.units, 0);
  const totalUnits = [...open.values()].reduce((a, p) => a + p.units, 0);
  // Positions come out in insertion order (first buy of each market:ticker).
  const positions: BookPosition[] = [...open.entries()].map(([key, p]) => {
    const last = lastByKey.get(key) ?? null;
    return {
      ticker: p.ticker,
      market: p.market,
      units: p.units,
      avg_fill: p.avg_fill,
      last_close: last?.close ?? null,
      last_close_date: last?.date ?? null,
      unrealized_pct: last ? pctChange(p.avg_fill, last.close) : null,
      weight: totalUnits ? p.units / totalUnits : 0,
      opened_at: p.opened_at,
    };
  });

  const unrealized = positions.map((p) => p.unrealized_pct).filter((v): v is number => v !== null);
  const hitFlags = live.map((r) => r.score?.hit).filter((h): h is boolean => typeof h === 'boolean');
  const hits = hitFlags.filter(Boolean).length;
  const scores = live.map((r) => r.score?.score).filter((v): v is number => typeof v === 'number');

  return {
    positions,
    closed,
    summary: {
      recommendations: live.length,
      scorable: hitFlags.length,
      hits,
      hit_rate: hitFlags.length ? round2((hits / hitFlags.length) * 100) : null,
      n_score: scores.length,
      avg_score: mean(scores),
      open_positions: positions.length,
      avg_unrealized_pct: mean(unrealized),
      n_unrealized: unrealized.length,
      closed_lots: closed.length,
      closed_units: closedUnits,
      // Per unit, not per lot: a 2-unit sell weighs twice a 1-unit trim (spec §6).
      avg_realized_pct: closedUnits ? round2(closed.reduce((a, c) => a + c.units * c.realized_pct, 0) / closedUnits) : null,
      unpriced,
      no_position_to_sell: noPositionToSell,
    },
  };
}
