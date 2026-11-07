// src/lib/documents/hk-facts/promote.ts
// HK fact promotion (spec §7.7, 6th draft; R5-1 R5-5 R5-7 R5-11 R5-13): one spec-2 sync run per
// issuer under its HK lease, fed by the ACTIVE candidate set. Each step is idempotent; a crash
// restarts from step 0.
//  0. ensureHkScope (creates the HK scope row only if missing) + claimLease (false → skipped
//     'leased', no write). a: staged publications of this pub_gen grouped by run — run published →
//     finishCandidatePublications (row by row: fact ok → published, quarantined → stays staged,
//     gone → abandoned); run abandoned → abandonCandidatePublications; run still staged (a crashed
//     earlier batch) → left for b, NEVER abandonRun on it (spec-2 run functions check the run's own
//     batch lease → lease_lost). b: beginRun (spec-2 abandons every staged run of the issuer under
//     OUR lease; evidence cascades; empty gen-0 filings and their bindings are pruned). c: the runs
//     left in a, now abandoned → abandonCandidatePublications.
//  1. planning snapshot: readFacts(history, includeNonOk, all HK concepts, no limit); truncated →
//     read_truncated; its state_rev is expectedRev.
//  2. to stage = active candidates without a staged|published publication in this pub_gen.
//     Filings for every document with an active candidate plus the zero-output documents
//     (promotionDue (d)); nothing to stage and no zero-output document → abandon, release,
//     skipped nothing_to_publish. stageFilings → bindFilingDocuments → planHkFactWrites (spec-2
//     planFactWrites) → fact_id per candidate from plan.inserts, else the snapshot, by candidate
//     key K + filing + pub_gen (a miss, any plan.ambiguous, or stageFacts ≠ inserts →
//     plan_inconsistent) → stageFacts → stageCandidatePublication (approval_revoked → failed).
//  3. fact_citations for every NEW fact while all are still staged: value, label, unit, each period
//     evidence (evidence_failed); then same-day conflicts and contested joins are parked exactly like
//     facts/sync.ts (dataset facts.hk).
//  4. spec-2 identity rules on new rows ∪ ok rows → quarantineFacts; publishHkRun(expectedRev, the
//     zero-output selection {document_id, extraction_id} — revalidated under the document locks:
//     a document that switched extraction or whose candidates are no longer done → stale_plan).
//     evidence_incomplete / stale_plan / anything else (publish_failed) → abandon run + its
//     publications, release(failed). stale_plan is never retried with a new revision: promotionDue
//     (ab) brings the issuer back and step 1 re-reads. Success → finishCandidatePublications →
//     release(success). No materialization (R5-3).
// Every exit releases the lease (a lost lease stops all writes); after publish nothing can undo
// the run: a later failure is reported next to outcome 'published' and step 0a repairs it. The HK
// lease is renewed (holder-only renewLease, R3-P2-1) on a timer during the whole issuer (lease.ts heartbeat,
// codex plan round 2) and again before steps 2, 3 and 4; a takeover is lease_lost with no further
// write (guarded clients); steps 2 and 4 start only with MIN_PHASE_MS of budget left, else deadline_hit
// (run abandoned, lease released) (codex plan round 1 P2-7).
// raw_hash = value-citation locator hkex:<sha256[0:16]>:<extraction_id>:p<page>:c<start>-<end>.
import {randomUUID} from 'node:crypto';
import type {TableClient} from '../../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../../dq/batches';
import type {BatchCounts,BatchError,TriggeredBy} from '../../dq/batches';
import {quarantine} from '../../dq/quarantine';
import {candidateKey} from '../../facts/keys';
import {canonicalDecimal} from '../../facts/json-numbers';
import {summarizeWarnings} from '../../facts/rules';
import type {FactCandidate} from '../../facts/types';
import {cpSlice} from '../extract/pages-json';
import {DocumentsDbError,HK_EXTRACTOR_REF,HK_PUB_GEN} from '../types';
import type {CandidateRow,CitationRole,CitationRow,DocumentRow,DocumentsDb,FactCitations,FinancialFactPayload,Page,PublicationRow} from '../types';
import {HK_CONCEPT_IDS} from './checks';
import {FINAL_RESERVE_MS,HEARTBEAT_MS,guardCalls,withLeaseHeartbeat} from '../lease';
import {evaluateHkFactRules,planHkFactWrites,toFilingInsert} from './facts-port';
import type {HkFactsPort,HkFilingInsert} from './facts-port';

export const PROMOTE_LEASE_TTL_S=600;
export const MIN_ISSUER_MS=60_000;
/** Budget step 2 (staging) and step 4 (publish) need to start (P2-7). */
export const MIN_PHASE_MS=20_000;
export const HK_FACTS_DATASET='facts.hk';
const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
export interface PromoteDeps{db:DocumentsDb;port:HkFactsPort;tables:TableClient;now:()=>Date;deadline:Date|null}
export interface PromoteOptions{issuerIds:string[];batchId:string;triggeredBy:TriggeredBy;/** tests and promote-hk.ts --pub-gen only; default HK_PUB_GEN */pubGen?:number}
export interface HkIssuerOutcome{issuerId:string;runId:string|null;outcome:'published'|'failed'|'skipped';code?:string;counts:BatchCounts;errors:BatchError[];staged:number;finish?:{published:number;still_staged:number;abandoned:number}}

export const hkFilingSourceRef=(d:Pick<DocumentRow,'source_ref'|'source_version'>)=>`hkex:${d.source_ref}:v${d.source_version}`;
export function hkRawHash(contentSha256:string,c:Pick<CitationRow,'extraction_id'|'page_no'|'char_start'|'char_end'>):string{
 return `hkex:${contentSha256.slice(0,16)}:${c.extraction_id}:p${c.page_no}:c${c.char_start}-${c.char_end}`;
}
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
const codeOf=(e:unknown):string|null=>{const c=(e as {code?:unknown}|null)?.code;return typeof c==='string'?c:null;};
const isLeaseLoss=(e:unknown)=>{const c=codeOf(e);return c==='lease_lost'||c==='run_abandoned';};
const remaining=(deps:Pick<PromoteDeps,'deadline'|'now'>)=>deps.deadline===null?Number.POSITIVE_INFINITY:deps.deadline.getTime()-deps.now().getTime();
async function allPages<T>(read:(cursor:string|null)=>Promise<Page<T>>):Promise<T[]>{
 const out:T[]=[];let cursor:string|null=null;
 do{const p=await read(cursor);out.push(...p.rows);cursor=p.nextCursor;}while(cursor!==null);
 return out;
}
/** Eligible source of HK facts (spec §7.7 活动候选集): public Chinese HKEX periodic report of this issuer with a current extraction. */
const eligibleDocument=(d:DocumentRow,issuer:string)=>d.permission==='public'&&d.source==='hkexnews'&&d.language==='zh'&&d.issuer_id===issuer&&d.current_extraction_id!==null&&(d.doc_class==='annual_report'||d.doc_class==='interim_report');
const sourceConceptOf=(snippet:string,concept:string)=>{const s=cpSlice(snippet.trim(),0,256);return s.length>0?s:concept;};
const keyOfPayload=(p:FinancialFactPayload)=>({concept:p.concept,period_start:p.period_start,period_end:p.period_end,consolidation:'consolidated',unit:p.unit});
const byId=(a:CandidateRow,b:CandidateRow)=>a.candidate_id<b.candidate_id?-1:a.candidate_id>b.candidate_id?1:0;

/** The active candidate set of one issuer (spec §7.7): confirmed|promoted rule candidates of the current extraction of an eligible document. Shared with promote-hk.ts --dry-run. */
export async function activeCandidates(db:DocumentsDb,issuer:string,docOf:(id:string)=>Promise<DocumentRow|null>):Promise<CandidateRow[]>{
 const pool=[...await allPages(cursor=>db.candidatesOf({issuerId:issuer,status:'confirmed'},{cursor,limit:1000})),...await allPages(cursor=>db.candidatesOf({issuerId:issuer,status:'promoted'},{cursor,limit:1000}))];
 const active:CandidateRow[]=[];
 for(const c of pool){
  if(c.kind!=='financial_fact'||c.extractor_kind!=='rule'||!c.checks_passed||c.extractor_ref!==HK_EXTRACTOR_REF)continue;
  const d=await docOf(c.document_id);
  if(d&&eligibleDocument(d,issuer)&&d.current_extraction_id===c.extraction_id)active.push(c);
 }
 return active;
}

export async function runHkFactsSync(deps:PromoteDeps,opts:PromoteOptions):Promise<HkIssuerOutcome[]>{
 const out:HkIssuerOutcome[]=[];const ids=[...new Set(opts.issuerIds)];const pubGen=opts.pubGen??HK_PUB_GEN;
 for(let i=0;i<ids.length;i++){
  if(remaining(deps)<MIN_ISSUER_MS){
   for(const id of ids.slice(i))out.push({issuerId:id,runId:null,outcome:'skipped',code:'deadline_hit',counts:emptyCounts(),errors:[{code:'deadline_hit',key:id}],staged:0});
   break;
  }
  try{out.push(await promoteIssuer(deps,opts.batchId,ids[i],pubGen));}
  catch(e){   // issuer lookup, ensureHkScope or claimLease threw: this issuer fails, the loop and earlier outcomes stay (Task 16 review)
   const code=isLeaseLoss(e)?'lease_lost':'issuer_init_failed';
   out.push({issuerId:ids[i],runId:null,outcome:'failed',code,counts:{...emptyCounts(),failed:1},errors:[{code,key:ids[i],message:errMsg(e)}],staged:0});
  }
 }
 return out;
}

async function promoteIssuer(deps:PromoteDeps,batchId:string,issuer:string,pubGen:number):Promise<HkIssuerOutcome>{
 const {db,port,tables}=deps;
 const o:HkIssuerOutcome={issuerId:issuer,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],staged:0};
 const skip=(reason:string)=>{o.outcome='skipped';o.code=reason;o.errors.push({code:'skipped_summary',key:issuer,message:JSON.stringify({[reason]:1})});return o;};
 const [row]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 const stockCode=typeof row?.hkex_stock_code_primary==='string'?row.hkex_stock_code_primary:null;
 if(!row||stockCode===null){o.outcome='failed';o.code='scope_unresolved';o.counts.failed=1;o.errors.push({code:'scope_unresolved',key:issuer});return o;}
 if(row.status==='merged')return skip('issuer_merged');
 await port.ensureHkScope(issuer,stockCode);
 if(!await port.claimLease(issuer,batchId,PROMOTE_LEASE_TTL_S))return skip('leased');
 // R1-P2-7 round 2: the issuer's whole promotion runs under the lease heartbeat (same-batch claimLease
 // every HEARTBEAT_MS) with guarded clients; a refused renewal → lease_lost at once, no further write
 const live:HkIssuerOutcome={issuerId:issuer,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],staged:0};   // the claimed phase's own outcome object: readable after a heartbeat abort
 try{
  return await withLeaseHeartbeat(()=>port.renewLease(issuer,batchId,PROMOTE_LEASE_TTL_S),
   (signal,quiesce)=>promoteClaimed({...deps,db:guardCalls(deps.db,signal),port:guardCalls(port,signal),tables:guardCalls(tables,signal)},batchId,issuer,pubGen,quiesce,live),
   {intervalMs:HEARTBEAT_MS,remainingMs:()=>remaining(deps),reserveMs:FINAL_RESERVE_MS});
 }catch(e){
  if(!isLeaseLoss(e))throw e;
  if(live.outcome==='published'){live.errors.push({code:'lease_lost',key:issuer,message:'heartbeat after publish'});return live;}   // the run committed: report it as published
  return {issuerId:issuer,runId:null,outcome:'failed',code:'lease_lost',counts:{...emptyCounts(),failed:1},errors:[{code:'lease_lost',key:issuer,message:'heartbeat'}],staged:0};
 }
}

async function promoteClaimed(deps:PromoteDeps,batchId:string,issuer:string,pubGen:number,quiesce:()=>Promise<void>=async()=>{},o:HkIssuerOutcome={issuerId:issuer,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],staged:0}):Promise<HkIssuerOutcome>{
 const {db,port,tables}=deps;
 const skip=(reason:string)=>{o.outcome='skipped';o.code=reason;o.errors.push({code:'skipped_summary',key:issuer,message:JSON.stringify({[reason]:1})});return o;};
 let leaseHeld=true,released=false,published=false,abandoned=false;let runId:string|null=null;
 const nowIso=()=>deps.now().toISOString();
 const fail=(code:string,message?:string)=>{o.outcome='failed';o.code=code;o.errors.push(message===undefined?{code,key:issuer}:{code,key:issuer,message});o.counts.failed+=Math.max(1,o.counts.fetched-o.counts.quarantined);return o;};
 const cleanupFailed=(step:string,e:unknown)=>{o.errors.push({code:'cleanup_failed',key:issuer,message:`${step}: ${errMsg(e)}`});};
 // Only a still-staged run of OUR batch is abandoned here; after publish the run is immutable.
 const abandonOnce=async()=>{
  if(runId===null||!leaseHeld||published||abandoned)return;abandoned=true;
  try{await port.abandonRun(runId);}catch(e){if(isLeaseLoss(e)){leaseHeld=false;return;}cleanupFailed('abandon',e);return;}
  try{await port.abandonCandidatePublications(runId);}catch(e){cleanupFailed('abandon_publications',e);}
 };
 const release=async(outcome:'success'|'failed')=>{
  if(!leaseHeld||released)return;released=true;
  await quiesce();                                                      // R3-P2-1: the heartbeat is stopped and settled before the release
  try{await port.releaseLease(issuer,batchId,outcome,nowIso());}catch(e){if(isLeaseLoss(e))leaseHeld=false;else cleanupFailed('release',e);}
 };
 const stop=async(code:string,message?:string)=>{await abandonOnce();await release('failed');return fail(code,message);};
 /** P2-7: holder-only renewLease (R3-P2-1) extends our lease; false = lost or taken over → lease_lost, nothing more is written. */
 const renew=async()=>{if(!await port.renewLease(issuer,batchId,PROMOTE_LEASE_TTL_S)){leaseHeld=false;throw new DocumentsDbError('lease_lost');}};
 const outOfBudget=()=>remaining(deps)<MIN_PHASE_MS;
 try{
  // ---- 0a: settle staged publications of this generation (no abandonRun on foreign runs)
  const leftover:string[]=[];
  // every generation up to ours: a staged link of an older generation (crash before a bump) must not stay staged for ever
  const staged:PublicationRow[]=[];
  for(let g=1;g<=pubGen;g++)staged.push(...await allPages(cursor=>db.publicationsOf({issuerId:issuer,pubGen:g,state:'staged'},{cursor,limit:1000})));
  for(const run of [...new Set(staged.map(p=>p.run_id))].sort()){
   const status=await port.runStatus(run);
   if(status==='published')await port.finishCandidatePublications(run);
   else if(status==='staged')leftover.push(run);
   else await port.abandonCandidatePublications(run);       // abandoned (or unknown) run: its rows can never publish
  }
  // ---- 0b: our run; spec-2 abandons the leftover staged runs under our lease
  runId=await port.beginRun(issuer,batchId,pubGen);o.runId=runId;
  // ---- 0c
  for(const run of leftover)if(await port.runStatus(run)==='abandoned')await port.abandonCandidatePublications(run);
  // ---- 1: planning snapshot
  const read=await port.readFacts(issuer,{concepts:[...HK_CONCEPT_IDS],asOf:nowIso().slice(0,10),history:true,includeNonOk:true});
  if(read.truncated)return await stop('read_truncated');
  const expectedRev=read.stateRev;
  // ---- 2: active set, what to stage, filings
  const docCache=new Map<string,DocumentRow|null>();
  const docOf=async(id:string)=>{if(!docCache.has(id))docCache.set(id,await db.documentById(id));return docCache.get(id)??null;};
  const active=await activeCandidates(db,issuer,docOf);
  const pubs=new Map<string,PublicationRow>();
  const activeIds=active.map(c=>c.candidate_id);
  for(let i=0;i<activeIds.length;i+=100){
   const part=activeIds.slice(i,i+100);
   for(const p of await allPages(cursor=>db.publicationsOf({candidateIds:part},{cursor,limit:1000})))if(p.pub_gen===pubGen)pubs.set(p.candidate_id,p);
  }
  const toStage=active.filter(c=>{const p=pubs.get(c.candidate_id);return p===undefined||p.state==='abandoned';}).sort(byId);
  const zeroDocs:DocumentRow[]=[];
  for(const id of [...new Set(await port.zeroOutputDocuments(issuer,pubGen))].sort()){
   const d=await docOf(id);
   if(d&&eligibleDocument(d,issuer))zeroDocs.push(d);
   else o.errors.push({code:'skipped_summary',key:`${issuer}:zero_output`,message:JSON.stringify({ineligible_document:id})});
  }
  o.counts.fetched=toStage.length;o.staged=toStage.length;
  if(toStage.length===0&&zeroDocs.length===0){await abandonOnce();await release('success');return skip('nothing_to_publish');}
  if(outOfBudget())return await stop('deadline_hit');
  await renew();
  const docs=[...new Map([...active.map(c=>docCache.get(c.document_id)!),...zeroDocs].map(d=>[d.document_id,d])).values()].sort((a,b)=>a.document_id<b.document_id?-1:1);
  const inserts:HkFilingInsert[]=[];
  for(const d of docs){
   const bound=await port.hkFilingOfDocument(d.document_id);
   inserts.push({filing_id:bound?.filing_id??randomUUID(),issuer_id:issuer,source:'hkex',origin:'hkex',formType:d.doc_class==='annual_report'?'annual':'semiannual',fiscalYear:d.fiscal_year,
    fiscalPeriod:d.fiscal_period==='FY'||d.fiscal_period==='H1'?d.fiscal_period:null,periodEnd:d.period_end,availableDate:d.available_date,sourceRef:hkFilingSourceRef(d),url:d.source_url});
  }
  const filingIds=await port.stageFilings(runId,inserts);
  const refOfDoc=new Map(docs.map(d=>[d.document_id,hkFilingSourceRef(d)]));
  const filingOfDoc=(documentId:string)=>{const f=filingIds.get(refOfDoc.get(documentId)??'');if(f===undefined)throw new Error(`filing_not_staged:${documentId}`);return f;};
  await port.bindFilingDocuments(runId,docs.map(d=>({filing_id:filingOfDoc(d.document_id),document_id:d.document_id})));
  // candidates → spec-2 FactCandidate (value, label snippet, locator)
  const citeIds=[...new Set(toStage.flatMap(c=>{const x=c.citations as FactCitations;return [x.value,x.label];}))];
  const cites=new Map<string,CitationRow>();
  for(let i=0;i<citeIds.length;i+=100)for(const r of await db.citationsByIds(citeIds.slice(i,i+100)))cites.set(r.citation_id,r);
  const factCands:FactCandidate[]=[];
  for(const c of toStage){
   const p=c.payload as FinancialFactPayload;const x=c.citations as FactCitations;
   const value=cites.get(x.value),label=cites.get(x.label);
   if(!value||!label)return await stop('evidence_failed',`citation_missing:${c.candidate_id}`);
   factCands.push({concept:p.concept,sourceConcept:sourceConceptOf(label.snippet,p.concept),statement:p.statement,periodStart:p.period_start,periodEnd:p.period_end,duration:p.duration,
    value:canonicalDecimal(p.value),unit:p.unit,consolidation:'consolidated',filingRef:refOfDoc.get(c.document_id)!,rawHash:hkRawHash(docCache.get(c.document_id)!.content_sha256,value)});
  }
  const plan=planHkFactWrites({existing:read.rows,openConflicts:await port.openConflicts(issuer),candidates:factCands,filingCandidates:inserts.map(toFilingInsert),filings:filingIds,issuerId:issuer,mappingGen:pubGen,mappingVersion:HK_EXTRACTOR_REF});
  if(plan.ambiguous.length>0)return await stop('plan_inconsistent',`ambiguous:${plan.ambiguous.length}`);
  // fact_id per candidate (R5-1): new rows first, then the snapshot, by candidate key
  const newByKey=new Map(plan.inserts.map(r=>[candidateKey({concept:r.concept,period_start:r.period_start,period_end:r.period_end,consolidation:r.consolidation,unit:r.unit},r.filing_id,pubGen),r.fact_id]));
  const oldByKey=new Map(read.rows.map(r=>[candidateKey({concept:r.concept,period_start:r.period_start,period_end:r.period_end,consolidation:r.consolidation,unit:r.unit},r.filing_id,r.mapping_gen),r]));
  const rawOf=new Map(factCands.map(f=>[`${f.filingRef}|${f.concept}|${f.periodStart??''}|${f.periodEnd}|${f.unit}`,f]));
  const factOf=new Map<string,string>();
  for(const c of toStage){
   const ck=candidateKey(keyOfPayload(c.payload as FinancialFactPayload),filingOfDoc(c.document_id),pubGen);
   const fresh=newByKey.get(ck);
   if(fresh!==undefined){factOf.set(c.candidate_id,fresh);continue;}
   const old=oldByKey.get(ck);
   if(old===undefined)return await stop('plan_inconsistent',`unresolved:${c.candidate_id}`);
   // Never reuse a fact that differs (Task 16 F1): same key, but another value or other evidence means a changed
   // candidate — it can only publish under a new publication generation (HK_PUB_GEN bump), never silently as the old fact.
   const p=c.payload as FinancialFactPayload;
   const want=rawOf.get(`${refOfDoc.get(c.document_id)}|${p.concept}|${p.period_start??''}|${p.period_end}|${p.unit}`);
   const same=(old.status==='ok'||old.status==='quarantined')&&want!==undefined&&canonicalDecimal(old.value)===want.value&&old.raw_hash===want.rawHash;
   if(!same)return await stop('pub_gen_required',`${p.concept}:${p.period_end}:${c.candidate_id}`);
   factOf.set(c.candidate_id,old.fact_id);
  }
  if(plan.inserts.length>0){
   const n=await port.stageFacts(runId,plan.inserts);
   if(n!==plan.inserts.length)return await stop('plan_inconsistent',`staged ${n} of ${plan.inserts.length}`);
  }
  for(const c of toStage){
   try{await db.stageCandidatePublication(c.candidate_id,pubGen,runId,factOf.get(c.candidate_id)!);}
   catch(e){if(codeOf(e)==='approval_revoked')return await stop('approval_revoked',c.candidate_id);throw e;}
  }
  const run=runId;
  // ---- 3: evidence for every NEW fact of this run, written while every new fact is still 'staged'
  //      (insert_fact_citations accepts staged facts only), i.e. BEFORE the same-day conflicts and
  //      contested joins are parked below; parked facts therefore carry their evidence too
  const newIds=new Set(plan.inserts.map(r=>r.fact_id));
  const evidence=new Map<string,{fact_id:string;citation_id:string;role:CitationRole}>();
  const add=(fact_id:string,citation_id:string,role:CitationRole)=>evidence.set(`${fact_id}|${role}|${citation_id}`,{fact_id,citation_id,role});
  for(const c of toStage){
   const f=factOf.get(c.candidate_id)!;if(!newIds.has(f))continue;
   const x=c.citations as FactCitations;
   add(f,x.value,'value');add(f,x.label,'label');add(f,x.unit,'unit');
   if(typeof x.unit_currency==='string')add(f,x.unit_currency,'unit_currency');   // the table currency of a 仙 / cents EPS (R2-P1-1), its own role (R3-P1-1)
   for(const p of x.period)add(f,p.citation_id,'period');
  }
  await renew();
  try{if(evidence.size>0)await port.insertFactCitations(run,[...evidence.values()]);}
  catch(e){if(isLeaseLoss(e))throw e;return await stop('evidence_failed',errMsg(e));}
  const park=(reasonCode:string,naturalKey:string,payload:Record<string,unknown>)=>quarantine(tables,{dataset:HK_FACTS_DATASET,table:'financial_facts',naturalKey,reasonCode,batchId,payload:{...payload,run_id:run}});
  for(const c of plan.conflicts){
   const item=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
   await port.quarantineFacts(run,c.newFactIds,item);
  }
  for(const j of plan.contestedJoins)await port.quarantineFacts(run,j.factIds,j.itemId);
  // ---- 4: spec-2 statement rules, then the one HK publish entry point
  const parked=new Set(plan.quarantinedFactIds);
  const sourceRefOf=new Map(inserts.map(f=>[filingIds.get(f.sourceRef)!,f.sourceRef]));
  const rules=evaluateHkFactRules({newRows:plan.inserts.filter(r=>!parked.has(r.fact_id)),okRows:read.rows.filter(r=>r.status==='ok'),sourceRefOf,issuerId:issuer,mappingGen:pubGen});
  for(const rq of rules.quarantine){
   const item=await park(rq.reason,rq.naturalKey,{key:rq.key,fact_ids:rq.factIds,rule:rq.rule,detail:rq.detail});
   await port.quarantineFacts(run,rq.factIds,item);
   for(const id of rq.factIds)plan.outcomes.set(id,'quarantined');
  }
  o.errors.push(...summarizeWarnings(rules.warnings));
  const manifest=[...new Set(docs.map(d=>filingOfDoc(d.document_id)))];
  // P1-4: the zero-output selection as planned (document + the current extraction planning saw);
  // publish_hk_run rechecks it under the document locks and raises stale_plan if it changed
  const zeroOutput=zeroDocs.map(d=>({document_id:d.document_id,extraction_id:d.current_extraction_id!}));
  if(outOfBudget())return await stop('deadline_hit');
  await renew();
  try{await port.publishHkRun(issuer,batchId,run,manifest,expectedRev,zeroOutput);}
  catch(e){
   if(isLeaseLoss(e))throw e;
   const c=codeOf(e);
   if(c==='evidence_incomplete'||c==='stale_plan')return await stop(c);
   return await stop('publish_failed',errMsg(e));
  }
  published=true;o.outcome='published';
  for(const v of plan.outcomes.values())o.counts[v]++;
  o.counts.duplicates+=plan.counts.duplicates;
  try{o.finish=await port.finishCandidatePublications(run);}
  catch(e){o.errors.push({code:'finish_failed',key:issuer,message:errMsg(e)});await release('failed');return o;}   // step 0a finishes it next time
  await release('success');
  return o;
 }catch(e){
  if(isLeaseLoss(e)){leaseHeld=false;if(published){o.errors.push({code:'lease_lost',key:issuer});return o;}return fail('lease_lost');}
  if(published){o.errors.push({code:'unknown',key:issuer,message:errMsg(e)});await release('failed');return o;}
  return await stop('unknown',errMsg(e));
 }
}

/**
 * One promotion of one issuer in its own documents-candidates batch (the admin confirm route, spec
 * §9: "confirmed 后立即跑一次"; the cron is the fallback). Without a code version nothing runs.
 */
export async function promoteIssuerNow(deps:PromoteDeps&{codeVersion:string|null},issuerId:string,triggeredBy:TriggeredBy):Promise<{state:'published'|'failed'|'skipped';message?:string;batchId?:string}>{
 if(!deps.codeVersion)return {state:'skipped',message:'code_version_unavailable'};
 const {batchId}=await startBatch(deps.tables,{producer:'documents-candidates',dataset:'documents.candidates',toolVersions:{hk_pub_gen:String(HK_PUB_GEN),trigger:'decide'},codeVersion:deps.codeVersion,triggeredBy});
 let outcomes:HkIssuerOutcome[]=[];
 try{outcomes=await runHkFactsSync(deps,{issuerIds:[issuerId],batchId,triggeredBy});}
 finally{
  const counts=emptyCounts();const errors:BatchError[]=[];
  for(const x of outcomes){for(const k of COUNTERS)counts[k]+=x.counts[k];errors.push(...x.errors);}
  if(outcomes.length===0)errors.push({code:'unknown',key:issuerId,message:'promotion_threw'});
  await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 }
 const r=outcomes[0];
 return r.code===undefined?{state:r.outcome,batchId}:{state:r.outcome,message:r.code,batchId};
}
