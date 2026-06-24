import Link from 'next/link';
import { Disclaimer } from '@/components/Disclaimer';

// This server component lives under the auth-gated (app) layout, which calls
// cookies()/getUser(). It must render dynamically per request — without this,
// static optimization can prerender it and the layout's cookies() then throws
// DynamicServerError at request time (the post-login /briefs failure).
export const dynamic = 'force-dynamic';

export const metadata = { title: '简报' };

// Server component — fetches from Supabase when available, falls back to mock
export default async function BriefsPage() {
  // Mock list of briefs (most recent 30 days)
  const briefs = generateMockBriefList(30);

  return (
    <>
      <h1 className="mb-3 text-xl font-bold">📰 简报历史</h1>

      <div className="card-base">
        <div className="mb-3 text-sm font-semibold text-text-dim">
          📅 最近 30 天 ({briefs.length} 份)
        </div>
        {briefs.map((b) => (
          <Link
            key={b.date}
            href={`/briefs/${b.date}` as any}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-border px-2 py-3 last:border-b-0 hover:bg-bg-card"
          >
            <div className="font-mono text-xs text-text-dim">{b.date}</div>
            <div>
              <div className="text-sm font-semibold">{b.title}</div>
              <div className="text-[11px] text-text-muted">{b.summary}</div>
            </div>
            <div className="text-xs text-text-dim">
              信心 {b.confidence.toFixed(1)}
            </div>
            <span className="text-text-dim">→</span>
          </Link>
        ))}
      </div>

      <div className="card-base">
        <div className="mb-2 text-sm font-semibold text-text-dim">📈 信号命中率（30 天）</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-bg-card p-4">
            <div className="text-2xl font-bold text-up">70%</div>
            <div className="text-[11px] text-text-dim">命中率</div>
          </div>
          <div className="rounded-lg bg-bg-card p-4">
            <div className="text-2xl font-bold">20</div>
            <div className="text-[11px] text-text-dim">总信号数</div>
          </div>
          <div className="rounded-lg bg-bg-card p-4">
            <div className="text-2xl font-bold text-text-dim">14/6</div>
            <div className="text-[11px] text-text-dim">中 / 错</div>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-text-muted">
          (v1.0 将真实实现：基于历史 brief + 后续 N 天股价表现自动 backtest)
        </div>
      </div>

      <Disclaimer />
    </>
  );
}

function generateMockBriefList(days: number) {
  const titles = [
    '腾讯财报前夜 · NVDA 上调评级',
    '比亚迪超跌反弹 · 美股 CPI 周三公布',
    'AAPL T-7 财报高关注 · 北向回流',
    '茅台分红落地 · 港股政策利好',
    '半导体板块情绪转暖 · 美股 10Y 回落',
  ];
  const out: Array<{ date: string; title: string; summary: string; confidence: number }> = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const title = titles[i % titles.length];
    out.push({
      date,
      title,
      summary: `${5 + (i % 3)} 支标的进入注意力优先级 · ${i % 2 === 0 ? '中性偏多' : '中性偏空'}`,
      confidence: 4.5 + Math.random() * 3.5,
    });
  }
  return out;
}
