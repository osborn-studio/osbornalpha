'use client';
// Right-side evidence drawer (spec §3.2; canvas "推导 / 逐事件抽屉"): derived-node inputs, per-event rows of a matrix
// cell, the two endpoint observations of a history cell. ObsRefTable lists the frozen manifest inputs exactly.
import type { ReactNode } from 'react';
import { SourceDrawer } from '@/components/research-ui/source-drawer/SourceDrawer';
import { evidencePairInput } from './evidence-pair-adapter';
import type { ObsRef } from '@/lib/macro/strategy/contract';
import { formatInstant } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function EvidencePairDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <SourceDrawer input={open ? evidencePairInput(title) : null} onClose={onClose} slots={{transform: children}} />;
}

const COLUMNS = ['series', 'period', 'value', 'version', 'available', 'source'] as const;

export function ObsRefTable({ refs }: { refs: ObsRef[] }) {
  const { t } = useStrategyT();
  if (refs.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-text-dim">
              {COLUMNS.map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`evidence.columns.${k}`)}</th>)}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {refs.map((r) => (
              <tr key={r.observation_id} className="border-t border-border">
                <td className="px-1.5 py-1">{r.series_id}</td>
                <td className="px-1.5 py-1">{r.period_end}</td>
                <td className="px-1.5 py-1">{r.value_text}</td>
                <td className="px-1.5 py-1">v{r.version}</td>
                <td className="px-1.5 py-1">{formatInstant(r.available_at)}</td>
                <td className="px-1.5 py-1">
                  {r.source.kind === 'snapshot'
                    ? t('evidence.fromSnapshot', { id: r.source.snapshot_id })
                    : t('evidence.fromHistory', { asOf: formatInstant(r.source.as_of) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="break-all font-mono text-[10px] text-text-dim">
        {refs.map((r) => t('evidence.observation', { id: r.observation_id })).join(' · ')}
      </p>
    </div>
  );
}
