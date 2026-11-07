// C5 extraction behavior: chunk budget, private calls, typed evidence, retries and lease fences (spec §6.2).
import {beforeEach,describe,expect,it} from 'vitest';
import {LlmError,recordedLlmPort} from '../ports/llm';
import {EXTRACT_OBJECT,EXTRACT_RESPONSE,PAGES} from '../fixtures/pipeline';
import {runParse} from '../parse';
import {brokerPaths} from '../storage';
import {memoryTableClient} from '../../db/memory-table-client';
import {memoryBrokerResearchDb} from '../memory-db';
import {ADMIN_ID,DEADLINE,T0,memoryBrokerDeps,seedDocument,seedLicence} from '../testing';
import type {MemoryDeps} from '../testing';
import {CHUNK_PAGES,chunkPages,runExtract} from './run';
import {toTyped} from './typed';
const rows=(d:MemoryDeps,t:string)=>(d.tables as unknown as {rows(t:string):Record<string,unknown>[]}).rows(t);
async function parsedDoc(d:MemoryDeps){const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return doc;}
describe('chunkPages',()=>{
 it('splits by page count and context share, keeping an oversize page alone',()=>{
  const pages=Array.from({length:20},(_,i)=>({page:i+1,text:'x'.repeat(100)}));
  expect(chunkPages(pages,1_000_000,0).map(c=>c.length)).toEqual([CHUNK_PAGES,CHUNK_PAGES,4]);
  expect(chunkPages(pages,1000,0).map(c=>c.length)).toEqual([5,5,5,5]);
  expect(chunkPages([{page:1,text:'y'.repeat(5000)},{page:2,text:'z'}],1000,0).map(c=>c.map(p=>p.page))).toEqual([[1],[2]]);
 });
});
describe('runExtract',()=>{
 let d:MemoryDeps;beforeEach(()=>{d=memoryBrokerDeps();});
 it('stores private calls and typed candidates, receipts and six batch counts',async()=>{
  const doc=await parsedDoc(d),r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r.status).toBe('succeeded');const run=(await d.db.getRun(r.runId))!;
  expect(run).toMatchObject({kind:'extract',status:'succeeded',prompt_version:'broker-extract/1',schema_version:'extract-schema/1',model_id:'recorded-model',request_path:brokerPaths.request(r.runId),response_path:brokerPaths.response(r.runId)});
  expect(run.behavior_digest).toMatch(/^[0-9a-f]{64}$/);
  const req=JSON.parse(d.storage.text(run.request_path!)!),res=JSON.parse(d.storage.text(run.response_path!)!);
  expect(req.calls).toHaveLength(1);expect(req.calls[0].user).toContain('=== page 1 ===');expect(res.calls[0].content).toBe(EXTRACT_RESPONSE);
  const fields=await d.db.listFields(r.reportId),tp=fields.find(f=>f.field==='target_price')!;
  expect(tp).toMatchObject({status:'unverified',char_start:null,value_num:toTyped('target_price','120.00').value.value_num,extractor:`llm:recorded-model@${run.registry_hash}`});
  expect(tp.detail).toMatchObject({quote:'120 .00',locate_failure:expect.any(String)});
  const rating=fields.find(f=>f.field==='rating')!;expect(PAGES[0].slice(rating.char_start!,rating.char_end!)).toBe(rating.value_source_text);
  expect((fields.find(f=>f.field==='target_currency')!.detail.multiple_hits as number[]).length).toBeGreaterThan(1);
  expect(fields.find(f=>f.field==='ticker')!.detail).toMatchObject({merge:'merge/1',locate:'locate/1',typed:'typed/1'});
  expect(r.counts).toEqual({fetched:fields.length,inserted:fields.length-1,duplicates:0,versioned:0,quarantined:r.counts.quarantined,failed:0});
  const batch=rows(d,'ingest_batches').find(b=>b.producer==='broker-research-extract')!;
  expect(batch.status).toBe('partial');expect((batch.errors as {code:string}[]).map(e=>e.code)).toEqual(expect.arrayContaining(['span_unverified_summary','eval_receipt_absent']));
  expect((await d.db.getDocument(doc.document_id))!.lease_token).toBeNull();
  expect((await d.db.listAccessLog({documentId:doc.document_id,limit:10})).map(x=>x.action)).toContain('extract_run');
 expect(r.ruleReceiptId).toBeTruthy();expect((await d.db.getReport(r.reportId))!.rules_input_hash).toBeTruthy();
 });
 it('binds the rule receipt to the DB rules hash and includes title disclosure results',async()=>{
  const original=d.db.insertRuleReceipt.bind(d.db);let input:Parameters<typeof original>[0]|null=null;
  d.db.insertRuleReceipt=async row=>{input=row;return original(row);};
  const doc=await parsedDoc(d),r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const report=(await d.db.getReport(r.reportId))!;
  expect(input).not.toBeNull();expect(input!.input_hash).toBe(report.rules_input_hash);
 expect(input!.results).toEqual(expect.arrayContaining([expect.objectContaining({rule:'disclosure',blocking:false,detail:expect.objectContaining({surface:'title_original'})})]));
 });
 it('records candidate counts and a failed run if the rules receipt cannot be written',async()=>{
  const doc=await parsedDoc(d);
  d.db.insertRuleReceipt=async()=>{throw new Error('receipt unavailable');};
  await expect(runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toThrow('receipt unavailable');
  const run=(await d.db.listRuns(doc.document_id)).find(x=>x.kind==='extract')!;
  expect(run).toMatchObject({status:'failed',detail:{error_code:'rules_error'}});
  expect(rows(d,'ingest_batches').find(b=>b.producer==='broker-research-extract')).toMatchObject({status:'partial',counts:{fetched:expect.any(Number),inserted:expect.any(Number)}});
 });
 it('retries schema failure once and then fails with no candidates',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort(['{"scope":1}',EXTRACT_RESPONSE])});
  const ok=await runExtract(d,(await parsedDoc(d)).document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(ok.status).toBe('succeeded');expect((await d.db.getRun(ok.runId))!.detail).toMatchObject({retries:1});
  d=memoryBrokerDeps({llm:recordedLlmPort(['not json','{"scope":1}'])});
  const bad=await runExtract(d,(await parsedDoc(d)).document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(bad).toMatchObject({status:'failed',errorCode:'llm_schema_invalid'});expect(await d.db.listFields(bad.reportId)).toEqual([]);
  expect(d.storage.text(brokerPaths.response(bad.runId))).toContain('not json');
  expect(rows(d,'ingest_batches').find(b=>b.producer==='broker-research-extract')).toMatchObject({status:'failed',counts:{fetched:0}});
 });
 it('maps quota and rejects unparsed or unavailable processing',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort([new LlmError('llm_quota')])});
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await expect(runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'document_not_parsed',status:409});
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).toMatchObject({status:'failed',errorCode:'llm_quota'});
  d.llm={info:()=>null,complete:async()=>{throw new LlmError('llm_unavailable');}};
  await expect(runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).rejects.toMatchObject({code:'llm_unavailable',status:503});
 });
 it('supersedes old candidate rows on repeat',async()=>{
  d=memoryBrokerDeps({llm:recordedLlmPort([EXTRACT_RESPONSE,EXTRACT_RESPONSE])});const doc=await parsedDoc(d);
  const a=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()}),b=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  const all=await d.db.listFields(a.reportId,{includeSuperseded:true});
  expect(all.filter(f=>f.run_id===a.runId).every(f=>f.superseded_by_run_id===b.runId)).toBe(true);
  expect(all.filter(f=>f.run_id===b.runId)).toHaveLength(all.filter(f=>f.run_id===a.runId).length);
 });
 it('does not write scope after lease takeover',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],ingest_batches:['batch_id'],research_audit_log:['id']});
  const mdb=memoryBrokerResearchDb({tables,now:()=>T0});d=memoryBrokerDeps({tables,db:mdb});const doc=await parsedDoc(d);
  const other='00000000-0000-4000-8000-0000000000fe',commit=mdb.extractCommit.bind(mdb);
  mdb.extractCommit=async(...a:Parameters<typeof commit>)=>{const r=await commit(...a);mdb.expireLease(doc.document_id);expect(await mdb.claimLease(doc.document_id,other,300)).toBe(true);return r;};
  const r=await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect(r).toMatchObject({status:'failed',errorCode:'lease_lost'});expect((await d.db.getReport(r.reportId))!.scope).toBeNull();
  expect((await d.db.getDocument(doc.document_id))!.lease_token).toBe(other);
 });
 it('keeps raw calls out of the bucket after withdrawal and lease loss',async()=>{
  const doc=await parsedDoc(d),base=recordedLlmPort([EXTRACT_RESPONSE]);let release!:()=>void;
  const gate=new Promise<void>(r=>{release=r;});let waiting=false;
  d.llm={info:()=>base.info(),complete:async(req)=>{waiting=true;await gate;return base.complete(req);}};
  const pending=runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  for(let k=0;k<50&&!waiting;k++)await new Promise(r=>setTimeout(r,0));
  d.advance(301_000);await d.db.updateDocument(doc.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'licence ended'});release();
  expect(await pending).toMatchObject({status:'failed',errorCode:'lease_lost'});
  expect([...d.storage.objects.keys()].filter(k=>k.startsWith('runs/'))).toEqual([]);
 });
 it('fixture response encodes its object',()=>expect(JSON.parse(EXTRACT_RESPONSE)).toEqual(EXTRACT_OBJECT));
});
