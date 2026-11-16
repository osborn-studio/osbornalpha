// src/app/(app)/intel/macro/review/page.tsx
// Review list (spec §3.1, §3.5, §9.1): US / CN × the last 36 closed months.
import { notFound } from 'next/navigation';
import { DependencyState } from '@/components/macro/strategy/DependencyState';
import { ReviewIndexScreen } from '@/components/macro/strategy/StrategyScreens';
import { strategyEnabled } from '@/lib/macro/strategy/flags';
import { strategyPort } from '@/lib/macro/strategy/port';

export const dynamic = 'force-dynamic';

export default function ReviewIndexPage() {
  if (!strategyEnabled()) notFound();
  if (!strategyPort()) return <DependencyState kind="foundation" />;
  return <ReviewIndexScreen />;
}
