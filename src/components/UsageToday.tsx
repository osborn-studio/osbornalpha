'use client';

import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/client';

type Feature = 'copilot' | 'perspectives' | 'brief_preview';

const FEATURE_LABELS: Record<Feature, string> = {
  copilot: 'Copilot 分析',
  perspectives: '九人观点',
  brief_preview: '简报预览',
};

interface UsageResp {
  plan: string;
  usage: Record<Feature, { used: number; limit: number }>;
  byoCalls: number;
}

// Settings page "今日用量" section — GET /api/usage/today and render three
// used/limit rows + a BYO call count (informational, doesn't count against
// quota). Mirrors AccountSettings' guest/unconfigured fallback pattern.
export function UsageToday() {
  const [data, setData] = useState<UsageResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

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
      .catch((e: any) => { if (!cancelled) setError(e?.message || '加载失败'); });
    return () => { cancelled = true; };
  }, [configured]);

  if (!configured) return null;
  if (error) return <div className="text-xs text-text-dim">今日用量：{error === 'Not authenticated' ? '登录后可查看' : error}</div>;
  if (!data) return <div className="text-xs text-text-dim">加载中…</div>;

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
      <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-text-dim">
        <span>BYO Key 调用（不计配额）</span>
        <span className="tabular-nums">{data.byoCalls}</span>
      </div>
    </div>
  );
}
