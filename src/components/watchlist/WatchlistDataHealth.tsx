'use client';

import { AlertTriangle, CircleAlert, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WatchlistDataCapability } from '@/lib/watchlist/data-capability';
import { watchlistDataNotices } from '@/lib/watchlist/data-notice';

export function WatchlistDataHealth({
  warnings,
  capabilities,
  generatedAt,
  onRetry,
}: {
  warnings: string[];
  capabilities: WatchlistDataCapability[];
  generatedAt: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations('market.table.health');
  const notices = watchlistDataNotices(warnings, capabilities);
  if (notices.length === 0) return null;
  return (
    <section className="border-b border-border bg-bg-elevated/45 px-4 py-2.5" aria-label={t('label')}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xs font-semibold text-text">{t('title', { count: notices.length })}</h2>
            {generatedAt && <span className="text-[10px] text-text-muted">{t('checkedAt', { value: new Date(generatedAt).toLocaleString() })}</span>}
          </div>
          <div className="mt-1 space-y-1">
            {notices.map((notice) => (
              <div key={notice.id} className="flex min-w-0 items-start gap-1.5 text-[11px] leading-4 text-text-dim">
                {notice.severity === 'critical' && <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-status-bad" aria-hidden="true" />}
                <span>
                  {notice.kind === 'source'
                    ? t(`warnings.${notice.messageKey}`)
                    : t(`capabilities.${notice.messageKey}`, {
                        markets: notice.markets.join(', '),
                        features: notice.features.map((feature) => t(`features.${feature}`)).join(', '),
                      })}
                  {notice.lastSuccessAt && ` ${t('lastSuccess', { value: new Date(notice.lastSuccessAt).toLocaleString() })}`}
                </span>
              </div>
            ))}
          </div>
        </div>
        <button type="button" onClick={onRetry} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border px-2.5 text-[11px] font-medium text-text-dim hover:bg-bg-hover hover:text-text" title={t('retry')}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('retry')}</span>
        </button>
      </div>
    </section>
  );
}
