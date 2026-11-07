// src/app/(app)/intel/macro/transmission/page.tsx
// Transmission page (spec §3.1, §3.3, §9.1): 404 while MACRO_STRATEGY_ENABLED is off, "foundation not ready" while the
// P1+P2 port is not wired; otherwise the client screen loads the transmission, playbooks and response matrix APIs.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { TransmissionScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default async function TransmissionPage({ searchParams }: { searchParams: Promise<{ region?: string | string[] }> }) {
  if (!strategyEnabled()) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  const { region } = await searchParams;
  return <TransmissionScreen initialRegion={region === 'CN' ? 'CN' : 'US'} />;
}
