'use client';

// LLM settings card: provider → key → test connection → pick model → save → per-row test call.
// All state transitions live in src/lib/llm/settings-state.ts (pure, tested); this component only
// renders that state and sends the request builders' output to fetch unchanged.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import type { CatalogModel, CatalogProvider } from '@/lib/llm/catalog';
import type { LlmFailure } from '@/lib/llm/errors';
import {
  canDiscover,
  canProbe,
  canSave,
  discoverRequest,
  initialState,
  modelRows,
  probeRequest,
  reduce,
  saveRequest,
  savedKeyUsable,
  type DiscoveryResponse,
  type ProbeResponse,
  type SaveResponse,
} from '@/lib/llm/settings-state';

const REGION_ORDER = ['cn', 'intl', 'us'] as const;
const REGION_KEY: Record<string, 'regionCn' | 'regionIntl' | 'regionUs'> = { cn: 'regionCn', intl: 'regionIntl', us: 'regionUs' };

const tokens = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const yuan = (micro: number) => (micro / 1e6).toFixed(micro >= 1e6 ? 2 : 4).replace(/\.?0+$/, '');

async function postJson<T>(url: string, body: unknown): Promise<T> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: 'network' } as T;
  }
}

export function LlmSettings() {
  const t = useTranslations('components.llmSettings');
  const { show } = useToast();
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogModel[]>>({});
  const [state, dispatch] = useReducer(reduce, [] as Array<{ id: string; suggestedModel: string | null }>, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);
  const nextSeq = () => ++seq.current;
  const [showKey, setShowKey] = useState(false);
  const [query, setQuery] = useState('');
  const [chatOnly, setChatOnly] = useState(true);
  const [custom, setCustom] = useState('');

  // Catalog, then the saved configuration. The reducer is re-seeded with the provider list once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cat = await fetch('/api/llm/catalog', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
      if (cancelled || !cat?.providers) return;
      setProviders(cat.providers);
      const saved = await fetch('/api/llm/settings', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
      if (cancelled) return;
      dispatch({ type: 'init', providers: cat.providers });
      if (saved && typeof saved === 'object' && 'configured' in saved) dispatch({ type: 'loaded', saved });
    })();
    return () => { cancelled = true; };
  }, []);

  // Catalog models for the selected provider, fetched once per provider.
  const provider = state.draft.provider;
  useEffect(() => {
    if (!provider || catalog[provider]) return;
    let cancelled = false;
    fetch(`/api/llm/catalog?provider=${encodeURIComponent(provider)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (!cancelled && Array.isArray(j?.models)) setCatalog((c) => ({ ...c, [provider]: j.models })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [provider, catalog]);

  const def = providers.find((p) => p.id === provider) ?? null;
  const rows = useMemo(() => modelRows(state, catalog[provider] ?? [], chatOnly), [state, catalog, provider, chatOnly]);
  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.id.toLowerCase().includes(q)) : rows;

  const reason = useCallback((f: LlmFailure | undefined, error: string | undefined): string => {
    if (f) return `${t(`errorClass.${f.class}`)}${f.status ? ` · ${t('http', { status: f.status })}` : ''}`;
    if (error) return t.has(`serverError.${error}`) ? t(`serverError.${error}`) : error;
    return t('errorClass.unknown');
  }, [t]);

  const onDiscover = async () => {
    const s = stateRef.current;
    if (!canDiscover(s)) return;
    const n = nextSeq();
    const body = discoverRequest(s);
    dispatch({ type: 'discoverStarted', seq: n });
    const response = await postJson<DiscoveryResponse>('/api/llm/discover', body);
    dispatch({ type: 'discoverFinished', seq: n, provider: body.provider, response });
  };

  const onProbe = async (model: string) => {
    const s = stateRef.current;
    if (!canProbe(s, model)) return;
    const n = nextSeq();
    const body = probeRequest(s, model);
    dispatch({ type: 'probeStarted', seq: n, model });
    const response = await postJson<ProbeResponse>('/api/llm/test', body);
    dispatch({ type: 'probeFinished', seq: n, provider: body.provider, model, response });
  };

  const onSave = async () => {
    const s = stateRef.current;
    const body = saveRequest(s);
    if (!body || !canSave(s)) return;
    const n = nextSeq();
    dispatch({ type: 'saveStarted', seq: n });
    const response = await postJson<SaveResponse>('/api/llm/settings', body);
    dispatch({ type: 'saveFinished', seq: n, response });
    if (response.ok) show(`✓ ${t('saved')}`);
    else show(t('saveFailed', { reason: reason(undefined, response.error) }));
  };

  const locked = state.saving;
  const saved = state.saved;
  const savedLabel = saved?.configured ? providers.find((p) => p.id === saved.provider)?.label ?? saved.storedProvider ?? '' : '';
  const statusTone = state.readiness === 'ready' ? 'text-accent' : state.readiness === 'stale' ? 'text-warn' : 'text-text-dim';

  return (
    <div className="space-y-4" data-llm-settings data-readiness={state.readiness}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full border border-border px-2 py-0.5 ${statusTone}`} data-status-badge>{t(`status.${state.readiness}`)}</span>
        {saved?.configured && saved.model && (
          <span className="text-text-muted">{t('savedSummary', { provider: savedLabel, model: saved.model })}</span>
        )}
        {saved?.configured && !saved.known && saved.storedProvider && <span className="text-warn">{t('unknownProviderHint', { provider: saved.storedProvider })}</span>}
        {saved?.legacyPath && <span className="text-text-muted">{t('legacyPathHint')}</span>}
      </div>

      {/* ① provider */}
      <section className="space-y-1">
        <label className="block text-xs font-semibold text-text-dim">{t('stepProvider')}</label>
        <select
          value={provider}
          disabled={locked || providers.length === 0}
          onChange={(e) => dispatch({ type: 'selectProvider', provider: e.target.value })}
          className="w-full rounded-md bg-bg-card px-3 py-2 text-sm"
          aria-label={t('provider')}
        >
          {REGION_ORDER.map((region) => {
            const group = providers.filter((p) => p.region === region);
            return group.length ? (
              <optgroup key={region} label={t(REGION_KEY[region])}>
                {group.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
      </section>

      {/* ② key */}
      <section className="space-y-2">
        <label className="block text-xs font-semibold text-text-dim">{t('stepKey')}</label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={state.draft.key}
            disabled={locked}
            autoComplete="off"
            onChange={(e) => dispatch({ type: 'editKey', key: e.target.value })}
            placeholder={savedKeyUsable(state) ? t('apiKeyConfiguredPlaceholder') : t('apiKeyPlaceholder')}
            className="min-w-0 flex-1 rounded-md bg-bg-card px-3 py-2 text-sm"
            aria-label={t('apiKey')}
          />
          <button type="button" onClick={() => setShowKey((v) => !v)} className="rounded-md bg-bg-card px-3 py-2 text-xs">
            {showKey ? t('hideKey') : t('showKey')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={onDiscover}
            disabled={!canDiscover(state)}
            title={!canDiscover(state) && !state.saving ? t('needKey') : undefined}
            className="rounded-md bg-bg-card px-4 py-2 text-sm disabled:opacity-50"
            data-test-connection
          >
            {state.discovery.status === 'running' ? t('testing') : t('testConnection')}
          </button>
          {def?.keyUrl && <a href={def.keyUrl} target="_blank" rel="noreferrer">{t('getKey')}</a>}
          {def?.docsUrl && <a href={def.docsUrl} target="_blank" rel="noreferrer">{t('docs')}</a>}
        </div>
        {state.discovery.status === 'done' && (
          <div className="text-xs text-accent" data-connection-result>
            {t(state.discovery.result.truncated ? 'connectionOkTruncated' : 'connectionOk', { ms: Math.round(state.discovery.result.latency_ms), count: state.discovery.result.models.length })}
          </div>
        )}
        {state.discovery.status === 'failed' && (
          <div className="text-xs text-warn" role="alert" data-connection-result>
            {state.discovery.failure?.class === 'discovery_unsupported'
              ? t('discoveryUnsupported')
              : t('connectionFailed', { reason: reason(state.discovery.failure, state.discovery.error) })}
          </div>
        )}
      </section>

      {/* ③ model */}
      <section className="space-y-2">
        <label className="block text-xs font-semibold text-text-dim">{t('stepModel')}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('modelSearch')} className="min-w-0 flex-1 rounded-md bg-bg-card px-3 py-1.5 text-sm" aria-label={t('modelSearch')} />
          <label className="flex items-center gap-1 text-xs text-text-muted">
            <input type="checkbox" checked={chatOnly} onChange={(e) => setChatOnly(e.target.checked)} />
            {t('chatOnly')}
          </label>
        </div>
        <p className="text-[11px] text-text-muted">{t('modelListHint')}</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto" data-model-list>
          {visible.length === 0 && <li className="text-xs text-text-muted">{t('noModels')}</li>}
          {visible.map((row) => {
            const probe = state.probes[row.id];
            const selected = state.draft.model === row.id;
            const c = row.catalog;
            return (
              <li key={row.id} data-model={row.id} className={`rounded-md border px-2 py-1.5 text-xs ${selected ? 'border-accent' : 'border-border'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="radio" name="llm-model" checked={selected} disabled={locked} onChange={() => dispatch({ type: 'selectModel', model: row.id })} />
                    <span className="truncate font-medium">{row.id}</span>
                    <span className="text-text-muted">
                      {row.discovered && `· ${t('srcDiscovered')} `}
                      {c && `· ${t('srcCatalog')} `}
                      {row.saved && `· ${t('srcSaved')} `}
                      {row.custom && `· ${t('srcCustom')}`}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onProbe(row.id)}
                    disabled={!canProbe(state, row.id)}
                    title={!canProbe(state, row.id) && !state.saving ? t('needKey') : undefined}
                    className="rounded-md bg-bg-card px-2 py-1 text-xs disabled:opacity-50"
                    data-probe={row.id}
                  >
                    {probe?.status === 'running' ? t('testing') : t('probe')}
                  </button>
                </div>
                {c && (
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {t('context', { n: tokens(c.context) })} · {t('output', { n: tokens(c.output) })}
                    {c.reasoning && ` · ${t('reasoning')}`}
                    {c.structured_output && ` · ${t('json')}`}
                    {c.price && ` · ${t('price', { input: yuan(c.price.input), output: yuan(c.price.output) })}${c.price.reference ? `（${t('priceReference')}）` : ''}`}
                    {c.hint && ` · ${c.hint}`}
                  </div>
                )}
                {probe && probe.status !== 'running' && (
                  <div className={`mt-0.5 text-[11px] ${probe.status === 'ok' ? 'text-accent' : 'text-warn'}`} data-probe-result={row.id}>
                    {probe.status === 'ok' ? t('probeOk', { ms: Math.round(probe.latency_ms ?? 0) }) : t('probeFailed', { reason: reason(probe.failure, probe.error) })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <input
            value={custom}
            disabled={locked}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = custom.trim(); if (v) { dispatch({ type: 'selectModel', model: v }); setCustom(''); } } }}
            placeholder={t('customModel')}
            className="min-w-0 flex-1 rounded-md bg-bg-card px-3 py-1.5 text-sm"
            aria-label={t('customModel')}
          />
          <button type="button" disabled={locked || !custom.trim()} onClick={() => { const v = custom.trim(); if (v) { dispatch({ type: 'selectModel', model: v }); setCustom(''); } }} className="rounded-md bg-bg-card px-3 py-1.5 text-xs disabled:opacity-50">
            {t('addCustom')}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave(state)}
          title={!canSave(state) && !state.saving ? (state.draft.model ? t('needKey') : t('needModel')) : undefined}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
          data-save
        >
          {state.saving ? t('saving') : t('save')}
        </button>
        {state.saveError && <span className="text-xs text-warn" role="alert">{t('saveFailed', { reason: reason(undefined, state.saveError) })}</span>}
      </div>

      <p className="text-[11px] leading-relaxed text-text-muted">{t('description')}</p>
    </div>
  );
}
