'use client';

import { useMemo } from 'react';
import { Bell, BellOff, Check, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import type { WatchlistAlert } from '@/lib/supabase/database.types';
import { useWatchlistAlerts } from '@/lib/hooks/useWatchlistAlerts';
import { WatchlistAlertPreferences } from './WatchlistAlertPreferences';
import { watchlistAlertEventLabel } from '@/lib/watchlist/alert-events';
import { WATCHLIST_ALERT_CATALOG } from '@/lib/watchlist/alert-catalog';
import { WatchlistAlertRuleEditor } from './WatchlistAlertRuleEditor';
import {
  watchlistAlertCadence,
  watchlistAlertUsesDiscreteCrossing,
} from '@/lib/watchlist/alert-cadence';

function metricLabel(
  metric: unknown,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const definition = WATCHLIST_ALERT_CATALOG.metricDefinitions.find((item) => item.key === metric);
  return definition ? t(`metrics.${definition.key}`) : null;
}

function alertLabel(alert: WatchlistAlert, t: ReturnType<typeof useTranslations>) {
  const type = t(`types.${alert.alert_type}`);
  if (alert.threshold_numeric == null || !alert.operator) return type;
  const operator = t(`operators.${alert.operator}`);
  const metric = alert.alert_type === 'valuation'
    ? alert.config.metric === 'pb' ? 'PB' : 'PE'
    : alert.alert_type === 'metric'
      ? metricLabel(alert.config.metric, t) ?? type
      : type;
  return `${metric} ${operator} ${alert.threshold_numeric}`;
}

export function WatchlistAlertPanel({ itemId }: { itemId: string }) {
  const t = useTranslations('market.table.drawer.alerts');
  const locale = useLocale() === 'zh' ? 'zh' : 'en';
  const model = useWatchlistAlerts(itemId);
  const unread = useMemo(() => model.events.filter((event) => !event.read_at).length, [model.events]);

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label={t('title')}>
      <WatchlistAlertPreferences />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-text">{t('title')}</h3>
        </div>
        {unread > 0 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">{t('unread', { count: unread })}</span>}
      </div>

      <WatchlistAlertRuleEditor
        idPrefix={`alert-${itemId}`}
        saving={model.saving}
        onSubmit={model.create}
      />

      {model.error && <p className="mt-2 text-[11px] text-status-bad" role="alert">{t('error')}</p>}
      {model.loading ? <div className="mt-3 h-12 animate-pulse rounded bg-bg-elevated" /> : (
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {model.alerts.map((alert) => (
            <div key={alert.id} className="flex min-h-10 items-center gap-2 py-2">
              {alert.enabled ? <Bell className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" /> : <BellOff className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-xs ${alert.enabled ? 'text-text' : 'text-text-muted'}`}>{alertLabel(alert, t)}</span>
                <span className="mt-0.5 block truncate text-[10px] text-text-muted">
                  {t(`cadence.${watchlistAlertCadence(alert)}`)}
                  {watchlistAlertUsesDiscreteCrossing(alert) ? ` · ${t('discreteLabel')}` : ''}
                  {alert.last_evaluated_at ? ` · ${t('lastChecked', { value: new Date(alert.last_evaluated_at).toLocaleString() })}` : ''}
                </span>
                {alert.origin && <span className="mt-0.5 block truncate text-[10px] text-warn" title={alert.origin.invalidation_text}>{t('claimDraft')}: {alert.origin.invalidation_text}</span>}
              </span>
              <button type="button" disabled={model.saving} onClick={() => void model.update(alert.id, { enabled: !alert.enabled })} className="rounded px-2 py-1 text-[11px] text-text-dim hover:bg-bg-elevated">{alert.enabled ? t('pause') : t('resume')}</button>
              <button type="button" disabled={model.saving} onClick={() => void model.remove(alert.id)} className="icon-button !h-7 !w-7 !basis-7 border-transparent bg-transparent text-text-muted hover:text-status-bad" aria-label={t('delete')} title={t('delete')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
            </div>
          ))}
          {model.alerts.length === 0 && <div className="py-3 text-xs text-text-muted">{t('empty')}</div>}
        </div>
      )}

      {model.events.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-[11px] font-semibold uppercase text-text-muted">{t('history')}</h4>
          <div className="divide-y divide-border/60">
            {model.events.slice(0, 5).map((event) => (
              <div key={event.id} className="flex w-full items-center gap-2 py-2 text-left">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${event.read_at ? 'bg-border-active' : 'bg-accent'}`} />
                <button type="button" onClick={() => !event.read_at && void model.markRead(event.id)} className="min-w-0 flex-1 truncate text-left text-[11px] text-text">{watchlistAlertEventLabel(event, locale)}</button>
                {(event.delivery_status === 'failed' || event.delivery_status === 'dead_letter') && <span className="shrink-0 rounded border border-status-bad/25 px-1 py-0.5 text-[11px] text-status-bad">{t(`delivery.${event.delivery_status}`)}</span>}
                <time className="shrink-0 text-[11px] text-text-muted">{new Date(event.triggered_at).toLocaleString()}</time>
                {(event.delivery_status === 'failed' || event.delivery_status === 'dead_letter') ? <button type="button" disabled={model.saving} onClick={() => void model.retryDelivery(event.id)} className="text-[11px] text-accent">{t('delivery.retry')}</button> : !event.read_at && <Check className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
