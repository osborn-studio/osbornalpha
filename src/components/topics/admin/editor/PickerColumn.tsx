// Topic plan T5.5: kind-specific search and separate public/admin projections.
'use client';
import {useRef,useState,type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import type {Candidate,EvidenceQuery} from '@/lib/topics/evidence-search';
import type {DraftBody} from '@/lib/topics/types';
import {adminJson} from '@/app/(app)/admin/topics/_shared/admin-fetch';
import {EvidenceState,KINDS} from './OutlineColumn';
import {BUTTON,INPUT,PANEL} from './FlowBar';
const QUERY_FIELDS:Record<EvidenceQuery['kind'],string[]>={macro_observation:['series_id','period_end'],financial_fact:['ticker','concept','period_end'],industry_metric:['scheme','code','metric','period_end'],document_citation:['document_id','page_no'],judgment:['judgment_id']};
export function PickerColumn({id,body,locale,onAdd,readOnly}:{id:string;body:DraftBody;locale:'zh'|'en';onAdd:(candidate:Candidate,section:string)=>void;readOnly:boolean}){
 const t=useTranslations('topicsAdmin'),[kind,setKind]=useState<EvidenceQuery['kind']>('macro_observation'),[values,setValues]=useState<Record<string,string>>({scheme:'sic'}),[section,setSection]=useState('');
 const [candidates,setCandidates]=useState<Candidate[]|null>(null),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),generation=useRef(0);
 const target=body.sections.some(s=>s.key===section)?section:body.sections[0]?.key??'';
 async function search(e:FormEvent){
  e.preventDefault();const current=++generation.current;setPending(true);setError(null);
  const query:Record<string,unknown>={kind};for(const key of QUERY_FIELDS[kind])if(values[key])query[key]=key==='page_no'?Number(values[key]):values[key];if(values.as_of)query.as_of=values.as_of;
  const result=await adminJson<{candidates:Candidate[]}>('POST',`/${id}/evidence-search`,query);
  if(current!==generation.current)return;setPending(false);if(result.ok)setCandidates(result.data.candidates);else{setCandidates(null);setError(result.code);}
 }
 return <section className={PANEL} aria-labelledby="editor-picker"><h2 id="editor-picker" className="font-semibold">{t('picker.title')}</h2>
  <div className="flex flex-wrap gap-1">{KINDS.map(k=><button key={k} type="button" className={`${BUTTON} ${k===kind?'border-accent text-accent':''} ${k==='broker_report_meta'?'border-dashed':''}`} aria-pressed={kind===k} disabled={k==='broker_report_meta'} onClick={()=>{if(k==='broker_report_meta')return;generation.current++;setKind(k);setCandidates(null);setError(null);setPending(false);}}>{t(`kind.${k}`)}</button>)}</div>
  <form onSubmit={search} className="space-y-2"><div className="grid grid-cols-2 gap-2">{[...QUERY_FIELDS[kind],'as_of'].map(key=><label key={key} className="min-w-0 text-xs">{t(`picker.${key}`)}
   {key==='scheme'?<select className={INPUT} value={values.scheme} onChange={e=>setValues({...values,scheme:e.target.value})}><option value="sic">sic</option><option value="sw2021">sw2021</option></select>:<input className={`${INPUT} font-mono tabular-nums`} type={key==='as_of'||key==='period_end'?'date':key==='page_no'?'number':'text'} required={key!=='as_of'&&key!=='page_no'} min={key==='page_no'?1:undefined} max={key==='page_no'?9999:undefined} value={values[key]??''} onChange={e=>setValues({...values,[key]:e.target.value})}/>}
  </label>)}</div><button className={BUTTON} type="submit" disabled={pending}>{t(pending?'picker.searching':'picker.search')}</button></form>
  <label className="block text-xs">{t('picker.target')}<select className={INPUT} value={target} disabled={!body.sections.length||readOnly} onChange={e=>setSection(e.target.value)}>{!body.sections.length&&<option value="">{t('picker.noSection')}</option>}{body.sections.map((s,i)=><option key={s.key} value={s.key}>{i+1} · {s.title[locale]}</option>)}</select></label>
  {!body.sections.length&&<p className="text-xs text-text-muted">{t('picker.noSection')}</p>}
  {error&&<p role="alert" className="break-all font-mono text-xs tabular-nums text-danger">{error}</p>}
  <div className="min-w-0 overflow-x-auto" aria-busy={pending}><table className="w-full table-fixed text-left text-xs"><thead><tr>{['candidate','public','admin','add'].map(k=><th key={k} scope="col" className="break-words p-1">{t(`picker.${k}`)}</th>)}</tr></thead><tbody>
   {candidates?.map((c,i)=>{
    const added=body.evidence.some(e=>e.ref.kind===c.ref.kind&&e.ref.id===c.ref.id&&e.ref.as_of===c.ref.as_of);
    return <tr key={`${c.ref.id}-${i}`} className="border-t border-border"><td className="break-words p-1">{c.label[locale]}</td><td className="break-words p-1"><EvidenceState state={c.public.state}/>{c.public.state==='ok'&&<> · <span className="font-mono tabular-nums">{c.public.text}</span></>}{c.public.reason&&<div className="break-all font-mono tabular-nums text-text-muted">{c.public.reason}</div>}</td><td className="break-words p-1"><span className="font-mono tabular-nums">{c.admin.text??'—'}</span>{c.admin.admin_only&&<p className="text-text-muted">{t('picker.private')}</p>}</td><td className="p-1"><button type="button" className={BUTTON} disabled={readOnly||!target||added||body.evidence.length>=200} onClick={()=>onAdd(c,target)}>{t(added?'picker.added':'picker.add')}</button></td></tr>;
   })}
   {candidates?.length===0&&<tr><td colSpan={4} className="py-3 text-text-muted">{t('picker.empty')}</td></tr>}
  </tbody></table></div>
 </section>;
}
