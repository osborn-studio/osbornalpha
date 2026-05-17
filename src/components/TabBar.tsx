'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { id: 'home',  icon: '🏠', label: '首页', href: '/' },
  { id: 'watch', icon: '📋', label: '股票池', href: '/watchlist' },
  { id: 'backtest', icon: '🧪', label: 'Backtest', href: '/backtest' },
  { id: 'briefs', icon: '📰', label: '简报', href: '/briefs' },
  { id: 'settings', icon: '⚙️', label: '设置', href: '/settings' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-bg-elevated"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((t) => {
        const active =
          (t.href === '/' && pathname === '/') ||
          (t.href !== '/' && pathname.startsWith(t.href));
        return (
          <Link
            key={t.id}
            href={t.href as any}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              active ? 'text-accent' : 'text-text-dim'
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
