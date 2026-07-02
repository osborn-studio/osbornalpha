// Pure position engine: derives holdings from a trade log using
// weighted-average cost. Buy fees capitalize into cost; sell fees reduce
// realized PnL. No shorting: an oversell throws so the API layer can 400.

export interface TradeLike {
  ticker: string;
  direction: 'buy' | 'sell';
  price: number;
  quantity: number;
  fee: number;
  currency: string;
  executed_at: string;
}

export interface PositionState {
  ticker: string;
  shares: number;
  avgCost: number;
  realizedPnl: number;
  currency: string;
  openedAt: string;
  closedAt: string | null;
}

export function computePositions(trades: TradeLike[]): PositionState[] {
  const byTicker = new Map<string, Array<TradeLike & { _i: number }>>();
  trades.forEach((tr, i) => {
    const list = byTicker.get(tr.ticker) ?? [];
    list.push({ ...tr, _i: i });
    byTicker.set(tr.ticker, list);
  });

  const out: PositionState[] = [];
  for (const [ticker, list] of byTicker) {
    list.sort((a, b) => a.executed_at.localeCompare(b.executed_at) || a._i - b._i);
    let shares = 0;
    let avgCost = 0;
    let realizedPnl = 0;
    let openedAt = list[0].executed_at;
    let closedAt: string | null = null;

    for (const tr of list) {
      if (tr.direction === 'buy') {
        if (shares === 0) {
          openedAt = tr.executed_at;
          closedAt = null;
        }
        avgCost = (shares * avgCost + tr.quantity * tr.price + tr.fee) / (shares + tr.quantity);
        shares += tr.quantity;
      } else {
        if (tr.quantity > shares) {
          throw new Error(`oversell: ${ticker} sell ${tr.quantity} > held ${shares}`);
        }
        realizedPnl += (tr.price - avgCost) * tr.quantity - tr.fee;
        shares -= tr.quantity;
        if (shares === 0) closedAt = tr.executed_at;
      }
    }

    out.push({
      ticker,
      shares,
      avgCost: shares > 0 ? avgCost : 0,
      realizedPnl,
      currency: list[list.length - 1].currency,
      openedAt,
      closedAt,
    });
  }
  return out;
}
