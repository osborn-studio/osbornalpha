'use client';
// IndicatorDetail — 指标详情 (spec §3.3): current value → typed change → period → availability + basis → chart with
// cycle bands and event markers (with a table view) → cycles and events → asset moves per cycle (up/down colours for
// assets only) → method → source, evidence and revisions (drawer). `compact` (overview preview) keeps the facts and
// the chart/table only.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DataTableToggle } from './charts/DataTableToggle';
import { MacroLineChart } from './charts/MacroLineChart';
import { assetChangeView, bandsOf, chartPoints, cycleKey, diffRows, markersOf, sourceJsonOf, windowFrom, type DetailWindow } from './detail-model';
import { MISSING, formatInstant, formatPeriod, formatValueText, typedChange, unitSuffix } from './macro-format';
import { SourceDrawer, type DrawerTarget } from './SourceDrawer';
import { useMacroT } from './use-macro-t';
import { pick, type SeriesJson } from './view-model';

const WINDOWS: DetailWindow[] = ['y3', 'y5', 'y10', 'all'];
const cell = 'py-1 pr-3';

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-text-dim">{label}</dt>
      <dd className="font-mono text-base tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-text-dim">{note}</dd>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card-base space-y-2"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>;
}

export function IndicatorDetail({ seriesId, compact = false }: { seriesId: string; compact?: boolean }) {
  const { t, locale } = useMacroT();
  const [win, setWin] = useState<DetailWindow>('y5');
  const [mode, setMode] = useState<'level' | 'diff'>('level');
  const [state, setState] = useState<{ data: SeriesJson | null; error: string | null }>({ data: null, error: null });
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const from = useMemo(() => windowFrom(win, new Date().toISOString().slice(0, 10)), [win]);
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null });
    fetch(`/api/macro/series/${encodeURIComponent(seriesId)}${from ? `?from=${from}` : ''}`)
      .then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error?.code ?? `http_${r.status}`); return b as SeriesJson; })
      .then((data) => { if (!cancelled) setState({ data, error: null }); })
      .catch((e: Error) => { if (!cancelled) setState({ data: null, error: e.message }); });
    return () => { cancelled = true; };
  }, [seriesId, from]);
  const d = state.data;
  const rows = useMemo(() => (d ? diffRows(d.observations, d.def.changeKind) : []), [d]);
  const points = useMemo(() => (d ? chartPoints(d.observations, mode, d.def.changeKind) : []), [d, mode]);
  const bands = useMemo(() => (d ? bandsOf(d.cycles) : []), [d]);
  const markers = useMemo(() => (d && d.observations.length > 0 ? markersOf(d.events, d.calendar, d.observations[0].period_end) : []), [d]);
  if (state.error) return <div className="card-base text-xs text-text-dim">{t('states.loadFailed', { code: state.error })}</div>;
  if (!d) return <div className="text-xs text-text-dim">{t('states.loading')}</div>;

  const def = d.def;
  const name = pick(def.name, locale);
  const unit = unitSuffix(def.unit);
  const cur = d.observations.at(-1) ?? null;
  const prev = d.observations.at(-2) ?? null;
  const change = cur && prev ? typedChange(cur.value_text, prev.value_text, def.changeKind) : null;
  const source = sourceJsonOf(def);
  const open = (observationId: string, periodEnd: string, valueText: string) => setDrawer({ seriesId: def.id, observationId, name, periodEnd, display: `${formatValueText(valueText)}${unit}`, source });
  const method = def.derive ? t(`detail.derive.${def.derive.kind}`, { from: def.derive.from }) : def.aliasOf ? t('detail.alias', { from: def.aliasOf }) : t('detail.native');
  const btn = (active: boolean) => `rounded border border-border px-2 py-0.5 text-[11px] ${active ? 'bg-[var(--accent-wash)] text-accent' : 'text-text-dim'}`;

  const obsTable = (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] text-text-dim">
          <th className={cell}>{t('detail.columns.period')}</th><th className={`${cell} text-right`}>{t('detail.columns.value')}</th>
          {mode === 'diff' && <th className={`${cell} text-right`}>{t('detail.columns.diff')}</th>}
          <th className={cell}>{t('detail.columns.available')}</th><th className={cell}>{t('detail.columns.version')}</th>
        </tr></thead>
        <tbody>
          {[...rows].reverse().map((o) => (
            <tr key={o.observation_id} className="border-t border-border">
              <td className={`${cell} font-mono`}>{formatPeriod(o.period_end, def.period)}</td>
              <td className={`${cell} text-right`}><button type="button" onClick={() => open(o.observation_id, o.period_end, o.value_text)} className="border-b border-dotted border-accent font-mono tabular-nums">{formatValueText(o.value_text)}{unit}</button></td>
              {mode === 'diff' && <td className={`${cell} text-right font-mono tabular-nums`}>{o.diff_text === null ? MISSING : formatValueText(o.diff_text)}</td>}
              <td className={`${cell} font-mono tabular-nums`}>{formatInstant(o.available_at)}</td>
              <td className={`${cell} font-mono`}>v{o.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="card-base space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold">{name}</h2>
          <span className="font-mono text-[11px] text-text-dim">{def.id}</span>
          {def.status !== 'active' && <span className="rounded border border-border px-1.5 text-[11px] text-text-dim">{t(`status.${def.status}`)}{def.reason ? `：${pick(def.reason, locale)}` : ''}</span>}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-density="data">
          <Fact label={t('detail.current')} value={cur ? `${formatValueText(cur.value_text)}${unit}` : MISSING} />
          <Fact label={t('detail.change')} value={change ? `${change.arrow} ${change.text}` : MISSING} />
          <Fact label={t('detail.period')} value={cur ? formatPeriod(cur.period_end, def.period) : MISSING} />
          <Fact label={t('detail.available')} value={cur ? formatInstant(cur.available_at) : MISSING} note={t('detail.basis')} />
        </dl>
      </div>

      <section className="card-base space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t('detail.chart')}</h3>
          <div className="ml-auto flex gap-1">{WINDOWS.map((w) => <button key={w} type="button" aria-pressed={win === w} onClick={() => setWin(w)} className={btn(win === w)}>{t(`detail.windows.${w}`)}</button>)}</div>
          <div className="flex gap-1">{(['level', 'diff'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={btn(mode === m)}>{t(`detail.transforms.${m}`)}</button>)}</div>
        </div>
        {points.length === 0
          ? <div className="text-xs text-text-dim">{t('detail.empty')}</div>
          : <DataTableToggle t={t} chart={<MacroLineChart points={points} bands={bands} markers={markers} ariaLabel={t('detail.chartLabel', { name })} />} table={obsTable} />}
        {d.cycles.length > 0 && <div className="text-[11px] text-text-dim">{t('detail.confirmNote')}</div>}
      </section>

      {!compact && (
        <>
          <Section title={t('detail.cycles')}>
            {d.cycles.length === 0 ? <div className="text-xs text-text-dim">{t('states.empty')}</div> : (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('detail.cycleColumns.direction')}</th><th className={cell}>{t('detail.cycleColumns.start')}</th><th className={cell}>{t('detail.cycleColumns.end')}</th><th className={cell}>{t('detail.cycleColumns.confirmed')}</th></tr></thead>
                <tbody>{d.cycles.map((c) => (
                  <tr key={`${c.start}-${c.direction}`} className="border-t border-border">
                    <td className={cell}>{t(cycleKey(c))}</td><td className={`${cell} font-mono`}>{c.start}</td>
                    <td className={`${cell} font-mono`}>{c.ongoing ? t('detail.ongoing') : c.end}</td>
                    <td className={`${cell} font-mono`}>{t('detail.confirmed', { date: c.confirmed_at })}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            {d.insufficient.length > 0 && <div className="text-[11px] text-text-dim">{t('detail.insufficient', { count: d.insufficient.length })}</div>}
          </Section>

          <Section title={t('detail.events')}>
            {d.events.length === 0 && d.calendar.length === 0 ? <div className="text-xs text-text-dim">{t('detail.noEvents')}</div> : (
              <div className="max-h-72 overflow-y-auto">
                <div className="mb-1 text-[11px] text-text-dim">{t('detail.derivedEvent')} · {t('detail.calendarEvent')}</div>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('detail.eventColumns.date')}</th><th className={cell}>{t('detail.eventColumns.kind')}</th><th className={cell}>{t('detail.eventColumns.detail')}</th></tr></thead>
                  <tbody>
                    {[...d.events.map((e) => ({ date: e.effective_date, kind: t('detail.derivedEvent'), detail: `${e.upper_from}→${e.upper_to} / ${e.lower_from}→${e.lower_to} · ${t('detail.eventChange', { change: e.change_bp })}` })),
                      ...d.calendar.map((c) => ({ date: c.start, kind: t('detail.calendarEvent'), detail: `${c.start} – ${c.end}` }))]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((r, i) => <tr key={`${r.date}-${i}`} className="border-t border-border"><td className={`${cell} font-mono`}>{r.date}</td><td className={cell}>{r.kind}</td><td className={`${cell} font-mono`}>{r.detail}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={t('detail.assets')}>
            {d.assetsByCycle.length === 0 ? <div className="text-xs text-text-dim">{t('detail.noAssets')}</div> : (
              <>
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[10px] text-text-dim"><th className={cell}>{t('detail.assetColumns.cycle')}</th><th className={cell}>{t('detail.assetColumns.asset')}</th><th className={cell}>{t('detail.assetColumns.from')}</th><th className={cell}>{t('detail.assetColumns.to')}</th><th className={`${cell} text-right`}>{t('detail.assetColumns.change')}</th></tr></thead>
                  <tbody>{d.assetsByCycle.map((a) => {
                    const c = d.cycles[a.cycle_index]; const v = assetChangeView(a);
                    return (
                      <tr key={`${a.cycle_index}-${a.asset_id}`} className="border-t border-border">
                        <td className={cell}>{c ? `${t(cycleKey(c))} ${c.start}` : a.cycle_index}</td>
                        <td className={cell}>{pick(a.asset_name, locale)}</td>
                        <td className={`${cell} font-mono`}>{a.start_period}</td>
                        <td className={`${cell} font-mono`}>{a.end_period}</td>
                        <td className={`${cell} text-right font-mono tabular-nums ${v.tone === 'up' ? 'text-up' : v.tone === 'down' ? 'text-down' : 'text-text-dim'}`}>{v.text}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                <div className="text-[11px] text-text-dim">{t('detail.assetsNote')}</div>
              </>
            )}
          </Section>

          <Section title={t('detail.method')}>
            <p className="text-xs">{method}</p>
            <p className="text-xs text-text-dim">{t('detail.changeKind', { kind: def.changeKind })} · {d.eventsVersion} · {d.cyclesVersion}</p>
          </Section>

          <Section title={t('detail.sourceTitle')}>
            {cur
              ? <button type="button" onClick={() => open(cur.observation_id, cur.period_end, cur.value_text)} className="rounded border border-border px-3 py-1 text-xs">{t('detail.openDrawer')}</button>
              : <div className="text-xs text-text-dim">{t('detail.empty')}</div>}
          </Section>
        </>
      )}
      <SourceDrawer target={drawer} onClose={closeDrawer} t={t} locale={locale} />
    </div>
  );
}
