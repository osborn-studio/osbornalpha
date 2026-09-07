'use client';

import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  WATCHLIST_METRIC_REGISTRY,
  watchlistMetricDefinition,
  type WatchlistMetricKey,
} from '@/lib/watchlist/metric-registry';
import type { WatchlistColumnKey } from '@/lib/watchlist/ui-preferences';

function isMetricKey(value: WatchlistColumnKey): value is WatchlistMetricKey {
  return value in WATCHLIST_METRIC_REGISTRY;
}

export function WatchlistMetricHeader({
  column,
  active,
  ascending,
  disabled,
  disabledReason,
  onSort,
}: {
  column: WatchlistColumnKey;
  active: boolean;
  ascending: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSort: () => void;
}) {
  const t = useTranslations('market.table');
  const label = t(`headers.${column}`);
  const definition = isMetricKey(column) ? watchlistMetricDefinition(column) : null;
  const methodology = definition ? t('methodology.tooltip', {
    source: t(`methodology.sources.${definition.source}`),
    window: t(`methodology.windows.${definition.window}`),
    observations: definition.minimumObservations ?? t('methodology.notApplicable'),
    scope: t(`methodology.scopes.${definition.comparisonScope}`),
  }) : null;

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onSort}
        disabled={disabled}
        className="inline-flex items-center gap-0.5 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('sortAriaLabel', { label })}
        title={disabled ? disabledReason : undefined}
      >
        <span>{label}</span>
        {active && (ascending
          ? <ChevronUp className="h-3 w-3" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
      {methodology && (
        <span className="group/methodology relative inline-flex">
          <button
            type="button"
            aria-label={t('methodology.open', { label })}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text focus-visible:bg-bg-hover"
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-64 whitespace-normal rounded-md border border-border bg-bg-elevated p-2 text-left text-[11px] font-normal leading-relaxed text-text-dim shadow-xl group-hover/methodology:block group-focus-within/methodology:block"
          >
            {methodology}
          </span>
        </span>
      )}
    </div>
  );
}
