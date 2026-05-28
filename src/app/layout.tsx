import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { TopBar } from '@/components/TopBar';
import { TabBar } from '@/components/TabBar';
import { ToastProvider } from '@/components/Toast';

// Geist (sans) + Geist Mono — loaded for v2 design per DESIGN.md §3.
// Self-hosted via the `geist` package (Vercel's preferred path). CSS vars
// --font-geist-sans / --font-geist-mono are emitted on <html>, picked up
// conditionally by globals.css under [data-design="v2"]. V1 users pay
// only the static-asset cost; the font file is cached.

export const metadata: Metadata = {
  title: { default: 'Stock Monitor · 个人股票池每日 AI 监控', template: '%s · Stock Monitor' },
  description: '个人股票池每日 AI 监控工具 · A 股 / 港股 / 美股',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Stock Monitor',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`theme-dark ${GeistSans.variable} ${GeistMono.variable}`}
      data-color-scheme="cn"
      suppressHydrationWarning
    >
      <head>
        {/* Pre-hydration theme + design-flag — runs BEFORE first paint so
            we get no FOUC. Reads ?design=v2 OR localStorage 'design'. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var doc = document.documentElement;
                var s = localStorage.getItem('color-scheme') || 'cn';
                var t = localStorage.getItem('theme') || 'dark';
                doc.setAttribute('data-color-scheme', s);
                doc.classList.remove('theme-dark', 'theme-light');
                doc.classList.add('theme-' + t);

                // Design version: query param wins (and persists), else stored, else v1.
                var qp = new URLSearchParams(window.location.search).get('design');
                if (qp === 'v2' || qp === 'v1') {
                  localStorage.setItem('design', qp);
                }
                var d = localStorage.getItem('design');
                if (d === 'v2') doc.setAttribute('data-design', 'v2');
                else doc.removeAttribute('data-design');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <TopBar />
          <main className="mx-auto w-full max-w-[1600px] p-3 lg:p-4">{children}</main>
          <TabBar />
        </ToastProvider>
      </body>
    </html>
  );
}
