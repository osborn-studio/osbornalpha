'use client';
// Institution scales (insert / close) and analyst bylines (spec §4.5, §4.9; D6). Metadata-only client props.
import {StateBadge,StateCell} from '@/components/research-ui';
import {institutionSummary} from './institutions-model';
import {adminJson} from '../_shared/admin-fetch';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {PUBLIC_RATINGS} from '@/lib/broker-research/public-types';
import {BTN,CARD,CHIP,H1,H2,INPUT,TD,TH,TINY} from '@/app/(app)/intel/foreign-research/components/ui';

// Structural metadata props keep server DB contracts and dependencies out of the client graph.
type Rating=typeof PUBLIC_RATINGS[number];
export interface InstitutionDetail{
 institution:{institution_id:string;name_en:string;name_zh:string|null;aliases:string[]};
 scales:{scale_id:string;raw_label:string;normalized:Rating;source_url:string;valid_from:string;valid_to:string|null}[];
 analysts:{analyst_id:string;display_name:string;name_variants:string[];public_display:boolean}[];
}
type Post=(path:string,body:unknown)=>Promise<boolean>;
export function InstitutionsClient({details}:{details:InstitutionDetail[]}){
 const t=useTranslations('foreign-research.admin.institutions'),router=useRouter();
 const [selected,setSelected]=useState(details[0]?.institution.institution_id??'');
 const active=details.find(d=>d.institution.institution_id===selected)??details[0];
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[name,setName]=useState('');
 async function post(path:string,body:unknown):Promise<boolean>{
  setBusy(true);setError(null);
  try{
   const result=await adminJson('POST',path,body);
   if(result.ok){router.refresh();return true;}
   setError(t('error',{code:result.code}));return false;
  }finally{setBusy(false);}
 }
 return <div className="flex flex-col gap-5" aria-busy={busy}>
  <h1 className={H1}>{t('title')}</h1>
  {error?<div role="alert" className="rounded-md border border-border bg-bg-elevated p-3 text-sm">{error}</div>:null}
  <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void post('/institutions',{name_en:name.trim()}).then(ok=>{if(ok)setName('');});}}>
   <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-dim">{t('nameEn')}<input className={INPUT} required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>
   <button className={BTN} disabled={busy||!name.trim()}>{t('add')}</button>
  </form>
  {details.length===0?<p className={TINY}>{t('none')}</p>:<>
   <div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[680px] text-sm">
    <thead><tr>{['institution','scale','analysts','reports','licence','edit'].map(k=><th scope="col" className={TH} key={k}>{t(`columns.${k}`)}</th>)}</tr></thead>
    <tbody>{details.map(d=>{const summary=institutionSummary(d,new Date().toISOString().slice(0,10));return <tr className="border-t border-border" key={d.institution.institution_id}>
     <td className={TD}>{d.institution.name_en}</td>
     <td className={TD}>{summary.mapped?t('mapped',{n:summary.mapped}):<StateBadge state="missing" detail={t('noScale')}/>}</td>
     <td className={TD}>{summary.analysts}</td>
     <td className={TD}><StateCell state="missing" detail={t('unavailable')}/></td>
     <td className={TD}><StateBadge state="missing" detail={t('unavailable')}/></td>
     <td className={TD}><button type="button" className={BTN} aria-pressed={active?.institution.institution_id===d.institution.institution_id} onClick={()=>setSelected(d.institution.institution_id)}>{t('columns.edit')}</button></td>
    </tr>;})}</tbody>
   </table></div>
   <p className={TINY}>{t('readLimit')}</p>
   {active?<InstitutionCard key={active.institution.institution_id} d={active} busy={busy} post={post}/>:null}
  </>}
 </div>;
}
function InstitutionCard({d,busy,post}:{d:InstitutionDetail;busy:boolean;post:Post}){
 const t=useTranslations('foreign-research.admin.institutions'),tr=useTranslations('foreign-research.rating');
 const base=`/institutions/${d.institution.institution_id}`;
 const [scale,setScale]=useState({raw_label:'',normalized:'neutral' as Rating,source_url:'',valid_from:''});
 const [closeTo,setCloseTo]=useState(''),[analyst,setAnalyst]=useState('');
 return <section data-institution-editor className={`${CARD} flex flex-col gap-3`}>
  <div className="flex flex-wrap items-center gap-2"><h2 className={H2}>{d.institution.name_en}</h2>{d.institution.name_zh?<span className={TINY}>{d.institution.name_zh}</span>:null}{d.institution.aliases.map(a=><span key={a} className={CHIP}>{a}</span>)}</div>
  <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs">
   <caption className="sr-only">{t('title')} — {d.institution.name_en}</caption>
   <thead className="border-b border-border"><tr>{(['label','normalized','validFrom','validTo','source'] as const).map(c=><th key={c} scope="col" className={TH}>{t(`scales.${c}`)}</th>)}<th scope="col" className={TH}><span className="sr-only">{t('scales.close')}</span></th></tr></thead>
   <tbody className="divide-y divide-border">{d.scales.map(s=><tr key={s.scale_id}><td className={`${TD} font-mono`}>{s.raw_label}</td><td className={TD}>{tr(s.normalized)}</td><td className={`${TD} font-mono`}>{s.valid_from}</td><td className={`${TD} font-mono`}>{s.valid_to??'—'}</td>
    <td className={`${TD} break-all`}>{s.source_url}</td><td className={TD}>{s.valid_to?null:<button type="button" className={BTN} disabled={busy||!closeTo} onClick={()=>void post(`${base}/scales/${s.scale_id}/close`,{valid_to:closeTo})}>{t('scales.close')}</button>}</td></tr>)}</tbody>
  </table></div>
  <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void post(`${base}/scales`,scale);}}>
   <input className={`${INPUT} w-36`} required maxLength={80} aria-label={t('scales.label')} placeholder={t('scales.label')} value={scale.raw_label} onChange={e=>setScale({...scale,raw_label:e.target.value})}/>
   <select className={`${INPUT} w-36`} aria-label={t('scales.normalized')} value={scale.normalized} onChange={e=>setScale({...scale,normalized:e.target.value as Rating})}>{PUBLIC_RATINGS.map(r=><option key={r} value={r}>{tr(r)}</option>)}</select>
   <input type="url" className={`${INPUT} w-64 max-w-full`} required aria-label={t('scales.source')} placeholder="https://" value={scale.source_url} onChange={e=>setScale({...scale,source_url:e.target.value})}/>
   <input type="date" className={`${INPUT} w-40`} required aria-label={t('scales.validFrom')} value={scale.valid_from} onChange={e=>setScale({...scale,valid_from:e.target.value})}/>
   <button className={BTN} disabled={busy||!scale.raw_label.trim()||!scale.source_url||!scale.valid_from}>{t('saveMapping')}</button>
  </form>
  <label className="flex flex-col gap-1 text-xs text-text-dim">{t('scales.closeOn')}<input type="date" className={`${INPUT} w-40`} value={closeTo} onChange={e=>setCloseTo(e.target.value)}/></label>
  <p className={TINY}>{t('scales.note')}</p>
  <ul className="flex flex-col gap-1.5 text-sm">{d.analysts.map(a=><li key={a.analyst_id} className="flex flex-wrap items-center gap-2"><span>{a.display_name}</span>{a.name_variants.length?<span className={TINY}>{a.name_variants.join(' · ')}</span>:null}
   <label className="ml-auto flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={a.public_display} disabled={busy}
    onChange={e=>{if(window.confirm(t('analysts.confirm')))void post(`${base}/analysts`,{analyst_id:a.analyst_id,display_name:a.display_name,name_variants:a.name_variants,public_display:e.target.checked});}}/>{t('analysts.public')}</label></li>)}</ul>
  <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void post(`${base}/analysts`,{display_name:analyst.trim()}).then(ok=>{if(ok)setAnalyst('');});}}>
   <input className={`${INPUT} w-64 max-w-full`} required maxLength={200} aria-label={t('analysts.name')} placeholder={t('analysts.name')} value={analyst} onChange={e=>setAnalyst(e.target.value)}/>
   <button className={BTN} disabled={busy||!analyst.trim()}>{t('analysts.add')}</button>
  </form>
 </section>;
}
