'use client';
// Policy action episodes × asset interval changes (spec §3.4, §5.5): boundary switch with its definition, episode
// header (direction, effective dates, upper bound from → to, cumulative bp, event count, left-censored / ongoing / data
// gap), cells with change and "from (date) → to (date)", the endpoint evidence drawer, a per-column median chart with a
// table toggle, and the first_seen footer. Below sm the table becomes one list per column.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { Boundary, CycleTableView, ObsRef } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer, ObsRefTable } from './EvidencePairDrawer';
import { MISSING, barGeometry, columnMedians, cycleCell, cycleCellOf, cycleGroups, cycleScale, episodeView, episodesEmptyKey, formatRaw, shortId, strategyApi, toneClass, toneLevel } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

const BOUNDARIES: readonly Boundary[] = ['event_day', 'first_trading_day', 'month_end'];

export function CycleReturnsTable({ view, boundary, onBoundary }: { view: CycleTableView; boundary: Boundary; onBoundary: (b: Boundary) => void }) {
  const { t, locale } = useStrategyT();
  const [drill, setDrill] = useState<{ title: string; refs: ObsRef[] } | null>(null);
  const [mediansAsTable, setMediansAsTable] = useState(false);
  const medians = columnMedians(view);
  return (
    <div className="space-y-3">
      <Panel className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('history.title')} <span className="text-xs font-normal text-text-dim">{t('history.subtitle')}</span></h2>
          <div className="flex items-center gap-1" role="group" aria-label={t('history.boundaryLabel')}>
            {BOUNDARIES.map((b) => (
              <Button key={b} size="sm" variant={b === boundary ? 'primary' : 'secondary'} aria-pressed={b === boundary} onClick={() => onBoundary(b)}>{t(`history.boundary.${b}`)}</Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-dim">{t(`history.boundaryDef.${view.boundary}`)}</p>
        <p className="text-[11px] text-text-dim">{t('history.coverageNote')}</p>
        {view.gaps.length > 0 ? (
          <ul className="text-[11px] text-text-dim">{view.gaps.map((g) => <li key={`${g.kind}:${g.near}`}>{t('history.gaps')}：{g.near} · {g.reason}</li>)}</ul>
        ) : null}
      </Panel>
      <Panel>
        {episodesEmptyKey(view) ? <p role="status" className="text-xs text-text-dim">{t(episodesEmptyKey(view)!)}</p> : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-text-dim">
                    <th className="px-1.5 py-1 text-left font-medium">{t('history.episode')}</th>
                    {view.columns.map((c) => <th key={c.id} className="px-1.5 py-1 font-medium">{c.label[locale]} {c.change_kind === 'pct' ? '%' : 'bp'}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {view.episodes.map((e) => {
                    const ev = episodeView(e, t);
                    return (
                      <tr key={ev.key} className="border-t border-border">
                        <th scope="row" className="px-1.5 py-2 text-left font-normal">
                          <div><b className="font-semibold">{ev.direction}</b> <span className="font-mono tabular-nums">{ev.dates}</span></div>
                          <div className="font-mono text-[10px] tabular-nums text-text-dim">{ev.line}</div>
                          {ev.flags.length > 0 ? <div className="mt-0.5 flex flex-wrap gap-1">{ev.flags.map((f) => <Tag key={f} tone="accent">{t(f)}</Tag>)}</div> : null}
                        </th>
                        {view.columns.map((col) => {
                          const c = cycleCell(cycleCellOf(view, e, col.id), t);
                          const body = (
                            <>
                              <div className="font-mono tabular-nums">{c.main}</div>
                              {c.sub ? <div className="font-mono text-[10px] tabular-nums text-text-dim">{c.sub}</div> : null}
                            </>
                          );
                          return (
                            <td key={col.id} className={`px-1.5 py-2 text-right ${toneClass(c.tone, toneLevel(c.raw, cycleScale(view, col.id)))}`}>
                              {c.drill ? (
                                <button type="button" className="w-full text-right hover:underline" onClick={() => setDrill({ title: t('history.cellTitle', { episode: `${ev.direction} ${ev.dates}`, column: col.label[locale] }), refs: c.refs })}>{body}</button>
                              ) : body}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 sm:hidden">
              {cycleGroups(view, t, locale).map((g) => (
                <section key={g.id} className="rounded border border-border p-2">
                  <h3 className="text-xs font-semibold">{g.label}</h3>
                  <ul className="mt-1 space-y-1 text-xs">
                    {g.rows.map((r) => (
                      <li key={r.key} className="flex justify-between gap-2">
                        <span className="font-mono text-[11px] tabular-nums">{r.episode}</span>
                        <span className="text-right"><span className="font-mono tabular-nums">{r.cell.main}</span>{r.cell.sub ? <span className="block text-[10px] text-text-dim">{r.cell.sub}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </Panel>
      <Panel className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('history.medians')} <span className="text-xs font-normal text-text-dim">{t('history.mediansNote')}</span></h2>
          <Button variant="ghost" size="sm" aria-pressed={mediansAsTable} onClick={() => setMediansAsTable((v) => !v)}>{mediansAsTable ? t('view.chart') : t('view.table')}</Button>
        </div>
        {mediansAsTable ? (
          <table className="w-full max-w-[420px] text-xs">
            <tbody className="font-mono tabular-nums">
              {medians.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-1.5 py-1 font-sans">{c.label[locale]}</td>
                  <td className="px-1.5 py-1 text-right">{t('history.medianLine', { value: c.median === null ? MISSING : formatRaw(c.median, c.kind), n: c.n })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <svg viewBox={`0 0 440 ${Math.max(1, medians.length) * 24}`} className="w-full max-w-[440px]" role="img" aria-label={t('history.medians')}>
            {medians.map((c, i) => {
              const g = barGeometry(c.median, c.scaleMax, 50);
              const y = i * 24;
              return (
                <g key={c.id}>
                  <text x={0} y={y + 15} fontSize={11} fill="var(--text-dim)">{c.label[locale]}</text>
                  <line x1={170} x2={170} y1={y + 2} y2={y + 22} stroke="var(--border)" />
                  <rect x={120 + g.x} y={y + 6} width={g.width} height={12} fill={c.median !== null && c.median < 0 ? 'var(--down)' : 'var(--up)'} fillOpacity={0.55} />
                  <text x={240} y={y + 15} fontSize={11} fill="var(--text)" fontFamily="var(--font-mono)">
                    {t('history.medianLine', { value: c.median === null ? MISSING : formatRaw(c.median, c.kind), n: c.n })}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </Panel>
      <p className="text-[11px] text-text-dim">
        {t('history.footer')} · <a className="text-accent hover:underline" href={strategyApi.manifest(view.manifest_id)}>{t('meta.manifest', { id: shortId(view.manifest_id) })}</a> · {view.version} · {view.episodes_version}
      </p>
      <EvidencePairDrawer open={drill !== null} title={drill?.title ?? ''} onClose={() => setDrill(null)}>
        {drill ? <ObsRefTable refs={drill.refs} /> : null}
      </EvidencePairDrawer>
    </div>
  );
}
