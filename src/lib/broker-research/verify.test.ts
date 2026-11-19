// src/lib/broker-research/verify.test.ts
import {ADMIN_ID,DEADLINE} from './testing';
import {runParse} from './parse';
import {runExtract} from './extract/run';
import {pipelineExtraction} from './fixtures/pipeline';
import {withdrawDocument} from './withdraw';
import {createHash} from 'node:crypto';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryBrokerDeps,seedDocument,seedLicence,syntheticPdf} from './testing';
import {CRON_ACTOR,runVerify} from './verify';
import type {VerifyDeps} from './verify';
import type {BrokerResearchDb,DocumentRow,FieldRow} from './types';

const enc=(o:unknown)=>new TextEncoder().encode(JSON.stringify(o));
/** F3Artifact shape (C4): pages[{page,text}]; offsets are UTF-16 code units of text. */
const artifactOf=(text:string)=>enc({extractor_version:'f3/1',content_sha256:'a'.repeat(64),page_count:1,ocr_used:false,ocr_version:null,pages:[{page:1,text}]});
const doc=(id:string,last:string|null):DocumentRow=>({document_id:id,sha256:`sha-${id}`,storage_path:'',byte_size:1,page_count:1,licence_id:'L',uploaded_by:'u',uploaded_at:'',original_filename:'',current_parse_run_id:`pr-${id}`,status:'parsed',lease_token:null,lease_until:null,promotion_pending:false,last_verified_at:last,verify_status:null,withdrawn_at:null,withdrawn_reason:null,purged_at:null,purge_requested_at:null,purge_requested_by:null});
const field=(report:string,o:Partial<FieldRow>={}):FieldRow=>({field_id:`f-${report}`,report_id:report,parse_run_id:`pr-${report.slice(2)}`,run_id:'x',superseded_by_run_id:null,target_key:'T',field:'target_price',occurrence:1,page:1,char_start:6,char_end:11,value_source_text:'12.34',
 extractor:'llm:m@r',extractor_confidence:null,status:'confirmed',corrected:null,conflict_group:null,detail:{},reviewed_by:null,reviewed_at:null,created_at:'',value_text:'12.34',value_num:'12.34',value_currency:'CNY',value_unit:'price',value_date:null,...o});

let tables:ReturnType<typeof memoryTableClient>,docs:Map<string,DocumentRow>,db:BrokerResearchDb,artifacts:Record<string,Uint8Array|undefined>,hashes:Record<string,string>,clock:number;
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** tamper: the stored artifact is changed OUTSIDE the cited span after its hash was recorded (P-R1-13). */
async function setup(entries:{id:string;last:string|null;text?:string;fields?:Partial<FieldRow>[];throws?:boolean;tamper?:boolean}[]){
 tables=memoryTableClient({dq_freshness:['dataset']});docs=new Map();artifacts={};hashes={};clock=Date.parse('2026-11-06T02:00:00Z');
 const fieldsBy=new Map<string,FieldRow[]>();
 for(const e of entries){
  docs.set(e.id,doc(e.id,e.last));
  if(e.text!==undefined){const b=artifactOf(e.text);hashes[`a-${e.id}`]=sha(b);artifacts[`a-${e.id}`]=e.tamper?artifactOf(`${e.text} (edited later)`):b;}
  fieldsBy.set(`r-${e.id}`,(e.fields??[{}]).map(o=>field(`r-${e.id}`,o)));
 }
 const order=(d:DocumentRow)=>`${d.last_verified_at===null?'0':'1'}${d.last_verified_at??''}|${d.document_id}`;   // what verifyCandidates returns (A4: SQL order)
 db={
  verifyCandidates:vi.fn(async(limit:number)=>[...docs.values()].sort((a,b)=>order(a).localeCompare(order(b))).slice(0,limit)),
  unreconciledWrites:vi.fn(async()=>[]),
  reportByDocument:vi.fn(async(id:string)=>docs.has(id)?{report_id:`r-${id}`,document_id:id,status:'published',evidence_ok:true}:null),
  getDocument:vi.fn(async(id:string)=>docs.get(id)??null),
  listFields:vi.fn(async(r:string)=>{if(entries.find(e=>`r-${e.id}`===r)?.throws)throw new Error('boom');return fieldsBy.get(r)??[];}),
  getRun:vi.fn(async(id:string)=>({run_id:id,kind:'parse',status:'succeeded',artifact_path:`a-${id.slice(3)}`,artifact_hash:hashes[`a-${id.slice(3)}`]??null})),
  updateDocument:vi.fn(async(id:string,p:Partial<DocumentRow>)=>{docs.set(id,{...docs.get(id)!,...p});}),
  setReportFlags:vi.fn(async()=>{}),
  getReport:vi.fn(async(id:string)=>({report_id:id,evidence_ok:false})),
 } as unknown as BrokerResearchDb;
}
const deps=():VerifyDeps=>({db,tables,codeVersion:'c',now:()=>new Date(clock),storage:{download:vi.fn(async(p:string)=>artifacts[p]??null)} as unknown as VerifyDeps['storage']});
const deadline=()=>new Date(clock+250_000);

describe('candidates',()=>{
 beforeEach(()=>setup([{id:'b',last:'2026-11-05T00:00:00Z',text:'price 12.34 CNY'},{id:'a',last:null,text:'price 12.34 CNY'},{id:'c',last:'2026-11-01T00:00:00Z',text:'price 12.34 CNY'}]));
 it('takes db.verifyCandidates order (never-verified first, then oldest) with the candidate limit',async()=>{
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:false});
  expect(r.results.map(x=>x.documentId)).toEqual(['a','c','b']);
  expect(db.verifyCandidates).toHaveBeenCalledWith(500);
 });
});

describe('runVerify',()=>{
 it('under 10 seconds skips cleanup inventory and still verifies evidence (NEW-03)',async()=>{
  await setup([{id:'ok',last:null,text:'price 12.34 CNY'}]);
  const r=await runVerify(deps(),{deadline:new Date(clock+9_000),triggeredBy:'cron',recordFreshness:false});
  expect(db.unreconciledWrites).not.toHaveBeenCalled();expect(r.checked).toBe(1);
 });
 it('cleanup consumes its full quarter, leaving evidence its reserved budget (NEW-03)',async()=>{
  await setup([{id:'ok',last:null,text:'price 12.34 CNY'}]);const start=clock;
  vi.mocked(db.unreconciledWrites).mockImplementationOnce(async()=>{clock+=20_000;return [];});
  const r=await runVerify(deps(),{deadline:new Date(start+80_000),triggeredBy:'cron',recordFreshness:false});
  expect(clock).toBe(start+20_000);expect(r.checked).toBe(1);expect(clock).toBeLessThan(start+80_000);
 });

 it('ok / drift / unreadable each write last_verified_at and verify_status; drift and unreadable hide and quarantine',async()=>{
  await setup([{id:'ok',last:null,text:'price 12.34 CNY'},{id:'dr',last:null,text:'price 12.3 CNY'},{id:'un',last:null}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(Object.fromEntries(r.results.map(x=>[x.documentId,x.outcome]))).toEqual({ok:'ok',dr:'failed',un:'error'});
  for(const id of ['ok','dr','un'])expect(docs.get(id)!.last_verified_at).toBe('2026-11-06T02:00:00.000Z');
  expect(docs.get('dr')!.verify_status).toBe('failed');expect(docs.get('un')!.verify_status).toBe('error');
  expect(db.setReportFlags).toHaveBeenCalledWith('r-dr',{evidence_ok:false});expect(db.setReportFlags).toHaveBeenCalledWith('r-un',{evidence_ok:false});
  expect(db.setReportFlags).not.toHaveBeenCalledWith('r-ok',expect.anything());
  const q=tables.rows('dq_quarantine').map(x=>[x.natural_key,x.reason_code]).sort();
  expect(q).toEqual([['sha-dr:span_drift:T','span_drift'],['sha-un:artifact_unreadable:-','artifact_unreadable']]);
  expect(JSON.stringify(tables.rows('dq_quarantine').map(x=>[x.payload,x.detail]))).not.toContain('12.3');      // payload holds field names and pages only; exclude the whole-row timestamp because created_at uses the real clock
  const [batch]=tables.rows('ingest_batches');
  expect(batch).toMatchObject({producer:'broker-research-verify',status:'partial',counts:{fetched:3,inserted:1,quarantined:2,failed:0}});
  expect(tables.rows('dq_freshness')[0]).toMatchObject({dataset:'broker_research',expected_cadence:'daily',consecutive_errors:0});
  expect(r.freshness).toBe('fresh');
 });
 it('one throwing document still gets a timestamp and does not starve the next',async()=>{
  await setup([{id:'x',last:null,throws:true},{id:'y',last:'2026-11-01T00:00:00Z',text:'price 12.34 CNY'}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(docs.get('x')!.verify_status).toBe('error');expect(docs.get('y')!.verify_status).toBe('ok');
  expect(r.checked).toBe(2);expect(tables.rows('ingest_batches')[0].counts).toMatchObject({failed:1,inserted:1});
 });
 it('stops at the deadline with deadline_hit and leaves the rest for tomorrow',async()=>{
  await setup([{id:'a',last:null,text:'price 12.34 CNY'},{id:'b',last:'2026-11-01T00:00:00Z',text:'price 12.34 CNY'}]);
  const d=deps();(d.db.updateDocument as ReturnType<typeof vi.fn>).mockImplementation(async(id:string,p:Partial<DocumentRow>)=>{docs.set(id,{...docs.get(id)!,...p});clock+=300_000;});
  const r=await runVerify(d,{deadline:deadline(),triggeredBy:'cron',recordFreshness:true});
  expect(r.checked).toBe(1);expect(r.remaining).toBe(1);expect(docs.get('b')!.last_verified_at).toBe('2026-11-01T00:00:00Z');
  expect(tables.rows('ingest_batches')[0].errors).toEqual([{code:'deadline_hit'}]);expect(tables.rows('ingest_batches')[0].status).toBe('success');
 });
 it('manual single-document re-run restores evidence_ok and never records freshness',async()=>{
  await setup([{id:'a',last:null,text:'price 12.34 CNY'},{id:'b',last:null,text:'price 12.34 CNY'}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'manual',recordFreshness:false,documentId:'b',restore:true});
  expect(r.results.map(x=>x.documentId)).toEqual(['b']);expect(db.setReportFlags).toHaveBeenCalledWith('r-b',{evidence_ok:true});
  expect(tables.rows('dq_freshness')).toEqual([]);expect(r.freshness).toBeNull();
 });
 it('an artifact changed outside the cited span fails its recorded hash: error, hidden, quarantined, and a manual re-run does not restore (P-R1-13)',async()=>{
  await setup([{id:'t',last:null,text:'price 12.34 CNY',tamper:true}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'manual',recordFreshness:false,documentId:'t',restore:true});
  expect(r.results[0].outcome).toBe('error');
  expect(db.setReportFlags).toHaveBeenCalledWith('r-t',{evidence_ok:false});expect(db.setReportFlags).not.toHaveBeenCalledWith('r-t',{evidence_ok:true});
  expect(tables.rows('dq_quarantine').map(x=>x.reason_code)).toEqual(['artifact_unreadable']);
 });
 it('ignores candidate and absent rows',async()=>{
  await setup([{id:'a',last:null,text:'nothing here',fields:[{status:'extracted'},{status:'absent',page:1,char_start:null,char_end:null,value_source_text:null}]}]);
  const r=await runVerify(deps(),{deadline:deadline(),triggeredBy:'cron',recordFreshness:false});
  expect(r.results[0].outcome).toBe('ok');
 });
});
describe('withdrawal and port reconciliation regressions (P-R6-01/04)',()=>{
 let d:ReturnType<typeof memoryBrokerDeps>;
 beforeEach(()=>{d=memoryBrokerDeps();});
 const ready=async()=>{const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});await runExtract(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});return {doc};};
 it('withdraw purge:false preserves parse artifacts and model request/response objects through successive daily cron runs (P-R6-01)',async()=>{
  const {doc}=await ready();
  const paths=[...d.storage.objects.keys()];
  expect(paths.some(p=>p.includes('.extract.'))).toBe(true);
  expect(paths.some(p=>p.endsWith('.request.json'))).toBe(true);
  expect(paths.some(p=>p.endsWith('.response.json'))).toBe(true);
  const before=new Map(d.storage.objects);
  await withdrawDocument(d,doc.document_id,{reason:'retain evidence',purge:false},ADMIN_ID);
  for(let day=0;day<3;day++){d.advance(86_400_000);await runVerify(d,{deadline:new Date(d.now().getTime()+250_000),triggeredBy:'cron',recordFreshness:false});}
  expect(d.storage.objects).toEqual(before);
  expect(await d.db.unreconciledWrites(100)).toEqual([]);
  expect((await d.db.getDocument(doc.document_id))!.purge_requested_at).toBeNull();
 });
 it('all seven purge steps fail but atomic withdrawal intent survives (P-R6-01)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  vi.spyOn(d.db,'reportByDocument').mockResolvedValue({report_id:'forced-report'} as never);
  vi.spyOn(d.storage,'remove').mockRejectedValue(new Error('delete failed'));
  vi.spyOn(d.storage,'list').mockRejectedValue(new Error('list failed'));
  vi.spyOn(d.db,'listRuns').mockResolvedValue([{kind:'parse',run_id:'forced-run',request_path:'runs/forced.request.json',response_path:null}] as never);
  vi.spyOn(d.db,'purgeReportText').mockRejectedValue(new Error('text step failed'));
  await withdrawDocument(d,doc.document_id,{reason:'all fail',purge:true},ADMIN_ID);
  expect(await d.db.getDocument(doc.document_id)).toMatchObject({status:'withdrawn',withdrawn_reason:'all fail',withdrawn_at:expect.any(String),purge_requested_at:expect.any(String),purge_requested_by:ADMIN_ID});
  const steps=await d.db.purgeSteps(doc.document_id);expect(steps).toHaveLength(7);expect(steps.every(x=>x.status==='failed')).toBe(true);
 });
 it('purge reconciles done paths after deletion but leaves pending paths eligible (NEW-02)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  const ids:string[]=[];
  for(const complete of [true,false]){
   const path=`runs/${d.newId()}.response.json`;
   const id=await d.db.registerWrite({document_id:doc.document_id,path,writer:'extract'});ids.push(id);
   await d.storage.upload(path,'{}','application/json');if(complete)await d.db.finishWrite(id);
  }
  await withdrawDocument(d,doc.document_id,{reason:'purge',purge:true},ADMIN_ID);
  const rows=await d.db.writesFor(doc.document_id),done=rows.find(x=>x.write_id===ids[0])!,pending=rows.find(x=>x.write_id===ids[1])!;
  expect(done.status).toBe('reconciled');expect(Date.parse(done.deleted_at!)).toBeGreaterThanOrEqual(Date.parse(done.finished_at!));
  expect(pending).toMatchObject({status:'pending',finished_at:null,reconciled_at:null});
  for(const w of rows)expect(d.storage.objects.has(w.path)).toBe(false);
  expect((await d.db.unreconciledWrites(100)).map(x=>x.write_id)).toContain(pending.write_id);
 });
 it('purge intent survives lease_held before any deletion step (P-R6-01)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  await d.db.claimLease(doc.document_id,d.newId(),300);
  await withdrawDocument(d,doc.document_id,{reason:'purge',purge:true},ADMIN_ID);
  expect(await d.db.getDocument(doc.document_id)).toMatchObject({purge_requested_at:expect.any(String),purge_requested_by:ADMIN_ID});
  expect(await d.db.purgeSteps(doc.document_id)).toEqual([]);
 });
 it('withdrawal during PDF download prevents F3 invocation (P-R6-04)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  const download=d.storage.download.bind(d.storage);let called=false;
  d.storage.download=async p=>{const bytes=await download(p);await withdrawDocument(d,doc.document_id,{reason:'during download',purge:false},ADMIN_ID);return bytes;};
  d.f3={available:()=>true,extractDocument:async i=>{called=true;return pipelineExtraction(i.sha256);}};
  expect(await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()})).toMatchObject({status:'failed',errorCode:'document_withdrawn'});
  expect(called).toBe(false);
 });
 it('resolved F3 with post-fence failure: a late page survives purge only until reconciliation (P-R6-04)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);let prefix='';
  d.f3={available:()=>true,extractDocument:async i=>{
   prefix=i.pagesPrefix;
   // Deliberately release the lease before successful resolution; post-fence must retain pending.
   const held=(await d.db.getDocument(doc.document_id))!.lease_token!;
   await d.db.fencedUpdateDocument(doc.document_id,held,{releaseLease:true});
   return pipelineExtraction(i.sha256);
  }};
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect((await d.db.writesFor(doc.document_id)).find(w=>w.writer==='f3')).toMatchObject({status:'pending',finished_at:null});
  // Nonconforming fake writes after resolve, then explicit withdrawal + purge deletes it.
  await d.storage.upload(`${prefix}1.png`,new Uint8Array([1]),'image/png');
  await withdrawDocument(d,doc.document_id,{reason:'purge',purge:true},ADMIN_ID);
  // A still later arrival proves the pending prefix remains eligible after a completed purge.
  await d.storage.upload(`${prefix}2.png`,new Uint8Array([2]),'image/png');
  await runVerify(d,{deadline:new Date(d.now().getTime()+250_000),triggeredBy:'cron',recordFreshness:false});
  expect(d.storage.objects.has(`${prefix}1.png`)).toBe(false);expect(d.storage.objects.has(`${prefix}2.png`)).toBe(false);
  expect((await d.db.writesFor(doc.document_id)).find(w=>w.writer==='f3')).toMatchObject({status:'pending',finished_at:null});
 });
 it('F3 timeout leaves pending prefix; a late page after purge is deleted on the next daily run (P-R6-04)',async()=>{
  const doc=await seedDocument(d,(await seedLicence(d.db)).licence_id);let prefix='';
  d.f3={available:()=>true,extractDocument:async i=>{prefix=i.pagesPrefix;throw new Error('timeout');}};
  await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});
  expect((await d.db.pendingWritesFor(doc.document_id)).map(w=>w.writer)).toEqual(['f3']);
  await withdrawDocument(d,doc.document_id,{reason:'purge',purge:true},ADMIN_ID);
  await runVerify(d,{deadline:new Date(d.now().getTime()+250_000),triggeredBy:'cron',recordFreshness:false});
  await d.storage.upload(`${prefix}1.png`,new Uint8Array([1]),'image/png');d.advance(86_400_000);
  await runVerify(d,{deadline:new Date(d.now().getTime()+250_000),triggeredBy:'cron',recordFreshness:false});
  expect(d.storage.objects.has(`${prefix}1.png`)).toBe(false);
  expect((await d.db.unreconciledWrites(100)).map(w=>w.writer)).toEqual(['f3']);
 });
});
describe('purge-intent reconciliation (P-R6-01..03)',()=>{
 const deadline=(d:{now:()=>Date})=>new Date(d.now().getTime()+250_000);
 const sweep=(d:ReturnType<typeof memoryBrokerDeps>)=>runVerify(d,{deadline:deadline(d),triggeredBy:'cron',recordFreshness:false});
 async function fixture(){
  const d=memoryBrokerDeps();const x=await seedDocument(d,(await seedLicence(d.db)).licence_id);
  const path=`runs/${d.newId()}.request.json`;
  const id=await d.db.registerWrite({document_id:x.document_id,path,writer:'extract'});
  await d.db.updateDocument(x.document_id,{status:'withdrawn',withdrawn_at:d.now().toISOString(),withdrawn_reason:'test',purge_requested_at:d.now().toISOString(),purge_requested_by:CRON_ACTOR});
  return {d,x,path,id};
 }
 it('uncertain forever: late writes after previous sweeps and worker termination remain swept; only confirmed completion drains',async()=>{
  const {d,x,path,id}=await fixture();
  for(let day=0;day<35;day++){
   d.advance(86_400_000);await d.storage.upload(path,'{}','application/json');
   expect((await sweep(d)).writesReconciled).toBe(0);
   expect(d.storage.objects.has(path)).toBe(false);
   expect((await d.db.unreconciledWrites(10)).map(w=>w.write_id)).toContain(id);
  }
  await d.db.finishWrite(id); // positive completion, not elapsed time
  expect((await sweep(d)).writesReconciled).toBe(1);
  expect(await d.db.unreconciledWrites(10)).toEqual([]);
  expect((await d.db.writesFor(x.document_id))[0]).toMatchObject({status:'reconciled',deleted_at:expect.any(String)});
 });
 it('persistent hanging storage failures across invocations back off; later rows AND evidence verification progress',async()=>{
  vi.useFakeTimers();
  try{
   const {d,x,path,id}=await fixture();
   const exists=d.storage.exists.bind(d.storage);
   d.storage.exists=async p=>p===path?new Promise<boolean>(()=>{}):exists(p);
   const evidence=vi.spyOn(d.db,'verifyCandidates');
   // A visible candidate proves the evidence loop executes, even while cleanup repeatedly hangs.
   const healthy=await seedDocument(d,(await seedLicence(d.db)).licence_id,syntheticPdf('healthy'));
   evidence.mockResolvedValue([healthy]);
   vi.spyOn(d.db,'reportByDocument').mockResolvedValue({report_id:'evidence',status:'published'} as never);
   const checked=vi.spyOn(d.db,'updateDocument');
   for(let day=0;day<3;day++){
    const later=`runs/${d.newId()}.response.json`;
    const done=await d.db.registerWrite({document_id:x.document_id,path:later,writer:'extract'});await d.db.finishWrite(done);
    await d.storage.upload(later,'{}','application/json');
    const running=sweep(d);await vi.advanceTimersByTimeAsync(6_000);await running;
    expect(d.storage.objects.has(later)).toBe(false);
    expect(checked).toHaveBeenCalledWith(healthy.document_id,expect.objectContaining({last_verified_at:expect.any(String)}));
    const row=(await d.db.writesFor(x.document_id)).find(w=>w.write_id===id)!;
    expect(row.attempts).toBe(day+1);expect(Date.parse(row.next_attempt_at)).toBeGreaterThan(d.now().getTime());
    expect(row.status).toBe('pending');d.advance(86_400_000);
   }
  }finally{vi.useRealTimers();}
 });
});
