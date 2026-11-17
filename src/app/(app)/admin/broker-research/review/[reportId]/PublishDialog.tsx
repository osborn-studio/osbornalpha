// src/app/(app)/admin/broker-research/review/[reportId]/PublishDialog.tsx
'use client';
// Publish dialog (spec §6.5, §9.5; Publish artboard). State A: blockers from GET publish-blockers,
// publish disabled. Ready: what will be public under the licence. State B: the immutable snapshot id,
// hash, rule receipt and licence version from GET publications/[publicationId]; outbox claim.register rows are
// written by the SQL publish function (the page does not enqueue anything).
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import type {LicenceRow,PublicationRow} from '@/lib/broker-research/public-types';
import {shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CALLOUT,H2,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_GHOST,BTN_PRIMARY,ERROR_BAR} from './review-model';
import {adminJson,baseCode} from './review-model';
import {blockerParts} from './review-model';

type Phase={kind:'loading'}|{kind:'blocked';blockers:string[]}|{kind:'ready'}|{kind:'publishing'}|{kind:'published';publicationId:string;publication:PublicationRow|null}|{kind:'error';code:string};
export function PublishDialog({reportId,licence,approvedSnippets,approvedSummaries,codeVersion,onClose}:{reportId:string;licence:LicenceRow;approvedSnippets:number;approvedSummaries:number;codeVersion:string;onClose:()=>void}){
 const t=useTranslations('foreign-research.admin.publish');
 const tr=useTranslations('foreign-research.admin.review');
 const te=useTranslations('foreign-research.admin.errors');
 const [phase,setPhase]=useState<Phase>({kind:'loading'});
 const closeRef=useRef<HTMLButtonElement>(null);
 async function check(){
  const r=await adminJson<{blockers:string[]}>('GET',`/reports/${reportId}/publish-blockers`);
  if(!r.ok){setPhase({kind:'error',code:r.code});return;}
  setPhase(r.data.blockers.length?{kind:'blocked',blockers:r.data.blockers}:{kind:'ready'});
 }
 useEffect(()=>{closeRef.current?.focus();void check();const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k);},[]);   // eslint-disable-line react-hooks/exhaustive-deps -- once on open
 async function publish(){
  setPhase({kind:'publishing'});
  const r=await adminJson<{publicationId:string}>('POST',`/reports/${reportId}/publish`,{});
  if(!r.ok){if(baseCode(r.code)==='publish_blocked'){await check();return;}setPhase({kind:'error',code:r.code});return;}
  const p=await adminJson<{publication:PublicationRow}>('GET',`/publications/${r.data.publicationId}`);
  setPhase({kind:'published',publicationId:r.data.publicationId,publication:p.ok?p.data.publication:null});
 }
 const label=(c:string)=>{const {key,arg}=blockerParts(c);return tr.has(`blockers.${key}`)?tr(`blockers.${key}`,{arg:arg??''}):c;};
 const willBePublic=[t('public.metadata'),licence.allows_public_target_price?t('public.target',{version:licence.version}):t('public.noTarget'),licence.allows_public_summary&&approvedSummaries?t('public.summary',{n:approvedSummaries}):null,licence.allows_public_snippets&&approvedSnippets?t('public.snippets',{n:approvedSnippets,max:licence.snippet_max_chars}):null].filter((x):x is string=>x!==null);
 return (
  <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] p-4 sm:p-12">
   <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-xl rounded-lg border border-border bg-bg-elevated shadow-[var(--shadow)]">
    <div className="border-b border-border px-6 py-5"><h2 id="publish-title" className={H2}>{phase.kind==='published'?t('doneTitle'):t('title')}</h2></div>
    <div className="flex flex-col gap-3 px-6 py-5">
     {phase.kind==='loading'||phase.kind==='publishing'?<p className={TINY}>{t('checking')}</p>:null}
     {phase.kind==='error'?<div role="alert" className={ERROR_BAR}>{te.has(baseCode(phase.code))?te(baseCode(phase.code)):te('generic',{code:phase.code})}</div>:null}
     {phase.kind==='blocked'?<><div className="text-[11px] text-text-dim">{t('blockers',{n:phase.blockers.length})}</div>{phase.blockers.map(b=><div key={b} className={ERROR_BAR}>{label(b)}</div>)}</>:null}
     {phase.kind==='blocked'||phase.kind==='ready'?<><div className="mt-1.5 text-[11px] text-text-dim">{t('willBePublic')}</div><ul className="list-disc pl-5 text-xs text-text-dim">{willBePublic.map(x=><li key={x}>{x}</li>)}</ul><p className={TINY}>{t('switchNote')}</p></>:null}
     {phase.kind==='published'?<><dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
      <dt className="text-text-dim">{t('snapshot')}</dt><dd className="break-all font-mono" title={phase.publicationId}>{shortId(phase.publicationId)} · {t('immutable')}</dd>
      <dt className="text-text-dim">{t('snapshotHash')}</dt><dd className="break-all font-mono">{phase.publication?.snapshot_hash??'—'}</dd>
      <dt className="text-text-dim">{t('rulesReceipt')}</dt><dd className="font-mono">{shortId(phase.publication?.rules_receipt_id)}</dd>
      <dt className="text-text-dim">{t('licenceVersion')}</dt><dd className="font-mono">v{phase.publication?.licence_version??'—'}</dd>
      <dt className="text-text-dim">{t('codeVersion')}</dt><dd className="font-mono">{codeVersion}</dd>
      <dt className="text-text-dim">{t('f4')}</dt><dd>{t('f4Queued')}</dd></dl>
      <p className={CALLOUT}>{t('afterNote')}</p></>:null}
    </div>
    <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
     {phase.kind==='published'?<><Link href={`/admin/broker-research/preview/${reportId}`} className={`${BTN} hover:no-underline`}>{t('viewPreview')}</Link><button ref={closeRef} type="button" className={BTN_PRIMARY} onClick={onClose}>{t('done')}</button></>:<>
      <button ref={closeRef} type="button" className={BTN_GHOST} onClick={onClose}>{t('cancel')}</button>
      <button type="button" className={BTN_PRIMARY} disabled={phase.kind!=='ready'} onClick={()=>void publish()}>{t('publish')}</button></>}
    </div>
   </div>
  </div>
 );
}
