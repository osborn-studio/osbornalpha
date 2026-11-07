'use client';
// SourceDrawer — 证据抽屉 (spec §3.2, canvas SourceDrawer): source, proof and revision history for one value.
// Fetches /api/macro/series/[id]/versions. A field that cannot be shown keeps its name and reads 缺失. Derived values
// show their transform and the proof of each input. Read failure never hides the published value.
import { useEffect, useRef, useState } from 'react';
import type { MacroT } from './use-macro-t';
import { isMissingInput, proofRows, revisionRows, selectVersion, sourceRows, type DrawerRow, type Locale, type SourceJson, type VersionsJson } from './view-model';

/** observationId = the exact version on screen (overview manifest row or detail row); the proof shown is that version's (第 4 稿 P1-9). */
export interface DrawerTarget { seriesId: string; observationId: string | null; name: string; periodEnd: string; display: string; unit: string; source: SourceJson | null }

function Rows({ rows }: { rows: DrawerRow[] }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <dt className="text-text-dim">{r.label}</dt>
          <dd className={`break-all ${r.mono ? 'font-mono text-[11px]' : ''} ${r.missing ? 'text-warn' : ''}`}>
            {r.href ? <a href={r.href} target="_blank" rel="noreferrer" className="text-text underline decoration-dotted">{r.value}</a> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SourceDrawer({ target, onClose, t, locale }: { target: DrawerTarget | null; onClose: () => void; t: MacroT; locale: Locale }) {
  const [state, setState] = useState<{ data: VersionsJson | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    fetch(`/api/macro/series/${encodeURIComponent(target.seriesId)}/versions?period_end=${encodeURIComponent(target.periodEnd)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.code ?? `http_${r.status}`);
        return body as VersionsJson;
      })
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((e: Error) => { if (!cancelled) setState({ data: null, error: e.message, loading: false }); });
    return () => { cancelled = true; };
  }, [target]);
  // Focus moves into the dialog on open and returns to the element that opened it on close.
  const dialogRef = useRef<HTMLElement>(null);
  const open = target !== null;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => { if (opener && opener.isConnected) opener.focus(); };
  }, [open]);
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);
  if (!target) return null;
  // the proof belongs to the displayed version, never simply the newest; other versions stay in the revision table
  const latest = state.data ? selectVersion(state.data.versions, target.observationId) : null;
  const section = 'border-t border-border px-4 py-3 space-y-2';
  const cap = 'text-[10px] uppercase tracking-wider text-text-dim';
  return (
    <aside ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label={`${t('drawer.title')} · ${target.name}`} className="fixed inset-y-0 right-0 z-40 w-full max-w-[560px] overflow-y-auto border-l border-border bg-bg-elevated shadow-none focus:outline-none">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className={cap}>{t('drawer.title')}</div>
          <h2 className="text-base font-semibold">{target.name} <span className="font-mono">{target.display}</span></h2>
          <div className="font-mono text-[11px] text-text-dim">{target.seriesId} · {target.periodEnd}</div>
        </div>
        <button type="button" aria-label={t('drawer.close')} onClick={onClose} className="ml-auto h-8 w-8 rounded border border-border text-text-dim">×</button>
      </div>
      <div className={section}>
        <div className={cap}>{t('drawer.sourceSection')}</div>
        <Rows rows={sourceRows(target.source, t, locale)} />
      </div>
      <div className={section}>
        <div className={cap}>{t('drawer.proofSection')}</div>
        {state.loading && <div className="text-xs text-text-dim">{t('drawer.loading')}</div>}
        {(state.error || (state.data && !latest)) && <div className="rounded-md border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] p-2 text-xs">{t('drawer.loadFailed')}</div>}
        {latest && (latest.derived_from ? (
          <>
            <Rows rows={proofRows(latest, t).filter((r) => r.key === 'transform' || r.key === 'available' || r.key === 'codeVersion')} />
            <div className="text-xs text-text-dim">{t('drawer.derivedFrom', { count: latest.inputs.length })}</div>
            {latest.inputs.map((input) => (
              <div key={input.observation_id} className="rounded-md border border-border p-2">
                <div className="mb-1 font-mono text-[11px] text-text-dim">{t('drawer.input', { id: isMissingInput(input) ? input.observation_id : `${input.series_id} · v${input.version}` })}</div>
                {isMissingInput(input) ? <div className="text-xs text-warn">{t('drawer.inputMissing')}</div> : <Rows rows={proofRows(input, t)} />}
              </div>
            ))}
          </>
        ) : <Rows rows={proofRows(latest, t)} />)}
        <div className="text-[11px] text-text-dim">{t('drawer.basis')}</div>
      </div>
      <div className={section}>
        <div className={cap}>{t('drawer.revisions')}</div>
        {state.data && (state.data.versions.length <= 1 ? (
          <div className="rounded-md border border-dashed border-border p-2 text-xs text-text-dim">{t('drawer.noRevisions')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-text-dim">
                <th className="py-1 font-medium">{t('drawer.version')}</th>
                <th className="py-1 text-right font-medium">{t('drawer.value')}</th>
                <th className="py-1 font-medium">{t('drawer.available')}</th>
                <th className="py-1 font-medium">{t('drawer.note')}</th>
              </tr>
            </thead>
            <tbody>
              {revisionRows(state.data.versions, t, target.unit, target.observationId).map((r) => (
                <tr key={r.version} aria-current={r.current ? 'true' : undefined} className={`border-t border-border ${r.current ? '' : 'text-text-dim'}`}>
                  <td className="py-1 font-mono">{r.version}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{r.value}</td>
                  <td className="py-1 font-mono tabular-nums">{r.available}</td>
                  <td className="py-1">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </aside>
  );
}
