import { MacroResearchFooter } from '@/components/macro/MacroResearchFooter';
// src/app/(app)/macro/transmission/page.tsx
// Transmission page (spec §3.1, §3.3, §9.1): 404 while MACRO_STRATEGY_ENABLED is off, "foundation not ready" while the
// P1+P2 port is not wired; otherwise the client screen loads the transmission, playbooks and response matrix APIs.
import { notFound } from 'next/navigation';
import { StrategyPageHeader } from '@/components/macro/strategy/StrategyScreens';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { TransmissionScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function TransmissionPage({ searchParams }: { searchParams: Promise<{ region?: string | string[] }> }) {
  if (!strategyEnabled()) notFound();
  const { region } = await searchParams;
  if (!strategyPort()) return <div className="space-y-4"><StrategyPageHeader active="transmission" region={region === 'CN' ? 'CN' : 'US'} /><DependencyState kind="foundation" /><MacroResearchFooter seriesIds={[]} region={region === 'CN' ? 'CN' : 'US'} /></div>;
  return <TransmissionScreen initialRegion={region === 'CN' ? 'CN' : 'US'} />;
}
