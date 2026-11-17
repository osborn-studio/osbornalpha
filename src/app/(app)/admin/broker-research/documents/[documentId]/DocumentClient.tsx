// src/app/(app)/admin/broker-research/documents/[documentId]/DocumentClient.tsx
'use client';
// Document page (spec §6.2, §6.5, §9.5; Document artboard): status, sha, licence, actions (view original
// via the ★ signed-URL route, parse, extract, summarize zh/en, translate title, review), immutable runs,
// withdraw (reason required, optional purge) and purge steps (repeatable; sha256 first 8 chars to confirm).
import {useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useLocale,useTranslations} from 'next-intl';
import type {DocumentRow,LicenceRow,ReportRow,RunRow,PurgeStepRow} from '@/lib/broker-research/types';
interface DocumentPageData{document:DocumentRow;licence:LicenceRow|null;report:ReportRow|null;runs:RunRow[];purgeSteps:PurgeStepRow[]}
import type {PurgeStep} from '@/lib/broker-research/types';
import {fmtInstant,shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CARD,CARD_FLUSH,CHIP,H1,H2,INPUT,TD,TH,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_PRIMARY,CHIP_ACCENT,CHIP_DANGER,CHIP_WARN,ERROR_BAR,FIELD_LABEL,H3} from '../../review/[reportId]/review-model';
import {adminJson,baseCode} from '../../review/[reportId]/review-model';

const PURGE_STEPS:PurgeStep[]=['pdf','artifacts','runs','fields_text','snippets_text','summaries','quarantine_payload'];

export function DocumentClient({data}:{data:DocumentPageData}){
 const t=useTranslations('foreign-research.admin.document');
 const te=useTranslations('foreign-research.admin.errors');
 const locale=useLocale();const router=useRouter();
 const {document:doc,licence,report,runs,purgeSteps}=data;
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [notice,setNotice]=useState<string|null>(null);
 const [reason,setReason]=useState('');const [alsoPurge,setAlsoPurge]=useState(false);const [confirmSha,setConfirmSha]=useState('');
 const withdrawn=doc.status==='withdrawn';
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});
 async function act(key:string,method:'GET'|'POST',path:string,body?:unknown,after?:(d:unknown)=>void){
  setBusy(key);setError(null);setNotice(null);
  const r=await adminJson(method,path,body);
  setBusy(null);
  if(!r.ok){setError(errText(r.code));return;}
  after?.(r.data);router.refresh();
 }
 async function viewOriginal(){
  // Reserve the window during the click gesture; awaiting the log/URL request first triggers popup blockers.
  const popup=window.open('about:blank','_blank');
  if(!popup){setError(errText('popup_blocked'));return;}
  popup.opener=null;setBusy('url');setError(null);setNotice(null);
  const r=await adminJson<{url:string}>('GET',`/documents/${doc.document_id}/url`);
  setBusy(null);
  if(!r.ok){popup.close();setError(errText(r.code));return;}
  if(!r.data.url){popup.close();setError(errText('payload_invalid'));return;}
  popup.location.replace(r.data.url);
 }
 const stepStatus=(s:PurgeStep)=>purgeSteps.find(p=>p.step===s);
 const statusChip=withdrawn?CHIP_DANGER:doc.status==='parse_failed'?CHIP_WARN:report?.review_status==='in_review'||report?.review_status==='pending'?CHIP_WARN:CHIP;
 return (
  <div className="flex flex-col gap-5">
   {error?<div role="alert" className={ERROR_BAR}>{error}</div>:null}{notice?<div role="status" className={`${CARD} text-xs text-text-dim`}>{notice}</div>:null}
   <section className="flex flex-wrap items-end gap-5">
    <div className="min-w-0"><h1 className={`${H1} break-all`}>{doc.original_filename}</h1>
     <div className="mt-1.5 flex flex-wrap items-center gap-2"><span className={statusChip}>{t(`status.${doc.status}`)}{report?` · ${t(`review.${report.review_status}`)}`:''}</span>
      <span className="font-mono text-[11px] text-text-dim" title={doc.sha256}>sha256 {doc.sha256.slice(0,8)}…{doc.sha256.slice(-4)}</span>
      <span className={TINY}>{t('licenceLine',{label:licence?.source_label??'—',version:licence?.version??'—',pages:doc.page_count??'—'})}</span>
      {doc.promotion_pending?<span className={CHIP_WARN}>{t('promotionPending')}</span>:null}{doc.verify_status?<span className={doc.verify_status==='ok'?CHIP:CHIP_WARN}>{t('verify',{status:doc.verify_status})}</span>:null}</div></div>
    <div className="flex flex-wrap gap-2 lg:ml-auto">
     <button type="button" className={BTN} disabled={withdrawn||busy!==null} onClick={()=>void viewOriginal()}>{t('actions.viewOriginal')}</button>
     <button type="button" className={BTN} disabled={withdrawn||busy!==null} onClick={()=>void act('parse','POST',`/documents/${doc.document_id}/parse`)}>{busy==='parse'?t('working'):t('actions.parse')}</button>
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||doc.status!=='parsed'} onClick={()=>void act('extract','POST',`/documents/${doc.document_id}/extract`)}>{busy==='extract'?t('working'):t('actions.extract')}</button>
     {(['zh','en'] as const).map(lang=><button key={lang} type="button" className={BTN} disabled={withdrawn||busy!==null||!report} onClick={()=>void act(`summary-${lang}`,'POST',`/reports/${report!.report_id}/summary`,{lang})}>{busy===`summary-${lang}`?t('working'):t('actions.summarize',{lang})}</button>)}
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||!report} onClick={()=>void act('translate','POST',`/reports/${report!.report_id}/translate`)}>{t('actions.translate')}</button>
     <button type="button" className={BTN} disabled={withdrawn||busy!==null||report?.status!=='published'} onClick={()=>void act('verify','POST',`/documents/${doc.document_id}/verify`,{},d=>setNotice(t('verify',{status:String((d as {outcome?:string}).outcome??'—')})))}>{busy==='verify'?t('working'):t('actions.verify')}</button>
     {report?<Link href={`/admin/broker-research/review/${report.report_id}`} className={`${BTN_PRIMARY} hover:no-underline`}>{t('actions.review')}</Link>:null}
    </div>
   </section>
   <p className={TINY}>{t('actionsNote')}</p>
   <section className={CARD_FLUSH}>
    <div className="px-4 py-3.5"><h2 className={H2}>{t('runs.title')}</h2></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
     <thead className="border-b border-border"><tr>{(['run','kind','started','status','artifact','versions'] as const).map(c=><th key={c} scope="col" className={`${TH} ${c==='run'?'pl-4':''}`}>{t(`runs.${c}`)}</th>)}<th className={`${TH} pr-4`}><span className="sr-only">{t('runs.detail')}</span></th></tr></thead>
     <tbody className="divide-y divide-border">{runs.map(r=>(
      <tr key={r.run_id}>
       <td className={`${TD} pl-4 font-mono text-[11px]`} title={r.run_id}>{shortId(r.run_id)}</td><td className={TD}>{r.kind}</td>
       <td className={`${TD} whitespace-nowrap font-mono text-text-dim`}>{fmtInstant(r.started_at,locale)}</td>
       <td className={TD}><span className={r.status==='succeeded'?CHIP:r.status==='failed'?CHIP_DANGER:CHIP_WARN}>{r.status}{typeof r.detail?.error_code==='string'?` · ${r.detail.error_code}`:''}</span></td>
       <td className={`${TD} font-mono text-[11px] text-text-dim`}>{shortId(r.artifact_hash??r.response_path??r.request_path)}</td>
       <td className={`${TD} font-mono text-[11px] text-text-dim`}>{r.code_version} · {r.prompt_version??r.extractor_version??'—'}</td>
       <td className={`${TD} pr-4`}><details><summary className="cursor-pointer text-xs text-text-dim">{t('runs.detail')}</summary><pre className="mt-1 max-h-64 max-w-md overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-elevated p-2 font-mono text-[11px]">{JSON.stringify({model_id:r.model_id,registry_hash:r.registry_hash,schema_version:r.schema_version,behavior_digest:r.behavior_digest,licence_version:r.licence_version,batch_id:r.batch_id,detail:r.detail},null,2)}</pre></details></td>
      </tr>))}</tbody>
    </table></div>
    {runs.length===0?<p className="px-4 pb-3 text-xs text-text-muted">{t('runs.empty')}</p>:null}
   </section>
   <div className="grid items-start gap-5 lg:grid-cols-2">
    <section className={`${CARD} flex flex-col gap-3`}>
     <h2 className={H3}>{t('withdraw.title')}</h2><p className="text-xs text-text-dim">{t('withdraw.body')}</p>
     {withdrawn?<p className="text-xs text-text">{t('withdraw.done',{date:fmtInstant(doc.withdrawn_at,locale),reason:doc.withdrawn_reason??'—'})}</p>:<>
      <div><label htmlFor="wd-reason" className={FIELD_LABEL}>{t('withdraw.reason')}</label><input id="wd-reason" className={INPUT} value={reason} onChange={e=>setReason(e.target.value)} placeholder={t('withdraw.placeholder')}/></div>
      <label className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={alsoPurge} onChange={e=>setAlsoPurge(e.target.checked)}/>{t('withdraw.alsoPurge')}</label>
      <button type="button" className={`${BTN} self-start`} disabled={!reason.trim()||busy!==null} onClick={()=>void act('withdraw','POST',`/documents/${doc.document_id}/withdraw`,{reason:reason.trim(),purge:alsoPurge},()=>setNotice(t('withdraw.ok')))}>{t('withdraw.submit')}</button></>}
    </section>
    <section className={`${CARD} flex flex-col gap-3 border-[color-mix(in_srgb,var(--danger)_40%,transparent)]`}>
     <div className="flex items-center gap-2"><h2 className={H3}>{t('purge.title')}</h2><span className={CHIP_DANGER}>{t('purge.irreversible')}</span></div>
     <ol className="flex flex-col gap-2">{PURGE_STEPS.map((s,i)=>{const st=stepStatus(s);return (
      <li key={s} className="flex items-start gap-2.5 text-xs"><span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${st?.status==='done'?'border-[var(--border-active)] text-accent':st?.status==='failed'?'border-danger text-danger':'border-border text-text-muted'}`}>{st?.status==='done'?'✓':i+1}</span>
       <div><div className={st?.status==='done'?'text-text-dim':'text-text'}>{t(`purge.steps.${s}`)}</div>{st?<div className={TINY}>{st.status} · {t('purge.attempts',{n:st.attempts})}{st.last_error?` · ${st.last_error}`:''}</div>:null}</div></li>);})}</ol>
     {doc.purged_at?<span className={`${CHIP_ACCENT} self-start`}>{t('purge.done',{date:fmtInstant(doc.purged_at,locale)})}</span>:<>
      <div><label htmlFor="pg-sha" className={FIELD_LABEL}>{t('purge.confirm')}</label><input id="pg-sha" className={`${INPUT} font-mono`} value={confirmSha} onChange={e=>setConfirmSha(e.target.value.trim().toLowerCase())} placeholder={doc.sha256.slice(0,8)}/></div>
      <button type="button" className={`${BTN} self-start border-[color-mix(in_srgb,var(--danger)_50%,transparent)]`} disabled={!withdrawn||confirmSha!==doc.sha256.slice(0,8)||busy!==null} onClick={()=>void act('purge','POST',`/documents/${doc.document_id}/purge`)}>{purgeSteps.length?t('purge.retry'):t('purge.run')}</button>
      {!withdrawn?<p className={TINY}>{t('purge.needsWithdraw')}</p>:null}</>}
    </section>
   </div>
   <Link href={`/admin/broker-research/access-log?document=${doc.document_id}`} className="text-xs">{t('accessLog')}</Link>
  </div>
 );
}
