'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useStockResearch } from '@/lib/hooks/useStockResearch';
import type { StockReportItem } from '@/lib/stocks/research-types';
import { ExternalLink } from '@/components/ExternalLink';

function formatPublishedAt(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function targetText(report: StockReportItem, currency: string): string | null {
  const min = report.targetPriceMin;
  const max = report.targetPriceMax;
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${currency}${min.toFixed(2)} - ${currency}${max.toFixed(2)}`;
  return `${currency}${(min ?? max)!.toFixed(2)}`;
}

export function StockResearchPanel({ ticker, currency }: { ticker: string; currency: string }) {
  const t = useTranslations('market.stock.news');
  const locale = useLocale();
  const research = useStockResearch(ticker);
  const news = research.news?.items ?? [];
  const reports = research.reports?.items ?? [];
  const consensus = research.reports?.consensus;
  const statuses = [research.news?.meta.status, research.reports?.meta.status].filter(Boolean);
  const unavailable = !research.loading && statuses.length > 0 && statuses.every((status) => status === 'unavailable');
  const partial = statuses.some((status) => status === 'partial' || status === 'error');
  const providers = Array.from(new Set([
    ...(research.news?.meta.providers ?? []),
    ...(research.reports?.meta.providers ?? []),
  ]));

  if (research.loading) return <div className="card-base py-10 text-center text-sm text-text-dim">{t('loading')}</div>;

  return (
    <>
      {(research.error || unavailable || partial) && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${unavailable || research.error ? 'border-warn/30 bg-warn/10 text-warn' : 'border-border bg-bg-elevated text-text-dim'}`} role="status">
          {research.error ? t('loadFailed') : unavailable ? t('providerUnavailable') : t('partialData')}
        </div>
      )}

      <section className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('brokerReportsHeading', { count: reports.length })}</div>
        {consensus && (
          <div className="mb-3 border-l-2 border-accent bg-bg-elevated px-3 py-2.5 text-sm">
            <div className="font-semibold tabular-nums">{t('consensusTarget', { price: `${currency}${consensus.targetMedian.toFixed(2)}` })}</div>
            <div className="text-[11px] text-text-dim">
              {t('reportCount', { n: consensus.count })}
              {consensus.targetMin != null && consensus.targetMax != null && consensus.targetMax > consensus.targetMin
                ? t('range', { min: `${currency}${consensus.targetMin.toFixed(2)}`, max: `${currency}${consensus.targetMax.toFixed(2)}` })
                : ''}
            </div>
          </div>
        )}
        {reports.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-dim">{t('noRecentReports')}</div>
        ) : reports.map((report) => {
          const target = targetText(report, currency);
          return (
            <article key={report.id} className="grid gap-2 border-b border-border px-1 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <ExternalLink href={report.url} className="font-semibold text-text hover:text-accent">{report.title}</ExternalLink>
                <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-text-muted">
                  <span>{report.broker || report.source}</span>
                  <span>{formatPublishedAt(report.publishedAt, locale, t('publishedUnknown'))}</span>
                  {report.rating && <span>{report.rating}</span>}
                  {!report.url && <span>{t('metadataOnly')}</span>}
                </div>
              </div>
              {target && <div className="text-sm font-semibold tabular-nums text-accent">{t('targetLabel', { target })}</div>}
            </article>
          );
        })}
      </section>

      <section className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">{t('newsHeading', { count: news.length })}</div>
        {news.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-dim">{t('noNews')}</div>
        ) : news.map((item) => (
          <article key={item.id} className="border-b border-border px-1 py-3 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <ExternalLink href={item.url} className="font-medium leading-snug text-text hover:text-accent">{item.title}</ExternalLink>
              {item.sentiment != null && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums ${item.sentiment > 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                  {item.sentiment > 0 ? '+' : ''}{item.sentiment.toFixed(1)}
                </span>
              )}
            </div>
            {item.snippet && <p className="mt-1.5 text-xs leading-relaxed text-text-dim">{item.snippet}</p>}
            <div className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-text-muted">
              <span>{item.source}</span>
              <span>{formatPublishedAt(item.publishedAt, locale, t('publishedUnknown'))}</span>
              <span>{t('trust', { value: Math.round(item.trustScore * 100) })}</span>
              {!item.url && <span>{t('metadataOnly')}</span>}
            </div>
          </article>
        ))}
      </section>

      {providers.length > 0 && <div className="px-1 text-[10px] text-text-muted">{t('providers', { value: providers.join(' / ') })}</div>}
    </>
  );
}
