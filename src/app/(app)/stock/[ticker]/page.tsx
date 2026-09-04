'use client';

import { useEffect, useState } from 'react';
import { MarketLabel } from '@/components/MarketLabel';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getStockOrStub } from '@/lib/data/mock';
import { mergeStockDetail } from '@/lib/stocks/detail';
import { formatPrice, formatPct, formatChange, formatVolume, changeClass, classifyMarket } from '@/lib/utils';
import { KlineChart } from '@/components/KlineChart';
import { PerspectiveCard } from '@/components/PerspectiveCard';
import { DcfStudio } from '@/components/DcfStudio';
import { Disclaimer } from '@/components/Disclaimer';
import { useToast } from '@/components/Toast';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { usePerspectives, useQuote } from '@/lib/hooks/useQuote';
import { QuotaNotice } from '@/components/QuotaNotice';
import { StockResearchPanel } from '@/components/StockResearchPanel';

type Tab = 'overview' | 'ai' | 'fundamentals' | 'news' | 'signals' | 'holdings';

const TAB_IDS: Tab[] = ['overview', 'ai', 'fundamentals', 'news', 'signals', 'holdings'];

export default function StockDetailPage() {
  const t = useTranslations('market.stock');
  const params = useParams<{ ticker: string }>();
  const ticker = decodeURIComponent(params.ticker);
  const fallbackStock = getStockOrStub(ticker);
  const quote = useQuote(ticker, { refreshIntervalMs: 30_000 });
  const stock = mergeStockDetail(ticker, fallbackStock, quote.data);
  const hasLiveQuote = quote.data !== null;
  const [tab, setTab] = useState<Tab>('overview');
  const { show } = useToast();
  const { groups, hydrated, setGroups } = useWatchlist();
  const [inWatchlist, setInWatchlist] = useState(false);
  // Live committee perspectives — button-triggered (each run costs one daily
  // quota unit on the platform key), never auto-loaded on tab open.
  const pers = usePerspectives(ticker);

  useEffect(() => {
    if (!hydrated) return;
    setInWatchlist(groups.some((g) => g.tickers.includes(ticker)));
  }, [groups, hydrated, ticker]);

  if (!stock && quote.loading) {
    return (
      <div className="card-base py-10 text-center text-sm text-text-dim">
        {t('loadingQuote', { ticker })}
      </div>
    );
  }

  if (!stock) {
    const messageKey = quote.notFound ? 'notFound' : 'unavailable';
    return (
      <div className="card-base text-center">
        <h2 className="mb-2 text-lg font-bold">{t(`${messageKey}.title`, { ticker })}</h2>
        <p>
          {t(`${messageKey}.bodyPrefix`)}
          <Link href="/">{t('notFound.home')}</Link>
          {t('notFound.or')}
          <Link href="/watchlist">{t('notFound.watchlist')}</Link>
        </p>
      </div>
    );
  }

  function toggleWatchlist() {
    if (!stock || !hydrated) return;
    if (inWatchlist) {
      const next = groups.map((g) => ({ ...g, tickers: g.tickers.filter((t) => t !== ticker) }));
      setGroups(next);
      setInWatchlist(false);
      show(t('removedToast', { ticker }));
    } else {
      const targetId = groups.find((g) => g.id === 'opportunity')?.id || groups[0]?.id;
      if (!targetId) return;
      const next = groups.map((g) =>
        g.id === targetId ? { ...g, tickers: Array.from(new Set([...g.tickers, ticker])) } : g
      );
      setGroups(next);
      setInWatchlist(true);
      show(t('addedToast', { group: groups.find((g) => g.id === targetId)?.name || t('notFound.watchlist') }));
    }
  }

  // Live rows only — the canned mock perspectives are no longer rendered
  // (honest empty state + generate button instead of fake data).
  const perspectives = pers.perspectives;
  const bullish = perspectives.filter((p) => p.stance === 'bullish');
  const neutral = perspectives.filter((p) => p.stance === 'neutral');
  const bearish = perspectives.filter((p) => p.stance === 'bearish');
  const consensus = perspectives.length === 0
    ? 0
    : perspectives.reduce((sum, p) => {
        const v = p.stance === 'bullish' ? p.confidence : p.stance === 'bearish' ? -p.confidence : 0;
        return sum + v;
      }, 0) / perspectives.length + 5;

  return (
    <>
      {/* Header */}
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <span className="text-2xl font-bold">{stock.name}</span>
        <span className="rounded bg-bg-card px-2 py-1 text-sm text-text-dim">
          {stock.ticker} · <MarketLabel m={stock.market} />
        </span>
        <button
          onClick={toggleWatchlist}
          disabled={!hydrated}
          className={`ml-auto rounded px-3.5 py-2 text-sm disabled:cursor-wait disabled:opacity-50 ${
            inWatchlist ? 'bg-bg-card text-warn' : 'bg-accent-dim text-white'
          }`}
        >
          {inWatchlist ? t('inWatchlist') : t('addToWatchlist')}
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Link
          href={`/copilot?ticker=${encodeURIComponent(ticker)}` as any}
          className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold text-accent"
        >
          {t('analyzeWithJohn')}
        </Link>
        <Link
          href={`/copilot?method=hiphon-pm-deepdive&ticker=${encodeURIComponent(ticker)}` as any}
          className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold text-accent"
        >
          {t('deepDive')}
        </Link>
        <Link
          href={`/copilot?method=company-diligence&ticker=${encodeURIComponent(ticker)}` as any}
          className="inline-block rounded-md bg-bg-card px-3 py-1 text-xs font-semibold text-accent"
        >
          {t('companyDiligence')}
        </Link>
      </div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-4">
        {hasLiveQuote ? <>
          <span className="text-3xl font-bold tabular-nums">{stock.currency}{formatPrice(stock.price)}</span>
          <span className={`text-lg font-semibold tabular-nums ${changeClass(stock.change_pct)}`}>
            {formatChange(stock.change)} ({formatPct(stock.change_pct)})
          </span>
        </> : (
          <span className="text-3xl font-bold tabular-nums text-text-dim" aria-label={t('quoteUnavailable')}>—</span>
        )}
        {quote.loading ? (
          <span className="text-[11px] text-text-muted">{t('quoteLoading')}</span>
        ) : ['JP', 'KR'].includes(classifyMarket(ticker)) ? (
          <span className="rounded bg-bg-card px-1.5 py-0.5 text-[11px] text-text-muted">{t('sourcePending')}</span>
        ) : quote.data ? (
          <span className="text-[11px] text-text-muted">{quote.data.delayed ? t('delayedQuote') : t('liveQuote')}</span>
        ) : (
          <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[11px] text-warn" role="status">{t('quoteUnavailable')}</span>
        )}
      </div>
      {!quote.loading && !hasLiveQuote && (
        <div className="mb-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-text-dim" role="status">
          {t('quoteUnavailableDetail')}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 md:grid-cols-6">
        <MetaCell label={t('meta.open')} value={hasLiveQuote ? formatPrice(stock.open) : '—'} />
        <MetaCell label={t('meta.high')} value={hasLiveQuote ? formatPrice(stock.high) : '—'} />
        <MetaCell label={t('meta.low')} value={hasLiveQuote ? formatPrice(stock.low) : '—'} />
        <MetaCell label={t('meta.prevClose')} value={hasLiveQuote ? formatPrice(stock.prev_close) : '—'} />
        <MetaCell label={t('meta.turnoverValue')} value={hasLiveQuote ? formatVolume(stock.volume_value) : '—'} />
        <MetaCell label={t('meta.amplitude')} value={hasLiveQuote ? `${stock.amplitude}%` : '—'} />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto border-b border-border">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition ${
              tab === id ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text'
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'overview' && (
        <>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">{t('overview.klineHeading')}</div>
            <KlineChart ticker={stock.ticker} />
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">{t('overview.metricsHeading')}</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <MetricCard label={t('overview.peTtm')} value={formatOptionalMetric(quote.data?.pe_ttm)} />
              <MetricCard label={t('overview.pb')} value={formatOptionalMetric(quote.data?.pb)} />
              <MetricCard label={t('overview.roe')} value={formatOptionalMetric(quote.data?.roe, '%')} />
              <MetricCard label={t('overview.dividendYield')} value={formatOptionalMetric(quote.data?.dividend_yield, '%')} />
              <MetricCard label={t('overview.marketCap')} value={quote.data?.market_cap_label || '—'} />
              <MetricCard label={t('overview.high52w')} value="—" />
              <MetricCard label={t('overview.low52w')} value="—" />
              <MetricCard label={t('overview.nextEarnings')} value="—" small />
            </div>
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">{t('overview.signalsHeadingStatic')}</div>
            <div className="py-6 text-center text-sm text-text-dim">{t('overview.noTriggersToday')}</div>
          </div>
        </>
      )}

      {tab === 'ai' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">{t('ai.heading')}</div>
          {pers.quota && <div className="mb-3"><QuotaNotice {...pers.quota} /></div>}
          {pers.loading ? (
            <div className="py-8 text-center text-sm text-text-dim">{t('ai.generating')}</div>
          ) : perspectives.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-dim">
              {t('ai.pendingLine1')}
              {pers.error && <div className="mt-2 text-xs text-down">{t('ai.errorLine', { error: pers.error })}</div>}
              <br />
              <button onClick={pers.refetch} className="mt-3 rounded bg-accent-dim px-4 py-2 text-white">
                {t('ai.generate')}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 text-xs text-text-dim">
                {t('ai.consensusSummary', { consensus: consensus.toFixed(1), bullish: bullish.length, neutral: neutral.length, bearish: bearish.length })}
              </div>
              {bullish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bullish">{t('ai.bullishHeading', { count: bullish.length })}</h3>}
              {bullish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
              {neutral.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-neutral">{t('ai.neutralHeading', { count: neutral.length })}</h3>}
              {neutral.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
              {bearish.length > 0 && <h3 className="mb-2 mt-3 text-sm font-semibold text-bearish">{t('ai.bearishHeading', { count: bearish.length })}</h3>}
              {bearish.map((p) => <PerspectiveCard key={p.persona} {...p} />)}
              <button onClick={pers.refetch} className="mt-3 rounded border border-accent-dim/60 px-3 py-1.5 text-xs font-semibold text-accent-dim">
                {t('ai.regenerate')}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'fundamentals' && (
        <>
          <div className="card-base">
            <DcfStudio ticker={ticker} />
          </div>
          <div className="card-base">
            <div className="mb-3 text-sm font-semibold text-text-dim">{t('fundamentals.calendarHeading')}</div>
            <div className="rounded-md bg-bg-card p-3 text-sm">
              <strong>{t('fundamentals.nextRelease')}</strong>：{stock.next_earnings}
            </div>
          </div>
          {stock.financials.years.length > 0 && (
            <div className="card-base">
              <div className="mb-3 text-sm font-semibold text-text-dim">{t('fundamentals.trendHeading')}</div>
              <MiniChart label={t('fundamentals.revenueLabel', { currency: stock.currency })} values={stock.financials.revenue} labels={stock.financials.years} />
              <MiniChart label={t('fundamentals.netIncomeLabel', { currency: stock.currency })} values={stock.financials.net_income} labels={stock.financials.years} />
              <MiniChart label={t('fundamentals.roeLabel')} values={stock.financials.roe} labels={stock.financials.years} />
            </div>
          )}
          {stock.financials.years.length > 0 && (
            <div className="card-base overflow-x-auto">
              <div className="mb-3 text-sm font-semibold text-text-dim">{t('fundamentals.summaryHeading')}</div>
              <table className="w-full text-sm">
                <thead className="text-text-dim">
                  <tr>
                    <th className="py-2 text-left">{t('fundamentals.metricHeader')}</th>
                    {stock.financials.years.map((y) => <th key={y} className="py-2 text-right">{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border"><td className="py-2">{t('fundamentals.revenueRow')}</td>{stock.financials.revenue.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}</tr>
                  <tr className="border-t border-border"><td className="py-2">{t('fundamentals.netIncomeRow')}</td>{stock.financials.net_income.map((v, i) => <td key={i} className="text-right tabular-nums">{v}</td>)}</tr>
                  <tr className="border-t border-border"><td className="py-2">{t('fundamentals.roeRow')}</td>{stock.financials.roe.map((v, i) => <td key={i} className="text-right tabular-nums">{v}%</td>)}</tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'news' && <StockResearchPanel ticker={ticker} currency={stock.currency} />}

      {tab === 'signals' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">{t('signals.heading')}</div>
          <div className="py-8 text-center text-sm text-text-dim">
            <p>{t('signals.pending')}</p>
            <p className="mt-2 text-[11px]">{t('signals.pendingDetail')}</p>
          </div>
        </div>
      )}

      {tab === 'holdings' && (
        <div className="card-base">
          <div className="mb-3 text-sm font-semibold text-text-dim">
            {t('holdings.heading', { suffix: stock.market === 'US' ? '' : t('holdings.headingSuffix') })}
          </div>
          <div className="py-8 text-center text-sm text-text-dim">
            <p>
              {stock.market === 'US' ? t('holdings.usBody') : t('holdings.nonUsBody')}
            </p>
            <p className="mt-2 text-[11px]">{t('holdings.dataSource')}</p>
          </div>
        </div>
      )}

      <Disclaimer />
    </>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-bg-card px-2.5 py-1.5">
      <div className="text-[10px] text-text-dim">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function MetricCard({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg bg-bg-card p-3">
      <div className="mb-1 text-[11px] text-text-dim">{label}</div>
      <div className={`font-bold tabular-nums ${small ? 'text-sm' : 'text-lg'}`}>{value}</div>
    </div>
  );
}

function formatOptionalMetric(value: number | null | undefined, suffix = ''): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value}${suffix}`;
}

function MiniChart({ label, values, labels }: { label: string; values: number[]; labels: number[] }) {
  const max = Math.max(...values.map((v) => Math.abs(v)));
  return (
    <div className="mb-5">
      <div className="mb-1 text-xs text-text-dim">{label}</div>
      <div className="flex h-[60px] items-end gap-1">
        {values.map((v, i) => (
          <div
            key={i}
            className="relative flex-1 rounded-sm"
            style={{
              height: `${Math.max((Math.max(v, 0) / max) * 100, 2)}%`,
              background: v < 0 ? 'var(--down)' : 'var(--accent-dim)',
            }}
            title={`${labels[i]}: ${v}`}
          >
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-text-muted">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
