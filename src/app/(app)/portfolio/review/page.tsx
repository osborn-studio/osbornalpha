'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, Metric, Tag } from '@/components/ui';
import { formatPct } from '@/lib/utils';
import type { Decision, DecisionReview } from '@/lib/supabase/database.types';

interface SignalStatsLite { hit_rate_5d: number }

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const t = useTranslations('portfolio');
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: t('nav.cockpit') },
    { key: 'decisions', href: '/portfolio/decisions', label: t('nav.decisions') },
    { key: 'positions', href: '/portfolio/positions', label: t('nav.positions') },
    { key: 'review', href: '/portfolio/review', label: t('nav.review') },
  ];
  return (
    <nav className="flex items-center gap-3 text-sm">
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-3">
          {i > 0 && <span className="text-[var(--text-dim)]">·</span>}
          <Link
            href={item.href}
            className={item.key === current ? 'font-medium text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

const BUCKET_ORDER = ['0-20', '20-40', '40-60', '60-80', '80-100'];

interface ReviewedRow {
  decision: Decision;
  review: DecisionReview;
}

export default function ReviewPage() {
  const t = useTranslations('portfolio');
  const ACTION_LABEL: Record<Decision['action'], string> = {
    buy: t('action.buy'), sell: t('action.sell'), trim: t('action.trim'),
    add: t('action.add'), hold: t('action.hold'), pass: t('action.pass'),
  };
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reviews, setReviews] = useState<DecisionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [dRes, rRes] = await Promise.all([fetch('/api/decisions'), fetch('/api/reviews')]);
    const dJson = await dRes.json().catch(() => ({}));
    const rJson = await rRes.json().catch(() => ({}));
    if (!dRes.ok) throw new Error(dJson.error || `http ${dRes.status}`);
    if (!rRes.ok) throw new Error(rJson.error || `http ${rRes.status}`);
    setDecisions(dJson.decisions ?? []);
    setReviews(rJson.reviews ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
        setRefreshing(true);
        const res = await fetch('/api/reviews', { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `http ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    })();
  }, [loadAll]);

  const decisionById = useMemo(() => new Map(decisions.map((d) => [d.id, d])), [decisions]);

  const rows: ReviewedRow[] = useMemo(() => {
    return reviews
      .map((review) => {
        const decision = decisionById.get(review.decision_id);
        return decision ? { decision, review } : null;
      })
      .filter((r): r is ReviewedRow => r !== null)
      .sort((a, b) => (a.decision.decided_at < b.decision.decided_at ? 1 : -1));
  }, [reviews, decisionById]);

  const scoredRows = useMemo(() => rows.filter((r) => r.review.hit !== null), [rows]);

  const summary = useMemo(() => {
    const n = scoredRows.length;
    const hits = scoredRows.filter((r) => r.review.hit === true).length;
    const avg = (pick: (r: ReviewedRow) => number | null) => {
      const vals = scoredRows.map(pick).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    return {
      n,
      hitRate: n ? (hits / n) * 100 : null,
      avg5d: avg((r) => r.review.forward_5d_pct),
      avg20d: avg((r) => r.review.forward_20d_pct),
    };
  }, [scoredRows]);

  const calibration = useMemo(() => {
    const groups = new Map<string, ReviewedRow[]>();
    for (const row of rows) {
      const bucket = row.review.calibration_bucket;
      if (!bucket) continue;
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(row);
    }
    return BUCKET_ORDER.map((bucket) => {
      const group = groups.get(bucket) ?? [];
      const scored = group.filter((r) => r.review.hit !== null);
      const hits = scored.filter((r) => r.review.hit === true).length;
      return {
        bucket,
        count: group.length,
        hitRate: scored.length ? (hits / scored.length) * 100 : null,
      };
    }).filter((g) => g.count > 0);
  }, [rows]);

  // ─── 决策 vs 信号对照 ───────────────────────────────────────────────────
  const [signalStats, setSignalStats] = useState<Record<string, SignalStatsLite | null>>({});

  const scoredTickers = useMemo(
    () => Array.from(new Set(scoredRows.map((r) => r.decision.ticker))).sort(),
    [scoredRows]
  );

  useEffect(() => {
    const toFetch = scoredTickers.filter((t) => !(t in signalStats));
    if (toFetch.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        toFetch.map(async (ticker) => {
          try {
            const res = await fetch(`/api/signals/${encodeURIComponent(ticker)}`);
            const data = await res.json().catch(() => ({}));
            const stats: SignalStatsLite | null =
              res.ok && data?.stats && typeof data.stats.hit_rate_5d === 'number'
                ? { hit_rate_5d: data.stats.hit_rate_5d }
                : null;
            return [ticker, stats] as const;
          } catch {
            return [ticker, null] as const;
          }
        })
      );
      if (cancelled) return;
      setSignalStats((prev) => {
        const next = { ...prev };
        for (const [ticker, stats] of results) next[ticker] = stats;
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [scoredTickers, signalStats]);

  const decisionVsSignal = useMemo(() => {
    return scoredTickers.map((ticker) => {
      const tickerRows = scoredRows.filter((r) => r.decision.ticker === ticker);
      const hits = tickerRows.filter((r) => r.review.hit === true).length;
      const myHitRate = tickerRows.length ? (hits / tickerRows.length) * 100 : null;
      const stats = signalStats[ticker];
      const signalHitRate = stats ? stats.hit_rate_5d * 100 : stats === null ? null : undefined; // undefined = still loading
      const diff = myHitRate !== null && signalHitRate != null ? myHitRate - signalHitRate : null;
      return { ticker, n: tickerRows.length, myHitRate, signalHitRate, diff };
    });
  }, [scoredTickers, scoredRows, signalStats]);

  const threeWaySummary = useMemo(() => {
    const n = scoredRows.length;
    const hits = scoredRows.filter((r) => r.review.hit === true).length;
    const myOverall = n ? (hits / n) * 100 : null;

    const signalRates = scoredTickers
      .map((t) => signalStats[t])
      .filter((s): s is SignalStatsLite => s != null)
      .map((s) => s.hit_rate_5d * 100);
    const signalAvg = signalRates.length
      ? signalRates.reduce((a, b) => a + b, 0) / signalRates.length
      : null;

    const copilotRows = scoredRows.filter((r) => r.decision.source_type === 'copilot');
    const copilotHits = copilotRows.filter((r) => r.review.hit === true).length;
    const copilotHitRate = copilotRows.length ? (copilotHits / copilotRows.length) * 100 : null;

    return { myOverall, signalAvg, copilotHitRate, copilotN: copilotRows.length };
  }, [scoredRows, scoredTickers, signalStats]);

  return (
    <div className="space-y-4 p-4">
      <SubNav current="review" />

      {loading ? (
        <p className="text-sm text-[var(--text-dim)]">{t('review.loading')}</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{error}</p>
      ) : rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">
            {t('review.empty')}
          </p>
        </Panel>
      ) : (
        <>
          {refreshing && <p className="text-xs text-[var(--text-dim)]">{t('review.refreshing')}</p>}

          <Panel title={t('review.overviewTitle')}>
            <div className="flex flex-wrap gap-6">
              <Metric label={t('review.scored')} value={String(summary.n)} />
              <Metric label={t('review.hitRate')} value={summary.hitRate !== null ? formatPct(summary.hitRate, false) : '--'} change={summary.hitRate !== null ? summary.hitRate - 50 : undefined} />
              <Metric label={t('review.avg5d')} value={summary.avg5d !== null ? formatPct(summary.avg5d) : '--'} change={summary.avg5d ?? undefined} />
              <Metric label={t('review.avg20d')} value={summary.avg20d !== null ? formatPct(summary.avg20d) : '--'} change={summary.avg20d ?? undefined} />
            </div>
          </Panel>

          <Panel title={t('review.calibrationTitle')}>
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className="pb-1 font-normal">{t('review.calibrationColumns.bucket')}</th>
                  <th className="pb-1 font-normal">{t('review.calibrationColumns.count')}</th>
                  <th className="pb-1 font-normal">{t('review.calibrationColumns.hitRate')}</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map((g) => (
                  <tr key={g.bucket} className="border-t border-[var(--border)]">
                    <td className="py-1">{g.bucket}</td>
                    <td className="py-1">{g.count}</td>
                    <td className="py-1">{g.hitRate !== null ? formatPct(g.hitRate, false) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={t('review.detailTitle')}>
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className="pb-1 font-normal">{t('review.detailColumns.date')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.ticker')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.action')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.confidence')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.d5')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.d20')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.d60')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.hit')}</th>
                  <th className="pb-1 font-normal">{t('review.detailColumns.score')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ decision, review }) => (
                  <tr key={review.id} className="border-t border-[var(--border)]">
                    <td className="py-1">{decision.decided_at.slice(0, 10)}</td>
                    <td className="py-1">{decision.ticker}</td>
                    <td className="py-1">{ACTION_LABEL[decision.action]}</td>
                    <td className="py-1">{decision.confidence ?? '--'}</td>
                    <td className="py-1">{review.forward_5d_pct !== null ? formatPct(review.forward_5d_pct) : '--'}</td>
                    <td className="py-1">{review.forward_20d_pct !== null ? formatPct(review.forward_20d_pct) : '--'}</td>
                    <td className="py-1">{review.forward_60d_pct !== null ? formatPct(review.forward_60d_pct) : '--'}</td>
                    <td className="py-1">
                      {review.hit === null ? (
                        '--'
                      ) : review.hit ? (
                        <Tag tone="up">✓</Tag>
                      ) : (
                        <Tag tone="down">✗</Tag>
                      )}
                    </td>
                    <td className="py-1">{review.score !== null ? review.score.toFixed(1) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={t('review.vsSignalTitle')}>
            {scoredRows.length === 0 ? (
              <p className="text-sm text-[var(--text-dim)]">{t('review.vsSignalEmpty')}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-6">
                  <Metric
                    label={t('review.myOverallHitRate')}
                    value={threeWaySummary.myOverall !== null ? formatPct(threeWaySummary.myOverall, false) : '--'}
                  />
                  <Metric
                    label={t('review.signalAvgHitRate')}
                    value={threeWaySummary.signalAvg !== null ? formatPct(threeWaySummary.signalAvg, false) : '--'}
                  />
                  <Metric
                    label={t('review.copilotHitRate', { countSuffix: threeWaySummary.copilotN ? ` (${threeWaySummary.copilotN})` : '' })}
                    value={threeWaySummary.copilotHitRate !== null ? formatPct(threeWaySummary.copilotHitRate, false) : '--'}
                  />
                </div>
                <table className="num w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--text-dim)]">
                      <th className="pb-1 font-normal">{t('review.vsSignalColumns.ticker')}</th>
                      <th className="pb-1 font-normal">{t('review.vsSignalColumns.scoredCount')}</th>
                      <th className="pb-1 font-normal">{t('review.vsSignalColumns.myHitRate')}</th>
                      <th className="pb-1 font-normal">{t('review.vsSignalColumns.signalHitRate5d')}</th>
                      <th className="pb-1 font-normal">{t('review.vsSignalColumns.diff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisionVsSignal.map((r) => (
                      <tr key={r.ticker} className="border-t border-[var(--border)]">
                        <td className="py-1">{r.ticker}</td>
                        <td className="py-1">{r.n}</td>
                        <td className="py-1">{r.myHitRate !== null ? formatPct(r.myHitRate, false) : '--'}</td>
                        <td className="py-1">
                          {r.signalHitRate === undefined ? t('review.loading') : r.signalHitRate !== null ? formatPct(r.signalHitRate, false) : '--'}
                        </td>
                        <td className="py-1">
                          {r.diff !== null ? (
                            <span className={r.diff > 0 ? 'text-[var(--up)]' : r.diff < 0 ? 'text-[var(--down)]' : undefined}>
                              {r.diff > 0 ? '+' : ''}{r.diff.toFixed(1)}pp
                            </span>
                          ) : (
                            '--'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
