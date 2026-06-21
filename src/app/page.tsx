import Link from 'next/link';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

// Public marketing landing. The product itself lives behind /login (see middleware
// + (app)/layout guard). This page is the only product surface a stranger sees.
export const dynamic = 'force-dynamic';

async function isAuthed(): Promise<boolean> {
  if (!serverIsSupabaseConfigured()) return false;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return !!user;
}

const mono = { fontFamily: 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace' };

const FEATURES = [
  {
    title: '个人股票池 + 每日 AI 简报',
    desc: '自选 A股 / 港股 / 美股标的,每天自动生成监控简报与异动提醒。',
    icon: (
      <>
        <rect x="3" y="4" width="4.5" height="16" rx="1" />
        <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
        <rect x="16.5" y="4" width="4.5" height="14" rx="1" />
      </>
    ),
  },
  {
    title: 'AI 投资委员会',
    desc: '巴菲特 / 芒格 / 德鲁肯米勒等多位大师视角,对同一标的给出独立研判。',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="10" r="2.4" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M14.5 20a4.5 4.5 0 0 1 6.5-4" />
      </>
    ),
  },
  {
    title: '信号雷达 + 回测',
    desc: '规则触发的机会信号实时扫描,历史回测验证策略的胜率与回撤。',
    icon: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 4a8 8 0 0 1 8 8" />
        <path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5" />
      </>
    ),
  },
  {
    title: 'John Cameron · PM 决策',
    desc: '德鲁肯米勒基因的 PM agent,五段式决策管线给出可追溯的买卖判断。',
    icon: (
      <>
        <path d="M12 3a4 4 0 0 1 4 4c0 1.5-.8 2.3-1.5 3-.6.6-1 1.2-1 2.2" />
        <path d="M8 7a4 4 0 0 1 6.5-3.1" />
        <path d="M9.5 14.4c0-1-.4-1.6-1-2.2C7.8 11.3 7 10.5 7 9" />
        <path d="M9 17h6M10 20h4" />
      </>
    ),
  },
];

export default async function LandingPage() {
  const authed = await isAuthed();

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <style>{`
        @keyframes oa-rise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: translateY(0); } }
        @keyframes oa-glow { 0%,100% { opacity:.5; } 50% { opacity:.85; } }
        .oa-reveal { opacity:0; animation: oa-rise .7s cubic-bezier(.2,.8,.2,1) forwards; }
        @media (prefers-reduced-motion: reduce) { .oa-reveal { animation: none; opacity:1; } }
      `}</style>

      {/* Atmosphere: accent glow + faint grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, var(--accent-wash, rgba(88,166,255,.16)), transparent)', animation: 'oa-glow 7s ease-in-out infinite' }}
        />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 75%)',
          }}
        />
      </div>

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="text-lg font-bold tracking-tight">osborn<span className="text-accent">alpha</span></span>
        <nav className="flex items-center gap-2 text-sm">
          {authed ? (
            <Link href="/dashboard" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90">进入工作台</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-4 py-2 text-text-dim transition-colors hover:text-text">登录</Link>
              <Link href="/register" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90">免费注册</Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
        <div>
          <div className="oa-reveal mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-text-dim" style={{ animationDelay: '40ms' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span style={mono}>A股 · 港股 · 美股 · 每日 AI 监控</span>
          </div>
          <h1 className="oa-reveal text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: '120ms' }}>
            你的 AI<br />投资 <span className="text-accent">PM</span>
          </h1>
          <p className="oa-reveal mt-5 max-w-md text-lg leading-relaxed text-text-dim" style={{ animationDelay: '200ms' }}>
            选股、监控、决策,一个工作台搞定。每日 AI 简报、多位投资大师视角、信号雷达与历史回测。
          </p>
          <div className="oa-reveal mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '280ms' }}>
            {authed ? (
              <Link href="/dashboard" className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-opacity hover:opacity-90">进入工作台 →</Link>
            ) : (
              <>
                <Link href="/register" className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-opacity hover:opacity-90">免费注册 →</Link>
                <Link href="/login" className="rounded-xl border border-border bg-bg-elevated px-6 py-3 font-medium text-text transition-colors hover:border-accent">登录</Link>
              </>
            )}
          </div>
          <p className="oa-reveal mt-4 text-xs text-text-muted" style={{ animationDelay: '340ms' }}>
            登录后进入产品 · 数据按账户独立存储与隔离
          </p>
        </div>

        {/* Hero face: sample daily brief card */}
        <div className="oa-reveal" style={{ animationDelay: '360ms' }}>
          <div className="rounded-2xl border border-border bg-bg-elevated/80 p-1 backdrop-blur">
            <div className="rounded-[14px] border border-border bg-bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-text-dim">今日 AI 简报</span>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent" style={mono}>置信度 7.8</span>
              </div>
              <div className="space-y-3">
                {[
                  { t: '00700.HK', n: '腾讯控股', p: '+2.4%', up: true },
                  { t: 'NVDA', n: '英伟达', p: '+1.1%', up: true },
                  { t: '600519', n: '贵州茅台', p: '-0.8%', up: false },
                ].map((r) => (
                  <div key={r.t} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm" style={mono}>{r.t}</span>
                      <span className="text-sm text-text-dim">{r.n}</span>
                    </div>
                    <span className="text-sm font-medium" style={{ ...mono, color: r.up ? 'var(--up)' : 'var(--down)' }}>{r.p}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-xs leading-relaxed text-text-dim">
                <span className="text-accent">委员会观点:</span> 多数大师对核心持仓维持 <span className="text-text">中性偏多</span>,关注本周流动性与财报催化。
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="oa-reveal group rounded-2xl border border-border bg-bg-elevated p-5 transition-colors hover:border-accent"
              style={{ animationDelay: `${420 + i * 70}ms` }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                {f.icon}
              </svg>
              <h3 className="mt-4 text-base font-medium">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 mx-auto max-w-3xl px-5 py-12">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">定价</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-bg-elevated p-6">
            <div className="text-sm text-text-dim">Free</div>
            <div className="mt-1 text-3xl font-bold" style={mono}>¥0</div>
            <ul className="mt-5 space-y-2 text-sm text-text-dim">
              <li>· 个人股票池</li>
              <li>· 每日 AI 简报</li>
              <li>· 基础信号雷达</li>
            </ul>
            {!authed && (
              <Link href="/register" className="mt-6 block rounded-xl border border-border bg-bg-card py-2.5 text-center text-sm font-medium transition-colors hover:border-accent">免费开始</Link>
            )}
          </div>
          <div className="relative rounded-2xl border-2 border-accent bg-bg-elevated p-6">
            <span className="absolute -top-3 left-6 rounded-md bg-accent px-2.5 py-0.5 text-xs font-medium text-bg">即将上线</span>
            <div className="text-sm text-text-dim">Pro</div>
            <div className="mt-1 text-3xl font-bold" style={mono}>¥— <span className="text-sm font-normal text-text-muted">/ 月</span></div>
            <ul className="mt-5 space-y-2 text-sm text-text-dim">
              <li>· 无限 AI 投资委员会</li>
              <li>· 完整回测 + 数据导出</li>
              <li>· John Cameron PM 决策</li>
            </ul>
            <div className="mt-6 rounded-xl border border-border bg-bg-card py-2.5 text-center text-sm text-text-muted">敬请期待</div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-xl border border-border bg-bg-elevated p-4 text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text-dim">免责声明:</span> 本站所有内容由 AI 自动生成,仅作为投资决策的辅助参考,不构成任何形式的投资建议、要约或推介。AI 生成的观点可能存在错误、遗漏或偏差;历史数据不代表未来表现。投资决策应基于您自身的研究和判断,您应自行承担所有投资风险。osbornalpha 是个人工具,不提供任何投资建议许可服务。
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
          <span>© 2026 osbornalpha</span>
          <Link href="/about" className="transition-colors hover:text-text-dim">关于</Link>
        </div>
      </footer>
    </div>
  );
}
