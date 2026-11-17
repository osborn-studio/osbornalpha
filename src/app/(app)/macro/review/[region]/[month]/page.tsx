import { MacroResearchFooter } from '@/components/macro/MacroResearchFooter';
// src/app/(app)/macro/review/[region]/[month]/page.tsx
// Single-month review (spec §3.1, §3.5, §9.1): /macro/review/US/2026-10. An invalid region or month is a 404.
import { notFound } from 'next/navigation';
import { StrategyPageHeader } from '@/components/macro/strategy/StrategyScreens';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { ReviewScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function ReviewMonthPage({ params }: { params: Promise<{ region: string; month: string }> }) {
  if (!strategyEnabled()) notFound();
  const { region, month } = await params;
  if ((region !== 'US' && region !== 'CN') || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  if (!strategyPort()) return <div className="space-y-4"><StrategyPageHeader active="review" region={region} /><DependencyState kind="foundation" /><MacroResearchFooter seriesIds={[]} region={region === 'CN' ? 'CN' : 'US'} /></div>;
  return <ReviewScreen region={region} month={month} />;
}
