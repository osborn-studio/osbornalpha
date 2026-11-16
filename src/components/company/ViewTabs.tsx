// src/components/company/ViewTabs.tsx
'use client';
// The nine company views as links (plan 2026-11-06 Task 11; spec §5.1, §5.9): asOf preserved,
// horizontal scroll on narrow screens, brass underline on the current tab.
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { VIEW_IDS, companyHref, type ViewId } from '@/lib/company/client';

export function ViewTabs({ ticker, view, asOf, right }: { ticker: string; view: ViewId; asOf: string | null; right?: React.ReactNode }) {
  const t = useTranslations('company.tabs');
  return (
    <div className="flex items-end gap-3 border-b border-[var(--border)]">
      <nav aria-label={t('ariaLabel')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap">
        {VIEW_IDS.map((id) => (
          <Link
            key={id}
            href={companyHref(ticker, { view: id, asOf }) as never}
            aria-current={id === view ? 'page' : undefined}
            className={`border-b-2 px-3 py-2.5 text-sm no-underline hover:no-underline ${id === view ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-dim)] hover:text-[var(--text)]'}`}
          >
            {t(id)}
          </Link>
        ))}
      </nav>
      {right && <div className="shrink-0 pb-1.5">{right}</div>}
    </div>
  );
}
