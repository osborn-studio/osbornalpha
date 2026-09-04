'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui';
import { CopilotClient } from '@/app/(app)/copilot/CopilotClient';

/** Derive the ticker in scope from the current route, if any. */
function tickerFromPathname(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  const m = pathname.match(/\/(?:intel\/)?stock\/([^/]+)/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Global Copilot overlay: floating action button + ⌘K drawer. */
export function CopilotFab() {
  const t = useTranslations('market.fab');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ticker = tickerFromPathname(pathname);
  const hideOnWatchlistMobile = pathname?.split('/').includes('watchlist');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('openAria')}
        className={`fixed bottom-20 right-4 z-50 h-12 w-12 items-center justify-center rounded-full border border-accent-dim bg-bg-elevated text-2xl shadow-lg transition-transform hover:scale-105 ${hideOnWatchlistMobile ? 'hidden sm:flex' : 'flex'}`}
      >
        🎩
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span>{t('title')}</span>
              <Link href="/copilot" className="text-xs font-normal text-accent hover:underline">
                {t('expand')}
              </Link>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              aria-label={t('closeAria')}
            >
              ✕
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <CopilotClient initialTicker={ticker} autoStart={false} />
          </div>
        </div>
      )}
    </>
  );
}
