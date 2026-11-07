'use client';
// Live transmission flow (spec §3.3, §5.1): six stages, text badges for node states (never colour alone), edges are
// mechanism assumptions, derived nodes open their two inputs. Stages stack vertically below lg; a table view lists
// every node.
import Link from 'next/link';
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { NodeView, TransmissionView } from '@/lib/macro/strategy/contract';
import { EvidencePairDrawer, ObsRefTable } from './EvidencePairDrawer';
import { flowRows, nodeDisplay } from './strategy-view-model';
import { useStrategyT } from './use-strategy-t';

export function TransmissionFlow({ view }: { view: TransmissionView }) {
  const { t, locale } = useStrategyT();
  const [table, setTable] = useState(false);
  const [open, setOpen] = useState<NodeView | null>(null);
  const openDisplay = open ? nodeDisplay(open, locale) : null;
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('flow.title')}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-dim">{t('flow.legend')}</span>
          <Button variant="ghost" size="sm" aria-pressed={table} onClick={() => setTable((v) => !v)}>
            {table ? t('view.flow') : t('view.table')}
          </Button>
        </div>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-dim">
                {(['stage', 'node', 'state', 'value', 'period', 'reason'] as const).map((k) => (
                  <th key={k} className="px-1.5 py-1 font-medium">{t(`flow.columns.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flowRows(view, locale).map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-1.5 py-1">{r.stage}</td>
                  <td className="px-1.5 py-1">{r.node}</td>
                  <td className="px-1.5 py-1">{t(r.stateKey)}</td>
                  <td className="px-1.5 py-1 font-mono tabular-nums">{r.value}</td>
                  <td className="px-1.5 py-1 font-mono tabular-nums">{r.period}</td>
                  <td className="px-1.5 py-1 text-text-dim">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          {view.stages.map((s, i) => (
            <li key={s.stage} className="space-y-2">
              <div className="text-[11px] text-text-dim">{i + 1}. {s.label[locale]}</div>
              {s.nodes.map((n) => <NodeCard key={n.id} node={n} onOpen={setOpen} />)}
              {s.edge ? <p className="text-[11px] text-text-dim">{t('flow.edge', { text: s.edge.text[locale] })}</p> : null}
            </li>
          ))}
        </ol>
      )}
      <EvidencePairDrawer open={open !== null} title={openDisplay ? t('flow.derivedTitle', { label: openDisplay.label }) : ''} onClose={() => setOpen(null)}>
        {open && openDisplay ? (
          <div className="space-y-2">
            {openDisplay.formula ? <p className="font-mono text-sm tabular-nums">{openDisplay.formula}{openDisplay.unit}</p> : null}
            {openDisplay.reason ? <p className="text-xs text-text-dim">{openDisplay.reason}</p> : null}
            <p className="text-[11px] text-text-dim">{t('flow.formulaNote')}</p>
            <ObsRefTable refs={open.inputs} />
          </div>
        ) : null}
      </EvidencePairDrawer>
    </Panel>
  );
}

function NodeCard({ node, onOpen }: { node: NodeView; onOpen: (n: NodeView) => void }) {
  const { t, locale } = useStrategyT();
  const d = nodeDisplay(node, locale);
  return (
    <div className={`rounded p-2 ${d.dashed ? 'border border-dashed border-border' : 'bg-bg-card'}`}>
      <Tag>{t(d.badgeKey)}</Tag>
      <div className="mt-1 text-xs">{d.label}</div>
      {d.value !== null ? <div className="font-mono text-[15px] tabular-nums">{d.value}{d.unit}</div> : null}
      {d.formula ? <div className="font-mono text-[10px] tabular-nums text-text-dim">{d.formula}</div> : null}
      {d.period ? <div className="font-mono text-[10px] text-text-dim">{d.period}</div> : null}
      {d.reason ? <div className="text-[10px] text-text-dim">{d.reason}</div> : null}
      {d.drill || d.seriesId ? (
        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
          {d.drill ? <button type="button" className="text-accent hover:underline" onClick={() => onOpen(node)}>{t('flow.openDerived')}</button> : null}
          {d.seriesId ? <Link className="text-accent hover:underline" href={`/intel/macro/${d.seriesId}`}>{t('flow.openSeries')}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
