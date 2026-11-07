'use client';
// AnalysisRunView — /intel/macro/analyses/[runId] (spec §3.1): loads the caller's own run (RLS) and renders it.
import { useEffect, useState } from 'react';
import { CorrelationResult, type RunJson } from './CorrelationResult';
import { useMacroT } from './use-macro-t';

export function AnalysisRunView({ runId }: { runId: string }) {
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
  if (state.error === 'not_found') return <div className="card-base text-xs text-text-dim">{t('correlation.result.notFound')}</div>;
  if (state.error) return <div className="card-base text-xs text-text-dim">{t('states.loadFailed', { code: state.error })}</div>;
  if (!state.run) return <div className="text-xs text-text-dim">{t('states.loading')}</div>;
  return <CorrelationResult run={state.run} />;
}
