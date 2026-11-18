'use client';
// src/components/industries/IndustryEntryCard.tsx
// "/intel" hub entry card (spec §8.1; canvas "Entry"): title, scope line, and — when the
// public SW list answers — facts-as-of and freshness. Each market has an explicit scheme link;
// a failed SW status request never hides or redirects either entry.
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {FreshnessStatus} from '@/lib/dq/freshness';
import {HubCard} from '@/components/intel/hub/HubCard';
import {hubNumber} from '@/components/intel/hub/hub-model';
import {FreshnessChip} from '@/components/research-ui/FreshnessChip';
import {INDUSTRIES_PATH,hrefWith} from './hrefs';

type Status={kind:'ok';factsAsOf:string|null;freshness:FreshnessStatus}|{kind:'unlicensed'}|{kind:'none'};

export function IndustryEntryCard(){
  const t=useTranslations('industries.entry');
  const hub=useTranslations('intel.hub.industry');
  const sicHref=hrefWith(INDUSTRIES_PATH,{},{scheme:'sic'});
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
    <HubCard id="industries" no={hubNumber('industry')} title={hub('title')} titleEn={hub('titleEn')}
      state="open" href={sicHref} enterLabel={hub('enter')}>
      <p>{t('desc')}</p>
      <Link href={sicHref} title={t('sicDesc')} className="block text-accent">{t('sicTitle')}</Link>
      <Link href={hrefWith(INDUSTRIES_PATH,{},{scheme:'sw2021',metric:'member_count'})} title={t('swDesc')}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-accent">
        {t('swTitle')}
        {status.kind==='ok'&&<>
          {status.factsAsOf&&<span className="font-mono tabular-nums text-text-dim">{t('factsAsOf',{date:status.factsAsOf})}</span>}
          <FreshnessChip status={status.freshness}/>
        </>}
        {status.kind==='unlicensed'&&<span className="text-warn">{t('unlicensed')}</span>}
      </Link>
    </HubCard>
  );
}
