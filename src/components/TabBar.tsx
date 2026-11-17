'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {useCallback, useRef, useState, type ReactElement} from 'react';
import {activeNavId, isMoreActive, NAV_ITEMS, PHONE_TAB_IDS} from './nav/nav-items';
import {MoreSheet} from './nav/MoreSheet';

interface TabDef {
  id: typeof PHONE_TAB_IDS[number];
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
    id: 'macro',
    // Globe glyph
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" aria-hidden="true" {...stroke}>
        <circle cx="12" cy="12" r="8" />
        <ellipse cx="12" cy="12" rx="3.5" ry="8" />
        <path d="M4 12h16" />
      </svg>
    ),
  },
  {
    id: 'watchlist',
    // Kanban columns glyph — three vertical bars
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" aria-hidden="true" {...stroke}>
        <rect x="3" y="4" width="4.5" height="16" rx="1" />
        <rect x="9.75" y="4" width="4.5" height="11" rx="1" />
        <rect x="16.5" y="4" width="4.5" height="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'intel',
    // Radar sweep glyph — concentric arcs + scan dot
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" aria-hidden="true" {...stroke}>
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <path d="M12 4a8 8 0 0 1 8 8" />
        <path d="M12 7.5a4.5 4.5 0 0 1 4.5 4.5" />
        <path d="M12 12l6-3.5" />
      </svg>
    ),
  },
  {
    id: 'portfolio',
    // Briefcase glyph
    Icon: ({ className }) => (
      <svg viewBox="0 0 24 24" className={className} width="22" height="22" aria-hidden="true" {...stroke}>
        <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
        <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
      </svg>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  const tNav = useTranslations('common.nav');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const active = activeNavId(pathname);
  const moreActive = isMoreActive(pathname);
  const marker = <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />;
  const tabClass = (selected: boolean) => `relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors ${selected ? 'text-accent' : 'text-text-dim'}`;
  return <>
    <nav aria-label={tNav('label')} className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-bg-elevated lg:hidden"
      style={{height: 'calc(60px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)'}}>
      {PHONE_TAB_IDS.map(id => {
        const item = NAV_ITEMS.find(item => item.id === id)!;
        const Icon = TABS.find(item => item.id === id)!.Icon;
        return <Link key={id} href={item.href} aria-current={active === id ? 'page' : undefined} className={tabClass(active === id)}>
          {active === id && marker}<Icon /><span>{tNav(item.navKey)}</span>
        </Link>;
      })}
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)} className={tabClass(moreActive)}>
        {moreActive && marker}
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" {...stroke}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        <span>{tNav('more')}</span>
      </button>
    </nav>
    <MoreSheet open={open} onClose={close} triggerRef={triggerRef} />
  </>;
}
