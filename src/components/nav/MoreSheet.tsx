'use client';
import Link from 'next/link';
import {useEffect, useRef, type RefObject} from 'react';
import {useTranslations} from 'next-intl';
import {LanguageSwitch} from './LanguageSwitch';
import {ThemeSwitch} from './ThemeSwitch';
import {MORE_IDS, NAV_ITEMS} from './nav-items';

interface Props {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}
export function MoreSheet({open, onClose, triggerRef}: Props) {
  const t = useTranslations('common.nav');
  const alt = useTranslations('common.navAlt');
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); onClose();}
      if (event.key !== 'Tab') return;
      const elements = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      const outside = !panel.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && (document.activeElement === last || outside)) {event.preventDefault(); first.focus();}
    };
    const desktop = window.matchMedia('(min-width: 1024px)');
    const resize = () => {if (desktop.matches) onClose();};
    desktop.addEventListener('change', resize);
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      desktop.removeEventListener('change', resize);
      trigger?.focus();
    };
  }, [open, onClose, triggerRef]);
  if (!open) return null;
  const rowClass = 'flex min-h-[48px] items-center justify-between gap-3 border-t border-border px-4 py-1 text-text';
  const label = (key: 'analyst' | 'tools' | 'settings' | 'language' | 'theme' | 'about') => <span><span>{t(key)}</span> <span className="text-text-muted text-[0.82em]">{alt(key)}</span></span>;
  const chevron = <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 6 6 6-6 6" /></svg>;
  return <div className="fixed inset-x-0 top-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-[60] lg:hidden">
    <div aria-hidden="true" className="absolute inset-0 bg-bg/80" onClick={onClose} />
    <div ref={panel} role="dialog" aria-modal="true" aria-label={t('more')}
      className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-md border-t border-border bg-bg-elevated">
      <div className="flex min-h-[48px] items-center justify-between px-4">
        <h2 className="font-semibold text-text">{t('more')}</h2>
        <button ref={close} type="button" aria-label={t('close')} onClick={onClose} className="flex h-11 w-11 items-center justify-center text-text-dim">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {NAV_ITEMS.filter(item => MORE_IDS.includes(item.id)).map(item => <Link key={item.id} href={item.href} data-more-row={item.id} className={rowClass} onClick={onClose}>{label(item.id as 'analyst' | 'tools' | 'settings')}{chevron}</Link>)}
      <div data-more-row="language" className={rowClass}>{label('language')}<LanguageSwitch /></div>
      <div data-more-row="theme" className={rowClass}>{label('theme')}<ThemeSwitch /></div>
      <Link href="/about" data-more-row="about" className={rowClass} onClick={onClose}>{label('about')}{chevron}</Link>
    </div>
  </div>;
}
