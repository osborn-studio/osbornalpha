// Topic states extend the shared vocabulary without changing it (spec §4.1, X7).
import {useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import type {TopicBadgeModel} from './badge-model';
const shapes={dashed:'border-dashed',dotted:'border-dotted',solid:'border-solid'};
const tones={neutral:'border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-text-dim',warn:'border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-warn'};
export function TopicBadge({badge}:{badge:TopicBadgeModel|null}){
 const t=useTranslations('topics');if(!badge)return null;
 const reason=badge.reasonKey?(t.has(badge.reasonKey)?t(badge.reasonKey):t('reasons.unknown')):undefined;
 if(badge.kind==='shared')return <StateBadge state={badge.state} detail={reason}/>;
 return <span data-topic-state={badge.kind==='local'?badge.key:'ok'} className={`inline-flex items-center gap-1 h-5 px-1.5 rounded-[4px] text-[11px] whitespace-nowrap border ${badge.kind==='local'?`${shapes[badge.shape]} ${tones[badge.tone]}`:'border-border text-text-dim'}`}>
  {badge.kind==='ok'&&<span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent"/>}
  {t(badge.kind==='local'?badge.key:badge.atPublication?'states.atPublication':'states.ok')}{reason&&<span>{reason}</span>}
 </span>;
}
