// src/lib/documents/candidates/run.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({generate:vi.fn()}));
vi.mock('../hk-facts/generate',()=>({generateHkCandidates:mocks.generate}));

import {DocumentsDbError,EXTRACTOR_VERSION,HK_EXTRACTOR_REF,TABLE_ALGO_VERSION} from '../types';
import type {CandidateInsert,DocumentRow,ExtractionRow,FinancialFactPayload,PagesJson} from '../types';
import {HEARTBEAT_MS} from '../lease';
import {CandidatesRunError,runDocumentsCandidates} from './run';
import type {CandidatesOptions} from './run';
import {ADMIN,CODE,FY25,ISSUER,candidatesDepsOf,citeSeedFact,hkHarness,naturalKeyOf,seedCandidateInsert,seedHkCandidates,seedHkExtraction,snapshotOf} from '../hk-facts/test-support';
import type {CiteAt,HkHarness,SeedFact,SeededExtraction} from '../hk-facts/test-support';

/** The generator stand-in: candidates for the seeded facts of the extraction, cited through ctx.cite, plus one info code. */
const seeded=new Map<string,SeededExtraction>();
beforeEach(()=>{
 vi.clearAllMocks();seeded.clear();
 mocks.generate.mockImplementation(async(_pages:PagesJson,ctx:{document:DocumentRow;extraction:ExtractionRow;cite:CiteAt})=>{
  const ex=seeded.get(ctx.extraction.extraction_id);if(!ex)throw new Error('unknown extraction');
  const candidates:CandidateInsert[]=[];
  for(const f of ex.facts)candidates.push(seedCandidateInsert(f,await citeSeedFact(ctx.cite,ex.layout,f),snapshotOf(ex,ctx.extraction),ex.document.period_end??f.period_end));
  return {candidates,info:[{code:'label_ambiguous',key:ctx.extraction.extraction_id,message:JSON.stringify({rows:1})}]};
 });
});
async function pending(h:HkHarness,facts:readonly SeedFact[]=FY25,sourceRef='2026032500101_c'){const ex=await seedHkExtraction(h,{sourceRef,facts});seeded.set(ex.extractionId,ex);return ex;}
const run=(h:HkHarness,over:Partial<CandidatesOptions>={},deps=candidatesDepsOf(h))=>runDocumentsCandidates(deps,{limit:10,dryRun:false,triggeredBy:'script',phases:['candidates','auto'],...over});
const statementOf=(c:{payload:unknown})=>(c.payload as FinancialFactPayload).statement;

describe('runDocumentsCandidates — candidates phase',()=>{
 it('generates, inserts, checks and finishes a due primary extraction; batch and freshness are recorded',async()=>{
  const h=hkHarness();const ex=await pending(h);
  const r=await run(h);
  expect(r.status).toBe('success');
  expect(r.extractions).toEqual([expect.objectContaining({extractionId:ex.extractionId,documentId:ex.document.document_id,outcome:'done',inserted:6,written:6,inherited:0,quarantined:0})]);
  expect(r.counts).toMatchObject({fetched:6,inserted:6,duplicates:0,quarantined:0,failed:0});
  expect(r.errors).toContainEqual(expect.objectContaining({code:'label_ambiguous',key:ex.extractionId}));
  const cands=h.docs.candidates().filter(c=>c.extraction_id===ex.extractionId);
  expect(cands).toHaveLength(6);
  expect(cands.every(c=>c.status==='candidate'&&c.checks_passed&&c.checks.length===8)).toBe(true);
  expect((await h.docs.extractionById(ex.extractionId))!.candidates_status).toBe('done');
  const cites=h.docs.citations().filter(c=>c.extraction_id===ex.extractionId);
  expect(cites.length).toBe(6*5);                                         // value, label, unit, statement title, column header
  expect(cites.every(c=>c.created_by==='extractor'&&c.created_ref===HK_EXTRACTOR_REF&&c.visibility==='internal')).toBe(true);
  const batch=h.tables.rows('ingest_batches').find(b=>b.batch_id===r.batchId)!;
  expect(batch).toMatchObject({producer:'documents-candidates',dataset:'documents.candidates',status:'success',tool_versions:{hk_label_gen:'1',hk_rules_version:'hk-facts/1.0',hk_pub_gen:'1'},code_version:CODE});
  expect(h.tables.rows('dq_freshness').find(f=>f.dataset==='documents.candidates')).toMatchObject({status:'fresh'});
  expect(mocks.generate).toHaveBeenCalledTimes(1);
 });
 it('is idempotent: nothing due next time; a regeneration inserts nothing new and never touches a decided row',async()=>{
  const h=hkHarness();const ex=await pending(h);await run(h);
  const again=await run(h);
  expect(again.idle).toBe(true);expect(again.extractions).toEqual([]);
  const rev=h.docs.candidates().find(c=>c.natural_key===naturalKeyOf(FY25[0]))!;
  await h.docs.decideCandidate(rev.candidate_id,{kind:'human',decided_by:ADMIN,status:'confirmed'});
  expect(await h.docs.requestCandidatesRegen({document_id:ex.document.document_id},ADMIN)).toBe(1);
  const regen=await run(h);
  expect(regen.status).toBe('success');
  expect(regen.extractions[0]).toMatchObject({outcome:'done',inserted:0,written:5});
  expect(regen.counts).toMatchObject({fetched:6,inserted:0,duplicates:6});
  expect((await h.docs.candidateById(rev.candidate_id))!.status).toBe('confirmed');
  expect(h.docs.candidates().filter(c=>c.extraction_id===ex.extractionId)).toHaveLength(6);
 });
 it('skips an explicitly requested extraction whose lease another batch holds',async()=>{
  const h=hkHarness();const ex=await pending(h);
  expect(await h.docs.claimCandidatesLease(ex.extractionId,await h.batch(),600)).toBe(true);
  const r=await run(h,{extractionIds:[ex.extractionId]});
  expect(r.extractions).toEqual([expect.objectContaining({extractionId:ex.extractionId,outcome:'skipped',code:'leased_or_exhausted'})]);
  expect(r.status).toBe('success');expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('a throwing generator finishes the version as failed three times; the fourth claim turns it exhausted',async()=>{
  const h=hkHarness();const ex=await pending(h);
  mocks.generate.mockRejectedValue(new Error('boom'));
  for(let i=0;i<3;i++){
   const r=await run(h);
   expect(r.status).toBe('failed');
   expect(r.errors).toContainEqual(expect.objectContaining({code:'candidates_error',key:ex.extractionId}));
   expect((await h.docs.extractionById(ex.extractionId))!.candidates_status).toBe('failed');
  }
  const last=await run(h);
  expect(last.extractions[0]).toMatchObject({outcome:'skipped',code:'leased_or_exhausted'});
  expect(await h.docs.extractionById(ex.extractionId)).toMatchObject({candidates_status:'exhausted',candidates_attempts:3});
  expect(h.docs.candidates()).toEqual([]);
 });
 it('refuses a pages.json whose bytes do not match the extraction hash',async()=>{
  const h=hkHarness();await pending(h);
  const deps={...candidatesDepsOf(h),store:{...h.store,get:async()=>new TextEncoder().encode('{"tampered":true}')}};
  const r=await run(h,{},deps);
  expect(r.extractions[0]).toMatchObject({outcome:'failed',code:'candidates_error'});
  expect(r.errors.find(e=>e.code==='candidates_error')!.message).toContain('pages_json_hash_mismatch');
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('a failed identity blocks its whole statement column and parks one reused hk_identity_gp item',async()=>{
  const h=hkHarness();
  const ex=await pending(h,FY25.map(f=>f.concept==='gross_profit'?{...f,value:'4000000'}:f));
  const r=await run(h);
  expect(r.status).toBe('success');                                            // quarantine never degrades the batch
  expect(r.extractions[0]).toMatchObject({outcome:'done',quarantined:1});
  const cands=h.docs.candidates();
  expect(cands.filter(c=>statementOf(c)==='IS').every(c=>!c.checks_passed)).toBe(true);
  expect(cands.filter(c=>statementOf(c)==='BS').every(c=>c.checks_passed)).toBe(true);
  const items=h.tables.rows('dq_quarantine');
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({dataset:'documents.candidates',table_name:'extraction_candidates',reason_code:'hk_identity_gp',status:'open'});
  expect((items[0].payload as {candidate_ids:string[]}).candidate_ids).toHaveLength(3);
  await h.docs.requestCandidatesRegen({document_id:ex.document.document_id},ADMIN);
  await run(h);
  expect(h.tables.rows('dq_quarantine')).toHaveLength(1);
 });
 it('dry run writes nothing and lists what is due',async()=>{
  const h=hkHarness();const ex=await pending(h);
  const r=await run(h,{dryRun:true});
  expect(r).toMatchObject({batchId:null,status:'dry_run',idle:false});
  expect(r.extractions).toEqual([expect.objectContaining({extractionId:ex.extractionId,outcome:'due'})]);
  expect(h.tables.rows('ingest_batches').filter(b=>b.producer==='documents-candidates')).toEqual([]);
  expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('refuses to apply without a code version',async()=>{
  const h=hkHarness();
  await expect(runDocumentsCandidates({...candidatesDepsOf(h),codeVersion:null},{limit:1,dryRun:false,triggeredBy:'script'})).rejects.toBeInstanceOf(CandidatesRunError);
 });
});

describe('runDocumentsCandidates — leases and budget (P2-7)',()=>{
 it('a lease that expires while another batch takes over: lease_lost, no citation, candidate or finish written',async()=>{
  const h=hkHarness();const ex=await pending(h);
  const OTHER=await h.batch();const deps=candidatesDepsOf(h);
  const r=await run(h,{},{...deps,store:{...deps.store,get:async(p:string)=>{
   h.docs.expireCandidatesLease(ex.extractionId);                              // reading pages.json took longer than the lease …
   expect(await h.docs.claimCandidatesLease(ex.extractionId,OTHER,600)).toBe(true);   // … and another batch claimed the extraction
   return h.store.get(p);
  }}});
  expect(r.extractions).toEqual([expect.objectContaining({extractionId:ex.extractionId,outcome:'failed',code:'lease_lost',inserted:0,written:0})]);
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(h.docs.citations().filter(c=>c.extraction_id===ex.extractionId)).toEqual([]);
  expect(h.docs.candidates().filter(c=>c.extraction_id===ex.extractionId)).toEqual([]);
  expect(await h.docs.extractionById(ex.extractionId)).toMatchObject({candidates_status:'pending',candidates_lease_batch_id:OTHER});
 });
 it('R1-P2-7 round 2: generation that outlives the lease is renewed on a timer; a takeover mid-generation stops it with lease_lost, no candidate written',async()=>{
  vi.useFakeTimers();
  try{
   const h=hkHarness();const ex=await pending(h);
   const OTHER=await h.batch();let started=false;
   mocks.generate.mockImplementationOnce(async()=>{started=true;await new Promise(r=>setTimeout(r,3*600_000));return {candidates:[],info:[]};});
   const renew=h.docs.renewCandidatesLease;let renewals=0;
   const deps=candidatesDepsOf(h);
   const p=run(h,{},{...deps,db:{...deps.db,renewCandidatesLease:async(e:string,b:string,t:number)=>{renewals++;return renew(e,b,t);}}});
   for(let i=0;i<2000&&!started;i++)await Promise.resolve();
   expect(started).toBe(true);
   const before=renewals;
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS*2);
   expect(renewals-before).toBe(2);                                             // renewed while generation runs
   h.docs.expireCandidatesLease(ex.extractionId);
   expect(await h.docs.claimCandidatesLease(ex.extractionId,OTHER,600)).toBe(true);
   await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
   const r=await p;
   expect(r.extractions[0]).toMatchObject({extractionId:ex.extractionId,outcome:'failed',code:'lease_lost',inserted:0});
   await vi.advanceTimersByTimeAsync(3*600_000);                               // the abandoned generation finishes …
   expect(h.docs.candidates().filter(c=>c.extraction_id===ex.extractionId)).toEqual([]);   // … and nothing is written
   expect(await h.docs.extractionById(ex.extractionId)).toMatchObject({candidates_status:'pending',candidates_lease_batch_id:OTHER});
  }finally{vi.useRealTimers();}
 });
 it('a takeover during generation stops before the insert; a phase without budget is deadline_hit and retried later',async()=>{
  const h=hkHarness();const ex=await pending(h);
  const OTHER=await h.batch();
  const generate=mocks.generate.getMockImplementation()!;
  mocks.generate.mockImplementationOnce(async(...a:unknown[])=>{
   const out=await generate(...a);
   h.docs.expireCandidatesLease(ex.extractionId);
   expect(await h.docs.claimCandidatesLease(ex.extractionId,OTHER,600)).toBe(true);
   return out;
  });
  const r=await run(h);
  expect(r.extractions[0]).toMatchObject({outcome:'failed',code:'lease_lost',inserted:0});
  expect(h.docs.candidates().filter(c=>c.extraction_id===ex.extractionId)).toEqual([]);
  const g=hkHarness();const gx=await pending(g,FY25,'2026032500102_c');
  let clock=Date.parse('2026-11-06T02:00:00.000Z');
  const late=await run(g,{},{...candidatesDepsOf(g),now:()=>new Date(clock),deadline:new Date(clock+95_000),
   store:{...g.store,get:async(p:string)=>{clock+=80_000;return g.store.get(p);}}});   // reading took 80 s: 15 s left
  expect(late.extractions[0]).toMatchObject({outcome:'failed',code:'deadline_hit'});
  expect(await g.docs.extractionById(gx.extractionId)).toMatchObject({candidates_status:'failed',candidates_lease_batch_id:null});
 });
});

describe('runDocumentsCandidates — auto phase',()=>{
 const approval=(h:HkHarness,over:Record<string,unknown>={})=>h.docs.insertApproval({extractor_ref:HK_EXTRACTOR_REF,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,
  concepts:['revenue','gross_profit'],gold_sha256:'a'.repeat(64),precision:'0.97',recall:'0.96',report_path:'docs/audits/2026-11-06-document-pipeline/eval-hk-facts.json',approved_by:ADMIN,...over});
 it('without an approval row nothing is decided (owner decision C default)',async()=>{
  const h=hkHarness();await pending(h);
  const r=await run(h);
  expect(r.auto).toEqual({considered:6,decided:0,stopped:null});
  expect(h.docs.candidates().every(c=>c.status==='candidate')).toBe(true);
 });
 it('decides exactly the approved concepts when all three versions equal the extraction row; the next run decides nothing more',async()=>{
  const h=hkHarness();await pending(h);await run(h);
  const id=await approval(h);
  const r=await run(h,{phases:['auto']});
  expect(r.auto).toEqual({considered:6,decided:2,stopped:null});
  const auto=h.docs.candidates().filter(c=>c.status==='confirmed');
  expect(auto.map(c=>(c.payload as FinancialFactPayload).concept).sort()).toEqual(['gross_profit','revenue']);
  for(const c of auto)expect(c).toMatchObject({decision_kind:'auto',approval_id:id,decided_by:null});
  expect((await run(h,{phases:['auto']})).auto).toEqual({considered:4,decided:0,stopped:null});
 });
 it('a version mismatch, a revoked approval, a concept outside the approval or an llm candidate is never auto-decided',async()=>{
  const h=hkHarness();await pending(h);await run(h);
  await approval(h,{code_version:'another-build'});
  const revoked=await approval(h,{concepts:['total_assets']});await h.docs.revokeApproval(revoked);
  const llmDoc=await seedHkExtraction(h,{sourceRef:'2026032500102_c',facts:[FY25[0]]});
  await seedHkCandidates(h,llmDoc,{extractor:{kind:'llm',ref:'model-x@p1'}});
  await approval(h,{extractor_ref:'model-x@p1',concepts:['revenue']});
  const r=await run(h,{phases:['auto']});
  expect(r.auto.decided).toBe(0);
  expect(h.docs.candidates().every(c=>c.status==='candidate')).toBe(true);
 });
 it('too_many_approvals stops the phase and degrades the batch',async()=>{
  const h=hkHarness();await pending(h);await run(h);
  const deps={...candidatesDepsOf(h),db:{...h.docs,approvalsFor:async()=>{throw new DocumentsDbError('too_many_approvals');}}};
  const r=await run(h,{phases:['auto']},deps);
  expect(r.auto.stopped).toBe('too_many_approvals');
  expect(r.errors).toContainEqual({code:'too_many_approvals',key:HK_EXTRACTOR_REF});
  expect(r.status).not.toBe('success');
  expect(h.docs.candidates().every(c=>c.status==='candidate')).toBe(true);
 });
});

describe('runDocumentsCandidates — promote phase',()=>{
 const approval=(h:HkHarness,over:Record<string,unknown>={})=>h.docs.insertApproval({extractor_ref:HK_EXTRACTOR_REF,extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:CODE,
  concepts:['revenue','gross_profit'],gold_sha256:'a'.repeat(64),precision:'0.97',recall:'0.96',report_path:'docs/audits/2026-11-06-document-pipeline/eval-hk-facts.json',approved_by:ADMIN,...over});
 it('auto-decided candidates are published within the same run (spec §12 example 8)',async()=>{
  const h=hkHarness();await pending(h);await approval(h);
  const r=await run(h,{phases:undefined});                                 // default: all three phases
  expect(r.status).toBe('success');
  expect(r.auto.decided).toBe(2);
  expect(r.promote).toEqual([expect.objectContaining({issuerId:ISSUER,outcome:'published'})]);
  expect(h.facts.facts().filter(f=>f.status==='ok').map(f=>f.concept).sort()).toEqual(['gross_profit','revenue']);
  expect(h.docs.candidates().filter(c=>c.status==='promoted').every(c=>c.decision_kind==='auto')).toBe(true);
 });
 it('an approval below 0.95 never lands (ea_threshold)',async()=>{
  const h=hkHarness();
  await expect(approval(h,{precision:'0.94'})).rejects.toThrow();
  await expect(approval(h,{recall:'0.949'})).rejects.toThrow();
 });
 it('lists due issuers in a dry run, publishes them, and is idle once nothing is due',async()=>{
  const h=hkHarness();await pending(h);await run(h);
  await h.docs.decideCandidate(h.docs.candidates().find(c=>c.natural_key===naturalKeyOf(FY25[0]))!.candidate_id,{kind:'human',decided_by:ADMIN,status:'confirmed'});
  const dry=await run(h,{dryRun:true,phases:['promote']});
  expect(dry.promote).toEqual([{issuerId:ISSUER,outcome:'skipped',code:'due',counts:expect.any(Object)}]);
  const r=await run(h,{phases:['promote']});
  expect(r.promote).toEqual([expect.objectContaining({issuerId:ISSUER,outcome:'published'})]);
  expect(r.counts).toMatchObject({fetched:1,inserted:1});
  const again=await run(h,{phases:['promote']});
  expect(again.promote).toEqual([]);expect(again.idle).toBe(true);
 });
});
