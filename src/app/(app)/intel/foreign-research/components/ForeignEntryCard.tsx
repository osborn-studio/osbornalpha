'use client';
import {useTranslations} from 'next-intl';
import {HubCard} from '@/components/intel/hub/HubCard';
import {hubNumber} from '@/components/intel/hub/hub-model';
import {useHubEntry} from '@/components/intel/hub/use-hub-entry';
import {StateBadge} from '@/components/research-ui/StateBadge';

function readReports(body:unknown){
 if(!body||typeof body!=='object'||!('reports' in body)||!Array.isArray(body.reports))throw Error('invalid_reports');
 return body.reports;
}
export function ForeignEntryCard(){
 const t=useTranslations('intel.hub.foreign');
 const entry=useHubEntry('/api/broker-research/reports?limit=1',readReports);
 return <HubCard id="foreign" no={hubNumber('foreign')} title={t('title')} titleEn={t('titleEn')}
  state={entry.state} href="/intel/foreign-research" enterLabel={t('enter')}>
  <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
   <dt>{t('publicContent')}</dt><dd>{t('metadata')}</dd>
   <dt>{t('pdf')}</dt><dd><StateBadge state="withheld"/> {t('private')}</dd>
  </dl>
 </HubCard>;
}
