import { MacroResearchFooter } from '@/components/macro/MacroResearchFooter';
// src/app/(app)/macro/history/page.tsx
// History page (spec §3.1, §3.4, §9.1): policy action episodes × asset interval changes with a boundary switch.
import { notFound } from 'next/navigation';
import { StrategyPageHeader } from '@/components/macro/strategy/StrategyScreens';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { HistoryScreen } from '@/components/macro/strategy/StrategyScreens';
import type { Boundary } from '@/lib/macro/strategy/contract';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';
const BOUNDARIES: readonly Boundary[] = ['event_day', 'first_trading_day', 'month_end'];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ boundary?: string | string[]; region?: string | string[] }> }) {
  if (!strategyEnabled()) notFound();
  const { boundary, region } = await searchParams;
  if (!strategyPort()) return <div className="space-y-4"><StrategyPageHeader active="history" region={region === 'CN' ? 'CN' : 'US'} /><DependencyState kind="foundation" /><MacroResearchFooter seriesIds={[]} region={region === 'CN' ? 'CN' : 'US'} /></div>;
  const initial = BOUNDARIES.find((b) => b === boundary) ?? 'event_day';
  return <HistoryScreen initialBoundary={initial} region={region === 'CN' ? 'CN' : 'US'} />;
}
