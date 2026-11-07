// ChangesCard — 本期变化 (spec §3.2, canvas OverviewOff): four counters plus the latest change lines. Counts only.
import { Panel } from '@/components/ui';
import type { MacroT } from './use-macro-t';
import type { ChangeLine } from './view-model';

const KINDS = ['new_release', 'revised', 'late', 'missing'] as const;

export function ChangesCard({ counts, lines, t }: { counts: Record<(typeof KINDS)[number], number>; lines: ChangeLine[]; t: MacroT }) {
  return (
    <Panel title={t('changes.title')}>
      <div className="grid grid-cols-4 gap-2">
        {KINDS.map((k) => (
          <div key={k} className="rounded-md border border-border bg-bg-card p-2">
            <div className="text-[11px] text-text-dim">{t(`changes.${k}`)}</div>
            <div className={`font-mono text-xl font-semibold tabular-nums ${k === 'late' && counts[k] > 0 ? 'text-warn' : k === 'missing' ? 'text-text-dim' : ''}`}>{counts[k]}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-text-dim">{t('changes.latest')}</div>
      {lines.length === 0 ? (
        <div className="mt-1 text-xs text-text-dim">{t('changes.empty')}</div>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {lines.map((l, i) => (
            <li key={`${l.seriesId}-${l.kind}-${i}`} className="grid grid-cols-[64px_1fr_auto] items-baseline gap-2">
              <span className={`rounded border px-1.5 text-[11px] ${l.kind === 'late' ? 'border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn' : 'border-border text-text-dim'}`}>{t(`changes.${l.kind}`)}</span>
              <span className={l.kind === 'missing' ? 'text-text-dim' : ''}>
                {l.name}{' '}
                <span className="font-mono tabular-nums">{l.previous ? t('changes.revisedFrom', { from: l.previous, to: l.value }) : l.value}</span>
              </span>
              <span className="font-mono tabular-nums text-text-dim">{l.period}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
