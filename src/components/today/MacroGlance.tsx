// MACRO
// Today macro glance (spec §3.5, canvas TodayGlance2): reads the published overview (region=all, compact). No mock
// rows: SSE/HSI/Nasdaq/DXY have no official source with confirmed rights; US10Y comes from the macro catalog
// (US_DGS10). Missing values read 缺失; a fetch failure reads unavailable; never zeros.
'use client';

import Link from 'next/link';
import { Panel } from '@/components/ui';
import { MacroKeyRows } from '@/components/macro/MacroKeyRows';
import { useMacroOverview } from '@/components/macro/use-macro-overview';
import { useMacroT } from '@/components/macro/use-macro-t';
import { glanceRows } from '@/components/macro/view-model';

export function MacroGlance() {
  const { t, locale } = useMacroT();
  const state = useMacroOverview('region=all&compact=1');
  const groups = state.status === 'ok' ? glanceRows(state.data, locale) : [];
  return (
    <Panel title={t('glance.title')}>
      {state.status === 'loading' && <div className="text-[11px] text-text-dim">{t('states.loading')}</div>}
      {(state.status === 'error' || (state.status === 'ok' && groups.length === 0)) && <div className="text-[11px] text-text-dim">{t('glance.unavailable')}</div>}
      {groups.length > 0 && <MacroKeyRows groups={groups} t={t} />}
      <Link href="/intel/macro" className="mt-2 inline-block text-[11px] text-accent">{t('glance.enter')}</Link>
    </Panel>
  );
}
// /MACRO
