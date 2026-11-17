// src/app/(app)/admin/broker-research/upload/UploadClient.tsx
'use client';
// Upload flow (spec §6.1, §9.5; Upload artboard): drop → sha256 → licence → intent (dedupe) → direct
// PUT to the signed URL → commit. The file never passes through the app server.
import {useRef,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {BTN,CALLOUT,CARD,EN,H1,INPUT,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_GHOST,BTN_PRIMARY,CHIP_ACCENT,ERROR_BAR,FIELD_LABEL} from '../_shared/admin-fetch';
import {adminJson,baseCode,errorField} from '../_shared/admin-fetch';
import {putSigned,sha256Hex,sniffPdf,validatePdfFile} from './upload-client';

export interface UploadLicence{licenceId:string;label:string;version:number;confirmed:boolean;confirmedAt:string|null}
type Phase='idle'|'hashing'|'ready'|'intent'|'uploading'|'committing'|'done'|'duplicate'|'error';
const STEPS=['drop','sha','dedupe','licence','upload','commit'] as const;
const stepIndex=(p:Phase)=>p==='idle'?0:p==='hashing'?1:p==='ready'?3:p==='intent'?2:p==='uploading'?4:p==='committing'?5:p==='done'?6:0;

export function UploadClient({licences}:{licences:UploadLicence[]}){
 const t=useTranslations('foreign-research.admin.upload');
 const te=useTranslations('foreign-research.admin.errors');
 const selection=useRef(0);const sending=useRef(false);
 const [file,setFile]=useState<File|null>(null);const [sha,setSha]=useState<string|null>(null);
 const [licenceId,setLicenceId]=useState('');const [phase,setPhase]=useState<Phase>('idle');
 const [progress,setProgress]=useState<[number,number]>([0,0]);const [error,setError]=useState<string|null>(null);
 const [documentId,setDocumentId]=useState<string|null>(null);
 const errText=(code:string)=>te.has(baseCode(code))?te(baseCode(code)):te('generic',{code});

 async function choose(f:File|undefined){
  if(sending.current)return;
  const request=++selection.current;
  setError(null);setDocumentId(null);setSha(null);setFile(null);setPhase('idle');
  if(!f)return;
  const bad=validatePdfFile(f);if(bad){setPhase('error');setError(errText(bad));return;}
  setPhase('hashing');
  try{
   const pdf=await sniffPdf(f);if(request!==selection.current)return;
   if(!pdf){setPhase('error');setError(errText('not_pdf'));return;}
   const hash=await sha256Hex(f);if(request!==selection.current)return;
   setFile(f);setSha(hash);setPhase('ready');
  }catch{if(request===selection.current){setPhase('error');setError(errText('upload_failed'));}}
 }
 async function commit(intentId:string,retry=true):Promise<void>{
  const r=await adminJson<{documentId:string}>('POST','/documents/commit',{intentId});
  if(r.ok){setDocumentId(r.data.documentId);setPhase('done');return;}
  if(r.code==='intent_busy'&&retry){await new Promise(res=>setTimeout(res,1500));return commit(intentId,false);}
  if(r.code==='duplicate_document'){const id=errorField(r.body,'documentId','document_id');setDocumentId(typeof id==='string'?id:null);setPhase('duplicate');return;}
  setPhase('error');setError(errText(r.code));
 }
 async function upload(){
  if(!file||!sha||!licenceId||sending.current)return;
  sending.current=true;
  try{
  setError(null);setPhase('intent');
  const r=await adminJson<{intentId:string;uploadUrl:string;token:string}>('POST','/documents/intent',{sha256:sha,byte_size:file.size,licence_id:licenceId,original_filename:file.name});
  if(!r.ok){
   if(r.code==='duplicate_document'){const id=errorField(r.body,'documentId','document_id');setDocumentId(typeof id==='string'?id:null);setPhase('duplicate');return;}
   setPhase('error');setError(errText(r.code));return;
  }
  setPhase('uploading');setProgress([0,file.size]);
  try{await putSigned(r.data.uploadUrl,file,(a,b)=>setProgress([a,b]));}
  catch{setPhase('error');setError(errText('upload_failed'));return;}
  setPhase('committing');await commit(r.data.intentId);
  }finally{sending.current=false;}
 }
 const cur=stepIndex(phase);
 const working=phase==='intent'||phase==='uploading'||phase==='committing';
 const mb=(n:number)=>(n/1048576).toFixed(1);
 return (
  <div className="flex flex-col gap-5">
   <h1 className={H1}>{t('title')}<span className={EN}>{t('titleEn')}</span></h1>
   <ol className="flex flex-wrap gap-4">{STEPS.map((s,i)=><li key={s} className="flex items-center gap-1.5 text-xs" aria-current={i===cur?'step':undefined}>
    <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${i<cur?'border-[var(--border-active)] text-accent':i===cur?'border-accent text-text':'border-border text-text-muted'}`}>{i<cur?'✓':i+1}</span><span className={i===cur?'text-text':'text-text-dim'}>{t(`steps.${s}`)}</span></li>)}</ol>
   <div className="grid items-start gap-5 lg:grid-cols-12">
    <section className={`${CARD} flex flex-col gap-4 lg:col-span-7`}>
     <label onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void choose(e.dataTransfer.files[0]);}} className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-7 text-center hover:border-[var(--border-active)]">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
      <span className="text-xs text-text-dim">{t('drop')}</span><span className={TINY}>{t('dropNote')}</span>
      <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={working} onChange={e=>void choose(e.target.files?.[0])}/>
     </label>
     {file?<dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('file')}</dt><dd className="break-all">{file.name} · <span className="font-mono">{mb(file.size)} MB</span></dd>
      <dt className="text-text-dim">sha256</dt><dd className="break-all font-mono text-text-dim">{sha??t('hashing')}</dd>
     </dl>:null}
     <div><label htmlFor="up-licence" className={FIELD_LABEL}>{t('licence')}</label>
      <select id="up-licence" className={INPUT} value={licenceId} onChange={e=>setLicenceId(e.target.value)} disabled={!sha||working}>
       <option value="">{t('licencePlaceholder')}</option>
       {licences.map(l=><option key={l.licenceId} value={l.licenceId}>{l.label} · v{l.version} · {l.confirmed?t('confirmed',{date:(l.confirmedAt??'').slice(0,10)}):t('unconfirmed')}</option>)}
      </select><p className={`${TINY} mt-1`}>{t('licenceHelp')}</p></div>
     <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={!sha||!licenceId||phase!=='ready'} onClick={()=>void upload()}>{t('submit')}</button><button type="button" className={BTN_GHOST} disabled={working} onClick={()=>void choose(undefined)}>{t('cancel')}</button></div>
    </section>
    <div className="flex flex-col gap-4 lg:col-span-5">
     {phase==='uploading'||phase==='committing'?<section className={`${CARD} flex flex-col gap-2.5`}>
      <div className={TINY}>{phase==='uploading'?t('uploading'):t('committing')}</div>
      <div className="h-1.5 overflow-hidden rounded bg-bg-elevated" role="progressbar" aria-valuemin={0} aria-valuemax={progress[1]} aria-valuenow={progress[0]}><div className="h-full bg-accent" style={{width:`${progress[1]?Math.round(progress[0]/progress[1]*100):0}%`}}/></div>
      <div className={TINY}><span className="font-mono">{mb(progress[0])} / {mb(progress[1])} MB</span> · {t('direct')}</div>
     </section>:null}
     {phase==='duplicate'?<section className={CALLOUT}>{t('duplicate')} {documentId?<Link href={`/admin/broker-research/documents/${documentId}`}>{t('openDocument')}</Link>:null}</section>:null}
     {phase==='done'&&documentId?<section className={`${CARD} flex flex-col gap-2`}><span className={`${CHIP_ACCENT} self-start`}>{t('done')}</span><Link href={`/admin/broker-research/documents/${documentId}`} className="text-xs">{t('openDocument')}</Link></section>:null}
     {error?<div role="alert" className={ERROR_BAR}>{error}{phase==='error'&&file?<button type="button" className={`${BTN} ml-auto`} onClick={()=>setPhase(sha?'ready':'idle')}>{t('retry')}</button>:null}</div>:null}
    </div>
   </div>
  </div>
 );
}
