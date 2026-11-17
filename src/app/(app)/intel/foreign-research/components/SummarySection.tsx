'use client';
// Plain-text independent summary and grounded numeric source links (spec §9.3).
import {useLocale,useTranslations} from 'next-intl';
import type {FieldName} from '@/lib/broker-research/types';
import type {PublicReportDetailDto} from '@/lib/broker-research/public-dto';
import {TARGET_PRICE_FIELDS} from '@/lib/broker-research/public-dto';
import {fmtNum,fmtPct} from './format';
import {CARD,EN,H2,SRC_BTN,TAG,TINY} from './ui';
export function SummarySection({summaries,targetPricePublic,onOpenFact}:{summaries:PublicReportDetailDto['summaries'];targetPricePublic:boolean;onOpenFact?:(targetKey:string,field:FieldName,label:string,value:string)=>void}){
 const t=useTranslations('foreign-research.public.summary'),tf=useTranslations('foreign-research.fields'),locale=useLocale()==='en'?'en':'zh';
 const s=summaries[locale]??summaries[locale==='zh'?'en':'zh'];
 return <section className={CARD}><h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn')}</span></h2>{!s?<p>{t('none')}</p>:<><div className="my-2"><span className={TAG}>AI</span> {t('label',{model:s.modelId??'—',date:s.generatedAt?.slice(0,10)??'—'})}</div>{s.lang!==locale?<p className={TINY}>{t('otherLanguage')}</p>:null}<div lang={s.lang==='zh'?'zh-CN':'en'} className="space-y-2 text-sm">{s.markdown.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div><div className="mt-3 flex flex-wrap gap-2"><span className={TINY}>{t('grounded')}</span>{s.groundingAssertions.filter(a=>targetPricePublic||!TARGET_PRICE_FIELDS.has(a.field)).map(a=>{const v=a.unit==='pct'||a.unit==='ratio'?fmtPct(a.value):fmtNum(a.value);return <button key={`${a.sentenceIdx}:${a.targetKey}:${a.field}`} type="button" className={SRC_BTN} onClick={()=>onOpenFact?.(a.targetKey,a.field,tf(a.field),v)}>{tf(a.field)} {v}</button>;})}</div></>}</section>;
}
