'use client';

import Link from 'next/link';
import { BellRing, CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarketLabel } from '@/components/MarketLabel';
import { changeClass, formatChange, formatPct, formatPrice, formatVolume } from '@/lib/utils';
import type { WatchlistMarketRow } from '@/lib/watchlist/market-row';
import type { WatchlistOverviewRow } from '@/lib/watchlist/overview-contract';
import type { WatchlistColumnKey } from '@/lib/watchlist/ui-preferences';
import type { WatchlistQuickViewTab } from '@/lib/watchlist/quick-view';
import { calculateWatchlistDataQuality } from '@/lib/watchlist/data-quality';
import { marketPhase } from '@/lib/today/clock';
import { watchlistDayPosition, watchlistTableQuerySnapshotValue } from '@/lib/watchlist/table-model';
import { WatchlistFreshnessBadge } from './WatchlistFreshnessBadge';
import { WatchlistPercentileCell } from './WatchlistPercentileCell';
import { WatchlistSparkline } from './WatchlistSparkline';
import { WatchlistMissingValue } from './WatchlistMissingValue';
import { watchlistProviderLabel } from '@/lib/watchlist/provider-label';

function QuoteStatus({ row }: { row: WatchlistMarketRow }) {
  const t = useTranslations('market.table');
  const providerT = useTranslations('market.table.providers');
  const quote = row.quote;
  if (row.status === 'loading') return <WatchlistFreshnessBadge compact status="loading" statusLabel={t('status.loading')} />;
  if (row.status === 'unavailable') return <WatchlistFreshnessBadge compact status="unavailable" statusLabel={t('status.unavailable')} />;
  const source = quote?.source ? watchlistProviderLabel(quote.source, providerT) : t('status.unknownSource');
  const updated = quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : t('status.unknownTime');
  const phase = marketPhase(row.market, new Date());
  const lastClose = row.status === 'delayed' && (phase.phase === 'closed' || phase.phase === 'weekend' || phase.phase === 'pre');
  return <WatchlistFreshnessBadge compact status={row.status === 'stale' ? 'stale' : lastClose ? 'closed' : row.status === 'delayed' ? 'delayed' : 'live'} statusLabel={row.status === 'stale' ? t('status.stale') : lastClose ? t('status.lastClose') : row.status === 'delayed' ? t('status.delayed') : t('status.live')} source={source} asOf={quote?.updated_at} details={updated} />;
}

export function WatchlistTableCell({ row, column, overview, queryActive, onSelectTicker }: {
  row: WatchlistMarketRow;
  column: WatchlistColumnKey;
  overview?: WatchlistOverviewRow;
  queryActive: boolean;
  onSelectTicker?: (ticker: string, tab?: WatchlistQuickViewTab) => void;
}) {
  const t = useTranslations('market.table');
  const quote = row.quote;
  const querySnapshot = queryActive ? watchlistTableQuerySnapshotValue(overview, column) : null;
  const numericValue = (live: number | null | undefined) => querySnapshot
    ? typeof querySnapshot.value === 'number' ? querySnapshot.value : null
    : live;
  const hasQuote = !!quote && quote.price > 0;
  const quoteMissing = <WatchlistMissingValue
    loading={row.status === 'loading'}
    fallback={row.status === 'unavailable' ? 'unavailable' : 'notProvided'}
    source={quote?.source}
    asOf={quote?.updated_at}
  />;
  const historyMissing = <WatchlistMissingValue loading={!overview} envelope={overview?.history} />;
  const peerMissing = <WatchlistMissingValue loading={!overview} envelope={overview?.peer} />;
  const researchMissing = <WatchlistMissingValue loading={!overview} envelope={overview?.research} />;
  const alertsMissing = <WatchlistMissingValue loading={!overview} envelope={overview?.alerts} />;
  const optionalNumber = (value: number | null | undefined, suffix = '', missing = quoteMissing) => (
    value == null || !Number.isFinite(value)
      ? missing
      : <span className="tabular-nums">{value.toFixed(2)}{suffix}</span>
  );
  switch (column) {
    case 'ticker': return <div className="flex items-center gap-2"><Link onClick={(event) => event.stopPropagation()} href={`/stock/${encodeURIComponent(row.ticker)}` as never} className="font-mono text-xs font-bold text-accent hover:no-underline">{row.ticker}</Link><span className="rounded border border-border bg-bg-elevated px-1 py-0.5 text-[11px] text-text-muted"><MarketLabel m={row.market} /></span></div>;
    case 'name': return <span className="block max-w-[190px] truncate font-medium text-text">{row.name}</span>;
    case 'price': { const value = numericValue(quote?.price); return value != null ? <span className="font-semibold tabular-nums text-text">{formatPrice(value, querySnapshot?.currency ?? row.currency)}</span> : quoteMissing; }
    case 'change': { const value = numericValue(quote?.change_pct); return value != null ? <div className={`tabular-nums ${changeClass(value)}`}><div>{formatPct(value)}</div>{!querySnapshot && hasQuote && <div className="text-[11px] opacity-75">{formatChange(quote.change)}</div>}</div> : quoteMissing; }
    case 'open': { const value = numericValue(quote?.open); return value != null ? <span className="tabular-nums">{formatPrice(value, querySnapshot?.currency ?? row.currency)}</span> : quoteMissing; }
    case 'prevClose': { const value = numericValue(quote?.prev_close); return value != null ? <span className="tabular-nums">{formatPrice(value, querySnapshot?.currency ?? row.currency)}</span> : quoteMissing; }
    case 'dayRange': { const value = numericValue(null); return querySnapshot ? optionalNumber(value, '%') : hasQuote ? <><div className="tabular-nums">{formatPrice(quote.high, row.currency)}</div><div className="text-[11px] text-text-dim">{formatPrice(quote.low, row.currency)}</div></> : quoteMissing; }
    case 'volume': { const value = numericValue(quote?.volume); return value != null ? formatVolume(value) : quoteMissing; }
    case 'amount': { const value = numericValue(quote?.amount); return value != null ? formatVolume(value) : quoteMissing; }
    case 'marketCap': { const value = numericValue(quote?.market_cap); return querySnapshot ? (value == null ? quoteMissing : formatVolume(value)) : quote?.market_cap_label && quote.market_cap_label !== '—' ? quote.market_cap_label : quoteMissing; }
    case 'pe': return optionalNumber(numericValue(quote?.pe_ttm));
    case 'pb': return optionalNumber(numericValue(quote?.pb));
    case 'turnover': return optionalNumber(numericValue(quote?.turnover), '%');
    case 'volumeRatio': return optionalNumber(numericValue(quote?.volume_ratio), 'x');
    case 'amplitude': return optionalNumber(numericValue(quote?.amplitude), '%');
    case 'dayPosition': { const value = numericValue(watchlistDayPosition(quote)); return value == null ? quoteMissing : <div className="ml-auto w-24" title={t('dayPositionTitle', { value: value.toFixed(0) })}><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[11px] text-text-dim">{value.toFixed(0)}%</div></div>; }
    case 'periodReturn': { const value = numericValue(overview?.history?.value?.periodReturnPct); const sparkline = overview?.history?.value?.sparkline; return value == null && (!sparkline || sparkline.length < 2) ? historyMissing : <div className="flex items-center justify-end gap-2"><WatchlistSparkline values={sparkline} label={t('mobile.sparkline', { ticker: row.ticker })} className="shrink-0 opacity-85" /><span className={value == null ? 'text-text-muted' : changeClass(value)}>{value == null ? '--' : `${value.toFixed(2)}%`}</span></div>; }
    case 'volatility': return optionalNumber(numericValue(overview?.history?.value?.annualizedVolatilityPct), '%', historyMissing);
    case 'maxDrawdown': { const value = numericValue(overview?.history?.value?.maxDrawdownPct); return value == null ? historyMissing : <span className="text-warn">{value.toFixed(2)}%</span>; }
    case 'rangePosition':
    case 'bollingerPosition': { const value = numericValue(column === 'rangePosition' ? overview?.history?.value?.rangePositionPct : overview?.history?.value?.bollingerPositionPct); return value == null ? historyMissing : <div className="ml-auto w-24"><div className="h-1.5 overflow-hidden rounded bg-border"><div className="h-full bg-accent" style={{ width: `${value}%` }} /></div><div className="mt-1 text-[11px] text-text-dim">{value.toFixed(0)}%</div></div>; }
    case 'rsi14': return optionalNumber(numericValue(overview?.history?.value?.rsi14), '', historyMissing);
    case 'macdHistogram': { const value = numericValue(overview?.history?.value?.macdHistogram); return value == null ? historyMissing : <span className={changeClass(value)}>{value.toFixed(2)}</span>; }
    case 'atr14': return optionalNumber(numericValue(overview?.history?.value?.atr14Pct), '%', historyMissing);
    case 'excessReturn': { const value = numericValue(overview?.history?.value?.excessReturnPct); return value == null ? historyMissing : <span className={changeClass(value)}>{value > 0 ? '+' : ''}{value.toFixed(2)}%</span>; }
    case 'beta': return optionalNumber(numericValue(overview?.history?.value?.beta), '', historyMissing);
    case 'volumeZScore20': { const value = numericValue(overview?.history?.value?.volumeZScore20); return value == null ? historyMissing : <span className={Math.abs(value) >= 2 ? 'font-semibold text-warn' : 'text-text'}>{value > 0 ? '+' : ''}{value.toFixed(2)}σ</span>; }
    case 'relativeStrengthRank': return <WatchlistPercentileCell value={numericValue(overview?.peer?.value?.marketRelativeStrengthPercentile)} sampleSize={overview?.peer?.value?.marketRelativeStrengthSampleSize ?? 0} label={t('headers.relativeStrengthRank')} missing={peerMissing} />;
    case 'pePercentile': return <WatchlistPercentileCell value={numericValue(overview?.peer?.value?.industryPePercentile)} sampleSize={overview?.peer?.value?.industryPeSampleSize ?? 0} label={t('headers.pePercentile')} tone="valuation" missing={peerMissing} />;
    case 'pbPercentile': return <WatchlistPercentileCell value={numericValue(overview?.peer?.value?.industryPbPercentile)} sampleSize={overview?.peer?.value?.industryPbSampleSize ?? 0} label={t('headers.pbPercentile')} tone="valuation" missing={peerMissing} />;
    case 'liquidityPercentile': return <WatchlistPercentileCell value={numericValue(overview?.peer?.value?.marketLiquidityPercentile)} sampleSize={overview?.peer?.value?.marketLiquiditySampleSize ?? 0} label={t('headers.liquidityPercentile')} missing={peerMissing} />;
    case 'averageTradedAmount20': { const value = numericValue(overview?.peer?.value?.averageTradedAmount20); return value == null ? peerMissing : formatVolume(value); }
    case 'marketCapShare': return optionalNumber(numericValue(overview?.peer?.value?.watchlistMarketCapSharePct), '%', peerMissing);
    case 'research': { const research = overview?.research.value; const value = numericValue(research?.recentNewsCount); return value == null ? researchMissing : <button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker?.(row.ticker, 'research'); }} className="ml-auto flex items-center justify-end gap-1.5 rounded px-1 py-0.5 hover:bg-bg-elevated" title={t('openResearch')}><span className="font-mono text-xs">{value}</span>{research?.perspectiveDivergence && <span className="rounded border border-warn/30 bg-warn/10 px-1 py-0.5 text-[11px] text-warn">{t('researchDivergence')}</span>}</button>; }
    case 'alerts': { const alerts = overview?.alerts.value; return !alerts ? alertsMissing : <button type="button" onClick={(event) => { event.stopPropagation(); onSelectTicker?.(row.ticker, 'alerts'); }} className="ml-auto inline-flex items-center justify-end gap-1.5 rounded px-1 py-0.5 hover:bg-bg-elevated" title={t('alertsSummary', { enabled: alerts.enabledCount, unread: alerts.unreadCount, failed: alerts.failedDeliveryCount })}><BellRing className={`h-3.5 w-3.5 ${alerts.unreadCount > 0 ? 'text-accent' : 'text-text-muted'}`} aria-hidden="true" /><span className="tabular-nums text-text-dim">{alerts.enabledCount}</span>{alerts.unreadCount > 0 && <span className="min-w-4 rounded bg-accent/15 px-1 text-center text-[10px] font-semibold text-accent">{alerts.unreadCount}</span>}{alerts.failedDeliveryCount > 0 && <CircleAlert className="h-3.5 w-3.5 text-status-bad" aria-label={t('alertsFailed')} />}</button>; }
    case 'decision': { const status = querySnapshot?.role === 'sort' && typeof querySnapshot.value === 'string' ? querySnapshot.value : overview?.item.status; return status ? <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-dim">{t(`decisionStatuses.${status}`)}</span> : <WatchlistMissingValue loading={!overview} fallback="notProvided" />; }
    case 'quality': { const quality = calculateWatchlistDataQuality(quote, row.status, overview?.history); return <span title={t('qualityTitle', { completeness: quality.completenessPct, freshness: quality.freshnessPct, analytics: quality.analyticsPct ?? '--' })} className={quality.score >= 75 ? 'text-status-good' : quality.score >= 45 ? 'text-warn' : 'text-text-muted'}>{quality.score}%</span>; }
    case 'updated': return querySnapshot && typeof querySnapshot.value === 'number' ? <time className="text-[11px] text-text-dim">{new Date(querySnapshot.value * 1000).toLocaleString()}</time> : <QuoteStatus row={row} />;
    case 'group': return <span className="inline-flex max-w-[150px] truncate rounded-full border border-border bg-bg-elevated px-2 py-0.5 text-[11px] text-text-dim">{row.group}</span>;
  }
}
