import Link from 'next/link';
import { MOCK_DATA, MOCK_STOCKS } from '@/lib/data/mock';
import { formatPrice, formatPct, changeClass, marketLabel, stars } from '@/lib/utils';
import { Disclaimer } from '@/components/Disclaimer';

export default function HomePage() {
  const data = MOCK_DATA;

  return (
    <>
      {/* Hero */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <div className="mb-1.5 text-xs text-text-dim">今日 AI 委员会信心</div>
          <div className="mb-2 text-3xl font-bold">
            {data.ai_confidence} <span className="text-sm text-text-dim">/ 10</span>
          </div>
          <div className="mb-2 h-2 overflow-hidden rounded bg-bg-card">
            <div
              className="h-full"
              style={{
                width: `${data.ai_confidence * 10}%`,
                background: 'linear-gradient(90deg, var(--bearish), var(--neutral), var(--bullish))',
              }}
            />
          </div>
          <div className="text-xs text-text-dim">{data.ai_confidence_label} · 9 位虚拟委员评议</div>
        </div>
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <div className="mb-1.5 text-xs text-text-dim">今日简报状态</div>
          <div className="mb-2 text-lg font-semibold">
            ✅ 已生成 ·{' '}
            {new Date(data.generated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-xs text-text-dim">已推送 Telegram · 邮箱 · Web</div>
        </div>
      </div>

      {/* Macro strip */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">
        <MacroCell name="上证" value={data.macro.sse_index.value.toLocaleString()} chg={formatPct(data.macro.sse_index.change_pct)} chgClass={changeClass(data.macro.sse_index.change_pct)} />
        <MacroCell name="恒生" value={data.macro.hsi_index.value.toLocaleString()} chg={formatPct(data.macro.hsi_index.change_pct)} chgClass={changeClass(data.macro.hsi_index.change_pct)} />
        <MacroCell name="纳指" value={data.macro.nasdaq.value.toLocaleString()} chg={formatPct(data.macro.nasdaq.change_pct)} chgClass={changeClass(data.macro.nasdaq.change_pct)} />
        <MacroCell name="美 10Y" value={data.macro.us_10y.value + '%'} chg={`${data.macro.us_10y.change_bp > 0 ? '+' : ''}${data.macro.us_10y.change_bp}bp`} chgClass={changeClass(data.macro.us_10y.change_bp)} />
        <MacroCell name="DXY" value={String(data.macro.dxy.value)} chg={formatPct(data.macro.dxy.change_pct)} chgClass={changeClass(data.macro.dxy.change_pct)} />
        <MacroCell name="北向" value={`+¥${data.macro.north_bound}亿`} />
        <MacroCell name="南向" value={`+HK$${data.macro.south_bound}亿`} />
      </div>

      {/* Top 5 priority */}
      <div className="card-base">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-text-dim">
          <span>🎯 今日注意力优先级 Top 5</span>
          <Link href="/watchlist" className="text-xs">完整池 →</Link>
        </div>
        {data.top5.map((s, i) => (
          <Link
            key={s.ticker}
            href={`/stock/${encodeURIComponent(s.ticker)}`}
            className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 rounded-lg p-3 hover:bg-bg-card"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-dim text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="text-xs tracking-widest text-warn">{stars(s.stars)}</span>
            <div className="flex flex-col">
              <div className="font-semibold">{s.name} · {s.score.toFixed(1)}</div>
              <div className="text-[11px] text-text-dim">{s.ticker} · {marketLabel(s.market)}</div>
            </div>
            <span className="rounded bg-bg-card px-2 py-1 text-[11px] text-text-dim">{s.trigger}</span>
            <span className="text-xs text-text-dim">→</span>
          </Link>
        ))}
      </div>

      {/* Watchlist snapshot */}
      <div className="card-base">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-text-dim">
          <span>📊 我的股票池 ({data.watchlist_groups.reduce((s, g) => s + g.tickers.length, 0)})</span>
          <Link href="/watchlist" className="text-xs">管理 →</Link>
        </div>
        {data.watchlist_groups.flatMap((g) => g.tickers).slice(0, 8).map((t) => {
          const s = MOCK_STOCKS[t];
          if (!s) return null;
          return (
            <Link
              key={t}
              href={`/stock/${encodeURIComponent(t)}`}
              className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-border px-2 py-2.5 last:border-b-0 hover:bg-bg-card"
            >
              <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">{marketLabel(s.market)}</span>
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-[11px] text-text-dim">{s.ticker}</div>
              </div>
              <div className="text-right font-semibold tabular-nums">{s.currency}{formatPrice(s.price)}</div>
              <div className={`min-w-[60px] text-right text-sm tabular-nums ${changeClass(s.change_pct)}`}>
                {formatPct(s.change_pct)}
              </div>
              <div className="min-w-[50px] text-right text-[11px] text-warn">
                {'★'.repeat(Math.round(s.sentinel_score / 2))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* News */}
      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">📰 今日要闻</div>
        {data.top5.slice(0, 3).map((t) => {
          const s = MOCK_STOCKS[t.ticker];
          if (!s) return null;
          const n = s.news[0];
          if (!n) return null;
          return (
            <div key={t.ticker} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-border px-3 py-2.5 text-sm last:border-b-0">
              <span className="text-[11px] text-text-muted">{n.time}</span>
              <Link href={`/stock/${encodeURIComponent(t.ticker)}`} className="text-text hover:no-underline">
                {n.title} <span className="text-[11px] text-text-dim">· {s.name}</span>
              </Link>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${n.sentiment > 0.3 ? 'bg-up/15 text-up' : n.sentiment < -0.3 ? 'bg-down/15 text-down' : 'bg-bg-card text-text-dim'}`}>
                {n.sentiment > 0 ? '+' : ''}{n.sentiment.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <Disclaimer />
    </>
  );
}

function MacroCell({ name, value, chg, chgClass }: { name: string; value: string; chg?: string; chgClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-card px-3 py-2.5">
      <div className="text-[11px] text-text-dim">{name}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
      {chg && <div className={`mt-0.5 text-[11px] tabular-nums ${chgClass || ''}`}>{chg}</div>}
    </div>
  );
}
