import {expect,it,vi} from 'vitest';
import {EXTRACT_RESPONSE,pipelineExtraction} from '../fixtures/pipeline';
import {fakeF3Port} from '../ports/f3';
import {LlmError,recordedLlmPort} from '../ports/llm';
import {brokerPaths} from '../storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedParsed,seedLicence} from '../testing';
import {withdrawDocument} from '../withdraw';
import {runExtract} from './run';

async function setup(llm=recordedLlmPort(()=>EXTRACT_RESPONSE)){
 const f3=fakeF3Port(i=>({...pipelineExtraction(i.sha256),page_count:9,pages:Array.from({length:9},(_,i)=>({page:i+1,text:'sample'}))}));
 const d=memoryBrokerDeps({llm,f3}),id=(await seedParsed(d,(await seedLicence(d.db)).licence_id)).document_id;
 return {d,llm,id,run:()=>runExtract(d,id,ADMIN_ID,{deadline:DEADLINE()})};
}
const path=(id:string,seq:number,kind:string)=>`runs/${id}.call-${seq}.${kind}.json`;
it('persists and registers every call including a provider error, then purges them',async()=>{
 const {d,id,run}=await setup(recordedLlmPort([EXTRACT_RESPONSE,new LlmError('llm_quota','provider detail')]));
 const r=await run();expect(r.errorCode).toBe('llm_quota');const writes=await d.db.writesFor(id);
 for(const seq of [1,2])for(const kind of ['request','response']){
  const p=path(r.runId,seq,kind);expect(d.storage.objects.has(p)).toBe(true);
  expect(writes).toContainEqual(expect.objectContaining({path:p,status:'done',writer:'extract'}));
  expect(JSON.parse(d.storage.text(p)!)).toMatchObject({chunk:seq-1,attempt:1});
 }
 expect(JSON.parse(d.storage.text(path(r.runId,2,'response'))!)).toMatchObject({content:null,error:'llm_quota',error_detail:'provider detail'});
 expect((await withdrawDocument(d,id,{reason:'expired',purge:true},ADMIN_ID)).purge?.done).toBe(true);
 expect([...d.storage.objects.keys()].filter(p=>p.startsWith('runs/')&&p.includes('.call-'))).toEqual([]);
});
it('has the first exchange and second request on disk while the second call is pending',async()=>{
 const {d,id,llm,run}=await setup(),complete=llm.complete;let entered!:()=>void,release!:()=>void;
 const second=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
 llm.complete=async req=>{if(llm.calls.length===1){entered();await gate;}return complete(req);};
 const pending=run();await second;
 try{const runId=(await d.db.listRuns(id)).find(r=>r.kind==='extract')!.run_id;
  for(const [seq,kind] of [[1,'request'],[1,'response'],[2,'request']] as const)expect(d.storage.objects.has(path(runId,seq,kind))).toBe(true);
  expect(d.storage.objects.has(path(runId,2,'response'))).toBe(false);
 }finally{release();await pending;}
});
it('refuses dispatch if the request record cannot be stored',async()=>{
 const {d,llm,run}=await setup();d.storage.failNext('upload');
 const r=await run();expect(llm.calls).toHaveLength(0);expect(r).toMatchObject({status:'failed',errorCode:'storage_failed'});
});
it.each([false,true])('retries only the failed response envelope, including a lost acknowledgement (%s)',async landed=>{
 const {d,run}=await setup(),upload=d.storage.upload;let attempts=0;
 const spy=vi.spyOn(d.storage,'upload').mockImplementation(async(...args)=>{
  if(args[0].endsWith('.response.json')&&!args[0].includes('.call-')&&++attempts===1){if(landed)await upload(...args);throw new Error('storage unavailable');}
  return upload(...args);
 });
 const r=await run();expect(r.status).toBe('succeeded');expect(attempts).toBe(2);
 expect(spy.mock.calls.filter(([p])=>p===brokerPaths.request(r.runId))).toHaveLength(1);
 for(const p of [brokerPaths.request(r.runId),brokerPaths.response(r.runId)])expect(d.storage.objects.has(p)).toBe(true);
});
it.each(['request','response'] as const)('records the missing %s envelope after both attempts fail',async kind=>{
 const {d,run}=await setup(),upload=d.storage.upload;let attempts=0;
 d.storage.upload=async(...args)=>{if(args[0].endsWith(`.${kind}.json`)&&!args[0].includes('.call-')){attempts++;throw new Error('storage unavailable');}return upload(...args);};
 const r=await run();expect(r.errorCode).toBe('storage_failed');expect(attempts).toBe(2);
 expect(await d.db.getRun(r.runId)).toMatchObject({status:'failed',detail:{error_code:'storage_failed',envelopes:{request:kind!=='request',response:kind!=='response'}}});
});
it('keeps a bounded unexpected provider message private',async()=>{
 const detail='private provider trace '.repeat(40),{d,run}=await setup(recordedLlmPort(()=>{throw new Error(detail);}));
 const r=await run();expect(r.errorCode).toBe('llm_failed');expect(JSON.stringify(r)).not.toContain('private provider trace');
 expect(d.storage.text(path(r.runId,1,'response'))).toBeDefined();
 expect(JSON.parse(d.storage.text(path(r.runId,1,'response'))!).error_detail).toBe(detail.slice(0,500));
});
it('rechecks the licence before dispatch when it changes during request storage',async()=>{
 const {d,id,llm,run}=await setup(),doc=(await d.db.getDocument(id))!,upload=d.storage.upload;
 d.storage.upload=async(...args)=>{const result=await upload(...args);if(args[0].endsWith('.call-1.request.json'))await d.db.updateLicence(doc.licence_id,{allows_llm_processing:false});return result;};
 const r=await run();expect(r.errorCode).toBe('licence_forbids_processing');expect(llm.calls).toHaveLength(0);
});
it('stops dispatch if request storage consumes the remaining call budget',async()=>{
 const {d,llm,run}=await setup(),upload=d.storage.upload;
 d.storage.upload=async(...args)=>{const result=await upload(...args);if(args[0].endsWith('.call-1.request.json'))d.advance(260_000);return result;};
 const r=await run();expect(r.errorCode).toBe('extract_deadline');expect(llm.calls).toHaveLength(0);
});
