// Capability matrix (spec §9.1) for every /api/macro/strategy route and the review cron, in decision order: 401 →
// 404 strategy_disabled → 503 macro_foundation_unavailable → 400 parameters → judgment layer. Combined routes stay 200
// with judgment_status and carry no judgment field while the layer is off; only /deviations answers 404/503 for it.
// Library computations are mocked (their own tasks test them); storage is Task 3's in-memory StrategyDb.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {F4Mark,F4Summary,ManifestKind,PlaybookView,PolicyResponseView,ReviewFacts,StrategyManifest,TransmissionView} from '@/lib/macro/strategy/contract';
import {memoryStrategyDb,type StrategyDb} from '@/lib/macro/strategy/db';
import type {F4CardLite} from '@/lib/macro/strategy/f4-client';
import {strategyMemo} from '@/lib/macro/strategy/memo';

const m=vi.hoisted(()=>({user:vi.fn(),port:vi.fn(),db:null as unknown,code:vi.fn(),trManifest:vi.fn(),buildTransmission:vi.fn(),buildPlaybooks:vi.fn(),selectF4Mark:vi.fn(),
 prManifest:vi.fn(),buildPolicyResponse:vi.fn(),ctManifest:vi.fn(),buildCycleTable:vi.fn(),runReview:vi.fn(),handle:vi.fn(),recover:vi.fn(),listDeviationCases:vi.fn(),createF4Client:vi.fn(),card:vi.fn(),detail:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:m.user}})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({})}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({})}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:m.code}));
vi.mock('@/lib/macro/strategy/port',()=>({strategyPort:m.port}));
vi.mock('@/lib/macro/strategy/db',async(orig)=>({...await orig<typeof import('@/lib/macro/strategy/db')>(),supabaseStrategyDb:()=>m.db}));
vi.mock('@/lib/macro/strategy/transmission',()=>({buildTransmissionManifest:m.trManifest,buildTransmission:m.buildTransmission}));
vi.mock('@/lib/macro/strategy/playbooks',()=>({buildPlaybooks:m.buildPlaybooks,selectF4Mark:m.selectF4Mark}));
vi.mock('@/lib/macro/strategy/policy-response',()=>({buildPolicyResponseManifest:m.prManifest,buildPolicyResponse:m.buildPolicyResponse}));
vi.mock('@/lib/macro/strategy/cycle-table',()=>({buildCycleTableManifest:m.ctManifest,buildCycleTable:m.buildCycleTable}));
vi.mock('@/lib/macro/strategy/review',()=>({runReview:m.runReview}));
vi.mock('@/lib/macro/strategy/explain-request',()=>({handleExplainRequest:m.handle,recoverUserExplanations:m.recover}));
vi.mock('@/lib/macro/strategy/deviations',()=>({listDeviationCases:m.listDeviationCases}));
vi.mock('@/lib/macro/strategy/f4-client',()=>({createF4Client:m.createF4Client,F4Unavailable:class F4Unavailable extends Error{}}));
vi.mock('@/lib/macro/strategy/llm-deps',()=>({productionLlmDeps:(userId:string)=>({tag:'llm',userId})}));

import {GET as cron} from '@/app/api/cron/macro-review/route';
import {ParamError,canonicalExplainBody,isClosedMonth,lastClosedMonth,monthOf,readParams,reviewAsOfDate,subjectIdOf,windowOf} from '@/lib/macro/strategy/route-helpers';
import {GET as cycleTable} from './cycle-table/route';
import {GET as deviations} from './deviations/route';
import {GET as listExplanations,POST as postExplanation} from './explanations/route';
import {GET as manifestRoute} from './manifests/[id]/route';
import {GET as policyResponse} from './policy-response/route';
import {GET as reviewDetail} from './reviews/[region]/[month]/route';
import {GET as reviewsIndex} from './reviews/route';
import {GET as transmission} from './transmission/route';

const USER='11111111-1111-4111-8111-111111111111',REQ='22222222-2222-4222-8222-222222222222',MID='33333333-3333-4333-8333-333333333333',RID='44444444-4444-4444-8444-444444444444';
const PORT={tag:'port',activeSnapshot:vi.fn(),publishState:vi.fn(),catalogVersion:vi.fn()};
const U='https://alpha.example/api/macro/strategy';
const get=(path:string)=>new Request(`${U}${path}`);
const post=(body:unknown)=>new Request(`${U}/explanations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const json=async(r:Response)=>r.json() as Promise<Record<string,unknown>>;
const codeOf=async(r:Response)=>((await json(r)).error as {code:string}).code;
const TV:TransmissionView={version:'macro-transmission/1',region:'US',manifest_id:MID,cutoff:'2026-11-03T06:02:00Z',snapshots:{US:'snap:US:1',CN:'snap:CN:1'},catalog_version:'cat/1',stages:[]};
const PV:PolicyResponseView={version:'macro-policy-response/1',window:3,manifest_id:MID,cutoff:'2026-11-03T06:02:00Z',dims:[],rows:[],sentences:[]};
const CARD:F4CardLite={judgment_id:'j1',lifecycle:'open',calibration:'insufficient_sample',as_of:'2026-11-03T03:20:00Z',methodology:{id:'macro_regime',version:'v2'},selected:'overheat'};
const SUMMARY:F4Summary={judgment_id:'j1',selected:'overheat',lifecycle:'open',outcome:null,calibration:'insufficient_sample',methodology:{id:'macro_regime',version:'v2'},as_of:'2026-11-03T03:20:00Z',href:'/intel/methods/macro_regime/v2'};
const MARK:{mark:F4Mark;summary:F4Summary}={mark:{regime:'overheat',judgment_id:'j1',snapshot_match:true,as_of:'2026-11-03T03:20:00Z'},summary:SUMMARY};
const PB:PlaybookView[]=[{regime:'recovery',title:{zh:'复苏',en:'Recovery'},triggers:[],mechanism:[],implications:{favored:[],disfavored:[]},watch:[]}];
const FROZEN_US={snapshot_id:'snap:US:1',created_at:'2026-11-03T06:02:00.000Z',as_of:'2026-11-03',catalog_counts:{verified:1,missing:0,restricted:0},observation_ids:[],history_ids:[]};
const body=(kind:ManifestKind,o:Partial<StrategyManifest>={}):StrategyManifest=>({kind,params:{},cutoff:'2026-11-03T06:02:00.000Z',snapshots:{US:null,CN:null},catalog:[],reads:[],inputs:[],catalog_version:'cat/1',method_version:'m/1',code_version:'abc123',...o});
const MANIFEST=body('review',{params:{region:'US',month:'2026-10'},cutoff:'2026-11-03T00:00:00.000Z',method_version:'macro-review/1',
 catalog:[{id:'US_CPI_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 CPI 同比',en:'US CPI YoY'},unit:'pct',status:'active',changeKind:'pp',nativeFrequency:'monthly',period:'month'}]});
const FACTS:ReviewFacts={region:'US',month:'2026-10',cutoff:'2026-11-03T00:00:00.000Z',baseline_cutoff:'2026-10-03T00:00:00.000Z',snapshot_id:null,baseline_snapshot_id:null,baseline_missing:true,
 releases:[],revisions:[],timeliness:[],policy_events:[],episode_changes:[],asset_moves:[],coverage:[]};
let db:ReturnType<typeof memoryStrategyDb>;
async function seedReview(d:StrategyDb){
 const man=await d.putManifest(MANIFEST);
 const pub=await d.publishReview({region:'US',month:'2026-10',expectedGeneration:0,cutoff:MANIFEST.cutoff,status:'insufficient',manifestId:man.manifest_id,manifestHash:man.manifest_hash,facts:FACTS,methodVersion:'macro-review/1',codeVersion:'abc123'});
 return {man,pub};
}
type Call=()=>Promise<Response>;
const FACT_ROUTES:[string,Call][]=[
 ['transmission',()=>transmission(get('/transmission?region=US'))],
 ['policy-response',()=>policyResponse(get('/policy-response?window=3'))],
 ['cycle-table',()=>cycleTable(get('/cycle-table?boundary=event_day'))],
 ['manifest',()=>manifestRoute(get(`/manifests/${MID}`),{params:Promise.resolve({id:MID})})],
 ['reviews',()=>reviewsIndex(get('/reviews?region=US'))],
 ['review',()=>reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})})],
 ['deviations',()=>deviations(get('/deviations?region=US'))],
 ['explanations GET',()=>listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`))],
];
const EXPLAIN_BODY={request_id:REQ,subject:{kind:'review',id:RID},locale:'zh'};
const ALL_ROUTES:[string,Call][]=[...FACT_ROUTES,['explanations POST',()=>postExplanation(post(EXPLAIN_BODY))]];
const COMPUTE=()=>[m.trManifest,m.prManifest,m.ctManifest,m.listDeviationCases,m.handle,m.createF4Client];
const ENV_KEYS=['MACRO_STRATEGY_ENABLED','MACRO_JUDGMENTS_ENABLED','CRON_SECRET'] as const;
const saved=Object.fromEntries(ENV_KEYS.map(k=>[k,process.env[k]]));

beforeEach(()=>{
 vi.clearAllMocks();
 strategyMemo.clear();PORT.activeSnapshot.mockImplementation(async(r:string)=>r==='US'?FROZEN_US:null);PORT.publishState.mockResolvedValue(null);PORT.catalogVersion.mockReturnValue('cat/1');
 process.env.MACRO_STRATEGY_ENABLED='1';delete process.env.MACRO_JUDGMENTS_ENABLED;process.env.CRON_SECRET='cron-secret';
 m.user.mockResolvedValue({data:{user:{id:USER}},error:null});
 m.port.mockReturnValue(PORT);m.code.mockReturnValue('abc123');
 db=memoryStrategyDb();m.db=db;
 m.trManifest.mockResolvedValue(body('transmission',{snapshots:{US:FROZEN_US,CN:null}}));m.buildTransmission.mockReturnValue(TV);m.buildPlaybooks.mockReturnValue(PB);
 m.prManifest.mockResolvedValue(body('policy_response'));m.buildPolicyResponse.mockReturnValue(PV);
 m.ctManifest.mockResolvedValue(body('cycle_table'));m.buildCycleTable.mockReturnValue({version:'macro-cycle-table/1'});
 m.createF4Client.mockReturnValue({latestRegimeCard:m.card,judgmentDetail:m.detail,history:vi.fn()});
 m.card.mockResolvedValue(CARD);m.detail.mockResolvedValue({judgment_id:'j1'});m.selectF4Mark.mockReturnValue(MARK);
 m.listDeviationCases.mockResolvedValue({cases:[],incomplete:false});
 m.handle.mockResolvedValue({status:200,body:{explanation_id:'e1',state:'accepted'}});m.recover.mockResolvedValue(0);
 m.runReview.mockImplementation(async(_d:unknown,region:string,month:string,o:{preview:boolean})=>({region,month,outcome:o.preview?'preview':'advanced',status:'ok',manifest_hash:'h',manifest_id:MID,result_id:REQ,generation:1}));
});
afterEach(()=>{for(const k of ENV_KEYS){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}vi.useRealTimers();});

describe('capability matrix (spec §9.1)',()=>{
 it.each(ALL_ROUTES)('%s: no session → 401 before anything else',async(_n,call)=>{
  m.user.mockResolvedValue({data:{user:null},error:null});
  const r=await call();
  expect(r.status).toBe(401);expect(await codeOf(r)).toBe('unauthorized');
  expect(m.port).not.toHaveBeenCalled();for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it.each(ALL_ROUTES)('%s: strategy flag unset → 404 strategy_disabled, foundation never consulted',async(_n,call)=>{
  delete process.env.MACRO_STRATEGY_ENABLED;
  const r=await call();
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('strategy_disabled');
  expect(m.port).not.toHaveBeenCalled();for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it.each(FACT_ROUTES)('%s: enabled with a null port → 503 macro_foundation_unavailable',async(_n,call)=>{
  m.port.mockReturnValue(null);
  const r=await call();
  expect(r.status).toBe(503);expect(await codeOf(r)).toBe('macro_foundation_unavailable');
  for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it('foundation is checked before parameters',async()=>{
  m.port.mockReturnValue(null);
  expect((await transmission(get('/transmission?region=XX'))).status).toBe(503);
  expect((await deviations(get('/deviations?bogus=1'))).status).toBe(503);
 });
 it('explanations POST with a null port reaches the handler (its replay precedes the foundation check) and passes the status through',async()=>{
  m.port.mockReturnValue(null);
  m.handle.mockResolvedValueOnce({status:503,body:{error:{code:'macro_foundation_unavailable',message:'x'}}});
  const r=await postExplanation(post(EXPLAIN_BODY));
  expect(r.status).toBe(503);
  const [deps,userId,raw]=m.handle.mock.calls[0];
  expect(deps).toMatchObject({port:null,db,codeVersion:'abc123',llm:{tag:'llm',userId:USER}});
  expect([userId,raw]).toEqual([USER,EXPLAIN_BODY]);
  m.handle.mockResolvedValueOnce({status:200,body:{explanation_id:'e0',state:'accepted'}});
  const replay=await postExplanation(post(EXPLAIN_BODY));
  expect(replay.status).toBe(200);expect(await replay.json()).toEqual({explanation_id:'e0',state:'accepted'});
  expect(replay.headers.get('cache-control')).toBe('private, no-store');
 });
});

describe('parameters (whitelist, 400 invalid_parameter:<name>)',()=>{
 const BAD:[string,Call,string][]=[
  ['transmission region',()=>transmission(get('/transmission?region=HK')),'invalid_parameter:region'],
  ['transmission missing region',()=>transmission(get('/transmission')),'invalid_parameter:region'],
  ['transmission unknown',()=>transmission(get('/transmission?region=US&x=1')),'invalid_parameter:x'],
  ['transmission repeated',()=>transmission(get('/transmission?region=US&region=CN')),'invalid_parameter:region'],
  ['policy window',()=>policyResponse(get('/policy-response?window=2')),'invalid_parameter:window'],
  ['cycle boundary',()=>cycleTable(get('/cycle-table?boundary=week')),'invalid_parameter:boundary'],
  ['manifest id',()=>manifestRoute(get('/manifests/nope'),{params:Promise.resolve({id:'nope'})}),'invalid_parameter:id'],
  ['reviews region',()=>reviewsIndex(get('/reviews')),'invalid_parameter:region'],
  ['review month',()=>reviewDetail(get('/reviews/US/2026-13'),{params:Promise.resolve({region:'US',month:'2026-13'})}),'invalid_parameter:month'],
  ['review region',()=>reviewDetail(get('/reviews/EU/2026-10'),{params:Promise.resolve({region:'EU',month:'2026-10'})}),'invalid_parameter:region'],
  ['deviations region',()=>deviations(get('/deviations?region=us')),'invalid_parameter:region'],
  ['explanations kind',()=>listExplanations(get('/explanations?subject_kind=x&subject_id=a')),'invalid_parameter:subject_kind'],
  ['explanations review id (a pointer key is not a result id)',()=>listExplanations(get('/explanations?subject_kind=review&subject_id=US:2026-10')),'invalid_parameter:subject_id'],
 ];
 it.each(BAD)('%s',async(_n,call,code)=>{
  const r=await call();
  expect(r.status).toBe(400);expect(await codeOf(r)).toBe(code);
  for(const f of COMPUTE())expect(f).not.toHaveBeenCalled();
 });
 it('defaults: window 3, boundary event_day (frozen into the manifest params)',async()=>{
  await policyResponse(get('/policy-response'));await cycleTable(get('/cycle-table'));
  expect(m.prManifest.mock.calls[0][1]).toMatchObject({window:3});expect(m.ctManifest.mock.calls[0][1]).toMatchObject({boundary:'event_day'});
 });
 it('explanations POST rejects a non-JSON body',async()=>{
  const r=await postExplanation(new Request(`${U}/explanations`,{method:'POST',body:'{'}));
  expect(r.status).toBe(400);expect(await codeOf(r)).toBe('invalid_body');expect(m.handle).not.toHaveBeenCalled();
 });
 it('manifest-writing routes refuse without a code version',async()=>{
  m.code.mockReturnValue(null);
  for(const call of [()=>transmission(get('/transmission?region=US')),()=>policyResponse(get('/policy-response')),()=>cycleTable(get('/cycle-table'))]){
   const r=await call();expect(r.status).toBe(503);expect(await codeOf(r)).toBe('code_version_unavailable');
  }
  expect(m.trManifest).not.toHaveBeenCalled();
 });
 it('explanations POST without a code version still reaches the handler (a replay needs none; the handler answers 503 after it)',async()=>{
  m.code.mockReturnValue(null);
  m.handle.mockResolvedValueOnce({status:200,body:{explanation_id:'e0',state:'accepted'}});
  const r=await postExplanation(post(EXPLAIN_BODY));
  expect(r.status).toBe(200);
  expect(m.handle.mock.calls[0][0]).toMatchObject({codeVersion:null});
 });
});

describe('fact routes',()=>{
 it.each([['transmission',()=>transmission(get('/transmission?region=US')),m.trManifest],['policy-response',()=>policyResponse(get('/policy-response?window=3')),m.prManifest],['cycle-table',()=>cycleTable(get('/cycle-table?boundary=event_day')),m.ctManifest]] as const)('%s memo hits, invalidates on input revision, and single flights',async(_name,call,builder)=>{
  PORT.publishState.mockResolvedValue({revision:1,input_revision:1});
  const put=vi.spyOn(db,'putManifest');
  const first=await call(),firstBody=await first.json();expect(first.headers.get('X-Macro-Strategy-Memo')).toBe('miss');
  const second=await call();expect(await second.json()).toEqual(firstBody);expect(second.headers.get('X-Macro-Strategy-Memo')).toBe('hit');
  expect(builder).toHaveBeenCalledTimes(1);expect(put).toHaveBeenCalledTimes(1);
  PORT.publishState.mockResolvedValue({revision:1,input_revision:2});
  expect((await call()).headers.get('X-Macro-Strategy-Memo')).toBe('miss');expect(builder).toHaveBeenCalledTimes(2);
  strategyMemo.clear();builder.mockClear();put.mockClear();
  const both=await Promise.all([call(),call()]);expect(both.map(r=>r.headers.get('X-Macro-Strategy-Memo'))).toEqual(['miss','coalesced']);
  expect(builder).toHaveBeenCalledTimes(1);expect(put).toHaveBeenCalledTimes(1);
 });
 it('without either snapshot, policy and cycle builds use request time and bypass the memo',async()=>{
  PORT.activeSnapshot.mockResolvedValue(null);
  for(const [call,builder] of [[()=>policyResponse(get('/policy-response?window=3')),m.prManifest],[()=>cycleTable(get('/cycle-table?boundary=event_day')),m.ctManifest]] as const){
   strategyMemo.clear();builder.mockClear();
   const a=await call(),b=await call();expect([a.headers.get('X-Macro-Strategy-Memo'),b.headers.get('X-Macro-Strategy-Memo')]).toEqual(['miss','miss']);
   expect(builder).toHaveBeenCalledTimes(2);
  }
  expect((await transmission(get('/transmission?region=US'))).status).toBe(404);
 });
 it('transmission evaluates judgments on a memo hit',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  await transmission(get('/transmission?region=US'));
  const r=await transmission(get('/transmission?region=US'));
  expect(r.headers.get('X-Macro-Strategy-Memo')).toBe('hit');expect(m.card).toHaveBeenCalledTimes(2);
 });
 it('different fact params occupy separate memo entries',async()=>{
  await transmission(get('/transmission?region=US'));await transmission(get('/transmission?region=CN'));
  await policyResponse(get('/policy-response?window=1'));await policyResponse(get('/policy-response?window=6'));
  await cycleTable(get('/cycle-table?boundary=event_day'));await cycleTable(get('/cycle-table?boundary=month_end'));
  expect(m.trManifest).toHaveBeenCalledTimes(2);expect(m.prManifest).toHaveBeenCalledTimes(2);expect(m.ctManifest).toHaveBeenCalledTimes(2);
  expect(strategyMemo.stats().size).toBe(6);
 });
 it('transmission, judgment layer off: one stored manifest feeds flow and playbooks; judgment_status disabled, no f4 field, F4 never built',async()=>{
  const r=await transmission(get('/transmission?region=US'));
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  const out=await json(r);
  expect(out).toEqual({transmission:TV,playbooks:PB,judgment_status:'disabled'});
  expect('f4' in out).toBe(false);
  expect(JSON.stringify(out)).not.toMatch(/judgment_id|f4Mark|contributions|distribution|margin_pp/);
  expect(m.createF4Client).not.toHaveBeenCalled();expect(m.selectF4Mark).not.toHaveBeenCalled();
  expect(m.trManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',region:'US',snapshots:{US:FROZEN_US,CN:null}});
  const stored=m.buildTransmission.mock.calls[0][0];
  expect(stored).toEqual(await db.manifest(stored.manifest_id));
  expect(m.buildTransmission.mock.calls[0]).toHaveLength(1);   // the view reads the region from the manifest params
  expect(m.buildPlaybooks).toHaveBeenCalledWith(stored.body,'US');
 });
 it('transmission, judgment layer on: ok carries {mark, summary} for the manifest snapshot of the region',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  const out=await json(await transmission(get('/transmission?region=US')));
  expect(out).toEqual({transmission:TV,playbooks:PB,judgment_status:'ok',f4:MARK});
  expect(m.card).toHaveBeenCalledWith('US');expect(m.detail).toHaveBeenCalledWith('j1');
  expect(m.selectF4Mark).toHaveBeenCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:'snap:US:1'});
  await transmission(get('/transmission?region=CN'));   // CN has no snapshot in this manifest
  expect(m.selectF4Mark).toHaveBeenLastCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:null});
 });
 it('transmission, judgment layer on but F4 unavailable / no card / no mark: still 200, unavailable, no f4',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  m.card.mockRejectedValueOnce(new Error('F4 down'));
  let r=await transmission(get('/transmission?region=US'));
  expect(r.status).toBe(200);expect(await json(r)).toEqual({transmission:TV,playbooks:PB,judgment_status:'unavailable'});
  m.card.mockResolvedValueOnce(null);
  expect((await json(await transmission(get('/transmission?region=US')))).judgment_status).toBe('unavailable');
  m.selectF4Mark.mockReturnValueOnce(null);
  r=await transmission(get('/transmission?region=US'));
  expect(await json(r)).toEqual({transmission:TV,playbooks:PB,judgment_status:'unavailable'});
 });
 it('transmission without any active snapshot → 404 no_published_snapshot, nothing stored',async()=>{
  PORT.activeSnapshot.mockResolvedValue(null);
  m.trManifest.mockResolvedValueOnce(null);
  const r=await transmission(get('/transmission?region=CN'));
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('no_published_snapshot');
  expect(m.buildTransmission).not.toHaveBeenCalled();
 });
 it('policy-response and cycle-table: stored manifest → view for the requested window / boundary',async()=>{
  let r=await policyResponse(get('/policy-response?window=6'));
  expect(r.status).toBe(200);expect(await r.json()).toEqual(PV);
  expect(m.prManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',window:6,snapshots:{US:FROZEN_US,CN:null}});
  expect(m.buildPolicyResponse.mock.calls[0]).toEqual([expect.objectContaining({body:body('policy_response')})]);
  r=await cycleTable(get('/cycle-table?boundary=month_end'));
  expect(r.headers.get('cache-control')).toBe('private, max-age=300');
  expect(m.ctManifest).toHaveBeenCalledWith(PORT,{now:expect.any(Date),codeVersion:'abc123',boundary:'month_end',snapshots:{US:FROZEN_US,CN:null}});
  expect(m.buildCycleTable.mock.calls[0]).toEqual([expect.objectContaining({body:body('cycle_table')})]);
 });
 it('manifest: stored body by id; unknown id → 404 manifest_not_found',async()=>{
  const stored=await db.putManifest(MANIFEST);
  const r=await manifestRoute(get(`/manifests/${stored.manifest_id}`),{params:Promise.resolve({id:stored.manifest_id})});
  expect(r.status).toBe(200);expect(await r.json()).toEqual(stored);
  const miss=await manifestRoute(get(`/manifests/${MID}`),{params:Promise.resolve({id:MID})});
  expect(miss.status).toBe(404);expect(await codeOf(miss)).toBe('manifest_not_found');
 });
 it('reviews index lists current pointers with their region',async()=>{
  const {pub}=await seedReview(db);
  const out=await json(await reviewsIndex(get('/reviews?region=US')));
  expect(out.items).toEqual([{region:'US',month:'2026-10',status:'insufficient',generation:pub.generation,result_id:pub.result_id,updated_at:expect.any(String)}]);
  expect((await json(await reviewsIndex(get('/reviews?region=CN')))).items).toEqual([]);
 });
 it('review detail, judgment layer off: result, generation and catalog names; judgment_status disabled, no f4; no pointer → 404',async()=>{
  const {man,pub}=await seedReview(db);
  const out=await json(await reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})}));
  expect(out).toMatchObject({manifest_id:man.manifest_id,generation:pub.generation,judgment_status:'disabled',names:[{id:'US_CPI_YOY',name:{zh:'美国 CPI 同比',en:'US CPI YoY'}}]});
  expect((out.result as {result_id:string}).result_id).toBe(pub.result_id);
  expect('f4' in out).toBe(false);expect(m.createF4Client).not.toHaveBeenCalled();
  const miss=await reviewDetail(get('/reviews/US/2026-09'),{params:Promise.resolve({region:'US',month:'2026-09'})});
  expect(miss.status).toBe(404);expect(await codeOf(miss)).toBe('review_not_found');
 });
 it('review detail, judgment layer on: the card known at the review cutoff as a number-free summary; F4 down → unavailable',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  await seedReview(db);
  const call=()=>reviewDetail(get('/reviews/US/2026-10'),{params:Promise.resolve({region:'US',month:'2026-10'})});
  const out=await json(await call());
  expect(out.judgment_status).toBe('ok');expect(out.f4).toEqual({summary:SUMMARY});
  expect(m.card).toHaveBeenCalledWith('US',{asOf:'2026-11-03'});
  expect(m.selectF4Mark).toHaveBeenCalledWith({card:CARD,detail:{judgment_id:'j1'},snapshotId:null});
  m.card.mockRejectedValueOnce(new Error('down'));
  const down=await call();
  expect(down.status).toBe(200);const b=await json(down);expect(b.judgment_status).toBe('unavailable');expect('f4' in b).toBe(false);
 });
 it('explanations GET returns only the caller\'s projections of that result id, private no-store',async()=>{
  const facts=await db.putManifest(body('explain_facts'));
  await db.claimExplanation({userId:USER,requestId:REQ,payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  await db.claimExplanation({userId:'99999999-9999-4999-8999-999999999999',requestId:REQ,payloadHash:'b'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  await db.claimExplanation({userId:USER,requestId:MID,payloadHash:'c'.repeat(64),subjectKind:'review',subjectId:'55555555-5555-4555-8555-555555555555',locale:'zh',manifestId:facts.manifest_id});
  db._userId(USER);
  const r=await listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`));
  expect(r.headers.get('cache-control')).toBe('private, no-store');
  const items=(await json(r)).items as {state:string;subject_id:string}[];
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({state:'running',subject_id:RID});
 });
 it('explanations GET recovers recorded completions, then expires the caller\'s dead runs: a reload after five minutes shows failed {abandoned}, never running',async()=>{
  let t=Date.parse('2026-11-07T00:00:00Z');db=memoryStrategyDb({now:()=>new Date(t)});m.db=db;
  const facts=await db.putManifest(body('explain_facts'));
  await db.claimExplanation({userId:USER,requestId:REQ,payloadHash:'a'.repeat(64),subjectKind:'review',subjectId:RID,locale:'zh',manifestId:facts.manifest_id});
  db._userId(USER);
  const expire=vi.spyOn(db,'expireExplanations');
  const call=async()=>((await json(await listExplanations(get(`/explanations?subject_kind=review&subject_id=${RID}`)))).items as {state:string;failure_codes:string[]}[])[0];
  expect(await call()).toMatchObject({state:'running'});
  t+=6*60_000;
  expect(await call()).toMatchObject({state:'failed',failure_codes:['abandoned']});
  expect(expire).toHaveBeenCalledWith(USER);
  expect(m.recover).toHaveBeenCalledWith({db,llm:{tag:'llm',userId:USER}},USER);
  expect(m.recover.mock.invocationCallOrder.at(-1)!).toBeLessThan(expire.mock.invocationCallOrder.at(-1)!);   // recovery runs before expiry
 });
});

describe('deviations (pure judgment route)',()=>{
 it('judgment layer off → 404 judgments_disabled without calling F4',async()=>{
  const r=await deviations(get('/deviations?region=US'));
  expect(r.status).toBe(404);expect(await codeOf(r)).toBe('judgments_disabled');
  expect(m.createF4Client).not.toHaveBeenCalled();expect(m.listDeviationCases).not.toHaveBeenCalled();
 });
 it('judgment layer on: 200 {cases, incomplete}; any F4 failure → 503 judgments_unavailable',async()=>{
  process.env.MACRO_JUDGMENTS_ENABLED='1';
  m.listDeviationCases.mockResolvedValueOnce({cases:[],incomplete:true});
  const r=await deviations(get('/deviations?region=CN'));
  expect(r.status).toBe(200);expect(await r.json()).toEqual({cases:[],incomplete:true});
  expect(m.listDeviationCases.mock.calls[0][1]).toBe('CN');
  m.listDeviationCases.mockRejectedValueOnce(new Error('F4 down'));
  const down=await deviations(get('/deviations?region=CN'));
  expect(down.status).toBe(503);expect(await codeOf(down)).toBe('judgments_unavailable');
 });
});

describe('review cron',()=>{
 const AUTH={authorization:'Bearer cron-secret'};
 const req=(qs:string,headers:Record<string,string>=AUTH)=>new Request(`https://alpha.example/api/cron/macro-review${qs}`,{headers});
 beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-03T06:00:00Z'));});
 it('bearer first: missing or wrong → 401; unset CRON_SECRET → 401',async()=>{
  expect((await cron(req('',{}))).status).toBe(401);
  expect((await cron(req('',{authorization:'Bearer nope'}))).status).toBe(401);
  delete process.env.CRON_SECRET;expect((await cron(req(''))).status).toBe(401);
  expect(m.port).not.toHaveBeenCalled();expect(m.runReview).not.toHaveBeenCalled();
 });
 it('flag off → 404; null port → 503',async()=>{
  delete process.env.MACRO_STRATEGY_ENABLED;expect((await cron(req(''))).status).toBe(404);
  process.env.MACRO_STRATEGY_ENABLED='1';m.port.mockReturnValue(null);
  const r=await cron(req(''));expect(r.status).toBe(503);expect(await codeOf(r)).toBe('macro_foundation_unavailable');
  expect(m.runReview).not.toHaveBeenCalled();
 });
 it.each(['?month=2026-11','?month=2026-12','?month=1999-12','?month=2026-13','?region=HK','?preview=2','?x=1','?month=2026-09&month=2026-08'])('rejects %s',async(qs)=>{
  expect((await cron(req(qs))).status).toBe(400);expect(m.runReview).not.toHaveBeenCalled();
 });
 it('scheduled run: newest closed month, US then CN, writes enabled',async()=>{
  const r=await cron(req(''));
  expect(r.status).toBe(200);
  const out=await json(r);
  expect(out).toMatchObject({ok:true,month:'2026-10',preview:false});
  expect((out.receipts as {region:string;outcome:string}[]).map(x=>[x.region,x.outcome])).toEqual([['US','advanced'],['CN','advanced']]);
  expect(m.runReview.mock.calls.map(c=>c.slice(1))).toEqual([['US','2026-10',{preview:false}],['CN','2026-10',{preview:false}]]);
  expect(m.runReview.mock.calls[0][0]).toEqual({port:PORT,db,codeVersion:'abc123'});
 });
 it('manual unit with preview',async()=>{
  const out=await json(await cron(req('?month=2026-09&region=CN&preview=1')));
  expect(m.runReview.mock.calls.map(c=>c.slice(1))).toEqual([['CN','2026-09',{preview:true}]]);
  expect(out).toMatchObject({ok:true,month:'2026-09',preview:true,receipts:[{region:'CN',outcome:'preview'}]});
 });
 it('a failed unit is reported by code only and turns the response into 500; the other region still runs',async()=>{
  m.runReview.mockResolvedValueOnce({region:'US',month:'2026-10',outcome:'failed',status:null,manifest_hash:null,manifest_id:null,result_id:null,generation:null,error:'secret detail from the port'});
  const r=await cron(req(''));
  expect(r.status).toBe(500);
  const text=await r.text();
  expect(text).not.toContain('secret detail');
  const out=JSON.parse(text) as {ok:boolean;receipts:{region:string;outcome:string;code?:string}[]};
  expect(out.ok).toBe(false);
  expect(out.receipts.map(x=>[x.region,x.outcome,x.code])).toEqual([['US','failed','review_failed'],['CN','advanced',undefined]]);
 });
 it('refuses without a code version',async()=>{
  m.code.mockReturnValue(null);
  const r=await cron(req(''));expect(r.status).toBe(503);expect(await codeOf(r)).toBe('code_version_unavailable');
 });
 it('vercel.json schedules the review cron on the 3rd at 06:00 UTC',()=>{
  const v=JSON.parse(readFileSync(resolve(process.cwd(),'vercel.json'),'utf8')) as {crons:{path:string;schedule:string}[]};
  expect(v.crons).toContainEqual({path:'/api/cron/macro-review',schedule:'0 6 3 * *'});
 });
});

describe('route helpers',()=>{
 it('readParams: whitelist and no repeats',()=>{
  expect([...readParams(new URL('https://a/x?region=US'),['region'])]).toEqual([['region','US']]);
  expect(()=>readParams(new URL('https://a/x?a=1'),['region'])).toThrow(ParamError);
  expect(()=>readParams(new URL('https://a/x?region=US&region=CN'),['region'])).toThrow(ParamError);
 });
 it('months',()=>{
  expect(reviewAsOfDate('2026-10')).toBe('2026-11-03');expect(reviewAsOfDate('2026-12')).toBe('2027-01-03');
  expect(lastClosedMonth(new Date('2026-01-03T00:00:00Z'))).toBe('2025-12');expect(lastClosedMonth(new Date('2026-01-02T23:59:59Z'))).toBe('2025-11');
  expect(isClosedMonth('2026-10',new Date('2026-11-03T00:00:00Z'))).toBe(true);expect(isClosedMonth('2026-10',new Date('2026-11-02T23:59:59Z'))).toBe(false);
  expect(isClosedMonth('2026-11',new Date('2026-11-30T23:59:59Z'))).toBe(false);
  expect(monthOf('2026-01')).toBe('2026-01');expect(()=>monthOf('2026-1')).toThrow(ParamError);expect(()=>monthOf(undefined)).toThrow(ParamError);
 });
 it('window and subject ids',()=>{
  expect(windowOf(undefined)).toBe(3);expect(windowOf('1')).toBe(1);expect(()=>windowOf('12')).toThrow(ParamError);
  expect(subjectIdOf('snapshot','snap:US:2026-11-03T06:02:00Z')).toBe('snap:US:2026-11-03T06:02:00Z');
  expect(subjectIdOf('review',RID.toUpperCase())).toBe(RID);expect(()=>subjectIdOf('review','CN:2026-09')).toThrow(ParamError);
  expect(()=>subjectIdOf('snapshot','a b')).toThrow(ParamError);expect(()=>subjectIdOf('review','US:2026-13')).toThrow(ParamError);expect(()=>subjectIdOf('review',undefined)).toThrow(ParamError);
 });
 it('canonicalExplainBody lowercases only a review UUID subject and leaves every other shape untouched',()=>{
  const UP='ABCDEF01-2345-4ABC-8DEF-0123456789AB';
  expect(canonicalExplainBody({request_id:REQ,subject:{kind:'review',id:UP},locale:'zh'})).toEqual({request_id:REQ,subject:{kind:'review',id:UP.toLowerCase()},locale:'zh'});
  const snap={request_id:REQ,subject:{kind:'snapshot',id:'Snap:US:X'},locale:'zh'};expect(canonicalExplainBody(snap)).toBe(snap);
  const odd={request_id:REQ,subject:{kind:'review',id:'CN:2026-09'},locale:'zh'};expect(canonicalExplainBody(odd)).toBe(odd);
  for(const v of [null,'x',[1],{subject:null},{subject:[]},{subject:{kind:'review',id:5}}])expect(canonicalExplainBody(v)).toBe(v);
 });
});
