// Topic plan T6.8: disclosure, preview and version transitions for one saved draft.
'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {adminJson} from '@/app/(app)/admin/topics/_shared/admin-fetch';
import type {Bilingual} from '@/lib/topics/types';
import {BUTTON,FlowBar,PANEL} from '../editor/FlowBar';
import {DisclosureTable,MONO} from './DisclosureTable';
import {PreviewBlock} from './PreviewBlock';
import {PublishDialog} from './PublishDialog';
import {UnpublishDialog,type Withdrawal} from './UnpublishDialog';
import {RetireDialog} from './RetireDialog';
import {VersionsTable} from './VersionsTable';
import {publishModel,type Preview,type Receipt,type VersionRow} from './publish-model';
type Initial={id:string;slug:string;revision:number;draft_hash:string;title:Bilingual;retired:boolean;versions:VersionRow[];
 receipt:(Pick<Receipt,'passed'|'checks'>&{created_at:string;receipt_id:string})|null};
type Dialog='publish'|'unpublish'|'retire';
export function PublishClient({initial}:{initial:Initial}){
 const t=useTranslations('topicsAdmin'),title=initial.title[useLocale().startsWith('zh')?'zh':'en'];
 const base='/'+initial.id,editorHref='/admin/topics'+base;
 const [receipt,setReceipt]=useState<Receipt|null>(initial.receipt&&{...initial.receipt,draft_hash:initial.draft_hash});
 const [versions,setVersions]=useState(initial.versions),[retired,setRetired]=useState(initial.retired);
 const [preview,setPreview]=useState<Preview|null>(null),[dialog,setDialog]=useState<Dialog|null>(null);
 const [pending,setPending]=useState<string|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [reload,setReload]=useState(false),lock=useRef(false),opener=useRef<HTMLButtonElement|null>(null);
 const restoreFocus=useRef(false),workspace=useRef<HTMLDivElement>(null);
 const busy=pending!==null,disabled=busy||retired||reload;
 const model=publishModel({receipt,versions,retired,draftHash:initial.draft_hash,preview:preview&&{counts:preview.counts,evidence:preview.difference.length,expected_slots:preview.dossier.expected_slots.length}});
 const current=versions.find(v=>v.status==='current'),previous=versions.find(v=>v.status==='superseded');
 useEffect(()=>{
  if(dialog||busy||!restoreFocus.current)return;
  restoreFocus.current=false;
  const button=opener.current;
  if(button?.isConnected&&!button.disabled)button.focus();
  else workspace.current?.focus();
 },[dialog,busy]);
 function close(){restoreFocus.current=true;setDialog(null);}
 function failed(code:string){
  setError(code);
  if(code==='topic_retired'){setRetired(true);close();}
  if(code==='publish_blocked:draft_changed'){setReceipt(null);setPreview(null);setReload(true);close();}
  if((code==='publish_blocked:disclosure_required'||code==='publish_blocked:disclosure_receipt')){setReceipt(null);close();}
 }
 async function run(action:string,fn:()=>Promise<void>){
  if(lock.current||retired||reload)return;
  lock.current=true;setPending(action);setError('');setStatus('');
  try{await fn();}finally{lock.current=false;setPending(null);}
 }
 async function check(){
  const result=await adminJson<Receipt>('POST',base+'/disclosure-check');
  if(!result.ok){failed(result.code);return;}
  if(result.data.draft_hash!==initial.draft_hash){failed('publish_blocked:draft_changed');return;}
  setReceipt(result.data);setPreview(null);
 }
 async function generate(){
  const result=await adminJson<Preview>('GET',base+'/preview');
  if(!result.ok){failed(result.code);return null;}
  if(result.data.draft_hash!==initial.draft_hash){failed('publish_blocked:draft_changed');return null;}
  setPreview(result.data);return result.data;
 }
 async function open(kind:Dialog,button:HTMLButtonElement){
  opener.current=button;setError('');
  if(kind==='publish'){
   if(!model.canPublish)return;
   const data=preview??await generate();
   if(!data||data.degraded)return;
  }
  setDialog(kind);
 }
 async function refreshVersions(){
  const result=await adminJson<{versions:VersionRow[]}>('GET',base+'/versions');
  if(result.ok)setVersions(result.data.versions);
  else{failed(result.code);setReload(true);}
 }
 async function publish(){
  const result=await adminJson<{version_no:number}>('POST',base+'/publish',{expected_draft_hash:initial.draft_hash});
  if(!result.ok){failed(result.code);return;}
  close();setStatus(t('publish.published',{n:result.data.version_no}));setPreview(null);await refreshVersions();
 }
 async function withdraw(action:'unpublish'|'retire',body:Withdrawal){
  const result=await adminJson('POST',base+'/'+action,body);
  if(!result.ok){failed(result.code);return;}
  close();
  if(action==='retire'){setRetired(true);setStatus(t('status.retired'));}
  else{setPreview(null);await refreshVersions();}
 }
 const errorNode=error&&<div role="alert" className="text-sm text-danger">{error.replace(/^publish_blocked:/,'').split(',').map(code=><p key={code}><code className={MONO}>{code}</code> {t.has('publish.code.'+code)?t('publish.code.'+code):t('errors.generic')}</p>)}</div>;
 const modalProps={onClose:close,busy,error:errorNode};
 const openFrom=(kind:Dialog,button:HTMLButtonElement)=>void run('open',()=>open(kind,button));
 return <div className="space-y-4" ref={workspace} tabIndex={-1}>
  {status&&<p role="status" className={MONO}>{status}</p>}{retired&&!status&&<p role="status">{t('status.retired')}</p>}
  {!dialog&&errorNode}{reload&&<button className={BUTTON} onClick={()=>window.location.reload()}>{t('editor.reload')}</button>}
  <div className="grid items-start gap-4 lg:grid-cols-2">
   <DisclosureTable receipt={receipt} totals={model.totals} editorHref={editorHref} disabled={disabled} running={pending==='check'} onRun={()=>void run('check',check)}/>
   <div className="min-w-0 space-y-4"><section id="summary" className={PANEL}><h2 className="font-semibold">{t('publish.summary')}</h2>
    <p>{t('publish.summaryOff')}</p><p className="text-sm text-text-dim">{t('publish.summaryHint')}</p></section>
    <PreviewBlock preview={preview} disabled={disabled} onGenerate={()=>void run('preview',async()=>{await generate();})}/></div>
   <section id="publish" className={PANEL}><h2 className="font-semibold">{t('publish.confirm')}</h2>
    <button className={`${BUTTON} border-accent text-accent`} disabled={disabled||!model.canPublish||preview?.degraded} onClick={e=>openFrom('publish',e.currentTarget)}>{t('publish.action')}</button>
    <span className={`ml-2 text-sm text-text-dim ${MONO}`}>{model.reason==='blocked'?t('publish.remaining',{n:model.remaining}):model.reason==='retired'?t('status.retired'):model.reason!=='ok'?t('publish.first'):preview?.degraded?t('publish.code.resolver_degraded'):null}</span></section>
   <section className={`${PANEL} border-danger`}><h2 className="font-semibold">{t('publish.unpublish')}</h2>
    <p className="text-sm text-text-dim">{t('publish.withdrawHint')}</p><button className={`${BUTTON} text-danger`} disabled={disabled||!current} onClick={e=>openFrom('unpublish',e.currentTarget)}>{t('publish.unpublish')}</button></section>
   <section className={`${PANEL} border-danger`}><h2 className="font-semibold">{t('publish.retire')}</h2>
    <p className={`text-sm text-text-dim ${MONO}`}>{t('publish.retireHint',{slug:initial.slug})}</p><button className={`${BUTTON} text-danger`} disabled={disabled} onClick={e=>openFrom('retire',e.currentTarget)}>{t('publish.retire')}</button></section>
   <VersionsTable versions={versions} disabled={disabled} onUnpublish={button=>openFrom('unpublish',button)}/>
  </div>
  <FlowBar editorHref={editorHref} publishHref={editorHref+'/publish'}/>
  {dialog==='publish'&&model.dialog&&<PublishDialog {...modalProps} title={title} n={model.nextVersion} summary={model.dialog} onConfirm={()=>void run('publish',publish)}/>}
  {dialog==='unpublish'&&current&&<UnpublishDialog {...modalProps} n={current.version_no} previous={previous?.version_no??null} onConfirm={body=>void run('unpublish',()=>withdraw('unpublish',body))}/>}
  {dialog==='retire'&&<RetireDialog {...modalProps} title={title} slug={initial.slug} onConfirm={body=>void run('retire',()=>withdraw('retire',body))}/>}
 </div>;
}
