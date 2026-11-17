// src/components/company/ViewTabs.tsx
'use client';
// Primary view links and a disclosure for secondary views; Escape returns focus to More.
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { companyHref, type ViewId } from '@/lib/company/client';

export const PRIMARY_VIEWS = ['overview', 'statements', 'metrics', 'filings', 'tracking', 'judgments'] as const satisfies readonly ViewId[];
export const SECONDARY_VIEWS = ['ai', 'signals', 'holdings'] as const satisfies readonly ViewId[];

interface ViewTabsProps { ticker: string; view: ViewId; asOf: string | null; right?: React.ReactNode }
export function ViewTabs(props: ViewTabsProps) {
  return <ViewTabsContent key={`${props.ticker}:${props.view}:${props.asOf}`} {...props} />;
}
function ViewTabsContent({ ticker, view, asOf, right }: ViewTabsProps) {
  const t = useTranslations('company.tabs');
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const secondary = SECONDARY_VIEWS.some(id => id === view);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus(); }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const tabClass = (active: boolean) => `inline-flex min-h-11 items-center border-b-2 px-3 py-2.5 text-sm no-underline hover:no-underline ${active ? 'border-accent text-accent' : 'border-transparent text-text-dim hover:text-text'}`;
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-x-2 border-b border-border">
      <nav aria-label={t('ariaLabel')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap">
        {PRIMARY_VIEWS.map(id => <Link key={id} href={companyHref(ticker, { view: id, asOf }) as never} aria-current={id === view ? 'page' : undefined} className={tabClass(id === view)}>{t(id)}</Link>)}
      </nav>
      <div ref={menu} className="relative min-w-0 max-w-[65%] shrink-0">
        <button ref={button} data-testid="company-more" type="button" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)} className={tabClass(secondary)}>
          <span className="min-w-0 break-words">{t('more')}{secondary && ` · ${t(view)}`}</span>
        </button>
        <ul id={menuId} hidden={!open} className="absolute right-0 z-20 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-bg-elevated p-1 shadow-sm">
          {SECONDARY_VIEWS.map(id => <li key={id}><Link href={companyHref(ticker, { view: id, asOf }) as never} aria-current={id === view ? 'page' : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 items-center rounded px-3 py-2 text-sm ${id === view ? 'text-accent' : 'text-text-dim'}`}>{t(id)}</Link></li>)}
        </ul>
      </div>
      {right && <div className="ml-auto shrink-0 pb-1.5">{right}</div>}
    </div>
  );
}
