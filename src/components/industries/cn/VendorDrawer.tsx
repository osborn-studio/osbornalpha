'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {SourceDrawerShell} from '@/components/research-ui/source-drawer/SourceDrawer';
import {MarkTag} from '@/components/research-ui/MarkTag';
import {readReplayResult,vendorCellPayload,vendorReplayUrl,type VendorDrawerPayload} from '../drawer-model';
import {adaptVendorDrawer} from '../source-drawer-adapter';
import {formatCell} from './format';
import {OriginTag} from './OriginTag';

const action='rounded border border-border px-3 py-2 text-xs hover:border-accent focus-visible:outline-accent';
type Observation=Extract<VendorDrawerPayload,{kind:'vendor_observation'}>;

function Replay({payload,onClose,formId}:{payload:Observation;onClose:()=>void;formId:string}){
 const t=useTranslations('industries.cnDrawer');
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function replay(){
  controller.current?.abort();
  const request=new AbortController();
  controller.current=request;
  setPending(true);
  setMessage('');
  try{
   const response=await fetch(vendorReplayUrl(payload.cell),{cache:'no-store',signal:request.signal});
   const result=response.ok?readReplayResult(await response.json(),payload.header.runId):null;
   if(!request.signal.aborted)setMessage(result?`${t(result.match?'reproduced':'notReproduced')} · ${result.text??t('noParsedText')}`:t('replayFailed'));
  }catch{if(!request.signal.aborted)setMessage(t('replayFailed'));}
  finally{if(!request.signal.aborted)setPending(false);}
 }
 const available=payload.cell.status==='ok'&&Boolean(payload.cell.source?.locator);
 return <form id={formId} onSubmit={event=>{event.preventDefault();if(available&&!pending)void replay();}} className="space-y-2">
  <div className="flex flex-wrap gap-2">
   <button type="submit" disabled={!available||pending} className={`${action} text-accent disabled:opacity-60`}>{t('replay')}</button>
   <a href="#vendor-run" onClick={onClose} className={action}>{t('thisRun')}</a>
  </div>
  <p className="text-xs text-text-dim">{t(available?'replayNote':'noReplay')}</p>
  <p role="status" aria-busy={pending} className="font-mono text-xs tabular-nums">{pending?t('checking'):message}</p>
 </form>;
}

export function VendorDrawer({payload,onClose,onOpen}:{payload:VendorDrawerPayload;onClose:()=>void;onOpen:(p:VendorDrawerPayload)=>void}){
 const t=useTranslations('industries');
 const research=useTranslations('research.drawer');
 const locale=useLocale()==='en'?'en':'zh';
 const view=adaptVendorDrawer(payload,locale,t);
 const replayForm=useId();
 const [copied,setCopied]=useState(false);
 const [copyFailed,setCopyFailed]=useState(false);
 async function copy(){
  if(!view.sha)return;
  try{await navigator.clipboard.writeText(view.sha);setCopied(true);setCopyFailed(false);}
  catch{setCopyFailed(true);}
 }
 const kindLabel=payload.kind==='vendor_observation'?'drawer.kind.vendor':payload.kind==='vendor_derived'?'drawer.kind.derived':'cnDrawer.kindMembership';
 const footer=(payload.kind==='vendor_observation'||view.sha)&&<div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-bg-elevated px-4 py-2.5 sm:hidden">
  {payload.kind==='vendor_observation'&&<button type="submit" form={replayForm} disabled={payload.cell.status!=='ok'||!payload.cell.source?.locator}
    onClick={()=>document.getElementById(replayForm)?.scrollIntoView({block:'nearest'})}
    className={`${action} flex-1 bg-accent font-semibold text-bg disabled:opacity-60`}>{t('cnDrawer.mobileReplay')}</button>}
  {view.sha&&<button type="button" onClick={copy} className={action}>{research(copied?'copied':'copyHash')}</button>}
 </div>;
 const sectionNumbers={identity:1,source:2,times:3,transform:4,licence:5,links:6,inputs:6};
 return <SourceDrawerShell title={view.title} kind={payload.kind} mark="fact" onClose={onClose} footer={footer}>
  <header className="space-y-2 px-4 py-3">
   <p className="text-xs text-text-dim">{research('title')} · {t(kindLabel)}</p>
   <h2 className="break-words text-base font-semibold">{view.title}{payload.kind!=='vendor_membership'&&<span className="ml-2 font-mono text-sm font-normal tabular-nums">{formatCell(payload.cell,locale,t)} · {payload.cell.periodEnd}</span>}</h2>
   <div className="flex items-center gap-2 text-xs"><MarkTag kind="fact"/>
    {payload.kind==='vendor_derived'&&<OriginTag derived/>}
    {payload.kind==='vendor_observation'&&t('origin.vendor')}
   </div>
  </header>
  {view.sections.map(section=><section key={section.id} data-drawer-section={section.id} className="space-y-2 border-t border-border px-4 py-3">
   <h3 className="text-[10px] uppercase tracking-wide text-text-dim">{sectionNumbers[section.id]} · {section.id==='inputs'?t('cnDrawer.inputs'):research(`sections.${section.id}`)}</h3>
   {section.rows.length>0&&<dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs sm:grid-cols-[128px_minmax(0,1fr)]">
    {section.rows.map(r=><div key={r.key} className="contents"><dt className="text-text-dim">{r.label}</dt><dd className="break-words font-mono tabular-nums">{r.value}
     {r.key==='sha'&&view.sha&&<><button type="button" onClick={copy} className={`${action} ml-2`}>{research(copied?'copied':'copy')}</button>{copyFailed&&<span role="status">{t('cnDrawer.copyFailed')}</span>}</>}
    </dd></div>)}
   </dl>}
   {section.id==='links'&&payload.kind==='vendor_observation'&&<Replay payload={payload} onClose={onClose} formId={replayForm}/>}
   {section.id==='inputs'&&payload.kind==='vendor_derived'&&<>
    <div className="grid gap-2">{[...payload.derived.inputs].reverse().map((input,index)=>input?
     <button type="button" key={input.periodEnd} className={`${action} flex flex-wrap justify-between gap-2 text-left`}
      onClick={()=>onOpen(vendorCellPayload(payload.nodeName,input,payload.header))}>
      <span>{t(`cnMetrics.${input.metric}`)} · {input.periodEnd}</span><span className="font-mono tabular-nums">{formatCell(input,locale,t)} ▸</span>
     </button>:<p key={index} className="text-xs text-text-dim">{t('missing.no_prior_period')}</p>)}</div>
    {payload.derived.memberSetChanged&&<p className="text-xs">{t('cnDrawer.setChanged')}</p>}
    <p className="text-xs text-text-dim">{t('cnDrawer.inputsNote')}</p>
   </>}
  </section>)}
 </SourceDrawerShell>;
}
