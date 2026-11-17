// src/app/(app)/admin/broker-research/licences/LicencesClient.tsx
'use client';
// Licences (spec §4.1, §9.5; Licences artboard): list with version and confirmation state, create/edit
// form, "confirm v{n}" (409 version_mismatch → reload), and the impact panel of the selected licence.
// A material change bumps the version in SQL; the row then shows "pending confirmation".
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import type {LicenceView} from '../_shared/admin-fetch';
import {BTN,CARD,CARD_FLUSH,EN,H1,INPUT,TD,TH,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_GHOST,BTN_PRIMARY,CHIP_ACCENT,CHIP_WARN,ERROR_BAR,FIELD_LABEL,H3} from '../_shared/admin-fetch';
import {adminJson,baseCode} from '../_shared/admin-fetch';
import {FLAGS,LICENCE_KINDS,emptyLicenceForm,formFromLicence,toLicenceInput,validateLicenceForm} from './licence-form';
import type {LicenceForm} from './licence-form';

export function LicencesClient({views,today}:{views:LicenceView[];today:string}){
 const t=useTranslations('foreign-research.admin.licences');
 const te=useTranslations('foreign-research.admin.errors');
 const router=useRouter();
 const [editing,setEditing]=useState<string|'new'|null>(null);
 const [form,setForm]=useState<LicenceForm>(emptyLicenceForm(today));
 const [selected,setSelected]=useState<string|null>(views[0]?.licence.licence_id??null);
 const [bad,setBad]=useState<string[]>([]);const [error,setError]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});
 const sel=views.find(v=>v.licence.licence_id===selected)??null;
 const allowed=(v:LicenceView)=>[v.licence.allows_public_metadata&&t('flagsShort.metadata'),v.licence.allows_public_target_price&&t('flagsShort.target'),v.licence.allows_public_snippets&&t('flagsShort.snippets',{n:v.licence.snippet_max_chars}),v.licence.allows_public_summary&&t('flagsShort.summary')].filter(Boolean).join(' · ')||t('flagsShort.none');
 async function save(){
  const b=validateLicenceForm(form);setBad(b);if(b.length)return;
  setBusy(true);setError(null);
  const r=editing==='new'?await adminJson('POST','/licences',toLicenceInput(form)):await adminJson('PATCH',`/licences/${editing}`,toLicenceInput(form));
  setBusy(false);
  if(r.ok){setEditing(null);router.refresh();}else setError(errText(r.code));
 }
 async function confirm(v:LicenceView){
  setBusy(true);setError(null);
  const r=await adminJson('POST',`/licences/${v.licence.licence_id}/confirm`,{version:v.licence.version});
  setBusy(false);
  if(!r.ok)setError(errText(r.code));
  router.refresh();
 }
 const field=(k:'source_label'|'holder'|'terms_summary'|'evidence_path'|'valid_from'|'valid_to'|'snippet_max_chars',type='text')=>(
  <div><label htmlFor={`lic-${k}`} className={FIELD_LABEL}>{t(`form.${k}`)}</label>
   <input id={`lic-${k}`} type={type} className={`${INPUT} ${bad.includes(k)?'border-danger':''}`} aria-invalid={bad.includes(k)} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>
   {bad.includes(k)?<p className="mt-1 text-[11px] text-danger">{t(`invalid.${k}`)}</p>:null}</div>);
 return (
  <div className="flex flex-col gap-5">
   <div className="flex flex-wrap items-center gap-3"><h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
    <button type="button" className={`${BTN_PRIMARY} ml-auto`} onClick={()=>{setEditing('new');setForm(emptyLicenceForm(today));setBad([]);}}>{t('new')}</button></div>
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}
   <section className={`${CARD_FLUSH} overflow-x-auto`}>
    <table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['licence','version','status','allowed','documents','snippets',''] as const).map(c=><th key={c||'act'} scope="col" className={`${TH} ${c==='licence'?'pl-4':''} ${c==='documents'||c==='snippets'?'text-right':''}`}>{c?t(`columns.${c}`):<span className="sr-only">{t('columns.actions')}</span>}</th>)}</tr></thead>
     <tbody className="divide-y divide-border">{views.map(v=>(
      <tr key={v.licence.licence_id} className={v.pending?'bg-[var(--accent-wash)]':''}>
       <td className={`${TD} pl-4`}><button type="button" className="text-left text-text hover:text-accent" onClick={()=>setSelected(v.licence.licence_id)}>{v.licence.source_label}</button></td>
       <td className={`${TD} font-mono`}>{v.pending&&v.licence.confirmed_version!==null?`v${v.licence.confirmed_version} → v${v.licence.version}`:`v${v.licence.version}`}</td>
       <td className={TD}>{v.pending?<span className={CHIP_WARN}>{t('pending')}</span>:v.confirmed?<span className={CHIP_ACCENT}>{t('confirmedOn',{date:(v.licence.confirmed_at??'').slice(0,10)})}</span>:<span className={CHIP_WARN}>{t('outOfWindow')}</span>}</td>
       <td className={`${TD} text-xs text-text-dim`}>{allowed(v)}</td>
       <td className={`${TD} text-right font-mono`}>{v.documents}</td><td className={`${TD} text-right font-mono`}>{v.approvedSnippets}</td>
       <td className={`${TD} whitespace-nowrap pr-4`}>
        {v.pending?<button type="button" className={BTN} disabled={busy} onClick={()=>void confirm(v)}>{t('confirm',{version:v.licence.version})}</button>:null}
        <button type="button" className={BTN_GHOST} onClick={()=>{setEditing(v.licence.licence_id);setForm(formFromLicence(v.licence));setBad([]);}}>{t('edit')}</button>
       </td>
      </tr>))}</tbody>
    </table>
    {views.length===0?<p className="px-4 py-3 text-xs text-text-muted">{t('empty')}</p>:null}
   </section>
   <div className="grid items-start gap-5 lg:grid-cols-2">
    {editing?<section className={`${CARD} flex flex-col gap-3.5`}>
     <div className={TINY}>{editing==='new'?t('form.newTitle'):t('form.editTitle')}</div>
     {field('source_label')}
     <div><label htmlFor="lic-kind" className={FIELD_LABEL}>{t('form.licence_kind')}</label><select id="lic-kind" className={INPUT} value={form.licence_kind} onChange={e=>setForm({...form,licence_kind:e.target.value as LicenceForm['licence_kind']})}>{LICENCE_KINDS.map(k=><option key={k} value={k}>{t(`kinds.${k}`)}</option>)}</select></div>
     {field('holder')}{field('terms_summary')}{field('evidence_path')}
     <fieldset className="flex flex-col gap-2"><legend className="mb-1.5 text-xs text-text-dim">{t('form.flags')}</legend>
      {FLAGS.map(k=><label key={k} className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={form[k]} onChange={e=>setForm({...form,[k]:e.target.checked})}/>{t(`flags.${k}`)}</label>)}
     </fieldset>
     {field('snippet_max_chars','number')}
     <div className="grid gap-3 sm:grid-cols-2">{field('valid_from','date')}{field('valid_to','date')}</div>
     <p className={TINY}>{t('form.materialNote')}</p>
     <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={()=>void save()}>{t('form.save')}</button><button type="button" className={BTN_GHOST} onClick={()=>setEditing(null)}>{t('form.cancel')}</button></div>
    </section>:null}
    {sel?<section className={`${CARD} flex flex-col gap-3`}>
     <div className={TINY}>{t('impact.title',{label:sel.licence.source_label})}</div>
     <table className="w-full text-xs"><tbody className="divide-y divide-border">
      {(['publishedReports','hiddenReports','approvedSnippets','approvedSummaries','revertedTexts'] as const).map(k=><tr key={k}><td className={`${TD} text-text-dim`}>{t(`impact.${k}`)}</td><td className={`${TD} text-right font-mono`}>{sel[k]}</td></tr>)}
     </tbody></table>
     <p className={TINY}>{t('impact.note')}</p>
     <div className={H3}>{t('impact.window')}</div>
     <p className="font-mono text-xs text-text-dim">{sel.licence.valid_from} → {sel.licence.valid_to??'∞'}</p>
    </section>:null}
   </div>
  </div>
 );
}
