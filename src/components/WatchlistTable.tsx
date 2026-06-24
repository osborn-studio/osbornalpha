'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getStockOrStub } from '@/lib/data/mock';
import { formatPrice, formatPct, changeClass } from '@/lib/utils';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import {
  deriveRating, deriveRiskLevel, deriveTargetPrice, deriveValuationRange,
  rangePosition, type Rating, type RatingTone,
} from '@/lib/stocks/metrics';

interface Group { id: string; name: string; tickers: string[] }

interface Row {
  ticker: string; name: string; group: string; currency: string;
  price: number; changePct: number;
  rating: Rating | null; risk: number | null;
  target: number | null; range: { min: number; max: number } | null;
}

type SortKey = 'none' | 'price' | 'change' | 'rating' | 'risk' | 'target';

// Rating badges use FIXED semantic colors (buy=green, sell=red), independent of
// the 涨跌 color scheme — in CN mode `up` is red, which would wrongly tint BUY red.
const RATING_CLASS: Record<RatingTone, string> = {
  'strong-buy': 'bg-emerald-600 text-white font-bold',
  buy: 'bg-emerald-500 text-white',
  hold: 'bg-amber-500 text-white',
  sell: 'bg-red-500 text-white',
  'strong-sell': 'bg-red-600 text-white font-bold',
};

function RatingBadge({ rating }: { rating: Rating | null }) {
  if (!rating) return <span className="text-text-muted">--</span>;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[11px] leading-tight ${RATING_CLASS[rating.tone]}`}>
      {rating.label}
    </span>
  );
}

function RiskBars({ level }: { level: number | null }) {
  if (!level) return <span className="text-text-muted">--</span>;
  // Fixed semantic colors: low risk green, mid amber, high red (scheme-independent).
  const color = level <= 2 ? 'bg-emerald-500' : level === 3 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = level <= 2 ? 'text-emerald-500' : level === 3 ? 'text-amber-500' : 'text-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-end gap-[2px]" aria-label={`风险 ${level} 级`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i}
            className={`w-[3px] rounded-sm ${i <= level ? color : 'bg-bg-elevated'}`}
            style={{ height: `${4 + i * 2}px` }} />
        ))}
      </div>
      <span className={`text-[11px] ${textColor}`}>{level}级</span>
    </div>
  );
}

function ValuationCell({ price, range, currency }: { price: number; range: Row['range']; currency: string }) {
  if (!range) return <span className="text-text-muted">--</span>;
  const pos = rangePosition(price, range);
  return (
    <div className="w-[88px]">
      <div className="flex justify-between text-[10px] text-text-dim tabular-nums">
        <span>{Math.round(range.min)}</span>
        <span>{Math.round(range.max)}</span>
      </div>
      <div className="relative mt-1 h-1 rounded-full bg-bg-elevated">
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent"
          style={{ left: `${pos * 100}%` }}
          title={`现价 ${currency}${formatPrice(price)}`}
        />
      </div>
    </div>
  );
}

export function WatchlistTable({ groups, quotes, loading = false }: { groups: Group[]; quotes: Record<string, LiveQuote | null>; loading?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [asc, setAsc] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const g of groups) {
      for (const ticker of g.tickers) {
        if (seen.has(ticker)) continue;
        seen.add(ticker);
        const s = getStockOrStub(ticker);
        const q = quotes[ticker];
        const price = (q && q.price > 0 ? q.price : s?.price) ?? 0;
        out.push({
          ticker,
          name: q?.name || s?.name || ticker,
          group: g.name,
          currency: s?.currency ?? '$',
          price,
          changePct: q?.change_pct ?? s?.change_pct ?? 0,
          rating: s ? deriveRating(s.sentinel_score) : null,
          risk: s ? deriveRiskLevel(s) : null,
          target: s ? deriveTargetPrice(s.broker_reports) : null,
          range: s ? deriveValuationRange(s.broker_reports) : null,
        });
      }
    }
    return out;
  }, [groups, quotes]);

  const sorted = useMemo(() => {
    if (sortKey === 'none') return rows;
    const val = (r: Row): number => {
      switch (sortKey) {
        case 'price': return r.price;
        case 'change': return r.changePct;
        case 'rating': return r.rating ? 5 - ['strong-buy', 'buy', 'hold', 'sell', 'strong-sell'].indexOf(r.rating.tone) : -1;
        case 'risk': return r.risk ?? -1;
        case 'target': return r.target ?? -1;
        default: return 0;
      }
    };
    return [...rows].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  }, [rows, sortKey, asc]);

  const sort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else { setSortKey(k); setAsc(false); }
  };
  const arrow = (k: SortKey) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '');
  const ariaSort = (k: SortKey): 'ascending' | 'descending' | 'none' =>
    sortKey === k ? (asc ? 'ascending' : 'descending') : 'none';

  // Accessible sortable header: a real <button> with aria-sort on the <th>.
  const SortTh = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th aria-sort={ariaSort(k)} className={`px-3 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => sort(k)}
        className={`inline-flex items-center gap-0.5 hover:text-text focus:outline-none focus-visible:underline ${align === 'right' ? 'flex-row-reverse' : ''}`}
        aria-label={`按${label}排序`}>
        {label}<span aria-hidden="true">{arrow(k)}</span>
      </button>
    </th>
  );

  if (rows.length === 0) {
    return <div className="card-base text-center text-sm text-text-dim">股票池为空，先到看板视图添加标的。</div>;
  }

  return (
    <div className="card-base overflow-x-auto p-0">
      {loading && (
        <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">
          ⏳ 报价加载中…
        </div>
      )}
      <table aria-label="股票池表格视图" className="w-full min-w-[860px] text-sm">
        <caption className="sr-only">股票池表格视图：评级、风险、目标价、估值区间，可按表头排序</caption>
        <thead>
          <tr className="border-b border-border text-[11px] text-text-dim">
            <th className="px-3 py-2.5 text-left font-medium" scope="col">股票代码</th>
            <th className="px-3 py-2.5 text-left font-medium" scope="col">公司名称</th>
            <SortTh k="price" label="当前价格" align="right" />
            <SortTh k="change" label="涨跌幅" align="right" />
            <SortTh k="rating" label="投资评级" />
            <SortTh k="risk" label="风险等级" />
            <SortTh k="target" label="目标价" align="right" />
            <th className="px-3 py-2.5 text-left font-medium" scope="col">估值区间</th>
            <th className="px-3 py-2.5 text-left font-medium" scope="col">分组</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.ticker} className="border-b border-border/60 last:border-0 hover:bg-bg-card">
              <td className="px-3 py-2.5">
                <Link href={`/stock/${encodeURIComponent(r.ticker)}` as any} className="font-mono text-xs font-semibold text-accent">
                  {r.ticker}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-text-dim">{r.name}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.price > 0 ? `${r.currency}${formatPrice(r.price)}` : <span className="text-text-muted">--</span>}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${changeClass(r.changePct)}`}>
                {r.price > 0 ? formatPct(r.changePct) : <span className="text-text-muted">--</span>}
              </td>
              <td className="px-3 py-2.5"><RatingBadge rating={r.rating} /></td>
              <td className="px-3 py-2.5"><RiskBars level={r.risk} /></td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {r.target != null ? `${r.currency}${Math.round(r.target)}` : <span className="text-text-muted">--</span>}
              </td>
              <td className="px-3 py-2.5"><ValuationCell price={r.price} range={r.range} currency={r.currency} /></td>
              <td className="px-3 py-2.5 text-[11px] text-text-dim">{r.group}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
