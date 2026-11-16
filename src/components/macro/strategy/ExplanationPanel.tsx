'use client';
// LLM explanation panel (spec §3.6, §6.3): not generated → running → accepted (system fact sentences, then the
// model's hypotheses citing fact numbers) / rejected (failure codes only, never model text) / failed. The fixed header
// names the bound subject, manifest, model, prompt and validator versions. A request id is reused only for a retry
// after an ambiguous outcome (network error, gateway or 5xx failure, unreadable body: the run may have completed server-side,
// and the same id recovers it without a second model call); definitive answers clear it. A run whose worker died stays 'running' only until a refresh: GET /explanations first finishes
// runs whose model output was already recorded (no second model call), then expires the rest older than five minutes
// (abandoned → failed), and the failed state offers a new request. Review panels bind to the
// displayed immutable result_id. Remaining runs come from the shared perspectives quota.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { ExplanationProjection } from '@/lib/macro/strategy/contract';
import { explainControls, explainErrorText, failureLabel, generateLabelKey, headerLine, latestFor, remainingToday, renderedSections, strategyApi, submitExplanation, type PendingRequest } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

export function ExplanationPanel({ subject }: { subject: { kind: 'snapshot' | 'review'; id: string } }) {
  const { t, locale } = useStrategyT();
  const list = useStrategyFetch<{ items: ExplanationProjection[] }>(strategyApi.explanations(subject.kind, subject.id));
  const usage = useStrategyFetch<unknown>('/api/usage/today');
  const [current, setCurrent] = useState<ExplanationProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projection = current ?? (list.state.kind === 'ok' ? latestFor(list.state.data.items, locale) : null);
  const controls = explainControls({ busy, listKind: list.state.kind, hasCurrent: current !== null, projection, pending: pending !== null });
  const phase = controls.phase;
  const state = phase === 'loading' || phase === 'readError' ? 'none' : phase;
  const remaining = usage.state.kind === 'ok' ? remainingToday(usage.state.data) : null;

  async function generate() {
    setBusy(true);
    setError(null);
    const r = await submitExplanation({ fetch: ((u, init) => fetch(u, init)) as typeof fetch, gen: () => crypto.randomUUID() }, pending, subject, locale);
    setPending(r.pending);
    const o = r.outcome;
    if (o.kind === 'done') {
      setCurrent(o.projection);
      usage.reload();
    } else {
      if (o.kind === 'run_failed') setCurrent(o.projection);
      setError(o.code);
    }
    setBusy(false);
  }

  function refresh() {
    setCurrent(null);
    list.reload();
  }

  const sections = state === 'accepted' && projection?.rendered ? renderedSections(projection.rendered, projection.manifest_id) : null;
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('explain.title')}</h2>
        <Tag>{t(`explain.state.${phase}`)}</Tag>
      </div>
      {projection ? (
        <div className="space-y-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-text-dim">
          <p>{headerLine(projection, t)}</p>
          <p className="break-all">
            <a className="text-accent hover:underline" href={strategyApi.manifest(projection.manifest_id)}>{t('explain.manifestFull')} {projection.manifest_id}</a>
          </p>
        </div>
      ) : null}
      <p className="text-[11px] text-text-dim">{t('explain.disclaimer')}</p>
      {phase === 'loading' ? <p role="status" className="text-xs text-text-dim">{t('explain.loadingList')}</p> : null}
      {phase === 'readError' ? (
        <div role="alert" className="space-y-2">
          <p className="text-xs text-warn">{t('explain.readError', { code: list.state.kind === 'error' ? list.state.code : list.state.kind })}</p>
          {controls.showReload ? <Button variant="secondary" size="sm" onClick={refresh}>{t('explain.reloadList')}</Button> : null}
        </div>
      ) : null}
      {phase === 'none' ? <p className="text-xs text-text-dim">{t('explain.intro')}</p> : null}
      {pending ? <p className="text-[11px] text-text-dim">{t('explain.pendingNote')}</p> : null}
      {state === 'running' ? (
        <div className="space-y-2">
          <p className="text-xs text-text-dim">{t('explain.runningBody')}</p>
          {!busy ? <p className="text-[11px] text-text-dim">{t('explain.runningStale', { minutes: 5 })}</p> : null}
          {!busy ? <Button variant="secondary" size="sm" onClick={refresh}>{t('explain.refresh')}</Button> : null}
        </div>
      ) : null}
      {sections ? (
        <div className="space-y-3 text-sm">
          <section>
            <h3 className="text-xs text-text-dim">{t('explain.facts')}</h3>
            <ol className="space-y-1">
              {sections.facts.map((f) => <li key={f.factId}>
                  <sup className="mr-1 font-mono text-[10px] text-accent">{f.n}</sup>{f.text}{' '}
                  <a className="break-all font-mono text-[10px] text-text-dim hover:underline" href={f.href} title={t('explain.factId', { id: f.factId })}>{f.factId}</a>
                </li>)}
            </ol>
          </section>
          <section>
            <h3 className="text-xs text-text-dim">{t('explain.hypotheses')}</h3>
            <ul className="space-y-1">
              {sections.hypotheses.map((h, i) => <li key={i}>{h.text} <span className="font-mono text-[10px] text-text-dim" title={h.factIds.join(', ')}>{t('explain.refs', { refs: h.refs.join(', ') })}</span></li>)}
            </ul>
          </section>
          {sections.counterpoints.length > 0 ? (
            <section>
              <h3 className="text-xs text-text-dim">{t('explain.counterpoints')}</h3>
              <ul className="space-y-1">
                {sections.counterpoints.map((c, i) => <li key={i}>{c.text} <span className="font-mono text-[10px] text-text-dim" title={c.factIds.join(', ')}>{t('explain.refs', { refs: c.refs.join(', ') })}</span></li>)}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
      {(state === 'rejected' || state === 'failed') && projection ? (
        <div className="space-y-1 text-xs">
          <p>{state === 'rejected' ? t('explain.rejectedBody') : t('explain.failedBody')}</p>
          <ul className="flex flex-wrap gap-1">{projection.failure_codes.map((c) => <li key={c}><Tag>{failureLabel(c, t)}</Tag></li>)}</ul>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-warn">{explainErrorText(error, t)}</p> : null}
      {controls.showGenerate ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={generate} disabled={!controls.canGenerate}>{t(generateLabelKey(state, error, pending !== null))}</Button>
          {remaining ? <span className="text-[11px] text-text-dim">{remaining.kind === 'unlimited' ? t('explain.unlimited') : t('explain.remaining', { n: remaining.n })}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
