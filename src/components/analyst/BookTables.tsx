'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Metric, Panel, metricTrendClass } from '@/components/ui';
import { formatPct, formatPrice } from '@/lib/utils';
import { exchangeDate } from '@/lib/scoring/forward';
import type { Book } from '@/lib/analyst/book';
import type { Market } from '@/lib/supabase/database.types';

type T = (key: string, values?: Record<string, number>) => string;
export const pctOrDash = (v: number | null) => (v === null ? '--' : formatPct(v));
// HK quotes tick at three decimals; formatPrice would round them to two.
export const formatFill = (price: number, market: Market) =>
  market === 'HK' ? price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : formatPrice(price);
const withN = (v: number | null, n: number, t: T) => (v === null ? '--' : `${formatPct(v, false)} · ${t('common.n', { n })}`);

export function BookSummaryPanel({ book }: { book: Book }) {
  const t = useTranslations('analyst');
  const s = book.summary;
  return (
    <Panel title={t('book.summaryTitle')}>
      <div className="flex flex-wrap gap-6">
        <Metric label={t('book.recommendations')} value={String(s.recommendations)} />
        <Metric label={t('book.hitRate')} value={withN(s.hit_rate, s.scorable, t)} />
        <Metric label={t('book.avgScore')} value={s.avg_score === null ? '--' : `${s.avg_score.toFixed(1)} · ${t('common.n', { n: s.n_score })}`} change={s.avg_score ?? undefined} />
        <Metric label={t('book.openPositions')} value={String(s.open_positions)} />
        <Metric label={t('book.avgUnrealized')} value={withN(s.avg_unrealized_pct, s.n_unrealized, t)} change={s.avg_unrealized_pct ?? undefined} />
        <Metric label={t('book.avgRealized')} value={withN(s.avg_realized_pct, s.closed_units, t)} change={s.avg_realized_pct ?? undefined} />
        <Metric label={t('book.unpriced')} value={String(s.unpriced)} />
        <Metric label={t('book.noPositionToSell')} value={String(s.no_position_to_sell)} />
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">{t('book.rule')}</p>
    </Panel>
  );
}

export function BookTables({ book }: { book: Book }) {
  const t = useTranslations('analyst');
  const th = 'pb-1 font-normal';
  return (
    <>
      <Panel title={t('book.positionsTitle', { count: book.positions.length })}>
        {book.positions.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">{t('book.positionsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className={th}>{t('book.columns.ticker')}</th>
                  <th className={th}>{t('recommendationForm.market')}</th>
                  <th className={th}>{t('book.columns.units')}</th>
                  <th className={th}>{t('book.columns.avgFill')}</th>
                  <th className={th}>{t('book.columns.lastClose')}</th>
                  <th className={th}>{t('book.columns.unrealized')}</th>
                  <th className={th}>{t('book.columns.weight')}</th>
                  <th className={th}>{t('book.columns.openedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {book.positions.map((p) => (
                  <tr key={`${p.market}:${p.ticker}`} className="border-t border-[var(--border)]">
                    <td className="py-1"><Link href={`/stock/${encodeURIComponent(p.ticker)}`} className="text-accent hover:underline">{p.ticker}</Link></td>
                    <td className="py-1">{t(`market.${p.market}`)}</td>
                    <td className="py-1">{p.units}</td>
                    <td className="py-1">{formatFill(p.avg_fill, p.market)}</td>
                    <td className="py-1" title={p.last_close_date ?? undefined}>{p.last_close === null ? '--' : formatFill(p.last_close, p.market)}</td>
                    <td className={`py-1 ${p.unrealized_pct === null ? '' : metricTrendClass(p.unrealized_pct)}`}>{pctOrDash(p.unrealized_pct)}</td>
                    <td className="py-1">{formatPct(p.weight * 100, false)}</td>
                    <td className="py-1">{exchangeDate(p.opened_at, p.market)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {book.closed.length > 0 && (
        <Panel title={t('book.closedTitle', { count: book.closed.length })}>
          <div className="overflow-x-auto">
            <table className="num w-full text-left text-xs">
              <thead>
                <tr className="text-[var(--text-dim)]">
                  <th className={th}>{t('book.columns.ticker')}</th>
                  <th className={th}>{t('recommendationForm.market')}</th>
                  <th className={th}>{t('book.columns.units')}</th>
                  <th className={th}>{t('book.columns.avgFill')}</th>
                  <th className={th}>{t('book.columns.exitPrice')}</th>
                  <th className={th}>{t('book.columns.realized')}</th>
                  <th className={th}>{t('book.columns.closedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {book.closed.map((c) => (
                  <tr key={c.recommendation_id} className="border-t border-[var(--border)]">
                    <td className="py-1"><Link href={`/stock/${encodeURIComponent(c.ticker)}`} className="text-accent hover:underline">{c.ticker}</Link></td>
                    <td className="py-1">{t(`market.${c.market}`)}</td>
                    <td className="py-1">{c.units}</td>
                    <td className="py-1">{formatFill(c.avg_fill, c.market)}</td>
                    <td className="py-1">{formatFill(c.exit_price, c.market)}</td>
                    <td className={`py-1 ${metricTrendClass(c.realized_pct)}`}>{formatPct(c.realized_pct)}</td>
                    <td className="py-1">{exchangeDate(c.closed_at, c.market)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}
