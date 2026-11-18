// Public footer provenance comes from the masked dossier (spec §7.2, D8).
'use client';
import {useTranslations} from 'next-intl';
import {FreshnessChip,ResearchFooter} from '@/components/research-ui';
import type {DossierDto} from '@/lib/topics/public-dto';
import {footerModel} from './footer-model';
export function DossierFooter({dto}:{dto:DossierDto}){
 const t=useTranslations('topics'),m=footerModel(dto,key=>t(key));
 const labels={ok:'states.ok',missing:'footer.missing',withheld:'footer.withheld',not_served:'footer.notServed',unsupported:'states.unsupported',retracted:'footer.retracted'};
 return <div className="min-w-0 space-y-4 text-xs break-words">
  <dl className="space-y-3">
   <dt className="font-medium">{t('footer.counts')}</dt><dd className="flex flex-wrap gap-3">{m.counts.map(c=><span key={c.state}>{t(labels[c.state])} <span className="font-mono tabular-nums">{c.count}</span></span>)}</dd>
   <dt className="font-medium">{t('footer.freshness')}</dt><dd className="space-y-2">{m.freshness.map(f=><div key={f.dataset} className="flex flex-wrap gap-2 items-center"><span>{f.label}</span><FreshnessChip status={f.status}/></div>)}<p className="font-mono tabular-nums">{t('footer.age',{days:m.age_days})}</p></dd>
   {m.marketNotes.length>0&&<><dt className="font-medium">{t('footer.markets')}</dt><dd>{m.marketNotes.map(note=><p key={note}>{note}</p>)}</dd></>}
   <dt className="font-medium">{t('footer.attribution')}</dt><dd>{m.attributions.length?m.attributions.map(a=><p key={a}>{a}</p>):<p>{t('footer.provenancePending')}</p>}</dd>
   {m.fredNote&&<dd>{t('footer.fred')}</dd>}
  </dl>
  <ResearchFooter sources={m.sources}/>
 </div>;
}
