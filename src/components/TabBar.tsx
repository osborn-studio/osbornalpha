'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { isTabActive } from './tab-active';

interface TabDef {
  id: string;
  navKey: 'macro' | 'watchlist' | 'industries' | 'companies' | 'intel' | 'portfolio' | 'analyst' | 'tools' | 'settings';
  href: string;
  /** Line-art icon — 24×24, 1.5px stroke, currentColor */
  Icon: (props: { className?: string }) => ReactElement;
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
    id: 'macro', navKey: 'macro', href: '/macro',
    // Globe glyph
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="8" />
        <ellipse cx="12" cy="12" rx="3.5" ry="8" />
        <path d="M4 12h16" />
      </svg>
    ),
  },
  {
    id: 'watch', navKey: 'watchlist', href: '/watchlist',
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
    id: 'intel', navKey: 'intel', href: '/intel',
    // Radar sweep glyph — concentric arcs + scan dot
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <path d="M12 4a8 8 0 0 1 8 8" />
        <path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5" />
        <path d="M12 12l6-3.5" />
      </svg>
    ),
  },
  {
    id: 'portfolio', navKey: 'portfolio', href: '/portfolio',
    // Briefcase glyph
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
        <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
      </svg>
    ),
  },
  {
    id: 'analyst', navKey: 'analyst', href: '/analyst',
    // Scoreboard glyph — rounded frame + two score rows
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 10h4M13 10h4M7 14h4M13 14h4" />
      </svg>
    ),
  },
  {
    id: 'tools', navKey: 'tools', href: '/tools',
    // Toolbox glyph (wrench + box line-art)
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </svg>
    ),
  },
  {
    id: 'settings', navKey: 'settings', href: '/settings',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </svg>
    ),
  },
];

// Research is first-class on desktop; keep the established seven mobile tabs.
const DESKTOP_TABS: TabDef[] = [
  ...TABS.slice(0, 2),
  {
    id: 'industries', navKey: 'industries', href: '/intel/industries?scheme=sic&metric=member_count',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <path d="M12 4v6M5 15v-5h14v5" />
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <rect x="2" y="15" width="6" height="6" rx="1" />
        <rect x="16" y="15" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: 'companies', navKey: 'companies', href: '/intel/companies',
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" {...stroke}>
        <rect x="5" y="3" width="14" height="18" rx="1" />
        <path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5" />
      </svg>
    ),
  },
  ...TABS.slice(2),
];

export function TabBar() {
  const pathname = usePathname();
  const tNav = useTranslations('common.nav');
  const renderTabs = (tabs: TabDef[], visibility: string) => (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-elevated ${visibility}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map((t) => {
        const active = isTabActive(pathname, t.href);
        // A first-class research route takes precedence over its Intel parent.
        const selected = active && !tabs.some((other) =>
          other.href.startsWith(t.href + '/') && isTabActive(pathname, other.href));
        return (
          <Link
            key={t.id}
            href={t.href as any}
            aria-current={selected ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              selected ? 'text-accent' : 'text-text-dim'
            }`}
          >
            {/* Brass top-edge bar over the active tab */}
            {selected && (
              <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />
            )}
            <t.Icon className="" />
            <span>{tNav(t.navKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
  return <>{renderTabs(TABS, 'flex lg:hidden')}{renderTabs(DESKTOP_TABS, 'hidden lg:flex')}</>;
}
