'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Bell, ChartNoAxesCombined, Landmark, Newspaper, NotebookPen, RefreshCw, RotateCcw, X } from 'lucide-react';
import { KlineChart } from '@/components/KlineChart';
import { MarketLabel } from '@/components/MarketLabel';
import type { LiveQuote } from '@/lib/hooks/useQuote';
import { changeClass, classifyMarket, formatPct, formatPrice } from '@/lib/utils';
import type { WatchlistOverviewRow as WatchlistOverviewClientRow, WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';
import { WatchlistDecisionPanel } from '@/components/watchlist/WatchlistDecisionPanel';
import { useDialogFocusTrap } from '@/lib/hooks/useDialogFocusTrap';
import { WatchlistAlertPanel } from '@/components/watchlist/WatchlistAlertPanel';
import { WatchlistResearchPanel } from '@/components/watchlist/WatchlistResearchPanel';
import { WatchlistDataStatus } from '@/components/watchlist/WatchlistDataStatus';
import { usePersistentState } from '@/lib/hooks/usePersistentState';
import { watchlistBenchmarkTicker } from '@/lib/watchlist/analytics';
import { WatchlistFinancialPanel } from '@/components/watchlist/WatchlistFinancialPanel';

type QuickViewTab = 'overview' | 'financials' | 'research' | 'decision' | 'alerts';

function Metric({ label, value, tone = 'text-text' }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-border/70 px-1 py-3">
      <div className="truncate text-[10px] font-medium text-text-muted" title={label}>{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
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
  onClose,
}: {
  ticker: string;
  quote: LiveQuote | null;
  overview?: WatchlistOverviewClientRow;
  onDecisionSaved?: (item: WatchlistOverviewItemRow) => void;
  onBenchmarkChange?: (ticker: string, benchmark: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations('market.table.drawer');
  const [activeTab, setActiveTab] = useState<QuickViewTab>('overview');
  const [visited, setVisited] = useState<Set<QuickViewTab>>(() => new Set(['overview']));
  const [decisionDirty, setDecisionDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [benchmarkPreference, setBenchmarkPreference] = usePersistentState(
    `stock-monitor:watchlist:benchmark-v1:${ticker}`,
    '',
    validBenchmarkPreference,
  );
  const [benchmarkInput, setBenchmarkInput] = useState(benchmarkPreference);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState(false);
  const autoRequestedBenchmark = useRef<string | null>(null);
  const requestClose = useCallback(() => {
    if (decisionDirty) setConfirmingClose(true);
    else onClose();
  }, [decisionDirty, onClose]);
  const panelRef = useDialogFocusTrap<HTMLElement>(requestClose);

  useEffect(() => {
    setActiveTab('overview');
    setVisited(new Set(['overview']));
    setDecisionDirty(false);
    setConfirmingClose(false);
    setBenchmarkError(false);
    autoRequestedBenchmark.current = null;
  }, [ticker]);

  useEffect(() => { setBenchmarkInput(benchmarkPreference); }, [benchmarkPreference]);

  const selectTab = (tab: QuickViewTab) => {
    setActiveTab(tab);
    setVisited((current) => new Set(current).add(tab));
  };
  const onDecisionDirtyChange = useCallback((dirty: boolean) => setDecisionDirty(dirty), []);
  const market = quote?.market ?? classifyMarket(ticker);
  const historicalMetrics = overview?.history?.value;
  const benchmarkReliable = historicalMetrics?.benchmarkStatus === 'reliable';
  const defaultBenchmark = watchlistBenchmarkTicker(market);
  const refreshBenchmark = useCallback(async (next: string | null) => {
    if (!onBenchmarkChange) return;
    setBenchmarkLoading(true);
    setBenchmarkError(false);
    const ok = await onBenchmarkChange(ticker, next);
    setBenchmarkLoading(false);
    setBenchmarkError(!ok);
    if (ok) setBenchmarkPreference(next ?? '');
  }, [onBenchmarkChange, setBenchmarkPreference, ticker]);

  useEffect(() => {
    if (!benchmarkPreference || !onBenchmarkChange
      || historicalMetrics?.benchmarkTicker === benchmarkPreference
      || autoRequestedBenchmark.current === benchmarkPreference) return;
    autoRequestedBenchmark.current = benchmarkPreference;
    void refreshBenchmark(benchmarkPreference);
  }, [benchmarkPreference, historicalMetrics?.benchmarkTicker, onBenchmarkChange, refreshBenchmark]);
  const tabs: Array<{ id: QuickViewTab; icon: typeof ChartNoAxesCombined; available: boolean }> = [
    { id: 'overview', icon: ChartNoAxesCombined, available: true },
    { id: 'financials', icon: Landmark, available: true },
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
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={requestClose} aria-label={t('dismiss')} />
      <aside ref={panelRef} className="absolute inset-y-0 right-0 w-full max-w-[820px] overflow-y-auto border-l border-border bg-bg shadow-2xl">
        <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-xl">
          <div className="h-0.5 bg-accent" />
          <header className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold">{quote?.name || ticker}</h2>
                <span className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-dim"><MarketLabel m={market} /></span>
                <span className="font-mono text-[11px] text-text-muted">{ticker}</span>
              </div>
              {quote && quote.price > 0 ? <div className="mt-1.5 flex items-baseline gap-3"><span className="text-2xl font-bold tabular-nums sm:text-3xl">{formatPrice(quote.price, quote.currency)}</span><span className={`rounded px-2 py-0.5 text-xs font-semibold tabular-nums ${quote.change_pct >= 0 ? 'bg-up/10' : 'bg-down/10'} ${changeClass(quote.change_pct)}`}>{formatPct(quote.change_pct)}</span></div> : <div className="mt-1 text-sm text-text-muted">{t('unavailable')}</div>}
            </div>
            <Link href={`/stock/${encodeURIComponent(ticker)}` as never} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2.5 text-xs font-semibold text-text-dim hover:border-border-active hover:text-text hover:no-underline">{t('fullDetail')}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            <button type="button" onClick={requestClose} className="icon-button !h-8 !w-8 !basis-8 border-transparent bg-transparent" aria-label={t('close')}><X className="h-4 w-4" aria-hidden="true" /></button>
          </header>
          <nav className="flex overflow-x-auto border-b border-border px-3 sm:px-5" role="tablist" aria-label={t('tabs.label')}>
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              const tabId = `watchlist-tab-${ticker}-${tab.id}`;
              const panelId = `watchlist-panel-${ticker}-${tab.id}`;
              return <button key={tab.id} id={tabId} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={panelId} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveTab(tab.id, 'next'); } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveTab(tab.id, 'prev'); } else if (event.key === 'Home') { event.preventDefault(); moveTab(tab.id, 'first'); } else if (event.key === 'End') { event.preventDefault(); moveTab(tab.id, 'last'); } }} className={`relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-xs font-medium transition ${activeTab === tab.id ? 'text-text' : 'text-text-muted hover:text-text'}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{t(`tabs.${tab.id}`)}{activeTab === tab.id && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />}</button>;
            })}
          </nav>
        </div>

        <div className="p-4 sm:p-5">
          {activeTab === 'overview' && (
            <div id={`watchlist-panel-${ticker}-overview`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-overview`}>
              <section className="mb-6"><KlineChart ticker={ticker} /></section>
              <section aria-label={t('metrics')}>
                <div className="mb-2 text-[11px] font-semibold text-text-dim">{t('metrics')}</div>
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  <Metric label={t('open')} value={quote ? formatPrice(quote.open, quote.currency) : '--'} />
                  <Metric label={t('dayRange')} value={quote ? `${formatPrice(quote.low, quote.currency)} - ${formatPrice(quote.high, quote.currency)}` : '--'} />
                  <Metric label={t('amplitude')} value={optional(quote?.amplitude, '%')} />
                  <Metric label={t('volumeRatio')} value={optional(quote?.volume_ratio, 'x')} />
                  <Metric label={t('marketCap')} value={quote?.market_cap_label || '--'} />
                  <Metric label="PE (TTM)" value={optional(quote?.pe_ttm)} />
                  <Metric label="PB" value={optional(quote?.pb)} />
                  <Metric label={t('turnover')} value={optional(quote?.turnover, '%')} />
                </div>
              </section>
              <section className="mt-6" aria-label={t('historyMetrics')}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-text-dim"><span>{t('historyMetrics')}</span>{historicalMetrics && <span className="font-normal text-text-muted">{t('sampleSize', { count: historicalMetrics.sampleSize })} · {t('coverage', { value: Math.round(historicalMetrics.coverageRatio * 100) })}</span>}</div>
                {onBenchmarkChange && <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-bg-elevated/40 p-2">
                  <label htmlFor={`watchlist-benchmark-${ticker}`} className="text-[10px] font-medium text-text-muted">{t('benchmarkSelector')}</label>
                  <input id={`watchlist-benchmark-${ticker}`} value={benchmarkInput} onChange={(event) => setBenchmarkInput(event.target.value.toUpperCase().trim())} placeholder={defaultBenchmark} className="h-7 w-28 px-2 py-1 font-mono text-[10px]" maxLength={20} />
                  <button type="button" onClick={() => void refreshBenchmark(benchmarkInput || null)} disabled={benchmarkLoading || !validBenchmarkPreference(benchmarkInput)} className="icon-button !h-7 !w-7 !basis-7" title={t('benchmarkApply')} aria-label={t('benchmarkApply')}><RefreshCw className={`h-3.5 w-3.5 ${benchmarkLoading ? 'animate-spin' : ''}`} aria-hidden="true" /></button>
                  <button type="button" onClick={() => { setBenchmarkInput(''); void refreshBenchmark(null); }} disabled={benchmarkLoading || (!benchmarkPreference && historicalMetrics?.benchmarkTicker === defaultBenchmark)} className="icon-button !h-7 !w-7 !basis-7" title={t('benchmarkDefault', { benchmark: defaultBenchmark })} aria-label={t('benchmarkDefault', { benchmark: defaultBenchmark })}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  <span className="ml-auto text-[10px] text-text-muted">{historicalMetrics?.benchmarkTicker ?? defaultBenchmark}</span>
                  {benchmarkError && <span className="w-full text-[10px] text-warn" role="status">{t('benchmarkLoadFailed')}</span>}
                </div>}
                <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
                  <Metric label={t('oneYearPriceReturn')} value={optional(historicalMetrics?.periodReturnPct, '%')} tone={historicalMetrics?.periodReturnPct == null ? 'text-text' : changeClass(historicalMetrics.periodReturnPct)} />
                  <Metric label={t('benchmarkReturn', { benchmark: historicalMetrics?.benchmarkTicker ?? '--' })} value={optional(benchmarkReliable ? historicalMetrics?.benchmarkReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.benchmarkReturnPct == null ? 'text-text' : changeClass(historicalMetrics.benchmarkReturnPct)} />
                  <Metric label={t('excessReturn')} value={optional(benchmarkReliable ? historicalMetrics?.excessReturnPct : null, '%')} tone={!benchmarkReliable || historicalMetrics?.excessReturnPct == null ? 'text-text' : changeClass(historicalMetrics.excessReturnPct)} />
                  <Metric label={t('beta')} value={optional(benchmarkReliable ? historicalMetrics?.beta : null)} />
                  <Metric label={t('annualizedVolatility')} value={optional(historicalMetrics?.annualizedVolatilityPct, '%')} />
                  <Metric label={t('downsideVolatility')} value={optional(historicalMetrics?.downsideVolatilityPct, '%')} />
                  <Metric label={t('sharpeRatio')} value={optional(historicalMetrics?.sharpeRatio)} />
                  <Metric label={t('maxDrawdown')} value={optional(historicalMetrics?.maxDrawdownPct, '%')} tone="text-warn" />
                </div>
                {historicalMetrics && <div className={`mt-2 text-[10px] ${benchmarkReliable ? 'text-text-muted' : 'text-warn'}`}>{t('benchmarkQuality', { aligned: historicalMetrics.benchmarkAlignedObservations, total: historicalMetrics.usableObservations, status: t(`benchmarkStatuses.${historicalMetrics.benchmarkStatus}`) })}</div>}
                <details className="mt-3 rounded-md border border-border/70 bg-bg-elevated/40 px-3">
                  <summary className="cursor-pointer py-2 text-[11px] font-semibold text-text-dim">{t('technicalMetrics')}</summary>
                  <div className="grid grid-cols-2 gap-x-4 pb-2 sm:grid-cols-4">
                  <Metric label={t('rsi14')} value={optional(historicalMetrics?.rsi14)} />
                  <Metric label={t('ma20Distance')} value={optional(historicalMetrics?.ma20DistancePct, '%')} tone={historicalMetrics?.ma20DistancePct == null ? 'text-text' : changeClass(historicalMetrics.ma20DistancePct)} />
                  <Metric label={t('ma50Distance')} value={optional(historicalMetrics?.ma50DistancePct, '%')} tone={historicalMetrics?.ma50DistancePct == null ? 'text-text' : changeClass(historicalMetrics.ma50DistancePct)} />
                  <Metric label={t('rangePosition')} value={optional(historicalMetrics?.rangePositionPct, '%')} />
                  <Metric label={t('macd')} value={optional(historicalMetrics?.macd)} tone={historicalMetrics?.macd == null ? 'text-text' : changeClass(historicalMetrics.macd)} />
                  <Metric label={t('macdSignal')} value={optional(historicalMetrics?.macdSignal)} />
                  <Metric label={t('macdHistogram')} value={optional(historicalMetrics?.macdHistogram)} tone={historicalMetrics?.macdHistogram == null ? 'text-text' : changeClass(historicalMetrics.macdHistogram)} />
                  <Metric label={t('bollingerPosition')} value={optional(historicalMetrics?.bollingerPositionPct, '%')} />
                  <Metric label={t('atr14')} value={optional(historicalMetrics?.atr14Pct, '%')} />
                  </div>
                </details>
                {historicalMetrics && <div className="mt-3 border-t border-border/70 pt-2 text-[10px] text-text-muted">{t('methodology', { days: historicalMetrics.methodology.annualizationFactor, basis: historicalMetrics.methodology.returnBasis, riskFree: historicalMetrics.methodology.riskFreeRatePct.toFixed(2) })}</div>}
              </section>
              <div className="mt-5 border-t border-border pt-3">
                <div className="flex flex-wrap gap-2">
                  <WatchlistDataStatus label={t('marketSnapshot')} envelope={overview?.market} />
                  <WatchlistDataStatus label={t('historySnapshot')} envelope={overview?.history} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted"><span>{t('source', { value: quote?.source || '--' })}</span><span>{t('updated', { value: quote?.updated_at ? new Date(quote.updated_at).toLocaleString() : '--' })}</span></div>
              </div>
            </div>
          )}
          {activeTab === 'financials' && visited.has('financials') && <div id={`watchlist-panel-${ticker}-financials`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-financials`}><WatchlistFinancialPanel ticker={ticker} /></div>}
          {activeTab === 'research' && visited.has('research') && <div id={`watchlist-panel-${ticker}-research`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-research`}><WatchlistResearchPanel ticker={ticker} overview={overview} /></div>}
          {overview?.item && onDecisionSaved && visited.has('decision') && <div id={`watchlist-panel-${ticker}-decision`} role="tabpanel" aria-labelledby={`watchlist-tab-${ticker}-decision`} hidden={activeTab !== 'decision'}><WatchlistDecisionPanel item={overview.item} onSaved={onDecisionSaved} onDirtyChange={onDecisionDirtyChange} /></div>}
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
