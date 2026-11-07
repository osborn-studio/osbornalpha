'use client';
// MacroSummaryCard — /intel 宏观摘要卡 (spec §3.1): US / CN key indicators + collection status + link to the workbench.
import Link from 'next/link';
import { Panel } from '@/components/ui';
import { MacroKeyRows } from './MacroKeyRows';
import { useMacroOverview } from './use-macro-overview';
import { useMacroT } from './use-macro-t';
import { glanceRows } from './view-model';

export function MacroSummaryCard() {
  const { t, locale } = useMacroT();
  const state = useMacroOverview('region=all&compact=1');
  const groups = state.status === 'ok' ? glanceRows(state.data, locale) : [];
  return (
    <Panel title={t('summary.title')}>
      <div className="mb-2 text-[11px] text-text-dim">{t('summary.subtitle')}</div>
      {state.status === 'loading' && <div className="text-[11px] text-text-dim">{t('states.loading')}</div>}
      {(state.status === 'error' || (state.status === 'ok' && groups.length === 0)) && <div className="text-[11px] text-text-dim">{t('summary.unavailable')}</div>}
      {groups.length > 0 && <div className="grid gap-3 sm:grid-cols-2"><MacroKeyRows groups={groups} t={t} /></div>}
      <Link href="/intel/macro" className="mt-2 inline-block text-[11px] text-accent">{t('summary.enter')}</Link>
    </Panel>
  );
}
