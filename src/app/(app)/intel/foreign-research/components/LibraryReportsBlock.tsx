'use client';
// /stock/[ticker] library reports block (spec §9.4): newest five public reports for the
// ticker's issuer. Errors and malformed responses hide the block; only licensed DTOs render.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {PublicReportDto} from '@/lib/broker-research/public-dto';
import {RatingBadge} from './RatingBadge';
import {TargetValue} from './TargetValue';
import {reportHref} from './ReportsTable';
import {primaryTarget} from './format';
import {EN,TD} from './ui';

export interface ByTickerJson{ticker:string;issuerId:string;reports:PublicReportDto[];count:number}
export async function parseByTicker(res:Response):Promise<ByTickerJson|null>{
 if(!res.ok)return null;
 const body=await res.json().catch(()=>null) as Partial<ByTickerJson>|null;
 return body&&Array.isArray(body.reports)&&body.reports.length>0&&typeof body.count==='number'&&typeof body.ticker==='string'?body as ByTickerJson:null;
}

export function LibraryReportsView({ticker,reports,count}:{ticker:string;reports:PublicReportDto[];count:number}){
 const t=useTranslations('foreign-research.public.stock');
 return (
  <div className="card-base p-0">
   <div className="flex items-center gap-2 px-3 py-2.5">
    <span className="text-sm font-semibold text-text-dim">{t('title',{n:count})}<span className={EN}>{t('titleEn')}</span></span>
    <Link href={`/intel/foreign-research?ticker=${encodeURIComponent(ticker)}`} className="ml-auto text-xs">{t('all')}</Link>
   </div>
   <div className="overflow-x-auto">
    <table className="w-full text-sm"><tbody className="divide-y divide-border">
     {reports.map(r=>{const pt=r.targets.find(x=>x.securityTicker===ticker)??primaryTarget(r);return (
      <tr key={r.reportId}>
       <td className={`${TD} whitespace-nowrap pl-3 font-mono text-text-dim`}>{r.publishedDate??'—'}</td>
       <td className={`${TD} whitespace-nowrap`}>{r.institution?.nameEn??'—'}</td>
       <td className={TD}><Link href={reportHref(r.reportId)} className="text-text hover:text-accent">{r.title.text}</Link></td>
       <td className={TD}>{pt?<RatingBadge value={pt.rating.normalized}/>:null}</td>
       <td className={`${TD} whitespace-nowrap pr-3 text-right`}>{pt?<TargetValue target={pt.target} targetPricePublic={r.targetPricePublic} currencyFirst/>:null}</td>
      </tr>);})}
    </tbody></table>
   </div>
  </div>
 );
}

export function LibraryReportsBlock({ticker}:{ticker:string}){
 const [data,setData]=useState<ByTickerJson|null>(null);
 useEffect(()=>{
  setData(null);
  const ctrl=new AbortController();
  fetch(`/api/broker-research/by-ticker/${encodeURIComponent(ticker)}?limit=5`,{cache:'no-store',signal:ctrl.signal})
   .then(parseByTicker).then(setData).catch(()=>setData(null));
  return ()=>ctrl.abort();
 },[ticker]);
 return data?<LibraryReportsView ticker={data.ticker} reports={data.reports} count={data.count}/>:null;
}
