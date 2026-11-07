'use client';
// src/components/industries/IndustryRow.tsx
// "所属行业" row of the /stock/[ticker] overview (spec §7.3, §8.1; canvas "Entry"): ticker → issuer
// (GET /api/entities/resolve) → industries (GET /api/entities/[issuerId]/industries, public schemes
// only). SW path chips link to the L1 detail page with the "since" date; SIC chips carry the
// current_only badge; an A-share whose SW scheme is not public says "licence pending" instead of
// showing nothing. Unknown ticker / no data → the row is not rendered.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useLocale,useTranslations} from 'next-intl';
import type {IssuerIndustriesView} from '@/lib/industry/read';
import {industryPath,nodeName} from './hrefs';

type Ok=Extract<IssuerIndustriesView,{state:'ok'}>;

export function IndustryRow({ticker}:{ticker:string}){
  const t=useTranslations('industries.stock');
  const ts=useTranslations('industries.schemes');
  const locale=useLocale()==='en'?'en':'zh';
  const [data,setData]=useState<Ok|null>(null);
  useEffect(()=>{
    const ctrl=new AbortController();
    setData(null);
    (async()=>{
      const r=await fetch(`/api/entities/resolve?ticker=${encodeURIComponent(ticker)}`,{signal:ctrl.signal});
      if(!r.ok)return;
      const issuer=await r.json() as {issuer_id?:string};
      if(!issuer.issuer_id)return;
      const r2=await fetch(`/api/entities/${issuer.issuer_id}/industries`,{signal:ctrl.signal});
      if(!r2.ok)return;
      setData(await r2.json() as Ok);
    })().catch(()=>{});
    return ()=>ctrl.abort();
  },[ticker]);
  if(!data)return null;
  const aShare=/\.(SH|SZ|BJ)$/i.test(ticker);
  const swHidden=aShare&&data.schemes.some(s=>s.scheme==='sw2021'&&!s.public);
  if(data.industries.length===0&&!swHidden)return null;
  return (
    <div className="card-base flex flex-col gap-2" data-industry-row="">
      {data.industries.map(i=>(
        <div key={i.membershipId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[10px] uppercase tracking-wide text-text-dim">{t('label')}</span>
          <Link href={industryPath(i.scheme,i.path[0]?.code??'')} className="rounded-full border border-border px-2.5 py-0.5 text-text hover:border-[var(--border-active)] hover:no-underline">
            {ts(i.scheme)} · {i.scheme==='sic'?`${i.path[0]?.code??''} · `:''}{i.path.map(n=>nodeName(n,locale)).join(' › ')}
          </Link>
          {i.currentOnly
            ?<span className="rounded-[4px] border border-warn px-1.5 text-xs text-warn">{t('currentOnly')}</span>
            :<span className="ml-auto font-mono text-xs tabular-nums text-text-dim">{t('since',{date:i.since})}</span>}
        </div>
      ))}
      {swHidden&&<div className="flex items-center gap-2 text-sm"><span className="text-[10px] uppercase tracking-wide text-text-dim">{t('label')}</span><span className="text-xs text-text-dim">{t('unlicensed')}</span></div>}
    </div>
  );
}
