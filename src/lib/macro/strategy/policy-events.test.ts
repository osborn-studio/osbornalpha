// policy-events.ts (spec §5.4 N9): single-target events, the exact-date 2008-12-15/16 switch, gaps, P2 range events, reads.
import {describe,expect,it} from 'vitest';
import {VERSIONS} from './contract';
import type {EventInput,StrategyPolicyEvent} from './contract';
import {inputRole,manifestBuilder,readState} from './manifest';
import {EVENTS_PURPOSE,mergePolicyEvents,readPolicyEvents,US_TARGET_LOWER_ID,US_TARGET_SINGLE_ID,US_TARGET_UPPER_ID} from './policy-events';
import {memoryStrategyPort,type StrategyReadPort} from './port';
import {daily,fedTargetFixture,fixture} from './testing/fixture';

const row=(id:string,d:string,v:string):EventInput=>({observation_id:id,period_end:d,value_text:v});
const PORT=memoryStrategyPort(fixture());
const derive=(u:readonly EventInput[],l:readonly EventInput[])=>PORT.derivePolicyEvents(u,l);
const override=(base:StrategyReadPort,over:Partial<StrategyReadPort>):StrategyReadPort=>new Proxy(base,{get:(t,k,r)=>k in over?(over as Record<PropertyKey,unknown>)[k]:Reflect.get(t,k,r)});
const SINGLE=[row('s1','2008-10-07','2'),row('s2','2008-10-08','1.5'),row('s3','2008-10-29','1'),row('s4','2008-12-15','1.00')];
const UPPER=[row('u1','2008-12-16','0.25'),row('u2','2015-12-17','0.5')];
const LOWER=[row('l1','2008-12-16','0'),row('l2','2015-12-17','0.25')];
const brief=(e:StrategyPolicyEvent)=>[e.effective_date,e.basis,e.change_bp];

describe('mergePolicyEvents',()=>{
 it('emits single-target events, one verified switch event and the P2 range events, ascending',()=>{
  const r=mergePolicyEvents(derive,SINGLE,UPPER,LOWER);
  expect(r.gaps).toEqual([]);
  expect(r.events.map(brief)).toEqual([['2008-10-08','single_target','-50'],['2008-10-29','single_target','-50'],['2008-12-16','single_to_range','-75'],['2015-12-17','range','25']]);
  expect(r.events[0]).toEqual({kind:'policy_target_change',region:'US',effective_date:'2008-10-08',upper_from:'2',upper_to:'1.5',lower_from:'2',lower_to:'1.5',change_bp:'-50',source:'derived',evidence:['s1','s2','s1','s2'],version:VERSIONS.events,basis:'single_target'});
  expect(r.events[2]).toEqual({kind:'policy_target_change',region:'US',effective_date:'2008-12-16',upper_from:'1',upper_to:'0.25',lower_from:'1',lower_to:'0',change_bp:'-75',source:'derived',evidence:['s4','u1','s4','l1'],version:VERSIONS.events,basis:'single_to_range'});
 });
 it('reads the switch values from the observations, not from constants',()=>{
  const r=mergePolicyEvents(derive,[row('s','2008-12-15','1.25')],[row('u','2008-12-16','0.5')],[row('l','2008-12-16','0.25')]);
  expect(r.events.map(e=>[e.upper_from,e.upper_to,e.lower_to,e.change_bp])).toEqual([['1.25','0.5','0.25','-75']]);
 });
 it('switch change_bp always comes from the upper bound: unchanged upper, moved lower → a 0 bp event (no invented direction)',()=>{
  const r=mergePolicyEvents(derive,[row('s','2008-12-15','1')],[row('u','2008-12-16','1')],[row('l','2008-12-16','0.75')]);
  expect(r.events.map(e=>[e.basis,e.upper_to,e.lower_to,e.change_bp])).toEqual([['single_to_range','1','0.75','0']]);
  expect(r.gaps).toEqual([]);
 });
 it.each([
  ['upper starts a day late',SINGLE,[row('u1','2008-12-17','0.25')],LOWER,'upper_first_not_2008-12-16'],
  ['lower missing',SINGLE,UPPER,[],'lower_missing'],
  ['single target ends early',SINGLE.slice(0,3),UPPER,LOWER,'single_target_last_not_2008-12-15'],
  ['single target absent while the range starts at the switch',[],UPPER,LOWER,'single_target_missing'],
 ])('%s → no switch event, explicit gap',(_n,s,u,l,reason)=>{
  const r=mergePolicyEvents(derive,s,u,l);
  expect(r.events.some(e=>e.basis==='single_to_range')).toBe(false);
  expect(r.gaps).toHaveLength(1);
  expect(r.gaps[0].kind).toBe('transition_unverified');expect(r.gaps[0].near).toBe('2008-12-16');expect(r.gaps[0].reason).toContain(reason);
 });
 it('a range history that starts after the switch with no single target needs no switch',()=>{
  const r=mergePolicyEvents(derive,[],[row('u1','2015-12-16','0.25'),row('u2','2015-12-17','0.5')],[row('l1','2015-12-16','0'),row('l2','2015-12-17','0.25')]);
  expect(r).toEqual({events:[expect.objectContaining({effective_date:'2015-12-17',basis:'range',change_bp:'25'})],gaps:[]});
 });
 it('rejects unsorted input and is deterministic',()=>{
  expect(()=>mergePolicyEvents(derive,[SINGLE[1],SINGLE[0]],UPPER,LOWER)).toThrow(/events_unsorted:single/);
  expect(JSON.stringify(mergePolicyEvents(derive,SINGLE,UPPER,LOWER))).toBe(JSON.stringify(mergePolicyEvents(derive,[...SINGLE],[...UPPER],[...LOWER])));
 });
});

describe('readPolicyEvents',()=>{
 it('reads the three sources asOf the cutoff and finds the verified switch in the Fed fixture',async()=>{
  const b=manifestBuilder(memoryStrategyPort(fixture({observations:fedTargetFixture()})),'2026-11-03T00:00:00Z');
  const r=await readPolicyEvents(b);
  expect(r.gaps).toEqual([]);
  const sw=r.events.filter(e=>e.basis==='single_to_range');
  expect(sw).toHaveLength(1);expect(sw[0].effective_date).toBe('2008-12-16');
  expect(r.events.every(e=>e.basis==='range'?e.effective_date>'2008-12-16':e.effective_date<='2008-12-16')).toBe(true);
  const m=b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'});
  expect(readState(m,US_TARGET_SINGLE_ID,EVENTS_PURPOSE)).toBe('ok');
 });
 it('freezes exactly the rows that derive and verify every event, including the transition tuple',async()=>{
  const b=manifestBuilder(memoryStrategyPort(fixture({observations:fedTargetFixture()})),'2026-11-03T00:00:00Z');
  const r=await readPolicyEvents(b);
  const m=b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'});
  const byId=new Map(m.inputs.map(i=>[i.observation_id,i]));
  for(const e of r.events)for(const id of e.evidence)expect(byId.has(id),`${e.effective_date} evidence ${id}`).toBe(true);
  for(const e of r.events){   // each event re-derives from its frozen evidence rows alone
   const [uf,ut,lf,lt]=e.evidence.map(id=>byId.get(id)!.value_text);
   expect([uf,ut,lf,lt].map(Number)).toEqual([e.upper_from,e.upper_to,e.lower_from,e.lower_to].map(Number));
  }
  const tuple=m.inputs.filter(i=>i.period_end==='2008-12-15'||i.period_end==='2008-12-16').map(i=>i.role).sort();
  expect(tuple).toEqual([inputRole(EVENTS_PURPOSE,US_TARGET_SINGLE_ID,'evidence'),inputRole(EVENTS_PURPOSE,US_TARGET_LOWER_ID,'evidence'),inputRole(EVENTS_PURPOSE,US_TARGET_UPPER_ID,'evidence')].sort());
  expect(m.inputs.every(i=>i.role.endsWith(':evidence')&&i.source.kind==='history')).toBe(true);
  expect(m.inputs.length).toBe(new Set(r.events.flatMap(e=>[...e.evidence])).size);   // the tuple rows are evidence of the switch event here
 });
 it('a truncated source gives no events, a history_truncated gap and a truncated read state',async()=>{
  const obs=daily('US_FED_TARGET_D',[['2008-12-15','1']]);
  const port=override(memoryStrategyPort(fixture({observations:obs})),{seriesHistory:async(id)=>{if(id===US_TARGET_SINGLE_ID)throw new Error('truncated');return [];}});
  const b=manifestBuilder(port,'2026-11-03T00:00:00Z');
  expect(await readPolicyEvents(b)).toEqual({events:[],gaps:[{kind:'history_truncated',reason:US_TARGET_SINGLE_ID,near:'2026-11-03'}]});
  expect(readState(b.build({kind:'cycle_table',params:{boundary:'event_day'},methodVersion:'m/1',codeVersion:'test'}),US_TARGET_SINGLE_ID,EVENTS_PURPOSE)).toBe('truncated');
 });
});
