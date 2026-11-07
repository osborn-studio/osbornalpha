'use client';
// Right-side evidence drawer (spec §3.2; canvas "推导 / 逐事件抽屉"): derived-node inputs, per-event rows of a matrix
// cell, the two endpoint observations of a history cell. ObsRefTable lists the frozen manifest inputs exactly.
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { ObsRef } from '@/lib/macro/strategy/contract';
import { formatInstant } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function EvidencePairDrawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useStrategyT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="h-full w-full max-w-[560px] space-y-3 overflow-y-auto border-l border-border bg-bg-elevated p-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} autoFocus>{t('view.close')}</Button>
        </div>
        {children}
      </div>
    </div>
  );
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
