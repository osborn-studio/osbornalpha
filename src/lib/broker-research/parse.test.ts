// Parse service state, receipts, private artifacts, and lease fences (spec §6.2).
import {beforeEach,describe,expect,it} from 'vitest';
import {F3Error,F3Timeout,fakeF3Port} from './ports/f3';
import {EXTRACTOR_VERSION,pipelineExtraction} from './fixtures/pipeline';
import {brokerPaths} from './storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence} from './testing';
import type {MemoryDeps} from './testing';
import {loadArtifact,runParse} from './parse';
const batches=(d:MemoryDeps)=>(d.tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows('ingest_batches');
describe('runParse',()=>{
 let d:MemoryDeps;
 beforeEach(()=>{d=memoryBrokerDeps();});
 const seed=async(patch={})=>seedDocument(d,(await seedLicence(d.db,{patch})).licence_id);
 it('stores artifact per run, records hash and batch, releases lease',async()=>{
  const doc=await seed();const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r.status).toBe('succeeded');const run=(await d.db.getRun(r.runId))!;
  expect(run).toMatchObject({kind:'parse',status:'succeeded',extractor_version:EXTRACTOR_VERSION,artifact_path:brokerPaths.artifact(doc.sha256,r.runId)});
  expect((await loadArtifact(d,run)).page_count).toBe(3);
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parsed',current_parse_run_id:r.runId,page_count:3,lease_token:null});
  expect(batches(d)[0]).toMatchObject({producer:'broker-research-parse',status:'success',counts:{fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0}});
  expect((await d.db.listAccessLog({limit:5})).map(x=>x.action)).toEqual(['parse_run']);
 });
 it('enforces licence, live lease, withdrawal, and promotion',async()=>{
  const forbidden=await seed({allows_llm_processing:false});
  await expect(runParse(d,forbidden.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'licence_forbids_processing',status:409});
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id,new TextEncoder().encode('%PDF-other'));
  expect(await d.db.claimLease(doc.document_id,'other',300)).toBe(true);
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'lease_held',status:409});
  await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'x'});
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({status:410});
  const pendingId=d.newId();const pendingSha='d'.repeat(64);
  await d.db.insertDocument({document_id:pendingId,sha256:pendingSha,storage_path:brokerPaths.report(pendingSha),byte_size:10,licence_id:(await seedLicence(d.db)).licence_id,uploaded_by:ADMIN_ID,original_filename:'pending.pdf'});
  await expect(runParse(d,pendingId,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'promotion_pending',status:409});
 });
 it.each([[new F3Timeout(),'f3_timeout'],[new F3Error('extractor_nondeterministic'),'extractor_nondeterministic'],[new Error('boom'),'f3_failed']])
 ('failure %s records failed run and batch',async(err,code)=>{
  d=memoryBrokerDeps({f3:fakeF3Port(()=>err)});const doc=await seed();const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r).toMatchObject({status:'failed',errorCode:code});
  expect((await d.db.getRun(r.runId))!.detail).toMatchObject({error_code:code});
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parse_failed',lease_token:null});
  expect(batches(d)[0]).toMatchObject({status:'failed',counts:{fetched:1,failed:1}});
 });
 it('failed reparse keeps prior successful run current',async()=>{
  const doc=await seed();const ok=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  d.f3=fakeF3Port(()=>new F3Timeout());await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect((await d.db.getDocument(doc.document_id))!).toMatchObject({status:'parsed',current_parse_run_id:ok.runId});
 });
 it('unavailable F3 leaves no run and records failed batch',async()=>{
  d=memoryBrokerDeps({f3:{available:()=>false,extractDocument:async()=>pipelineExtraction('x')}});const doc=await seed();
  await expect(runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'f3_unavailable',status:503});
  expect(await d.db.listRuns(doc.document_id)).toEqual([]);
  expect(batches(d)[0]).toMatchObject({status:'failed',errors:[{code:'f3_unavailable'}]});
  expect((await d.db.getDocument(doc.document_id))!.lease_token).toBeNull();
 });
 it('rejects artifact bytes whose hash differs from run',async()=>{
  const doc=await seed();const r=await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});const run=(await d.db.getRun(r.runId))!;
  d.storage.objects.set(run.artifact_path!,{bytes:new TextEncoder().encode('{}'),contentType:'application/json'});
  await expect(loadArtifact(d,run)).rejects.toMatchObject({code:'artifact_unreadable'});
 });
 it('withdrawal during F3 prevents artifact write; F3 prefix remains pending for reconciliation',async()=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  d.f3={available:()=>true,extractDocument:async(i)=>{await gate;return pipelineExtraction(i.sha256);}};
  const doc=await seed();const work=runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  for(let k=0;k<50&&(await d.db.pendingWritesFor(doc.document_id)).length===0;k++)await new Promise(r=>setTimeout(r,0));
  expect((await d.db.pendingWritesFor(doc.document_id)).map(w=>w.writer)).toEqual(['f3']);
  d.advance(301_000);await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'licence ended'});
  release();expect(await work).toMatchObject({status:'failed',errorCode:'document_withdrawn'});
  expect([...d.storage.objects.keys()].filter(k=>k.includes('.extract.'))).toEqual([]);
  expect((await d.db.writesFor(doc.document_id)).map(w=>[w.writer,w.status])).toEqual([['f3','pending']]);
 });
});
