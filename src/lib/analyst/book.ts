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
  weight: number;
  opened_at: string;
}

export interface ClosedLot {
  ticker: string;
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
  avg_score: number | null;
  open_positions: number;
  avg_unrealized_pct: number | null;
  closed_lots: number;
  avg_realized_pct: number | null;
  unpriced: number;
  no_position_to_sell: number;
}

export interface Book { positions: BookPosition[]; closed: ClosedLot[]; summary: BookSummary }

interface Open { market: Market; units: number; avg_fill: number; opened_at: string }

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
    const pos = open.get(r.ticker);
    if (r.action === 'buy' || r.action === 'add') {
      if (!pos) open.set(r.ticker, { market: r.market, units: 1, avg_fill: r.fill_price, opened_at: r.recommended_at });
      else {
        pos.avg_fill = (pos.avg_fill * pos.units + r.fill_price) / (pos.units + 1);
        pos.units += 1;
      }
      continue;
    }
    // sell / trim
    if (!pos || pos.units === 0) { noPositionToSell += 1; continue; }
    const units = r.action === 'sell' ? pos.units : 1;
    closed.push({
      ticker: r.ticker, units, avg_fill: round2(pos.avg_fill), exit_price: r.fill_price,
      realized_pct: pctChange(pos.avg_fill, r.fill_price), closed_at: r.recommended_at, recommendation_id: r.id,
    });
    pos.units -= units;
    if (pos.units === 0) open.delete(r.ticker);
  }

  // Newest score per ticker supplies the book's last price. Rows are already in
  // recommended_at order, so on a last_close_date tie the later recommendation wins.
  const lastByTicker = new Map<string, { close: number; date: string }>();
  for (const { recommendation: r, score: s } of live) {
    if (!s || s.last_close === null || s.last_close_date === null) continue;
    const cur = lastByTicker.get(r.ticker);
    if (!cur || s.last_close_date >= cur.date) lastByTicker.set(r.ticker, { close: s.last_close, date: s.last_close_date });
  }

  const totalUnits = [...open.values()].reduce((a, p) => a + p.units, 0);
  const positions: BookPosition[] = [...open.entries()].map(([ticker, p]) => {
    const last = lastByTicker.get(ticker) ?? null;
    return {
      ticker,
      market: p.market,
      units: p.units,
      avg_fill: round2(p.avg_fill),
      last_close: last?.close ?? null,
      last_close_date: last?.date ?? null,
      unrealized_pct: last ? pctChange(p.avg_fill, last.close) : null,
      weight: totalUnits ? p.units / totalUnits : 0,
      opened_at: p.opened_at,
    };
  });

  const scorable = live.filter((r) => r.score?.hit !== null && r.score?.hit !== undefined);
  const hits = scorable.filter((r) => r.score!.hit === true).length;
  const scores = live.map((r) => r.score?.score).filter((v): v is number => typeof v === 'number');

  return {
    positions,
    closed,
    summary: {
      recommendations: live.length,
      scorable: scorable.length,
      hits,
      hit_rate: scorable.length ? round2((hits / scorable.length) * 100) : null,
      n_score: scores.length,
      avg_score: mean(scores),
      open_positions: positions.length,
      avg_unrealized_pct: mean(positions.map((p) => p.unrealized_pct).filter((v): v is number => v !== null)),
      closed_lots: closed.length,
      avg_realized_pct: mean(closed.map((c) => c.realized_pct)),
      unpriced,
      no_position_to_sell: noPositionToSell,
    },
  };
}
