'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Panel, Tag } from '@/components/ui';
import type { DailyBrief } from '@/lib/brief/composer';

export function BriefGlance() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/brief/preview?skipLLM=true')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DailyBrief) => {
        if (cancelled) return;
        setBrief(data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || '简报加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <Panel title="AI 简报">
      {loading && (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-2/3 rounded bg-bg-card" />
          <div className="h-3 w-full rounded bg-bg-card" />
          <div className="h-3 w-5/6 rounded bg-bg-card" />
        </div>
      )}
      {!loading && error && (
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
            查看完整简报 →
          </Link>
        </div>
      )}
    </Panel>
  );
}
