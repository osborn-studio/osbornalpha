'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useTranslations} from 'next-intl';
import type {TopicSourceLicenceRow} from '@/lib/topics/database-types';
import type {LicenceFields} from '@/lib/topics/licences';
import {licenceForm,permissionKeys} from './licence-model';
import {EXCERPT_CAPS} from '@/lib/topics/excerpts';
import {TopicAdminFrame} from '@/app/(app)/admin/topics/_shared/TopicAdminFrame';
import {adminJson} from '@/app/(app)/admin/topics/_shared/admin-fetch';
import {BUTTON,INPUT,PANEL} from './editor/FlowBar';
const blank:LicenceFields={source_title:'',publisher:'',source_url:'',terms_url:'',terms_read_at:'',terms_clause:'',permits:{display_excerpt:false,link_required:true},status:'pending',note:null};
const statuses=['pending','approved','revoked'] as const;
export function LicenceRegister({initial}:{initial:TopicSourceLicenceRow[]}){
 const t=useTranslations('topicsAdmin.licences'),[rows,setRows]=useState(initial),[form,setForm]=useState(blank),[id,setId]=useState<string|null>(null);
 const [hydrated,setHydrated]=useState(false),[error,setError]=useState(false),[pending,setPending]=useState(false),sending=useRef(false);
 useEffect(()=>setHydrated(true),[]);
 async function submit(e:FormEvent){
  e.preventDefault();if(sending.current)return;sending.current=true;setPending(true);setError(false);
  try{
   const result=await adminJson<{licence_id:string}>('POST','/licences',{...licenceForm(form),licence_id:id});
   if(!result.ok){setError(true);return;}
   const list=await adminJson<{licences:TopicSourceLicenceRow[]}>('GET','/licences');
   setId(result.data.licence_id);
   if(!list.ok){setError(true);return;}
   setRows(list.data.licences);setId(null);setForm(blank);
  }catch{setError(true);}finally{sending.current=false;setPending(false);}
 }
 return <div data-hydrated={hydrated||undefined}><TopicAdminFrame crumb={t('title')} title={t('title')}>
  <table className="w-full text-left text-sm"><thead><tr>{['source','permissions','status'].map(k=><th key={k}>{t(k)}</th>)}</tr></thead>
   <tbody>{rows.map(row=>{
    const permissions=permissionKeys(row.permits);
    return <tr key={row.licence_id} className="border-t border-border" onClick={()=>{if(!pending){setId(row.licence_id);setForm(row);setError(false);}}}>
     <td><button type="button" className="text-accent underline" disabled={pending}>{row.source_title}</button></td><td>{permissions.map(k=>t(k)).join(' · ')||'—'}</td>
     <td><span className={`rounded border px-2 py-1 ${row.status==='pending'?'border-dashed text-warn':row.status==='revoked'?'border-danger text-danger':'border-border'}`}><span aria-hidden="true">{row.status==='approved'?'●':row.status==='pending'?'◷':'×'}</span> {t(row.status)}</span></td>
    </tr>;
   })}</tbody></table>
  <form onSubmit={submit} className={PANEL}><h2 className="font-semibold">{t('register')}</h2>
   <fieldset disabled={pending} className="space-y-3">{(['source_title','publisher','source_url','terms_url','terms_read_at','terms_clause'] as const).map(name=><label key={name} className="block text-sm">{t(name)}
    {name==='terms_clause'?<textarea className={INPUT} value={form[name]} required maxLength={200} onChange={e=>setForm({...form,[name]:e.target.value})}/>:
     <input className={INPUT+(name==='terms_read_at'?' font-mono tabular-nums':'')} type={name.endsWith('_url')?'url':name==='terms_read_at'?'date':'text'} required value={form[name]} onChange={e=>setForm({...form,[name]:e.target.value})}/>}</label>)}
    <div className="flex flex-wrap gap-3">{(['display_excerpt','attribution_required','link_required'] as const).map(k=><label key={k}><input type="checkbox" checked={k==='attribution_required'||form.permits[k]===true} disabled={k==='attribution_required'} onChange={e=>setForm({...form,permits:{...form.permits,[k]:e.target.checked}})}/> {t(k)}</label>)}</div>
    <p className="font-mono text-sm tabular-nums">{t('caps',EXCERPT_CAPS)}</p>
    <label className="block">{t('status')}<select className={INPUT} value={form.status} onChange={e=>setForm({...form,status:e.target.value as LicenceFields['status']})}>{statuses.map(s=><option key={s} value={s}>{t(s)}</option>)}</select></label>
    <button className={BUTTON} type="submit">{t('save')}</button>{error&&<p role="alert" className="text-danger">{t('error')}</p>}
   </fieldset></form>
 </TopicAdminFrame></div>;
}
