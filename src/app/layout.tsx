import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TopBar } from '@/components/TopBar';
import { TabBar } from '@/components/TabBar';
import { ToastProvider } from '@/components/Toast';

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
    <html lang="zh-CN" className="theme-dark" data-color-scheme="cn" suppressHydrationWarning>
      <head>
        {/* Pre-hydration theme to avoid FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var s = localStorage.getItem('color-scheme') || 'cn';
                var t = localStorage.getItem('theme') || 'dark';
                document.documentElement.setAttribute('data-color-scheme', s);
                document.documentElement.classList.remove('theme-dark', 'theme-light');
                document.documentElement.classList.add('theme-' + t);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <TopBar />
          <main className="mx-auto w-full max-w-[1200px] p-4">{children}</main>
          <TabBar />
        </ToastProvider>
      </body>
    </html>
  );
}
