// src/components/company/CompanyHeader.tsx
'use client';
// Company header (plan 2026-11-06 Task 11; spec §5.2, §5.9, decision J; canvas Main/Overview/M-Company).
// No quote row, no PE/PB/ROE/dividend yield. Data status = coverage of the current market + dataset
// freshness recomputed at read time; in replay the latest filing is recomputed (available_date <= asOf).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, Tag } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { companyApi, companyHref, type CompanyFilingsResponse, type FreshnessResponse, type ViewId } from '@/lib/company/client';
import { datasetOf, displayNames, freshnessKey, padCik, securityChips } from '@/lib/company/header-model';
import type { CompanyPageData } from '@/lib/company/page-data';
import { useCompanyFetch } from './useCompanyFetch';
import { TrackButton } from './tracking/TrackButton';

function WatchlistButton({ ticker }: { ticker: string }) {
  const t = useTranslations('company.header');
  const ts = useTranslations('market.stock');
  const { show } = useToast();
  const { groups, hydrated, setGroups } = useWatchlist();
  const [inList, setInList] = useState(false);
  useEffect(() => { if (hydrated) setInList(groups.some((g) => g.tickers.includes(ticker))); }, [groups, hydrated, ticker]);
  function toggle() {
    if (!hydrated) return;
    if (inList) {
      setGroups(groups.map((g) => ({ ...g, tickers: g.tickers.filter((x) => x !== ticker) })));
      setInList(false); show(ts('removedToast', { ticker }));
      return;
    }
    const targetId = groups.find((g) => g.id === 'opportunity')?.id || groups[0]?.id;
    if (!targetId) return;
    setGroups(groups.map((g) => (g.id === targetId ? { ...g, tickers: Array.from(new Set([...g.tickers, ticker])) } : g)));
    setInList(true); show(ts('addedToast', { group: groups.find((g) => g.id === targetId)?.name || ts('notFound.watchlist') }));
  }
  return <Button variant="secondary" size="sm" onClick={toggle} disabled={!hydrated}>{inList ? t('inWatchlist') : t('addWatchlist')}</Button>;
}

function AnalyzeMenu({ ticker }: { ticker: string }) {
  const t = useTranslations('company.header');
  const ts = useTranslations('market.stock');
  const q = encodeURIComponent(ticker);
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs">{t('analyze')}</summary>
      <div className="absolute z-20 mt-1 flex min-w-[200px] flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-2 text-xs">
        <Link href={`/copilot?ticker=${q}` as never}>{ts('analyzeWithJohn')}</Link>
        <Link href={`/copilot?method=hiphon-pm-deepdive&ticker=${q}` as never}>{ts('deepDive')}</Link>
        <Link href={`/copilot?method=company-diligence&ticker=${q}` as never}>{ts('companyDiligence')}</Link>
      </div>
    </details>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5"><span className="text-[var(--text-dim)]">{label}</span>{children}</div>;
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('company.states');
  return (
    <span role="alert" className="flex flex-wrap items-center gap-1.5 text-[var(--danger)]">
      {message}<Button variant="ghost" size="sm" onClick={onRetry}>{t('retry')}</Button>
    </span>
  );
}

const dot: Record<string, string> = { fresh: 'bg-[var(--bearish)]', stale: 'bg-[var(--warn)]', error: 'bg-[var(--danger)]', missing: 'bg-[var(--text-muted)]' };

export function CompanyHeader({ data, view, asOf, locale }: { data: CompanyPageData; view: ViewId; asOf: string | null; locale: 'zh' | 'en' }) {
  const t = useTranslations('company.header');
  const tf = useTranslations('company.header.freshness');
  const issuer = data.issuer;
  const ticker = data.publicTicker ?? data.ticker;
  const { state: freshness, retry: freshnessRetry } = useCompanyFetch<FreshnessResponse>(data.market ? '/api/companies/freshness' : null);
  const { state: replayFilings, retry: replayRetry } = useCompanyFetch<CompanyFilingsResponse>(asOf && data.coverage ? companyApi('filings', ticker, { asOf }) : null);
  const names = issuer ? displayNames(issuer.names, locale, ticker) : { title: data.ticker, subtitle: null };
  const chips = issuer ? securityChips(issuer.securities, ticker) : [];
  const cov = data.coverage;
  const latestFiling = asOf
    ? (replayFilings.status === 'ok' ? replayFilings.data.filings[0]?.availableDate ?? t('none') : replayFilings.status === 'loading' || replayFilings.status === 'idle' ? '…' : t('none'))
    : cov?.latest_available_date ?? t('none');
  const fkey = freshnessKey(freshness.status === 'ok' && data.market ? freshness.data.datasets.find((d) => d.dataset === datasetOf(data.market!))?.status : null);
  const marketLabel = (m: string) => (m === 'CN' ? t('marketCN') : m === 'US' ? t('marketUS') : m === 'HK' ? t('marketHK') : m);

  return (
    <section className="flex flex-wrap items-start gap-4 sm:gap-6" data-testid="company-header">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {names.title}{names.subtitle && <span className="ml-2 text-base font-normal text-[var(--text-dim)]">{names.subtitle}</span>}
        </h1>
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-0.5 text-xs">
          {chips.map((c) => (
            <Link key={c.ticker} href={companyHref(c.ticker, { view, asOf }) as never} aria-current={c.current ? 'true' : undefined} data-testid="security-chip"
              title={c.primary ? t('primary') : undefined}
              className={`num inline-flex items-center rounded-full border px-2.5 py-0.5 no-underline ${c.current ? 'border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
              {c.ticker}{c.current ? ' ◉' : ''}
            </Link>
          ))}
          {data.market && <Tag>{marketLabel(data.market)}</Tag>}
          {issuer && (
            <span className="text-[var(--text-dim)]">
              {t('cik')} <span className="num">{padCik(issuer.identifiers.cik) ?? t('none')}</span> · {t('lei')} <span className="num">{issuer.identifiers.lei ?? t('none')}</span> · {t('usci')} <span className="num">{issuer.identifiers.usci ?? t('none')}</span>
            </span>
          )}
        </div>
        {issuer?.redirected_from && <p className="text-xs text-[var(--warn)]">{t('redirected', { name: names.title })}</p>}
      </div>

      <div className="flex flex-col items-start gap-2 sm:ml-auto sm:items-end">
        {data.streams.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-dim)]">{t('streamLabel')}</span>
            <div role="group" aria-label={t('streamLabel')} className="inline-flex overflow-hidden rounded-md border border-[var(--border)] text-xs">
              {data.streams.map((s) => (
                <Link key={s.market} href={companyHref(s.ticker, { view, asOf }) as never} aria-current={s.market === data.market ? 'true' : undefined}
                  className={`px-2.5 py-1 no-underline ${s.market === data.market ? 'bg-[var(--accent-wash)] text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}>
                  {s.market === 'US' ? t('streamUS') : t('streamCN')}
                </Link>
              ))}
            </div>
            <span className="text-[11px] text-[var(--text-dim)]">{t('streamHint')}</span>
          </div>
        )}
        {issuer && data.market && (
          <Card className="grid grid-cols-2 gap-x-5 gap-y-2 px-3.5 py-2.5 text-xs sm:grid-cols-3">
            {cov ? (
              <>
                <Pair label={t('latestPeriod')}><span className="num">{cov.latest_period_end ?? t('none')}</span></Pair>
                <Pair label={`${t('latestFiling')}${asOf ? ` ${t('latestFilingReplay')}` : ''}`}>
                  {replayFilings.status === 'error'
                    ? <InlineError message={t('replayError', { code: replayFilings.code })} onRetry={replayRetry} />
                    : <span className="num">{latestFiling}</span>}
                </Pair>
                <Pair label={t('citations')}>
                  <span className="num">
                    {data.market === 'US'
                      ? t('citationEdgar', { n: cov.citation_summary.edgar })
                      : `${t('citationLinked', { n: cov.citation_summary.linked })} · ${t('citationPending', { n: cov.citation_summary.pending })}`}
                  </span>
                </Pair>
                <Pair label={cov.scope_last_status === 'failed' ? t('lastSyncFailed') : t('lastSync')}>
                  <span className="num">{cov.scope_last_success_at?.slice(0, 10) ?? t('none')}</span>
                </Pair>
              </>
            ) : (
              <span className="col-span-2 text-[var(--text-dim)] sm:col-span-3">{t('noFacts')}</span>
            )}
            <Pair label={t('dataset')}>
              <span className="flex flex-wrap items-center gap-1.5" data-testid="data-status">
                <span className="num">{datasetOf(data.market)}</span>
                {freshness.status === 'error' ? (
                  <InlineError message={t('freshnessError', { code: freshness.code })} onRetry={freshnessRetry} />
                ) : (
                  <>
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot[fkey] ?? dot.missing}`} />
                    <span>{tf(fkey)}</span>
                  </>
                )}
              </span>
            </Pair>
          </Card>
        )}
      </div>

      <div className="flex basis-full flex-wrap items-center gap-2">
        <WatchlistButton ticker={ticker} />
        {/* Live membership probes read the materialized inbox; replay stays on the snapshot path. */}
        {issuer && !asOf && <TrackButton issuerId={issuer.issuer_id} />}
        <AnalyzeMenu ticker={ticker} />
        <span className="ml-auto text-[11px] text-[var(--text-dim)]">{t('quoteRemoved')}</span>
      </div>
    </section>
  );
}
