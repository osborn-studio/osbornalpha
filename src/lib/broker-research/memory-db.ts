// src/lib/broker-research/memory-db.ts
// In-memory BrokerResearchDb for unit tests of the services (spec §4.14: "实现触发器/函数的等价规则").
// Emulated, with the same error codes as the SQL: licence version bump + confirmation clearing +
// approved texts → draft + disclosure_ok=false + licence.changed; intent and document transition
// tables; leases on an injectable clock (claim, expiry takeover failing running runs, fenced
// writes, finish once, lease_lost marking); extract_commit; materialize (picks, basis, upside/1 by
// BigInt, exact-one scale, report-level sync, summary/snippet invalidation); field_review,
// field_add, target_override; the 17 publish blockers in SQL order; publish (snapshot, outbox
// registers), unpublish, document withdraw cascade and every claim.retract path; the
// reports_guard rules for updateReportDraft; snippet/summary approval; close-only scales; analyst
// disclosure cascade; outbox attempts; purge steps; the quarantine hook; the ten public views on
// the clock's UTC date. DELIBERATELY SIMPLIFIED: (1) hashes are sha256Hex(canonicalJson(...)) of
// the same inputs — values differ from SQL, only equal/unequal relations carry over; (2) decimal
// strings are kept as given (PostgreSQL would print '0120' as '120'): pass canonical decimals;
// (3) a claim's subject.market comes from the ticker suffix (.HK → HK, .SH/.SZ/.BJ → A, else US),
// not from stocks_universe; (4) no foreign keys and only the check constraints named in the code;
// (5) no row locks — calls are serialised by the event loop.
import {randomUUID} from 'node:crypto';
import {memoryTableClient} from '../db/memory-table-client';
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {analystsDistinct,bundles,publicRow,verifyOrder} from './db';
import {effectiveValue} from './effective';
import {canonicalJson,sha256Hex} from './hash';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,AnalystRow,BrokerResearchDb,CandidateFieldInput,DisclosureCheck,DocumentRow,DocumentStatus,EvalReceiptRow,FieldRow,InstitutionRow,IntentRow,IntentStatus,LicenceInput,LicenceRow,MaterializeReceipt,NormalizedRating,OutboxEvent,PublicReportBundle,PublicationRow,PurgeStepRow,RatingScaleRow,ReportAnalystRow,ReportRow,RuleReceiptRow,RunRow,SettingsRow,SnippetRow,StorageWriteRow,SummaryRow,TargetRow,TypedValue} from './types';
import {CLAIM_METHODOLOGY_VERSION,DISCLOSURE_VERSION,RULES_VERSION,UPSIDE_FORMULA_VERSION} from './versions';

type R=Record<string,unknown>;
interface Override{override_id:string;report_id:string;target_key:string;security_ticker:string;issuer_id:string|null;set_by:string;set_at:string;note:string|null}
/** Test-only extras on top of the contract. */
export interface MemoryBrokerResearchDb extends BrokerResearchDb{
 tables:TableClient;
 setNow(iso:string|null):void;
 expireLease(documentId:string):void;
 outbox():OutboxEvent[];
}

const EFF=new Set(['confirmed','corrected','absent']);const CAND=new Set(['extracted','unverified']);
const MATERIAL:readonly (keyof LicenceInput)[]=['allows_llm_processing','allows_public_metadata','allows_public_snippets','allows_public_summary','allows_public_target_price','snippet_max_chars','valid_from','valid_to','terms_summary','licence_kind','holder'];
const INTENT_MOVES=new Set(['open>validating','open>expired','open>abandoned','validating>open','validating>validated','validating>abandoned','validating>expired','validated>promoting','validated>abandoned','validated>expired','promoting>committed','promoting>abandoned']);
const DOC_MOVES=new Set(['uploaded>parsing','parse_failed>parsing','parsed>parsing','parsing>parsed','parsing>parse_failed']);
/** Blocker 10 reason set (= SQL broker_report_publish_blockers §10 = rules.ts BLOCKING_REASONS; B4 asserts all three). */
export const BLOCKING_QUARANTINE_REASONS=['upside_mismatch','currency_mismatch','date_order','nonpositive_price','unknown_rating_label','ambiguous_rating_label','ticker_issuer_conflict','unresolved_ticker'] as const;
const BLOCKING_Q=new Set<string>(BLOCKING_QUARANTINE_REASONS);
const TARGET_FIELDS=new Set(['ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated']);
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const idKey=(f:{target_key:string|null;field:string;occurrence:number})=>`${f.target_key??''}\u0000${f.field}\u0000${f.occurrence}`;
const clone=<T>(v:T):T=>structuredClone(v);
function fail(code:string,detail?:string):never{throw new BrokerResearchDbError(code,detail===undefined?code:`${code}:${detail}`,detail);}
const same=(a:unknown,b:unknown)=>canonicalJson(a??null)===canonicalJson(b??null);
const dec=(s:string)=>{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(s);if(!m)fail('invalid_decimal',s);const f=m[3]??'';return {n:BigInt(`${m[1]}${m[2]}${f}`),scale:f.length};};
/** sign(a − b) on decimal strings. */
export function decimalCompare(a:string,b:string):number{const x=dec(a),y=dec(b);const l=x.n*10n**BigInt(y.scale),r=y.n*10n**BigInt(x.scale);return l<r?-1:l>r?1:0;}
/** upside/1 = round(tp / pr − 1, 6), half away from zero, always 6 decimals (PostgreSQL round(numeric, 6)); null when pr = 0. */
export function upside1(tp:string,pr:string):string|null{
 const a=dec(tp),b=dec(pr);if(b.n===0n)return null;
 const A=a.n*10n**BigInt(b.scale),B=b.n*10n**BigInt(a.scale);
 const num=(A-B)*1000000n,den=B;
 let q=num/den;const r=num%den;
 if(2n*(r<0n?-r:r)>=(den<0n?-den:den))q+=(num<0n)!==(den<0n)?-1n:1n;
 const neg=q<0n;const s=(neg?-q:q).toString().padStart(7,'0');
 return `${neg?'-':''}${s.slice(0,-6)}.${s.slice(-6)}`;
}
const marketOf=(t:string|null)=>t===null?null:/\.HK$/.test(t)?'HK':/\.(SH|SZ|BJ)$/.test(t)?'A':'US';

export function memoryBrokerResearchDb(opts:{tables?:TableClient;now?:()=>Date}={}):MemoryBrokerResearchDb{
 const tables=opts.tables??memoryTableClient({dq_quarantine:['id']});const clock=opts.now??(()=>new Date());
 let fixedNow:string|null=null;let last='';
 const now=()=>fixedNow??clock().toISOString();
 /** Strictly increasing timestamps (row order = SQL insertion order). */
 const stamp=()=>{const t=now();last=t>last?t:new Date(Date.parse(last)+1).toISOString();return last;};
 const today=()=>now().slice(0,10);
 const plusSec=(s:number)=>new Date(Date.parse(now())+s*1000).toISOString();
 const settings:SettingsRow={public_enabled:false,approved_gold_corpus_hash:null,approved_gold_corpus_by:null,approved_gold_corpus_at:null,updated_by:null,updated_at:now()};
 const licences=new Map<string,LicenceRow>(),intents=new Map<string,IntentRow>(),documents=new Map<string,DocumentRow>(),runs=new Map<string,RunRow>();
 const reports=new Map<string,ReportRow>(),targets=new Map<string,TargetRow[]>(),overrides=new Map<string,Override>(),fields=new Map<string,FieldRow>();
 const snippets=new Map<string,SnippetRow>(),summaries=new Map<string,SummaryRow>(),publications=new Map<string,PublicationRow>();
 const ruleReceipts:RuleReceiptRow[]=[],evals:EvalReceiptRow[]=[],outbox:OutboxEvent[]=[],access:(AccessLogInput&{id:string;created_at:string})[]=[];
 const institutions=new Map<string,InstitutionRow>(),scales=new Map<string,RatingScaleRow>(),analysts=new Map<string,AnalystRow>(),bindings:ReportAnalystRow[]=[];
 const purge=new Map<string,PurgeStepRow>();const writes=new Map<string,StorageWriteRow>();
 const runSeq=new Map<string,number>();
 const req=<T>(m:Map<string,T>,id:string,what:string):T=>m.get(id)??fail(`${what}_not_found`);
 const docOf=(r:ReportRow)=>documents.get(r.document_id)!;const licOf=(r:ReportRow)=>licences.get(docOf(r).licence_id)!;
 const licenceOk=(l:LicenceRow)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&today()>=l.valid_from&&(l.valid_to===null||today()<=l.valid_to);
 const fieldsOf=(rep:string)=>[...fields.values()].filter(f=>f.report_id===rep);
 const effOf=(rep:string)=>fieldsOf(rep).filter(f=>EFF.has(f.status)).sort((a,b)=>cmp(idKey(a),idKey(b)));
 const liveCand=(rep:string)=>fieldsOf(rep).filter(f=>CAND.has(f.status)&&f.superseded_by_run_id===null);

 // ---------------------------------------------------------------- outbox and report changes
 const enqueue=(kind:OutboxEvent['kind'],payload:R)=>{const id=randomUUID();outbox.push({event_id:id,kind,payload:{event_id:id,kind,...payload},status:'pending',attempts:0,last_error:null,created_at:stamp(),delivered_at:null});};
 const retract=(pub:string,reason:string)=>{
  for(const e of outbox.filter(x=>x.kind==='claim.register'&&(x.payload.source as R)?.publication_id===pub)){
   const key=String(e.payload.claim_key);
   if(outbox.some(x=>(x.kind==='claim.retract'||x.kind==='claim.register')&&x.payload.claim_key===key&&x.payload.claim_seq===2))continue;
   enqueue('claim.retract',{claim_key:key,claim_seq:2,reason,source:{report_id:(e.payload.source as R).report_id,publication_id:pub}});
  }
 };
 /** Writes a report row, then the after-update retract rule of the SQL trigger. */
 const setReport=(r:ReportRow,patch:Partial<ReportRow>)=>{
  const old={...r};Object.assign(r,patch,{updated_at:stamp()});
  if(old.status==='published'&&old.current_publication_id){
   if(r.status!=='published')retract(old.current_publication_id,r.status==='withdrawn'?'withdraw':'unpublish');
   else if(old.disclosure_ok&&!r.disclosure_ok)retract(old.current_publication_id,'disclosure_ok');
   else if(old.evidence_ok&&!r.evidence_ok)retract(old.current_publication_id,'evidence_ok');
  }
 };
 const draftTexts=(rep:string,reason:string,which:'both'|'snippets'='both')=>{
  for(const s of snippets.values())if(s.report_id===rep&&s.status==='approved')Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:reason});
  if(which==='both')for(const s of summaries.values())if(s.report_id===rep&&s.status==='approved')Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:reason});
 };
 const lockDraft=(rep:string)=>{const r=reports.get(rep)??fail('report_not_found');if(r.status==='published')fail('published_immutable');if(r.status==='withdrawn')fail('report_withdrawn');return r;};

 // ---------------------------------------------------------------- materialize (§6.3; mirrors SQL)
 type FieldPick={f:FieldRow;isEff:boolean;v:TypedValue};
 const picks=(rep:string):FieldPick[]=>{
  const effKeys=new Set(effOf(rep).map(idKey));
  const cand=liveCand(rep).filter(f=>!effKeys.has(idKey(f)));
  const n=new Map<string,number>();for(const c of cand)n.set(idKey(c),(n.get(idKey(c))??0)+1);
  return [...effOf(rep).map(f=>({f,isEff:true,v:effectiveValue(f)})),...cand.filter(c=>n.get(idKey(c))===1).map(f=>({f,isEff:false,v:effectiveValue({...f,corrected:null})}))];
 };
 const firstBy=(ps:FieldPick[])=>{const m=new Map<string,FieldPick>();for(const p of [...ps].sort((a,b)=>Number(b.isEff)-Number(a.isEff)||a.f.occurrence-b.f.occurrence))if(!m.has(p.f.field))m.set(p.f.field,p);return m;};
 const effRowsJson=(rep:string)=>effOf(rep).map(f=>({field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,status:f.status,extractor:f.extractor,parse_run_id:f.parse_run_id,run_id:f.run_id,page:f.page,char_start:f.char_start,char_end:f.char_end,value:effectiveValue(f)}));
 const liveDigests=(rep:string)=>{
  const r=reports.get(rep)!;const d=docOf(r);const l=licOf(r);
  const eff=effRowsJson(rep);const effHash=sha256Hex(canonicalJson(eff));
  const art=d.current_parse_run_id?runs.get(d.current_parse_run_id)?.artifact_hash??'':'';
  const ts=(targets.get(rep)??[]).map(t=>{const {input_hash:_h,...rest}=t;void _h;return rest;});
  const rules={rules_version:RULES_VERSION,effective:eff,targets:ts,
   overrides:[...overrides.values()].filter(o=>o.report_id===rep).sort((a,b)=>cmp(a.target_key,b.target_key)).map(o=>({override_id:o.override_id,target_key:o.target_key,security_ticker:o.security_ticker,issuer_id:o.issuer_id})),
   scales:[...new Set(ts.map(t=>t.scale_id).filter((x):x is string=>!!x))].sort().map(id=>scales.get(id)),
   institution_id:r.institution_id,scope:r.scope,published_date:r.published_date,uploaded_at:d.uploaded_at,supersedes_report_id:r.supersedes_report_id,
   titles:{title_original:r.title_original,title_public:r.title_public,title_zh:r.title_zh,title_en:r.title_en},
   disclosure:{licence_version:l.version,allows_public_target_price:l.allows_public_target_price,
    analysts:bindings.filter(b=>b.report_id===rep).sort((a,b)=>cmp(a.analyst_id,b.analyst_id)).map(b=>{const a=analysts.get(b.analyst_id)!;return {analyst_id:a.analyst_id,public_display:a.public_display,display_name:a.display_name,name_variants:a.name_variants};})}};
  return {effective_hash:effHash,rules_input_hash:sha256Hex(canonicalJson(rules)),summary_input_digest:sha256Hex(`${effHash}|${art}|${r.institution_id??''}|${r.title_public??''}`)};
 };
 /** = SQL broker_report_disclosure_digest (same inputs; value differs, relations carry over). */
 const disclosureDigestOf=(rep:string)=>{const r=reports.get(rep)??fail('report_not_found');const l=licOf(r);
  return sha256Hex(canonicalJson({licence_version:l.version,allows_public_target_price:l.allows_public_target_price,
   targets:(targets.get(rep)??[]).map(t=>({target_key:t.target_key,target_price:t.target_price,upside_pct:t.upside_pct})).sort((a,b)=>cmp(a.target_key,b.target_key)),
   analysts:bindings.filter(b=>b.report_id===rep).map(b=>analysts.get(b.analyst_id)!).sort((a,b)=>cmp(a.analyst_id,b.analyst_id)).map(a=>({analyst_id:a.analyst_id,public_display:a.public_display,display_name:a.display_name,name_variants:a.name_variants}))}));};
 /** Approval stamp (SQL approval triggers): a supplied db_digest must be current; the stored check carries it. */
 const stampDigest=<T extends {report_id:string;disclosure_check:DisclosureCheck|null}>(x:T)=>{
  const cur=disclosureDigestOf(x.report_id);
  if(x.disclosure_check?.db_digest!==undefined&&x.disclosure_check.db_digest!==cur)fail('disclosure_inputs_changed');
  x.disclosure_check={...x.disclosure_check!,db_digest:cur};
 };
 const discHash=(rep:string)=>canonicalJson((targets.get(rep)??[]).map(t=>({k:t.target_key,tp:t.target_price,up:t.upside_pct})));
 const materializeNow=(rep:string):MaterializeReceipt=>{
  const r=lockDraft(rep);const oldDisc=discHash(rep);
  const all=picks(rep);
  const rl=firstBy(all.filter(p=>p.f.target_key===null&&p.f.status!=='absent'));
  const pub=rl.get('published_date')?.v.value_date??null;
  const keys=[...new Set(fieldsOf(rep).filter(f=>f.field==='ticker'&&(f.status==='confirmed'||f.status==='corrected'||(CAND.has(f.status)&&f.superseded_by_run_id===null))).map(f=>f.target_key!))].sort(cmp);
  const out:TargetRow[]=[];
  for(const tk of keys){
   const mine=all.filter(p=>p.f.target_key===tk);
   const e=(fld:string,absent?:boolean)=>mine.some(p=>p.isEff&&p.f.field===fld&&(absent===undefined||(p.f.status==='absent')===absent));
   const effBasis=e('ticker')&&e('rating')&&e('target_price')&&(e('target_price',true)||(e('target_currency')&&e('price_at_report')&&e('price_currency')&&e('price_as_of_date')));
   const chosen=firstBy(mine.filter(p=>p.isEff||!effBasis));
   const val=(fld:string,k:keyof TypedValue,noAbsent=false)=>{const p=chosen.get(fld);if(!p||(noAbsent&&p.f.status==='absent'))return null;return p.v[k] as string|null;};
   const tp=val('target_price','value_num',true),pr=val('price_at_report','value_num'),tc=val('target_currency','value_currency'),pc=val('price_currency','value_currency');
   const res=chosen.get('ticker')?.f.detail?.resolution as R|undefined;const resolution=res&&typeof res==='object'?res:undefined;
   const o=overrides.get(`${rep}|${tk}`);const row=(resolution?.issuer_securities_row??{}) as R;
   const rating=val('rating','value_text',true);
   const hits=rating!==null&&pub!==null?[...scales.values()].filter(s=>s.institution_id===r.institution_id&&s.raw_label.replace(/^ +| +$/g,'').toLowerCase()===rating.replace(/^ +| +$/g,'').toLowerCase()&&s.valid_from<=pub&&pub<(s.valid_to??'9999-12-31')):[];
   const scale=hits.length===1?hits[0]:null;
   const up=tp!==null&&pr!==null&&tc!==null&&tc===pc?upside1(tp,pr):null;
   const h=val('target_horizon','value_num',true);
   const inputs=[...chosen.values()].sort((a,b)=>cmp(a.f.field,b.f.field)).map(p=>({field_id:p.f.field_id,field:p.f.field,status:p.f.status,v:p.v}));
   out.push({report_id:rep,target_key:tk,basis:effBasis?'effective':'candidate',ticker_as_stated:val('ticker','value_text')??tk,
    security_ticker:o?o.security_ticker:(row.ticker as string|undefined)??null,issuer_id:o?o.issuer_id:(row.issuer_id as string|undefined)??null,
    resolution:{...(resolution??{}),...(o?{override_id:o.override_id}:{})},rating_raw:rating,rating_normalized:scale?.normalized??null,scale_id:scale?.scale_id??null,
    target_price:tp,target_currency:tc,target_horizon_months:h!==null&&Number(h)>0?Math.round(Number(h)):null,price_at_report:pr,price_currency:pc,
    price_as_of_date:val('price_as_of_date','value_date'),upside_pct:up,upside_formula_version:up===null?null:UPSIDE_FORMULA_VERSION,input_hash:sha256Hex(canonicalJson(inputs))});
  }
  targets.set(rep,out);
  const pads=[...new Set(out.map(t=>t.price_as_of_date))];
  const pad=r.primary_target_key!==null?out.find(t=>t.target_key===r.primary_target_key)?.price_as_of_date??null:pads.length===1?pads[0]:null;
  setReport(r,{title_original:rl.get('title')?.v.value_text??null,title_lang:(rl.get('title')?.f.detail?.lang as string|undefined)??r.title_lang,published_date:pub,sector_as_stated:rl.get('sector')?.v.value_text??null,price_as_of_date:pad});
  const dg=liveDigests(rep);
  setReport(r,{effective_hash:dg.effective_hash,materialized_hash:dg.effective_hash,rules_input_hash:dg.rules_input_hash,summary_input_digest:dg.summary_input_digest});
  for(const s of summaries.values())if(s.report_id===rep&&s.status==='approved'&&s.input_hash!==dg.summary_input_digest)Object.assign(s,{status:'draft',approved_by:null,approved_at:null,draft_reason:'summary_stale'});
  if(discHash(rep)!==oldDisc)draftTexts(rep,'disclosure_inputs','snippets');
  const nEff=out.filter(t=>t.basis==='effective').length;
  return {effectiveHash:dg.effective_hash,materializedHash:dg.effective_hash,targets:out.length,basis:nEff===out.length?'effective':nEff===0?'candidate':'mixed'};
 };
 /** All-or-nothing: snapshot every map a call may touch, restore on error (= one SQL transaction). */
 const atomic=<T>(fn:()=>T):T=>{
  const snap=[new Map([...fields].map(([k,v])=>[k,clone(v)])),new Map([...reports].map(([k,v])=>[k,clone(v)])),new Map([...targets].map(([k,v])=>[k,clone(v)])),new Map([...overrides]),new Map([...snippets].map(([k,v])=>[k,clone(v)])),new Map([...summaries].map(([k,v])=>[k,clone(v)])),new Map([...scales].map(([k,v])=>[k,clone(v)])),outbox.length] as const;
  try{return fn();}catch(e){
   const restore=<K,V>(m:Map<K,V>,s:Map<K,V>)=>{m.clear();for(const [k,v] of s)m.set(k,v);};
   restore(fields,snap[0]);restore(reports,snap[1]);restore(targets,snap[2]);restore(overrides,snap[3]);restore(snippets,snap[4]);restore(summaries,snap[5]);restore(scales,snap[6]);outbox.length=snap[7];
   throw e;
  }
 };
 const effectiveExists=(f:{report_id:string;target_key:string|null;field:string;occurrence:number},except?:string)=>fieldsOf(f.report_id).some(e=>e.field_id!==except&&EFF.has(e.status)&&idKey(e)===idKey(f));
 const rejectSiblings=(f:FieldRow,by:string)=>{for(const x of liveCand(f.report_id))if(x.field_id!==f.field_id&&idKey(x)===idKey(f))Object.assign(x,{status:'rejected',reviewed_by:by,reviewed_at:now()});};
 const newField=(row:Partial<FieldRow>&Pick<FieldRow,'report_id'|'field'|'value_text'|'extractor'|'status'>):FieldRow=>{
  const f:FieldRow={field_id:randomUUID(),parse_run_id:null,run_id:null,superseded_by_run_id:null,target_key:null,occurrence:1,value_num:null,value_currency:null,value_unit:null,value_date:null,page:null,char_start:null,char_end:null,value_source_text:null,extractor_confidence:null,corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:stamp(),...row};
  if(TARGET_FIELDS.has(f.field)!==(f.target_key!==null))fail('constraint_violation','broker_fields_target_key_level');
  if(f.status==='absent'&&!(f.extractor.startsWith('human:')&&['rating','target_price','analyst','target_horizon'].includes(f.field)&&f.page!==null&&f.parse_run_id!==null))fail('constraint_violation','broker_fields_absent_shape');
  if((f.status==='confirmed'||f.status==='corrected')&&(f.page===null||f.char_start===null||f.value_source_text===null||f.parse_run_id===null))fail('constraint_violation','broker_fields_confirmed_span');
  if(EFF.has(f.status)&&effectiveExists(f))fail('duplicate_key','broker_fields_effective_uniq');
  fields.set(f.field_id,f);return f;
 };

 // ---------------------------------------------------------------- blockers (§4.4; SQL order)
 const blockersOf=(rep:string):string[]=>{
  const r=reports.get(rep)??fail('report_not_found');const d=docOf(r);const l=licOf(r);const b:string[]=[];
  const tScope=r.scope==='single_issuer'||r.scope==='multi_issuer';const ts=targets.get(rep)??[];
  const eff=picks(rep).filter(p=>p.isEff);
  if(r.review_status!=='approved')b.push('review_not_approved');
  if(!licenceOk(l))b.push('licence_unconfirmed');
  if(!l.allows_public_metadata)b.push('licence_no_public_metadata');
  if(d.status!=='parsed'||d.promotion_pending)b.push('document_not_parsed');
  for(const c of ['scope','title_original','published_date','institution_id'] as const)if(r[c]===null)b.push(`report_incomplete:${c}`);
  const reqs:{tk:string|null;field:string;ord:number}[]=['institution','published_date','title'].map(field=>({tk:null,field,ord:1}));
  if(r.scope==='sector'||r.scope==='macro_strategy')reqs.push({tk:null,field:'sector',ord:1});
  if(tScope)for(const t of ts){
   for(const field of ['ticker','rating','target_price'])reqs.push({tk:t.target_key,field,ord:2});
   if(eff.some(p=>p.f.target_key===t.target_key&&p.f.field==='target_price'&&p.f.status!=='absent'))for(const field of ['target_currency','price_at_report','price_currency','price_as_of_date'])reqs.push({tk:t.target_key,field,ord:2});
  }
  const hasValue=(p:FieldPick,field:string)=>p.f.status==='absent'||({published_date:p.v.value_date,price_as_of_date:p.v.value_date,target_price:p.v.value_num,price_at_report:p.v.value_num,target_currency:p.v.value_currency,price_currency:p.v.value_currency} as R)[field]!==null;
  b.push(...reqs.filter(q=>!eff.some(p=>p.f.target_key===q.tk&&p.f.field===q.field&&hasValue(p,q.field)))
   .sort((x,y)=>x.ord-y.ord||cmp(x.tk??'',y.tk??'')||cmp(x.field,y.field)).map(q=>`required_field_missing:${q.field}${q.tk?`:${q.tk}`:''}`));
  const required=new Set(['institution','published_date','title',...(r.scope==='sector'||r.scope==='macro_strategy'?['sector']:[]),...(tScope?['ticker','rating','target_price','target_currency','price_at_report','price_currency','price_as_of_date']:[])]);
  const effKeys=new Set(effOf(rep).map(idKey));
  b.push(...[...new Set(liveCand(rep).filter(f=>required.has(f.field)&&!effKeys.has(idKey(f))).map(f=>`field_pending:${f.field}`))].sort(cmp));
  if(tScope)b.push(...ts.filter(t=>t.issuer_id===null||t.basis!=='effective').map(t=>`target_unresolved:${t.target_key}`).sort(cmp));
  const ni=new Set(ts.map(t=>t.issuer_id).filter(x=>x!==null)).size;
  if((r.scope==='single_issuer'&&(ni!==1||ts.length<1))||(r.scope==='multi_issuer'&&ni<2)||((r.scope==='sector'||r.scope==='macro_strategy')&&ts.length!==0))b.push('target_cardinality');
  const q=(tables as unknown as {rows?:(t:string)=>Row[]}).rows?.('dq_quarantine')??[];
  b.push(...[...new Set(q.filter(x=>x.dataset==='broker_research'&&x.status==='open'&&String(x.natural_key).startsWith(`${d.sha256}:`)&&BLOCKING_Q.has(String(x.reason_code))).map(x=>`quarantine_open:${String(x.reason_code)}`))].sort(cmp));
  const live=liveDigests(rep);
  if(r.materialized_hash===null||r.materialized_hash!==live.effective_hash||r.effective_hash!==live.effective_hash||r.rules_input_hash!==live.rules_input_hash||r.summary_input_digest!==live.summary_input_digest)b.push('materialize_stale');
  const rr=receiptFor(r);
  if(!rr||rr.results.some(x=>x.passed===false&&x.blocking===true))b.push('rules_stale');
  const llm=effOf(rep).filter(f=>f.extractor.startsWith('llm:'));
  if(llm.length){
   const digests=[...new Set(llm.map(f=>runs.get(f.run_id??'')?.behavior_digest??''))];
   const covered=[...new Set(effOf(rep).map(f=>f.field))];   // every effective field, absent included, once gated (P-R1-12, P-R2 recheck)
   const ok=settings.approved_gold_corpus_hash!==null&&digests.every(dg=>{const e=latestEval(dg);return !!e&&e.passed&&e.corpus_kind==='gold'&&e.corpus_hash===settings.approved_gold_corpus_hash&&e.n_docs>=30&&covered.every(fl=>((e.per_field[fl]?.tp??0)+(e.per_field[fl]?.fn??0))>0);});
   if(!ok)b.push('eval_receipt_missing');
  }
  if([...summaries.values()].some(s=>s.report_id===rep&&s.status==='approved'&&s.input_hash!==r.summary_input_digest))b.push('summary_stale');
  for(const surface of ['title_original','title_public','title_zh','title_en'] as const){
   if(r[surface]===null)continue;
   const res=rr?.results.find(x=>x.rule==='disclosure'&&x.detail?.surface===surface);
   if(!res||res.passed!==true)if(surface!=='title_original'||r.title_public===null)b.push(`restricted_value_in_text:${surface}`);
  }
  b.push(...[...snippets.values()].filter(s=>s.report_id===rep&&s.status==='approved'&&(s.disclosure_check?.passed!==true||s.disclosure_check.db_digest!==disclosureDigestOf(rep))).map(s=>`restricted_value_in_text:snippet:${s.snippet_id}`).sort(cmp));
  b.push(...[...summaries.values()].filter(s=>s.report_id===rep&&s.status==='approved'&&(s.disclosure_check?.passed!==true||s.disclosure_check.db_digest!==disclosureDigestOf(rep))).map(s=>`restricted_value_in_text:summary:${s.lang}`).sort(cmp));
  if(!r.evidence_ok)b.push('evidence_drift');
  if(!r.disclosure_ok)b.push('disclosure_stale');
  const groups=new Map<string,FieldRow[]>();for(const f of liveCand(rep))groups.set(idKey(f),[...(groups.get(idKey(f))??[]),f]);
  b.push(...[...groups.entries()].filter(([k,g])=>g.length>=2&&!effKeys.has(k)).map(([,g])=>g[0]).sort((x,y)=>cmp(x.field,y.field)||cmp(x.target_key??'',y.target_key??'')).map(f=>`conflict_unresolved:${f.field}${f.target_key?`:${f.target_key}`:''}`));
  return b;
 };
 const receiptFor=(r:ReportRow)=>[...ruleReceipts].reverse().find(x=>x.report_id===r.report_id&&x.input_hash===r.rules_input_hash&&x.rules_version===RULES_VERSION)??null;
 const latestEval=(digest:string)=>[...evals].reverse().find(e=>e.behavior_digest===digest)??null;

 // ---------------------------------------------------------------- approval checks (§4.7)
 const snippetGate=(s:SnippetRow)=>{
  if(s.status!=='approved')return;
  const n=licOf(reports.get(s.report_id)!).snippet_max_chars;
  if(s.text===null||s.text.length>n)fail('snippet_too_long',String(s.text?.length??0));
  if(s.disclosure_check?.passed!==true||s.disclosure_check.version!==DISCLOSURE_VERSION)fail('disclosure_failed');
  if(!s.approved_by)fail('approver_required');
 };
 const summaryGate=(s:SummaryRow)=>{
  if(s.status!=='approved')return;
  const r=reports.get(s.report_id)!;const n=licOf(r).snippet_max_chars;
  if(s.max_verbatim_overlap>n)fail('summary_overlap',String(s.max_verbatim_overlap));
  if(s.numeric_grounding?.passed!==true)fail('summary_ungrounded');
  if(s.disclosure_check?.passed!==true||s.disclosure_check.version!==DISCLOSURE_VERSION)fail('disclosure_failed');
  if(s.input_hash!==r.summary_input_digest)fail('summary_stale');
  if(!s.approved_by)fail('approver_required');
  if([...summaries.values()].some(x=>x.summary_id!==s.summary_id&&x.report_id===s.report_id&&x.lang===s.lang&&x.status==='approved'))fail('duplicate_key','broker_summaries_approved_uniq');
 };
 /** = SQL broker_llm_fence: lease held and unexpired, run of this document and kind still running. */
 const llmFence=(documentId:string,token:string,runId:string,kind:string)=>{
  const d=documents.get(documentId)??fail('document_not_found');
  if(d.lease_token!==token||d.lease_until===null||d.lease_until<=now())fail('lease_lost');
  const run=runs.get(runId);if(!run||run.document_id!==documentId||run.kind!==kind||run.status!=='running')fail('run_invalid');
  return run;
 };
 const childWritable=(rep:string)=>{const r=reports.get(rep);if(r?.status==='published')fail('published_immutable',`child`);};

 // ---------------------------------------------------------------- documents and the withdraw cascade
 const moveDocument=(d:DocumentRow,to:DocumentStatus,patch:Partial<DocumentRow>={})=>{
  const from=d.status;
  if(to!==from){
   if(from==='withdrawn'){if(!(to==='uploaded'&&d.withdrawn_reason==='promotion_lost'&&d.purged_at===null))fail('document_transition_invalid',`${from}->${to}`);}
   else if(to!=='withdrawn'&&!DOC_MOVES.has(`${from}>${to}`))fail('document_transition_invalid',`${from}->${to}`);
  }
  const next={...d,...patch,status:to};
  if((next.purge_requested_at===null)!==(next.purge_requested_by===null))fail('constraint_violation','broker_documents_purge_intent');
  if(next.status==='parsed'&&next.current_parse_run_id===null)fail('document_parse_run_required');
  if(next.promotion_pending&&!d.promotion_pending)fail('document_promotion_pending_only_clears');
  Object.assign(d,next);
  if(to==='withdrawn'&&from!=='withdrawn'){
   const r=[...reports.values()].find(x=>x.document_id===d.document_id&&x.status!=='withdrawn');
   if(r){
    if(r.current_publication_id){const p=publications.get(r.current_publication_id)!;if(p.unpublished_at===null)Object.assign(p,{unpublished_at:now(),unpublish_reason:`withdrawn:${d.withdrawn_reason}`});}
    setReport(r,{status:'withdrawn'});
   }
  }
 };

 // ---------------------------------------------------------------- public views (§4.11)
 const visible=()=>[...reports.values()].filter(r=>{
  if(!settings.public_enabled||r.status!=='published'||!r.evidence_ok||!r.disclosure_ok)return false;
  const d=docOf(r),l=licOf(r),p=r.current_publication_id?publications.get(r.current_publication_id):undefined;
  return d.status!=='withdrawn'&&licenceOk(l)&&l.allows_public_metadata&&!!p&&p.licence_version===l.version;
 });
 const reportView=(r:ReportRow):R=>{const d=docOf(r),l=licOf(r),p=publications.get(r.current_publication_id!)!;
  return {report_id:r.report_id,revision:r.revision,publication_id:r.current_publication_id,scope:r.scope,institution_id:r.institution_id,title:r.title_public??r.title_original,title_is_rewritten:r.title_public!==null,
   title_zh:r.title_zh,title_en:r.title_en,title_is_translation:r.title_run_id!==null,published_date:r.published_date,price_as_of_date:r.price_as_of_date,report_type:r.report_type,sector_as_stated:r.sector_as_stated,
   primary_target_key:r.primary_target_key,available_at:d.uploaded_at,code_version:r.code_version,published_at:p.published_at,supersedes_report_id:r.supersedes_report_id,page_count:d.page_count,
   snippet_max_chars:l.snippet_max_chars,target_price_public:l.allows_public_target_price,summary_public:l.allows_public_summary,snippets_public:l.allows_public_snippets,
   rules_version:ruleReceipts.find(x=>x.receipt_id===p.rules_receipt_id)?.rules_version??null,title_model_id:r.title_run_id?runs.get(r.title_run_id)?.model_id??null:null,
   target_facets:[...new Map((targets.get(r.report_id)??[]).map(t=>{const currency=l.allows_public_target_price&&t.target_price!==null?t.target_currency:t.price_at_report!==null?t.price_currency:null;
    return [`${t.issuer_id}|${t.rating_normalized}|${t.security_ticker}|${currency}`,{issuer_id:t.issuer_id,rating:t.rating_normalized as NormalizedRating|null,security_ticker:t.security_ticker,currency}];})).values()],
   has_summary:l.allows_public_summary&&[...summaries.values()].some(s=>s.report_id===r.report_id&&s.status==='approved')};};
 const targetView=(r:ReportRow)=>{const tpOk=licOf(r).allows_public_target_price;return (targets.get(r.report_id)??[]).map(t=>({report_id:t.report_id,publication_id:r.current_publication_id,target_key:t.target_key,ticker_as_stated:t.ticker_as_stated,security_ticker:t.security_ticker,issuer_id:t.issuer_id,
  rating_raw:t.rating_raw,rating_normalized:t.rating_normalized,scale_id:t.scale_id,target_price:tpOk?t.target_price:null,target_currency:tpOk?t.target_currency:null,target_horizon_months:tpOk?t.target_horizon_months:null,
  upside_pct:tpOk?t.upside_pct:null,target_price_public:tpOk,price_at_report:t.price_at_report,price_currency:t.price_currency,price_as_of_date:t.price_as_of_date,upside_formula_version:tpOk?t.upside_formula_version:null}) as R);};
 const citationView=(r:ReportRow)=>{const tpOk=licOf(r).allows_public_target_price;
  return effOf(r.report_id).filter(f=>!(['target_price','target_currency','target_horizon','upside_stated'].includes(f.field)&&!tpOk)&&(f.field!=='analyst'||bindings.some(b=>b.field_id===f.field_id&&analysts.get(b.analyst_id)?.public_display))&&!(f.field==='title'&&r.title_restricted))
   .map(f=>({report_id:f.report_id,field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,page:f.page,...effectiveValue(f),status:f.status,extractor_kind:f.extractor.split(':')[0]}) as R);};
 const snippetView=(r:ReportRow)=>{const l=licOf(r);return [...snippets.values()].filter(s=>s.report_id===r.report_id&&s.status==='approved'&&l.allows_public_snippets&&(s.text??'').length<=l.snippet_max_chars).map(s=>({snippet_id:s.snippet_id,report_id:s.report_id,target_key:s.target_key,purpose:s.purpose,page:s.page,text:s.text,field_id:s.field_id}) as R);};
 const summaryView=(r:ReportRow)=>licOf(r).allows_public_summary?[...summaries.values()].filter(s=>s.report_id===r.report_id&&s.status==='approved').map(s=>{const ru=runs.get(s.run_id);return {summary_id:s.summary_id,report_id:s.report_id,lang:s.lang,kind:s.kind,model_id:ru?.model_id??null,registry_hash:ru?.registry_hash??null,prompt_version:ru?.prompt_version??null,input_hash:s.input_hash,summary_md:s.summary_md,generated_at:s.generated_at,
  grounding_assertions:[...(Array.isArray(s.numeric_grounding?.assertions)?s.numeric_grounding.assertions:[])].sort((a,b)=>a.sentence_idx-b.sentence_idx||cmp(a.target_key,b.target_key)||cmp(a.field,b.field)).map(a=>{const {field_id:_f,...rest}=a;void _f;return rest;})} as R;}):[];
 const analystView=(r:ReportRow)=>bindings.filter(b=>b.report_id===r.report_id&&analysts.get(b.analyst_id)?.public_display).map(b=>{const a=analysts.get(b.analyst_id)!;return {report_id:b.report_id,analyst_id:b.analyst_id,display_name:a.display_name,institution_id:a.institution_id,role:b.role} as R;});
 const institutionView=()=>{const vis=visible();return [...institutions.values()].filter(i=>settings.public_enabled&&vis.some(r=>r.institution_id===i.institution_id)).map(i=>{
  const mine=vis.filter(r=>r.institution_id===i.institution_id);const max=(xs:(string|null)[])=>xs.filter((x):x is string=>x!==null).sort().at(-1)??null;
  return {institution_id:i.institution_id,name_en:i.name_en,name_zh:i.name_zh,aliases:i.aliases,kind:i.kind,rating_disclosure_url:i.rating_disclosure_url,
   report_count:mine.length,last_published_date:max(mine.map(r=>r.published_date)),last_available_at:max(mine.map(r=>docOf(r).uploaded_at))} as R;});};
 const historyView=()=>{
  const vis=visible();const superseded=new Set(vis.map(r=>r.supersedes_report_id).filter(Boolean));
  const rows=vis.filter(r=>!superseded.has(r.report_id)).flatMap(r=>targetView(r).map(t=>({t,r:reportView(r)})));
  const part=(x:{t:R;r:R})=>`${x.r.institution_id}|${x.t.security_ticker}|${x.t.target_currency}`;
  rows.sort((a,b)=>cmp(part(a),part(b))||cmp(String(a.r.published_date),String(b.r.published_date))||cmp(String(a.t.report_id),String(b.t.report_id)));
  return rows.map((x,i)=>{const p=i>0&&part(rows[i-1])===part(x)?rows[i-1]:null;
   return {report_id:x.t.report_id,prev_report_id:p?.t.report_id??null,target_key:x.t.target_key,institution_id:x.r.institution_id,security_ticker:x.t.security_ticker,issuer_id:x.t.issuer_id,published_date:x.r.published_date,prev_published_date:p?.r.published_date??null,
    rating_normalized:x.t.rating_normalized,prev_rating_normalized:p?.t.rating_normalized??null,scale_id:x.t.scale_id,prev_scale_id:p?.t.scale_id??null,target_price:x.t.target_price,prev_target_price:p?.t.target_price??null,target_currency:x.t.target_currency,
    upside_formula_version:x.t.upside_formula_version,prev_upside_formula_version:p?.t.upside_formula_version??null,code_version:x.r.code_version,prev_code_version:p?.r.code_version??null,available_at:x.r.available_at,prev_available_at:p?.r.available_at??null} as R;});
 };

 const db:MemoryBrokerResearchDb={
  tables,
  setNow(iso){fixedNow=iso;},
  expireLease(id){const d=req(documents,id,'document');if(d.lease_token)d.lease_until=new Date(Date.parse(now())-1000).toISOString();},
  outbox:()=>clone(outbox),
  async getSettings(){return clone(settings);},
  async setPublicEnabled(flag,by){Object.assign(settings,{public_enabled:flag,updated_by:by,updated_at:now()});},
  async setApprovedGoldCorpus(hash,by){
   if(hash!==null&&!/^[0-9a-f]{64}$/.test(hash))fail('constraint_violation','broker_research_settings_gold_hash');
   Object.assign(settings,{approved_gold_corpus_hash:hash,approved_gold_corpus_by:hash===null?null:by,approved_gold_corpus_at:hash===null?null:now(),updated_by:by,updated_at:now()});
  },
  async listLicences(){return clone([...licences.values()].sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.licence_id,b.licence_id)));},
  async getLicence(id){return clone(licences.get(id)??null);},
  async insertLicence(input){
   if(!(input.snippet_max_chars>0&&input.snippet_max_chars<=500))fail('constraint_violation','broker_licences_snippet_max');
   const t=stamp();const l:LicenceRow={licence_id:randomUUID(),version:1,...input,confirmed_by:null,confirmed_at:null,confirmed_version:null,created_at:t,updated_at:t};
   licences.set(l.licence_id,l);return clone(l);
  },
  async updateLicence(id,patch){
   const l=licences.get(id)??fail('not_found','licence');
   if(patch.snippet_max_chars!==undefined&&!(patch.snippet_max_chars>0&&patch.snippet_max_chars<=500))fail('constraint_violation','broker_licences_snippet_max');
   const material=MATERIAL.some(k=>k in patch&&!same(patch[k],l[k]));
   Object.assign(l,Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined)),{updated_at:now()});
   if(material){
    Object.assign(l,{version:l.version+1,confirmed_by:null,confirmed_at:null,confirmed_version:null});
    for(const r of reports.values())if(docOf(r).licence_id===id){draftTexts(r.report_id,'licence_version');if(r.status!=='withdrawn'&&r.disclosure_ok)setReport(r,{disclosure_ok:false});}
    enqueue('licence.changed',{licence_id:id,version:l.version,previous_version:l.version-1});
   }
   return clone(l);
  },
  async confirmLicence(id,by,version){const l=licences.get(id)??fail('not_found','licence');if(l.version!==version)return 'version_mismatch';Object.assign(l,{confirmed_by:by,confirmed_at:now(),confirmed_version:version,updated_at:now()});return 'confirmed';},
  async insertIntent(row){if(intents.has(row.intent_id))fail('duplicate_key');if(row.staging_path!==`staging/${row.intent_id}.pdf`)fail('constraint_violation','broker_intents_staging_path');intents.set(row.intent_id,{...clone(row),created_at:stamp(),checkpoint_at:null,error_code:null});},
  async getIntent(id){return clone(intents.get(id)??null);},
  async transitionIntent(id,from,to,patch){
   const i=intents.get(id);if(!i||i.status!==from)return false;
   if(to!==from&&!INTENT_MOVES.has(`${from}>${to}`))fail('intent_transition_invalid',`${from}->${to}`);
   if(patch?.document_id!==undefined&&i.document_id!==null&&patch.document_id!==i.document_id)fail('intent_document_set_once');
   const next={...i,...patch,status:to as IntentStatus};
   if(next.status==='committed'&&next.document_id===null)fail('constraint_violation','broker_intents_committed_document');
   Object.assign(i,next,to!==from?{checkpoint_at:now()}:{});return true;
  },
  async findDocumentBySha(sha){return clone([...documents.values()].find(d=>d.sha256===sha)??null);},
  async getDocument(id){return clone(documents.get(id)??null);},
  async insertDocument(row){
   if([...documents.values()].some(d=>d.sha256===row.sha256||d.document_id===row.document_id))return 'duplicate';
   if(row.storage_path!==`reports/${row.sha256}.pdf`)fail('constraint_violation','broker_documents_storage_path');
   documents.set(row.document_id,{...row,page_count:null,uploaded_at:stamp(),current_parse_run_id:null,status:'uploaded',lease_token:null,lease_until:null,promotion_pending:true,last_verified_at:null,verify_status:null,withdrawn_at:null,withdrawn_reason:null,purged_at:null,purge_requested_at:null,purge_requested_by:null});
   return 'inserted';
  },
  async withdrawWithIntent(id,reason,purge,by){const d=req(documents,id,'document');const at=now();moveDocument(d,'withdrawn',{withdrawn_at:d.withdrawn_at??at,withdrawn_reason:d.status==='withdrawn'?d.withdrawn_reason:reason,...(purge&&!d.purge_requested_at?{purge_requested_at:at,purge_requested_by:by}:{})});},
  async updateDocument(id,patch){const d=req(documents,id,'document');const {status,...rest}=patch;moveDocument(d,status??d.status,rest);},
  async claimLease(id,token,ttl){
   if(!token||!(ttl>=1))fail('invalid_lease_args');
   const d=req(documents,id,'document');
   if(d.lease_until!==null&&d.lease_until>=now())return false;
   if(d.lease_token!==null)for(const r of runs.values())if(r.document_id===id&&r.status==='running'&&r.kind!=='verify')Object.assign(r,{status:'failed',finished_at:now(),detail:{...r.detail,error_code:'lease_expired'}});
   Object.assign(d,{lease_token:token,lease_until:plusSec(ttl)});return true;
  },
  async renewLease(id,token,ttl){
   if(!token||!(ttl>=1))fail('invalid_lease_args');
   const d=req(documents,id,'document');
   if(d.lease_token!==token||d.lease_until===null||d.lease_until<=now())return 'lease_lost';
   if(d.status==='withdrawn')return 'document_withdrawn';
   d.lease_until=plusSec(ttl);return 'ok';
  },
  async fencedUpdateDocument(id,token,patch){
   const d=req(documents,id,'document');if(d.lease_token!==token)return 'lease_lost';
   const {releaseLease,status,...rest}=patch;
   moveDocument(d,status??d.status,Object.fromEntries(Object.entries(rest).filter(([,v])=>v!==undefined)));
   if(releaseLease)Object.assign(d,{lease_token:null,lease_until:null});
   return 'ok';
  },
  async insertRun(row){
   if(runs.has(row.run_id))fail('duplicate_key');
   if(['extract','summary','translate'].includes(row.kind)&&!row.parse_run_id)fail('constraint_violation','broker_runs_parse_link');
   if(['extract','summary','translate'].includes(row.kind)&&!(row.model_id&&row.registry_hash&&row.prompt_version))fail('constraint_violation','broker_runs_llm_lineage');
   if(row.kind==='extract'&&!(row.schema_version&&row.behavior_digest))fail('constraint_violation','broker_runs_extract_lineage');
   runs.set(row.run_id,{...clone(row),detail:clone(row.detail??{}),status:'running',started_at:stamp(),finished_at:null});runSeq.set(row.run_id,runSeq.size);
  },
  async finishRun(id,token,patch){
   const r=runs.get(id)??fail('run_not_found');
   if(!(r.kind==='verify'&&token===null)){
    const d=documents.get(r.document_id)!;
    if(d.lease_token!==token){if(r.status==='running')Object.assign(r,{status:'failed',finished_at:now(),detail:{...r.detail,...(patch.detail??{}),error_code:'lease_lost',lease_lost:true}});return 'lease_lost';}
   }
   if(r.status!=='running')fail('run_finished');
   if(patch.status!=='succeeded'&&patch.status!=='failed')fail('invalid_patch');
   if(patch.extractor_version!==undefined&&r.extractor_version!==null&&patch.extractor_version!==r.extractor_version)fail('extractor_version_immutable');
   const next={...r,...Object.fromEntries(Object.entries(patch).filter(([k,v])=>v!==undefined&&k!=='detail')),detail:{...r.detail,...(patch.detail??{})},finished_at:now()} as RunRow;
   if(next.kind==='parse'&&next.status==='succeeded'&&!(next.artifact_path&&next.artifact_hash))fail('constraint_violation','broker_runs_parse_artifact');
   if(next.kind==='parse'&&next.status==='succeeded'&&!next.extractor_version)fail('constraint_violation','broker_runs_parse_extractor');
   Object.assign(r,next);return 'ok';
  },
  async getRun(id){return clone(runs.get(id)??null);},
  async listRuns(documentId){return clone([...runs.values()].filter(r=>r.document_id===documentId).sort((a,b)=>cmp(a.started_at,b.started_at)||cmp(a.run_id,b.run_id)));},
  async ensureReport(documentId,codeVersion){
   const have=[...reports.values()].find(r=>r.document_id===documentId);if(have)return clone(have);
   req(documents,documentId,'document');const t=stamp();
   const r:ReportRow={report_id:randomUUID(),document_id:documentId,revision:1,scope:null,institution_id:null,title_original:null,title_lang:null,title_zh:null,title_en:null,title_run_id:null,title_public:null,title_public_by:null,
    published_date:null,price_as_of_date:null,report_type:null,sector_as_stated:null,primary_target_key:null,effective_hash:null,materialized_hash:null,rules_input_hash:null,summary_input_digest:null,
    title_restricted:false,evidence_ok:true,disclosure_ok:true,review_status:'pending',status:'draft',current_publication_id:null,supersedes_report_id:null,code_version:codeVersion,created_at:t,updated_at:t};
   reports.set(r.report_id,r);return clone(r);
  },
  async getReport(id){return clone(reports.get(id)??null);},
  async reportByDocument(id){return clone([...reports.values()].find(r=>r.document_id===id)??null);},
  async listReports(o){return clone([...reports.values()].filter(r=>r.institution_id===o.institutionId).sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.report_id,b.report_id)));},
  async setReportFlags(id,flags){
   const r=reports.get(id)??fail('not_found','report');if(r.status==='withdrawn')fail('report_withdrawn');
   setReport(r,Object.fromEntries(Object.entries(flags).filter(([,v])=>v!==undefined)) as Partial<ReportRow>);
  },
  async updateReportDraft(id,patch){
   const r=reports.get(id)??fail('report_not_found');
   if(r.status==='withdrawn')fail('report_withdrawn');
   const p=Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined)) as Partial<ReportRow>;
   if(r.status==='published'&&Object.entries(p).some(([k,v])=>!['evidence_ok','disclosure_ok','supersedes_report_id'].includes(k)&&!same((r as unknown as R)[k],v)))fail('published_immutable');
   if(p.title_public!==undefined&&p.title_public!==null&&!(p.title_public_by??r.title_public_by))fail('constraint_violation','broker_reports_title_public_by');
   setReport(r,p);
  },
  async extractCommit(documentId,token,runId,rows){return atomic(()=>{
   if(!Array.isArray(rows))fail('invalid_rows');
   if(rows.some(x=>x.status!=='extracted'&&x.status!=='unverified'))fail('invalid_rows','status');
   const d=documents.get(documentId)??fail('document_not_found');
   if(d.lease_token!==token||d.lease_until===null||d.lease_until<=now())fail('lease_lost');
   const run=runs.get(runId);if(!run||run.document_id!==documentId||run.kind!=='extract'||run.status!=='running')fail('run_invalid');
   const r=[...reports.values()].find(x=>x.document_id===documentId)??fail('report_not_found');lockDraft(r.report_id);
   for(const f of liveCand(r.report_id))if(f.run_id!==runId)f.superseded_by_run_id=runId;
   const t=stamp();
   for(const x of rows as CandidateFieldInput[]){const {resolution,...rest}=x;newField({...clone(rest),report_id:r.report_id,parse_run_id:run!.parse_run_id,run_id:runId,created_at:t,detail:{...(rest.detail??{}),...(resolution&&typeof resolution==='object'?{resolution:clone(resolution)}:{})}});}
   return materializeNow(r.report_id);
  });},
  async fieldReview(fieldId,action,payload,by){return atomic(()=>{
   if(!['confirm','correct','reject','absent'].includes(action))fail('invalid_action',String(action));
   const f0=fields.get(fieldId)??fail('field_not_found');lockDraft(f0.report_id);const f=f0;const {detail:pd,...p}=(payload??{}) as R;
   if(pd!==undefined&&(pd===null||typeof pd!=='object'||Array.isArray(pd)))fail('invalid_payload','detail');
   if((action==='confirm'||action==='correct')&&effectiveExists(f,f.field_id))fail('effective_exists');
   if(action==='confirm'){
    if(!['extracted','unverified','corrected'].includes(f.status))fail('field_not_reviewable',f.status);
    if(['page','char_start','char_end','value_source_text'].some(k=>k in p)){
     if(!('page' in p&&'char_start' in p&&'char_end' in p&&typeof p.value_source_text==='string'))fail('invalid_payload','span');
     Object.assign(f,{page:Number(p.page),char_start:Number(p.char_start),char_end:Number(p.char_end),value_source_text:p.value_source_text});
    }else if(f.char_start===null)fail('span_required');
    Object.assign(f,{status:'confirmed',corrected:null,reviewed_by:by,reviewed_at:now()});
   }else if(action==='correct'){
    if(!['extracted','unverified','confirmed','corrected'].includes(f.status))fail('field_not_reviewable',f.status);
    const corr=Object.fromEntries(Object.entries(p).filter(([k])=>!['page','char_start','char_end','value_source_text'].includes(k)));
    if(Object.keys(corr).some(k=>!['value_text','value_num','value_currency','value_unit','value_date'].includes(k))||typeof corr.value_text!=='string')fail('invalid_payload','corrected');
    if(corr.value_num!=null&&!/^-?[0-9]+(\.[0-9]+)?$/.test(String(corr.value_num)))fail('invalid_payload','value_num');
    if(corr.value_date!=null){const s=String(corr.value_date);const dt=new Date(`${s}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(dt.getTime())||dt.toISOString().slice(0,10)!==s)fail('invalid_payload','value_date');}
    if(['page','char_start','char_end','value_source_text'].some(k=>k in p)){
     if(!('page' in p&&'char_start' in p&&'char_end' in p&&typeof p.value_source_text==='string'))fail('invalid_payload','span');
     Object.assign(f,{page:Number(p.page),char_start:Number(p.char_start),char_end:Number(p.char_end),value_source_text:p.value_source_text});
    }else if(f.char_start===null)fail('span_required');
    Object.assign(f,{status:'corrected',corrected:corr,reviewed_by:by,reviewed_at:now()});
   }else if(action==='reject'){
    if(f.status==='rejected')fail('field_not_reviewable','rejected');
    Object.assign(f,{status:'rejected',corrected:null,reviewed_by:by,reviewed_at:now()});
   }else{
    if(!['rating','target_price','analyst','target_horizon'].includes(f.field))fail('absent_not_allowed',f.field);
    if(f.status==='absent')fail('field_not_reviewable','absent');
    const page=p.page!==undefined?Number(p.page):f.page;if(page===null||!(page>=1))fail('invalid_payload','page');
    if(effectiveExists(f,f.field_id))fail('effective_exists');
    if(f.status!=='rejected')Object.assign(f,{status:'rejected',corrected:null,reviewed_by:by,reviewed_at:now()});
    newField({report_id:f.report_id,parse_run_id:f.parse_run_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,value_text:'ABSENT',page,extractor:`human:${by}`,status:'absent',reviewed_by:by,reviewed_at:now(),detail:{replaces:f.field_id}});
   }
   if(pd)f.detail={...f.detail,...clone(pd as R)};
   if(action!=='reject')rejectSiblings(f,by);
   return materializeNow(f.report_id);
  });},
  async insertHumanField(reportId,row,by){return atomic(()=>{
   const r=lockDraft(reportId);
   if(row.status!=='confirmed'&&row.status!=='absent')fail('invalid_payload','status');
   const pr=runs.get(row.parse_run_id);if(!pr||pr.document_id!==r.document_id||pr.kind!=='parse'||pr.status!=='succeeded')fail('invalid_payload','parse_run_id');
   if(effectiveExists({report_id:reportId,target_key:row.target_key,field:row.field,occurrence:row.occurrence??1}))fail('effective_exists');
   const absent=row.status==='absent';
   const f=newField({report_id:reportId,parse_run_id:row.parse_run_id,target_key:row.target_key,field:row.field,occurrence:row.occurrence??1,value_text:absent?'ABSENT':row.value_text,value_num:absent?null:row.value_num,value_currency:absent?null:row.value_currency,value_unit:absent?null:row.value_unit,value_date:absent?null:row.value_date,
    page:row.page,char_start:absent?null:row.char_start,char_end:absent?null:row.char_end,value_source_text:absent?null:row.value_source_text,extractor:`human:${by}`,status:row.status,reviewed_by:by,reviewed_at:now()});
   return {fieldId:f.field_id,receipt:materializeNow(reportId)};
  });},
  async upsertTargetOverride(row){return atomic(()=>{
   lockDraft(row.report_id);const k=`${row.report_id}|${row.target_key}`;const had=overrides.get(k);
   overrides.set(k,{override_id:had?.override_id??randomUUID(),report_id:row.report_id,target_key:row.target_key,security_ticker:row.security_ticker,issuer_id:row.issuer_id,set_by:row.set_by,set_at:now(),note:row.note});
   return materializeNow(row.report_id);
  });},
  async materialize(id){return atomic(()=>materializeNow(id));},
  async listFields(reportId,opts){return clone(fieldsOf(reportId).filter(f=>opts?.includeSuperseded||f.superseded_by_run_id===null)
   .sort((a,b)=>(a.target_key===null?0:1)-(b.target_key===null?0:1)||cmp(a.target_key??'',b.target_key??'')||cmp(a.field,b.field)||a.occurrence-b.occurrence||cmp(a.created_at,b.created_at)||cmp(a.field_id,b.field_id)));},
  async listTargets(reportId){return clone(targets.get(reportId)??[]);},
  async bindAnalyst(row){
   childWritable(row.report_id);
   const f=fields.get(row.field_id);if(!f||f.report_id!==row.report_id||f.field!=='analyst')fail('analyst_field_mismatch');
   const i=bindings.findIndex(b=>b.report_id===row.report_id&&b.analyst_id===row.analyst_id);
   if(i>=0)bindings[i]={...row};else bindings.push({...row});
   draftTexts(row.report_id,'analyst_disclosure');                       // = SQL broker_report_analysts_after_change (P-R1-04)
  },
  async listReportAnalysts(reportId){return clone(bindings.filter(b=>b.report_id===reportId).sort((a,b)=>cmp(a.analyst_id,b.analyst_id)));},
  async insertRuleReceipt(row){const x:RuleReceiptRow={...clone(row),receipt_id:randomUUID(),created_at:stamp()};ruleReceipts.push(x);return x.receipt_id;},
  async insertSnippet(row){
   childWritable(row.report_id);
   if(row.text!==null&&row.text.length>500)fail('constraint_violation','broker_snippets_text_length');
   const s:SnippetRow={...clone(row),snippet_id:randomUUID(),status:'draft',approved_by:null,approved_at:null,created_at:stamp(),draft_reason:null};
   if(s.text===null)fail('constraint_violation','broker_snippets_text_required');
   snippets.set(s.snippet_id,s);return s.snippet_id;
  },
  async setSnippetStatus(id,patch){
   const s=snippets.get(id)??fail('not_found','snippet');const r=reports.get(s.report_id)!;
   const next:SnippetRow={...s,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};
   if(r.status==='published'&&!(next.status==='draft'||next.status==='rejected'))fail('published_immutable','broker_report_snippets');
   if(next.status==='approved'){snippetGate(next);if(s.status!=='approved'){stampDigest(next);Object.assign(next,{approved_at:now(),draft_reason:null});}}
   else if(s.status==='approved')Object.assign(next,{approved_by:null,approved_at:null});
   Object.assign(s,next);
  },
  async getSnippet(id){return clone(snippets.get(id)??null);},
  async listSnippets(reportId){return clone([...snippets.values()].filter(s=>s.report_id===reportId).sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.snippet_id,b.snippet_id)));},
  async summaryCommit(documentId,token,runId,row){return atomic(()=>{
   const run=llmFence(documentId,token,runId,'summary');
   const r=reports.get(row.report_id);if(!r||r.document_id!==documentId)fail('report_mismatch');
   if(row.status!=='draft'&&row.status!=='rejected')fail('invalid_payload','status');childWritable(row.report_id);
   const s:SummaryRow={...clone(row),kind:'independent_summary',run_id:runId,summary_id:randomUUID(),approved_by:null,approved_at:null,generated_at:stamp(),draft_reason:null};
   summaries.set(s.summary_id,s);Object.assign(run,{status:'succeeded',finished_at:stamp(),detail:{...run.detail,summary_id:s.summary_id}});return s.summary_id;
  });},
  async titleCommit(documentId,token,runId,titles){return atomic(()=>{
   const run=llmFence(documentId,token,runId,'translate');
   const r=[...reports.values()].find(x=>x.document_id===documentId&&x.status==='draft')??fail('report_not_draft');
   setReport(r,{title_zh:titles.title_zh,title_en:titles.title_en,title_run_id:runId});Object.assign(run,{status:'succeeded',finished_at:stamp()});return 'ok' as const;
  });},
  async extractSetScope(documentId,token,runId,scope){return atomic(()=>{
   llmFence(documentId,token,runId,'extract');
   if(!['single_issuer','multi_issuer','sector','macro_strategy'].includes(scope))fail('invalid_payload','scope');
   const r=[...reports.values()].find(x=>x.document_id===documentId&&x.status==='draft')??fail('report_not_draft');
   if(r.scope===null)setReport(r,{scope});
   return materializeNow(r.report_id);
  });},
  async extractFinalize(documentId,token,runId,detail){
   const run=llmFence(documentId,token,runId,'extract');const d=documents.get(documentId)!;
   Object.assign(run,{status:'succeeded',finished_at:stamp(),detail:{...run.detail,...detail}});Object.assign(d,{lease_token:null,lease_until:null});
   return 'ok' as const;
  },
  async insertSummary(row){
   childWritable(row.report_id);
   const s:SummaryRow={...clone(row),summary_id:randomUUID(),approved_by:null,approved_at:null,generated_at:stamp(),draft_reason:null};
   if(s.status==='approved')fail('approver_required');
   summaries.set(s.summary_id,s);return s.summary_id;
  },
  async setSummaryStatus(id,patch){
   const s=summaries.get(id)??fail('not_found','summary');const r=reports.get(s.report_id)!;
   const next:SummaryRow={...s,...Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))};
   if(r.status==='published'&&!(next.status==='draft'||next.status==='rejected'))fail('published_immutable','broker_report_summaries');
   if(next.status==='approved'){summaryGate(next);if(s.status!=='approved'){stampDigest(next);Object.assign(next,{approved_at:now(),draft_reason:null});}}
   else if(s.status==='approved')Object.assign(next,{approved_by:null,approved_at:null});
   Object.assign(s,next);
  },
  async getSummary(id){return clone(summaries.get(id)??null);},
  async listSummaries(reportId){return clone([...summaries.values()].filter(s=>s.report_id===reportId).sort((a,b)=>cmp(a.generated_at,b.generated_at)||cmp(a.summary_id,b.summary_id)));},
  async publishBlockers(id){return blockersOf(id);},
  async disclosureDigest(id){return disclosureDigestOf(id);},
  async disclosureRecheck(id,by,checks){return atomic(()=>{
   if(!by)fail('invalid_reviewer');
   const r=reports.get(id)??fail('report_not_found');if(r.status==='withdrawn')fail('report_withdrawn');
   const dg=disclosureDigestOf(id);if(checks.expected_digest!==dg)fail('disclosure_inputs_changed');
   const ok=(c?:DisclosureCheck)=>c?.passed===true&&c.version===DISCLOSURE_VERSION;const f:string[]=[];
   for(const surface of ['title_original','title_public','title_zh','title_en'] as const){
    if(r[surface]===null||ok(checks.titles[surface]))continue;
    if(surface==='title_original'&&r.title_public!==null&&ok(checks.titles.title_public)){if(r.status==='published'&&!r.title_restricted)f.push('title_restricted_change_requires_republish');}
    else f.push(`restricted_value_in_text:${surface}`);
   }
   const sn=[...snippets.values()].filter(s=>s.report_id===id&&s.status==='approved').sort((a,b)=>cmp(a.snippet_id,b.snippet_id));
   const su=[...summaries.values()].filter(s=>s.report_id===id&&s.status==='approved').sort((a,b)=>cmp(a.lang,b.lang));
   for(const s of sn)if(!ok(checks.snippets[s.snippet_id]))f.push(`restricted_value_in_text:snippet:${s.snippet_id}`);
   for(const s of su)if(!ok(checks.summaries[s.summary_id]))f.push(`restricted_value_in_text:summary:${s.lang}`);
   if(f.length)return {restored:false,failures:f};
   if(r.status==='draft'){for(const s of sn)s.disclosure_check={...checks.snippets[s.snippet_id],db_digest:dg};for(const s of su)s.disclosure_check={...checks.summaries[s.summary_id],db_digest:dg};}
   setReport(r,{disclosure_ok:true});
   return {restored:true,failures:[]};
  });},
  async publish(id,by){return atomic(()=>{
   const r=reports.get(id)??fail('report_not_found');if(r.status!=='draft')fail('report_not_draft');
   const b=blockersOf(id);if(b.length)fail('publish_blocked',b.join(','));
   const d=docOf(r),l=licOf(r);const rr=receiptFor(r)!;const pubId=randomUUID();const at=now();
   const titleRes=rr.results.find(x=>x.rule==='disclosure'&&x.detail?.surface==='title_original');const restricted=titleRes?.passed!==true;
   const usedEvals=[...new Set(effOf(id).filter(f=>f.extractor.startsWith('llm:')).map(f=>runs.get(f.run_id??'')?.behavior_digest??''))].map(latestEval).filter((e):e is EvalReceiptRow=>!!e).sort((a,c)=>cmp(c.ran_at,a.ran_at));
   const ts=targets.get(id)??[];
   const snapshot:R={publication_id:pubId,revision:r.revision,published_at:at,published_by:by,
    report:{...clone(r),status:'published',current_publication_id:pubId,title_restricted:restricted},
    document:{document_id:d.document_id,sha256:d.sha256,uploaded_at:d.uploaded_at,licence_id:d.licence_id,current_parse_run_id:d.current_parse_run_id,page_count:d.page_count},
    targets:clone(ts),fields:effRowsJson(id).map(x=>{const f=fields.get(x.field_id)!;return {...x,artifact_hash:x.parse_run_id?runs.get(x.parse_run_id)?.artifact_hash??null:null,
     value_source_text:f.value_source_text,value_source_sha256:f.value_source_text===null?null:sha256Hex(f.value_source_text),framed:f.detail?.framed===true,
     extracted:{value_text:f.value_text,value_num:f.value_num,value_currency:f.value_currency,value_unit:f.value_unit,value_date:f.value_date}};}),
    snippets:[...snippets.values()].filter(s=>s.report_id===id&&s.status==='approved').map(s=>({snippet_id:s.snippet_id,target_key:s.target_key,purpose:s.purpose,parse_run_id:s.parse_run_id,page:s.page,char_start:s.char_start,char_end:s.char_end,text:s.text,field_id:s.field_id,disclosure_check:s.disclosure_check})),
    summaries:[...summaries.values()].filter(s=>s.report_id===id&&s.status==='approved').map(s=>({summary_id:s.summary_id,lang:s.lang,run_id:s.run_id,input_hash:s.input_hash,summary_md:s.summary_md,max_verbatim_overlap:s.max_verbatim_overlap,numeric_grounding:s.numeric_grounding,disclosure_check:s.disclosure_check})),
    rating_scales:ts.map(t=>t.scale_id).filter((x):x is string=>!!x).map(x=>clone(scales.get(x))),
    overrides:[...overrides.values()].filter(o=>o.report_id===id).map(clone),
    analysts:bindings.filter(x=>x.report_id===id).map(x=>({analyst_id:x.analyst_id,role:x.role,field_id:x.field_id})),
    disclosure_inputs:{licence:{licence_id:l.licence_id,version:l.version,allows_public_metadata:l.allows_public_metadata,allows_public_snippets:l.allows_public_snippets,allows_public_summary:l.allows_public_summary,allows_public_target_price:l.allows_public_target_price,snippet_max_chars:l.snippet_max_chars},
     analysts:bindings.filter(x=>x.report_id===id).map(x=>{const a=analysts.get(x.analyst_id)!;return {analyst_id:a.analyst_id,public_display:a.public_display,display_name:a.display_name,name_variants:a.name_variants};})},
    rules_receipt:{receipt_id:rr.receipt_id,rules_version:rr.rules_version,input_hash:rr.input_hash,results:clone(rr.results)},
    eval_receipt_ids:usedEvals.map(e=>e.receipt_id),
    digests:{effective_hash:r.effective_hash,rules_input_hash:r.rules_input_hash,summary_input_digest:r.summary_input_digest}};
   const hash=sha256Hex(canonicalJson(snapshot));
   publications.set(pubId,{publication_id:pubId,report_id:id,revision:r.revision,snapshot,snapshot_hash:hash,licence_version:l.version,rules_receipt_id:rr.receipt_id,eval_receipt_id:usedEvals[0]?.receipt_id??null,published_at:at,published_by:by,unpublished_at:null,unpublish_reason:null});
   setReport(r,{status:'published',current_publication_id:pubId,title_restricted:restricted});
   for(const t of ts.filter(x=>x.target_price!==null)){
    enqueue('claim.register',{claim_key:`broker_target_price:${pubId}:${t.target_key}`,claim_seq:1,claim_type:'broker_target_price',methodology_version:CLAIM_METHODOLOGY_VERSION,
     subject:{security_ticker:t.security_ticker,issuer_id:t.issuer_id,market:marketOf(t.security_ticker),currency:t.target_currency},claimant:{kind:'institution',id:r.institution_id},
     claim:{direction:t.price_at_report===null?0:decimalCompare(t.target_price!,t.price_at_report),target_price:t.target_price,currency:t.target_currency,horizon_months:t.target_horizon_months,reference_price:t.price_at_report,reference_currency:t.price_currency,reference_date:t.price_as_of_date},
     stated_at:r.published_date,available_at:d.uploaded_at,
     source:{report_id:id,publication_id:pubId,snapshot_hash:hash,field_ids:effOf(id).filter(f=>f.target_key===t.target_key).map(f=>f.field_id).sort(cmp)},
     visibility_ref:{view:'broker_report_targets_public_v',report_id:id,target_key:t.target_key}});
   }
   return {publicationId:pubId};
  });},
  async unpublish(id,by,reason){
   if(!by)fail('invalid_publisher');if(!reason||!reason.trim())fail('reason_required');
   const r=reports.get(id)??fail('report_not_found');if(r.status!=='published')fail('report_not_published');
   const p=publications.get(r.current_publication_id!)!;Object.assign(p,{unpublished_at:now(),unpublish_reason:reason});
   setReport(r,{status:'draft',revision:r.revision+1,current_publication_id:null,review_status:'in_review'});
  },
  async getPublication(id){return clone(publications.get(id)??null);},
  async upsertInstitution(row){
   const id=row.institution_id??randomUUID();
   const had=institutions.get(id);
   const next={...had,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined)),institution_id:id,created_at:had?.created_at??stamp()} as InstitutionRow;
   if([...institutions.values()].some(i=>i.institution_id!==id&&i.name_en.toLowerCase()===next.name_en.toLowerCase()))fail('duplicate_key','research_institutions_name_en_uniq');
   institutions.set(id,{...next,aliases:[...next.aliases]});return id;
  },
  async listInstitutions(){return clone([...institutions.values()].sort((a,b)=>cmp(a.name_en,b.name_en)||cmp(a.institution_id,b.institution_id)));},
  async insertRatingScale(row){
   if([...scales.values()].some(s=>s.institution_id===row.institution_id&&s.raw_label.trim().toLowerCase()===row.raw_label.trim().toLowerCase()&&s.valid_from===row.valid_from))fail('duplicate_key','research_rating_scales_label_uniq');
   const s:RatingScaleRow={...row,scale_id:randomUUID(),valid_to:null,created_at:stamp(),closed_by:null,closed_at:null};scales.set(s.scale_id,s);return s.scale_id;
  },
  async closeRatingScale(id,validTo,by){
   const s=scales.get(id)??fail('not_found','rating_scale');
   if(s.valid_to!==null)fail('scale_closed');if(!by)fail('scale_closed_by_required');if(!(validTo>s.valid_from))fail('constraint_violation','research_rating_scales_validity');
   Object.assign(s,{valid_to:validTo,closed_by:by,closed_at:now()});
  },
  async listRatingScales(inst){return clone([...scales.values()].filter(s=>s.institution_id===inst).sort((a,b)=>cmp(a.raw_label,b.raw_label)||cmp(a.valid_from,b.valid_from)||cmp(a.scale_id,b.scale_id)));},
  async upsertAnalyst(row){
   const id=row.analyst_id??randomUUID();const had=analysts.get(id);
   const next={...had,...Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined)),analyst_id:id,created_at:had?.created_at??stamp()} as AnalystRow;
   if(had&&had.institution_id!==next.institution_id)fail('analyst_immutable');
   analysts.set(id,{...next,name_variants:[...next.name_variants]});
   if(had&&!same([had.public_display,had.display_name,had.name_variants],[next.public_display,next.display_name,next.name_variants])){
    for(const rep of new Set(bindings.filter(b=>b.analyst_id===id).map(b=>b.report_id))){const r=reports.get(rep)!;if(r.status!=='withdrawn'&&r.disclosure_ok)setReport(r,{disclosure_ok:false});draftTexts(rep,'analyst_disclosure');}
   }
   return id;
  },
  async listAnalysts(inst){return clone([...analysts.values()].filter(a=>a.institution_id===inst).sort((a,b)=>cmp(a.display_name,b.display_name)||cmp(a.analyst_id,b.analyst_id)));},
  async reviewQueue(opts){const st=opts.status?[opts.status]:['pending','in_review'];return clone([...reports.values()].filter(r=>r.status==='draft'&&st.includes(r.review_status)).sort((a,b)=>cmp(a.updated_at,b.updated_at)||cmp(a.report_id,b.report_id)).slice(0,opts.limit??50));},
  async logAccess(row){access.push({...clone(row),id:randomUUID(),created_at:stamp()});},
  async listAccessLog(opts){return clone(access.filter(a=>!opts.documentId||a.document_id===opts.documentId).sort((a,b)=>cmp(b.created_at,a.created_at)||cmp(b.id,a.id)).slice(0,opts.limit));},
  async insertEvalReceipt(row){
   const pass=row.precision_min!==null&&row.recall_min!==null&&row.precision_min>=0.95&&row.recall_min>=0.95;
   if(row.passed!==pass)fail('constraint_violation','broker_eval_passed_rule');
   const e:EvalReceiptRow={...clone(row),receipt_id:randomUUID(),ran_at:stamp()};evals.push(e);return e.receipt_id;
  },
  async latestEvalReceipt(digest){return clone(latestEval(digest));},
  async takePendingOutbox(limit){return clone(outbox.filter(e=>e.status==='pending').sort((a,b)=>cmp(a.created_at,b.created_at)||cmp(a.event_id,b.event_id)).slice(0,limit));},
  async markOutbox(id,outcome){
   const e=outbox.find(x=>x.event_id===id&&x.status==='pending')??fail('event_not_pending');
   e.attempts+=1;
   if(outcome.delivered)Object.assign(e,{status:'delivered',last_error:null,delivered_at:now()});
   else Object.assign(e,{status:e.attempts>=10?'failed':'pending',last_error:outcome.error,delivered_at:null});
  },
  async upsertPurgeStep(documentId,step,outcome){
   const k=`${documentId}|${step}`;const had=purge.get(k);
   purge.set(k,{document_id:documentId,step,status:outcome.ok?'done':'failed',attempts:(had?.attempts??0)+1,last_error:outcome.ok?null:outcome.error,at:now()});
  },
  async purgeSteps(documentId){return clone([...purge.values()].filter(p=>p.document_id===documentId).sort((a,b)=>cmp(a.step,b.step)));},
  async purgeReportText(reportId,step){
   const r=reports.get(reportId)??fail('not_found','report');if(r.status!=='withdrawn')fail('report_not_withdrawn');
   if(step==='fields_text'){const xs=fieldsOf(reportId);for(const f of xs)Object.assign(f,{value_source_text:null,corrected:null,status:'rejected'});return xs.length;}
   if(step==='snippets_text'){const xs=[...snippets.values()].filter(s=>s.report_id===reportId);for(const s of xs)Object.assign(s,{text:null,status:'rejected',approved_by:null,approved_at:null});return xs.length;}
   if(step==='summaries'){const xs=[...summaries.values()].filter(s=>s.report_id===reportId);for(const s of xs)Object.assign(s,{status:'rejected',approved_by:null,approved_at:null});return xs.length;}
   const sha=docOf(r).sha256;let n=0;
   for(const q of await selectAll(tables,'dq_quarantine',{dataset:'broker_research'},'id'))if(String(q.natural_key).startsWith(`${sha}:`)){await tables.update('dq_quarantine',{id:q.id as string},{payload:{}});n++;}
   return n;
  },
  async verifyCandidates(limit){
   const ids=new Set([...reports.values()].filter(r=>r.status==='published').map(r=>r.document_id));
   return clone([...documents.values()].filter(d=>ids.has(d.document_id)).sort(verifyOrder).slice(0,limit));
  },
  async registerWrite(row){const w:StorageWriteRow={write_id:randomUUID(),...row,status:'pending',started_at:stamp(),finished_at:null,reconciled_at:null,next_attempt_at:now(),attempts:0,deleted_at:null};req(documents,row.document_id,'document');writes.set(w.write_id,w);return w.write_id;},
  async abandonWrite(id){const w=writes.get(id);if(w?.status==='pending')w.status='abandoned';},
  async finishWrite(id){const w=writes.get(id);if(w&&w.status==='pending')Object.assign(w,{status:'done',finished_at:now()});},
  async writesFor(documentId){return clone([...writes.values()].filter(w=>w.document_id===documentId).sort((a,b)=>cmp(a.started_at,b.started_at)||cmp(a.write_id,b.write_id)));},
  async pendingWritesFor(documentId){return clone([...writes.values()].filter(w=>w.document_id===documentId&&w.status==='pending').sort((a,b)=>cmp(a.started_at,b.started_at)||cmp(a.write_id,b.write_id)));},
  async unreconciledWrites(limit){return clone([...writes.values()].filter(w=>(w.status==='pending'||w.status==='done')&&documents.get(w.document_id)?.purge_requested_at!=null&&w.next_attempt_at<=now()).sort((a,b)=>cmp(a.next_attempt_at,b.next_attempt_at)||cmp(a.write_id,b.write_id)).slice(0,limit));},
  async retryWrite(id,nextAttemptAt,attempts){const w=writes.get(id);if(w&&(w.status==='pending'||w.status==='done'))Object.assign(w,{next_attempt_at:nextAttemptAt,attempts});},
  async markReconciled(id,deletedAt){const w=writes.get(id);if(w?.status==='done'&&w.finished_at!==null&&w.finished_at<=deletedAt)Object.assign(w,{status:'reconciled',reconciled_at:now(),deleted_at:deletedAt});},
  async spreadReports(f){
   const matching=visible().filter(r=>r.institution_id!==null).flatMap(r=>targetView(r).map(t=>({r,t,currency:t.target_price!=null?t.target_currency:t.price_at_report!=null?t.price_currency:null})))
    .sort((a,b)=>cmp(String(b.r.published_date),String(a.r.published_date))||cmp(b.r.report_id,a.r.report_id));
   const winners=new Map<string,typeof matching[number]>();
   for(const x of matching){const key=JSON.stringify([x.t.security_ticker,x.currency,x.r.institution_id]);if(!winners.has(key))winners.set(key,x);}
   const selected=[...winners.values()].filter(x=>x.currency!==null&&x.t.issuer_id===f.issuerId&&x.t.security_ticker===f.securityTicker&&x.currency===f.currency&&String(x.r.published_date)>=f.from)
    .sort((a,b)=>cmp(String(a.r.institution_id),String(b.r.institution_id)));
   const out:PublicReportBundle[]=[];for(const x of selected){const b=await this.publicReport(x.r.report_id);if(b)out.push(b);}return out;
  },
  async publicReports(filter){
   let vis=visible();
   if(filter.hasSummary!==undefined)vis=vis.filter(r=>(summaryView(r).length>0)===filter.hasSummary);
   if(filter.issuerId||filter.rating||filter.securityTicker!==undefined||filter.currency!==undefined){const ok=new Set(vis.flatMap(r=>targetView(r)).filter(t=>(!filter.issuerId||t.issuer_id===filter.issuerId)&&(!filter.rating||t.rating_normalized===filter.rating)
    &&(filter.securityTicker===undefined||t.security_ticker===filter.securityTicker)&&(filter.currency===undefined||(t.target_price!=null?(t.target_currency as string|null):t.price_at_report!=null?(t.price_currency as string|null):null)===filter.currency)).map(t=>String(t.report_id)));vis=vis.filter(r=>ok.has(r.report_id));}
   const rows=vis.map(reportView).filter(r=>(!filter.institutionId||r.institution_id===filter.institutionId)&&(!filter.scope||r.scope===filter.scope)&&(!filter.from||String(r.published_date)>=filter.from)&&(!filter.to||String(r.published_date)<=filter.to)
    &&(!filter.cursor||String(r.published_date)<filter.cursor.publishedDate||(r.published_date===filter.cursor.publishedDate&&String(r.report_id)<filter.cursor.reportId)))
    .sort((a,b)=>cmp(String(b.published_date),String(a.published_date))||cmp(String(b.report_id),String(a.report_id))).slice(0,filter.limit);
   const page=new Set(rows.map(r=>String(r.report_id)));const vr=vis.filter(r=>page.has(r.report_id));
   return clone(bundles(rows,vr.flatMap(targetView),vr.flatMap(summaryView),vr.flatMap(snippetView),institutionView()));
  },
  async publicReport(id){
   const r=visible().find(x=>x.report_id===id);if(!r)return null;
   const [b]=bundles([reportView(r)],targetView(r),summaryView(r),snippetView(r),institutionView());
   return clone({...b,citations:citationView(r).sort((x,y)=>cmp(String(x.target_key??''),String(y.target_key??''))||cmp(String(x.field),String(y.field))||Number(x.occurrence)-Number(y.occurrence)),snippets:snippetView(r),summaries:summaryView(r).map(publicRow),analysts:analystView(r)});
  },
  async publicInstitutions(){return clone(institutionView().sort((a,b)=>cmp(String(a.name_en),String(b.name_en))||cmp(String(a.institution_id),String(b.institution_id))));},
  async publicAnalysts(o){return clone(analystsDistinct(visible().flatMap(analystView).filter(a=>a.institution_id===o.institutionId),o.limit));},
  async ratingHistory(opts){return clone(historyView().filter(h=>h.security_ticker===opts.securityTicker&&(!opts.institutionId||h.institution_id===opts.institutionId)&&(!opts.currency||h.target_currency===opts.currency))
   .sort((a,b)=>cmp(String(b.published_date),String(a.published_date))||cmp(String(b.report_id),String(a.report_id))).slice(0,opts.limit));},
  async quarantineResolve(id,status,by,payload){
   if(status!=='resolved_accept'&&status!=='resolved_reject')fail('invalid_status');
   const [q]=await tables.select('dq_quarantine',{id});if(!q)return 'not_found';
   if(q.dataset!=='broker_research')fail('wrong_dataset');if(q.status!=='open')return 'already_resolved';
   const sha=String(q.natural_key).split(':')[0];const d=[...documents.values()].find(x=>x.sha256===sha);
   const r=d?[...reports.values()].find(x=>x.document_id===d.document_id):undefined;
   if(r?.status==='published')fail('published_immutable');
   atomic(()=>{
    if(r&&r.status==='draft'){
     const reason=String(q.reason_code);
     if(status==='resolved_reject')setReport(r,{review_status:'rejected'});
     else if(reason==='unknown_rating_label'||reason==='ambiguous_rating_label'){
      let wrote=false;
      if('close_scale_id' in payload){if(!('valid_to' in payload))fail('hook_params_required');const s=scales.get(String(payload.close_scale_id));if(s&&s.institution_id===r.institution_id&&s.valid_to===null)Object.assign(s,{valid_to:String(payload.valid_to),closed_by:by,closed_at:now()});wrote=true;}
      if('normalized' in payload){
       const label=(payload.raw_label as string|undefined)??((q.payload as R)?.rating_raw as string|undefined);
       if(!r.institution_id||!label||!('source_url' in payload&&'valid_from' in payload))fail('hook_params_required');
       if(![...scales.values()].some(s=>s.institution_id===r.institution_id&&s.raw_label.trim().toLowerCase()===label!.trim().toLowerCase()&&s.valid_from===payload.valid_from)){const sid=randomUUID();scales.set(sid,{scale_id:sid,institution_id:r.institution_id!,raw_label:label!,normalized:payload.normalized as RatingScaleRow['normalized'],source_url:String(payload.source_url),valid_from:String(payload.valid_from),valid_to:null,created_by:by,created_at:stamp(),closed_by:null,closed_at:null});}
       wrote=true;
      }
      if(!wrote)fail('hook_params_required');
     }else if(reason==='unresolved_ticker'||reason==='ticker_issuer_conflict'){
      if(!('target_key' in payload&&'security_ticker' in payload))fail('hook_params_required');
      const k=`${r.report_id}|${String(payload.target_key)}`;const had=overrides.get(k);
      overrides.set(k,{override_id:had?.override_id??randomUUID(),report_id:r.report_id,target_key:String(payload.target_key),security_ticker:String(payload.security_ticker),issuer_id:(payload.issuer_id as string|undefined)??null,set_by:by,set_at:now(),note:`quarantine:${id}`});
     }else if(reason==='possible_version'){
      if(!('supersedes_report_id' in payload))fail('hook_params_required');
      setReport(r,{supersedes_report_id:String(payload.supersedes_report_id)});
     }
     materializeNow(r.report_id);
    }
   });
   await tables.update('dq_quarantine',{id},{status,resolved_by:by,resolved_at:now(),detail:{...((q.detail as R)??{}),hook:{function:'broker_quarantine_resolve',payload,at:now()}}});
   return 'resolved';
  },
 };
 return db;
}
