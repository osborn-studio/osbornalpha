'use client';
// AnalysisRunView — /macro/analyses/[runId] (spec §3.1): loads the caller's own run (RLS) and renders it.
import { seriesById } from '@/lib/macro/series-registry';
import { MacroResearchFooter } from './MacroResearchFooter';
import { registryIdsIn } from './research-sources';
import { MacroTabs } from './MacroTabs';
import { PageHeader } from '@/components/research-ui/PageHeader';
import { useEffect, useState } from 'react';
import { CorrelationResult, type RunJson } from './CorrelationResult';
import { useMacroT } from './use-macro-t';

export function AnalysisRunView({ runId, initialRegion = 'US' }: { runId: string; initialRegion?: 'US' | 'CN' }) {
  const { t } = useMacroT();
  const [state, setState] = useState<{ run: RunJson | null; error: string | null }>({ run: null, error: null });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/macro/analyses/${encodeURIComponent(runId)}`)
      .then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error?.code ?? `http_${r.status}`); return b.run as RunJson; })
      .then((run) => { if (!cancelled) setState({ run, error: null }); })
      .catch((e: Error) => { if (!cancelled) setState({ run: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [runId]);
  const region = seriesById(state.run?.spec.indicator_id ?? '')?.region ?? initialRegion;
  return <div className="space-y-3">
    <PageHeader title={t('tabs.correlation')} scope={t('page.subtitle')} legend={false} />
    <MacroTabs active="correlation" region={region} />
    {state.error ? <div role="status" className="card-base text-xs text-text-dim">{state.error === 'not_found' ? t('correlation.result.notFound') : t('states.loadFailed', {code: state.error})}</div>
      : state.run ? <CorrelationResult run={state.run} /> : <div className="text-xs text-text-dim">{t('states.loading')}</div>}
    <MacroResearchFooter seriesIds={registryIdsIn(state.run?.spec)} region={region} />
  </div>;
}
