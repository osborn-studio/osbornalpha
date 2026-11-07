'use client';
// Fed policy → US/CN asset response matrix (spec §3.3, §5.3): rows hike / cut / QE·QT, columns are dimensions with
// their real coverage in the header, cells give the median with type-7 quartiles and n (n < 5 → per-event only), asset
// moves washed by sign in three levels. A cell opens the per-event drawer (selected and excluded events with reasons).
// Below sm the table becomes one list per column.
import { useMemo, useState } from 'react';
import { Button, Panel } from '@/components/ui';
import type { Cell, PolicyResponseView, ResponseDim } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer } from './EvidencePairDrawer';
import { cellEvents, cellOf, coverageText, dimLabel, eventRows, matrixCell, matrixGroups, matrixScale, toneClass, toneLevel, uniformReason } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

const WINDOWS = [1, 3, 6] as const;

export function PolicyResponseMatrix({ view, window, onWindow }: { view: PolicyResponseView; window: 1 | 3 | 6; onWindow: (w: 1 | 3 | 6) => void }) {
  const { t, locale } = useStrategyT();
  const [drill, setDrill] = useState<{ direction: string; dim: ResponseDim; cell: Cell } | null>(null);
  const scale = useMemo(() => matrixScale(view), [view]);
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('matrix.title')} <span className="text-xs font-normal text-text-dim">{t('matrix.subtitle')}</span></h2>
        <div className="flex items-center gap-1" role="group" aria-label={t('matrix.windowLabel')}>
          {WINDOWS.map((w) => (
            <Button key={w} size="sm" variant={w === window ? 'primary' : 'secondary'} aria-pressed={w === window} onClick={() => onWindow(w)}>
              {t('matrix.window', { n: w })}
            </Button>
          ))}
        </div>
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-right text-text-dim">
              <th className="px-1.5 py-1 text-left font-medium">{t('matrix.policy')}</th>
              {view.dims.map((d) => (
                <th key={d.id} className="px-1.5 py-1 font-medium" title={coverageText(d, t)}>
                  {dimLabel(d, locale)}<div className="text-[10px] font-normal">{coverageText(d, t)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const uniform = uniformReason(row, view.dims, locale);
              return (
                <tr key={row.direction} className="border-t border-border">
                  <th scope="row" className="px-1.5 py-2 text-left font-normal">{t(`matrix.rows.${row.direction}`)}</th>
                  {uniform !== null ? (
                    <td colSpan={view.dims.length} className="px-1.5 py-2 text-left text-text-dim">{t('state.missing')}：{uniform}</td>
                  ) : view.dims.map((d) => {
                    const cell = cellOf(row, d.id);
                    const c = matrixCell(cell, locale, t);
                    const body = (
                      <>
                        <div className="font-mono tabular-nums">{c.main}</div>
                        {c.sub ? <div className="text-[10px] text-text-dim">{c.sub}</div> : null}
                      </>
                    );
                    return (
                      <td key={d.id} className={`px-1.5 py-2 text-right ${toneClass(c.tone, toneLevel(c.raw, scale[d.id] ?? 0))}`}>
                        {c.drill ? (
                          <button type="button" className="w-full text-right hover:underline" onClick={() => setDrill({ direction: row.direction, dim: d, cell })}>{body}</button>
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
        {matrixGroups(view, locale, t).map((g) => (
          <section key={g.id} className="rounded border border-border p-2">
            <h3 className="text-xs font-semibold">{g.label}</h3>
            <p className="text-[10px] text-text-dim">{g.coverage}</p>
            <ul className="mt-1 space-y-1 text-xs">
              {g.rows.map((r) => (
                <li key={r.direction} className="flex justify-between gap-2">
                  <span>{t(`matrix.rows.${r.direction}`)}</span>
                  <span className="text-right"><span className="font-mono tabular-nums">{r.cell.main}</span>{r.cell.sub ? <span className="block text-[10px] text-text-dim">{r.cell.sub}</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-[11px] text-text-dim">{t('matrix.footer')}</p>
      {view.sentences.map((s, i) => <p key={i} className="text-xs text-text-dim">{s[locale]}</p>)}
      <EvidencePairDrawer
        open={drill !== null}
        title={drill ? t('matrix.drawerTitle', { direction: t(`matrix.rows.${drill.direction}`), dim: drill.dim.label[locale], n: view.window }) : ''}
        onClose={() => setDrill(null)}
      >
        {drill ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-dim">
                  {(['date', 'changeBp', 'base', 'end', 'change', 'status'] as const).map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`matrix.columns.${k}`)}</th>)}
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {eventRows(cellEvents(drill.cell), drill.dim.unit).map((e) => (
                  <tr key={e.key} className={`border-t border-border ${e.selected ? '' : 'text-text-dim'}`}>
                    <td className="px-1.5 py-1">{e.date}</td>
                    <td className="px-1.5 py-1">{e.changeBp}</td>
                    <td className="px-1.5 py-1">{e.base}</td>
                    <td className="px-1.5 py-1">{e.end}</td>
                    <td className="px-1.5 py-1">{e.change}</td>
                    <td className="px-1.5 py-1 font-sans">{e.selected ? t('matrix.selected') : `${t('matrix.excluded')}：${e.exclusionKey ? t(e.exclusionKey) : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </EvidencePairDrawer>
    </Panel>
  );
}
