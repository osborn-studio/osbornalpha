import {expect,it,vi} from 'vitest';
import {runGoldEval} from './eval';
import {EXTRACT_RESPONSE} from './fixtures/pipeline';
import {runParse} from './parse';
import {LlmError,recordedLlmPort} from './ports/llm';
import {ADMIN_ID,DEADLINE,memoryBrokerDeps,seedDocument,seedLicence,syntheticPdf} from './testing';
import {EXTRACT_PROMPT_VERSION,SCHEMA_VERSION} from './versions';
import {withdrawDocument} from './withdraw';

const opts={by:ADMIN_ID,dryRun:false};
async function setup(count:number){
 const d=memoryBrokerDeps(),lic=await seedLicence(d.db),docs=[];
 await d.db.updateLicence(lic.licence_id,{terms_summary:'Updated synthetic terms'});await d.db.confirmLicence(lic.licence_id,ADMIN_ID,2);
 for(let i=0;i<count;i++){const doc=await seedDocument(d,lic.licence_id,syntheticPdf('gold-'+i));await runParse(d,doc.document_id,ADMIN_ID,{deadline:DEADLINE()});docs.push(doc);}
 const manifest=docs.map(({sha256})=>({sha256,fields:[],absent:[{target_key:null,field:'sector'}]}));
 return {d,docs,manifest};
}
it('stores each completed gold call as a registered write and pins provenance on both envelopes',async()=>{
 const {d,docs:[doc],manifest}=await setup(1),result=await runGoldEval(d,manifest,opts),pin=result.authorized[0],info=d.llm.info()!;
 const prefix='eval/'+doc.sha256+'/',paths=await d.storage.list(prefix),request=paths.find(p=>/\/[^/.]+\.request\.json$/.test(p))!;
 const runId=request.slice(prefix.length,-'.request.json'.length),base=prefix+runId;
 expect(paths).toHaveLength(4);
 for(const side of ['request','response']){
  const path=base+'.call-1.'+side+'.json',envelope=JSON.parse(d.storage.text(base+'.'+side+'.json')!);
  expect(await d.db.writesFor(doc.document_id)).toContainEqual(expect.objectContaining({path,writer:'eval',status:'done'}));
  expect(envelope).toMatchObject({run_id:runId,purpose:'eval-gold',sha256:doc.sha256,document_id:doc.document_id,
   parse_run_id:pin.parse_run_id,artifact_hash:pin.artifact_hash,licence_id:doc.licence_id,licence_version:2,extractor_version:pin.extractor_version,
   model_id:info.modelId,registry_hash:info.registryHash,prompt_version:EXTRACT_PROMPT_VERSION,schema_version:SCHEMA_VERSION,behavior_digest:result.behaviorDigest});
  expect(envelope.calls).toEqual([JSON.parse(d.storage.text(path)!)]);
 }
 expect((await d.db.listRuns(doc.document_id)).map(r=>r.kind)).toEqual(['parse']);
});
it('retains both documents’ calls and partial error envelopes without issuing a receipt and purges each document',async()=>{
 const {d,docs,manifest}=await setup(2),receipt=vi.spyOn(d.db,'insertEvalReceipt');
 d.llm=recordedLlmPort([EXTRACT_RESPONSE,'invalid',new LlmError('llm_quota','provider detail')]);
 await expect(runGoldEval(d,manifest,opts)).rejects.toMatchObject({code:'llm_quota'});expect(receipt).not.toHaveBeenCalled();
 for(const [i,doc] of docs.entries()){
  const prefix='eval/'+doc.sha256+'/',paths=await d.storage.list(prefix),count=i+1;expect(paths).toHaveLength(2+2*count);
  for(const side of ['request','response']){
   const path=paths.find(p=>!p.includes('.call-')&&p.endsWith('.'+side+'.json'))!,envelope=JSON.parse(d.storage.text(path)!);
   expect(envelope.error).toBe(i?'llm_quota':undefined);
   const calls=Array.from({length:count},(_,k)=>JSON.parse(d.storage.text(prefix+envelope.run_id+'.call-'+(k+1)+'.'+side+'.json')!));
   expect(envelope.calls).toEqual(calls);if(i&&side==='response')expect(calls[1]).toMatchObject({error:'llm_quota',error_detail:'provider detail'});
  }
  expect((await withdrawDocument(d,doc.document_id,{reason:'expired',purge:true},ADMIN_ID)).purge?.done).toBe(true);
  expect(await d.storage.list(prefix)).toEqual([]);
 }
});
it('preserves extraction failure and attempts the response envelope when the error request envelope fails',async()=>{
 const {d,docs:[doc],manifest}=await setup(1),upload=d.storage.upload;
 d.llm=recordedLlmPort([new LlmError('llm_quota')]);
 d.storage.upload=async(path,...rest)=>{if(path.startsWith('eval/')&&!path.includes('.call-')&&path.endsWith('.request.json'))throw new Error('storage unavailable');return upload(path,...rest);};
 await expect(runGoldEval(d,manifest,opts)).rejects.toMatchObject({code:'llm_quota'});
 const paths=await d.storage.list('eval/'+doc.sha256+'/');expect(paths.some(p=>!p.includes('.call-')&&p.endsWith('.response.json'))).toBe(true);
});
