// Public footer provenance is fetched from the versioned detail endpoint (spec §7.2, D8).
'use client';
import {useEffect,useState} from 'react';
import {useTranslations} from 'next-intl';
import {FreshnessChip,ResearchFooter} from '@/components/research-ui';
import type {DossierDto,EvidenceDetailDto} from '@/lib/topics/public-dto';
import {footerModel} from './footer-model';
export function DossierFooter({dto}:{dto:DossierDto}){
 const t=useTranslations('topics'),[loaded,setLoaded]=useState<{dto:DossierDto;details:EvidenceDetailDto[]}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  void Promise.all(dto.evidence.filter(e=>e.state==='ok'&&!e.masked).map(async e=>{
   const response=await fetch(`/api/topics/${encodeURIComponent(dto.topic.slug)}/evidence/${e.ordinal}?version=${dto.version.version_no}`,{signal:controller.signal});
   if(!response.ok)throw new Error('provenance_unavailable');return await response.json() as EvidenceDetailDto;
  })).then(details=>{if(!controller.signal.aborted)setLoaded({dto,details});}).catch(()=>{});
  return ()=>controller.abort();
 },[dto]);
 const m=footerModel({...dto,details:loaded?.dto===dto?loaded.details:[]},key=>t(key));
 const labels={ok:'states.ok',missing:'footer.missing',withheld:'footer.withheld',not_served:'footer.notServed',unsupported:'states.unsupported',retracted:'footer.retracted'};
 return <div className="min-w-0 space-y-4 text-xs break-words">
  <dl className="space-y-3">
   <dt className="font-medium">{t('footer.counts')}</dt><dd className="flex flex-wrap gap-3">{m.counts.map(c=><span key={c.state}>{t(labels[c.state])} <span className="font-mono tabular-nums">{c.count}</span></span>)}</dd>
   <dt className="font-medium">{t('footer.freshness')}</dt><dd className="space-y-2">{m.freshness.map(f=><div key={f.dataset} className="flex flex-wrap gap-2 items-center"><span>{f.dataset}</span><FreshnessChip status={f.status}/></div>)}<p className="font-mono tabular-nums">{t('footer.age',{days:m.age_days})}</p></dd>
   {m.marketNotes.length>0&&<><dt className="font-medium">{t('footer.markets')}</dt><dd>{m.marketNotes.map(note=><p key={note}>{note}</p>)}</dd></>}
   <dt className="font-medium">{t('footer.attribution')}</dt><dd>{m.attributions.length?m.attributions.map(a=><p key={a}>{a}</p>):<p>{t('footer.provenancePending')}</p>}</dd>
   {m.fredNote&&<dd>{t('footer.fred')}</dd>}
  </dl>
  <ResearchFooter sources={m.sources}/>
 </div>;
}
