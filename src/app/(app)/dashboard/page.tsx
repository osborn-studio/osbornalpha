'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { WatchlistSidebar } from '@/components/WatchlistSidebar';
import { NewsSidebar } from '@/components/NewsSidebar';
import { StockCenterPanel } from '@/components/StockCenterPanel';
import { Disclaimer } from '@/components/Disclaimer';

function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = params.get('s') || '00700.HK';

  const setSelected = (ticker: string) => {
    const next = new URLSearchParams(params);
    next.set('s', ticker);
    router.replace(`${pathname}?${next.toString()}` as any, { scroll: false });
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_300px] lg:gap-3">
      {/* Left: Watchlist */}
      <aside className="order-2 lg:order-1">
        <WatchlistSidebar selectedTicker={selected} onSelect={setSelected} />
      </aside>

      {/* Center: Stock detail */}
      <section className="order-1 min-w-0 lg:order-2">
        <StockCenterPanel ticker={selected} />
      </section>

      {/* Right: News & macro (hidden on small screens, shown below on mobile) */}
      <aside className="order-3 lg:order-3">
        <NewsSidebar />
      </aside>

      <div className="order-4 col-span-full">
        <Disclaimer />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="text-sm text-text-dim">加载中...</div>}>
      <Workspace />
    </Suspense>
  );
}
