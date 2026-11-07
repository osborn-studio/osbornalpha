'use client';
// src/components/industries/IndustryEntryCard.tsx
// "/intel" research-tab entry card (spec §8.1; canvas "Entry"): title, scope line, and — when the
// public list answers — facts-as-of and freshness. A 403 says the SW licence is pending; any other
// failure just omits the status line (the card stays a plain link).
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {FreshnessStatus} from '@/lib/dq/freshness';
import {FreshnessChip} from './FreshnessChip';
import {INDUSTRIES_PATH} from './hrefs';

type Status={kind:'ok';factsAsOf:string|null;freshness:FreshnessStatus}|{kind:'unlicensed'}|{kind:'none'};

export function IndustryEntryCard(){
  const t=useTranslations('industries.entry');
  const [status,setStatus]=useState<Status>({kind:'none'});
  useEffect(()=>{
    const ctrl=new AbortController();
    fetch('/api/industries?scheme=sw2021&metric=member_count&periods=1',{signal:ctrl.signal})
      .then(async r=>{
        if(r.status===403){setStatus({kind:'unlicensed'});return;}
        if(!r.ok)return;
        const b=await r.json() as {factsAsOf?:string|null;freshness?:FreshnessStatus};
        if(b.freshness)setStatus({kind:'ok',factsAsOf:b.factsAsOf??null,freshness:b.freshness});
      })
      .catch(()=>{});
    return ()=>ctrl.abort();
  },[]);
  return (
    <Link href={INDUSTRIES_PATH} data-entry="industries" className="card-base flex flex-col gap-1.5 text-text hover:border-[var(--border-active)] hover:no-underline" style={{marginBottom:0}}>
      <div className="flex items-center gap-2"><span className="text-sm font-semibold">{t('title')}</span><span className="text-xs text-text-dim">{t('titleEn')}</span><span aria-hidden="true" className="ml-auto text-accent">→</span></div>
      <span className="text-xs text-text-dim">{t('desc')}</span>
      {status.kind==='ok'&&<span className="flex items-center gap-2 text-xs text-text-dim">{status.factsAsOf&&<span className="font-mono tabular-nums">{t('factsAsOf',{date:status.factsAsOf})}</span>}<FreshnessChip status={status.freshness} /></span>}
      {status.kind==='unlicensed'&&<span className="text-xs text-warn">{t('unlicensed')}</span>}
    </Link>
  );
}
