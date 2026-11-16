// src/lib/macro/strategy/explain-request.test.ts
import {describe,expect,it,vi} from 'vitest';
import * as render from './explain-render';
import {canonicalJson,sha256Hex} from './hash';
import type {ExplanationProjection} from './contract';
import {memoryStrategyDb} from './db';
import {handleExplainRequest,LlmCallError,modelInput,promptText,recoverUserExplanations,type ExplainDeps,type LlmDeps} from './explain-request';
import {buildSnapshotFactsManifest} from './facts';
import {memoryStrategyPort} from './port';
import {runReview} from './review';
import {daily,fixture,monthly,snap} from './testing/fixture';

vi.mock('./explain-render',async orig=>{const m=await orig<typeof import('./explain-render')>();return {...m,renderFacts:vi.fn(m.renderFacts)};});

const USER='11111111-1111-4111-8111-111111111111';
const REQ='22222222-2222-4222-8222-222222222222';
const ROWS=[...monthly('US_CPI_YOY','2026-08',['2.7','2.9']),...monthly('US_UNRATE','2026-09',['4.3'])];
const SNAP=snap('US','2026-10-15T06:00:00Z',ROWS.map(o=>o.observation_id));
const EVENTS=[...daily('US_FED_TARGET_UPPER_D',[['2025-12-11','3.75'],['2026-09-18','4']]),...daily('US_FED_TARGET_LOWER_D',[['2025-12-11','3.5'],['2026-09-18','3.75']])];
const port=()=>memoryStrategyPort(fixture({snapshots:[SNAP],observations:[...ROWS,...EVENTS]}));
const VALID=JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY','chg:US_CPI_YOY'],hypothesis:'通胀读数抬升可能通过实际利率渠道影响美元资产的相对吸引力'}],counterpoints:[{fact_ids:['evt:2026-09-18'],text:'若政策调整已被提前定价，该渠道的作用可能有限'}]});
const body=(o:Partial<{request_id:string;subject:{kind:'snapshot'|'review';id:string};locale:'zh'|'en'}>={})=>({request_id:REQ,subject:{kind:'snapshot' as const,id:SNAP.snapshot_id},locale:'zh' as const,...o});

/** Fake LlmDeps. finalizePayload returns {status, accounting, pricing}; `pricing` stands for the config read at completion
 *  (pricing version, FX), so tests can change it afterwards and check that retries use the stored payload verbatim. */
function fakeLlm(o:{byo?:boolean;resolveNull?:boolean;quota?:{allowed:boolean;used:number;limit:number}|null;content?:string;callError?:Error;beginError?:Error;finalizeError?:Error}={}){
 const calls:string[]=[];const finalized:Record<string,unknown>[]=[];const prompts:{system:string;user:string}[]=[];
 const state={pricing:'p1',finalizeError:o.finalizeError};
 const llm:LlmDeps={
  resolve:async()=>{calls.push('resolve');return o.resolveNull?null:{provider:'deepseek',model:'deepseek-chat',byo:o.byo??false};},
  checkQuota:async()=>{calls.push('checkQuota');return o.quota===undefined?{allowed:true,used:1,limit:10}:o.quota;},
  begin:async(key)=>{calls.push(`begin:${key}`);if(o.beginError)throw o.beginError;},
  call:async(system,user)=>{calls.push('call');prompts.push({system,user});if(o.callError)throw o.callError;return {content:o.content??VALID,accounting:{tokens:42}};},
  finalizePayload:(status,accounting)=>({status,accounting,pricing:state.pricing}),
  finalize:async(_key,payload)=>{calls.push(`finalize:${String(payload.status)}`);finalized.push(payload);if(state.finalizeError)throw state.finalizeError;},
 };
 return {llm,calls,finalized,prompts,state};
}
function deps(over:Partial<ExplainDeps>={}):ExplainDeps&{db:ReturnType<typeof memoryStrategyDb>}{
 return {db:memoryStrategyDb(),port:port(),llm:fakeLlm().llm,now:()=>new Date('2026-11-03T00:00:00Z'),codeVersion:'test-code',...over} as ExplainDeps&{db:ReturnType<typeof memoryStrategyDb>};
}
const projection=(r:{body:unknown})=>r.body as ExplanationProjection;
const PAY=(status:'completed'|'failed',accounting:unknown[])=>({status,accounting,pricing:'p1'});

describe('handleExplainRequest — happy path (spec §6.3 steps 1–8)',()=>{
 it('accepted: resolve → quota → claim → begin → call → finish → finalize(completed) → markFinalized',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  const p=projection(r);
  expect(p).toMatchObject({state:'accepted',subject_kind:'snapshot',subject_id:SNAP.snapshot_id,locale:'zh',failure_codes:[],provider:'deepseek',model:'deepseek-chat',prompt_version:'macro-explain-prompt/1',validator_version:'macro-explain-validator/1'});
  expect(p.rendered?.facts.map(x=>x.fact_id)).toEqual(['obs:US_CPI_YOY','chg:US_CPI_YOY','evt:2026-09-18']);
  expect(p.rendered?.facts[0].text).toContain('2.9%');
  expect(p.rendered?.hypotheses[0].text).toContain('实际利率');
  expect(f.calls).toEqual(['resolve','checkQuota',`begin:${p.explanation_id}`,'call','finalize:completed']);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(mark).toHaveBeenCalledWith(p.explanation_id);
  expect(d.db._run(p.explanation_id)).toMatchObject({state:'accepted',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
  expect(f.prompts[0].system).toBe(promptText('zh'));
  expect(f.prompts[0].user).toContain('"fact_id":"obs:US_CPI_YOY"');
  expect(f.prompts[0].user).toContain('2.9%');
  expect(p.manifest_id).toMatch(/\S/);
  expect((await d.db.manifest(p.manifest_id))?.body.kind).toBe('explain_facts');
 });
 it('review subject: the immutable result id; facts come from that result and are frozen in the fact manifest',async()=>{
  const d=deps();
  const rr=await runReview({port:d.port!,db:d.db,codeVersion:'c'},'US','2026-10',{preview:false});
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]})});
  const r=await handleExplainRequest({...d,llm:f.llm},USER,body({subject:{kind:'review',id:rr.result_id!}}));
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({state:'accepted',subject_kind:'review',subject_id:rr.result_id});
  const result=(await d.db.reviewResult(rr.result_id!))!;
  const m=(await d.db.manifest(projection(r).manifest_id))!.body;
  expect(m).toMatchObject({kind:'explain_facts',params:{subject_kind:'review',result_id:result.result_id,review_manifest_id:result.manifest_id}});
  expect(m.facts?.map(x=>x.fact_id)).toContain('cov:counts');
 });
 it('a review explanation stays bound to its result after the pointer advances',async()=>{
  const d=deps();
  const first=await runReview({port:d.port!,db:d.db,codeVersion:'c'},'US','2026-10',{preview:false});
  const content=JSON.stringify({points:[{fact_ids:['cov:counts'],hypothesis:'覆盖不全可能削弱该月读数的代表性'}]});
  const r1=await handleExplainRequest({...d,llm:fakeLlm({content}).llm},USER,body({subject:{kind:'review',id:first.result_id!}}));
  const second=await runReview({port:d.port!,db:d.db,codeVersion:'c2'},'US','2026-10',{preview:false});   // new code version → new result, pointer moves
  expect(second).toMatchObject({outcome:'advanced',generation:2});expect(second.result_id).not.toBe(first.result_id);
  d.db._userId(USER);
  expect((await d.db.explanationsOf('session','review',second.result_id!,20))).toEqual([]);
  expect((await d.db.explanationsOf('session','review',first.result_id!,20)).map(p=>p.explanation_id)).toEqual([projection(r1).explanation_id]);
  const r2=await handleExplainRequest({...d,llm:fakeLlm({content}).llm},USER,body({request_id:'33333333-3333-4333-8333-333333333333',subject:{kind:'review',id:first.result_id!}}));
  expect(projection(r2)).toMatchObject({state:'accepted',subject_id:first.result_id});   // the older result can still be explained
 });
 it('the model input is rebuilt offline from the stored fact manifest alone',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const p=projection(await handleExplainRequest(d,USER,body()));
  const stored=(await d.db.manifest(p.manifest_id))!;
  const offline=JSON.parse(JSON.stringify(stored.body));                       // no port, no db, no live catalog
  expect(modelInput(offline,'zh')).toEqual(f.prompts[0]);
 });
});

describe('ordering and idempotency (spec §6.3 step 2, §9.1)',()=>{
 it('replay runs before the foundation and subject checks: same request with port=null returns the stored projection',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const first=projection(await handleExplainRequest(d,USER,body()));
  const again=await handleExplainRequest({...d,port:null},USER,body());
  expect(again.status).toBe(200);
  expect(projection(again)).toEqual(first);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('replay needs no code version: a stored request answers even when the code version is unavailable',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  const first=projection(await handleExplainRequest(d,USER,body()));
  const again=await handleExplainRequest({...d,codeVersion:null},USER,body());
  expect(again).toEqual({status:200,body:first});
  expect(await handleExplainRequest({...d,codeVersion:null},USER,body({request_id:'44444444-4444-4444-8444-444444444444'}))).toEqual({status:503,body:{error:{code:'code_version_unavailable',message:'code_version_unavailable'}}});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('same request id with another payload → 409 payload_conflict, no model call',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  await handleExplainRequest(d,USER,body());
  const r=await handleExplainRequest(d,USER,body({locale:'en'}));
  expect(r).toEqual({status:409,body:{error:{code:'payload_conflict',message:'payload_conflict'}}});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('a concurrent claim loser stops at the claim: no begin, no call',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'runOf').mockResolvedValue(null);   // both requests passed step 2 before either claimed
  const payloadHash=sha256Hex(canonicalJson({subject:body().subject,locale:'zh'}));
  const facts=await d.db.putManifest((await buildSnapshotFactsManifest(d.port!,SNAP.snapshot_id,'test-code'))!);
  const winner=await d.db.claimExplanation({userId:USER,requestId:REQ,payloadHash,subjectKind:'snapshot',subjectId:SNAP.snapshot_id,locale:'zh',manifestId:facts.manifest_id});
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({explanation_id:winner.explanation_id,state:'running'});
  expect(f.calls).toEqual(['resolve','checkQuota']);
 });
});

describe('quota and model configuration (spec §6.3 step 4, N8)',()=>{
 it('non-BYO over quota → 429 quota_exceeded, nothing claimed',async()=>{
  const f=fakeLlm({quota:{allowed:false,used:10,limit:10}});const d=deps({llm:f.llm});
  const r=await handleExplainRequest(d,USER,body());
  expect(r).toEqual({status:429,body:{error:{code:'quota_exceeded',message:'10/10'}}});
  expect(await d.db.runOf(USER,REQ)).toBeNull();
  expect(f.calls).toEqual(['resolve','checkQuota']);
 });
 it('limit -1 is unlimited; a failed quota read (null) fails open',async()=>{
  expect((await handleExplainRequest(deps({llm:fakeLlm({quota:{allowed:false,used:99,limit:-1}}).llm}),USER,body())).status).toBe(200);
  expect((await handleExplainRequest(deps({llm:fakeLlm({quota:null}).llm}),USER,body())).status).toBe(200);
 });
 it('BYO skips the feature quota',async()=>{
  const f=fakeLlm({byo:true,quota:{allowed:false,used:10,limit:10}});
  const r=await handleExplainRequest(deps({llm:f.llm}),USER,body());
  expect(projection(r).state).toBe('accepted');
  expect(f.calls).not.toContain('checkQuota');
 });
 it('no model configured → 503 llm_not_configured',async()=>{
  expect((await handleExplainRequest(deps({llm:fakeLlm({resolveNull:true}).llm}),USER,body())).body).toEqual({error:{code:'llm_not_configured',message:'llm_not_configured'}});
 });
});

describe('outcomes after the claim (spec §6.3 steps 6–8)',()=>{
 it('model text with a numeral → rejected, still finalized as a completed call',async()=>{
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'三成的影响'}]})});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(projection(r)).toMatchObject({state:'rejected',failure_codes:['numeral'],rendered:null});
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(mark).toHaveBeenCalledTimes(1);
 });
 it('unparseable model output → rejected(parse), completed call',async()=>{
  const f=fakeLlm({content:'not json'});
  expect(projection(await handleExplainRequest(deps({llm:f.llm}),USER,body()))).toMatchObject({state:'rejected',failure_codes:['parse']});
  expect(f.finalized[0].status).toBe('completed');
 });
 it('provider error → failed(provider_error) and finalize(failed) with the error accounting, then markFinalized',async()=>{
  const f=fakeLlm({callError:new LlmCallError('timeout',{tokens:7})});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r)).toMatchObject({state:'failed',failure_codes:['provider_error']});
  expect(f.finalized).toEqual([PAY('failed',[{tokens:7}])]);
  expect(mark).toHaveBeenCalledTimes(1);
  expect(d.db._run(projection(r).explanation_id)).toMatchObject({raw_output:null,finalize_payload:PAY('failed',[{tokens:7}]),finalized:true});
 });
 it('a cost error from the call keeps its code',async()=>{
  const f=fakeLlm({callError:new Error('daily_cost_exhausted')});
  expect(projection(await handleExplainRequest(deps({llm:f.llm}),USER,body())).failure_codes).toEqual(['daily_cost_exhausted']);
  expect(f.finalized).toEqual([PAY('failed',[])]);
 });
 it('begin failure is ambiguous: failed payload recorded under the same audit key, finalize(failed) attempted, then markFinalized',async()=>{
  const f=fakeLlm({beginError:new Error('boom')});const d=deps({llm:f.llm});
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(503);
  expect(r.body).toMatchObject({error:{code:'usage_audit_unavailable'},explanation:{state:'failed',failure_codes:['usage_audit_unavailable']}});
  const id=(r.body as {explanation:ExplanationProjection}).explanation.explanation_id;
  expect(f.calls).toEqual(['resolve','checkQuota',`begin:${id}`,'finalize:failed']);
  expect(d.db._run(id)).toMatchObject({state:'failed',finalize_payload:PAY('failed',[]),finalized:true});
 });
 it('begin failure + finalize failure (the usage run never committed): not finalized, payload kept for reconciliation',async()=>{
  const f=fakeLlm({beginError:new Error('boom'),finalizeError:new Error('usage run not found')});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  const id=(r.body as {explanation:ExplanationProjection}).explanation.explanation_id;
  expect(r.status).toBe(503);expect(mark).not.toHaveBeenCalled();
  expect(d.db._run(id)).toMatchObject({finalize_payload:PAY('failed',[]),finalized:false});
 });
 it('finalize failure leaves the response intact; the stored payload is retried verbatim later, even after a config change',async()=>{
  const f=fakeLlm({finalizeError:new Error('usage_audit_unavailable')});const d=deps({llm:f.llm});const mark=vi.spyOn(d.db,'markFinalized');
  const r=await handleExplainRequest(d,USER,body());
  expect(r.status).toBe(200);
  expect(projection(r).state).toBe('accepted');
  expect(mark).not.toHaveBeenCalled();
  const id=projection(r).explanation_id;
  expect(d.db._run(id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  // ops retry (runbook §4): pricing config changed meanwhile; the stored payload is replayed as is
  f.state.pricing='p2';f.state.finalizeError=undefined;
  await f.llm.finalize(`${id}`,d.db._run(id)!.finalize_payload!);await d.db.markFinalized(id);
  expect(f.finalized.at(-1)).toEqual(PAY('completed',[{tokens:42}]));
  expect(d.db._run(id)?.finalized).toBe(true);
 });
});

describe('injected failures after the provider returned (spec §4.4 macro_record_completion)',()=>{
 it('finish fails: raw output + payload were recorded first, finalize still runs, markFinalized follows, the error surfaces',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});const order:string[]=[];
  const rec=d.db.recordCompletion.bind(d.db);vi.spyOn(d.db,'recordCompletion').mockImplementation(async a=>{order.push('record');return rec(a);});
  vi.spyOn(d.db,'finishExplanation').mockImplementation(async()=>{order.push('finish');throw new Error('connection reset');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  expect(order).toEqual(['record','finish']);
  expect(f.calls.at(-1)).toBe('finalize:completed');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
 });
 it('finish and finalize both fail: the run keeps raw output and payload with finalized=false for the ops retry',async()=>{
  const f=fakeLlm({finalizeError:new Error('down')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValue(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID},finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
 });
 it('a throw inside validate / finish: finalize still runs with the recorded payload',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockImplementationOnce(()=>{throw new TypeError('render bug');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('render bug');
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
 });
 it('recordCompletion failure does not stop finish or finalize; finish stores the same payload, so the run is marked finalized',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'recordCompletion').mockRejectedValue(new Error('db down'));
  const r=await handleExplainRequest(d,USER,body());
  expect(projection(r).state).toBe('accepted');
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(projection(r).explanation_id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:true});
 });
});

describe('completion recovery without the provider (plan audit R2-1 / R2-2)',()=>{
 it('finish failure → replay POST → accepted from the recorded output, exactly one provider call, no second finalize',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',raw_output:{content:VALID,validator_version:'macro-explain-validator/1',prompt_version:'macro-explain-prompt/1',provider:'deepseek',model:'deepseek-chat',accounting:{tokens:42}}});
  const again=await handleExplainRequest({...d,port:null,codeVersion:null},USER,body());   // a replay needs neither
  expect(again.status).toBe(200);
  expect(projection(again)).toMatchObject({explanation_id:run.explanation_id,state:'accepted',provider:'deepseek',model:'deepseek-chat',validator_version:'macro-explain-validator/1'});
  expect(projection(again).rendered?.facts.map(x=>x.fact_id)).toEqual(['obs:US_CPI_YOY','chg:US_CPI_YOY','evt:2026-09-18']);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
  expect(f.calls.filter(c=>c.startsWith('finalize'))).toEqual(['finalize:completed']);   // settled during the first request already
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'accepted',finalized:true});
 });
 it('a recorded output that fails validation is recovered as rejected, still one provider call',async()=>{
  const f=fakeLlm({content:JSON.stringify({points:[{fact_ids:['obs:US_CPI_YOY'],hypothesis:'三成的影响'}]})});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  expect(projection(await handleExplainRequest(d,USER,body()))).toMatchObject({state:'rejected',failure_codes:['numeral'],rendered:null});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('validator version changed since the call → failed {validator_version_changed}, the model text is not re-judged',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const detail=d.db.runDetail.bind(d.db);
  vi.spyOn(d.db,'runDetail').mockImplementation(async id=>{const r=await detail(id);return r&&{...r,raw_output:{...(r.raw_output as Record<string,unknown>),validator_version:'macro-explain-validator/0'}};});
  // the stored row keeps its original envelope (a recorded completion is evidence: the db rejects a different raw output), so the
  // recovery finish is captured instead of applied
  const finish=vi.spyOn(d.db,'finishExplanation').mockImplementation(async a=>({explanation_id:a.explanationId} as ExplanationProjection));
  finish.mockClear();
  await handleExplainRequest(d,USER,body());
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish.mock.calls[0][0]).toMatchObject({state:'failed',failureCodes:['validator_version_changed'],rendered:null,validatorVersion:'macro-explain-validator/0'});
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('recordCompletion, then finalize fail: finish stored the payload; the replay settles it verbatim after a pricing change and marks finalized',async()=>{
  const f=fakeLlm({finalizeError:new Error('usage_audit_unavailable')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'recordCompletion').mockRejectedValue(new Error('db down'));
  const first=projection(await handleExplainRequest(d,USER,body()));
  expect(first.state).toBe('accepted');
  expect(d.db._run(first.explanation_id)).toMatchObject({finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  f.state.pricing='p2';f.state.finalizeError=undefined;   // config moved on; the stored payload must not be recomputed
  expect(projection(await handleExplainRequest(d,USER,body()))).toEqual(first);
  expect(f.finalized.at(-1)).toEqual(PAY('completed',[{tokens:42}]));
  expect(d.db._run(first.explanation_id)?.finalized).toBe(true);
  expect(f.calls.filter(c=>c==='call')).toHaveLength(1);
 });
 it('recoverUserExplanations (GET) finishes the user\'s recorded completions, bounded by the limit, and is a no-op otherwise',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('reset')).mockRejectedValueOnce(new Error('reset'));
  const second='33333333-3333-4333-8333-333333333333';
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('reset');
  await expect(handleExplainRequest(d,USER,body({request_id:second}))).rejects.toThrow('reset');
  expect(await recoverUserExplanations(d,USER,1)).toBe(1);
  expect(await recoverUserExplanations(d,USER)).toBe(1);
  expect(await recoverUserExplanations(d,USER)).toBe(0);
  for(const req of [REQ,second])expect((await d.db.runOf(USER,req))!.state).toBe('accepted');
  expect(f.calls.filter(c=>c==='call')).toHaveLength(2);
 });
});

describe('preparation failure and settlement independence (Task 11 Codex #4 / #5)',()=>{
 it('a model-input preparation failure surfaces before any claim or usage run: no begin, no call, no run row',async()=>{
  const f=fakeLlm();const d=deps({llm:f.llm});
  vi.mocked(render.renderFacts).mockImplementationOnce(()=>{throw new TypeError('render bug');});
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('render bug');
  expect(f.calls.some(c=>c.startsWith('begin')||c==='call'||c.startsWith('finalize'))).toBe(false);
  expect(await d.db.runOf(USER,REQ)).toBeNull();
 });
 async function stuck(){   // finish and finalize both failed once: recorded completion + unsettled payload, state running
  const f=fakeLlm({finalizeError:new Error('down')});const d=deps({llm:f.llm});
  vi.spyOn(d.db,'finishExplanation').mockRejectedValueOnce(new Error('connection reset'));
  await expect(handleExplainRequest(d,USER,body())).rejects.toThrow('connection reset');
  const run=(await d.db.runOf(USER,REQ))!;
  expect(d.db._run(run.explanation_id)).toMatchObject({state:'running',finalize_payload:PAY('completed',[{tokens:42}]),finalized:false});
  f.state.finalizeError=undefined;f.finalized.length=0;
  return {f,d,id:run.explanation_id};
 }
 it('recovery finish keeps failing: the recorded payload is still settled verbatim and marked finalized',async()=>{
  const {f,d,id}=await stuck();
  vi.spyOn(d.db,'finishExplanation').mockRejectedValue(new Error('still down'));
  await recoverUserExplanations(d,USER);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(id)).toMatchObject({state:'running',finalized:true});
 });
 it('the post-finish reread fails: the payload loaded first is still settled',async()=>{
  const {f,d,id}=await stuck();
  const detail=d.db.runDetail.bind(d.db);let n=0;
  vi.spyOn(d.db,'runDetail').mockImplementation(async x=>{if(++n===2)throw new Error('read down');return detail(x);});
  await recoverUserExplanations(d,USER);
  expect(f.finalized).toEqual([PAY('completed',[{tokens:42}])]);
  expect(d.db._run(id)).toMatchObject({state:'accepted',finalized:true});
 });
});

describe('input and subject checks',()=>{
 it.each([
  ['not an object','x'],['bad uuid',{...body(),request_id:'nope'}],['bad locale',{...body(),locale:'fr'}],
  ['bad kind',{...body(),subject:{kind:'judgment',id:'x'}}],['extra key',{...body(),model:'x'}],
 ])('400 invalid_body: %s',async(_,raw)=>{
  expect((await handleExplainRequest(deps(),USER,raw)).status).toBe(400);
 });
 it('fresh request with no foundation → 503 macro_foundation_unavailable',async()=>{
  expect((await handleExplainRequest(deps({port:null}),USER,body())).body).toEqual({error:{code:'macro_foundation_unavailable',message:'macro_foundation_unavailable'}});
 });
 it.each([
  ['unknown snapshot',{kind:'snapshot' as const,id:'snap:US:nope'}],
  ['malformed review id',{kind:'review' as const,id:'US-2026-10'}],
  ['a pointer key is not a result id',{kind:'review' as const,id:'US:2026-10'}],
  ['unknown review result',{kind:'review' as const,id:'55555555-5555-4555-8555-555555555555'}],
 ])('404 subject_not_found: %s',async(_,subject)=>{
  const f=fakeLlm();
  expect((await handleExplainRequest(deps({llm:f.llm}),USER,body({subject}))).status).toBe(404);
  expect(f.calls).toEqual([]);
 });
 it('a failed snapshot is not a valid subject',async()=>{
  const failed=snap('US','2026-10-16T06:00:00Z',[],{status:'failed'});
  const p=memoryStrategyPort(fixture({snapshots:[SNAP,failed],observations:ROWS}));
  expect((await handleExplainRequest(deps({port:p}),USER,body({subject:{kind:'snapshot',id:failed.snapshot_id}}))).status).toBe(404);
 });
});

describe('prompts',()=>{
 it('both locales load and carry the prompt version marker',()=>{
  for(const l of ['zh','en'] as const)expect(promptText(l)).toContain('macro-explain-prompt/1');
 });
});
