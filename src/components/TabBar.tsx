'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDesignV2 } from '@/lib/hooks/useDesignV2';

interface TabDef {
  id: string;
  emoji: string;
  label: string;
  href: string;
  /** Line-art icon (v2) — 24×24, 1.5px stroke, currentColor */
  Icon: (props: { className?: string }) => JSX.Element;
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TABS: TabDef[] = [
  {
    id: 'home', emoji: '🏠', label: '首页', href: '/',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    id: 'watch', emoji: '📋', label: '股票池', href: '/watchlist',
    // Kanban columns glyph — three vertical bars
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="3" y="4" width="4.5" height="16" rx="1" />
        <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
        <rect x="16.5" y="4" width="4.5" height="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'radar', emoji: '🌅', label: '雷达', href: '/radar',
    // Concentric pulse rings
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="2" />
        <path d="M12 4a8 8 0 0 1 8 8" />
        <path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5" />
      </svg>
    ),
  },
  {
    id: 'briefs', emoji: '📰', label: '简报', href: '/briefs',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    id: 'backtest', emoji: '🧪', label: '回测', href: '/backtest',
    // Line chart
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <path d="M4 4v16h16" />
        <path d="M7 15l3.5-4 3 2.5L20 8" />
      </svg>
    ),
  },
  {
    id: 'settings', emoji: '⚙️', label: '设置', href: '/settings',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  const v2 = useDesignV2();
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
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              active ? 'text-accent' : 'text-text-dim'
            }`}
          >
            {/* V2: brass top-edge bar over the active tab */}
            {v2 && active && (
              <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />
            )}
            {v2 ? (
              <t.Icon className="" />
            ) : (
              <span className="text-xl">{t.emoji}</span>
            )}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
