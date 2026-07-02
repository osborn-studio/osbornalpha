'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, Metric, Tag } from '@/components/ui';
import { formatPct } from '@/lib/utils';
import type { Decision, DecisionReview } from '@/lib/supabase/database.types';

function SubNav({ current }: { current: 'cockpit' | 'decisions' | 'positions' | 'review' }) {
  const items: Array<{ key: typeof current; href: string; label: string }> = [
    { key: 'cockpit', href: '/portfolio', label: '驾驶舱' },
    { key: 'decisions', href: '/portfolio/decisions', label: '决策日志' },
    { key: 'positions', href: '/portfolio/positions', label: '持仓明细' },
    { key: 'review', href: '/portfolio/review', label: '复盘' },
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

const ACTION_LABEL: Record<Decision['action'], string> = {
  buy: '买入', sell: '卖出', trim: '减仓', add: '加仓', hold: '持有', pass: '观望',
};

const BUCKET_ORDER = ['0-20', '20-40', '40-60', '60-80', '80-100'];

interface ReviewedRow {
  decision: Decision;
  review: DecisionReview;
}

export default function ReviewPage() {
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

  return (
    <div className="space-y-4 p-4">
      <SubNav current="review" />

      {loading ? (
        <p className="text-sm text-[var(--text-dim)]">加载中…</p>
      ) : error ? (
        <p className="text-sm text-[var(--down)]">{error}</p>
      ) : rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--text-dim)]">
            暂无可评分决策——决策录入满 5 个交易日后自动出现评分
          </p>
        </Panel>
      ) : (
        <>
          {refreshing && <p className="text-xs text-[var(--text-dim)]">正在刷新评分…</p>}

          <Panel title="复盘概览">
            <div className="flex flex-wrap gap-6">
              <Metric label="已评分" value={String(summary.n)} />
              <Metric label="胜率" value={summary.hitRate !== null ? formatPct(summary.hitRate, false) : '--'} change={summary.hitRate !== null ? summary.hitRate - 50 : undefined} />
              <Metric label="均 5d" value={summary.avg5d !== null ? formatPct(summary.avg5d) : '--'} change={summary.avg5d ?? undefined} />
              <Metric label="均 20d" value={summary.avg20d !== null ? formatPct(summary.avg20d) : '--'} change={summary.avg20d ?? undefined} />
            </div>
          </Panel>

          <Panel title="信心校准">
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className="pb-1 font-normal">信心区间</th>
                  <th className="pb-1 font-normal">决策数</th>
                  <th className="pb-1 font-normal">命中率</th>
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

          <Panel title="评分明细">
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className="pb-1 font-normal">日期</th>
                  <th className="pb-1 font-normal">标的</th>
                  <th className="pb-1 font-normal">动作</th>
                  <th className="pb-1 font-normal">信心</th>
                  <th className="pb-1 font-normal">5d</th>
                  <th className="pb-1 font-normal">20d</th>
                  <th className="pb-1 font-normal">60d</th>
                  <th className="pb-1 font-normal">命中</th>
                  <th className="pb-1 font-normal">评分</th>
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
        </>
      )}
    </div>
  );
}
