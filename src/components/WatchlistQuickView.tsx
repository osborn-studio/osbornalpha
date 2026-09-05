'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Bell, ChartNoAxesCombined, LayoutDashboard, Newspaper, NotebookPen, RefreshCw, RotateCcw, X } from 'lucide-react';
import { KlineChart } from '@/components/KlineChart';
import { MarketLabel } from '@/components/MarketLabel';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { changeClass, classifyMarket, formatChange, formatPct, formatPrice, formatVolume } from '@/lib/utils';
import type { WatchlistOverviewRow as WatchlistOverviewClientRow, WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';
import { WatchlistDecisionPanel } from '@/components/watchlist/WatchlistDecisionPanel';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import { WatchlistAlertPanel } from '@/components/watchlist/WatchlistAlertPanel';
import { WatchlistResearchPanel } from '@/components/watchlist/WatchlistResearchPanel';
import { WatchlistDataStatus } from '@/components/watchlist/WatchlistDataStatus';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { watchlistBenchmarkTicker } from '@/lib/watchlist/analytics';
import { WatchlistFinancialPanel } from '@/components/watchlist/WatchlistFinancialPanel';
import { validateWatchlistBenchmark, type WatchlistBenchmarkIssue } from '@/lib/watchlist/benchmark-validation';
import type { WatchlistChartPreferences } from '@/lib/watchlist/ui-preferences';
import { watchlistHistoryRangeForChart } from '@/lib/market-returns/range';

type QuickViewTab = 'snapshot' | 'chart' | 'research' | 'decision' | 'alerts';

function Metric({ label, value, tone = 'text-text' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-border/70 px-1 py-3">
      <div className="truncate text-[11px] font-medium text-text-muted" title={label}>{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function QuoteStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5 first:pl-4 sm:px-4 sm:first:pl-5">
      <div className="truncate text-[10px] font-medium text-text-muted">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs font-semibold tabular-nums text-text-dim">{value}</div>
    </div>
  );
}

function optional(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value) ? '--' : `${value.toFixed(2)}${suffix}`;
}

function validBenchmarkPreference(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(value));
}

export function WatchlistQuickView({
  ticker,
  quote,
  overview,
  onDecisionSaved,
  onBenchmarkChange,
  benchmarkPreference: controlledBenchmarkPreference,
  onBenchmarkPreferenceChange,
  chartPreferences,
  onChartPreferencesChange,
  onClose,
}: {
  ticker: string;
  quote: LiveQuote | null;
  overview?: WatchlistOverviewClientRow;
  onDecisionSaved?: (item: WatchlistOverviewItemRow) => void;
  onBenchmarkChange?: (ticker: string, benchmark: string | null) => Promise<boolean>;
  benchmarkPreference?: string;
  onBenchmarkPreferenceChange?: (ticker: string, benchmark: string | null) => void;
  chartPreferences?: WatchlistChartPreferences;
  onChartPreferencesChange?: React.Dispatch<React.SetStateAction<WatchlistChartPreferences>>;
  onClose: () => void;
}) {
  const t = useTranslations('market.table.drawer');
  const [activeTab, setActiveTab] = useState<QuickViewTab>('chart');
  const [visited, setVisited] = useState<Set<QuickViewTab>>(() => new Set(['chart']));
  const [decisionDirty, setDecisionDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [localBenchmarkPreference, setLocalBenchmarkPreference] = usePersistentState(
    `stock-monitor:watchlist:benchmark-v1:${ticker}`,
    '',
    validBenchmarkPreference,
  );
  const benchmarkPreference = controlledBenchmarkPreference ?? localBenchmarkPreference;
  const setBenchmarkPreference = useCallback((next: string) => {
    if (controlledBenchmarkPreference !== undefined && onBenchmarkPreferenceChange) {
      onBenchmarkPreferenceChange(ticker, next || null);
    } else {
      setLocalBenchmarkPreference(next);
    }
  }, [controlledBenchmarkPreference, onBenchmarkPreferenceChange, setLocalBenchmarkPreference, ticker]);
  const [benchmarkInput, setBenchmarkInput] = useState(benchmarkPreference);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<WatchlistBenchmarkIssue | 'unavailable' | null>(null);
  const autoRequestedBenchmark = useRef<string | null>(null);
  const requestClose = useCallback(() => {
    if (decisionDirty) setConfirmingClose(true);
    else onClose();
  }, [decisionDirty, onClose]);
  const panelRef = useDialogFocusTrap<HTMLElement>(requestClose);

  useEffect(() => {
    setActiveTab('chart');
    setVisited(new Set(['chart']));
    setDecisionDirty(false);
    setConfirmingClose(false);
    setBenchmarkError(null);
    autoRequestedBenchmark.current = null;
  }, [ticker]);

  useEffect(() => { setBenchmarkInput(benchmarkPreference); }, [benchmarkPreference]);

  const selectTab = (tab: QuickViewTab) => {
    setActiveTab(tab);
    setVisited((current) => new Set(current).add(tab));
  };
  const onDecisionDirtyChange = useCallback((dirty: boolean) => setDecisionDirty(dirty), []);
  const market = quote?.market ?? classifyMarket(ticker);
  const loadedHistoricalMetrics = overview?.history?.value;
  const requestedHistoryRange = watchlistHistoryRangeForChart(chartPreferences?.range ?? '1d');
  const historicalMetrics = loadedHistoricalMetrics?.methodology.historyRange === requestedHistoryRange
    ? loadedHistoricalMetrics
    : undefined;
  const metricsPending = !!loadedHistoricalMetrics && !historicalMetrics;
  const benchmarkReliable = historicalMetrics?.benchmarkStatus === 'reliable';
  const historyRange = requestedHistoryRange;
  const historyRangeLabel = t(`historyRanges.${historyRange}`);
  const totalReturnAvailable = historicalMetrics?.totalReturnPct != null;
  const defaultBenchmark = watchlistBenchmarkTicker(market);
  const decision = overview?.item;
  const radar = overview?.market?.value?.radar;
  const nextEvent = overview?.market?.value?.events
    .filter((event) => event.daysUntil >= 0)
    .sort((left, right) => left.daysUntil - right.daysUntil)[0];
  const refreshBenchmark = useCallback(async (next: string | null) => {
    if (!onBenchmarkChange) return;
    if (next) {
      const validation = validateWatchlistBenchmark(ticker, next);
      if (!validation.valid) {
        setBenchmarkError(validation.issue);
        return;
      }
    }
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    const ok = await onBenchmarkChange(ticker, next);
    setBenchmarkLoading(false);
    setBenchmarkError(ok ? null : 'unavailable');
    if (ok) setBenchmarkPreference(next ?? '');
  }, [onBenchmarkChange, setBenchmarkPreference, ticker]);

  useEffect(() => {
    if (!historicalMetrics || !benchmarkPreference || !onBenchmarkChange
      || historicalMetrics?.benchmarkTicker === benchmarkPreference
      || autoRequestedBenchmark.current === benchmarkPreference) return;
    autoRequestedBenchmark.current = benchmarkPreference;
    void refreshBenchmark(benchmarkPreference);
  }, [benchmarkPreference, historicalMetrics, onBenchmarkChange, refreshBenchmark]);
  const tabs: Array<{ id: QuickViewTab; icon: typeof ChartNoAxesCombined; available: boolean }> = [
    { id: 'snapshot', icon: LayoutDashboard, available: true },
    { id: 'chart', icon: ChartNoAxesCombined, available: true },
    { id: 'research', icon: Newspaper, available: true },
    { id: 'decision', icon: NotebookPen, available: !!overview?.item && !!onDecisionSaved },
    { id: 'alerts', icon: Bell, available: !!overview?.item },
  ];
  const availableTabs = tabs.filter((tab) => tab.available);
  const moveTab = (current: QuickViewTab, direction: 'next' | 'prev' | 'first' | 'last') => {
    const index = availableTabs.findIndex((tab) => tab.id === current);
    if (index < 0) return;
    const target = direction === 'first' ? 0
      : direction === 'last' ? availableTabs.length - 1
        : (index + (direction === 'next' ? 1 : -1) + availableTabs.length) % availableTabs.length;
    const next = availableTabs[target].id;
    selectTab(next);
    window.requestAnimationFrame(() => document.getElementById(`watchlist-tab-${ticker}-${next}`)?.focus());
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t('ariaLabel', { ticker })}>
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-[2px] lg:bg-black/35 lg:backdrop-blur-none" onClick={requestClose} aria-label={t('dismiss')} />
      <aside ref={panelRef} className="absolute inset-y-0 right-0 w-full overflow-y-auto border-l border-border bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl sm:w-[min(760px,82vw)] lg:w-[min(760px,72vw)] xl:w-[min(780px,56vw)]">
        <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-xl">
          <div className="h-0.5 bg-accent" />
          <header className="flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold">{quote?.name || ticker}</h2>
                <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-dim"><MarketLabel m={market} /></span>
                <span className="font-mono text-xs text-text-muted">{ticker}</span>
              </div>
              {quote && quote.price > 0 ? <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-2xl font-bold tabular-nums sm:text-3xl">{formatPrice(quote.price, quote.currency)}</span><span className={`text-sm font-semibold tabular-nums ${changeClass(quote.change_pct)}`}>{formatChange(quote.change, true)} · {formatPct(quote.change_pct)}</span></div> : <div className="mt-1 text-sm text-text-muted">{t('unavailable')}</div>}
            </div>
            <Link href={`/stock/${encodeURIComponent(ticker)}` as never} title={t('fullDetail')} aria-label={t('fullDetail')} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2 text-xs font-semibold text-text-dim hover:border-border-active hover:text-text hover:no-underline"><span className="hidden sm:inline">{t('fullDetail')}</span><ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            <button type="button" onClick={requestClose} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button>
          </header>
          {quote && quote.price > 0 && <div className="grid grid-cols-4 divide-x divide-border border-y border-border bg-bg-elevated/45">
            <QuoteStat label={t('open')} value={formatPrice(quote.open, quote.currency)} />
            <QuoteStat label={t('high')} value={formatPrice(quote.high, quote.currency)} />
            <QuoteStat label={t('low')} value={formatPrice(quote.low, quote.currency)} />
            <QuoteStat label={t('volume')} value={formatVolume(quote.volume)} />
          </div>}
          <nav className="grid border-b border-border bg-bg-elevated/40 px-2 sm:px-5" style={{ gridTemplateColumns: `repeat(${availableTabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label={t('tabs.label')}>
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const tabId = `watchlist-tab-${ticker}-${tab.id}`;
              const panelId = `watchlist-panel-${ticker}-${tab.id}`;
              return <button key={tab.id} id={tabId} type="button" role="tab" aria-label={t(`tabs.${tab.id}`)} title={t(`tabs.${tab.id}`)} aria-selected={activeTab === tab.id} aria-controls={panelId} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveTab(tab.id, 'next'); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveTab(tab.id, 'prev'); } else if (event.key === 'Home') { event.preventDefault(); moveTab(tab.id, 'first'); } else if (event.key === 'End') { event.preventDefault(); moveTab(tab.id, 'last'); } }} className={`relative inline-flex h-11 min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-medium transition sm:px-2 ${activeTab === tab.id ? 'text-text' : 'text-text-muted hover:text-text'}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="hidden min-[430px]:inline">{t(`tabs.${tab.id}`)}</span>{activeTab === tab.id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />}</button>;
            })}
          </nav>
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'snapshot' && (
            <div id={`watchlist-panel-${ticker}-snapshot`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-snapshot`}>
              {(radar || decision || nextEvent) && <section className="mb-5 grid divide-y divide-border/70 border-y border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label={t('signalSummary')}>
                <div className="min-w-0 px-2 py-3"><div className="text-[11px] text-text-muted">{t('marketSignal')}</div><div className="mt-1 truncate text-sm font-semibold text-text" title={radar?.headline}>{radar?.headline ?? '--'}</div>{radar && <div className="mt-1 text-[11px] text-text-muted">{t('signalScore', { value: radar.score })}</div>}</div>
                <div className="min-w-0 px-3 py-3"><div className="text-[11px] text-text-muted">{t('decisionSignal')}</div><div className="mt-1 truncate text-sm font-semibold text-text">{decision ? t(`decision.statuses.${decision.status}`) : '--'}</div>{decision && <div className="mt-1 text-[11px] text-text-muted">{t('conviction', { value: decision.conviction })}</div>}</div>
                <div className="min-w-0 px-3 py-3"><div className="text-[11px] text-text-muted">{t('nextEvent')}</div><div className="mt-1 truncate text-sm font-semibold text-text" title={nextEvent?.title}>{nextEvent?.title ?? t('noUpcomingEvent')}</div>{nextEvent && <div className="mt-1 text-[11px] text-text-muted">{t('daysUntil', { count: nextEvent.daysUntil })}</div>}</div>
              </section>}
              <section aria-label={t('metrics')}>
                <div className="mb-2 text-[11px] font-semibold text-text-dim">{t('metrics')}</div>
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  <Metric label={t('dayRange')} value={quote ? `${formatPrice(quote.low, quote.currency)} - ${formatPrice(quote.high, quote.currency)}` : '--'} />
                  <Metric label={t('volumeRatio')} value={optional(quote?.volume_ratio, 'x')} />
                  <Metric label={t('marketCap')} value={quote?.market_cap_label || '--'} />
                  <Metric label="PE (TTM)" value={optional(quote?.pe_ttm)} />
                </div>
                <details className="mt-2 border-b border-border/70"><summary className="cursor-pointer py-2 text-[11px] font-semibold text-text-dim">{t('moreMarketMetrics')}</summary><div className="grid grid-cols-2 gap-x-4 pb-2 sm:grid-cols-4"><Metric label={t('open')} value={quote ? formatPrice(quote.open, quote.currency) : '--'} /><Metric label={t('amplitude')} value={optional(quote?.amplitude, '%')} /><Metric label="PB" value={optional(quote?.pb)} /><Metric label={t('turnover')} value={optional(quote?.turnover, '%')} /></div></details>
              </section>
              <section className="mt-6" aria-label={t('historyMetrics')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-text-dim"><span>{t('historyMetrics')}</span>{metricsPending ? <span className="font-normal text-text-muted">{t('calculating')}</span> : historicalMetrics && <span className="font-normal text-text-muted">{t('sampleSize', { count: historicalMetrics.sampleSize })} · {t('coverage', { value: Math.round(historicalMetrics.coverageRatio * 100) })}</span>}</div>
                {onBenchmarkChange && <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-bg-elevated/40 p-2">
                  <label htmlFor={`watchlist-benchmark-${ticker}`} className="text-[11px] font-medium text-text-muted">{t('benchmarkSelector')}</label>
                  <input id={`watchlist-benchmark-${ticker}`} value={benchmarkInput} onChange={(event) => { setBenchmarkInput(event.target.value.toUpperCase().trim()); setBenchmarkError(null); }} placeholder={defaultBenchmark} className="h-7 w-28 px-2 py-1 font-mono text-[11px]" maxLength={20} />
                  <button type="button" onClick={() => void refreshBenchmark(benchmarkInput || null)} disabled={benchmarkLoading || !validBenchmarkPreference(benchmarkInput)} className="icon-button !h-7 !w-7 !basis-7" title={t('benchmarkApply')} aria-label={t('benchmarkApply')}><RefreshCw className={`h-3.5 w-3.5 ${benchmarkLoading ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
                  <button type="button" onClick={() => { setBenchmarkInput(''); void refreshBenchmark(null); }} disabled={benchmarkLoading || (!benchmarkPreference && historicalMetrics?.benchmarkTicker === defaultBenchmark)} className="icon-button !h-7 !w-7 !basis-7" title={t('benchmarkDefault', { benchmark: defaultBenchmark })} aria-label={t('benchmarkDefault', { benchmark: defaultBenchmark })}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <span className="ml-auto text-[11px] text-text-muted">{historicalMetrics?.benchmarkTicker ?? defaultBenchmark}</span>
                  {benchmarkError && <span className="w-full text-[11px] text-warn" role="status">{t(`benchmarkErrors.${benchmarkError}`)}</span>}
                </div>}
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  <Metric label={t('periodTotalReturn', { range: historyRangeLabel })} value={optional(historicalMetrics?.totalReturnPct, '%')} tone={historicalMetrics?.totalReturnPct == null ? 'text-text' : changeClass(historicalMetrics.totalReturnPct)} />
                  <Metric label={t('excessTotalReturn')} value={optional(benchmarkReliable ? historicalMetrics?.excessTotalReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.excessTotalReturnPct == null ? 'text-text' : changeClass(historicalMetrics.excessTotalReturnPct)} />
                  <Metric label={t('annualizedVolatility')} value={optional(historicalMetrics?.annualizedVolatilityPct, '%')} />
                  <Metric label={t('periodMaxDrawdown', { range: historyRangeLabel })} value={optional(historicalMetrics?.maxDrawdownPct, '%')} tone="text-warn" />
                </div>
                <details className="mt-2 border-b border-border/70"><summary className="cursor-pointer py-2 text-[11px] font-semibold text-text-dim">{t('moreRiskMetrics')}</summary><div className="grid grid-cols-2 gap-x-4 pb-2 sm:grid-cols-4"><Metric label={t('periodPriceReturn', { range: historyRangeLabel })} value={optional(historicalMetrics?.periodReturnPct, '%')} tone={historicalMetrics?.periodReturnPct == null ? 'text-text' : changeClass(historicalMetrics.periodReturnPct)} /><Metric label={t('distributionContribution')} value={optional(historicalMetrics?.distributionContributionPct, '%')} tone={historicalMetrics?.distributionContributionPct == null ? 'text-text' : changeClass(historicalMetrics.distributionContributionPct)} /><Metric label={t('benchmarkTotalReturn', { benchmark: historicalMetrics?.benchmarkTicker ?? '--' })} value={optional(benchmarkReliable ? historicalMetrics?.benchmarkTotalReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.benchmarkTotalReturnPct == null ? 'text-text' : changeClass(historicalMetrics.benchmarkTotalReturnPct)} /><Metric label={t('benchmarkPriceReturn', { benchmark: historicalMetrics?.benchmarkTicker ?? '--' })} value={optional(benchmarkReliable ? historicalMetrics?.benchmarkReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.benchmarkReturnPct == null ? 'text-text' : changeClass(historicalMetrics.benchmarkReturnPct)} /><Metric label={t('excessPriceReturn')} value={optional(benchmarkReliable ? historicalMetrics?.excessReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.excessReturnPct == null ? 'text-text' : changeClass(historicalMetrics.excessReturnPct)} /><Metric label={t('beta')} value={optional(benchmarkReliable ? historicalMetrics?.beta : null)} /><Metric label={t('downsideVolatility')} value={optional(historicalMetrics?.downsideVolatilityPct, '%')} /><Metric label={t('sharpeRatio')} value={optional(historicalMetrics?.sharpeRatio)} /></div></details>
                {historicalMetrics && <div className={`mt-2 text-[11px] ${benchmarkReliable ? 'text-text-muted' : 'text-warn'}`}>{t('benchmarkQuality', { aligned: historicalMetrics.benchmarkAlignedObservations, total: historicalMetrics.usableObservations, status: t(`benchmarkStatuses.${historicalMetrics.benchmarkStatus}`) })}</div>}
                <details className="mt-3 rounded-md border border-border/70 bg-bg-elevated/40 px-3">
                  <summary className="cursor-pointer py-2 text-[11px] font-semibold text-text-dim">{t('technicalMetrics')}</summary>
                  <div className="grid grid-cols-2 gap-x-4 pb-2 sm:grid-cols-4">
                  <Metric label={t('rsi14')} value={optional(historicalMetrics?.rsi14)} />
                  <Metric label={t('ma20Distance')} value={optional(historicalMetrics?.ma20DistancePct, '%')} tone={historicalMetrics?.ma20DistancePct == null ? 'text-text' : changeClass(historicalMetrics.ma20DistancePct)} />
                  <Metric label={t('ma50Distance')} value={optional(historicalMetrics?.ma50DistancePct, '%')} tone={historicalMetrics?.ma50DistancePct == null ? 'text-text' : changeClass(historicalMetrics.ma50DistancePct)} />
                  <Metric label={t('periodRangePosition', { range: historyRangeLabel })} value={optional(historicalMetrics?.rangePositionPct, '%')} />
                  <Metric label={t('macd')} value={optional(historicalMetrics?.macd)} tone={historicalMetrics?.macd == null ? 'text-text' : changeClass(historicalMetrics.macd)} />
                  <Metric label={t('macdSignal')} value={optional(historicalMetrics?.macdSignal)} />
                  <Metric label={t('macdHistogram')} value={optional(historicalMetrics?.macdHistogram)} tone={historicalMetrics?.macdHistogram == null ? 'text-text' : changeClass(historicalMetrics.macdHistogram)} />
                  <Metric label={t('bollingerPosition')} value={optional(historicalMetrics?.bollingerPositionPct, '%')} />
                  <Metric label={t('atr14')} value={optional(historicalMetrics?.atr14Pct, '%')} />
                  </div>
                </details>
                {historicalMetrics && <div className="mt-3 border-t border-border/70 pt-2 text-[11px] text-text-muted">{t('methodology', {
                  range: historyRangeLabel,
                  days: historicalMetrics.methodology.annualizationFactor,
                  source: historicalMetrics.methodology.priceReturnSource ?? overview?.history?.source ?? '--',
                  totalBasis: t(totalReturnAvailable ? 'totalReturnBases.adjustedClose' : 'totalReturnBases.unavailable'),
                  riskFree: historicalMetrics.methodology.riskFreeRatePct.toFixed(2),
                })}</div>}
              </section>
              <div className="mt-5 border-t border-border pt-3">
                <div className="flex flex-wrap gap-2">
                  <WatchlistDataStatus label={t('marketSnapshot')} envelope={overview?.market} />
                  <WatchlistDataStatus label={t('historySnapshot')} envelope={overview?.history} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted"><span>{t('source', { value: quote?.source || '--' })}</span><span>{t('updated', { value: quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : '--' })}</span></div>
              </div>
              <details className="mt-5 border-t border-border pt-3">
                <summary className="cursor-pointer py-2 text-xs font-semibold text-text">{t('financials.title')}</summary>
                <div className="pt-3"><WatchlistFinancialPanel ticker={ticker} /></div>
              </details>
            </div>
          )}
          {activeTab === 'chart' && visited.has('chart') && <div id={`watchlist-panel-${ticker}-chart`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-chart`}><KlineChart ticker={ticker} preferences={chartPreferences} onPreferencesChange={onChartPreferencesChange} /></div>}
          {activeTab === 'research' && visited.has('research') && <div id={`watchlist-panel-${ticker}-research`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-research`}><WatchlistResearchPanel ticker={ticker} overview={overview} /></div>}
          {overview?.item && onDecisionSaved && visited.has('decision') && <div id={`watchlist-panel-${ticker}-decision`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-decision`} hidden={activeTab !== 'decision'}><WatchlistDecisionPanel item={overview.item} currency={quote?.currency} onSaved={onDecisionSaved} onDirtyChange={onDecisionDirtyChange} /></div>}
          {activeTab === 'alerts' && overview?.item && visited.has('alerts') && <div id={`watchlist-panel-${ticker}-alerts`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-alerts`}><WatchlistAlertPanel itemId={overview.item.id} /></div>}
        </div>

        {confirmingClose && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="watchlist-unsaved-title">
            <div className="w-full max-w-sm rounded-md border border-border bg-bg-elevated p-4 shadow-2xl">
              <h3 id="watchlist-unsaved-title" className="text-sm font-semibold text-text">{t('unsavedTitle')}</h3>
              <p className="mt-2 text-xs leading-relaxed text-text-dim">{t('unsavedBody')}</p>
              <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setConfirmingClose(false)} className="h-8 rounded border border-border px-3 text-xs text-text">{t('keepEditing')}</button><button type="button" onClick={onClose} className="h-8 rounded bg-status-bad px-3 text-xs font-semibold text-white">{t('discardChanges')}</button></div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
