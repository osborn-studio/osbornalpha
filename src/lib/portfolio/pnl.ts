// Pure cockpit math: positions × live prices → P&L; decisions → discipline lookups.
// Kept free of hooks/fetch so the node-env vitest covers it.

import type { Position, Decision } from '@/lib/supabase/database.types';
import { classifyMarket } from '@/lib/utils';

export interface Pnl { value: number; pct: number }

export function unrealizedPnl(p: Position, price: number | null | undefined): Pnl | null {
  if (!price || p.shares <= 0 || p.closed_at) return null;
  const value = (price - p.avg_cost) * p.shares;
  const pct = p.avg_cost > 0 ? ((price - p.avg_cost) / p.avg_cost) * 100 : 0;
  return { value, pct };
}

export interface PortfolioSummaryOut {
  marketValue: number; unrealized: number; realized: number; openCount: number;
}

export function portfolioSummary(
  positions: Position[],
  prices: Record<string, number | null | undefined>,
): PortfolioSummaryOut {
  let marketValue = 0, unrealized = 0, realized = 0, openCount = 0;
  for (const p of positions) {
    realized += p.realized_pnl;
    if (p.shares <= 0 || p.closed_at) continue;
    openCount++;
    const price = prices[p.ticker];
    if (!price) continue;
    marketValue += price * p.shares;
    const u = unrealizedPnl(p, price);
    if (u) unrealized += u.value;
  }
  return { marketValue, unrealized, realized, openCount };
}

export type PortfolioCurrency = 'CNY' | 'USD' | 'HKD';

export interface CurrencyMarketValue {
  value: number;
  positions: number;
  complete: boolean;
}

export function portfolioMarketValueByCurrency(
  positions: Position[],
  prices: Record<string, number | null | undefined>,
): Record<PortfolioCurrency, CurrencyMarketValue> {
  const buckets: Record<PortfolioCurrency, CurrencyMarketValue> = {
    CNY: { value: 0, positions: 0, complete: true },
    USD: { value: 0, positions: 0, complete: true },
    HKD: { value: 0, positions: 0, complete: true },
  };

  for (const position of positions) {
    if (position.shares <= 0 || position.closed_at) continue;
    const market = classifyMarket(position.ticker);
    const currency: PortfolioCurrency | null = market === 'A'
      ? 'CNY'
      : market === 'US'
        ? 'USD'
        : market === 'HK'
          ? 'HKD'
          : null;
    if (!currency) continue;

    const bucket = buckets[currency];
    bucket.positions += 1;
    const price = prices[position.ticker];
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      bucket.complete = false;
      continue;
    }
    bucket.value += price * position.shares;
  }

  return buckets;
}

export function latestOpenDecision(decisions: Decision[], ticker: string): Decision | null {
  const open = decisions.filter((d) => d.ticker === ticker && d.status === 'open');
  if (!open.length) return null;
  return open.reduce((a, b) => (a.decided_at >= b.decided_at ? a : b));
}
