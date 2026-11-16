'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchInput } from './SearchInput';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const [open, setOpen] = useState(false);
  // "About" tooltip already lives in common.footer.about (G1a) — reuse it
  // instead of duplicating under components.
  const tCommon = useTranslations('common.footer');
  return (
    <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3">
      <Link href="/macro" className="text-lg font-bold text-text">
        osborn<span className="text-accent">alpha</span>
      </Link>
      <SearchInput />
      <ThemeToggle />
      <Link href="/about" className="rounded p-2 text-text-dim hover:bg-bg-card hover:text-text" title={tCommon('about')}>
        ⓘ
      </Link>
    </header>
  );
}
