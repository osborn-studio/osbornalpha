import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ToastProvider } from '@/components/Toast';

// Geist (sans) + Geist Mono, per DESIGN.md §3. Self-hosted via the `geist`
// package (Vercel's preferred path). CSS vars --font-geist-sans /
// --font-geist-mono are emitted on <html> and consumed in globals.css.

export const metadata: Metadata = {
  title: { default: 'osbornalpha · AI 投资监控工作台', template: '%s · osbornalpha' },
  description: 'AI 投资监控工作台 · 个人股票池每日 AI 监控 · A 股 / 港股 / 美股',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'osbornalpha',
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
        {/* Pre-hydration theme — runs BEFORE first paint so we get no FOUC. */}
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
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
