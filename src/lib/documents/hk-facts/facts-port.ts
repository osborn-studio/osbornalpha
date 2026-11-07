// src/lib/documents/hk-facts/facts-port.ts
// HkFactsPort (plan F3 §共享契约; spec §7.7 "规格二接口的适配", R5-2): the one module where the HK
// market meets the landed spec-2 facts layer, whose TS types know only 'US'|'CN' and whose files F3
// may not edit. Pass-through methods call FactsDb with market 'HK' — the cast lives here and nowhere
// else (HK_MARKET) — and throw FactsDbError exactly like FactsDb; F3-owned methods call migration
// two (ensure_hk_fact_scope, bind_filing_documents, insert_fact_citations, publish_hk_run,
// finish/abandon_candidate_publications, resolve_hk_facts_quarantine, hk_promotion_due,
// hk_zero_output_documents) and throw DocumentsDbError (spec-2 codes raised inside them, e.g.
// stale_plan, arrive as DocumentsDbError too). Implementations: supabaseHkFactsPort (rpc +
// service-role reads), memoryHkFactsPort (unit tests: wraps memoryFactsDb + memoryDocumentsDb and
// reproduces the SQL rules, the fact_citations / filing_documents cascades included; leases are
// compared with opts.now — pass the clock memoryFactsDb.setNow pinned — else the wall clock), and the test-only
// pgHkFactsPort in pg-facts-port.ts. Also the HK wrappers of the pure spec-2 planners so callers
// never spell the cast. Never through this port: reconcileScope, scopeDue, materialize,
// replaceMetrics, public-route helpers (spec §7.7).
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseFactsDb} from '../../facts/db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {planFactWrites} from '../../facts/plan';
import type {PlanInput,PlanResult} from '../../facts/plan';
import {evaluateFactRules} from '../../facts/rules';
import type {FactRulesInput,FactRulesResult} from '../../facts/rules';
import {FactsDbError} from '../../facts/types';
import type {ConflictItem,FactInsert,FactRow,FactsDb,FilingInsert,Market,Origin,ReadFactsOptions,ReadFactsResult,Source} from '../../facts/types';
import {toDocumentsDbError} from '../db';
import type {PgErrorLike} from '../db';
import {canonicalDecimal} from '../../facts/json-numbers';
import type {MemoryDocumentsDb} from '../memory-documents-db';
import {DocumentsDbError,HK_EXTRACTOR_REF} from '../types';
import type {CitationRole,CitationRow,DocumentRow,DocumentsDbErrorCode,PageRow} from '../types';

export type HkMarket='HK';
/** The HK market string typed as the spec-2 Market — the only such cast (spec §16 interface request (4) removes it). */
export const HK_MARKET:Market='HK' as HkMarket as unknown as Market;
export interface HkFilingInsert{filing_id:string;issuer_id:string;source:'hkex';origin:'hkex';formType:'annual'|'semiannual';fiscalYear:number|null;fiscalPeriod:'FY'|'H1'|null;periodEnd:string|null;availableDate:string;sourceRef:string;url:string|null}
export interface HkPublicationOutcome{published:number;still_staged:number;abandoned:number}
export interface HkResolveOutcome{promoted:number;skipped:number;chosenFactIds:string[]}
export type HkRunStatus='staged'|'published'|'abandoned';
/** A zero-output document of the plan and the current extraction planning saw (codex plan round 1 P1-4). */
export interface HkZeroOutput{document_id:string;extraction_id:string}
export interface HkFactsPort{
 // pass-through to spec-2 rpc with market='HK' (cast lives only in this file)
 claimLease(issuer:string,batch:string,ttlSeconds:number):Promise<boolean>;
 beginRun(issuer:string,batch:string,mappingGen:number):Promise<string>;
 stageFilings(run:string,rows:HkFilingInsert[]):Promise<Map<string,string>>;
 stageFacts(run:string,rows:FactInsert[]):Promise<number>;                // FactInsert from src/lib/facts/types (market typed 'US'|'CN'; port casts)
 quarantineFacts(run:string,factIds:string[],itemId:string):Promise<number>;
 abandonRun(run:string):Promise<void>;
 releaseLease(issuer:string,batch:string,outcome:'success'|'failed',nextDue:string):Promise<void>;
 readFacts(issuer:string,opts:ReadFactsOptions):Promise<ReadFactsResult>;
 factsByIds(ids:string[]):Promise<FactRow[]>;
 openConflicts(issuer:string):Promise<ConflictItem[]>;
 runStatus(run:string):Promise<HkRunStatus|null>;
 // F3-owned functions of migration two
 ensureHkScope(issuer:string,fetchKey:string):Promise<void>;
 renewLease(issuer:string,batch:string,ttlSeconds:number):Promise<boolean>;   // holder-only (R3-P2-1): never acquires an unowned, expired or released HK scope
 bindFilingDocuments(run:string,rows:{filing_id:string;document_id:string}[]):Promise<number>;
 insertFactCitations(run:string,rows:{fact_id:string;citation_id:string;role:CitationRole}[]):Promise<number>;
 publishHkRun(issuer:string,batch:string,run:string,manifest:string[],expectedRev:number,zeroOutput:readonly HkZeroOutput[]):Promise<number>;   // zeroOutput: the planned zero-output selection, revalidated under the document locks (P1-4)
 finishCandidatePublications(run:string):Promise<HkPublicationOutcome>;
 abandonCandidatePublications(run:string):Promise<number>;
 promotionDue(pubGen:number,limit:number):Promise<{issuerId:string}[]>;
 zeroOutputDocuments(issuer:string,pubGen:number):Promise<string[]>;      // document ids hitting promotionDue condition (d) for this issuer
 resolveHkFactsQuarantine(item:string,chosen:string[],resolvedBy:string):Promise<HkResolveOutcome>;
 citationsOfFact(factId:string):Promise<{role:CitationRole;citation_id:string}[]>;
 hkFilingOfDocument(documentId:string):Promise<{filing_id:string;mapping_gen:number}|null>;
}
type PassThrough=Pick<HkFactsPort,'claimLease'|'beginRun'|'stageFilings'|'stageFacts'|'quarantineFacts'|'abandonRun'|'releaseLease'|'readFacts'|'factsByIds'|'openConflicts'>;

export const CITATION_ROLES:readonly CitationRole[]=['value','label','period','unit','unit_currency'];
const SHARED_CODES:readonly DocumentsDbErrorCode[]=['lease_lost','stale_plan','run_pending','invalid_chosen','item_not_open'];
/** FactsDbError (memory spec-2 paths inside an F3 method) → DocumentsDbError with the same code when both know it, else 'unknown' carrying the message. */
export function asDocumentsDbError(e:unknown):DocumentsDbError{
 if(e instanceof DocumentsDbError)return e;
 if(e instanceof FactsDbError)return new DocumentsDbError((SHARED_CODES as readonly string[]).includes(e.code)?e.code as DocumentsDbErrorCode:'unknown',e.message);
 return new DocumentsDbError('unknown',e instanceof Error?e.message:String(e));
}
export function toFilingInsert(r:HkFilingInsert):FilingInsert{
 return {filing_id:r.filing_id,issuer_id:r.issuer_id,sourceRef:r.sourceRef,market:HK_MARKET,source:r.source as string as Source,origin:r.origin as string as Origin,formType:r.formType,fiscalYear:r.fiscalYear,fiscalPeriod:r.fiscalPeriod,periodEnd:r.periodEnd,availableDate:r.availableDate,url:r.url};
}
/** spec-2 planFactWrites with market 'HK' (spec §7.7 step 2, used verbatim). */
export const planHkFactWrites=(input:Omit<PlanInput,'market'>):PlanResult=>planFactWrites({...input,market:HK_MARKET});
/** spec-2 identity_bs / identity_gp (exact decimals) with market 'HK' (spec §7.7 step 4). */
export const evaluateHkFactRules=(input:Omit<FactRulesInput,'market'>):FactRulesResult=>evaluateFactRules({...input,market:HK_MARKET});
export function hkPassThrough(facts:FactsDb):PassThrough{
 return {
  claimLease:(issuer,batch,ttl)=>facts.claimLease(issuer,HK_MARKET,batch,ttl),
  beginRun:(issuer,batch,gen)=>facts.beginRun(issuer,HK_MARKET,batch,gen),
  stageFilings:(run,rows)=>facts.stageFilings(run,rows.map(toFilingInsert)),
  stageFacts:(run,rows)=>facts.stageFacts(run,rows.map(r=>({...r,market:HK_MARKET}))),
  quarantineFacts:(run,ids,item)=>facts.quarantineFacts(run,ids,item),
  abandonRun:run=>facts.abandonRun(run),
  releaseLease:(issuer,batch,outcome,nextDue)=>facts.releaseLease(issuer,HK_MARKET,batch,outcome,nextDue),
  readFacts:(issuer,opts)=>facts.readFacts(issuer,HK_MARKET,opts),
  factsByIds:ids=>facts.factsByIds(ids),
  openConflicts:issuer=>facts.openConflicts(issuer,HK_MARKET),
 };
}
export const publicationOutcomeOf=(x:Record<string,unknown>|null):HkPublicationOutcome=>({published:Number(x?.published??0),still_staged:Number(x?.still_staged??0),abandoned:Number(x?.abandoned??0)});
export const resolveOutcomeOf=(x:{promoted?:unknown;skipped?:unknown;chosen_fact_ids?:unknown}):HkResolveOutcome=>({promoted:Number(x.promoted),skipped:Number(x.skipped),chosenFactIds:Array.isArray(x.chosen_fact_ids)?x.chosen_fact_ids.map(String):[]});
/** Upper bound of period citations per fact, enforced at insert in all three implementations (F4: a reader pages a bounded set). */
export const MAX_PERIOD_CITATIONS=64;
/** SQL error → DocumentsDbError whose message is the SQL detail ('<reason>:<fact_id>'), the text the memory port throws. */
export function sqlError(e:PgErrorLike&{detail?:string|null}):DocumentsDbError{
 const d=toDocumentsDbError(e);const detail=e.detail??e.details;
 return d.code!=='unknown'&&typeof detail==='string'&&detail!==''?new DocumentsDbError(d.code,detail,d.sqlstate):d;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=(x:unknown):x is string=>typeof x==='string'&&UUID.test(x);
function decimalMatch(a:string,b:string):boolean{try{return canonicalDecimal(a)===canonicalDecimal(b);}catch{return false;}}
export function assertExpectedRev(rev:number):void{if(!Number.isSafeInteger(rev)||rev<0)throw new DocumentsDbError('invalid_expected_rev');}

interface RpcResult{data:unknown;error:{message?:string;code?:string|null}|null}
// The query builder is left untyped on purpose (same as facts/db.ts): the hand-maintained Database type lacks what supabase-js inference needs.
interface NarrowClient{rpc:(fn:string,args:Record<string,unknown>)=>PromiseLike<RpcResult>;from:(table:string)=>any}

export const CITATION_PAGE=500;
export function supabaseHkFactsPort(admin:SupabaseClient):HkFactsPort{
 const c=admin as unknown as NarrowClient;
 const call=async<T>(fn:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await c.rpc(fn,args);if(error)throw sqlError(error);return data as T;};
 const rows=async<T>(q:PromiseLike<RpcResult>):Promise<T[]>=>{const {data,error}=await q;if(error)throw sqlError(error);return (data??[]) as T[];};
 return {
  ...hkPassThrough(supabaseFactsDb(admin)),
  async runStatus(run){const [r]=await rows<{status:HkRunStatus}>(c.from('fact_sync_runs').select('status').eq('run_id',run).limit(1));return r?.status??null;},
  async ensureHkScope(issuer,fetchKey){await call('ensure_hk_fact_scope',{p_issuer:issuer,p_fetch_key:fetchKey});},
  async renewLease(issuer,batch,ttl){return (await call<boolean>('renew_hk_fact_lease',{p_issuer:issuer,p_batch:batch,p_ttl_seconds:ttl}))===true;},
  async bindFilingDocuments(run,input){return Number(await call('bind_filing_documents',{p_run:run,p_rows:input}));},
  async insertFactCitations(run,input){return Number(await call('insert_fact_citations',{p_run:run,p_rows:input}));},
  async publishHkRun(issuer,batch,run,manifest,expectedRev,zeroOutput){assertExpectedRev(expectedRev);return Number(await call('publish_hk_run',{p_issuer:issuer,p_batch:batch,p_run:run,p_manifest:manifest,p_expected_rev:expectedRev,p_zero_output:zeroOutput}));},
  async finishCandidatePublications(run){return publicationOutcomeOf(await call<Record<string,unknown>|null>('finish_candidate_publications',{p_run:run}));},
  async abandonCandidatePublications(run){return Number(await call('abandon_candidate_publications',{p_run:run}));},
  async promotionDue(pubGen,limit){return ((await call<string[]|null>('hk_promotion_due',{p_pub_gen:pubGen,p_extractor_ref:HK_EXTRACTOR_REF,p_limit:limit}))??[]).map(issuerId=>({issuerId:String(issuerId)}));},
  async zeroOutputDocuments(issuer,pubGen){return ((await call<string[]|null>('hk_zero_output_documents',{p_issuer:issuer,p_pub_gen:pubGen}))??[]).map(String);},
  async resolveHkFactsQuarantine(item,chosen,by){return resolveOutcomeOf(await call<Record<string,unknown>>('resolve_hk_facts_quarantine',{p_item:item,p_chosen:chosen,p_resolved_by:by}));},
  async citationsOfFact(factId){
   // F4: pages until exhausted (PostgREST max_rows may be below any single limit); insert_fact_citations also bounds a fact's period set
   const out:{role:CitationRole;citation_id:string}[]=[];
   for(let from=0;;){
    const page=await rows<{role:CitationRole;citation_id:string}>(c.from('fact_citations').select('role,citation_id').eq('fact_id',factId).order('role').order('citation_id').range(from,from+CITATION_PAGE-1));
    if(page.length===0)return out;   // a server-side cap below CITATION_PAGE only shortens pages: stop at the first empty one
    out.push(...page.map(r=>({role:r.role,citation_id:String(r.citation_id)})));
    from+=page.length;
   }
  },
  async hkFilingOfDocument(documentId){
   const [b]=await rows<{filing_id:string}>(c.from('filing_documents').select('filing_id').eq('document_id',documentId).order('filing_id').limit(1));
   if(!b)return null;
   const [g]=await rows<{mapping_gen:number}>(c.from('filings').select('mapping_gen').eq('filing_id',b.filing_id).limit(1));
   return g?{filing_id:String(b.filing_id),mapping_gen:Number(g.mapping_gen)}:null;
  },
 };
}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const cpSlice=(s:string,start:number,end:number)=>Array.from(s).slice(start,end).join('');
const fail=(code:DocumentsDbErrorCode,message?:string)=>new DocumentsDbError(code,message);

/** In-memory port: same rules as migration two, over the two in-memory stores (single-threaded tests). */
export function memoryHkFactsPort(facts:MemoryFactsDb,docs:MemoryDocumentsDb,opts:{now?:()=>Date}={}):HkFactsPort{
 const evidence:{fact_id:string;citation_id:string;role:CitationRole}[]=[];
 const bindings=new Map<string,{filing_id:string;document_id:string;created_at:string}>();
 const nowIso=()=>(opts.now?opts.now():new Date()).toISOString();
 // cascades (§4.9): a binding lives while its filing exists, an evidence row while its fact exists
 const liveBindings=()=>{const ids=new Set(facts.filings().map(g=>g.filing_id));for(const k of [...bindings.keys()])if(!ids.has(k))bindings.delete(k);return bindings;};
 const liveEvidence=()=>{const ids=new Set(facts.facts().map(f=>f.fact_id));for(let i=evidence.length-1;i>=0;i--)if(!ids.has(evidence[i].fact_id))evidence.splice(i,1);return evidence;};
 const runOf=(run:string)=>facts.runs().find(r=>r.run_id===run);
 const leaseHeld=(issuer:string,market:Market,batch:string)=>{const s=facts.scope().find(x=>x.issuer_id===issuer&&x.market===market);return !!s&&s.lease_batch_id===batch&&s.lease_until!==null&&s.lease_until>nowIso();};
 /** fact_run_lock: the run's batch must hold the run's scope lease; the run must be staged. */
 const runLock=(run:string)=>{
  const r=runOf(run);if(!r)throw fail('unknown','run_not_found');
  if(!leaseHeld(r.issuer_id,r.market,r.batch_id))throw fail('lease_lost');
  if(r.status==='published')throw fail('unknown','run_published');
  if(r.status==='abandoned')throw fail('unknown','run_abandoned');
  if(r.market!==HK_MARKET)throw fail('invalid_input','run_market');
  return r;
 };
 const docMap=()=>new Map<string,DocumentRow>(docs.documents().map(d=>[d.document_id,d]));
 const intact=(c:CitationRow,pages:PageRow[])=>{const p=pages.find(x=>x.extraction_id===c.extraction_id&&x.page_no===c.page_no);return !!p&&p.text_hash===c.text_hash&&cpSlice(p.text,c.char_start,c.char_end)===c.snippet;};
 const eligibleDoc=(d:DocumentRow)=>d.source==='hkexnews'&&d.language==='zh'&&d.permission==='public'&&d.issuer_id!==null&&d.current_extraction_id!==null;
 const ZERO_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 /** promotionDue condition (d): document id → issuer id. */
 const zeroOutput=(pubGen:number)=>{
  const out=new Map<string,string>();const ext=new Map(docs.extractions().map(e=>[e.extraction_id,e]));const filings=new Map(facts.filings().map(g=>[g.filing_id,g]));
  const live=[...liveBindings().values()];
  for(const d of docs.documents()){
   if(!eligibleDoc(d))continue;
   const e=ext.get(d.current_extraction_id!);
   if(!e||e.candidates_role!=='primary'||e.candidates_status!=='done')continue;
   if(live.some(b=>{const g=b.document_id===d.document_id?filings.get(b.filing_id):undefined;return !!g&&g.mapping_gen>=1&&g.mapping_gen<pubGen;}))out.set(d.document_id,d.issuer_id!);
  }
  return out;
 };
 const assertEvidence=(run:string)=>{
  const fc=liveEvidence();const B=liveBindings();const D=docMap();const C=new Map(docs.citations().map(c=>[c.citation_id,c]));const P=docs.pages();const pubs=docs.publications();
  const rows=facts.facts().filter(f=>f.run_id===run&&(f.status==='staged'||f.status==='quarantined')).sort((a,b)=>cmp(a.fact_id,b.fact_id));
  for(const f of rows){
   const mine=fc.filter(x=>x.fact_id===f.fact_id);
   const n=(role:CitationRole)=>mine.filter(x=>x.role===role).length;
   const b=B.get(f.filing_id);const d=b?D.get(b.document_id):undefined;
   const link=pubs.filter(p=>p.run_id===run&&p.fact_id===f.fact_id&&p.state==='staged');
   const cand=link.length===1?docs._raw.candidates.get(link[0].candidate_id):undefined;
   const declared=cand?.citations as {value?:unknown;label?:unknown;unit?:unknown;unit_currency?:unknown;period?:unknown}|undefined;
   const pay=(cand?.payload??{}) as Record<string,unknown>;
   const ids=(role:CitationRole)=>mine.filter(x=>x.role===role).map(x=>x.citation_id).sort(cmp);
   const unitEvidenceOk=!!declared&&JSON.stringify(ids('unit'))===JSON.stringify([declared.unit])
    &&JSON.stringify(ids('unit_currency'))===JSON.stringify(typeof declared.unit_currency==='string'?[declared.unit_currency]:[]);
   const same=(a:string[],bb:unknown[])=>JSON.stringify([...a].sort(cmp))===JSON.stringify([...bb.map(String)].sort(cmp));
   const declaredPeriod=Array.isArray(declared?.period)?[...new Set((declared!.period as {citation_id?:unknown}[]).map(x=>String(x?.citation_id)))]:[];
   const valueOk=typeof pay.value==='string'&&decimalMatch(f.value,pay.value);
   const reason=n('value')!==1?'value':n('label')!==1?'label':n('unit')!==1?'unit':n('period')<1?'period'
    :link.length!==1?'publication'
    :!unitEvidenceOk?'unit_evidence'
    :!same(ids('value'),[declared?.value])?'value_evidence'
    :!same(ids('label'),[declared?.label])?'label_evidence'
    :!same(ids('period'),declaredPeriod)?'period_evidence'
    :f.concept!==pay.concept||f.statement!==pay.statement||f.period_start!==pay.period_start||f.period_end!==pay.period_end||f.duration!==pay.duration||f.unit!==pay.unit||f.consolidation!==pay.consolidation||!valueOk?'payload'
    :!b?'unbound_filing'
    :mine.some(x=>{const c=C.get(x.citation_id);return !c||!d||c.document_id!==d.document_id||d.permission!=='public'||c.extraction_id!==d.current_extraction_id||!intact(c,P);})?'citation'
    :null;
   if(reason!==null)throw fail('evidence_incomplete',`${reason}:${f.fact_id}`);
  }
 };
 return {
  ...hkPassThrough(facts),
  async runStatus(run){return runOf(run)?.status??null;},
  async renewLease(issuer,batch,ttl){
   if(!Number.isInteger(ttl)||ttl<1)throw fail('invalid_input','ttl');
   if(!leaseHeld(issuer,HK_MARKET,batch))return false;            // holder only: never acquires (R3-P2-1)
   return facts.claimLease(issuer,HK_MARKET,batch,ttl);            // same batch, unexpired: an extension
  },
  async ensureHkScope(issuer,fetchKey){
   if(!isUuid(issuer)||typeof fetchKey!=='string'||!/^[0-9]{5}$/.test(fetchKey))throw fail('invalid_input','fetch_key');
   if((await facts.scopeRows(HK_MARKET,[issuer])).length===0)await facts.reconcileScope(HK_MARKET,[{issuer_id:issuer,reasons:['documents'],priority:0,fetch_key:fetchKey}]);
  },
  async bindFilingDocuments(run,input){
   if(!isUuid(run)||!Array.isArray(input))throw fail('invalid_input','rows');
   const r=runLock(run);
   for(const x of input)if(!isUuid(x?.filing_id)||!isUuid(x?.document_id))throw fail('invalid_input','row');   // SQL: null → invalid_input 'row', malformed uuid → 22P02 → invalid_input
   const filings=new Map(facts.filings().map(g=>[g.filing_id,g]));const D=docMap();const live=liveBindings();const pending=new Map<string,string>();
   for(const x of [...input].sort((a,b)=>cmp(a.filing_id,b.filing_id)||cmp(a.document_id,b.document_id))){
    const g=filings.get(x.filing_id);
    if(!g||g.issuer_id!==r.issuer_id||g.market!==HK_MARKET||String(g.source)!=='hkex')throw fail('invalid_input','filing');
    const have=live.get(x.filing_id)?.document_id??pending.get(x.filing_id);
    if(have!==undefined){if(have!==x.document_id)throw fail('binding_conflict',x.filing_id);continue;}
    const d=D.get(x.document_id);
    if(!d||d.source!=='hkexnews'||d.language!=='zh'||d.permission!=='public'||d.issuer_id!==r.issuer_id)throw fail('invalid_input','document');
    if(g.source_ref!==`hkex:${d.source_ref}:v${d.source_version}`)throw fail('invalid_input','source_ref');
    pending.set(x.filing_id,x.document_id);
   }
   const at=nowIso();for(const [filing_id,document_id] of pending)bindings.set(filing_id,{filing_id,document_id,created_at:at});
   return pending.size;
  },
  async insertFactCitations(run,input){
   if(!isUuid(run)||!Array.isArray(input))throw fail('invalid_input','rows');
   runLock(run);
   for(const x of input)if((x?.fact_id!=null&&!isUuid(x.fact_id))||(x?.citation_id!=null&&!isUuid(x.citation_id)))throw fail('invalid_input','uuid');
   const F=new Map(facts.facts().map(f=>[f.fact_id,f]));const C=new Map(docs.citations().map(c=>[c.citation_id,c]));const D=docMap();const B=liveBindings();
   for(const x of input){
    const f=F.get(x.fact_id);const c=C.get(x.citation_id);const b=f?B.get(f.filing_id):undefined;const d=b?D.get(b.document_id):undefined;
    const reason=!CITATION_ROLES.includes(x.role)?'role':!f?'fact':f.run_id!==run||f.status!=='staged'?'fact_state':!c?'citation':!b?'unbound_filing'
     :c.document_id!==b.document_id?'document':!d||d.permission!=='public'?'permission':c.extraction_id!==d.current_extraction_id?'extraction':null;
    if(reason!==null)throw fail('invalid_citation',reason);
   }
   const have=liveEvidence();
   const fresh=new Map<string,{fact_id:string;citation_id:string;role:CitationRole}>();
   for(const x of input)fresh.set(`${x.fact_id}|${x.role}|${x.citation_id}`,{fact_id:x.fact_id,citation_id:x.citation_id,role:x.role});
   const periods=new Map<string,Set<string>>();   // F4: distinct period citations per fact, stored plus this call
   for(const y of [...have,...fresh.values()])if(y.role==='period')periods.set(y.fact_id,(periods.get(y.fact_id)??new Set()).add(y.citation_id));
   if([...periods.values()].some(set=>set.size>MAX_PERIOD_CITATIONS))throw fail('invalid_citation','period_limit');
   let n=0;
   for(const x of fresh.values()){if(have.some(y=>y.fact_id===x.fact_id&&y.role===x.role&&y.citation_id===x.citation_id))continue;have.push(x);n++;}
   return n;
  },
  async publishHkRun(issuer,batch,run,manifest,expectedRev,zeroOutput){
   assertExpectedRev(expectedRev);
   if(!Array.isArray(zeroOutput)||zeroOutput.some(z=>typeof z!=='object'||z===null||!ZERO_UUID.test(String(z.document_id))||!ZERO_UUID.test(String(z.extraction_id))))throw fail('invalid_input','zero_output');
   if(!leaseHeld(issuer,HK_MARKET,batch))throw fail('lease_lost');
   const r=runOf(run);
   if(!r||r.issuer_id!==issuer||r.market!==HK_MARKET||r.batch_id!==batch||r.status!=='staged')throw fail('invalid_input','run');
   // P1-4: the zero-output selection is revalidated (SQL: under the document and extraction locks)
   const runFilings=new Set([...facts.filings().filter(g=>g.run_id===run).map(g=>g.filing_id),...manifest,...facts.facts().filter(f=>f.run_id===run).map(f=>f.filing_id)]);
   const boundDocs=new Set([...liveBindings().values()].filter(b=>runFilings.has(b.filing_id)).map(b=>b.document_id));
   const D=docMap();const ext=new Map(docs.extractions().map(e=>[e.extraction_id,e]));
   for(const z of [...zeroOutput].sort((a,b)=>cmp(a.document_id,b.document_id))){
    const d=D.get(z.document_id);const e=ext.get(z.extraction_id);
    const ok=!!d&&boundDocs.has(d.document_id)&&eligibleDoc(d)&&d.issuer_id===issuer&&d.current_extraction_id===z.extraction_id&&!!e&&e.candidates_role==='primary'&&e.candidates_status==='done';
    if(!ok)throw fail('stale_plan',`zero_output:${z.document_id}`);
   }
   assertEvidence(run);
   try{return await facts.publishRun(run,manifest,expectedRev);}catch(e){throw asDocumentsDbError(e);}
  },
  async finishCandidatePublications(run){
   const r=runOf(run);
   if(!r)throw fail('not_found','run');
   if(r.status==='staged')throw fail('run_pending');
   if(r.status!=='published')throw fail('invalid_input','run_abandoned');
   const F=new Map(facts.facts().map(f=>[f.fact_id,f]));const at=nowIso();let published=0,abandoned=0;
   const links=[...docs._raw.publications.values()].filter(p=>p.run_id===run);
   for(const p of links){
    if(p.state!=='staged')continue;
    const f=F.get(p.fact_id);
    if(f?.status==='ok'){p.state='published';p.updated_at=at;published++;}
   }
   const promoted=new Set(links.filter(p=>p.state==='published').map(p=>p.candidate_id));
   for(const c of docs._raw.candidates.values())if(c.status==='confirmed'&&promoted.has(c.candidate_id))c.status='promoted';
   for(const p of links)if(p.state==='staged'&&!F.has(p.fact_id)){p.state='abandoned';p.updated_at=at;abandoned++;}
   return {published,still_staged:links.filter(p=>p.state==='staged').length,abandoned};
  },
  async abandonCandidatePublications(run){
   const r=runOf(run);
   if(!r)throw fail('not_found','run');
   if(r.status==='staged')throw fail('run_pending');
   if(r.status!=='abandoned')throw fail('invalid_input','run_published');
   const at=nowIso();let n=0;
   for(const p of docs._raw.publications.values())if(p.run_id===run&&p.state==='staged'){p.state='abandoned';p.updated_at=at;n++;}
   return n;
  },
  async promotionDue(pubGen,limit){
   const D=docMap();const ext=new Map(docs.extractions().map(e=>[e.extraction_id,e]));const pubs=docs.publications();const due=new Set<string>();
   for(const c of docs.candidates()){
    const d=D.get(c.document_id);
    if(!d||!eligibleDoc(d)||d.current_extraction_id!==c.extraction_id||!ext.has(c.extraction_id))continue;
    if(c.kind!=='financial_fact'||c.extractor_kind!=='rule'||c.extractor_ref!==HK_EXTRACTOR_REF||!c.checks_passed||(c.status!=='confirmed'&&c.status!=='promoted'))continue;
    if(!pubs.some(p=>p.candidate_id===c.candidate_id&&p.pub_gen===pubGen&&(p.state==='staged'||p.state==='published')))due.add(d.issuer_id!);   // (ab)
   }
   const byCandidate=new Map(docs.candidates().map(c=>[c.candidate_id,c]));
   const factStatus=new Map(facts.facts().map(f=>[f.fact_id,f.status]));
   for(const p of pubs){
    if(p.pub_gen!==pubGen||p.state!=='staged')continue;
    if(runOf(p.run_id)?.status==='published'&&factStatus.get(p.fact_id)==='quarantined')continue;   // waits on the owner's decision: recovery cannot act (P2-6)
    const c=byCandidate.get(p.candidate_id);const iss=c?D.get(c.document_id)?.issuer_id:null;if(iss)due.add(iss);   // (c)
   }
   for(const iss of zeroOutput(pubGen).values())due.add(iss);                                                                                                // (d)
   return [...due].sort(cmp).slice(0,Math.min(Math.max(limit,0),1000)).map(issuerId=>({issuerId}));
  },
  async zeroOutputDocuments(issuer,pubGen){return [...zeroOutput(pubGen).entries()].filter(([,iss])=>iss===issuer).map(([doc])=>doc).sort(cmp);},
  async resolveHkFactsQuarantine(item,chosen,resolvedBy){
   const [it]=await facts.tables.select('dq_quarantine',{id:item},{limit:1});
   if(!it)throw fail('not_found','item');
   if(it.table_name!=='financial_facts')throw fail('not_hk_item');
   const p=(it.payload??{}) as {fact_ids?:unknown;run_id?:unknown};
   const ids=Array.isArray(p.fact_ids)?p.fact_ids.filter((x):x is string=>typeof x==='string'):[];
   const markets=new Set((await facts.factsByIds(ids)).map(f=>String(f.market)));
   if(markets.size===0){if(String(typeof p.run_id==='string'?runOf(p.run_id)?.market:undefined)!=='HK')throw fail('not_hk_item');}
   else if(markets.size!==1||!markets.has('HK'))throw fail('not_hk_item');
   let out:HkResolveOutcome;
   try{out=await facts.resolveFactsQuarantine(item,chosen,resolvedBy);}catch(e){throw asDocumentsDbError(e);}
   const [fresh]=await facts.tables.select('dq_quarantine',{id:item},{limit:1});
   await facts.tables.update('dq_quarantine',{id:item},{detail:{...((fresh?.detail as Record<string,unknown>|undefined)??{}),hook:{stage:'done',state:'done',at:nowIso(),message:'hk_no_metrics'}}});
   return out;
  },
  async citationsOfFact(factId){return liveEvidence().filter(x=>x.fact_id===factId).map(({role,citation_id})=>({role,citation_id})).sort((a,b)=>cmp(a.role,b.role)||cmp(a.citation_id,b.citation_id));},
  async hkFilingOfDocument(documentId){
   const b=[...liveBindings().values()].filter(x=>x.document_id===documentId).sort((a,c)=>cmp(a.filing_id,c.filing_id))[0];
   if(!b)return null;
   const g=facts.filings().find(x=>x.filing_id===b.filing_id);
   return g?{filing_id:g.filing_id,mapping_gen:g.mapping_gen}:null;
  },
 };
}
