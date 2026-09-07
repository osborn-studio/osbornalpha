'use client';

import { History, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useWatchlistDecisionHistory } from '@/lib/hooks/useWatchlistDecisionHistory';
import { changedDecisionFields } from '@/lib/watchlist/decision-history';
import type { WatchlistOverviewItemRow } from '@/lib/watchlist/overview-contract';
import { WatchlistDecisionContext } from './WatchlistDecisionContext';

function displayValue(value: unknown): string {
  if (value == null || value === '') return '--';
  if (Array.isArray(value)) return value.join(', ') || '--';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function WatchlistDecisionHistory({ item, onRestored }: {
  item: WatchlistOverviewItemRow;
  onRestored: (item: WatchlistOverviewItemRow) => void;
}) {
  const t = useTranslations('market.table.drawer.decision');
  const model = useWatchlistDecisionHistory(item.id);

  return (
    <div className="mt-4 border-t border-border/70 pt-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-text-dim">
        <History className="h-3.5 w-3.5" aria-hidden="true" />{t('history')}
      </div>
      {model.loading ? <div className="h-10 animate-pulse rounded bg-bg-elevated" /> : model.error ? (
        <button type="button" onClick={() => void model.refetch()} className="text-[11px] text-warn">{t('historyRetry')}</button>
      ) : model.history.length === 0 ? (
        <div className="text-[11px] text-text-muted">{t('historyEmpty')}</div>
      ) : (
        <ol className="space-y-2">
          {model.history.slice(0, 8).map((entry) => {
            const fields = changedDecisionFields(entry);
            return (
              <li key={entry.id} className="border-l border-border pl-3 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1 text-text-dim">{t('historyVersion', { version: entry.version })}</span>
                  <time className="shrink-0 font-mono text-[11px] text-text-muted">{new Date(entry.changed_at).toLocaleString()}</time>
                  {entry.version < item.decision_version && (
                    <button type="button" disabled={model.restoring} onClick={async () => {
                      const restored = await model.restore(entry, item.decision_version);
                      if (restored) onRestored(restored as WatchlistOverviewItemRow);
                    }} className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-[11px] text-text-dim disabled:opacity-40">
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />{t('historyRestore')}
                    </button>
                  )}
                </div>
                {fields.length > 0 ? (
                  <dl className="mt-2 space-y-1.5">
                    {fields.map((field) => (
                      <div key={field} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
                        <dt className="text-text-muted">{t(`fields.${field}`)}</dt>
                        <dd className="min-w-0 break-words text-text-dim"><span className="line-through opacity-60">{displayValue(entry.before_value[field])}</span><span className="mx-1.5 text-text-muted">→</span><span>{displayValue(entry.after_value[field])}</span></dd>
                      </div>
                    ))}
                  </dl>
                ) : <div className="mt-1 text-text-muted">{t('historyNoChanges')}</div>}
                <WatchlistDecisionContext value={entry.context_snapshot} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
