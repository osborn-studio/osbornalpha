'use client';
// CorrelationWorkbench — 关联工作台 form (spec §3.4): indicator × asset × mode × window × lag (or ±N). Presets only fill
// the form. request_id is generated client-side and reused while a network failure is retried (idempotent run).
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { SeriesOption } from '@/lib/macro/workbench-options';
import { PRESETS, type PresetForm } from './correlation-presets';
import { CorrelationResult, type RunJson } from './CorrelationResult';
import { useMacroT } from './use-macro-t';
import { pick } from './view-model';

const KNOWN_ERRORS = new Set(['quota_exceeded', 'insufficient_sample', 'zero_variance', 'non_positive_price', 'no_events', 'invalid_inputs', 'input_truncated', 'unauthorized', 'read_failed', 'write_failed']);
const field = 'w-full rounded-md border border-border bg-bg-card px-2 py-1.5 text-sm';

export function CorrelationWorkbench({ options, region }: { options: { indicators: SeriesOption[]; assets: SeriesOption[] }; region: 'US' | 'CN' }) {
  const { t, locale } = useMacroT();
  const [form, setForm] = useState<PresetForm>((PRESETS.find((p) => p.region === region) ?? PRESETS[0]).form);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunJson | null>(null);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const set = (patch: Partial<PresetForm>) => { setForm((f) => ({ ...f, ...patch })); setRun(null); setError(null); };
  const errorText = (code: string) => (KNOWN_ERRORS.has(code) ? t(`correlation.errors.${code}`) : t('correlation.errors.unknown', { code }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setRun(null);
    const body: PresetForm = form.kind === 'event_window' ? { ...form, lag: 0, event_n: form.event_n ?? 6 } : { kind: form.kind, indicator_id: form.indicator_id, asset_id: form.asset_id, lag: form.lag, window: form.window };
    const signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    try {
      const r = await fetch('/api/macro/analyses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, request_id: attempt.current.id }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const code: string = j?.error?.code ?? `http_${r.status}`;
        setError(code === 'invalid_parameter'
          ? t('correlation.errors.invalid_parameter', { fields: (j?.error?.fields ?? []).map((x: { field: string; code: string }) => `${x.field}:${x.code}`).join(', ') })
          : errorText(code));
        if (j?.runId) attempt.current = null;
        return;
      }
      attempt.current = null;
      const rr = await fetch(`/api/macro/analyses/${j.runId}`);
      const jj = await rr.json().catch(() => null);
      if (rr.ok && jj?.run) setRun(jj.run as RunJson); else setError(t('correlation.result.loadFailed'));
    } catch {
      setError(t('states.loadFailed', { code: 'network' }));
    } finally {
      setBusy(false);
    }
  }

  const label = (o: SeriesOption) => `${o.region} · ${pick(o.name, locale)}`;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t('correlation.title')}</h2>
        <p className="text-xs text-text-dim">{t('correlation.subtitle')}</p>
      </div>
      <div className="card-base space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-text-dim">{t('correlation.presets')}</div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => set(p.form)} className="rounded border border-border px-2 py-1 text-[11px] text-text-dim hover:text-text">
              {t(`correlation.presetNames.${p.id}`)}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-text-dim">{t('correlation.presetHint')}</div>
      </div>
      <form onSubmit={submit} className="card-base grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.indicator')}</span>
          <select className={field} value={form.indicator_id} onChange={(e) => set({ indicator_id: e.target.value })}>
            {options.indicators.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.asset')}</span>
          <select className={field} value={form.asset_id} onChange={(e) => set({ asset_id: e.target.value })}>
            {options.assets.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.mode')}</span>
          <select className={field} value={form.kind} onChange={(e) => set({ kind: e.target.value as PresetForm['kind'] })}>
            {(['change', 'level', 'rolling', 'event_window'] as const).map((k) => <option key={k} value={k}>{t(`correlation.modes.${k}`)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.window')}</span>
          <select className={field} value={form.window} onChange={(e) => set({ window: e.target.value as PresetForm['window'] })}>
            {(['5y', '10y', 'all'] as const).map((w) => <option key={w} value={w}>{t(`correlation.windows.${w}`)}</option>)}
          </select>
        </label>
        {form.kind === 'event_window' ? (
          <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.eventN')}</span>
            <select className={field} value={form.event_n ?? 6} onChange={(e) => set({ event_n: Number(e.target.value) as 3 | 6 | 12 })}>
              {([3, 6, 12] as const).map((n) => <option key={n} value={n}>±{n}</option>)}
            </select>
          </label>
        ) : (
          <label className="space-y-1 text-xs"><span className="text-text-dim">{t('correlation.lag')}</span>
            <input type="number" min={-12} max={12} step={1} className={`${field} font-mono`} value={form.lag} onChange={(e) => set({ lag: Math.max(-12, Math.min(12, Math.trunc(Number(e.target.value) || 0))) })} />
            <span className="block text-[11px] text-text-dim">{t('correlation.lagHelp')}</span>
          </label>
        )}
        <div className="flex flex-col justify-end gap-1">
          <button type="submit" disabled={busy} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black disabled:opacity-50">
            {busy ? t('correlation.submitting') : t('correlation.submit')}
          </button>
          <span className="text-[11px] text-text-dim">{t('correlation.gateNote')}</span>
        </div>
      </form>
      {error && <div role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] px-3 py-2 text-xs">{error}</div>}
      {run && (
        <>
          <CorrelationResult run={run} />
          <Link href={`/intel/macro/analyses/${run.run_id}`} className="text-xs text-accent">{t('correlation.result.openRun')}</Link>
        </>
      )}
    </div>
  );
}
