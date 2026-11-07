'use client';
// Client screens of the four strategy pages (spec §3.1–§3.5): link tabs, region / window / boundary switches, data
// loading through the strategy APIs and the capability-matrix states (spec §9.1). Pages stay thin server components.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { Boundary, CycleTableView, PolicyResponseView, Region, TransmissionResponse } from '@/lib/macro/strategy/contract';
import type { ReviewDetailResponse, ReviewIndexResponse } from '@/lib/macro/strategy/route-helpers';
import { CycleReturnsTable } from './CycleReturnsTable';
import { DependencyState } from './DependencyState';
import { ExplanationPanel } from './ExplanationPanel';
import { PlaybookGrid } from './PlaybookGrid';
import { PolicyResponseMatrix } from './PolicyResponseMatrix';
import { ReviewIndex } from './ReviewIndex';
import { ReviewView } from './ReviewView';
import { TransmissionFlow } from './TransmissionFlow';
import { closedMonths, formatInstant, hasSnapshot, shortId, strategyApi, type LoadState } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

const TABS = [
  { id: 'transmission', href: '/intel/macro/transmission' },
  { id: 'history', href: '/intel/macro/history' },
  { id: 'review', href: '/intel/macro/review' },
] as const;

export function StrategyTabs({ active }: { active: 'transmission' | 'history' | 'review' }) {
  const { t } = useStrategyT();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border text-sm">
      <Link href="/intel/macro" className="px-3 py-2 text-text-dim hover:text-text">{t('tabs.workbench')}</Link>
      {TABS.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === active ? 'page' : undefined}
          className={`px-3 py-2 ${tab.id === active ? 'border-b-2 border-accent text-text' : 'text-text-dim hover:text-text'}`}>
          {t(`tabs.${tab.id}`)}
        </Link>
      ))}
    </nav>
  );
}

function Gate<T>({ state, reload, children }: { state: LoadState<T>; reload: () => void; children: (data: T) => ReactNode }) {
  switch (state.kind) {
    case 'ok': return <>{children(state.data)}</>;
    case 'loading': return <DependencyState kind="loading" />;
    case 'foundation': return <DependencyState kind="foundation" onRetry={reload} />;
    case 'no_snapshot': return <DependencyState kind="no_snapshot" />;
    case 'not_found': case 'disabled': return <DependencyState kind="not_found" />;
    case 'judgments_unavailable': return <DependencyState kind="judgments_unavailable" onRetry={reload} />;
    case 'judgments_disabled': return null;
    default: return <DependencyState kind="error" code={state.code} onRetry={reload} />;
  }
}

function RegionSwitch({ region, onRegion }: { region: Region; onRegion: (r: Region) => void }) {
  const { t } = useStrategyT();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('region.label')}>
      {(['US', 'CN'] as const).map((r) => (
        <Button key={r} size="sm" variant={r === region ? 'primary' : 'secondary'} aria-pressed={r === region} onClick={() => onRegion(r)}>{t(`region.${r}`)}</Button>
      ))}
    </div>
  );
}

export function TransmissionScreen({ initialRegion }: { initialRegion: Region }) {
  const { t } = useStrategyT();
  const router = useRouter();
  const [region, setRegion] = useState<Region>(initialRegion);
  const [window, setWindow] = useState<1 | 3 | 6>(3);
  const tr = useStrategyFetch<TransmissionResponse>(strategyApi.transmission(region));
  const pr = useStrategyFetch<PolicyResponseView>(strategyApi.policyResponse(window));
  function switchRegion(r: Region) {
    setRegion(r);
    router.replace(`/intel/macro/transmission?region=${r}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyTabs active="transmission" />
      <RegionSwitch region={region} onRegion={switchRegion} />
      <Gate state={tr.state} reload={tr.reload}>
        {(d) => {
          const snapshotId = d.transmission.snapshots[region];
          return (
            <>
              <p className="font-mono text-[11px] text-text-dim">
                <a className="text-accent hover:underline" href={strategyApi.manifest(d.transmission.manifest_id)}>{t('meta.manifest', { id: shortId(d.transmission.manifest_id) })}</a>
                {' · '}{t('meta.cutoff', { time: formatInstant(d.transmission.cutoff) })}
                {' · '}{t('meta.catalog', { version: d.transmission.catalog_version })}
                {' · '}{t('meta.method', { version: d.transmission.version })}
              </p>
              {hasSnapshot(d.transmission) ? <TransmissionFlow view={d.transmission} /> : <DependencyState kind="no_snapshot" />}
              <PlaybookGrid playbooks={d.playbooks} judgment={{ status: d.judgment_status, f4: d.f4 }} />
              {snapshotId ? <ExplanationPanel subject={{ kind: 'snapshot', id: snapshotId }} /> : null}
            </>
          );
        }}
      </Gate>
      <Gate state={pr.state} reload={pr.reload}>
        {(v) => <PolicyResponseMatrix view={v} window={window} onWindow={setWindow} />}
      </Gate>
    </div>
  );
}

export function HistoryScreen({ initialBoundary }: { initialBoundary: Boundary }) {
  const router = useRouter();
  const [boundary, setBoundary] = useState<Boundary>(initialBoundary);
  const ct = useStrategyFetch<CycleTableView>(strategyApi.cycleTable(boundary));
  function switchBoundary(b: Boundary) {
    setBoundary(b);
    router.replace(`/intel/macro/history?boundary=${b}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyTabs active="history" />
      <Gate state={ct.state} reload={ct.reload}>
        {(v) => <CycleReturnsTable view={v} boundary={boundary} onBoundary={switchBoundary} />}
      </Gate>
    </div>
  );
}

export function ReviewIndexScreen() {
  const us = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('US'));
  const cn = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('CN'));
  const months = useMemo(() => closedMonths(new Date(), 36), []);
  return (
    <div className="space-y-4">
      <StrategyTabs active="review" />
      <Gate state={us.state} reload={us.reload}>
        {(u) => (
          <Gate state={cn.state} reload={cn.reload}>
            {(c) => <ReviewIndex months={months} us={u.items} cn={c.items} />}
          </Gate>
        )}
      </Gate>
    </div>
  );
}

export function ReviewScreen({ region, month }: { region: Region; month: string }) {
  const rv = useStrategyFetch<ReviewDetailResponse>(strategyApi.review(region, month));
  return (
    <div className="space-y-4">
      <StrategyTabs active="review" />
      <Gate state={rv.state} reload={rv.reload}>{(d) => <ReviewView data={d} />}</Gate>
    </div>
  );
}
