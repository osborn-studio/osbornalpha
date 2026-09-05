'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchInput } from './SearchInput';
import { ThemeToggle } from './ThemeToggle';
import { DesktopNavigation } from './TabBar';
import { CircleHelp } from 'lucide-react';

export function TopBar() {
  const [open, setOpen] = useState(false);
  // "About" tooltip already lives in common.footer.about (G1a) — reuse it
  // instead of duplicating under components.
  const tCommon = useTranslations('common.footer');
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2.5 border-b border-border bg-bg-elevated px-3 sm:px-4">
      <Link href="/today" className="shrink-0 text-base font-bold text-text sm:text-lg">
        osborn<span className="text-accent">alpha</span>
      </Link>
      <DesktopNavigation />
      <SearchInput />
      <ThemeToggle />
      <Link href="/about" className="hidden rounded p-2 text-text-dim hover:bg-bg-card hover:text-text sm:block" title={tCommon('about')} aria-label={tCommon('about')}>
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </Link>
    </header>
  );
}
