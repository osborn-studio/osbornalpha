'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ListChecks,
  Settings,
  SunMedium,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

interface TabDef {
  id: string;
  navKey: 'today' | 'watchlist' | 'intel' | 'portfolio' | 'tools' | 'settings';
  href: string;
  Icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'home', navKey: 'today', href: '/today', Icon: SunMedium },
  { id: 'watch', navKey: 'watchlist', href: '/watchlist', Icon: ListChecks },
  { id: 'intel', navKey: 'intel', href: '/intel', Icon: ChartNoAxesCombined },
  { id: 'portfolio', navKey: 'portfolio', href: '/portfolio', Icon: BriefcaseBusiness },
  { id: 'tools', navKey: 'tools', href: '/tools', Icon: Wrench },
  { id: 'settings', navKey: 'settings', href: '/settings', Icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === '/today' ? pathname === href : pathname.startsWith(href);
}

export function DesktopNavigation() {
  const pathname = usePathname();
  const tNav = useTranslations('common.nav');
  return (
    <nav className="hidden shrink-0 items-center gap-0.5 lg:flex" aria-label={tNav('primaryNavigation')}>
      {TABS.map(({ id, navKey, href, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={id}
            href={href as never}
            aria-current={active ? 'page' : undefined}
            title={tNav(navKey)}
            className={`inline-flex h-9 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${active ? 'bg-bg-card font-semibold text-text' : 'text-text-dim hover:bg-bg-card hover:text-text'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">{tNav(navKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  const tNav = useTranslations('common.nav');
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-bg-elevated lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={tNav('primaryNavigation')}
    >
      {TABS.map(({ id, navKey, href, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={id}
            href={href as never}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${active ? 'text-accent' : 'text-text-dim'}`}
          >
            {active && <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />}
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{tNav(navKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
