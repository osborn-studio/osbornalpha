import {expect,it,vi} from 'vitest';
import {runExtract} from '../extract/run';
import {SUMMARY_RESPONSE} from '../fixtures/pipeline';
import {LlmError,recordedLlmPort} from '../ports/llm';
import {brokerPaths} from '../storage';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedLicence,seedParsed} from '../testing';
import {runSummary,translateTitle} from './run';

const opts={deadline:DEADLINE()};
async function ready(){
 const d=memoryBrokerDeps(),doc=await seedParsed(d,(await seedLicence(d.db)).licence_id);
 const {reportId}=await runExtract(d,doc.document_id,ADMIN_ID,opts);
 return {d,doc,reportId};
}
it('stores the summary request while dispatch is still pending',async()=>{
 const {d,doc,reportId}=await ready(),llm=recordedLlmPort([SUMMARY_RESPONSE]);
 let started!:()=>void,release!:()=>void;
 const dispatched=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 d.llm={info:llm.info,complete:async req=>{started();await gate;return llm.complete(req);}};
 const pending=runSummary(d,reportId,'zh',ADMIN_ID,opts);await dispatched;
 try{const run=(await d.db.listRuns(doc.document_id)).find(r=>r.kind==='summary')!;
  expect(await d.storage.exists(brokerPaths.request(run.run_id))).toBe(true);
  expect(await d.storage.exists(brokerPaths.response(run.run_id))).toBe(false);
 }finally{release();await pending;}
});
it('stores the title request and private provider error while preserving the quota status',async()=>{
 const {d,doc,reportId}=await ready(),llm=recordedLlmPort([new LlmError('llm_quota','private provider message')]);d.llm=llm;
 await expect(translateTitle(d,reportId,ADMIN_ID,opts)).rejects.toMatchObject({code:'llm_quota',status:429});
 const run=(await d.db.listRuns(doc.document_id)).find(r=>r.kind==='translate')!;
 expect(run).toMatchObject({status:'failed',detail:{error_code:'llm_quota'}});
 expect(await d.storage.exists(brokerPaths.request(run.run_id))).toBe(true);
 expect(JSON.parse(d.storage.text(brokerPaths.response(run.run_id))!)).toEqual({run_id:run.run_id,calls:[{content:null,model_id:llm.info()!.modelId,error:'llm_quota',error_detail:'private provider message'}]});
});
it('keeps the provider error when storing its response fails',async()=>{
 const {d,reportId}=await ready();d.llm=recordedLlmPort([new LlmError('llm_quota')]);
 const upload=d.storage.upload,responseWrite=vi.fn();
 vi.spyOn(d.storage,'upload').mockImplementation(async(...args)=>{if(args[0].endsWith('.response.json')){responseWrite();throw new Error('unavailable');}return upload(...args);});
 await expect(runSummary(d,reportId,'en',ADMIN_ID,opts)).rejects.toMatchObject({code:'llm_quota',status:429});
 expect(responseWrite).toHaveBeenCalledOnce();
});
it('blocks dispatch when the request write loses its lease',async()=>{
 const {d,reportId}=await ready(),llm=recordedLlmPort([SUMMARY_RESPONSE]);d.llm=llm;
 vi.spyOn(d.db,'renewLease').mockResolvedValueOnce('lease_lost');
 await expect(runSummary(d,reportId,'zh',ADMIN_ID,opts)).rejects.toMatchObject({code:'lease_lost',status:409});
 expect(llm.calls).toHaveLength(0);
});
