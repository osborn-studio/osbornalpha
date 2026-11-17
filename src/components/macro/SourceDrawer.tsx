'use client';
// SourceDrawer — 证据抽屉 (spec §3.2, canvas SourceDrawer): source, proof and revision history for one value.
// Fetches /api/macro/series/[id]/versions. A field that cannot be shown keeps its name and reads 缺失. Derived values
// show their transform and the proof of each input. Read failure never hides the published value.
import { useEffect, useState } from 'react';
import {SourceDrawer as SharedSourceDrawer} from '../research-ui';
import {macroDrawerInput, macroDrawerText} from './source-drawer-adapter';
import type { MacroT } from './use-macro-t';
import { isMissingInput, proofRows, selectVersion, type DrawerRow, type Locale, type SourceJson, type VersionsJson } from './view-model';

/** observationId = the exact version on screen (overview manifest row or detail row); the proof shown is that version's (第 4 稿 P1-9). */
export interface DrawerTarget { seriesId: string; observationId: string | null; name: string; periodEnd: string; display: string; unit: string; source: SourceJson | null }

function Rows({ rows }: { rows: DrawerRow[] }) {
  return (
    <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <dt className="text-text-dim">{r.label}</dt>
          <dd className={`break-all ${r.mono ? 'font-mono tabular-nums text-[11px]' : ''} ${r.missing ? 'text-warn' : ''}`}>
            {r.href ? <a href={r.href} target="_blank" rel="noreferrer" className="text-text underline decoration-dotted">{r.value}</a> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SourceDrawer({ target, onClose, t, locale }: { target: DrawerTarget | null; onClose: () => void; t: MacroT; locale: Locale }) {
  const [state, setState] = useState<{ target: DrawerTarget | null; data: VersionsJson | null; error: string | null; loading: boolean }>({ target: null, data: null, error: null, loading: false });
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setState({ target, data: null, error: null, loading: true });
    fetch(`/api/macro/series/${encodeURIComponent(target.seriesId)}/versions?period_end=${encodeURIComponent(target.periodEnd)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error?.code ?? `http_${r.status}`);
        return body as VersionsJson;
      })
      .then((data) => { if (!cancelled) setState({ target, data, error: null, loading: false }); })
      .catch((e: Error) => { if (!cancelled) setState({ target, data: null, error: e.message, loading: false }); });
    return () => { cancelled = true; };
  }, [target]);
  const active = state.target === target;
  const loading = target !== null && (!active || state.loading);
  const data = active ? state.data : null;
  const latest = data && target ? selectVersion(data.versions, target.observationId) : null;
  const failed = active && (state.error !== null || (data !== null && latest === null));
  const derived = latest?.derived_from ? <>
    <div className="text-xs text-text-dim">{t('drawer.derivedFrom', {count: latest.inputs.length})}</div>
    {latest.inputs.map(input => <div key={input.observation_id} className="rounded-md border border-border p-2">
      <div className="mb-1 font-mono tabular-nums text-[11px] text-text-dim">{t('drawer.input', {id: isMissingInput(input) ? input.observation_id : `${input.series_id} · v${input.version}`})}</div>
      {isMissingInput(input) ? <div className="text-xs text-warn">{t('drawer.inputMissing')}</div> : <Rows rows={proofRows(input, t)} />}
    </div>)}
  </> : undefined;
  return <SharedSourceDrawer
    input={target ? macroDrawerInput(target, latest, data?.versions ?? null, t, locale) : null}
    onClose={onClose}
    text={target ? macroDrawerText(target, t, locale) : undefined}
    pending={loading ? ['source','times','transform'] : []}
    failed={failed ? ['source','times','transform'] : []}
    failedText={t('drawer.loadFailed')}
    slots={{transform: derived}}
  />;
}
