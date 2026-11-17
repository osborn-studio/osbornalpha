'use client';
// Visible institution reports, exact view count and public analysts (spec §9.1).
import {useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {PUBLIC_RATINGS} from '@/lib/broker-research/public-types';
import type {InstitutionPageData} from '@/lib/broker-research/public-types';
import {ForeignHeader,ForeignFooter} from './ResearchShell';
import {ReportsTable} from './ReportsTable';
import {primaryTarget} from './format';
import {CARD,CARD_FLUSH,H2,SEG,TINY,segBtn} from './ui';
export function InstitutionView({data}:{data:InstitutionPageData}){
 const t=useTranslations('foreign-research.public'),tr=useTranslations('foreign-research.rating'),[rating,setRating]=useState('');
 const i=data.institution,reports=rating?data.reports.filter(r=>primaryTarget(r)?.rating.normalized===rating):data.reports;
 return <div className="mx-auto flex max-w-[1400px] flex-col gap-5"><nav className={TINY}><Link href="/intel/foreign-research">{t('breadcrumb.list')}</Link> / {t('breadcrumb.institution')}</nav><div className="space-y-2"><ForeignHeader title={[i.nameEn,i.nameZh].filter(Boolean).join(" · ")}/><p className={TINY}>{i.aliases.join(' · ')}</p>{i.ratingDisclosureUrl?<a href={i.ratingDisclosureUrl} target="_blank" rel="noopener noreferrer">{t('institution.ratingDisclosure')}</a>:null}<dl className="flex gap-4">{[['reports',i.reportCount],['securities',data.securities],['lastReport',data.lastPublishedDate??'—']].map(([k,v])=><div key={k}><dt className={TINY}>{t(`institution.stats.${k}`)}</dt><dd>{v}</dd></div>)}</dl></div>
  <div className="grid gap-4 lg:grid-cols-3"><section className={`${CARD_FLUSH} lg:col-span-2`}><div className="flex flex-wrap gap-2 p-3"><h2 className={H2}>{t('institution.reports')}</h2><div className={SEG}>{['',...PUBLIC_RATINGS].map(x=><button key={x||'all'} type="button" className={segBtn(rating===x)} onClick={()=>setRating(x)}>{x?tr(x):t('list.filters.all')}</button>)}</div></div><ReportsTable reports={reports} hideInstitution/></section><div className="space-y-4"><section className={CARD}><h2 className={H2}>{t('institution.performance.title')}</h2><p>{t('institution.performance.body',{n:i.reportCount})}</p><p className={TINY}>{t('institution.performance.sampleNote')}</p></section><section className={CARD}><h2 className={H2}>{t('institution.analysts.title')}</h2>{data.analysts.length?<ul>{data.analysts.map(a=><li key={a.analystId}>{a.displayName} · {t('institution.analysts.reports',{n:a.reportCount})}</li>)}</ul>:<p>{t('institution.analysts.none')}</p>}</section></div></div>
 <ForeignFooter/></div>;
}
