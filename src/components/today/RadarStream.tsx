'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { RadarPayload, RadarLevel } from '@/lib/brief/radar';
import { changeClass, formatPct, marketLabel } from '@/lib/utils';

interface RadarApiResponse {
  radars: Record<string, RadarPayload | { error: string }>;
  order: string[];
  generated_at: string;
}

// radar_level → color mapping is about attention priority (red=关注 first),
// unrelated to 红涨绿跌 price convention.
function emojiForLevel(l: RadarLevel): string {
  return l === 'red' ? '🔴' : l === 'yellow' ? '🟡' : '⚪';
}

export function RadarStream({ tickers }: { tickers: string[] }) {
  const [data, setData] = useState<RadarApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteExpanded, setWhiteExpanded] = useState(false);

  useEffect(() => {
    if (tickers.length === 0) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const capped = tickers.slice(0, 25);
    fetch(`/api/radar/batch?tickers=${encodeURIComponent(capped.join(','))}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: RadarApiResponse) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message || '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.slice(0, 25).sort().join(',')]);

  if (tickers.length === 0) {
    return (
      <div className="card-base py-8 text-center text-sm text-text-dim">
        股票池是空的。先去 <Link href="/watchlist" className="text-accent">📋 股票池</Link> 添加几只股票。
      </div>
    );
  }

  if (loading && !data) {
    return <div className="card-base py-8 text-center text-sm text-text-dim">加载雷达中…</div>;
  }

  if (error) {
    return <div className="card-base py-4 text-center text-xs text-down">⚠ {error}</div>;
  }

  if (!data) return null;

  const order = data.order || [];
  const reds: string[] = [];
  const yellows: string[] = [];
  const whites: string[] = [];
  for (const t of order) {
    const r = data.radars[t];
    if (!r || 'error' in r) continue;
    if (r.radar_level === 'red') reds.push(t);
    else if (r.radar_level === 'yellow') yellows.push(t);
    else whites.push(t);
  }

  return (
    <div className="space-y-1.5">
      {reds.map((t) => (
        <RadarRow key={t} payload={data.radars[t] as RadarPayload} />
      ))}
      {yellows.map((t) => (
        <RadarRow key={t} payload={data.radars[t] as RadarPayload} />
      ))}
      {whites.length > 0 && (
        <div>
          {!whiteExpanded ? (
            <button
              onClick={() => setWhiteExpanded(true)}
              className="card-base w-full py-2 text-left text-xs text-text-dim hover:text-text"
            >
              ⚪ 平静 {whites.length} 只（展开）
            </button>
          ) : (
            <div className="space-y-1.5">
              {whites.map((t) => (
                <RadarRow key={t} payload={data.radars[t] as RadarPayload} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RadarRow({ payload: r }: { payload: RadarPayload }) {
  const change = r.sections.price.change_pct;
  const triggerDesc = r.triggers.map((t) => t.desc).join(' · ');
  return (
    <Link
      href={`/stock/${encodeURIComponent(r.ticker)}`}
      className="card-base block !p-2.5 hover:border-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span>{emojiForLevel(r.radar_level)}</span>
            <span className="rounded bg-bg-card px-1 py-0.5 text-[10px] text-text-dim">{marketLabel(r.market)}</span>
            <span className="truncate text-sm font-semibold">{r.name}</span>
            <span className="truncate text-xs text-text-dim">{r.headline}</span>
          </div>
          {triggerDesc && (
            <div className="mt-0.5 truncate pl-5 text-[10px] text-text-muted">{triggerDesc}</div>
          )}
        </div>
        {change !== null && (
          <span className={`shrink-0 font-mono text-xs ${changeClass(change)}`}>{formatPct(change)}</span>
        )}
      </div>
    </Link>
  );
}
