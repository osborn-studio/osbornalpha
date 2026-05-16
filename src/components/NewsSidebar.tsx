'use client';

import { MOCK_DATA, MOCK_STOCKS } from '@/lib/data/mock';
import { formatPct, changeClass, stars } from '@/lib/utils';
import Link from 'next/link';

export function NewsSidebar() {
  const data = MOCK_DATA;
  const newsItems = data.top5.slice(0, 5).flatMap((t) => {
    const s = MOCK_STOCKS[t.ticker];
    if (!s) return [];
    return s.news.slice(0, 1).map((n) => ({ ...n, ticker: s.ticker, name: s.name }));
  });

  return (
    <div className="sticky top-[57px] space-y-3">
      {/* AI Confidence */}
      <div className="card-base !p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">AI Committee</div>
        <div className="mb-1.5 text-2xl font-bold">
          {data.ai_confidence} <span className="text-xs text-text-dim">/ 10</span>
        </div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded bg-bg-card">
          <div
            className="h-full"
            style={{
              width: `${data.ai_confidence * 10}%`,
              background: 'linear-gradient(90deg, var(--bearish), var(--neutral), var(--bullish))',
            }}
          />
        </div>
        <div className="text-[11px] text-text-dim">{data.ai_confidence_label}</div>
      </div>

      {/* Top 5 priority */}
      <div className="card-base !p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">Top Priorities</div>
        {data.top5.map((s, i) => (
          <Link
            key={s.ticker}
            href={`/?s=${encodeURIComponent(s.ticker)}` as any}
            className="grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded py-1 text-[11px] hover:bg-bg-card"
          >
            <span className="text-center font-bold text-accent-dim">{i + 1}</span>
            <div className="truncate">
              <div className="truncate font-semibold leading-tight">{s.name}</div>
              <div className="truncate text-[10px] text-text-muted">{s.trigger}</div>
            </div>
            <span className="font-mono text-warn">{stars(s.stars)}</span>
          </Link>
        ))}
      </div>

      {/* Macro strip */}
      <div className="card-base !p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">Macro</div>
        <div className="space-y-1 text-[11px]">
          <MacroLine label="上证" v={data.macro.sse_index.value} pct={data.macro.sse_index.change_pct} />
          <MacroLine label="恒生" v={data.macro.hsi_index.value} pct={data.macro.hsi_index.change_pct} />
          <MacroLine label="纳指" v={data.macro.nasdaq.value} pct={data.macro.nasdaq.change_pct} />
          <MacroLine label="美 10Y" v={data.macro.us_10y.value} suffix="%" raw={`${data.macro.us_10y.change_bp > 0 ? '+' : ''}${data.macro.us_10y.change_bp}bp`} chgClass={changeClass(data.macro.us_10y.change_bp)} />
          <MacroLine label="DXY" v={data.macro.dxy.value} pct={data.macro.dxy.change_pct} />
        </div>
      </div>

      {/* News */}
      <div className="card-base !p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-text-muted">News Stream</div>
        {newsItems.map((n, i) => (
          <Link
            key={i}
            href={`/?s=${encodeURIComponent(n.ticker)}` as any}
            className="block border-b border-border py-1.5 text-[11px] last:border-b-0 hover:bg-bg-card"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">{n.time}</span>
              <span
                className={`rounded px-1 py-0.5 text-[9px] ${
                  n.sentiment > 0.3 ? 'bg-up/15 text-up' : n.sentiment < -0.3 ? 'bg-down/15 text-down' : 'bg-bg-card text-text-dim'
                }`}
              >
                {n.sentiment > 0 ? '+' : ''}{n.sentiment.toFixed(1)}
              </span>
            </div>
            <div className="mt-0.5 leading-snug">{n.title}</div>
            <div className="text-[10px] text-text-muted">{n.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MacroLine({
  label, v, pct, suffix = '', raw, chgClass,
}: { label: string; v: number; pct?: number; suffix?: string; raw?: string; chgClass?: string }) {
  return (
    <div className="grid grid-cols-[60px_1fr_auto] items-center gap-2">
      <span className="text-text-dim">{label}</span>
      <span className="text-right font-mono tabular-nums">{v.toLocaleString()}{suffix}</span>
      <span className={`font-mono tabular-nums ${pct !== undefined ? changeClass(pct) : chgClass || ''}`}>
        {raw !== undefined ? raw : (pct !== undefined ? formatPct(pct) : '')}
      </span>
    </div>
  );
}
