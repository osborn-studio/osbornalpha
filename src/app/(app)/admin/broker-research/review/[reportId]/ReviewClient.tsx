// src/app/(app)/admin/broker-research/review/[reportId]/ReviewClient.tsx
'use client';
// Review two-pane page (spec §6.3, §9.5; Review artboard). Data only from the ★ routes (they log
// text_viewed first); every write goes through the C routes and is followed by a reload, so the page
// never infers materialised state. Panes: page text with evidence highlights and selection (UTF-16
// offsets) / editor tabs (targets, report-level, snippets, title, summaries) / blockers (review-ready
// and publish-ready columns) with review and publish actions.
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useTranslations} from 'next-intl';
import {effectiveValue} from '@/lib/broker-research/public-types';
import type {FieldName,FieldRow,ReportScope,ReviewPayload,SnippetPurpose} from '@/lib/broker-research/public-types';
import {SNIPPET_PURPOSES} from '@/lib/broker-research/public-types';
import {shortId} from '@/app/(app)/intel/foreign-research/components/format';
import {BTN,CALLOUT,CARD,CARD_FLUSH,CHIP,INPUT,TINY} from '@/app/(app)/intel/foreign-research/components/ui';
import {BTN_GHOST,BTN_PRIMARY,CHIP_ACCENT,CHIP_DANGER,CHIP_WARN,DOT,ERROR_BAR,FIELD_LABEL,H3} from './review-model';
import {adminJson,baseCode} from './review-model';
import {PublishDialog} from './PublishDialog';
import {ABSENT_FIELDS,REPORT_LEVEL,TARGET_LEVEL,blockerColumns,blockerParts,buildTyped,conflictGroups,correctionPayload,fieldKind,groupFields,isStaleRun,normalizeReviewPayload,remainingChars,segmentText,typedFormOf} from './review-model';
import type {TypedForm} from './review-model';

type Tab={kind:'target';key:string}|{kind:'report'}|{kind:'snippets'}|{kind:'title'}|{kind:'summaries'};
interface Sel{start:number;end:number;text:string;page:number;parseRunId:string}
/** Body of ★ GET documents/[documentId]/pages/[n] (C6). */
interface PageText{documentId:string;parseRunId:string;page:number;text:string;pageCount:number}
const SCOPES:ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];

function selectionIn(container:HTMLElement):{start:number;end:number;text:string}|null{
 const s=window.getSelection();if(!s||s.rangeCount===0||s.isCollapsed)return null;
 const r=s.getRangeAt(0);if(!container.contains(r.startContainer)||!container.contains(r.endContainer))return null;
 const pre=document.createRange();pre.selectNodeContents(container);pre.setEnd(r.startContainer,r.startOffset);
 const start=pre.toString().length,text=r.toString();return {start,end:start+text.length,text};
}

export function ReviewClient({reportId}:{reportId:string}){
 const t=useTranslations('foreign-research.admin.review');
 const te=useTranslations('foreign-research.admin.errors');
 const [data,setData]=useState<ReviewPayload|null>(null);const [loadCode,setLoadCode]=useState<string|null>(null);
 const [page,setPage]=useState(1);const [pageText,setPageText]=useState<PageText|null>(null);const [pageCode,setPageCode]=useState<string|null>(null);
 const [sel,setSel]=useState<Sel|null>(null);const [tab,setTab]=useState<Tab>({kind:'report'});
 const [busy,setBusy]=useState(false);const [code,setCode]=useState<string|null>(null);const [publishOpen,setPublishOpen]=useState(false);
 const textRef=useRef<HTMLDivElement>(null);
 const errText=(c:string)=>te.has(baseCode(c))?te(baseCode(c)):te('generic',{code:c});

 const load=useCallback(async()=>{
  const r=await adminJson<unknown>('GET',`/reports/${reportId}`);
  if(!r.ok){setLoadCode(r.code);return;}
  const p=normalizeReviewPayload(r.data);if(!p){setLoadCode('payload_invalid');return;}
  setData(p);setLoadCode(null);
 },[reportId]);
 useEffect(()=>{void load();},[load]);
 const docId=data?.document.document_id;
 const parseRunId=data?.document.current_parse_run_id;
 useEffect(()=>{
  if(!docId)return;let cancel=false;setSel(null);setPageText(null);setPageCode(null);
  void adminJson<PageText>('GET',`/documents/${docId}/pages/${page}`).then(r=>{if(cancel)return;if(r.ok){setPageText(r.data);setPageCode(null);}else{setPageText(null);setPageCode(r.code);}});
  return ()=>{cancel=true;};
 },[docId,page,parseRunId]);
 const tabInit=useRef(false);
 useEffect(()=>{if(data&&!tabInit.current){tabInit.current=true;if(data.targets.length>0)setTab({kind:'target',key:data.targets[0].target_key});}},[data]);   // first load: open the first target tab

 const [recheckFailures,setRecheckFailures]=useState<string[]>([]);
 async function post(path:string,body:unknown):Promise<boolean>{
  setBusy(true);setCode(null);
  const r=await adminJson('POST',path,body);
  setBusy(false);if(!r.ok)setCode(r.code);
  await load();return r.ok;
 }
 /** spec §4.11 重跑规则 (P-R1-08): shown while disclosure_ok=false; failures are listed, nothing changes until they are fixed. */
 async function recheckDisclosure(){
  setBusy(true);setCode(null);
  const r=await adminJson<{restored:boolean;failures:string[]}>('POST',`/reports/${reportId}/disclosure-recheck`,{});
  setBusy(false);if(!r.ok)setCode(r.code);else setRecheckFailures(r.data.restored?[]:r.data.failures);
  await load();
 }
 if(loadCode)return <div className={CALLOUT}>{loadCode==='document_withdrawn'?t('withdrawn'):errText(loadCode)}</div>;
 if(!data)return <div className={`${CARD} ${TINY}`} aria-busy="true">{t('loading')}</div>;

 const {report,document:doc,licence}=data;
 const live=[...groupFields(data.fields).values()].flat();
 const effectiveCount=live.filter(f=>f.status==='confirmed'||f.status==='corrected'||f.status==='absent').length;
 const conflicts=conflictGroups(data.fields);
 const stale=isStaleRun(doc.current_parse_run_id,data.fields);
 const cols=blockerColumns(data.blockers);
 const targetKeys=[...new Set([...data.targets.map(x=>x.target_key),...[...groupFields(data.fields).keys()].filter(k=>k!=='')])];
 const max=licence.snippet_max_chars;
 const spans=pageText?live.filter(f=>f.page===pageText.page&&f.parse_run_id===pageText.parseRunId&&f.char_start!==null&&f.char_end!==null).map(f=>({start:f.char_start!,end:f.char_end!,id:f.field_id})):[];
 const blockerLabel=(c:string)=>{const {key,arg}=blockerParts(c);return t.has(`blockers.${key}`)?t(`blockers.${key}`,{arg:arg??''}):c;};
 const published=report.status==='published';


 const tabs:[Tab,string][]=[...targetKeys.map(k=>[{kind:'target',key:k} as Tab,k] as [Tab,string]),[{kind:'report'},t('tabs.report')],[{kind:'snippets'},t('tabs.snippets')],[{kind:'title'},t('tabs.title')],[{kind:'summaries'},t('tabs.summaries')]];
 const sameTab=(a:Tab,b:Tab)=>a.kind===b.kind&&(a.kind!=='target'||(b.kind==='target'&&a.key===b.key));
 const ctxValue:ReviewCtxValue={data,report,post,reportId,published,busy,sel,pageText,live,conflicts,targetKeys,max};
 return (
  <ReviewCtx.Provider value={ctxValue}>
  <div className="flex flex-col gap-4">
   <header className="flex flex-wrap items-center gap-2">
    <span className="font-mono text-xs text-text-dim" title={report.report_id}>{t('crumb',{id:shortId(report.report_id)})}</span>
    <span className={CHIP}>{t('confirmedCount',{done:effectiveCount,total:live.length})}</span>
    <span className={published?CHIP_ACCENT:CHIP}>{report.status} · {report.review_status}</span>
    <Link href={`/admin/broker-research/documents/${doc.document_id}`} className="text-xs">{t('toDocument')}</Link>
    <Link href={`/admin/broker-research/preview/${report.report_id}`} className="text-xs">{t('toPreview')}</Link>
    <button type="button" className={`${BTN_PRIMARY} ml-auto`} disabled={published} onClick={()=>setPublishOpen(true)}>{t('actions.publish')}</button>
   </header>
   {stale?<div role="status" className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] px-3.5 py-2.5 text-xs"><span className={DOT('warn')}/>{t('staleRun',{run:shortId(doc.current_parse_run_id)})}</div>:null}
   {code?<div role="alert" className={ERROR_BAR}>{errText(code)}</div>:null}
   <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
    <section className={`${CARD_FLUSH} flex min-h-[420px] flex-col`}>
     <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"><span className={H3}>{t('page.title',{page})}</span><span className={TINY}>{t('page.private')}</span>
      <div className="ml-auto flex items-center gap-2"><button type="button" className={BTN} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>{t('page.prev')}</button><span className="font-mono text-xs text-text-dim">{page} / {pageText?.pageCount??doc.page_count??'—'}</span><button type="button" className={BTN} disabled={pageText!==null&&page>=pageText.pageCount} onClick={()=>setPage(p=>p+1)}>{t('page.next')}</button></div></div>
     {pageCode?<p className="p-4 text-xs text-danger">{errText(pageCode)}</p>:!pageText?<p className={`p-4 ${TINY}`}>{t('loading')}</p>:(
      <div ref={textRef} className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-5 text-[13px] leading-7 text-text-dim"
       onMouseUp={()=>{const s=textRef.current?selectionIn(textRef.current):null;setSel(s?{...s,page:pageText.page,parseRunId:pageText.parseRunId}:null);}}>
       {segmentText(pageText.text,spans).map((s,i)=>s.id?<mark key={i} className="border-b-2 border-accent bg-[var(--accent-wash)] px-0.5 text-text">{s.text}</mark>:<span key={i}>{s.text}</span>)}
      </div>)}
     <div className={`mt-auto border-t border-border px-4 py-2.5 ${TINY}`}>{sel?t('page.selection',{n:sel.text.length,start:sel.start,end:sel.end}):t('page.parseRun',{run:shortId(pageText?.parseRunId)})}</div>
    </section>
    <section className={`${CARD_FLUSH} flex flex-col`}>
     <div role="tablist" className="flex flex-wrap gap-1 border-b border-border px-3 pt-2">{tabs.map(([tb,label])=><button key={label} role="tab" type="button" aria-selected={sameTab(tab,tb)} className={`-mb-px border-b-2 px-2.5 py-2 text-xs ${sameTab(tab,tb)?'border-accent text-text':'border-transparent text-text-dim hover:text-text'} ${tb.kind==='target'?'font-mono':''}`} onClick={()=>setTab(tb)}>{label}</button>)}</div>
     <div className="p-4" role="tabpanel">{tab.kind==='target'?<TargetTab key={tab.key} targetKey={tab.key}/>:tab.kind==='report'?<ReportTab/>:tab.kind==='snippets'?<SnippetsTab/>:tab.kind==='title'?<TitleTab/>:<SummariesTab/>}</div>
     <p className={`${TINY} px-4 pb-3`}>{t('typedNote')}</p>
    </section>
    <aside className={`${CARD} flex flex-col gap-3.5`} aria-label={t('blockers.title')}>
     <div className={H3}>{t('blockers.title')}</div>
     {([['reviewReady',cols.reviewReady],['publishReady',cols.publishReady]] as const).map(([k,list])=>(
      <div key={k}><div className="mb-1.5 text-[11px] text-text-dim">{t(`blockers.${k}`)}</div>
       <ul className="flex flex-col gap-1.5 text-xs">{list.length===0?<li className="flex items-center gap-2"><span className={DOT('ok')}/>{t('blockers.none')}</li>:list.map(b=><li key={b} className="flex items-start gap-2"><span className={`${DOT('err')} mt-1`}/><span className="break-all">{blockerLabel(b)}</span></li>)}</ul></div>))}
     {!report.disclosure_ok?<div className="flex flex-col gap-2 border-t border-border pt-3"><p className="text-xs text-text-dim">{t('disclosureRecheck.note')}</p>
      <button type="button" className={BTN} disabled={busy} onClick={()=>void recheckDisclosure()}>{t('disclosureRecheck.submit')}</button>
      {recheckFailures.length?<ul className="flex flex-col gap-1 text-xs" aria-label={t('disclosureRecheck.failures')}>{recheckFailures.map(f=><li key={f} className="flex items-start gap-2"><span className={`${DOT('err')} mt-1`}/><span className="font-mono">{f}</span></li>)}</ul>:null}</div>:null}
     {published?<UnpublishBox onUnpublish={reason=>void post(`/reports/${reportId}/unpublish`,{reason})} busy={busy}/>:<>
      <button type="button" className={BTN} disabled={busy||cols.reviewReady.length>0||report.review_status==='approved'} onClick={()=>void post(`/reports/${reportId}/review`,{action:'approve'})}>{t('actions.markReviewed')}</button>
      <button type="button" className={BTN_PRIMARY} disabled={cols.publishReady.length>0} onClick={()=>setPublishOpen(true)}>{cols.publishReady.length?t('actions.publishBlocked',{n:cols.publishReady.length}):t('actions.publish')}</button></>}
    </aside>
   </div>
   {publishOpen?<PublishDialog reportId={reportId} licence={licence} approvedSnippets={data.snippets.filter(s=>s.status==='approved').length} approvedSummaries={data.summaries.filter(s=>s.status==='approved').length} codeVersion={report.code_version} onClose={()=>{setPublishOpen(false);void load();}}/>:null}
  </div>
  </ReviewCtx.Provider>
 );
}


interface ReviewCtxValue{data:ReviewPayload;report:ReviewPayload['report'];post:(path:string,body:unknown)=>Promise<boolean>;reportId:string;published:boolean;busy:boolean;sel:Sel|null;pageText:PageText|null;live:FieldRow[];conflicts:Map<string,FieldRow[]>;targetKeys:string[];max:number}
// Context instead of nested component definitions: the editors keep their local state (open editor,
// typed form) when the parent re-renders, e.g. when a text selection is made while an editor is open.
const ReviewCtx=createContext<ReviewCtxValue|null>(null);
function useReview(){const c=useContext(ReviewCtx);if(!c)throw new Error('ReviewCtx missing');return c;}

function FieldLine({f}:{f:FieldRow}){
 const {post,reportId,published,busy,sel,pageText}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const [editing,setEditing]=useState(false);const [form,setForm]=useState<TypedForm>(typedFormOf(effectiveValue(f)));const [useSel,setUseSel]=useState(false);const [bad,setBad]=useState<string|null>(null);
 const v=effectiveValue(f),kind=fieldKind(f.field),candidate=f.status==='extracted'||f.status==='unverified';
 const prov=f.status==='absent'?t('prov.absent'):f.extractor.startsWith('human:')?t('prov.human'):candidate?t('prov.llm'):t('prov.llmReviewed');
 async function correct(){
  const b=buildTyped(f.field,form);if(!b.ok){setBad(b.error);return;}
  const span=useSel&&sel?{page:sel.page,start:sel.start,end:sel.end}:undefined;
  if(await post(`/reports/${reportId}/fields/${f.field_id}`,{action:'correct',payload:correctionPayload(b.value,span)}))setEditing(false);
 }
 // a row without a span (unverified) is confirmed by framing its quote on the page (C6 framed confirm → detail.framed)
 const confirmPayload=f.char_start===null&&sel?{page:sel.page,charStart:sel.start,charEnd:sel.end}:{};
 return (
  <div className="grid grid-cols-1 gap-2 border-b border-border py-2.5 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center">
   <span className="text-xs text-text-dim">{tf(f.field)}{f.occurrence>1?` #${f.occurrence}`:''}</span>
   <span className="min-w-0 break-words font-mono text-sm">{v.value_text}{v.value_num!==null&&kind!=='text'?<span className="ml-1.5 text-[11px] text-text-muted">= {v.value_num}{v.value_unit?` ${v.value_unit}`:''}{v.value_currency?` ${v.value_currency}`:''}</span>:null}{v.value_date?<span className="ml-1.5 text-[11px] text-text-muted">= {v.value_date}</span>:null}</span>
   <span className="flex flex-wrap items-center gap-1.5">
    <span className={candidate?(f.status==='unverified'?CHIP_WARN:CHIP):CHIP_ACCENT}>{prov}{f.page?` · p.${f.page}`:''}{f.status==='unverified'?` · ${t('unverified')}`:''}</span>
    {published?null:<>
     {candidate?<button type="button" className={BTN_GHOST} disabled={busy||(f.char_start===null&&!sel)} title={f.char_start===null&&!sel?t('selectHint'):undefined} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'confirm',payload:confirmPayload})}>{t('actions.confirm')}</button>:null}
     {f.status!=='absent'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>setEditing(e=>!e)}>{t('actions.correct')}</button>:null}
     {f.status!=='rejected'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'reject',payload:{}})}>{t('actions.reject')}</button>:null}
     {ABSENT_FIELDS.includes(f.field)&&f.status!=='absent'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/${f.field_id}`,{action:'absent',payload:{page:pageText?.page??1}})}>{t('actions.absent')}</button>:null}
    </>}
   </span>
   {editing?<div className="col-span-full flex flex-col gap-2 rounded-md border border-border bg-bg-elevated p-3">
    <TypedInputs field={f.field} form={form} setForm={setForm} bad={bad}/>
    {sel?<label className="flex items-center gap-2 text-xs text-text-dim"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={useSel} onChange={e=>setUseSel(e.target.checked)}/>{t('useSelection',{page:sel.page,n:sel.text.length})}</label>:<p className={TINY}>{t('selectHint')}</p>}
    <div className="flex gap-2"><button type="button" className={BTN_PRIMARY} disabled={busy} onClick={()=>void correct()}>{t('actions.saveCorrection')}</button><button type="button" className={BTN_GHOST} onClick={()=>setEditing(false)}>{t('actions.cancel')}</button></div>
   </div>:null}
  </div>
 );
}
function TypedInputs({field,form,setForm,bad}:{field:FieldName;form:TypedForm;setForm:(f:TypedForm)=>void;bad:string|null}){
 const t=useTranslations('foreign-research.admin.review');
 const kind=fieldKind(field);
 const input=(k:keyof TypedForm,label:string,type='text')=><div className="min-w-0 flex-1"><label className={FIELD_LABEL}>{label}<input type={type} className={`${INPUT} mt-1 font-mono ${bad===k?'border-danger':''}`} aria-invalid={bad===k} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label></div>;
 return (<div className="flex flex-col gap-2">
  <div className="flex flex-wrap gap-2">{input('value_text',t('typed.text'))}
   {kind==='price'||kind==='pct'||kind==='months'?input('value_num',t(`typed.num_${kind}`)):null}
   {kind==='price'?input('value_currency',t('typed.currency')):null}
   {kind==='date'?input('value_date',t('typed.date'),'date'):null}</div>
  <p className={TINY}>{t(`typed.help_${kind}`)}</p>{bad?<p className="text-[11px] text-danger">{t(`typed.invalid_${bad}`)}</p>:null}
 </div>);
}
function AddField({targetKey}:{targetKey:string|null}){
 const {post,reportId,published,busy,sel,live}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const options=targetKey===null?REPORT_LEVEL:TARGET_LEVEL;
 const [field,setField]=useState<FieldName>(options[0]);
 if(!sel)return <p className={TINY}>{t('addNeedsSelection')}</p>;
 const occurrence=1+Math.max(0,...live.filter(x=>x.target_key===targetKey&&x.field===field).map(x=>x.occurrence));
 // C6 addField: valueText must equal the server-side slice of the span; the typed components are derived by toTyped on the server
 async function add(){
  await post(`/reports/${reportId}/fields`,{field,targetKey,occurrence,valueText:sel!.text,page:sel!.page,charStart:sel!.start,charEnd:sel!.end});
 }
 return (<div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
  <div className={H3}>{t('addField')}</div>
  <label className={FIELD_LABEL}>{t('field')}<select className={`${INPUT} mt-1`} value={field} onChange={e=>setField(e.target.value as FieldName)}>{options.map(o=><option key={o} value={o}>{tf(o)}</option>)}</select></label>
  <blockquote className="rounded-md border border-border px-3 py-2 font-mono text-xs text-text-dim">{sel.text}</blockquote>
  <p className={TINY}>{t('addSpan',{page:sel.page,start:sel.start,end:sel.end,occurrence})}</p>
  <button type="button" className={`${BTN} self-start`} disabled={busy||published} onClick={()=>void add()}>{t('actions.add')}</button>
 </div>);
}
function TargetTab({targetKey}:{targetKey:string}){
 const {data,post,reportId,published,busy,pageText,conflicts}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const rows=groupFields(data.fields).get(targetKey)??[];
 const target=data.targets.find(x=>x.target_key===targetKey);
 const [ticker,setTicker]=useState(target?.security_ticker??'');
 const present=new Set(rows.filter(r=>r.status!=='rejected').map(r=>r.field));
 return (<div className="flex flex-col gap-3">
  {target?<div className="flex flex-wrap items-center gap-2 text-xs text-text-dim"><span className={CHIP}>{target.basis}</span><span>{t('resolved',{ticker:target.security_ticker??'—',issuer:shortId(target.issuer_id)})}</span>
   {target.rating_normalized?<span className={CHIP}>{target.rating_normalized}{target.scale_id?` · ${shortId(target.scale_id)}`:''}</span>:<span className={CHIP_WARN}>{t('ratingUnmapped')}</span>}</div>:null}
  {[...conflicts.entries()].filter(([,g])=>g[0].target_key===targetKey).map(([gid,g])=>(
   <div key={gid} className="rounded-md border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] p-2.5"><div className="mb-1 text-xs text-warn">{t('conflict',{field:tf(g[0].field),n:g.length})}</div>{g.map(f=><FieldLine key={f.field_id} f={f}/>)}</div>))}
  <div>{rows.filter(r=>!(r.conflict_group&&conflicts.has(r.conflict_group))).map(f=><FieldLine key={f.field_id} f={f}/>)}</div>
  {published?null:<div className="flex flex-wrap gap-2">{ABSENT_FIELDS.filter(x=>x!=='analyst'&&!present.has(x)).map(x=><button key={x} type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/fields/absent`,{field:x,targetKey,page:pageText?.page??1})}>{t('markAbsent',{field:tf(x),page:pageText?.page??1})}</button>)}</div>}
  {published?null:<AddField targetKey={targetKey}/>}
  {published?null:<div className="flex flex-wrap items-end gap-2"><label className={`${FIELD_LABEL} min-w-[200px] flex-1`}>{t('override')}<input className={`${INPUT} mt-1 font-mono`} value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}/></label>
   <button type="button" className={BTN} disabled={busy||!ticker.trim()} onClick={()=>void post(`/reports/${reportId}/overrides`,{targetKey,securityTicker:ticker.trim()})}>{t('actions.override')}</button></div>}
 </div>);
}
function ReportTab(){
 const {data,report,post,reportId,published,busy,targetKeys}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const rows=groupFields(data.fields).get('')??[];
 const [scope,setScope]=useState(report.scope??'');const [inst,setInst]=useState(report.institution_id??'');const [type,setType]=useState(report.report_type??'');
 const [primary,setPrimary]=useState(report.primary_target_key??'');const [supersedes,setSupersedes]=useState(report.supersedes_report_id??'');
 const analystRows=rows.filter(r=>r.field==='analyst'&&r.status!=='absent');
 const [analystId,setAnalystId]=useState('');const [analystField,setAnalystField]=useState(analystRows[0]?.field_id??'');const [role,setRole]=useState('');
 const bind=(patch:Record<string,unknown>)=>void post(`/reports/${reportId}/bind`,patch);
 const instAnalysts=data.analysts.filter(a=>a.institution_id===report.institution_id);
 return (<div className="flex flex-col gap-3">
  <div>{rows.map(f=><FieldLine key={f.field_id} f={f}/>)}</div>
  {published?null:<AddField targetKey={null}/>}
  {published?null:<div className="grid gap-3 sm:grid-cols-2">
   <label className={FIELD_LABEL}>{t('bind.scope')}<div className="mt-1 flex gap-2"><select className={INPUT} value={scope} onChange={e=>setScope(e.target.value)}><option value="">—</option>{SCOPES.map(s=><option key={s} value={s}>{t(`scopes.${s}`)}</option>)}</select><button type="button" className={BTN} disabled={busy||!scope} onClick={()=>bind({scope})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.institution')}<div className="mt-1 flex gap-2"><select className={INPUT} value={inst} onChange={e=>setInst(e.target.value)}><option value="">—</option>{data.institutions.map(i=><option key={i.institution_id} value={i.institution_id}>{i.name_en}</option>)}</select><button type="button" className={BTN} disabled={busy||!inst} onClick={()=>bind({institutionId:inst})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.reportType')}<div className="mt-1 flex gap-2"><input className={INPUT} value={type} onChange={e=>setType(e.target.value)}/><button type="button" className={BTN} disabled={busy} onClick={()=>bind({reportType:type.trim()||null})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.primary')}<div className="mt-1 flex gap-2"><select className={INPUT} value={primary} onChange={e=>setPrimary(e.target.value)}><option value="">—</option>{targetKeys.map(k=><option key={k} value={k}>{k}</option>)}</select><button type="button" className={BTN} disabled={busy||!primary} onClick={()=>bind({primaryTargetKey:primary})}>{t('actions.save')}</button></div></label>
   <label className={FIELD_LABEL}>{t('bind.supersedes')}<div className="mt-1 flex gap-2"><input className={`${INPUT} font-mono`} value={supersedes} onChange={e=>setSupersedes(e.target.value.trim())} placeholder="report_id"/><button type="button" className={BTN} disabled={busy} onClick={()=>bind({supersedesReportId:supersedes||null})}>{t('actions.save')}</button></div></label>
   <div className="flex flex-col gap-1.5"><span className={FIELD_LABEL}>{t('bind.analyst')}</span>
    <select className={INPUT} aria-label={t('bind.analyst')} value={analystId} onChange={e=>setAnalystId(e.target.value)}><option value="">—</option>{instAnalysts.map(a=><option key={a.analyst_id} value={a.analyst_id}>{a.display_name}{a.public_display?'':` · ${t('bind.private')}`}</option>)}</select>
    <select className={INPUT} aria-label={t('bind.analystField')} value={analystField} onChange={e=>setAnalystField(e.target.value)}>{analystRows.map(r=><option key={r.field_id} value={r.field_id}>{effectiveValue(r).value_text} · p.{r.page??'—'}</option>)}</select>
    <input className={INPUT} aria-label={t('bind.role')} placeholder={t('bind.role')} value={role} onChange={e=>setRole(e.target.value)}/>
    <button type="button" className={`${BTN} self-start`} disabled={busy||!analystId||!analystField} onClick={()=>bind({analyst:{analystId,fieldId:analystField,role:role.trim()||null}})}>{t('actions.bindAnalyst')}</button></div>
  </div>}
 </div>);
}
function SnippetsTab(){
 const {data,post,reportId,published,busy,sel,max,targetKeys,live}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const tf=useTranslations('foreign-research.fields');
 const [purpose,setPurpose]=useState<SnippetPurpose>('thesis');const [targetKey,setTargetKey]=useState('');const [fieldId,setFieldId]=useState('');
 // a snippet may cite one effective row (snippets.field_id); the public drawer joins snippets to citations by it
 const citable=live.filter(f=>(f.status==='confirmed'||f.status==='corrected')&&(f.target_key??'')===targetKey);
 const left=sel?remainingChars(max,sel.text.length):null;
 return (<div className="flex flex-col gap-3">
  {published?null:<div className="flex flex-col gap-2 rounded-md border border-border p-3">
   <div className={H3}>{t('snippets.new')}</div>
   {sel?<blockquote className="rounded-md border border-border px-3 py-2 text-xs text-text-dim">“{sel.text}” — p.{sel.page}</blockquote>:<p className={TINY}>{t('selectHint')}</p>}
   <div className="flex items-center gap-2 text-xs"><span className="text-text-dim">{t('snippets.remaining')}</span><div className="h-1.5 w-40 overflow-hidden rounded bg-bg-elevated" aria-hidden="true"><div className={`h-full ${left!==null&&left<0?'bg-danger':'bg-accent'}`} style={{width:`${sel&&max>0?Math.min(100,Math.round(sel.text.length/max*100)):0}%`}}/></div><span className={`font-mono ${left!==null&&left<0?'text-danger':'text-text-dim'}`}>{sel?`${sel.text.length} / ${max}`:`0 / ${max}`}</span></div>
   <div className="flex flex-wrap gap-2">
    <select className={`${INPUT} w-40`} aria-label={t('snippets.purpose')} value={purpose} onChange={e=>setPurpose(e.target.value as SnippetPurpose)}>{SNIPPET_PURPOSES.map(p=><option key={p} value={p}>{t(`purposes.${p}`)}</option>)}</select>
    <select className={`${INPUT} w-48`} aria-label={t('snippets.target')} value={targetKey} onChange={e=>setTargetKey(e.target.value)}><option value="">{t('snippets.noTarget')}</option>{targetKeys.map(k=><option key={k} value={k}>{k}</option>)}</select>
    <select className={`${INPUT} w-56`} aria-label={t('snippets.field')} value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">{t('snippets.noField')}</option>{citable.map(f=><option key={f.field_id} value={f.field_id}>{tf(f.field)} · p.{f.page??'—'}</option>)}</select>
    <button type="button" className={BTN} disabled={busy||!sel||left===null||left<0||sel.text.length===0} onClick={()=>void post(`/reports/${reportId}/snippets`,{purpose,targetKey:targetKey||null,fieldId:fieldId||null,page:sel!.page,charStart:sel!.start,charEnd:sel!.end,text:sel!.text})}>{t('snippets.create')}</button>
   </div>
  </div>}
  {data.snippets.length===0?<p className={TINY}>{t('snippets.none')}</p>:data.snippets.map(s=>(
   <div key={s.snippet_id} className="flex flex-col gap-1.5 border-b border-border py-2.5">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={s.status==='approved'?CHIP_ACCENT:s.status==='rejected'?CHIP_DANGER:CHIP}>{s.status}</span><span className="text-text-dim">{t(`purposes.${s.purpose}`)} · p.{s.page}{s.target_key?` · ${s.target_key}`:''}</span>
     {s.disclosure_check&&!s.disclosure_check.passed?<span className={CHIP_DANGER}>{t('snippets.disclosureHits',{tokens:s.disclosure_check.hits.map(h=>h.kind).join(', ')})}</span>:null}</div>
    <p className="text-sm text-text-dim">{s.text??t('snippets.purged')}</p>
    {published||s.status==='rejected'?null:<div className="flex gap-2">{s.status==='draft'?<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/snippets/${s.snippet_id}`,{action:'approve'})}>{t('actions.approve')}</button>:null}<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/snippets/${s.snippet_id}`,{action:'reject'})}>{t('actions.reject')}</button></div>}
   </div>))}
 </div>);
}
function TitleTab(){
 const {data,report,post,reportId,published,busy}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 const [title,setTitle]=useState(report.title_public??'');
 const hits=data.blockers.filter(b=>blockerParts(b).key==='restricted_value_in_text'&&(blockerParts(b).arg??'').startsWith('title'));
 return (<div className="flex flex-col gap-3">
  <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs"><dt className="text-text-dim">{t('title.original')}</dt><dd>{report.title_original??'—'}</dd><dt className="text-text-dim">{t('title.zh')}</dt><dd>{report.title_zh??'—'}</dd><dt className="text-text-dim">{t('title.en')}</dt><dd>{report.title_en??'—'}</dd></dl>
  <label className={FIELD_LABEL}>{t('title.public')}<input className={`${INPUT} mt-1 ${hits.length?'border-danger':''}`} value={title} onChange={e=>setTitle(e.target.value)} disabled={published}/></label>
  {hits.length?<p className="text-xs text-text">{t('title.blocked',{surfaces:hits.map(h=>blockerParts(h).arg).join(', ')})}</p>:null}
  {published?null:<div className="flex gap-2"><button type="button" className={BTN} disabled={busy} onClick={()=>void post(`/reports/${reportId}/bind`,{titlePublic:title.trim()||null})}>{t('actions.save')}</button><button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/reports/${reportId}/translate`,{})}>{t('title.translate')}</button></div>}
 </div>);
}
function SummariesTab(){
 const {data,report,post,reportId,published,busy,max}=useReview();
 const t=useTranslations('foreign-research.admin.review');
 return (<div className="flex flex-col gap-3">
  {published?null:<div className="flex gap-2">{(['zh','en'] as const).map(lang=><button key={lang} type="button" className={BTN} disabled={busy} onClick={()=>void post(`/reports/${reportId}/summary`,{lang})}>{t('summaries.generate',{lang})}</button>)}</div>}
  {data.summaries.length===0?<p className={TINY}>{t('summaries.none')}</p>:data.summaries.map(s=>{const stale=s.input_hash!==report.summary_input_digest;return (
   <div key={s.summary_id} className="flex flex-col gap-1.5 border-b border-border py-2.5">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={s.status==='approved'?CHIP_ACCENT:s.status==='rejected'?CHIP_DANGER:CHIP}>{s.lang} · {s.status}</span>
     <span className={s.max_verbatim_overlap<=max?CHIP:CHIP_DANGER}>{t('summaries.overlap',{n:s.max_verbatim_overlap,max})}</span>
     <span className={s.numeric_grounding.passed?CHIP:CHIP_DANGER}>{t(s.numeric_grounding.passed?'summaries.grounded':'summaries.ungrounded')}</span>
     <span className={s.disclosure_check.passed?CHIP:CHIP_DANGER}>{t(s.disclosure_check.passed?'summaries.disclosureOk':'summaries.disclosureHit')}</span>
     {stale?<span className={CHIP_WARN}>{t('summaries.stale')}</span>:null}</div>
    <p className="whitespace-pre-wrap text-sm text-text-dim">{s.summary_md}</p>
    {published||s.status==='rejected'?null:<div className="flex gap-2">{s.status==='draft'?<button type="button" className={BTN_GHOST} disabled={busy||stale} onClick={()=>void post(`/summaries/${s.summary_id}`,{action:'approve'})}>{t('actions.approve')}</button>:null}<button type="button" className={BTN_GHOST} disabled={busy} onClick={()=>void post(`/summaries/${s.summary_id}`,{action:'reject'})}>{t('actions.reject')}</button></div>}
   </div>);})}
 </div>);
}

function UnpublishBox({onUnpublish,busy}:{onUnpublish:(reason:string)=>void;busy:boolean}){
 const t=useTranslations('foreign-research.admin.review');
 const [reason,setReason]=useState('');
 return (<div className="flex flex-col gap-2"><label className={FIELD_LABEL}>{t('unpublish.reason')}<input className={`${INPUT} mt-1`} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <button type="button" className={BTN} disabled={busy||!reason.trim()} onClick={()=>onUnpublish(reason.trim())}>{t('unpublish.submit')}</button><p className={TINY}>{t('unpublish.note')}</p></div>);
}
