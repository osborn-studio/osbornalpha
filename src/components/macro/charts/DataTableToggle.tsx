'use client';
// DataTableToggle — every macro chart has a table view (spec §3.3, §3.4); below 640px charts flagged
// `narrowTable` open as tables (spec §3.6).
import { useEffect, useState, type ReactNode } from 'react';
import type { MacroT } from '../use-macro-t';

export function DataTableToggle({ chart, table, t, narrowTable = false }: { chart: ReactNode; table: ReactNode; t: MacroT; narrowTable?: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  useEffect(() => {
    if (narrowTable && typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) setView('table');
  }, [narrowTable]);
  return (
    <div>
      <div role="group" aria-label={t('detail.viewLabel')} className="mb-2 flex justify-end gap-1 text-[11px]">
        {(['chart', 'table'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`rounded border border-border px-2 py-0.5 ${view === v ? 'bg-[var(--accent-wash)] text-accent' : 'text-text-dim'}`}
          >
            {t(v === 'chart' ? 'detail.chartView' : 'detail.tableView')}
          </button>
        ))}
      </div>
      {view === 'chart' ? chart : table}
    </div>
  );
}
