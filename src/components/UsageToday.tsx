'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { costUsageRows, type PlatformCostUsage } from './usage-today-format';

type Feature = 'copilot' | 'perspectives' | 'brief_preview';

interface UsageResp {
  plan: string;
  usage: Record<Feature, { used: number; limit: number }>;
  byoCalls: number;
  cost: PlatformCostUsage;
}

// Settings page "今日用量" section — GET /api/usage/today and render three
// used/limit rows + a BYO call count (informational, doesn't count against
// quota). Mirrors AccountSettings' guest/unconfigured fallback pattern.
export function UsageToday() {
  const t = useTranslations('components.usageToday');
  const tSettings = useTranslations('settings');
  const [data, setData] = useState<UsageResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const FEATURE_LABELS: Record<Feature, string> = {
    copilot: t('featureCopilot'),
    perspectives: t('featurePerspectives'),
    brief_preview: t('featureBriefPreview'),
  };

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    fetch('/api/usage/today')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d: UsageResp) => { if (!cancelled) setData(d); })
      .catch((e: any) => { if (!cancelled) setError(e?.message || t('loadFailed')); });
    return () => { cancelled = true; };
  }, [configured, t]);

  if (!configured) return null;
  if (error) return <div className="text-xs text-text-dim">{tSettings('usage.errorLine', { message: error === 'Not authenticated' ? t('signInToView') : error })}</div>;
  if (!data) return <div className="text-xs text-text-dim">{t('loading')}</div>;

  const costRows = costUsageRows(data.cost);
  const capUsed = (data.cost.capUsedMicrormb / 1_000_000).toFixed(2);
  const limit = data.cost.limitMicrormb === -1 ? '0.00' : (data.cost.limitMicrormb / 1_000_000).toFixed(2);

  return (
    <div className="space-y-2 text-sm">
      {(Object.keys(FEATURE_LABELS) as Feature[]).map((f) => {
        const row = data.usage[f];
        const unlimited = row.limit === -1;
        return (
          <div key={f} className="flex items-center justify-between">
            <span className="text-text-dim">{FEATURE_LABELS[f]}</span>
            <span className="tabular-nums">{unlimited ? `${row.used}/∞` : `${row.used}/${row.limit}`}</span>
          </div>
        );
      })}
      {costRows.map((row, index) => (
        <div key={row.labelKey} className={`flex items-center justify-between ${index === 0 ? 'border-t border-border pt-2' : ''}`}>
          <span className="text-text-dim">{t(row.labelKey)}</span>
          <span className="tabular-nums" aria-label={row.labelKey === 'platformCapCost'
            ? t('platformCapCostAria', { used: capUsed, limit })
            : row.labelKey === 'platformTotalCost'
              ? t('platformTotalCostAria', { used: (data.cost.usedMicrormb / 1_000_000).toFixed(2) })
              : row.labelKey === 'platformNonExemptCost'
                ? t('platformNonExemptCostAria', { used: capUsed })
                : data.cost.limitMicrormb === -1
                  ? t('platformCostUnlimitedAria', { used: capUsed })
                  : t('platformCostAria', { used: capUsed, limit })}>{row.value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-text-dim">
        <span>{t('byoCalls')}</span>
        <span className="tabular-nums">{data.byoCalls}</span>
      </div>
    </div>
  );
}
