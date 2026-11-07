// src/lib/macro/strategy/deviations.test.ts
import {describe,expect,it,vi} from 'vitest';
import {classifyDiffs,DEVIATION_CAP,deviationCase,HISTORY_PAGE,listDeviationCases,type FrozenObs} from './deviations';
import {F4Unavailable,type F4CardLite,type F4Client,type F4JudgmentDetail} from './f4-client';

const o=(series_id:string,period_end:string,vintage_id:string,value=1):FrozenObs=>({series_id,period_end,vintage_id,value});
const card=(id:string,as_of:string,over:Partial<F4CardLite>={}):F4CardLite=>({judgment_id:id,lifecycle:'settled',calibration:'insufficient',as_of,methodology:{id:'macro_regime',version:'v1'},selected:'overheat',...over});
const obsInput=(x:FrozenObs)=>({kind:'macro_observation',ref:{series_id:x.series_id,period_end:x.period_end,vintage_id:x.vintage_id},snapshot:{...x,unit:'pct',available_at:'2026-10-01T00:00:00Z'}});
function detail(id:string,reg:FrozenObs[],settled:FrozenObs[]|null,over:Partial<F4JudgmentDetail['settlements'][number]>={}):F4JudgmentDetail{
 return {judgment_id:id,as_of:'2026-10-15',selected:'overheat',inputs:[{kind:'macro_snapshot',ref:{snapshot_id:'s'},snapshot:{snapshot_id:'s'}},...reg.map(obsInput)],
  settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2026-12-01T00:00:00Z'},
   {settlement_id:'set-2',outcome:'miss',realized:'recession',evidence:settled===null?{note:'x'}:{observation_refs:settled.map(x=>({...x,available_at:'2027-01-01T00:00:00Z'}))},settled_at:'2027-02-01T00:00:00Z',...over} as F4JudgmentDetail['settlements'][number]]};
}

describe('classifyDiffs (spec §6.4 N13, exhaustive)',()=>{
 it('revised / unchanged / dropped / newly_available(later_period | backfill | new_series) with roles',()=>{
  const reg=[o('A','2026-08-31','v1'),o('A','2026-09-30','v1'),o('B','2026-09-30','v1'),o('C','2026-09-30','v1',2)];
  const set=[o('A','2026-08-31','v2'),o('A','2026-09-30','v1'),o('A','2026-10-31','v1'),o('C','2026-06-30','v1'),o('D','2026-09-30','v1',5)];
  expect(classifyDiffs(reg,set)).toEqual([
   {series_id:'A',period_end:'2026-08-31',role:'comparison',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v2',value:1}},
   {series_id:'A',period_end:'2026-09-30',role:'latest',kind:'unchanged',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v1',value:1}},
   {series_id:'A',period_end:'2026-10-31',role:'latest',kind:'newly_available',subkind:'later_period',registered:null,settled:{vintage_id:'v1',value:1}},
   {series_id:'B',period_end:'2026-09-30',role:'latest',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:1},settled:null},
   {series_id:'C',period_end:'2026-06-30',role:'latest',kind:'newly_available',subkind:'backfill',registered:null,settled:{vintage_id:'v1',value:1}},
   {series_id:'C',period_end:'2026-09-30',role:'latest',kind:'dropped',subkind:null,registered:{vintage_id:'v1',value:2},settled:null},
   {series_id:'D',period_end:'2026-09-30',role:'latest',kind:'newly_available',subkind:'new_series',registered:null,settled:{vintage_id:'v1',value:5}},
  ]);
 });
});

describe('deviationCase',()=>{
 it('builds a complete case from the latest settlement (a miss) with its settlement id and realized class',()=>{
  const c=deviationCase('US',card('j1','2026-10-15'),detail('j1',[o('A','2026-09-30','v1')],[o('A','2026-09-30','v2')]));
  expect(c).toEqual({judgment_id:'j1',settlement_id:'set-2',region:'US',as_of:'2026-10-15',selected:'overheat',realized:'recession',evidence_state:'complete',
   diffs:[{series_id:'A',period_end:'2026-09-30',role:'latest',kind:'revised',subkind:null,registered:{vintage_id:'v1',value:1},settled:{vintage_id:'v2',value:1}}]});
 });
 it('evidence without observation_refs → evidence_incomplete, no recomputation',()=>{
  expect(deviationCase('US',card('j1','2026-10-15'),detail('j1',[o('A','2026-09-30','v1')],null))).toMatchObject({evidence_state:'evidence_incomplete',diffs:[]});
 });
 it('skips hits, other methods / versions, unsettled cards',()=>{
  const d=detail('j1',[],[]);
  expect(deviationCase('US',card('j1','x'),{...d,settlements:[{...d.settlements[1],outcome:'hit'}]})).toBeNull();
  expect(deviationCase('US',card('j1','x',{methodology:{id:'macro_regime',version:'v2'}}),d)).toBeNull();
  expect(deviationCase('US',card('j1','x',{methodology:{id:'other',version:'v1'}}),d)).toBeNull();
  expect(deviationCase('US',card('j1','x',{lifecycle:'open'}),d)).toBeNull();
 });
 it('realized may be an object with selected / primary_state; numeric strings in values are accepted',()=>{
  const d=detail('j1',[],[]);d.settlements[1].realized={primary_state:'recovery'};
  expect(deviationCase('US',card('j1','x'),d)?.realized).toBe('recovery');
  const e=detail('j1',[],[]);e.settlements[1].evidence={observation_refs:[{series_id:'A',period_end:'2026-09-30',vintage_id:'v1',value:'2.5'}]};
  expect(deviationCase('US',card('j1','x'),e)?.diffs[0].settled).toEqual({vintage_id:'v1',value:2.5});
 });
});

function fakeF4(pages:F4CardLite[][],details:Record<string,F4JudgmentDetail>,latest:F4CardLite|null=card('j0','2026-10-15')):F4Client&{before:(string|null)[]}{
 const before:(string|null)[]=[];let i=0;
 return {before,latestRegimeCard:async()=>latest,judgmentDetail:async(id)=>details[id]??null,history:async(_id,b)=>{before.push(b);return pages[i++]??[];}};
}
describe('listDeviationCases (spec §6.4 enumeration)',()=>{
 it('pages until an empty page, using the last as_of as the cursor, and keeps settled misses only',async()=>{
  const f4=fakeF4([[card('j0','2026-10-15'),card('j1','2026-09-15'),card('j2','2026-08-15',{lifecycle:'open'})],[card('j3','2026-07-15')],[]],
   {j0:detail('j0',[],[]),j1:{...detail('j1',[],[]),settlements:[{outcome:'hit',realized:'overheat',evidence:null,settled_at:'2027-01-01T00:00:00Z'}]},j3:detail('j3',[o('A','2026-06-30','v1')],[o('A','2026-06-30','v1')])});
  const r=await listDeviationCases(f4,'CN');
  expect(f4.before).toEqual([null,'2026-08-15','2026-07-15']);
  expect(r.incomplete).toBe(false);
  expect(r.cases.map(c=>c.judgment_id)).toEqual(['j0','j3']);
  expect(r.cases[1].region).toBe('CN');
 });
 it('no card → empty, complete',async()=>{
  expect(await listDeviationCases(fakeF4([],{},null),'US')).toEqual({cases:[],incomplete:false});
 });
 it('more than 5000 cards → incomplete',async()=>{
  const day=(n:number)=>new Date(Date.UTC(2026,0,1)-n*86_400_000).toISOString().slice(0,10);
  const pages=Array.from({length:11},(_,p)=>Array.from({length:500},(_,k)=>card(`j${p}-${k}`,day(p*500+k+1))));
  const f4=fakeF4(pages,{});const detailSpy=vi.spyOn(f4,'judgmentDetail');
  const r=await listDeviationCases(f4,'US');
  expect(r.incomplete).toBe(true);
  expect(detailSpy.mock.calls.length).toBeLessThanOrEqual(DEVIATION_CAP);
 });
 it('a cursor that does not move stops with incomplete instead of looping',async()=>{
  const f4=fakeF4([[card('a','2026-05-01')],[card('b','2026-05-01')],[card('c','2026-04-01')]],{});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(true);
  expect(f4.before).toEqual([null,'2026-05-01']);
 });
 it('a full page whose boundary ties on as_of → incomplete, and the walk still collects the later pages',async()=>{
  const full=Array.from({length:HISTORY_PAGE},(_,k)=>card(`t${k}`,k<HISTORY_PAGE-2?`2026-0${1+(k%5)}-01`:'2025-12-31'));
  full.sort((a,b)=>a.as_of<b.as_of?1:a.as_of>b.as_of?-1:0);
  const f4=fakeF4([full,[card('next','2025-12-30',{lifecycle:'open'})],[]],{});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(true);
  expect(f4.before).toEqual([null,'2025-12-31','2025-12-30']);
 });
 it('singleton at the boundary: a full page ending [… T+1, T] with an unseen card at T behind the cursor → incomplete',async()=>{
  const day=(n:number)=>new Date(Date.UTC(2026,0,1)-n*86_400_000).toISOString().slice(0,10);
  const full=Array.from({length:HISTORY_PAGE},(_,k)=>card(`u${k}`,day(k+1)));   // distinct as_of values; the last two differ
  const T=day(HISTORY_PAGE);
  const f4=fakeF4([full,[]],{});   // F4 holds another card at T, which the exclusive `before=T` page can never return
  const r=await listDeviationCases(f4,'US');
  expect(f4.before).toEqual([null,T]);
  expect(r.incomplete).toBe(true);
 });
 it('short pages (even with an as_of tie) keep the result complete',async()=>{
  const f4=fakeF4([[card('s1','2024-01-02'),card('s2','2024-01-02')],[card('s3','2024-01-01')],[]],{});
  expect((await listDeviationCases(f4,'US')).incomplete).toBe(false);
  expect(f4.before).toEqual([null,'2024-01-02','2024-01-01']);
 });
 it('F4Unavailable propagates',async()=>{
  const f4=fakeF4([],{});f4.latestRegimeCard=async()=>{throw new F4Unavailable();};
  await expect(listDeviationCases(f4,'US')).rejects.toBeInstanceOf(F4Unavailable);
 });
});
