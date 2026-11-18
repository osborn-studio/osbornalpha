'use client';
import {useLocale,useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui/StateBadge';
import {HubCard} from '@/components/intel/hub/HubCard';
import {hubNumber} from '@/components/intel/hub/hub-model';
import {useHubEntry} from '@/components/intel/hub/use-hub-entry';
import {entryCardModel,readEntryItems} from './entry-card-model';

export function TopicEntryCard(){
 const t=useTranslations('topics.entry'),locale=useLocale();
 const entry=useHubEntry('/api/topics?limit=200',readEntryItems);
 const model=entry.data && entryCardModel(entry.data,locale);
 return <HubCard id="topics" no={hubNumber('topic')} title={t('title')} titleEn={t('titleEn')}
  state={entry.state} href="/intel/topics" enterLabel={t('enter')} testId="intel-topics-card">
  {model?<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
   <dt>{t('published')}</dt><dd className="font-mono tabular-nums">{model.published}</dd>
   <dt>{t('latest')}</dt><dd>{model.title || <StateBadge state="missing"/>} · <span className="font-mono tabular-nums">v{model.version}</span></dd>
   <dt>{t('revised')}</dt><dd className="font-mono tabular-nums">{t('topicCount',{n:model.revised})}</dd>
  </dl>:<p>{t('empty')}</p>}
 </HubCard>;
}
