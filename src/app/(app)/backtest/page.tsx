'use client';

import { useMemo, useState } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useBatchBacktest } from '@/lib/hooks/useBatchBacktest';
import type { RankedTicker } from '@/lib/signals/batchBacktest';
import { formatPct, formatPrice, changeClass } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';

type SortKey = 'quality' | 'hit_rate' | 'signals' | 'fwd5' | 'fwd20' | 'ci_lower';

export default function BacktestPage() {
  const t = useTranslations('tools.backtest');
  const { groups, hydrated } = useWatchlist();
  const [days, setDays] = useState(60);
  const [sortKey, setSortKey] = useState<SortKey>('quality');
  const [marketFilter, setMarketFilter] = useState<'all' | 'A' | 'HK' | 'US'>('all');

  const tickers = useMemo(() => {
    if (!hydrated) return null;
    const all = uniqueWatchlistTickers(groups);
    return all.length > 0 ? all : null;
  }, [groups, hydrated]);

  const { data, loading, error, refetch } = useBatchBacktest(tickers, days);

  const filtered: RankedTicker[] = useMemo(() => {
    if (!data) return [];
    let rows = data.rankings;
    if (marketFilter !== 'all') rows = rows.filter((r) => r.market === marketFilter);
    return rows.slice().sort((a, b) => {
      switch (sortKey) {
        case 'hit_rate': return b.hit_rate_5d - a.hit_rate_5d;
        case 'signals':  return b.total_signals - a.total_signals;
        case 'fwd5':     return b.avg_forward_5d_pct - a.avg_forward_5d_pct;
        case 'fwd20':    return b.avg_forward_20d_pct - a.avg_forward_20d_pct;
        case 'ci_lower': return b.hit_rate_ci_lower - a.hit_rate_ci_lower;
        case 'quality':
        default:         return b.quality_score - a.quality_score;
      }
    });
  }, [data, sortKey, marketFilter]);

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{t('heading')}</h1>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-text-dim">
            {t('daysLabel')}
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="bg-bg-card !py-1"
            >
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
              <option value={120}>120</option>
            </select>
          </label>
          <button
            onClick={refetch}
            disabled={loading}
            className="rounded bg-accent-dim px-2.5 py-1 text-white disabled:opacity-50"
          >
            {loading ? t('running') : t('rerun')}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-text-dim">
        {t('intro')}
      </p>

      {loading && !data && (
        <div className="card-base py-12 text-center text-sm text-text-dim">
          {t('loadingBody', { count: tickers?.length || 0, days })}
          <div className="mt-2 text-[11px] text-text-muted">{t('loadingHint')}</div>
        </div>
      )}

      {error && (
        <div className="card-base bg-down/10 text-sm text-down">{t('error', { error })}</div>
      )}

      {data && (
        <>
          {/* Aggregate headline */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('stats.coverage')} value={`${data.tickers_succeeded}/${data.tickers_attempted}`} />
            <Stat label={t('stats.totalSignals')} value={String(data.aggregate.total_signals)} />
            <Stat label={t('stats.avgHitRate')} value={`${(data.aggregate.avg_hit_rate_5d * 100).toFixed(0)}%`}
                  accent={data.aggregate.avg_hit_rate_5d >= 0.5 ? 'good' : 'bad'} />
            <Stat label={t('stats.avgFwd5')} value={`${data.aggregate.avg_forward_5d_pct >= 0 ? '+' : ''}${data.aggregate.avg_forward_5d_pct.toFixed(2)}%`}
                  accent={data.aggregate.avg_forward_5d_pct >= 0 ? 'good' : 'bad'} />
          </div>

          {/* Headline picks */}
          {(data.aggregate.best_overall || data.aggregate.worst_overall || data.aggregate.most_active) && (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {data.aggregate.best_overall && (
                <HeadlineCard
                  label={t('headline.best')}
                  ticker={data.aggregate.best_overall.ticker}
                  name={data.aggregate.best_overall.name}
                  value={`${(data.aggregate.best_overall.hit_rate_5d * 100).toFixed(0)}%`}
                  sub={t('headline.signalCount', { count: data.aggregate.best_overall.total_signals })}
                  variant="good"
                />
              )}
              {data.aggregate.worst_overall && (
                <HeadlineCard
                  label={t('headline.worst')}
                  ticker={data.aggregate.worst_overall.ticker}
                  name={data.aggregate.worst_overall.name}
                  value={`${(data.aggregate.worst_overall.hit_rate_5d * 100).toFixed(0)}%`}
                  sub={t('headline.signalCount', { count: data.aggregate.worst_overall.total_signals })}
                  variant="bad"
                />
              )}
              {data.aggregate.most_active && (
                <HeadlineCard
                  label={t('headline.mostActive')}
                  ticker={data.aggregate.most_active.ticker}
                  name={data.aggregate.most_active.name}
                  value={String(data.aggregate.most_active.total_signals)}
                  sub={t('headline.signalCount60d')}
                  variant="neutral"
                />
              )}
            </div>
          )}

          {/* Filter + sort */}
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-dim">{t('marketLabel')}</span>
            {(['all', 'A', 'HK', 'US'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={`rounded-full border px-2.5 py-0.5 ${
                  marketFilter === m
                    ? 'border-accent bg-accent-dim text-white'
                    : 'border-border bg-bg-card text-text-dim'
                }`}
              >
                {m === 'all' ? t('marketAll') : <MarketLabel m={m} />}
              </button>
            ))}
            <span className="ml-2 text-text-dim">{t('sortLabel')}</span>
            {(
              [
                ['quality', t('sort.quality')],
                ['ci_lower', t('sort.ciLower')],
                ['hit_rate', t('sort.hitRate')],
                ['signals', t('sort.signals')],
                ['fwd5', t('sort.fwd5')],
                ['fwd20', t('sort.fwd20')],
              ] as Array<[SortKey, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`rounded-full border px-2.5 py-0.5 ${
                  sortKey === k
                    ? 'border-accent bg-accent-dim text-white'
                    : 'border-border bg-bg-card text-text-dim'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Ranking table */}
          <div className="card-base !p-0 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead className="sticky top-0 bg-bg-elevated text-text-muted">
                <tr>
                  <th className="py-2 pl-3 pr-2 text-left">#</th>
                  <th className="py-2 pr-2 text-left">{t('table.ticker')}</th>
                  <th className="py-2 pr-2 text-right">{t('table.price')}</th>
                  <th className="py-2 pr-2 text-right" title="composite quality score 0-100">{t('table.quality')}</th>
                  <th className="py-2 pr-2 text-right" title="Wilson 95% confidence lower bound">{t('table.ciLower')}</th>
                  <th className="py-2 pr-2 text-right">{t('table.hitRate')}</th>
                  <th className="py-2 pr-2 text-right">{t('table.signals')}</th>
                  <th className="py-2 pr-2 text-right">{t('table.fwd5')}</th>
                  <th className="py-2 pr-2 text-right">{t('table.fwd20')}</th>
                  <th className="py-2 pr-3 text-right">{t('table.latest')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <RowItem key={r.ticker} rank={i + 1} r={r} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-xs text-text-dim">
                      {t('table.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-[10px] text-text-muted">
            {t('algoNote', { days, count: data.tickers_attempted })}
          </div>
        </>
      )}

      <Disclaimer />
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'good' | 'bad' }) {
  const color = accent === 'good' ? 'text-up' : accent === 'bad' ? 'text-down' : '';
  return (
    <div className="rounded bg-bg-card p-3">
      <div className="text-[10px] text-text-dim">{label}</div>
      <div className={`font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function HeadlineCard({
  label, ticker, name, value, sub, variant,
}: {
  label: string; ticker: string; name: string; value: string; sub: string;
  variant: 'good' | 'bad' | 'neutral';
}) {
  const border = variant === 'good' ? 'border-up/30 bg-up/10'
              : variant === 'bad' ? 'border-down/30 bg-down/10'
              : 'border-border bg-bg-card';
  const valColor = variant === 'good' ? 'text-up' : variant === 'bad' ? 'text-down' : '';
  return (
    <Link
      href={`/?s=${encodeURIComponent(ticker)}`}
      className={`block rounded border p-2.5 hover:opacity-90 ${border}`}
    >
      <div className="text-[10px] font-semibold text-text-dim">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{name}</div>
      <div className="text-[10px] text-text-muted">{ticker}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${valColor}`}>{value}</div>
      <div className="text-[10px] text-text-dim">{sub}</div>
    </Link>
  );
}

function RowItem({ rank, r }: { rank: number; r: RankedTicker }) {
  const decided = r.hits_5d + r.misses_5d;
  const hitRateColor = r.hit_rate_5d >= 0.6 ? 'text-up' : r.hit_rate_5d <= 0.4 ? 'text-down' : 'text-text-dim';
  const qsColor = r.quality_score >= 50 ? 'text-up' : r.quality_score >= 30 ? 'text-warn' : 'text-text-dim';
  return (
    <tr className="border-t border-border hover:bg-bg-card/50">
      <td className="py-2 pl-3 pr-2 text-text-dim">{rank}</td>
      <td className="py-2 pr-2">
        <Link href={`/?s=${encodeURIComponent(r.ticker)}`} className="font-semibold text-text hover:no-underline">
          {r.name}
        </Link>
        <div className="text-[10px] text-text-muted">
          <span className="mr-1 rounded bg-bg-card px-1 py-0.5"><MarketLabel m={r.market} /></span>
          {r.ticker}
        </div>
      </td>
      <td className="py-2 pr-2 text-right">
        <div className="font-mono tabular-nums">
          {r.price != null ? `${r.currency}${formatPrice(r.price)}` : '—'}
        </div>
        {r.change_pct != null && (
          <div className={`text-[10px] tabular-nums ${changeClass(r.change_pct)}`}>
            {formatPct(r.change_pct)}
          </div>
        )}
      </td>
      <td className={`py-2 pr-2 text-right font-mono font-bold tabular-nums ${qsColor}`}>
        {r.quality_score}
      </td>
      <td className="py-2 pr-2 text-right font-mono tabular-nums text-text-dim">
        {(r.hit_rate_ci_lower * 100).toFixed(0)}%
      </td>
      <td className={`py-2 pr-2 text-right font-mono tabular-nums ${hitRateColor}`}>
        {decided === 0 ? '—' : `${(r.hit_rate_5d * 100).toFixed(0)}%`}
        <div className="text-[10px] text-text-muted">{r.hits_5d}h/{r.misses_5d}m/{r.flats_5d}f</div>
      </td>
      <td className="py-2 pr-2 text-right font-mono tabular-nums">
        {r.total_signals}
        <div className="text-[10px] text-text-muted">
          <span className="text-up">{r.bull_signals}</span>·<span className="text-down">{r.bear_signals}</span>·<span>{r.neutral_signals}</span>
        </div>
      </td>
      <td className={`py-2 pr-2 text-right font-mono tabular-nums ${r.avg_forward_5d_pct >= 0 ? 'text-up' : 'text-down'}`}>
        {r.total_signals === 0 ? '—' : `${r.avg_forward_5d_pct >= 0 ? '+' : ''}${r.avg_forward_5d_pct.toFixed(2)}%`}
      </td>
      <td className={`py-2 pr-2 text-right font-mono tabular-nums ${r.avg_forward_20d_pct >= 0 ? 'text-up' : 'text-down'}`}>
        {r.total_signals === 0 ? '—' : `${r.avg_forward_20d_pct >= 0 ? '+' : ''}${r.avg_forward_20d_pct.toFixed(2)}%`}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-[10px] text-text-muted">
        {r.latest_signal_date || '—'}
      </td>
    </tr>
  );
}
