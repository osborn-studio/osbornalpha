'use client';
// IndicatorTable — overview / indicators table (spec §3.2, canvas OverviewOff): name | value | change | period |
// available | status | sparkline. Clicking a value opens the evidence drawer. Missing/restricted rows are greyed with
// their reason. Moves use neutral arrows only. Below 640px only name / value / change are shown (spec §3.6).
import Link from 'next/link';
import { Sparkline } from './charts/Sparkline';
import type { MacroT } from './use-macro-t';
import { statusKey, type IndicatorView } from './view-model';

export function IndicatorTable({ rows, t, onOpenEvidence, onPreview, previewId }: {
  rows: IndicatorView[]; t: MacroT; onOpenEvidence?: (row: IndicatorView) => void; onPreview?: (seriesId: string) => void; previewId?: string | null;
}) {
  if (rows.length === 0) return <div className="text-xs text-text-dim">{t('table.empty')}</div>;
  const th = 'px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-text-dim';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left">
            <th className={th}>{t('table.name')}</th>
            <th className={`${th} text-right`}>{t('table.value')}</th>
            <th className={`${th} text-right`}>{t('table.change')}</th>
            <th className={`${th} hidden sm:table-cell`}>{t('table.period')}</th>
            <th className={`${th} hidden md:table-cell`}>{t('table.available')}</th>
            <th className={`${th} hidden sm:table-cell`}>{t('table.status')}</th>
            <th className={`${th} hidden md:table-cell`}>{t('table.spark')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.seriesId} className={`border-t border-border ${row.muted ? 'text-text-dim' : ''} ${previewId === row.seriesId ? 'bg-[var(--bg-hover)]' : ''}`}>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  {onPreview && !row.muted ? (
                    <button type="button" aria-expanded={previewId === row.seriesId} onClick={() => onPreview(row.seriesId)} className="text-left font-medium text-text hover:text-accent">
                      {row.name}
                    </button>
                  ) : (
                    <span className="font-medium">{row.name}</span>
                  )}
                  {!row.muted && (
                    <Link href={`/intel/macro/${encodeURIComponent(row.seriesId)}`} className="text-[11px] text-text-dim hover:text-accent">
                      {t('table.detail')}
                    </Link>
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {row.hasEvidence && onOpenEvidence ? (
                  <button type="button" onClick={() => onOpenEvidence(row)} className="border-b border-dotted border-accent font-mono tabular-nums text-text">
                    {row.value}{row.unit}
                  </button>
                ) : (
                  <span>{row.value}{row.unit}</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-text-dim">
                {row.change ? `${row.change.arrow} ${row.change.text}` : '—'}
              </td>
              <td className="hidden px-2 py-1.5 font-mono tabular-nums sm:table-cell">{row.period}</td>
              <td className="hidden px-2 py-1.5 font-mono tabular-nums md:table-cell">{row.available}</td>
              <td className="hidden px-2 py-1.5 sm:table-cell">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] ${row.status === 'active' && row.timeliness === 'late' ? 'border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn' : 'border-border text-text-dim'}`}>
                  {t(statusKey(row))}
                </span>
              </td>
              <td className="hidden px-2 py-1.5 md:table-cell">
                {row.muted ? <span className="text-[11px]">{row.reason ?? '—'}</span> : <Sparkline values={row.spark} label={t('table.sparkLabel', { name: row.name })} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
