// Explanation panel decisions that used to live inside the component (Task 13 Codex audit): request-id retention after
// ambiguous outcomes, explicit loading / read-error phases that disable generation, and manifest citations taken from
// the projection. The repo has no DOM test setup (vitest runs in node, no testing-library), so the component's state
// machine is exercised here as pure functions over a fake idempotent server.
import {describe,expect,it} from 'vitest';
import type {ExplanationProjection} from '@/lib/macro/strategy/contract';
import {explainControls,explainOutcome,explainPendingKey,factCitation,generateLabelKey,pendingFor,strategyApi,submitExplanation,type PendingRequest,type StrategyT} from './strategy-view-model';

const t:StrategyT=(k,v)=>v?`${k}${JSON.stringify(v)}`:k;
const proj=(o:Partial<ExplanationProjection>={}):ExplanationProjection=>({explanation_id:'e1',subject_kind:'snapshot',subject_id:'snap:US:1',locale:'en',manifest_id:'man-explain-1',state:'accepted',
 rendered:null,failure_codes:[],provider:'p',model:'m',prompt_version:'pv',validator_version:'vv',created_at:'c',finished_at:null,...o});
const subject={kind:'snapshot' as const,id:'snap:US:1'};
const res=(status:number,body:unknown):Response=>({status,ok:status>=200&&status<300,json:async()=>{if(body===undefined)throw new Error('bad json');return body;}}) as Response;

/** Fake route: one provider call per request id; a stored completion is replayed by the same id (spec §6.3 idempotency). */
function fakeServer(script:('finish_fails'|'gateway'|'ok')[]){
 const stored = new Map<string,ExplanationProjection>();let providerCalls=0;const ids:string[]=[];
 const fetchFn=(async(_u:string,init:{body:string})=>{
  const {request_id}=JSON.parse(init.body) as {request_id:string};ids.push(request_id);
  const hit=stored.get(request_id);
  if(hit)return res(200,hit);
  const step=script.shift()??'ok';
  if(step==='gateway')return res(502,{});
  providerCalls+=1;
  const p=proj({explanation_id:`run-${request_id}`});
  stored.set(request_id,p);
  return step==='finish_fails'?res(500,{error:{code:'internal',message:'x'}}):res(200,p);
 }) as unknown as typeof fetch;
 return {fetchFn,calls:()=>providerCalls,ids};
}

describe('request id retention (ambiguous outcomes)',()=>{
 it('classifies outcomes: only unknown results are ambiguous',()=>{
  expect(explainOutcome(200,proj()).kind).toBe('done');
  expect(explainOutcome(200,{nope:1})).toEqual({kind:'ambiguous',code:'unreadable'});
  expect(explainOutcome(null,null)).toEqual({kind:'ambiguous',code:'network'});
  expect(explainOutcome(500,{error:{code:'internal'}})).toEqual({kind:'ambiguous',code:'internal'});
  expect(explainOutcome(502,null)).toEqual({kind:'ambiguous',code:'http_502'});
  expect(explainOutcome(429,{error:{code:'quota_exceeded'}})).toEqual({kind:'refused',code:'quota_exceeded'});
  expect(explainOutcome(409,{error:{code:'payload_conflict'}})).toEqual({kind:'refused',code:'payload_conflict'});
  expect(explainOutcome(503,{error:{code:'llm_not_configured'}}).kind).toBe('refused');
  const failed=proj({state:'failed'});
  expect(explainOutcome(500,{error:{code:'usage_audit_unavailable'},explanation:failed})).toEqual({kind:'run_failed',code:'usage_audit_unavailable',projection:failed});
 });
 it('completion persisted → HTTP 500 → retry → same request id, no second provider call',async()=>{
  const s=fakeServer(['finish_fails']);let n=0;const gen=()=>`req-${++n}`;
  const first=await submitExplanation({fetch:s.fetchFn,gen},null,subject,'en');
  expect(first.outcome.kind).toBe('ambiguous');expect(first.pending).toEqual({key:explainPendingKey(subject,'en'),id:'req-1'});
  const second=await submitExplanation({fetch:s.fetchFn,gen},first.pending,subject,'en');
  expect(second.outcome.kind).toBe('done');expect(second.pending).toBeNull();
  expect(s.ids).toEqual(['req-1','req-1']);expect(s.calls()).toBe(1);expect(n).toBe(1);
 });
 it('gateway failure and unreadable body also keep the id; network error too',async()=>{
  const s=fakeServer(['gateway','ok']);const gen=()=>'g';
  const a=await submitExplanation({fetch:s.fetchFn,gen},null,subject,'en');
  expect(a.pending?.id).toBe('g');
  const throwing=(async()=>{throw new TypeError('offline');}) as unknown as typeof fetch;
  expect((await submitExplanation({fetch:throwing,gen:()=>'h'},null,subject,'en')).pending?.id).toBe('h');
  const unreadable=(async()=>res(200,undefined)) as unknown as typeof fetch;
  expect((await submitExplanation({fetch:unreadable,gen:()=>'u'},null,subject,'en')).outcome).toEqual({kind:'ambiguous',code:'unreadable'});
 });
 it('definitive answers clear the id so the next click is a new request',async()=>{
  const refused=(async()=>res(429,{error:{code:'quota_exceeded'}})) as unknown as typeof fetch;
  const r=await submitExplanation({fetch:refused,gen:()=>'a'},null,subject,'en');
  expect([r.pending,r.outcome.kind]).toEqual([null,'refused']);
 });
 it('a pending id is reused only for the same subject and locale',()=>{
  const p:PendingRequest={key:explainPendingKey(subject,'en'),id:'keep'};
  expect(pendingFor(p,subject,'en')).toBe('keep');expect(pendingFor(p,subject,'zh')).toBeNull();expect(pendingFor(p,{kind:'review',id:'x'},'en')).toBeNull();expect(pendingFor(null,subject,'en')).toBeNull();
 });
 it('button label says retry whenever an id is held',()=>{
  expect(generateLabelKey('none',null,false)).toBe('explain.generate');
  expect(generateLabelKey('none','internal',true)).toBe('explain.retry');
  expect(generateLabelKey('failed',null,false)).toBe('explain.regenerate');
  expect(generateLabelKey('none','quota_exceeded',false)).toBe('explain.regenerate');
 });
});

describe('explicit loading and read-error phases',()=>{
 const base={busy:false,hasCurrent:false,pending:false};
 it('delayed GET: loading disables generation instead of showing "not generated"',()=>{
  expect(explainControls({...base,listKind:'loading',projection:null})).toEqual({phase:'loading',canGenerate:false,showGenerate:true,showReload:false});
 });
 it('failed GET: read error disables generation and offers a reload',()=>{
  for(const k of ['error','disabled','foundation','not_found'] as const)
   expect(explainControls({...base,listKind:k,projection:null})).toEqual({phase:'readError',canGenerate:false,showGenerate:true,showReload:true});
 });
 it('refresh of a running request returns to loading, then to running; never enabled in between',()=>{
  const running=proj({state:'running'});
  expect(explainControls({...base,listKind:'loading',projection:null})).toMatchObject({phase:'loading',canGenerate:false});
  expect(explainControls({...base,listKind:'ok',projection:running})).toEqual({phase:'running',canGenerate:false,showGenerate:false,showReload:false});
 });
 it('after a successful GET with nothing stored, generation is enabled; a stored result keeps regenerate',()=>{
  expect(explainControls({...base,listKind:'ok',projection:null})).toMatchObject({phase:'none',canGenerate:true});
  expect(explainControls({...base,listKind:'ok',projection:proj()})).toMatchObject({phase:'accepted',canGenerate:true});
 });
 it('our own POST result stands even while the list reloads; busy always disables; a held id allows the safe retry',()=>{
  expect(explainControls({...base,hasCurrent:true,listKind:'loading',projection:proj()})).toMatchObject({phase:'accepted',canGenerate:true});
  expect(explainControls({...base,busy:true,listKind:'ok',projection:null})).toMatchObject({phase:'running',canGenerate:false});
  expect(explainControls({...base,pending:true,listKind:'error',projection:null})).toMatchObject({phase:'readError',canGenerate:true});
 });
});

describe('manifest citations come from the projection',()=>{
 it('fact citations point into the explanation manifest, never a page manifest',()=>{
  const href=factCitation('man-explain-1','chg:US_DFF:2026-10');
  expect(href).toBe(`${strategyApi.manifest('man-explain-1')}#fact=chg%3AUS_DFF%3A2026-10`);
  expect(href).not.toContain('man-transmission');
 });
 it('the full manifest id is available for the link text (not only the short id)',()=>{
  expect(strategyApi.manifest(proj().manifest_id)).toBe('/api/macro/strategy/manifests/man-explain-1');
  expect(t('meta.manifestLink')).toBe('meta.manifestLink');
 });
});
