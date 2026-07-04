'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Disclaimer } from '@/components/Disclaimer';
import { useDisplayTimezone } from '@/components/TimezoneProvider';
import { formatDateTimeLocale, type AppLocale } from '@/lib/i18n/locale';
import { marketLabel } from '@/lib/utils';
import type { RadarPayload, RadarLevel } from '@/lib/brief/radar';
import { useWatchlist } from '@/lib/hooks/useWatchlist';
import { uniqueWatchlistTickers } from '@/lib/watchlist/store';

interface RadarApiResponse {
  radars: Record<string, RadarPayload | { error: string }>;
  order: string[];
  generated_at: string;
}

function emojiForLevel(l: RadarLevel | undefined): string {
  return l === 'red' ? '🔴' : l === 'yellow' ? '🟡' : '⚪️';
}

function colorClassForLevel(l: RadarLevel | undefined): string {
  if (l === 'red') return 'border-l-down';
  if (l === 'yellow') return 'border-l-accent';
  return 'border-l-border';
}

export default function RadarPage() {
  const t = useTranslations('radar');
  const locale = useLocale() as AppLocale;
  const tz = useDisplayTimezone();
  const { groups, hydrated } = useWatchlist();
  const [data, setData] = useState<RadarApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<RadarLevel | 'all'>('all');
  const [showMarkdown, setShowMarkdown] = useState<string | null>(null);

  const allTickers = useMemo(() => uniqueWatchlistTickers(groups), [groups]);

  async function fetchAll() {
    if (allTickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/radar/batch?tickers=${encodeURIComponent(allTickers.join(','))}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as RadarApiResponse;
      setData(json);
      setGeneratedAt(json.generated_at);
    } catch (e: any) {
      setError(e?.message || t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  // Initial load when watchlist hydrates
  useEffect(() => {
    if (hydrated && allTickers.length > 0 && !data) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, allTickers.length]);

  // Visible list
  const orderedTickers = data?.order || allTickers;
  const visible = orderedTickers.filter((t) => {
    const r = data?.radars[t];
    if (!r || 'error' in r) return filterLevel === 'all';
    return filterLevel === 'all' || r.radar_level === filterLevel;
  });

  // Counters per level
  const counters = useMemo(() => {
    const c = { red: 0, yellow: 0, white: 0, errors: 0 };
    if (!data) return c;
    for (const t of orderedTickers) {
      const r = data.radars[t];
      if (!r) continue;
      if ('error' in r) { c.errors++; continue; }
      c[r.radar_level]++;
    }
    return c;
  }, [data, orderedTickers]);

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <div className="mt-0.5 text-[11px] text-text-dim">
            {t('subtitlePrefix')}<code className="rounded bg-bg-card px-1">stock-daily-radar</code>{t('subtitleSuffix')}
            {generatedAt && (
              <span className="ml-2">{t('generatedAt', { time: formatDateTimeLocale(generatedAt, locale, tz) })}</span>
            )}
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading || allTickers.length === 0}
          className="shrink-0 rounded-md bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? t('refreshing') : t('refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded bg-down/10 px-3 py-2 text-xs text-down">⚠️ {error}</div>
      )}

      {!hydrated && (
        <div className="card-base py-8 text-center text-sm text-text-dim">
          {t('loadingWatchlist')}
        </div>
      )}

      {hydrated && allTickers.length === 0 && (
        <div className="card-base py-8 text-center text-sm text-text-dim">
          {t('emptyPrefix')}<Link href="/watchlist" className="text-accent">{t('emptyLink')}</Link>{t('emptySuffix')}
        </div>
      )}

      {/* Level filter pills */}
      {data && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          {(['all', 'red', 'yellow', 'white'] as const).map((lv) => {
            const isAll = lv === 'all';
            const count = isAll
              ? counters.red + counters.yellow + counters.white
              : counters[lv as Exclude<typeof lv, 'all'>];
            const label = isAll ? t('filter.all') : lv === 'red' ? t('filter.red') : lv === 'yellow' ? t('filter.yellow') : t('filter.white');
            return (
              <button
                key={lv}
                onClick={() => setFilterLevel(lv as any)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 transition ${
                  filterLevel === lv
                    ? 'border-accent bg-accent-dim text-white'
                    : 'border-border bg-bg-card text-text-dim hover:text-text'
                }`}
              >
                {label} {count}
              </button>
            );
          })}
          {counters.errors > 0 && (
            <span className="ml-2 text-[10px] text-down">{t('loadErrors', { count: counters.errors })}</span>
          )}
        </div>
      )}

      {/* Cards */}
      <div className="space-y-2">
        {visible.map((ticker) => {
          const r = data?.radars[ticker];
          if (!r) {
            return (
              <div key={ticker} className="card-base flex items-center justify-between text-xs">
                <span>{ticker}</span>
                <span className="text-text-dim">{t('cardLoading')}</span>
              </div>
            );
          }
          if ('error' in r) {
            return (
              <div key={ticker} className="card-base border-l-2 border-l-down text-xs">
                <div className="font-semibold">{ticker}</div>
                <div className="text-down">⚠ {r.error}</div>
              </div>
            );
          }
          return <RadarCard key={ticker} r={r} onShowMarkdown={setShowMarkdown} />;
        })}
      </div>

      {showMarkdown && (
        <MarkdownModal markdown={showMarkdown} onClose={() => setShowMarkdown(null)} />
      )}

      <Disclaimer />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Single radar card
// ──────────────────────────────────────────────────────────────────────────

interface CardProps {
  r: RadarPayload;
  onShowMarkdown: (md: string) => void;
}

function RadarCard({ r, onShowMarkdown }: CardProps) {
  const t = useTranslations('radar');
  const locale = useLocale() as AppLocale;
  const change = r.sections.price.change_pct;
  const changeCls =
    change === null ? 'text-text-dim' : change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-text-dim';

  return (
    <div className={`card-base border-l-2 ${colorClassForLevel(r.radar_level)}`}>
      {/* Header */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="text-text hover:no-underline">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                {marketLabel(r.market)}
              </span>
              <span className="truncate text-sm font-semibold">{r.name}</span>
              <span className="text-[11px] text-text-muted">{r.ticker}</span>
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className={`text-sm font-semibold ${changeCls}`}>
            {r.sections.price.value !== null
              ? `${r.sections.price.currency}${r.sections.price.value.toFixed(2)}`
              : '—'}
            {change !== null && (
              <span className="ml-1.5 text-xs">{change > 0 ? '+' : ''}{change.toFixed(2)}%</span>
            )}
          </div>
          <div className="text-[10px] text-text-muted">
            {emojiForLevel(r.radar_level)} {r.level_label} · {t('score')} {r.score >= 0 ? '+' : ''}{r.score}
          </div>
        </div>
      </div>

      {/* Headline */}
      <div className="mb-1.5 text-xs">
        <span className="font-semibold text-accent">Top Call: </span>
        <span>{r.headline}</span>
      </div>

      {/* Triggers row (chips) */}
      {r.triggers.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {r.triggers.map((t, i) => (
            <span
              key={i}
              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                t.weight > 0 ? 'border-up/40 text-up' : 'border-down/40 text-down'
              }`}
              title={t.rule}
            >
              {t.desc}
            </span>
          ))}
        </div>
      )}

      {/* Flows + events one-liner */}
      {(r.sections.flows.available || r.sections.events.length > 0) && (
        <div className="space-y-0.5 text-[11px] text-text-dim">
          {r.sections.flows.available && r.sections.flows.north_top10_count_30d > 0 && (
            <div>
              {t('flows.northPrefix')}<span className="text-text font-semibold">{r.sections.flows.north_top10_count_30d}</span>{t('flows.northSuffix')}
              {r.sections.flows.north_latest_rank !== null && (
                <span className="text-text-muted">{t('flows.latestRank', { rank: r.sections.flows.north_latest_rank })}</span>
              )}
              {r.sections.flows.north_total_amount_30d_yi !== null && (
                <span className="text-text-muted">{t('flows.totalAmount', {
                  amount: locale === 'en'
                    ? (r.sections.flows.north_total_amount_30d_yi / 10).toFixed(1)
                    : r.sections.flows.north_total_amount_30d_yi.toFixed(0),
                })}</span>
              )}
            </div>
          )}
          {r.sections.flows.limit_streak >= 3 && (
            <div className="font-semibold text-up">{t('flows.limitStreak', { count: r.sections.flows.limit_streak })}</div>
          )}
          {r.sections.events.length > 0 && (
            <div>
              {t('flows.events', { count: r.sections.events.length })}
              <span className="text-text">{r.sections.events[0].title.slice(0, 30)}{r.sections.events[0].title.length > 30 ? '…' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[10px]">
        <span className="text-text-muted">{t('source', { source: r.sections.price.source })}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onShowMarkdown(r.markdown)}
            className="text-accent hover:underline"
          >
            {t('fullNote')}
          </button>
          <Link href={`/stock/${encodeURIComponent(r.ticker)}`} className="text-accent hover:underline">
            {t('details')}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Markdown modal
// ──────────────────────────────────────────────────────────────────────────

function MarkdownModal({ markdown, onClose }: { markdown: string; onClose: () => void }) {
  const t = useTranslations('radar');
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-bg-elevated p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">📝 Morning Note</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(markdown);
              }}
              className="rounded bg-accent-dim px-2 py-1 text-xs text-white"
            >
              {t('copy')}
            </button>
            <button onClick={onClose} className="rounded p-1 text-text-dim hover:text-text">×</button>
          </div>
        </div>
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text">{markdown}</pre>
      </div>
    </div>
  );
}
