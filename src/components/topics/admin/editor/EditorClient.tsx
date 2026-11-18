// Topic plan T5.5: explicit optimistic saves and debounced server-only lint.
'use client';
import {useEffect,useReducer,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useDisplayTimezone} from '@/components/TimezoneProvider';
import type {DraftBody} from '@/lib/topics/types';
import type {LintFinding} from '@/lib/topics/drafts';
import type {Candidate,EvidenceView} from '@/lib/topics/evidence-search';
import {TopicAdminFrame} from '@/app/(app)/admin/topics/_shared/TopicAdminFrame';
import {adminJson,baseCode} from '@/app/(app)/admin/topics/_shared/admin-fetch';
import {reduce} from './editor-state';
import {OutlineColumn} from './OutlineColumn';
import {TextColumn} from './TextColumn';
import {PickerColumn} from './PickerColumn';
import {BUTTON,FlowBar} from './FlowBar';
export interface EditorInitial{id:string;slug:string;revision:number;body:DraftBody;updated_at:string;public_enabled:boolean;retired:boolean;lint:LintFinding[];evidence:EvidenceView[]}
type Inspection={lint:LintFinding[];evidence:EvidenceView[]};
export function EditorClient({initial,publishHref=`/admin/topics/${initial.id}/publish`}:{initial:EditorInitial;publishHref?:string}){
 const t=useTranslations('topicsAdmin'),userLocale=useLocale(),timezone=useDisplayTimezone();
 const [body,dispatch]=useReducer(reduce,initial.body),[saved,setSaved]=useState({revision:initial.revision,body:initial.body,time:initial.updated_at});
 const [evidence,setEvidence]=useState(initial.evidence),[lint,setLint]=useState(initial.lint),[locale,setLocale]=useState<'zh'|'en'>(userLocale.startsWith('zh')?'zh':'en');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState<string|null>(null),[lintError,setLintError]=useState<string|null>(null);
 const sending=useRef(false),generation=useRef(0),currentBody=useRef(body);currentBody.current=body;
 const dirty=JSON.stringify(body)!==JSON.stringify(saved.body),readOnly=initial.retired;
 useEffect(()=>{
  if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 useEffect(()=>{
  if(readOnly)return;
  const request=++generation.current;let active=true;
  const timer=setTimeout(async()=>{
   if(!active||request!==generation.current)return;
   setBusy(true);const result=await adminJson<Inspection>('POST',`/${initial.id}/lint`,{body});
   if(!active||request!==generation.current||currentBody.current!==body)return;
   setBusy(false);if(result.ok){setLint(result.data.lint);setEvidence(result.data.evidence);setLintError(null);}else setLintError(result.code);
  },500);
  return()=>{active=false;clearTimeout(timer);};
 },[body,initial.id,readOnly]);
 async function save(){
  if(sending.current||readOnly)return;sending.current=true;setPending(true);setError(null);
  const submitted=body,revision=saved.revision;
  try{
   const result=await adminJson<Inspection&{revision:number}>('PUT',`/${initial.id}/draft`,{expected_revision:revision,body:submitted});
   if(!result.ok){setError(result.code);return;}
   setSaved({revision:result.data.revision,body:submitted,time:new Date().toISOString()});
   // A save response belongs to its submitted body, never to newer typing.
   if(currentBody.current===submitted){setLint(result.data.lint);setEvidence(result.data.evidence);}
   const checkedBody=currentBody.current,request=++generation.current;setBusy(true);
   const checked=await adminJson<Inspection>('POST',`/${initial.id}/lint`,{body:checkedBody});
   if(request===generation.current&&currentBody.current===checkedBody){
    setBusy(false);if(checked.ok){setLint(checked.data.lint);setEvidence(checked.data.evidence);setLintError(null);}else setLintError(checked.code);
   }
  }finally{sending.current=false;setPending(false);}
 }
 function add(candidate:Candidate,section:string){
  const next=reduce(body,{type:'addEvidence',ref:candidate.ref,section});if(next===body)return;
  dispatch({type:'addEvidence',ref:candidate.ref,section});const ordinal=next.evidence.at(-1)!.ordinal;
  setEvidence(old=>[...old.filter(e=>e.ordinal!==ordinal),{ordinal,kind:candidate.ref.kind,label:candidate.label,...candidate.public,period:null}]);
 }
 const chips=<><span suppressHydrationWarning data-testid="draft-revision" className="rounded border border-border px-2 py-1 font-mono tabular-nums">{t('editor.revision',{n:saved.revision,time:new Date(saved.time).toLocaleString(userLocale,{timeZone:timezone})})}</span><span className="break-all rounded border border-border px-2 py-1 font-mono tabular-nums">{t('editor.slug',{slug:initial.slug})}</span><span className="rounded border border-border px-2 py-1">{t(initial.public_enabled?'frame.publicOpen':'frame.publicClosed')}</span></>;
 return <TopicAdminFrame wide crumb={body.title[locale]} title={t('editor.title')} headerChips={chips}>
  {readOnly&&<p className="text-sm text-text-dim">{t('editor.retired')}</p>}
  {error&&<div role="alert" className="text-sm text-danger">{t(baseCode(error)==='revision_conflict'?'editor.conflict':'errors.generic')} {baseCode(error)==='revision_conflict'?<button className={BUTTON} type="button" onClick={()=>window.location.reload()}>{t('editor.reload')}</button>:<span className="font-mono tabular-nums">{error}</span>}</div>}
  {lintError&&<p role="alert" className="text-xs text-danger">{t('errors.generic')} <span className="font-mono tabular-nums">{lintError}</span></p>}
  <div className="grid min-w-0 grid-cols-1 items-start gap-3 min-[1280px]:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(360px,460px)]">
   <OutlineColumn body={body} evidence={evidence} locale={locale} dispatch={dispatch} readOnly={readOnly}/>
   <TextColumn body={body} evidence={evidence} lint={lint} busy={busy} locale={locale} setLocale={setLocale} dispatch={dispatch} readOnly={readOnly}/>
   <PickerColumn id={initial.id} body={body} locale={locale} onAdd={add} readOnly={readOnly}/>
  </div>
  <FlowBar dirty={dirty} pending={pending} readOnly={readOnly} onSave={save} publishHref={publishHref}/>
 </TopicAdminFrame>;
}
