// Separate attributed judgment cards, printing only supplied slots (spec §7.2, X22).
import {useLocale,useTranslations} from 'next-intl';
import {MarkCard} from '@/components/research-ui';
import type {PublicEvidence} from '@/lib/topics/public-dto';
import {formatDossierDate} from './dossier-model';
import {evidenceRowModel} from './evidence-row-model';
export function JudgmentBlock({evidence,onOpenSource}:{evidence:PublicEvidence;onOpenSource:(ordinal:number)=>void}){
 const locale=useLocale(),t=useTranslations('topics'),m=evidenceRowModel(evidence,locale);
 const slots=evidence.state==='ok'&&!evidence.masked?evidence.fact?.slots:undefined;
 const text=(key:string)=>typeof slots?.[key]==='string'?slots[key] as string:null;
 const registered=text('registered_at'),claim=text(locale==='en'?'claim_en':'claim_zh')??text('claim');
 return <div data-evidence-ordinal={evidence.ordinal}><MarkCard kind="judgment">
  <h3 className="text-sm font-medium"><span className="font-mono tabular-nums">{evidence.ordinal}</span>{' · '}{m.label}</h3>
  <div className="flex flex-wrap gap-2">{['lifecycle','calibration','method'].map(key=>text(key)&&<span key={key} className="rounded border border-border px-2 py-0.5 text-xs font-mono tabular-nums">{key==='method'?text(key):t(`judgment.${key}.${text(key)}`)}</span>)}</div>
  <p className="text-sm text-text-dim font-mono tabular-nums">{!slots?m.factText:registered&&claim?t('dossier.judgmentClaim',{registered_at:formatDossierDate(registered),claim}):t('dossier.judgmentIncomplete')}</p>
  {m.sourceButton&&<button type="button" onClick={()=>onOpenSource(evidence.ordinal)} className="min-h-[44px] self-start text-xs text-accent">{t('dossier.source')} ▸</button>}
 </MarkCard></div>;
}
