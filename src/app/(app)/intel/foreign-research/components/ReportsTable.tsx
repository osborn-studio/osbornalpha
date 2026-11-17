'use client';
import {useState} from 'react';
import Link from 'next/link';
import {NextIntlClientProvider,useLocale,useTranslations} from 'next-intl';
import {StateBadge} from '@/components/research-ui';
import type {PublicReportDto} from '@/lib/broker-research/public-types';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {displayTitle,primaryTarget} from './format';
import {InstitutionMark} from './ResearchShell';
import {SourceDrawer} from './SourceDrawer';
import {CHIP,TAG,TD,TH} from './ui';
export const reportHref=(id:string)=>`/intel/foreign-research/${encodeURIComponent(id)}`;
export const institutionHref=(id:string)=>`/intel/foreign-research/institutions/${encodeURIComponent(id)}`;
export function ReportsTable({reports,hideInstitution=false}:{reports:PublicReportDto[];hideInstitution?:boolean}){
 const t=useTranslations('foreign-research.public.list'),tt=useTranslations('foreign-research.public.title'),locale=useLocale();
 const [selected,setSelected]=useState<PublicReportDto|null>(null);
 const columns=hideInstitution?['published','security','title','rating','target','summary','original']:['published','institution','security','title','rating','target','summary','original'];
 const focus=selected?primaryTarget(selected):null;
 return <><div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[880px] text-sm"><thead><tr>{columns.map(k=><th scope="col" key={k} className={TH}>{k==='rating'||k==='target'?<InstitutionMark/>:null}{t(`columns.${k}`)}</th>)}</tr></thead>
 <tbody className="divide-y divide-border">{reports.map(r=>{
  const x=primaryTarget(r),title=displayTitle(r.title,locale),institution=r.institution?.nameEn??t('unknownInstitution');
  return <tr key={r.reportId}>
   <td className={TD}>{r.publishedDate??'—'}</td>
   {hideInstitution?null:<td className={TD}>{r.institution?<Link href={institutionHref(r.institution.id)}>{institution}</Link>:'—'}</td>}
   <td className={TD}>{x?.securityTicker??x?.tickerAsStated??'—'}</td>
   <td className={TD}><Link href={reportHref(r.reportId)} className="hover:text-accent">{title.text}</Link>{title.translated?<span className={TAG}>{tt('translated')}{title.modelId?` · ${title.modelId}`:''}</span>:null}{title.rewritten?<span className={TAG}>{tt('rewritten')}</span>:null}</td>
   <td className={`${TD} bg-[var(--accent-wash)]`}><InstitutionMark institution={institution}/><div><RatingBadge value={x?.rating.normalized??null} raw={x?.rating.raw}/>{x?.rating.raw?<span className="ml-1 text-xs text-text-dim">{t('rawRating',{raw:x.rating.raw})}</span>:null}</div></td>
   <td className={`${TD} bg-[var(--accent-wash)]`}><InstitutionMark institution={institution}/><div><TargetValue target={x?.target??null} targetPricePublic={r.targetPricePublic} currencyFirst onOpen={()=>setSelected(r)}/></div></td>
   <td className={TD}>{r.hasSummary.zh||r.hasSummary.en?<span className={CHIP}>{t('hasSummary')}</span>:t('noSummary')}</td>
   <td className={TD}><NextIntlClientProvider locale={locale} messages={{research:{states:{withheld:t('originalState')}}}}><StateBadge state="withheld" detail={t('originalRestricted')}/></NextIntlClientProvider></td>
  </tr>;
 })}</tbody></table></div>
 <SourceDrawer subject={selected?{label:'',targetKey:null,value:'',citation:null,snippets:[],judgment:false}:null} availableAt={selected?.availableAt??null} codeVersion={selected?.codeVersion??null} rulesVersion={selected?.rulesVersion??null} publicationId={focus?.publicationId??null} metadata={selected?{reportId:selected.reportId,institution:selected.institution,title:displayTitle(selected.title,locale).text,reportDate:selected.publishedDate,licence:null}:undefined} onClose={()=>setSelected(null)}/>
 </>;
}
