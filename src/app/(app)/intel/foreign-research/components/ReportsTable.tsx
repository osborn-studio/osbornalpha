'use client';
// Responsive report table and mobile cards (spec §9.2).
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {displayTitle,fmtPct,primaryTarget} from './format';
import {CARD,CHIP,TAG,TD,TH} from './ui';
export const reportHref=(id:string)=>`/intel/foreign-research/${id}`;
export const institutionHref=(id:string)=>`/intel/foreign-research/institutions/${id}`;
export function ReportsTable({reports,hideInstitution=false}:{reports:PublicReportDto[];hideInstitution?:boolean}){
 const t=useTranslations('foreign-research.public.list'),tt=useTranslations('foreign-research.public.title'),locale=useLocale();
 const rows=reports.map(r=>({r,target:primaryTarget(r),title:displayTitle(r.title,locale)}));
 const title=(r:PublicReportDto,x:ReturnType<typeof displayTitle>)=><><Link href={reportHref(r.reportId)} className="hover:text-accent">{x.text}</Link>{x.translated?<span className={TAG}>{tt('translated')}{x.modelId?` · ${x.modelId}`:''}</span>:null}{x.rewritten?<span className={TAG}>{tt('rewritten')}</span>:null}</>;
 return <><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[880px] text-sm"><thead><tr>{(hideInstitution?['security','title','published','rating','target','upside','summary']:['institution','security','title','published','rating','target','upside','summary']).map(k=><th scope="col" key={k} className={TH}>{t(`columns.${k}`)}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map(({r,target:x,title:y})=><tr key={r.reportId}>
 {hideInstitution?null:<td className={TD}>{r.institution?<Link href={institutionHref(r.institution.id)}>{r.institution.nameEn}</Link>:'—'}</td>}
 <td className={TD}>{x?.securityTicker??x?.tickerAsStated??'—'}</td><td className={TD}>{title(r,y)}</td><td className={TD}>{r.publishedDate??'—'}</td>
 <td className={TD}>{x?<><span className="mr-1">{x.rating.raw??'—'}</span><RatingBadge value={x.rating.normalized}/><span className={TAG}>{t('judgment')}</span></>:'—'}</td>
 <td className={TD}>{x?<><TargetValue target={x.target} targetPricePublic={r.targetPricePublic} currencyFirst/><span className={TAG}>{t('judgment')}</span></>:'—'}</td>
 <td className={TD}>{x&&r.targetPricePublic?fmtPct(x.upsidePct,{signed:true}):'—'}<span className={TAG}>{t('judgment')}</span></td><td className={TD}>{r.hasSummary.zh||r.hasSummary.en?<span className={CHIP}>{t('hasSummary')}</span>:'—'}</td>
 </tr>)}</tbody></table></div>
 <ul className="sm:hidden">{rows.map(({r,target:x,title:y})=><li key={r.reportId} className={CARD}><div className="flex justify-between text-xs text-text-dim"><span>{hideInstitution?'':r.institution?.nameEn??'—'}</span><span>{r.publishedDate??'—'}</span></div><div className="my-2 font-semibold">{title(r,y)}</div>{x?<div className="flex flex-wrap items-center gap-2 text-xs"><span className={CHIP}>{x.securityTicker??x.tickerAsStated}</span><RatingBadge value={x.rating.normalized}/><TargetValue target={x.target} targetPricePublic={r.targetPricePublic} currencyFirst/>{r.targetPricePublic?fmtPct(x.upsidePct,{signed:true}):null}<span className={TAG}>{t('judgment')}</span></div>:null}</li>)}</ul></>;
}
