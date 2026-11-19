import {expect,it} from 'vitest';
import type {LlmDeps} from './explain-request';
import {runValidatedExplanation,type ValidatedRunStore,type ValidatedRunSubject} from './validated-run';

function fixture(mode:'accepted'|'rejected'|'error'|'prior'|'quota'){
 const calls:string[]=[];
 const store:ValidatedRunStore<string>={
  replay:async(_actor,_id,hash)=>{calls.push('replay');return mode!=='prior'?{kind:'none'}:
   hash==='same'?{kind:'replay',response:{stored:true}}:{kind:'conflict'};},
  claim:async()=>{calls.push('claim');return 'claim-id';},auditKey:()=> 'audit-key',
  recordCompletion:async()=>{calls.push('record');},
  finish:async(_claim,r)=>{calls.push('finish:'+r.state);return {state:r.state,codes:r.failureCodes};},
  markFinalized:async()=>{calls.push('mark');},
 };
 const llm:LlmDeps={
  resolve:async()=>{calls.push('resolve');return {provider:'p',model:'m',byo:false};},
  checkQuota:async()=>{calls.push('quota');return {allowed:mode!=='quota',used:1,limit:1};},
  begin:async()=>{calls.push('begin');},call:async()=>{calls.push('call');if(mode==='error')throw Error('offline');return {content:'{}',accounting:{}};},
  finalizePayload:status=>({status}),finalize:async(_key,payload)=>{calls.push('finalize:'+payload.status);},
 };
 const subject:ValidatedRunSubject={system:'system',user:'user',usageMeta:{},
  validate:raw=>{calls.push('validate');expect(raw).toEqual({});return mode==='rejected'?{ok:false,codes:['schema'],failures:[]}:{ok:true,output:raw};},
  render:output=>{calls.push('render');return output;},
 };
 return {calls,run:(payloadHash='same')=>runValidatedExplanation({store,llm,now:()=>new Date()},{actor:'actor',requestId:'id',payloadHash,subject})};
}
it.each(['accepted','rejected','error'] as const)('finishes and settles %s in order',async mode=>{
 const f=fixture(mode),state=mode==='error'?'failed':mode;
 expect(await f.run()).toEqual({status:200,body:{state,codes:mode==='error'?['provider_error']:mode==='rejected'?['schema']:[]}});
 expect(f.calls).toEqual(['replay','resolve','quota','claim','begin','call','record',...(mode==='error'?[]:['validate']),
  ...(mode==='accepted'?['render']:[]),'finish:'+state,'finalize:'+(mode==='error'?'failed':'completed'),'mark']);
});
it('replays a matching request and rejects a conflicting payload before resolving the model',async()=>{
 const f=fixture('prior');
 expect(await f.run()).toEqual({status:200,body:{stored:true}});
 expect(await f.run('different')).toMatchObject({status:409,body:{error:{code:'payload_conflict'}}});
 expect(f.calls).toEqual(['replay','replay']);
});
it('checks quota before claiming',async()=>{
 const f=fixture('quota');
 expect(await f.run()).toMatchObject({status:429,body:{error:{code:'quota_exceeded'}}});
 expect(f.calls).toEqual(['replay','resolve','quota']);
});
