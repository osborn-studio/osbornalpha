import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { getServerSupabase, serverIsSupabaseConfigured } from '@/lib/supabase/server';

// Public marketing landing. The product itself lives behind /login (see middleware
// + (app)/layout guard). This page is the only product surface a stranger sees.
// Bilingual: served at `/` (zh, default) and `/en` (middleware rewrite — see
// src/middleware.ts). Copy lives in messages/{zh,en}/landing.json.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.meta');
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: '/',
      languages: {
        'zh-CN': '/',
        en: '/en',
      },
    },
  };
}

async function isAuthed(): Promise<boolean> {
  if (!serverIsSupabaseConfigured()) return false;
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return !!user;
}

const mono = { fontFamily: 'var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace' };

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  watchlistBrief: (
    <>
      <rect x="3" y="4" width="4.5" height="16" rx="1" />
      <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
      <rect x="16.5" y="4" width="4.5" height="14" rx="1" />
    </>
  ),
  committee: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.4" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M14.5 20a4.5 4.5 0 0 1 6.5-4" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4a8 8 0 0 1 8 8" />
      <path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5" />
    </>
  ),
  pm: (
    <>
      <path d="M12 3a4 4 0 0 1 4 4c0 1.5-.8 2.3-1.5 3-.6.6-1 1.2-1 2.2" />
      <path d="M8 7a4 4 0 0 1 6.5-3.1" />
      <path d="M9.5 14.4c0-1-.4-1.6-1-2.2C7.8 11.3 7 10.5 7 9" />
      <path d="M9 17h6M10 20h4" />
    </>
  ),
};

const FEATURE_KEYS = ['watchlistBrief', 'committee', 'radar', 'pm'] as const;

const SAMPLE_ROWS = [
  { t: '00700.HK', n: '腾讯控股', p: '+2.4%', up: true },
  { t: 'NVDA', n: '英伟达', p: '+1.1%', up: true },
  { t: '600519', n: '贵州茅台', p: '-0.8%', up: false },
];

export default async function LandingPage() {
  const [authed, t, locale] = await Promise.all([
    isAuthed(),
    getTranslations('landing'),
    getLocale(),
  ]);

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
          <span className="mr-1 flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-text-dim">
            <Link href="/" className={locale === 'zh' ? 'font-semibold text-text' : 'hover:text-text'}>
              {t('languageSwitcher.zh')}
            </Link>
            <span className="text-text-muted">/</span>
            <Link href="/en" className={locale === 'en' ? 'font-semibold text-text' : 'hover:text-text'}>
              {t('languageSwitcher.en')}
            </Link>
          </span>
          {authed ? (
            <Link href="/today" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90">{t('nav.enterWorkbench')}</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-4 py-2 text-text-dim transition-colors hover:text-text">{t('nav.login')}</Link>
              <Link href="/register" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90">{t('nav.register')}</Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
        <div>
          <div className="oa-reveal mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-text-dim" style={{ animationDelay: '40ms' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span style={mono}>{t('hero.badge')}</span>
          </div>
          <h1 className="oa-reveal text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: '120ms' }}>
            {t('hero.titleLine1')}<br />{t('hero.titleLine2Pre')}<span className="text-accent">{t('hero.titleLine2Accent')}</span>
          </h1>
          <p className="oa-reveal mt-5 max-w-md text-lg leading-relaxed text-text-dim" style={{ animationDelay: '200ms' }}>
            {t('hero.subtitle')}
          </p>
          <div className="oa-reveal mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: '280ms' }}>
            {authed ? (
              <Link href="/today" className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-opacity hover:opacity-90">{t('hero.ctaEnter')}</Link>
            ) : (
              <>
                <Link href="/register" className="rounded-xl bg-accent px-6 py-3 font-medium text-bg transition-opacity hover:opacity-90">{t('hero.ctaRegister')}</Link>
                <Link href="/login" className="rounded-xl border border-border bg-bg-elevated px-6 py-3 font-medium text-text transition-colors hover:border-accent">{t('hero.ctaLogin')}</Link>
              </>
            )}
          </div>
          <p className="oa-reveal mt-4 text-xs text-text-muted" style={{ animationDelay: '340ms' }}>
            {t('hero.note')}
          </p>
        </div>

        {/* Hero face: sample daily brief card */}
        <div className="oa-reveal" style={{ animationDelay: '360ms' }}>
          <div className="rounded-2xl border border-border bg-bg-elevated/80 p-1 backdrop-blur">
            <div className="rounded-[14px] border border-border bg-bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-text-dim">{t('sampleBrief.label')}</span>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent" style={mono}>{t('sampleBrief.confidence')}</span>
              </div>
              <div className="space-y-3">
                {SAMPLE_ROWS.map((r) => (
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
                <span className="text-accent">{t('sampleBrief.committeeLabel')}</span> {t('sampleBrief.committeeText')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_KEYS.map((key, i) => (
            <div
              key={key}
              className="oa-reveal group rounded-2xl border border-border bg-bg-elevated p-5 transition-colors hover:border-accent"
              style={{ animationDelay: `${420 + i * 70}ms` }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                {FEATURE_ICONS[key]}
              </svg>
              <h3 className="mt-4 text-base font-medium">{t(`features.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-dim">{t(`features.${key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 mx-auto max-w-3xl px-5 py-12">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">{t('pricing.heading')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-bg-elevated p-6">
            <div className="text-sm text-text-dim">{t('pricing.free.name')}</div>
            <div className="mt-1 text-3xl font-bold" style={mono}>{t('pricing.free.price')}</div>
            <ul className="mt-5 space-y-2 text-sm text-text-dim">
              <li>{t('pricing.free.feature1')}</li>
              <li>{t('pricing.free.feature2')}</li>
              <li>{t('pricing.free.feature3')}</li>
            </ul>
            {!authed && (
              <Link href="/register" className="mt-6 block rounded-xl border border-border bg-bg-card py-2.5 text-center text-sm font-medium transition-colors hover:border-accent">{t('pricing.free.cta')}</Link>
            )}
          </div>
          <div className="relative rounded-2xl border-2 border-accent bg-bg-elevated p-6">
            <span className="absolute -top-3 left-6 rounded-md bg-accent px-2.5 py-0.5 text-xs font-medium text-bg">{t('pricing.pro.badge')}</span>
            <div className="text-sm text-text-dim">{t('pricing.pro.name')}</div>
            <div className="mt-1 text-3xl font-bold" style={mono}>{t('pricing.pro.price')}<span className="text-sm font-normal text-text-muted">{t('pricing.pro.priceSuffix')}</span></div>
            <ul className="mt-5 space-y-2 text-sm text-text-dim">
              <li>{t('pricing.pro.feature1')}</li>
              <li>{t('pricing.pro.feature2')}</li>
              <li>{t('pricing.pro.feature3')}</li>
            </ul>
            <div className="mt-6 rounded-xl border border-border bg-bg-card py-2.5 text-center text-sm text-text-muted">{t('pricing.pro.cta')}</div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-5 py-10">
        <div className="rounded-xl border border-border bg-bg-elevated p-4 text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text-dim">{t('footer.disclaimerLabel')}</span> {t('footer.disclaimer')}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
          <span>{t('footer.copyright')}</span>
          <Link href="/about" className="transition-colors hover:text-text-dim">{t('footer.about')}</Link>
        </div>
      </footer>
    </div>
  );
}
