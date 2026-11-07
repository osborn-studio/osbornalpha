// src/lib/judgments/calibration.test.ts
// spec §14.1 calibration bullets. Every expected number comes from
// fixtures/judgments/calibration/expected.json, produced by expected.py (independent plain-Python
// oracle, run by the plan author, not the implementer). The decoder below only re-expands the
// compact fixture encoding; it computes nothing.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {ALGORITHM_VERSION,HOLDOUT_MIN,addDays,averageRanks,entryOf,evaluateCohort,median,optionsOf,quantile7,selectIndependent,windowEndOf} from './calibration';
import type {CohortEntry,Forecast} from './calibration';
import {envelope,uuidOf} from './testing/envelopes';
import type {Kind} from './types';

type Raw=[number,string,number,number,'s'|'o'|'v'|'w',0|1,unknown,number|string|null];
type Block=Raw|{seq:[number,string,number,number,number];f:unknown[];y:(number|string|null)[]};
interface Case{name:string;kind:Kind;opts:{threshold_n:number;ece_max:number;embargo_days:number};note:string;blocks?:Block[];derive?:{from:string;drop:number[]};expected:Record<string,unknown>&{selected:number[]}}
const FIXTURE=JSON.parse(readFileSync(join(process.cwd(),'fixtures/judgments/calibration/expected.json'),'utf8')) as {algorithm:string;holdout_min:number;cases:Case[]};
const dayOf=(d:number)=>new Date(Date.UTC(2024,0,1+d)).toISOString().slice(0,10);
const LIFE={s:'settled',o:'open',v:'void',w:'withdrawn'} as const;
const expand=(blocks:Block[]):Raw[]=>blocks.flatMap(b=>Array.isArray(b)?[b]:b.f.map((f,i):Raw=>[b.seq[0]+i,b.seq[1],b.seq[2]+b.seq[3]*i,b.seq[2]+b.seq[3]*i+b.seq[4],'s',0,f,b.y[i]]));
function forecast(kind:Kind,f:unknown):Forecast{
 if(kind==='probability')return {kind,p:f as number};
 if(kind==='categorical'){const [selected,margin]=f as [string,number|null];return {kind,selected,margin_pp:margin};}
 if(kind==='score')return {kind,value:f as number};
 const [low,high,nominal]=f as [number,number,number];return {kind,low,high,nominal_coverage:nominal};
}
function entriesOf(c:Case):CohortEntry[]{
 const raws=c.derive?expand(FIXTURE.cases.find(x=>x.name===c.derive!.from)!.blocks!).filter(r=>!c.derive!.drop.includes(r[0])):expand(c.blocks!);
 return raws.map(r=>{const i=r[1].indexOf(':');return {judgment_id:uuidOf(r[0]),subject_type:r[1].slice(0,i),subject_key:r[1].slice(i+1),market:null,as_of:dayOf(r[2]),window_end:dayOf(r[3]),retrospective:r[5]===1,lifecycle:LIFE[r[4]],settlement_id:null,forecast:forecast(c.kind,r[6]),y:r[7]};});
}
/** Numbers to 1e-9 (summation order may differ in the last bits); every other value and every key set exactly. */
function close(actual:unknown,expected:unknown,path:string):void{
 if(typeof expected==='number'){expect(typeof actual,path).toBe('number');expect(actual as number,path).toBeCloseTo(expected,9);return;}
 if(expected===null||typeof expected!=='object'){expect(actual,path).toEqual(expected);return;}
 if(Array.isArray(expected)){expect(Array.isArray(actual),path).toBe(true);expect((actual as unknown[]).length,path).toBe(expected.length);expected.forEach((v,i)=>close((actual as unknown[])[i],v,`${path}[${i}]`));return;}
 expect(actual!==null&&typeof actual==='object',path).toBe(true);
 expect(Object.keys(actual as object).sort(),path).toEqual(Object.keys(expected).sort());
 for(const [k,v] of Object.entries(expected))close((actual as Record<string,unknown>)[k],v,`${path}.${k}`);
}
const run=(name:string)=>{
 const c=FIXTURE.cases.find(x=>x.name===name);
 if(!c)throw new Error(`fixture case ${name} missing`);
 const ev=evaluateCohort(c.kind,entriesOf(c),c.opts);
 const {selected,...expected}=c.expected;
 const {entries,...actual}=ev;
 close(actual,expected,name);
 expect(entries.filter(e=>e.selected_for_independent).map(e=>Number(e.judgment_id.slice(24))).sort((a,b)=>a-b),`${name}.selected`).toEqual(selected);
 return ev;
};

describe('calibration fixture (independent Python oracle)',()=>{
 it('matches the algorithm version and the holdout minimum',()=>{
  expect(FIXTURE.algorithm).toBe(ALGORITHM_VERSION);
  expect(FIXTURE.holdout_min).toBe(HOLDOUT_MIN);
 });
 it('perfect forecast: Brier 0, skill 1, ECE 0',()=>{const ev=run('perfect_forecast');expect(ev.metrics.brier).toBe(0);});
 it('constant 0.5: Brier 0.25 = climatology, skill 0',()=>{const ev=run('constant_half');expect(ev.metrics.brier).toBeCloseTo(0.25,12);});
 it('zero climatology: skill is null, not a division by zero',()=>{const ev=run('constant_half_all_hits');expect(ev.metrics.brier_skill).toBeNull();});
 it('ten equal bins with Wilson intervals; an empty bin keeps null hit rate; p = 1 lands in the last bin',()=>{
  const ev=run('skill_and_bins');
  expect(ev.reliability).toHaveLength(10);
  expect(ev.reliability[2]).toMatchObject({n:0,mean_p:null,hit_rate:null,wilson_low:null,wilson_high:null});
  expect(ev.reliability[9].n).toBe(10);
 });
 it('ece_raw (all independent) differs from ece_raw_holdout (last 30%); holdout ECE 0.2 > 0.10 fails',()=>{const ev=run('ece_holdout');expect(ev.state).toBe('failed');});
 it('holdout samples overlapping a training target window are dropped',()=>{const ev=run('boundary_overlap');expect((ev.metrics.temporal_split as {n_dropped_overlap:number}).n_dropped_overlap).toBe(5);});
 it('macro daily with 91-day windows: one independent sample per 91 days per region',()=>{const ev=run('macro_daily_91');expect(ev.n_independent).toBe(5);});
 it('same-stock consecutive calls are deduplicated by window; another stock is a separate stream',()=>{run('same_stock_dedup');});
 it('embargo_days spaces the windows further',()=>{expect(run('embargo_0').n_independent).toBe(10);expect(run('embargo_2').n_independent).toBe(5);});
 it('G01 counterexample: raw holdout ECE 0.12, isotonic-mapped ≈ 0 → failed (the gate tests raw p)',()=>{
  const ev=run('g01_counterexample');
  expect(ev.state).toBe('failed');
  const t=ev.metrics.temporal_split as {ece_raw_holdout:number;ece_mapped_holdout:number};
  expect(t.ece_raw_holdout).toBeCloseTo(0.12,9);expect(t.ece_mapped_holdout).toBeLessThan(1e-9);
  expect(ev.isotonic_segments).not.toBeNull();
 });
 it('acceptance example 4: 99 independent → insufficient, 100 → calibrated; open/void/withdrawn/retrospective are counted, not sampled',()=>{
  expect(run('acceptance4_99').state).toBe('insufficient');
  const ev=run('acceptance4_100');
  expect(ev.state).toBe('calibrated');
  expect(ev).toMatchObject({n_registered:110,n_settled:104,n_independent:100,n_void:3,n_retrospective_excluded:4});
 });
 it('categorical: majority-class baseline, confusion matrix, margin_pp bins',()=>{
  expect(run('categorical_calibrated').state).toBe('calibrated');
  const failed=run('categorical_failed');
  expect(failed.state).toBe('failed');
  expect(failed.metrics.majority_rate).toBeCloseTo(0.7,12);
  expect(failed.reliability).toEqual([]);
 });
 it('interval: coverage vs nominal and width_ratio',()=>{expect(run('interval_failed').state).toBe('failed');expect(run('interval_calibrated').state).toBe('calibrated');});
 it('score: Spearman with tied ranks, tertiles, evaluated (never calibrated)',()=>{
  expect(run('score_ties').state).toBe('evaluated');
  expect(run('score_insufficient').state).toBe('insufficient');
  expect(run('score_binary').state).toBe('evaluated');
 });
 it('every fixture case is exercised by a test above',()=>{
  const used=['perfect_forecast','constant_half','constant_half_all_hits','skill_and_bins','ece_holdout','boundary_overlap','macro_daily_91','same_stock_dedup','embargo_0','embargo_2','g01_counterexample','acceptance4_99','acceptance4_100','categorical_calibrated','categorical_failed','interval_failed','interval_calibrated','score_ties','score_insufficient','score_binary'];
  expect(FIXTURE.cases.map(c=>c.name).sort()).toEqual([...used].sort());
 });
});

describe('helpers',()=>{
 it('windowEndOf per target kind (session_index uses ceil(n × 1.52) calendar days)',()=>{
  expect(windowEndOf({kind:'date',date:'2026-03-01'})).toBe('2026-03-01');
  expect(windowEndOf({kind:'period',period:'2024-02'})).toBe('2024-02-29');
  expect(windowEndOf({kind:'period',period:'2026-12'})).toBe('2026-12-31');
  expect(windowEndOf({kind:'fiscal_period',period_end:'2026-06-30',calendar:{anchor_period_end:'2026-03-31',months:3},extrapolated:true})).toBe('2026-06-30');
  expect(windowEndOf({kind:'session_index',base_date:'2026-01-02',n:5})).toBe('2026-01-10');
  expect(addDays('2024-02-28',1)).toBe('2024-02-29');
 });
 it('selectIndependent is greedy, per stream, and order-independent',()=>{
  const e=(id:number,as:string,end:string):CohortEntry=>({judgment_id:uuidOf(id),subject_type:'issuer',subject_key:'k',market:null,as_of:as,window_end:end,retrospective:false,lifecycle:'settled',settlement_id:null,forecast:{kind:'probability',p:0.5},y:1});
  const list=[e(3,'2026-01-05','2026-01-09'),e(1,'2026-01-01','2026-01-05'),e(2,'2026-01-05','2026-01-06'),e(4,'2026-01-06','2026-01-07')];
  expect([...selectIndependent(list,0)].sort()).toEqual([uuidOf(1),uuidOf(4)]);
  expect([...selectIndependent([...list].reverse(),0)].sort()).toEqual([uuidOf(1),uuidOf(4)]);
 });
 it('average ranks, type-7 quantile, median',()=>{
  expect(averageRanks([10,20,10,30])).toEqual([1.5,3,1.5,4]);
  expect(quantile7([1,2,3,4],0.9)).toBeCloseTo(3.7,12);
  expect(median([3,1,2])).toBe(2);expect(median([4,1,2,3])).toBe(2.5);expect(median([])).toBeNull();
 });
 it('optionsOf: §8.4 defaults, method overrides, invalid values rejected',()=>{
  expect(optionsOf({})).toEqual({threshold_n:100,ece_max:0.1,embargo_days:0,window_years:3});
  expect(optionsOf({threshold_n:50,ece_max:'0.05',embargo_days:7,window_years:5,grace_days:30})).toEqual({threshold_n:50,ece_max:0.05,embargo_days:7,window_years:5});
  for(const bad of [{threshold_n:0},{threshold_n:1.5},{ece_max:0},{ece_max:'x'},{embargo_days:-1},{window_years:0}] as Record<string,number|string>[])expect(()=>optionsOf(bad)).toThrow('invalid_calibration_params');
 });
 it('entryOf: abstained → null; lifecycle from the latest settlement (reopened → open); y per kind; market from price_return only',()=>{
  expect(entryOf(envelope({judgment:{abstained:true,abstain_reason:'missing_input',claim:null,condition:null,horizon:null,target:null,label_policy:null,settle_after:null,settle_by:null}}))).toBeNull();
  expect(entryOf(envelope())).toMatchObject({lifecycle:'open',y:null,market:null,window_end:'2026-01-12',forecast:{kind:'probability',p:0.7}});
  expect(entryOf(envelope({settlement:{outcome:'hit'}}))).toMatchObject({lifecycle:'settled',y:1});
  expect(entryOf(envelope({settlement:{outcome:'miss'}}))).toMatchObject({y:0});
  expect(entryOf(envelope({settlement:{kind:'reopened',outcome:null,realized:null,reason:'fix'}}))).toMatchObject({lifecycle:'open',y:null});
  expect(entryOf(envelope({settlement:{kind:'void',outcome:null,realized:null,reason:'no_data'}}))).toMatchObject({lifecycle:'void',y:null});
  const cat=envelope({judgment:{kind:'categorical',claim:{selected:'recovery',classes:['recovery','overheat','stagflation','recession'],scores_are_not_probabilities:true,margin_pp:7.5}},settlement:{realized:{value:'overheat',unit:null,from:null,to:null,label_policy:'cutoff_vintage'}}});
  expect(entryOf(cat)).toMatchObject({forecast:{kind:'categorical',selected:'recovery',margin_pp:7.5},y:'overheat'});
  const price=envelope({judgment:{condition:{resolver:'price_return',params:{ticker:'600519',market:'A',adjustment:'qfq',source:'eastmoney',base_date:'2026-01-02'},predicate:{op:'>',rhs:0},text:{zh:'涨',en:'up'}}}});
  expect(entryOf(price)!.market).toBe('A');
 });
 it('settled price windows end at the frozen end bar, not at ceil(n × 1.52): a holiday / suspension stretch keeps overlapping outcomes dependent (P1-09)',()=>{
  const cond=(base:string)=>({resolver:'price_return' as const,params:{ticker:'600519',market:'A' as const,adjustment:'qfq' as const,source:'eastmoney' as const,base_date:base},predicate:{op:'>' as const,rhs:0},text:{zh:'涨',en:'up'}});
  const sess=(base:string)=>({kind:'session_index' as const,base_date:base,n:5});
  const realized=(from:string,to:string)=>({value:0.02,unit:'ratio',from,to,label_policy:'first_observed' as const});
  // n=5 from 2026-01-30: the scan estimate is 2026-02-07, but the Spring Festival closure puts the 5th session on 2026-02-24.
  const holiday=envelope({judgment:{n:1,subject_type:'issuer',as_of:'2026-01-30',condition:cond('2026-01-30'),target:sess('2026-01-30')},settlement:{resolver:'price_return',realized:realized('2026-01-30','2026-02-24')}});
  expect(windowEndOf(sess('2026-01-30'))).toBe('2026-02-07');
  expect(entryOf(holiday)!.window_end).toBe('2026-02-24');
  // A suspended stock: 5 sessions span two months.
  const suspended=envelope({judgment:{n:3,as_of:'2026-03-02',condition:cond('2026-03-02'),target:sess('2026-03-02')},settlement:{resolver:'price_return',realized:realized('2026-03-02','2026-05-06')}});
  expect(entryOf(suspended)!.window_end).toBe('2026-05-06');
  // Unsettled / void price judgments and non-price judgments keep the target-derived end.
  expect(entryOf(envelope({judgment:{n:4,as_of:'2026-01-30',condition:cond('2026-01-30'),target:sess('2026-01-30')}}))!.window_end).toBe('2026-02-07');
  expect(entryOf(envelope({judgment:{n:5,as_of:'2026-01-30',condition:cond('2026-01-30'),target:sess('2026-01-30')},settlement:{kind:'void',outcome:null,realized:null,reason:'no_data'}}))!.window_end).toBe('2026-02-07');
  expect(entryOf(envelope({settlement:{outcome:'hit'}}))!.window_end).toBe('2026-01-12');   // fact_metric: realized.to is not a window end
  // Selection: a same-stock judgment registered 2026-02-10 overlaps the holiday-stretched window → not independent.
  const next=envelope({judgment:{n:2,as_of:'2026-02-10',condition:cond('2026-02-10'),target:sess('2026-02-10')},settlement:{settlement_id:uuidOf(700002),resolver:'price_return',realized:realized('2026-02-10','2026-02-27')}});
  const entries=[holiday,next].map(x=>entryOf(x)!);
  expect([...selectIndependent(entries,0)]).toEqual([uuidOf(1)]);
 });
});
