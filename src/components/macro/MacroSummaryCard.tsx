'use client';
// MacroSummaryCard — /intel 宏观摘要卡 (spec §3.1): US / CN key indicators + collection status + link to the workbench.
import {useTranslations} from 'next-intl';
import {HubCard} from '@/components/intel/hub/HubCard';
import {hubNumber} from '@/components/intel/hub/hub-model';
import { MacroKeyRows } from './MacroKeyRows';
import { useMacroOverview } from './use-macro-overview';
import { useMacroT } from './use-macro-t';
import { glanceRows } from './view-model';

export function MacroSummaryCard() {
  const { t, locale } = useMacroT();
  const hub = useTranslations('intel.hub.macro');
  const state = useMacroOverview('region=all&compact=1');
  const groups = state.status === 'ok' ? glanceRows(state.data, locale, t) : [];
  return (
    <HubCard id="macro" no={hubNumber('macro')} title={hub('title')} titleEn={hub('titleEn')}
      state="open" href="/macro" enterLabel={hub('enter')}>
      <div className="mb-2 text-[11px] text-text-dim">{t('summary.subtitle')}</div>
      {state.status === 'loading' && <div className="text-[11px] text-text-dim">{t('states.loading')}</div>}
      {(state.status === 'error' || (state.status === 'ok' && groups.length === 0)) && <div className="text-[11px] text-text-dim">{t('summary.unavailable')}</div>}
      {groups.length > 0 && (
        <div className="min-w-0 overflow-x-auto">
          <MacroKeyRows groups={groups} t={t} />
        </div>
      )}
    </HubCard>
  );
}
