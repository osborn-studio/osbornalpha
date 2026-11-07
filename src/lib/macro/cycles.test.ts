// Cycle segmentation (spec §6.2): plateau rule, trailing-median runs, merge/insufficient/gap rules, asset moves.
// Expected segments for the monthly fixtures were computed independently (Python reference of the same rule):
//   v[i]=i, 24 months            → up from idx12, confirmed idx17
//   v[i]=i≤23 else 46−i, 40 mon. → U idx12..31, D idx32..39 (medians idx26..31 are equal → direction continues)
//   same, 36 months              → the 4-month down run merges into the up segment
//   v[i]=i with idx20 missing    → U idx12..19, gap, U idx33..39 (two segments)
//   v[i]=i, 16 months            → 4-month up run with no previous segment → insufficient
import {describe,expect,it} from 'vitest';
import {CYCLES_VERSION,addMonths,assetChangeOverCycle,lastCompleteMonthEnd,monthEndAt,policyCycles,seriesCycles} from './cycles';
import type {PolicyEvent} from './events';
const ev=(d:string,bp:string):PolicyEvent=>({kind:'policy_target_change',region:'US',effective_date:d,upper_from:'0',upper_to:'0',lower_from:'0',lower_to:'0',change_bp:bp,source:'derived',evidence:['a','b','c','d'],version:'macro-events/1'});
const BASE=2020*12;   // idx 0 = 2020-01
const monthly=(vals:(number|null)[])=>vals.flatMap((v,i)=>v===null?[]:[{observation_id:`o${i}`,period_end:monthEndAt(BASE+i),value_text:String(v)}]);
const P={basis:'policy_events' as const,version:CYCLES_VERSION};
const S={basis:'trailing_median' as const,version:CYCLES_VERSION,event_count:null};

describe('calendar helpers',()=>{
 it('clamps month ends and finds the last complete month end',()=>{
  expect(addMonths('2024-01-31',1)).toBe('2024-02-29');
  expect(addMonths('2023-07-27',12)).toBe('2024-07-27');
  expect(lastCompleteMonthEnd('2026-10-30')).toBe('2026-09-30');
  expect(lastCompleteMonthEnd('2026-10-31')).toBe('2026-10-31');
  expect(monthEndAt(BASE+13)).toBe('2021-02-28');
 });
});

describe('policyCycles',()=>{
 const hikes=[ev('2022-03-17','25'),ev('2022-05-05','50'),ev('2023-07-27','25')];
 const cuts=[ev('2024-09-19','-50'),ev('2024-11-08','-25'),ev('2024-12-19','-25')];
 it('ends a hiking cycle at its last hike and records a plateau when ≥ 12 months pass before the next move',()=>{
  expect(policyCycles([...hikes,...cuts],'2025-06-30')).toEqual([
   {...P,direction:'up',start:'2022-03-17',end:'2023-07-27',ongoing:false,confirmed_at:'2022-03-17',event_count:3},
   {...P,direction:'plateau',start:'2023-07-27',end:'2024-09-18',ongoing:false,confirmed_at:'2024-07-27',event_count:0},
   {...P,direction:'down',start:'2024-09-19',end:'2025-06-30',ongoing:true,confirmed_at:'2024-09-19',event_count:3},
  ]);
 });
 it('opens an ongoing plateau once 12 months pass after the last move',()=>{
  expect(policyCycles(cuts,'2026-01-15')).toEqual([
   {...P,direction:'down',start:'2024-09-19',end:'2024-12-19',ongoing:false,confirmed_at:'2024-09-19',event_count:3},
   {...P,direction:'plateau',start:'2024-12-19',end:'2026-01-15',ongoing:true,confirmed_at:'2025-12-19',event_count:0},
  ]);
 });
 it('a direction flip within 12 months starts a new cycle the next day',()=>{
  expect(policyCycles([ev('2018-12-20','25'),ev('2019-08-01','-25')],'2019-10-31')).toEqual([
   {...P,direction:'up',start:'2018-12-20',end:'2019-07-31',ongoing:false,confirmed_at:'2018-12-20',event_count:1},
   {...P,direction:'down',start:'2019-08-01',end:'2019-10-31',ongoing:true,confirmed_at:'2019-08-01',event_count:1},
  ]);
 });
 it('no events → no cycles; events after lastDate or unsorted → error',()=>{
  expect(policyCycles([],'2026-01-01')).toEqual([]);
  expect(()=>policyCycles(cuts,'2024-10-01')).toThrow(/cycles_last_date_before_event/);
  expect(()=>policyCycles([cuts[1],cuts[0]],'2026-01-01')).toThrow(/cycles_unsorted_events/);
 });
});

describe('seriesCycles',()=>{
 it('a steady rise is one up segment confirmed at its 6th month',()=>{
  const r=seriesCycles(monthly(Array.from({length:24},(_,i)=>i)));
  expect(r).toEqual({cycles:[{...S,direction:'up',start:'2021-01-31',end:'2021-12-31',ongoing:true,confirmed_at:'2021-06-30'}],insufficient:[]});
 });
 it('rise then fall: equal medians continue the direction; a ≥ 6-month fall is its own segment',()=>{
  const r=seriesCycles(monthly(Array.from({length:40},(_,i)=>i<=23?i:46-i)));
  expect(r.cycles).toEqual([
   {...S,direction:'up',start:'2021-01-31',end:'2022-08-31',ongoing:false,confirmed_at:'2021-06-30'},
   {...S,direction:'down',start:'2022-09-30',end:'2023-04-30',ongoing:true,confirmed_at:'2023-02-28'},
  ]);
 });
 it('a run shorter than 6 months merges into the previous segment',()=>{
  const r=seriesCycles(monthly(Array.from({length:36},(_,i)=>i<=23?i:46-i)));
  expect(r.cycles).toEqual([{...S,direction:'up',start:'2021-01-31',end:'2022-12-31',ongoing:true,confirmed_at:'2021-06-30'}]);
 });
 it('a missing month breaks the count: two separate segments',()=>{
  const r=seriesCycles(monthly(Array.from({length:40},(_,i)=>i===20?null:i)));
  expect(r.cycles).toEqual([
   {...S,direction:'up',start:'2021-01-31',end:'2021-08-31',ongoing:false,confirmed_at:'2021-06-30'},
   {...S,direction:'up',start:'2022-10-31',end:'2023-04-30',ongoing:true,confirmed_at:'2023-03-31'},
  ]);
 });
 it('a too-short first run is insufficient and not a cycle',()=>{
  expect(seriesCycles(monthly(Array.from({length:16},(_,i)=>i)))).toEqual({cycles:[],insufficient:[{direction:'up',start:'2021-01-31',end:'2021-04-30'}]});
 });
 it('fewer than 12 months → nothing; bad input → error',()=>{
  expect(seriesCycles(monthly([1,2,3]))).toEqual({cycles:[],insufficient:[]});
  expect(()=>seriesCycles([{observation_id:'x',period_end:'2024-01-15',value_text:'1'}])).toThrow(/cycles_not_month_end/);
  expect(()=>seriesCycles([{observation_id:'a',period_end:'2024-02-29',value_text:'1'},{observation_id:'b',period_end:'2024-01-31',value_text:'1'}])).toThrow(/cycles_unsorted/);
 });
 it('decides on exact decimals (0.1 vs 0.10000000000000001 are equal as float64, not as decimals)',()=>{
  // idx 12..17 carry the larger value; only at idx17 do six of the twelve window values differ, so the median rises once
  const vals=Array.from({length:18},(_,i)=>i<12?'0.1':'0.10000000000000001');
  const r=seriesCycles(vals.map((v,i)=>({observation_id:`o${i}`,period_end:monthEndAt(BASE+i),value_text:v})));
  expect(r).toEqual({cycles:[],insufficient:[{direction:'up',start:'2021-06-30',end:'2021-06-30'}]});
 });
});

describe('assetChangeOverCycle',()=>{
 const asset=[{observation_id:'a1',period_end:'2022-03-31',value_text:'100'},{observation_id:'a2',period_end:'2023-07-31',value_text:'90.50'}];
 const yld=[{observation_id:'y1',period_end:'2022-03-31',value_text:'4.5'},{observation_id:'y2',period_end:'2023-07-31',value_text:'3.75'}];
 const cycle={start:'2022-03-17',end:'2023-07-27'};
 it('pct is a simple exact percent between month-end values',()=>{
  expect(assetChangeOverCycle(asset,cycle,'pct')).toEqual({start_period:'2022-03-31',end_period:'2023-07-31',start_value:'100',end_value:'90.5',change_text:'-9.5',change_kind:'pct',observation_ids:['a1','a2'],missing:null});
 });
 it('bp is the exact difference × 100; pp is the plain difference',()=>{
  expect(assetChangeOverCycle(yld,cycle,'bp').change_text).toBe('-75');
  expect(assetChangeOverCycle(yld,cycle,'pp').change_text).toBe('-0.75');
 });
 it('a missing endpoint stays missing (never 0)',()=>{
  const r=assetChangeOverCycle(asset,{start:'2022-03-17',end:'2023-09-01'},'pct');
  expect(r.change_text).toBeNull();expect(r.missing).toBe('end');expect(r.observation_ids).toEqual(['a1']);
  expect(assetChangeOverCycle([],cycle,'bp').missing).toBe('both');
 });
 it('a non-positive base cannot carry a percent change',()=>{
  expect(assetChangeOverCycle([{observation_id:'z',period_end:'2022-03-31',value_text:'0'},asset[1]],cycle,'pct').missing).toBe('non_positive_base');
 });
});
