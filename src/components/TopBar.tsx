'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {SearchInput} from './SearchInput';
import {ThemeToggle} from './ThemeToggle';
import {LanguageSwitch} from './nav/LanguageSwitch';
import {NAV_ITEMS, activeNavId} from './nav/nav-items';

export function TopBar() {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const active = activeNavId(pathname);
  const t = useTranslations('common.nav');
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty('--app-topbar-height', `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {observer.disconnect(); document.documentElement.style.removeProperty('--app-topbar-height');};
  }, []);
  return <header ref={header} className="sticky top-0 z-50 border-b border-border bg-bg-elevated">
    <div className="flex min-h-[48px] flex-wrap items-center gap-x-2 px-4 lg:flex-nowrap">
      <Link href="/macro" className="shrink-0 text-lg font-bold text-text">osborn<span className="text-accent">alpha</span></Link>
      <nav aria-label={t('label')} className="hidden lg:flex shrink-0">
        {NAV_ITEMS.map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? 'page' : undefined}
          className={`inline-flex items-center h-12 px-2.5 text-[13px] border-b-2 ${active === item.id ? 'text-text font-semibold border-accent' : 'text-text-dim border-transparent'}`}>{t(item.navKey)}</Link>)}
      </nav>
      <div className="flex-1" />
      <button type="button" aria-label={t('search')} aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex h-11 w-11 shrink-0 items-center justify-center text-text-dim lg:hidden">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
      </button>
      <div className={`${open ? 'flex' : 'hidden'} order-last w-full py-2 lg:order-none lg:flex lg:w-auto lg:min-w-0 lg:max-w-xs lg:flex-1 lg:py-0`}><SearchInput /></div>
      <div className="hidden lg:flex shrink-0 items-center gap-2">
        <LanguageSwitch /><ThemeToggle />
        <Link href="/about" aria-label={t('about')} title={t('about')} className="rounded p-2 text-text-dim hover:bg-bg-card hover:text-text">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg>
        </Link>
      </div>
    </div>
  </header>;
}
