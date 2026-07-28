'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Panel, Tag } from '@/components/ui';
import { QuotaNotice } from '@/components/QuotaNotice';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import type { DailyBrief } from '@/lib/brief/composer';

export function BriefGlance() {
  const t = useTranslations('today');
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaNoticeProps | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuota(null);
    fetch('/api/brief/preview?skipLLM=true')
      .then(async (r) => {
        if (r.status === 429) {
          const body = await r.json().catch(() => ({}));
          throw Object.assign(new Error(body?.error || t('brief.quotaExceeded')), { quota: body?.quota });
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DailyBrief) => {
        if (cancelled) return;
        setBrief(data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        if (e?.quota) setQuota(e.quota);
        setError(e?.message || t('brief.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <Panel title={t('brief.title')}>
      {loading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-2/3 rounded bg-bg-card" />
          <div className="h-3 w-full rounded bg-bg-card" />
          <div className="h-3 w-5/6 rounded bg-bg-card" />
        </div>
      )}
      {!loading && error && quota && <QuotaNotice {...quota} />}
      {!loading && error && !quota && (
        <div className="py-2 text-xs text-down">⚠ {error}</div>
      )}
      {!loading && !error && brief && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag tone={brief.overall_confidence >= 6 ? 'up' : brief.overall_confidence <= 4 ? 'down' : 'neutral'}>
              {brief.overall_label} {brief.overall_confidence.toFixed(1)}
            </Tag>
          </div>
          {brief.top_call && (
            <div className="text-xs font-medium leading-snug">{brief.top_call.headline}</div>
          )}
          {(brief.trade_ideas ?? []).slice(0, 2).map((idea) => (
            <div key={idea.ticker} className="truncate text-[11px] text-text-dim">
              <span className="text-text">{idea.ticker}</span> · {idea.thesis}
            </div>
          ))}
          <Link href="/briefs" className="block text-right text-xs text-accent hover:underline">
            {t('brief.viewFull')}
          </Link>
        </div>
      )}
    </Panel>
  );
}
