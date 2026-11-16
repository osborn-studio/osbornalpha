'use client';

// Reliability bins (spec §8.1, §9.5; canvas boards 4b and 7): the table is always rendered (table equivalent of the chart);
// the chart is opt-in through a real toggle, so narrow screens show the table first (canvas: "< 640px 先显示分箱表").
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ReliabilityBin } from '@/lib/judgments/types';
import { fmt, metricObject, num, reliabilityPoints, reliabilityRows, segmentClass, signed } from './view-model';

function ReliabilityChart({ bins, label }: { bins: ReliabilityBin[]; label: string }) {
  const pts = reliabilityPoints(bins);
  const max = Math.max(1, ...pts.map((p) => p.n));
  const x = (v: number) => 20 + v * 170;
  const y = (v: number) => 190 - v * 170;
  return (
    <svg viewBox="0 0 200 200" className="h-56 w-56" role="img" aria-label={label}>
      <rect x="20" y="20" width="170" height="170" fill="none" stroke="var(--border)" />
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--text-muted)" strokeDasharray="3 3" />
      {pts.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={2 + 4 * Math.sqrt(p.n / max)} fill="var(--text-dim)" />)}
      <text x="20" y="200" fontSize="8" fill="var(--text-muted)">0</text>
      <text x="184" y="200" fontSize="8" fill="var(--text-muted)">1</text>
    </svg>
  );
}

export function ReliabilityTable({ bins, metrics }: { bins: ReliabilityBin[]; metrics?: Record<string, unknown> }) {
  const t = useTranslations('judgments');
  const [chart, setChart] = useState(false);
  const headingId = useId();
  const rows = reliabilityRows(bins);
  const th = 'px-2 py-1 font-normal';
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold">{t('ui.reliability.title')}</h3>
        <div role="group" aria-label={t('ui.reliability.view')} className="flex overflow-hidden rounded border border-[var(--border)] text-xs">
          <button type="button" aria-pressed={!chart} className={`px-2 py-1 ${segmentClass(!chart)}`} onClick={() => setChart(false)}>{t('ui.reliability.tableOnly')}</button>
          <button type="button" aria-pressed={chart} className={`px-2 py-1 ${segmentClass(chart)}`} onClick={() => setChart(true)}>{t('ui.reliability.chartAndTable')}</button>
        </div>
      </div>
      {chart && <ReliabilityChart bins={bins} label={t('ui.reliability.chartLabel', { bins: rows.length })} />}
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[420px] text-left text-xs">
          <caption className="sr-only">{t('ui.reliability.caption')}</caption>
          <thead>
            <tr className="text-[var(--text-dim)]">
              <th scope="col" className={th}>{t('ui.reliability.columns.bin')}</th>
              <th scope="col" className={`${th} text-right`}>{t('ui.reliability.columns.n')}</th>
              <th scope="col" className={`${th} text-right`}>{t('ui.reliability.columns.meanP')}</th>
              <th scope="col" className={`${th} text-right`}>{t('ui.reliability.columns.hitRate')}</th>
              <th scope="col" className={`${th} text-right`}>{t('ui.reliability.columns.wilson')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.range} className="border-t border-[var(--border)]">
                <td className="px-2 py-1">{r.range}</td>
                <td className="px-2 py-1 text-right">{r.n}</td>
                <td className="px-2 py-1 text-right">{r.meanP}</td>
                <td className="px-2 py-1 text-right">{r.hitRate}</td>
                <td className="px-2 py-1 text-right">{r.wilson}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {metrics && (
        <p className="num text-[11px] text-[var(--text-dim)]">
          {t('ui.reliability.summary', { brier: fmt(num(metrics, 'brier'), 3), skill: signed(num(metrics, 'brier_skill')), ece: fmt(num(metricObject(metrics, 'temporal_split'), 'ece_raw_holdout'), 3) })}
        </p>
      )}
    </section>
  );
}
