'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SearchInput } from './SearchInput';
import { ThemeToggle } from './ThemeToggle';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export function TopBar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseReady) return;
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabaseReady]);

  async function logout() {
    if (!supabaseReady) return;
    const sb = getBrowserSupabase();
    await sb.auth.signOut();
    setUserEmail(null);
  }

  return (
    <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3">
      <Link href="/" className="text-lg font-bold text-text">
        Stock<span className="text-accent">Monitor</span>
      </Link>
      <SearchInput />
      <ThemeToggle />
      {supabaseReady ? (
        userEmail ? (
          <div className="hidden items-center gap-2 text-xs sm:flex">
            <span className="max-w-[180px] truncate text-text-dim" title={userEmail}>
              {userEmail}
            </span>
            <button
              onClick={logout}
              className="rounded border border-border bg-bg-card px-2.5 py-1.5 text-text-dim hover:text-text"
            >
              登出
            </button>
          </div>
        ) : (
          <Link href="/login" className="rounded bg-accent-dim px-3 py-1.5 text-xs font-semibold text-white">
            登录 / 注册
          </Link>
        )
      ) : (
        <Link href="/settings" className="hidden rounded px-2.5 py-1.5 text-xs text-text-dim hover:bg-bg-card sm:inline-block">
          访客模式
        </Link>
      )}
      <Link href="/about" className="rounded p-2 text-text-dim hover:bg-bg-card hover:text-text" title="关于">
        ⓘ
      </Link>
    </header>
  );
}
