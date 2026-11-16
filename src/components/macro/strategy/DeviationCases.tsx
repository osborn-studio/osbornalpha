'use client';
// Deviation cases (spec §3.2, §6.4; judgment layer on only): settled misses of macro_regime@v2 with the per-input
// differences between registration and settlement. No narrative; unchanged rows folded; an incomplete enumeration says
// so.
import { useState } from 'react';
import { Button, Panel, Tag } from '@/components/ui';
import type { Region } from '@/lib/macro/strategy/contract';
import type { DeviationsResponse } from '@/lib/macro/strategy/route-helpers';
import { DependencyState } from './DependencyState';
import { deviationRows, strategyApi } from './strategy-view-model';
import { useStrategyFetch } from './use-strategy-fetch';
import { useStrategyT } from './use-strategy-t';

export function DeviationCases({ region }: { region: Region }) {
  const { t } = useStrategyT();
  const { state, reload } = useStrategyFetch<DeviationsResponse>(strategyApi.deviations(region));
  const [showUnchanged, setShowUnchanged] = useState(false);
  if (state.kind === 'judgments_disabled' || state.kind === 'disabled') return null;
  if (state.kind === 'loading') return <DependencyState kind="loading" />;
  if (state.kind === 'judgments_unavailable') return <DependencyState kind="judgments_unavailable" onRetry={reload} />;
  if (state.kind !== 'ok') return <DependencyState kind="error" code={state.kind === 'error' ? state.code : state.kind} onRetry={reload} />;
  const { cases, incomplete } = state.data;
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('deviation.title')} <span className="text-xs font-normal text-text-dim">{t('deviation.subtitle')}</span></h2>
        <Button variant="ghost" size="sm" aria-pressed={showUnchanged} onClick={() => setShowUnchanged((v) => !v)}>{showUnchanged ? t('deviation.hideUnchanged') : t('deviation.showUnchanged')}</Button>
      </div>
      {incomplete ? <p role="status" className="text-xs text-warn">{t('deviation.incomplete')}</p> : null}
      {cases.length === 0 ? <p className="text-xs text-text-dim">{t('deviation.none')}</p> : null}
      {cases.map((c) => {
        const d = deviationRows(c, showUnchanged);
        return (
          <section key={c.judgment_id} className="space-y-1 rounded border border-border p-2">
            <div className="flex flex-wrap gap-3 text-xs">
              <span><span className="text-text-dim">{t('deviation.selected')}</span> {t(`regime.${c.selected}`)}</span>
              <span><span className="text-text-dim">{t('deviation.realized')}</span> {c.realized ? t(`regime.${c.realized}`) : '—'}</span>
              <span className="font-mono">{t('deviation.asOf', { date: c.as_of.slice(0, 10) })}</span>
              <Tag>{t(`deviation.evidence.${c.evidence_state}`)}</Tag>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-text-dim">
                    {(['series', 'period', 'role', 'kind', 'registered', 'settled'] as const).map((k) => <th key={k} className="px-1.5 py-1 font-medium">{t(`deviation.columns.${k}`)}</th>)}
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {d.rows.map((r) => (
                    <tr key={r.key} className="border-t border-border">
                      <td className="px-1.5 py-1">{r.series}</td>
                      <td className="px-1.5 py-1">{r.period}</td>
                      <td className="px-1.5 py-1 font-sans">{t(r.roleKey)}</td>
                      <td className="px-1.5 py-1 font-sans"><Tag>{t(r.kindKey)}{r.subkindKey ? ` · ${t(r.subkindKey)}` : ''}</Tag></td>
                      <td className="px-1.5 py-1">{r.registered}</td>
                      <td className="px-1.5 py-1">{r.settled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.hiddenUnchanged > 0 ? <p className="text-[10px] text-text-dim">{t('deviation.unchangedHidden', { n: d.hiddenUnchanged })}</p> : null}
          </section>
        );
      })}
      <p className="text-[10px] text-text-dim">{t('deviation.noNarrative')}</p>
    </Panel>
  );
}
