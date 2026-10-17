import {describe,expect,it} from 'vitest';
import {compareWithScorecard,importCalls,mapCall,parseCallsJournal,summarizeCalls,weekOfMonday,type HiphonCall} from './calls-import';

const call=(over:Partial<HiphonCall>={}):HiphonCall=>({kind:'call',call_id:'2026-07-01-TESTSH-001',ts_utc:'2026-07-01T02:00:00Z',exchange_session:'A:2026-07-01',ticker:'000001.TEST',name:'合成股份',market:'A',rating:'buy',thesis:'合成：需求回暖，估值低位',entry_basis:'next_open',entry_price_ref:10,target_pct:18,stop_price:9.2,stop_pct:-8,size_pct:5,horizon_days:250,signal_mix:['rsi_oversold','north_accum'],chain_role:'bottleneck',evidence:'high',source:'test',...over});
const journal=(rows:unknown[])=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';

describe('parseCallsJournal',()=>{
 it('accepts call and event records, rejects unknown kinds, missing fields and bad timestamps',()=>{
  const ok=parseCallsJournal(journal([call(),{kind:'event',call_id:'2026-07-01-TESTSH-001',ts_utc:'2026-08-01T07:00:00Z',event:'manual_close',note:'cut'}]));
  expect(ok.calls).toHaveLength(1);expect(ok.events).toHaveLength(1);
  expect(()=>parseCallsJournal(journal([{...call(),kind:'trade'}]))).toThrow(/kind/);
  expect(()=>parseCallsJournal(journal([{...call(),rating:'yolo'}]))).toThrow(/rating/);
  expect(()=>parseCallsJournal(journal([{...call(),ts_utc:'yesterday'}]))).toThrow(/ts_utc/);
  expect(()=>parseCallsJournal(journal([{kind:'event',call_id:'x',ts_utc:'2026-08-01T07:00:00Z',event:'hit_target'}]))).toThrow(/event/);
  expect(()=>parseCallsJournal(journal([call(),call()]))).toThrow(/duplicate call_id/);
  expect(parseCallsJournal('\n\n').calls).toEqual([]);
 });
});
describe('mapCall',()=>{
 it('maps a call to a DRAFT historical thesis and a frozen human_baseline decision',()=>{
  const m=mapCall(call());
  expect(m.thesis).toMatchObject({title:'[hiphon-pm] 2026-07-01-TESTSH-001',invalidation_conditions:['止损 9.2（-8%）'],watch_metrics:['目标 +18%','持有上限 250 个交易日'],next_review_at:'2026-07-01'});
  expect(m.thesis.body).toContain('合成：需求回暖');expect(m.thesis.body).toContain('rsi_oversold');expect(m.thesis.body).toContain('evidence: high');
  expect(m.decision).toMatchObject({arm:'human_baseline',action:'adopt',frozen_at:'2026-07-01T02:00:00Z',week_of:'2026-06-29',card_id:'hiphon:2026-07-01-TESTSH-001',reason:'合成：需求回暖，估值低位'});
  expect(mapCall(call({rating:'hold'})).decision.action).toBe('shadow');
  expect(mapCall(call({rating:'sell'})).decision.action).toBe('reject');
  expect(mapCall(call({rating:'add'})).decision.action).toBe('adopt');
  expect(mapCall(call({stop_price:undefined as any,stop_pct:-8})).thesis.invalidation_conditions).toEqual(['止损 -8%']);
 });
 it('computes the UTC Monday of the call week',()=>{
  expect(weekOfMonday('2026-09-06T23:38:36Z')).toBe('2026-08-31'); // Sunday → previous Monday
  expect(weekOfMonday('2026-09-07T00:00:00Z')).toBe('2026-09-07');
 });
});
describe('summarize and compare with scorecard',()=>{
 it('counts by rating and checks the scorecard totals',()=>{
  const calls=[call(),call({call_id:'c2',rating:'hold'}),call({call_id:'c3',rating:'add'})];
  const s=summarizeCalls(calls,[]);
  expect(s).toMatchObject({calls:3,by_rating:{buy:1,hold:1,add:1},events:0});
  expect(compareWithScorecard(s,{closed:{n:0,hits:0,hit_rate:null,by_rating:{}},open:{n:3,unrealized_avg_pct:1.2}})).toMatchObject({consistent:true,differences:[]});
  const bad=compareWithScorecard(s,{closed:{n:1,hits:1,hit_rate:100,by_rating:{buy:{n:2,hit_rate:50}}},open:{n:1,unrealized_avg_pct:0}});
  expect(bad.consistent).toBe(false);expect(bad.differences.join(' ')).toMatch(/total/);
  expect(compareWithScorecard(s,null)).toMatchObject({consistent:null});
 });
});
describe('importCalls (injected dependencies)',()=>{
 const deps=()=>{
  const theses=new Map<string,string>(),decisions:any[]=[],outcomes:any[]=[];
  return {theses,decisions,outcomes,io:{
   theses:{find:async(title:string)=>theses.get(title)??null,create:async(input:any)=>{const id=`t-${theses.size+1}`;theses.set(input.title,id);return id;}},
   ledger:{existingDecisions:async()=>new Map(decisions.map((d,i)=>[d.card_id,`d-${i+1}`])),existingOutcomeEvaluationIds:async()=>new Set(outcomes.map(o=>o.evaluation_id)),recordDecision:async(input:any)=>{decisions.push(input);return {id:`d-${decisions.length}`,created_at:'x'};},recordOutcome:async(input:any)=>{outcomes.push(input);return {id:`o-${outcomes.length}`,judged_at:'x'};}},
  }};
 };
 it('imports each call once, links events to outcomes, and is idempotent',async()=>{
  const d=deps();const text=journal([call(),call({call_id:'c2',rating:'hold'}),{kind:'event',call_id:'2026-07-01-TESTSH-001',ts_utc:'2026-08-01T07:00:00Z',event:'manual_close',note:'thesis broken'}]);
  const first=await importCalls({journal:text,scorecard:null,dryRun:false,...d.io});
  expect(first).toMatchObject({calls:2,imported:2,skipped:0,outcomes:1,theses_created:2});
  expect(d.decisions.map(x=>x.action)).toEqual(['adopt','shadow']);
  expect(d.outcomes[0]).toMatchObject({decision_id:'d-1',window_weeks:50,judged_by:'hiphon-pm-journal',price_result:{state:'closed',reason:'manual',note:'thesis broken'}});
  const again=await importCalls({journal:text,scorecard:null,dryRun:false,...d.io});
  expect(again).toMatchObject({imported:0,skipped:2,outcomes:0,theses_created:0,outcomes_unmatched:[]});
  expect(d.decisions).toHaveLength(2);expect(d.outcomes).toHaveLength(1);
 });
 it('resumes an interrupted import: decisions already committed get their missing outcomes without duplicates',async()=>{
  const d=deps();const text=journal([call(),{kind:'event',call_id:'2026-07-01-TESTSH-001',ts_utc:'2026-08-01T07:00:00Z',event:'manual_close',note:'cut'}]);
  // Simulate a crash after the decision was written but before the outcome.
  d.decisions.push(mapCall(call()).decision);
  const resumed=await importCalls({journal:text,scorecard:null,dryRun:false,...d.io});
  expect(resumed).toMatchObject({imported:0,skipped:1,outcomes:1,outcomes_unmatched:[]});
  expect(d.outcomes[0]).toMatchObject({decision_id:'d-1',evaluation_id:'hiphon-journal:2026-07-01-TESTSH-001:2026-08-01T07:00:00Z'});
  expect(await importCalls({journal:text,scorecard:null,dryRun:false,...d.io})).toMatchObject({outcomes:0});
  expect(d.outcomes).toHaveLength(1);
 });
 it('dry-run writes nothing but reports the plan and scorecard consistency',async()=>{
  const d=deps();
  const r=await importCalls({journal:journal([call()]),scorecard:{closed:{n:0,hits:0,hit_rate:null,by_rating:{}},open:{n:1,unrealized_avg_pct:0}},dryRun:true,...d.io});
  expect(r).toMatchObject({calls:1,imported:0,planned:1,scorecard:{consistent:true}});
  expect(d.decisions).toHaveLength(0);expect(d.theses.size).toBe(0);
 });
 it('previews new-call outcomes once without mutating dependencies and matches real-run plan counts',async()=>{
  const d=deps(),event={kind:'event',call_id:call().call_id,ts_utc:'2026-08-01T07:00:00Z',event:'manual_close'};
  const text=journal([call(),event,event]);
  const decisions=new Map<string,string>(),outcomes=new Set<string>();
  const io={...d.io,ledger:{...d.io.ledger,existingDecisions:async()=>decisions,existingOutcomeEvaluationIds:async()=>outcomes}};
  const preview=await importCalls({journal:text,scorecard:null,dryRun:true,...io});
  expect(preview).toMatchObject({planned:1,outcomes_planned:1,imported:0,outcomes:0,outcomes_unmatched:[]});
  expect(d.decisions).toHaveLength(0);expect(d.outcomes).toHaveLength(0);expect(d.theses.size).toBe(0);
  expect(decisions.size).toBe(0);expect(outcomes.size).toBe(0);
  const actual=await importCalls({journal:text,scorecard:null,dryRun:false,...io});
  expect(actual).toMatchObject({planned:preview.planned,outcomes_planned:preview.outcomes_planned,imported:1,outcomes:1,outcomes_unmatched:[]});
  expect(d.decisions).toHaveLength(1);expect(d.outcomes).toHaveLength(1);
 });

});
