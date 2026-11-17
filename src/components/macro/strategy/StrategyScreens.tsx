'use client';
// Client screens of the four strategy pages (spec §3.1–§3.5): link tabs, region / window / boundary switches, data
// loading through the strategy APIs and the capability-matrix states (spec §9.1). Pages stay thin server components.
import { MacroResearchFooter } from '../MacroResearchFooter';
import { registryIdsIn } from '../research-sources';
import { MacroTabs, macroTabHref } from '../MacroTabs';
import { PageHeader } from '@/components/research-ui/PageHeader';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import type { Boundary, CycleTableView, PolicyResponseView, Region, TransmissionResponse } from '@/lib/macro/strategy/contract';
import type { ReviewDetailResponse, ReviewIndexResponse } from '@/lib/macro/strategy/route-helpers';
import { CycleNotes } from './CycleNotes';
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

export function StrategyPageHeader({active,region='US'}:{active:'transmission'|'history'|'review';region?:Region}) {
 const {t}=useStrategyT();
 return <><PageHeader title={t(`tabs.${active}`)} scope={t('page.scope')} /><MacroTabs active={active} region={region} /></>;
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
  const [responseSeries, setResponseSeries] = useState<string[]>([]);
  const [window, setWindow] = useState<1 | 3 | 6>(3);
  const tr = useStrategyFetch<TransmissionResponse>(strategyApi.transmission(region));
  const pr = useStrategyFetch<PolicyResponseView>(strategyApi.policyResponse(window));
  function switchRegion(r: Region) {
    setRegion(r);
    router.replace(`/macro/transmission?region=${r}`, { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyPageHeader active="transmission" region={region} />
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
        {(v) => <PolicyResponseMatrix view={v} window={window} onWindow={setWindow} onSeriesShown={setResponseSeries} />}
      </Gate>
      <MacroResearchFooter seriesIds={[...registryIdsIn(tr.state.kind === 'ok' ? tr.state.data : null), ...(pr.state.kind === 'ok' ? responseSeries : [])]} region={region} />
    </div>
  );
}

export function HistoryScreen({ initialBoundary, region = 'US' }: { initialBoundary: Boundary; region?: Region }) {
  const router = useRouter();
  const [boundary, setBoundary] = useState<Boundary>(initialBoundary);
  const ct = useStrategyFetch<CycleTableView>(strategyApi.cycleTable(boundary));
  function switchBoundary(b: Boundary) {
    setBoundary(b);
    router.replace(macroTabHref('history', region, b), { scroll: false });
  }
  return (
    <div className="space-y-4">
      <StrategyPageHeader active="history" region={region} />
      {ct.state.kind !== 'ok' && <MacroResearchFooter seriesIds={[]} region={region} />}
      <Gate state={ct.state} reload={ct.reload}>
        {(v) => <><CycleReturnsTable view={v} region={region} boundary={boundary} onBoundary={switchBoundary} /><CycleNotes view={v} /></>}
      </Gate>
    </div>
  );
}

export function ReviewIndexScreen({region = 'US'}:{region?:Region}) {
  const us = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('US'));
  const cn = useStrategyFetch<ReviewIndexResponse>(strategyApi.reviews('CN'));
  const months = useMemo(() => closedMonths(new Date(), 36), []);
  return (
    <div className="space-y-4">
      <StrategyPageHeader active="review" region={region} />
      <MacroResearchFooter seriesIds={[]} region={region} />
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
      <StrategyPageHeader active="review" region={region} />
      <Gate state={rv.state} reload={rv.reload}>{(d) => <ReviewView data={d} />}</Gate>
      <MacroResearchFooter seriesIds={registryIdsIn(rv.state.kind === 'ok' ? rv.state.data.result.facts : null)} region={region} />
    </div>
  );
}
