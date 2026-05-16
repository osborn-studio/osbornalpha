'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SearchInput } from './SearchInput';
import { ThemeToggle } from './ThemeToggle';

export function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3">
      <Link href="/" className="text-lg font-bold text-text">
        Stock<span className="text-accent">Monitor</span>
      </Link>
      <SearchInput />
      <ThemeToggle />
      <Link href="/about" className="rounded p-2 text-text-dim hover:bg-bg-card hover:text-text" title="关于">
        ⓘ
      </Link>
    </header>
  );
}
