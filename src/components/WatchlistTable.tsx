'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { formatChange, formatPct, formatPrice, formatVolume, changeClass } from '@/lib/utils';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import {
  buildWatchlistMarketRows,
  type WatchlistMarketGroup,
  type WatchlistSecurityIdentity,
  type WatchlistMarketRow,
} from '@/lib/watchlist/market-row';

type SortKey = 'ticker' | 'name' | 'price' | 'change' | 'volume' | 'amount' | 'updated' | 'group';

function QuoteStatus({ row }: { row: WatchlistMarketRow }) {
  const t = useTranslations('market.table');
  const quote = row.quote;
  if (row.status === 'loading') return <span className="text-text-muted">{t('status.loading')}</span>;
  if (row.status === 'unavailable') return <span className="text-down">{t('status.unavailable')}</span>;

  const source = quote?.source || t('status.unknownSource');
  const updated = quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : t('status.unknownTime');
  return (
    <div className={row.status === 'delayed' ? 'text-amber-500' : 'text-text-dim'} title={`${source} · ${updated}`}>
      <div>{row.status === 'delayed' ? t('status.delayed') : t('status.live')}</div>
      <div className="max-w-[130px] truncate text-[10px] text-text-muted">{source} · {updated}</div>
    </div>
  );
}

function PriceCell({ quote, currency }: { quote: LiveQuote | null; currency: string }) {
  return quote && quote.price > 0
    ? <span className="tabular-nums">{formatPrice(quote.price, currency)}</span>
    : <span className="text-text-muted">--</span>;
}

export function WatchlistTable({
  groups,
  quotes,
  identities,
  loadedAt,
  loading = false,
}: {
  groups: WatchlistMarketGroup[];
  quotes: Record<string, LiveQuote | null>;
  identities: Record<string, WatchlistSecurityIdentity>;
  loadedAt: number | null;
  loading?: boolean;
}) {
  const t = useTranslations('market.table');
  const [sortKey, setSortKey] = useState<SortKey>('change');
  const [asc, setAsc] = useState(false);
  const rows = useMemo(
    () => buildWatchlistMarketRows(groups, quotes, identities, loadedAt),
    [groups, quotes, identities, loadedAt],
  );

  const summary = useMemo(() => ({
    tracked: rows.length,
    live: rows.filter((row) => row.status === 'live').length,
    delayed: rows.filter((row) => row.status === 'delayed').length,
    unavailable: rows.filter((row) => row.status === 'unavailable').length,
  }), [rows]);

  const sorted = useMemo(() => {
    const value = (row: WatchlistMarketRow): string | number => {
      const quote = row.quote;
      switch (sortKey) {
        case 'ticker': return row.ticker;
        case 'name': return row.name;
        case 'price': return quote?.price ?? -1;
        case 'change': return quote?.change_pct ?? -Infinity;
        case 'volume': return quote?.volume ?? -1;
        case 'amount': return quote?.amount ?? -1;
        case 'updated': return quote?.updated_at ? Date.parse(quote.updated_at) : -1;
        case 'group': return row.group;
      }
    };
    return [...rows].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const result = typeof a === 'string' && typeof b === 'string'
        ? a.localeCompare(b)
        : Number(a) - Number(b);
      return asc ? result : -result;
    });
  }, [asc, rows, sortKey]);

  const sort = (key: SortKey) => {
    if (sortKey === key) setAsc((current) => !current);
    else { setSortKey(key); setAsc(key === 'ticker' || key === 'name' || key === 'group'); }
  };
  const arrow = (key: SortKey) => sortKey === key ? (asc ? ' ▲' : ' ▼') : '';
  const SortTh = ({ keyName, label, align = 'left' }: { keyName: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th className={`px-3 py-2.5 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`} aria-sort={sortKey === keyName ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => sort(keyName)} className="hover:text-text" aria-label={t('sortAriaLabel', { label })}>
        {label}<span aria-hidden="true">{arrow(keyName)}</span>
      </button>
    </th>
  );

  if (rows.length === 0) return <div className="card-base text-center text-sm text-text-dim">{t('empty')}</div>;

  return (
    <div className="card-base overflow-x-auto p-0">
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        {[
          [t('summary.tracked'), summary.tracked, 'text-text'],
          [t('summary.live'), summary.live, 'text-up'],
          [t('summary.delayed'), summary.delayed, 'text-amber-500'],
          [t('summary.unavailable'), summary.unavailable, summary.unavailable ? 'text-down' : 'text-text'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="bg-bg-card px-3 py-2">
            <div className="text-[11px] text-text-dim">{label}</div>
            <div className={`text-lg font-bold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>
      {loading && <div className="border-b border-border px-3 py-1.5 text-[11px] text-text-dim" role="status">{t('loadingQuotes')}</div>}
      <table aria-label={t('ariaLabel')} className="w-full min-w-[1180px] text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead>
          <tr className="border-b border-border text-[11px] text-text-dim">
            <SortTh keyName="ticker" label={t('headers.ticker')} />
            <SortTh keyName="name" label={t('headers.name')} />
            <SortTh keyName="price" label={t('headers.price')} align="right" />
            <SortTh keyName="change" label={t('headers.change')} align="right" />
            <th className="px-3 py-2.5 text-right font-medium">{t('headers.open')}</th>
            <th className="px-3 py-2.5 text-right font-medium">{t('headers.dayRange')}</th>
            <SortTh keyName="volume" label={t('headers.volume')} align="right" />
            <SortTh keyName="amount" label={t('headers.amount')} align="right" />
            <SortTh keyName="updated" label={t('headers.status')} />
            <SortTh keyName="group" label={t('headers.group')} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const quote = row.quote;
            const hasQuote = quote && quote.price > 0;
            return <tr key={row.ticker} className="border-b border-border/60 last:border-0 hover:bg-bg-card">
              <td className="px-3 py-2.5"><Link href={`/stock/${encodeURIComponent(row.ticker)}` as any} className="font-mono text-xs font-semibold text-accent">{row.ticker}</Link></td>
              <td className="max-w-[180px] truncate px-3 py-2.5 text-text-dim">{row.name}</td>
              <td className="px-3 py-2.5 text-right"><PriceCell quote={quote} currency={row.currency} /></td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${hasQuote ? changeClass(quote.change_pct) : 'text-text-muted'}`}>
                {hasQuote ? <><div>{formatPct(quote.change_pct)}</div><div className="text-[10px] opacity-75">{formatChange(quote.change)}</div></> : '--'}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{hasQuote ? formatPrice(quote.open, row.currency) : <span className="text-text-muted">--</span>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{hasQuote ? <><div>{formatPrice(quote.high, row.currency)}</div><div className="text-[10px] text-text-dim">{formatPrice(quote.low, row.currency)}</div></> : <span className="text-text-muted">--</span>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{hasQuote && quote.volume > 0 ? formatVolume(quote.volume) : <span className="text-text-muted">--</span>}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{hasQuote && quote.amount > 0 ? formatVolume(quote.amount) : <span className="text-text-muted">--</span>}</td>
              <td className="px-3 py-2.5"><QuoteStatus row={row} /></td>
              <td className="px-3 py-2.5 text-[11px] text-text-dim">{row.group}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
