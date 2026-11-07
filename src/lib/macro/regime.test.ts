// src/lib/macro/regime.test.ts
import {describe,expect,it} from 'vitest';
import {MACRO_CATALOG,catalogById,regimeInputsOf} from './catalog';
import {METHODOLOGY_VERSION,RULES,RULES_VERSION,WEIGHTS_V1,classifyRegime,matchRule,pickStates,regionWeights} from './regime';
import type {RegimeInput} from './regime';
import type {SeriesType} from './types';

let n=0;
const o=(period_end:string,value_text:string)=>({observation_id:`obs-${++n}`,period_end,value_text});

// US fixture — hand-computed (weights from WEIGHTS_V1; denominator Σ US = 25+15+10+15+10+5+15+5 = 100)
//  US_DFF      25  v=4.33, Δ=0 → policy.2_5to4_5 {rec .3, ov .2, st .1, recess .1} → 7.5 / 5 / 2.5 / 2.5
//  US_DGS10    15  4.25 − 3.95 = 0.30 ≥ 0.25 → bond.d3m.ge25bp {ov .5, st .3} → ov 7.5, st 4.5
//  US_DTWEXBGS 10  (126.5/122 − 1)×100 = 3.6885 ≥ 2 → fx.chg3m.ge2 {ov .4, st .3} → ov 4, st 3
//  US_CPI_YOY  15  2.9 → infl.2to3 {rec .4, ov .3, st .1, recess .1} → 6 / 4.5 / 1.5 / 1.5
//  US_UNRATE   10  4.1 − 3.8 = 0.3 (decimal; float gives 0.2999…) → labor.d3m.ge0_3 {st .4, recess .5} → st 4, recess 5
//  US_PPI_FD_YOY 5 3.4 → infl.3to4 {ov .6, st .3} → ov 3, st 1.5
//  scores: rec 7.5+6 = 13.5; ov 5+7.5+4+4.5+3 = 24; st 2.5+4.5+3+1.5+4+1.5 = 17; recess 2.5+1.5+5 = 9; Σ = 63.5
//  norm: 13.5/63.5 = 0.212598, 24/63.5 = 0.377953, 17/63.5 = 0.267717, 9/63.5 = 0.141732
//  primary overheat, secondary stagflation, margin_pp = 100×(24−17)/63.5 = 11.023622
//  coverage = 80/100 = 0.8; uncovered = 20 (ISM 15 missing + VIX 5 restricted)
//  growth_axis: only UNRATE → 10×(0+0−.4−.5)/10 = −0.9
//  inflation_axis: CPI 15×(.3+.1−.4−.1) = −1.5; PPI 5×(.6+.3) = 4.5; (−1.5+4.5)/20 = 0.15
const US:RegimeInput={region:'US',series:{
 US_DFF:{latest:o('2026-10-31','4.33'),prev:o('2026-09-30','4.33'),prev3m:o('2026-07-31','4.33')},
 US_DGS10:{latest:o('2026-10-31','4.25'),prev:o('2026-09-30','4.15'),prev3m:o('2026-07-31','3.95')},
 US_DTWEXBGS:{latest:o('2026-10-31','126.5'),prev:o('2026-09-30','125'),prev3m:o('2026-07-31','122')},
 US_CPI_YOY:{latest:o('2026-09-30','2.9'),prev:o('2026-08-31','2.6'),prev3m:o('2026-06-30','2.7')},
 US_UNRATE:{latest:o('2026-09-30','4.1'),prev:o('2026-08-31','4'),prev3m:o('2026-06-30','3.8')},
 US_PPI_FD_YOY:{latest:o('2026-09-30','3.4'),prev:o('2026-08-31','3.1')},
}};

// CN fixture — hand-computed (denominator Σ CN = 10+15+15+5+10+10+15+5+10+10+20 = 125)
//  CN_CPI_YOY 10  0.3 → infl.lt1 {rec .1, recess .7} → 1 / 7
//  CN_PPI_YOY 15  −2.3 → infl.lt1 → 1.5 / 10.5
//  CN_PMI_MFG 15  49.8 → pmi.47to50 {rec .1, st .4, recess .4} → 1.5 / 6 / 6
//  CN_GDP_YOY  5  v=4.8, Δ = 4.8−5.2 < 0 → no rule matches (4.5 ≤ v and Δ < 0) → uncovered
//  CN_M2_YOY  10  8.4, Δ = −0.4 → liq.ge8.down {rec .2, ov .4, st .2} → 2 / 4 / 2
//  CN_EXPORT_YOY 10  8.3, Δ = +5.9 → growth.ge5.up {rec .5, ov .3} → 5 / 3
//  CN_CGB_10Y 15  1.75 − 2.05 = −0.30 ≤ −0.25 → bond.d3m.le-25bp {rec .2, recess .5} → 3 / 7.5
//  CN_USDCNY_CP 5  (712.68/718.5 − 1)×100 = −0.8100 → between ±2 → no rule → uncovered
//  matched = 10+15+15+10+10+15 = 75 → coverage 75/125 = 0.6 (boundary: NOT < 0.6, so classified)
//  scores: rec 1+1.5+1.5+2+5+3 = 14; ov 4+3 = 7; st 6+2 = 8; recess 7+10.5+6+7.5 = 31; Σ = 60
//  norm: .233333 / .116667 / .133333 / .516667; primary recession, secondary recovery, margin 100×17/60 = 28.333333
//  growth_axis: PMI 15×(.1−.4−.4) = −10.5; EXPORT 10×(.5+.3) = 8; (−2.5)/25 = −0.1
//  inflation_axis: CPI 10×(−.1−.7) = −8; PPI 15×(−.8) = −12; −20/25 = −0.8; uncovered = 125−75 = 50
const CN:RegimeInput={region:'CN',series:{
 CN_CPI_YOY:{latest:o('2026-09-30','0.3'),prev:o('2026-08-31','-0.4')},
 CN_PPI_YOY:{latest:o('2026-09-30','-2.3'),prev:o('2026-08-31','-2.9')},
 CN_PMI_MFG:{latest:o('2026-10-31','49.8'),prev:o('2026-09-30','49.8')},
 CN_GDP_YOY:{latest:o('2026-09-30','4.8'),prev:o('2026-06-30','5.2'),prev3m:o('2026-06-30','5.2')},
 CN_M2_YOY:{latest:o('2026-09-30','8.4'),prev:o('2026-08-31','8.8')},
 CN_EXPORT_YOY:{latest:o('2026-09-30','8.3'),prev:o('2026-08-31','2.4')},
 CN_CGB_10Y:{latest:o('2026-10-31','1.75'),prev:o('2026-09-30','1.86'),prev3m:o('2026-07-31','2.05')},
 CN_USDCNY_CP:{latest:o('2026-10-31','712.68'),prev:o('2026-09-30','711.2'),prev3m:o('2026-07-31','718.5')},
}};

describe('versions and weights',()=>{
 it('pins the methodology and rules versions',()=>{
  expect(METHODOLOGY_VERSION).toBe('v1.0');
  expect(RULES_VERSION).toBe('macro-regime-rules/1.0');
 });
 it('WEIGHTS_V1 equals the catalog weight of every indicator (spec §0.2 M14)',()=>{
  for(const def of MACRO_CATALOG.filter(d=>d.role==='indicator'))expect([def.id,def.weight]).toEqual([def.id,WEIGHTS_V1[def.id]??0]);
  for(const id of Object.keys(WEIGHTS_V1)){
   const def=catalogById(id);
   expect(def,id).toBeDefined();
   expect(def!.role).toBe('indicator');
   expect(def!.type).not.toBeNull();
  }
 });
 it('includes missing/restricted items in the denominator; regime inputs are exactly the weighted active items',()=>{
  expect(Object.values(regionWeights('US')).reduce((a,b)=>a+b,0)).toBe(100);
  expect(Object.values(regionWeights('CN')).reduce((a,b)=>a+b,0)).toBe(125);
  for(const region of ['US','CN'] as const){
   const active=Object.keys(regionWeights(region)).filter(id=>catalogById(id)!.status==='active').sort();
   expect(regimeInputsOf(region).map(d=>d.id).sort()).toEqual(active);
  }
 });
});

describe('matchRule boundaries (spec §5.2)',()=>{
 const cases:[SeriesType,number,number|null,number|null,string|null][]=[
  ['policy_rate',2.49,null,null,'policy.lt2_5'],['policy_rate',2.5,null,null,'policy.2_5to4_5'],['policy_rate',4.49,null,null,'policy.2_5to4_5'],
  ['policy_rate',4.5,null,0,'policy.ge4_5.up'],['policy_rate',4.5,null,-0.25,'policy.ge4_5.down'],['policy_rate',4.5,null,null,null],
  ['bond_yield',4,0.25,null,'bond.d3m.ge25bp'],['bond_yield',4,0.2499,null,'bond.d3m.other'],['bond_yield',4,-0.25,null,'bond.d3m.le-25bp'],
  ['bond_yield',4,-0.2499,null,'bond.d3m.other'],['bond_yield',4,null,0.5,null],
  ['fx',100,2,null,'fx.chg3m.ge2'],['fx',100,1.99,null,null],['fx',100,-2,null,'fx.chg3m.le-2'],['fx',100,-1.99,null,null],['fx',7.12,null,null,null],
  ['inflation_yoy',0.99,null,null,'infl.lt1'],['inflation_yoy',1,null,null,'infl.1to2'],['inflation_yoy',1.99,null,null,'infl.1to2'],
  ['inflation_yoy',2,null,null,'infl.2to3'],['inflation_yoy',3,null,null,'infl.2to3'],['inflation_yoy',3.01,null,null,'infl.3to4'],
  ['inflation_yoy',4,null,null,'infl.3to4'],['inflation_yoy',4.01,null,null,'infl.gt4'],
  ['pmi',55,null,null,'pmi.ge55'],['pmi',54.99,null,null,'pmi.50to55'],['pmi',50,null,null,'pmi.50to55'],['pmi',49.99,null,null,'pmi.47to50'],
  ['pmi',47,null,null,'pmi.47to50'],['pmi',46.99,null,null,'pmi.lt47'],
  ['labor_rate',4,0.3,null,'labor.d3m.ge0_3'],['labor_rate',4,0.29,null,null],['labor_rate',4,-0.1,null,'labor.d3m.le-0_1'],['labor_rate',4,-0.09,null,null],['labor_rate',4,null,null,null],
  ['growth_yoy',5,null,0,'growth.ge5.up'],['growth_yoy',5,null,-0.1,null],['growth_yoy',5,null,null,null],['growth_yoy',4.49,null,null,'growth.lt4_5'],['growth_yoy',4.5,null,1,null],
  ['liquidity_yoy',8,null,0,'liq.ge8.up'],['liquidity_yoy',8,null,-0.1,'liq.ge8.down'],['liquidity_yoy',8,null,null,null],['liquidity_yoy',7.99,null,null,'liq.lt8'],
  ['risk_index',14.99,null,null,'risk.lt15'],['risk_index',15,null,null,'risk.15to25'],['risk_index',24.99,null,null,'risk.15to25'],['risk_index',25,null,null,'risk.ge25'],
  ['asset_price',100,1,1,null],
 ];
 it.each(cases)('%s v=%s d3=%s d1=%s → %s',(type,v,d3,d1,expected)=>{
  expect(matchRule(type,v,d3,d1)?.id??null).toBe(expected);
 });
 it('rule ids are unique and every rule has bilingual labels',()=>{
  const all=Object.values(RULES).flat();
  expect(new Set(all.map(r=>r.id)).size).toBe(all.length);
  for(const r of all){expect(r.label.zh.length).toBeGreaterThan(0);expect(r.label.en.length).toBeGreaterThan(0);}
 });
});

describe('type isolation',()=>{
 it('an fx level of 7.12 never matches a policy_rate rule',()=>{
  expect(RULES.fx.every(r=>!r.id.startsWith('policy.'))).toBe(true);
  expect(matchRule('fx',7.12,null,null)).toBeNull();
  expect(matchRule('policy_rate',7.12,null,0)?.id).toBe('policy.ge4_5.up');   // same number, own type only
  const r=classifyRegime({region:'CN',series:{CN_USDCNY_CP:{latest:o('2026-10-31','7.12')}}});
  expect(r.contributions).toEqual([]);
  expect(r.regime).toBeNull();
 });
});

describe('classifyRegime',()=>{
 it('US fixture matches the hand-computed result',()=>{
  const r=classifyRegime(US);
  expect(r.regime).toEqual({primary_state:'overheat',secondary_state:'stagflation',
   scores:{recovery:13.5,overheat:24,stagflation:17,recession:9},
   norm:{recovery:0.212598,overheat:0.377953,stagflation:0.267717,recession:0.141732},
   coverage:0.8,margin_pp:11.023622,growth_axis:-0.9,inflation_axis:0.15});
  expect(r.uncoveredWeight).toBe(20);
  expect(r.contributions.map(c=>c.rule_id)).toEqual(['policy.2_5to4_5','bond.d3m.ge25bp','fx.chg3m.ge2','infl.2to3','labor.d3m.ge0_3','infl.3to4']);
  const unrate=r.contributions.find(c=>c.series_id==='US_UNRATE')!;
  expect(unrate).toEqual({series_id:'US_UNRATE',observation_id:US.series.US_UNRATE.latest.observation_id,rule_id:'labor.d3m.ge0_3',weight:10,
   support:{stagflation:0.4,recession:0.5},contribution:{recovery:0,overheat:0,stagflation:4,recession:5}});
 });
 it('CN fixture matches the hand-computed result (coverage exactly 0.6 is classified)',()=>{
  const r=classifyRegime(CN);
  expect(r.regime).toEqual({primary_state:'recession',secondary_state:'recovery',
   scores:{recovery:14,overheat:7,stagflation:8,recession:31},
   norm:{recovery:0.233333,overheat:0.116667,stagflation:0.133333,recession:0.516667},
   coverage:0.6,margin_pp:28.333333,growth_axis:-0.1,inflation_axis:-0.8});
  expect(r.uncoveredWeight).toBe(50);
  expect(r.contributions.map(c=>c.series_id)).not.toContain('CN_GDP_YOY');
  expect(r.contributions.map(c=>c.series_id)).not.toContain('CN_USDCNY_CP');
 });
 it('coverage < 0.6 → regime null, contributions and uncovered weight still reported',()=>{
  const {CN_CGB_10Y:_drop,...rest}=CN.series;
  const r=classifyRegime({region:'CN',series:rest});   // matched 60/125 = 0.48
  expect(r.regime).toBeNull();
  expect(r.contributions).toHaveLength(5);
  expect(r.uncoveredWeight).toBe(65);
 });
 it('a missing comparison period means the rule does not match (no neutral fill)',()=>{
  const r=classifyRegime({region:'US',series:{...US.series,US_DGS10:{latest:o('2026-10-31','4.25'),prev:o('2026-09-30','4.15')}}});
  expect(r.contributions.map(c=>c.series_id)).not.toContain('US_DGS10');
  expect(r.uncoveredWeight).toBe(35);
  expect(r.regime!.coverage).toBe(0.65);
 });
 it('ignores series of the other region and ids outside WEIGHTS_V1',()=>{
  const r=classifyRegime({region:'US',series:{...US.series,CN_PMI_MFG:{latest:o('2026-10-31','60')},US_DGS10_D:{latest:o('2026-11-03','4.3')}}});
  expect(r).toEqual(classifyRegime(US));
 });
 it('is deterministic',()=>{expect(classifyRegime(CN)).toEqual(classifyRegime(CN));});
});

describe('pickStates tie order (recovery < overheat < stagflation < recession)',()=>{
 it('all equal → recovery then overheat',()=>{
  expect(pickStates({recovery:0.25,overheat:0.25,stagflation:0.25,recession:0.25})).toEqual({primary:'recovery',secondary:'overheat'});
 });
 it('tie for first between overheat and stagflation → overheat primary, stagflation secondary',()=>{
  expect(pickStates({recovery:0,overheat:0.5,stagflation:0.5,recession:0})).toEqual({primary:'overheat',secondary:'stagflation'});
 });
 it('only one nonzero → secondary null',()=>{
  expect(pickStates({recovery:0,overheat:0,stagflation:0,recession:1})).toEqual({primary:'recession',secondary:null});
 });
});
