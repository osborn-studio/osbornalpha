import { MacroResearchFooter } from '@/components/macro/MacroResearchFooter';
// src/app/(app)/macro/review/page.tsx
// Review list (spec §3.1, §3.5, §9.1): US / CN × the last 36 closed months.
import { notFound } from 'next/navigation';
import { StrategyPageHeader } from '@/components/macro/strategy/StrategyScreens';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { ReviewIndexScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function ReviewIndexPage({searchParams}: {searchParams?: Promise<{region?: string | string[]}>}) {
  if (!strategyEnabled()) notFound();
  const {region} = await (searchParams ?? Promise.resolve({region: undefined}));
  if (!strategyPort()) return <div className="space-y-4"><StrategyPageHeader active="review" region={region === 'CN' ? 'CN' : 'US'} /><DependencyState kind="foundation" /><MacroResearchFooter seriesIds={[]} region={region === 'CN' ? 'CN' : 'US'} /></div>;
  return <ReviewIndexScreen region={region === 'CN' ? 'CN' : 'US'} />;
}
