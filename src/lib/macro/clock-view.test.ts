// Clock projection contract tests (P5 draft 8 §§3.3–3.4).
import {describe,it,expect,vi} from 'vitest';
import {buildClockView,clockMeta,gateObservations,gateRecord,gateSnapshot,regimeStatusOf} from './clock-view';
import {CATALOG_VERSION,catalogById} from './catalog';
import {METHODOLOGY_VERSION,RULES_VERSION,classifyRegime} from './regime';
import type {RegimeInput} from './regime';
import type {ObservationRow,SnapshotRecord,RegimeRecord,RegimeContribution} from './types';
import type {ClockInput} from './clock-view';
import type {F4Match,MethodManifest} from './clock-contract';
const norm={recovery:.355769,overheat:.403846,stagflation:.163462,recession:.076923};
const scores={recovery:18.5,overheat:21,stagflation:8.5,recession:4};
const obs=(id:string,date:string,value:string):ObservationRow=>({observation_id:`${id}:${date}`,series_id:id,period_end:date,value_text:value,version:1,available_at:'2026-10-01',availability_basis:'first_seen',ingested_at:'2026-10-01',status:'ok',retrieval_id:null,locator:null,derived_from:null,transform:null,code_version:'v1',batch_id:'b'});
const c=(id:string,weight:number,rule_id:string,support:RegimeContribution['support']):RegimeContribution=>({series_id:id,observation_id:`${id}:2026-09-30`,weight,rule_id,support,contribution:{recovery:weight*(support.recovery??0),overheat:weight*(support.overheat??0),stagflation:weight*(support.stagflation??0),recession:weight*(support.recession??0)}});
function fx():ClockInput{
 const observations=[...[
  ['US_CPI_YOY','2.6','2.5','2.4'],['US_DFF','3.5','3.6','3.6'],['US_DGS10','4','3.9','3.7'],['US_UNRATE','4.1','4.2','4.3'],
 ].flatMap(([id,v,p,p3])=>[obs(id,'2026-09-30',v),obs(id,'2026-08-31',p),obs(id,'2026-06-30',p3)]),obs('US_DTWEXBGS','2026-09-30','102.4'),obs('US_DTWEXBGS','2026-08-31','101.4')];
 const snapshot:SnapshotRecord={snapshot_id:'snap',region:'US',as_of:'2026-10-01',created_at:'2026-10-01',revision:1,methodology_version:METHODOLOGY_VERSION,catalog_version:CATALOG_VERSION,observation_ids:observations.map(x=>x.observation_id),history_ids:[],catalog_counts:{verified:6,missing:1,restricted:1},status:'active',failure_reason:null};
 const rec:RegimeRecord={snapshot_id:'snap',region:'US',rules_version:RULES_VERSION,uncovered_weight:35,contributions:[c('US_DFF',25,'policy.2_5to4_5',{recovery:.3,overheat:.2,stagflation:.1,recession:.1}),c('US_DGS10',15,'bond.d3m.ge25bp',{overheat:.5,stagflation:.3}),c('US_CPI_YOY',15,'infl.2to3',{recovery:.4,overheat:.3,stagflation:.1,recession:.1}),c('US_UNRATE',10,'labor.d3m.le-0_1',{recovery:.5,overheat:.4})],regime:{primary_state:'overheat',secondary_state:'recovery',scores:{...scores},norm:{...norm},coverage:.65,margin_pp:4.807692,growth_axis:.9,inflation_axis:-.1}};
 const f4=vi.fn(async():Promise<F4Match>=>({status:'card',judgment_id:'j',card:{selected:'overheat',lifecycle:'open',calibration:'pending',methodology:{id:'macro_regime',version:'v1',href:'/m'},as_of:'2026-10-01'},claim:{selected:'overheat',distribution:{...norm},margin_pp:4.8077,catalog_version:CATALOG_VERSION,scores_are_not_probabilities:true}}));
 return {snapshot,observations,regimeRecord:rec,f4};
}
const rec=(x:ClockInput)=>x.regimeRecord!;
const status=async(x:ClockInput)=>buildClockView(x);
function manifestFx():ClockInput{
 const x=fx(),C=new Map(rec(x).contributions.map(c=>[c.series_id,c]));
 const ids=['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY','US_ISM_PMI','US_VIX'];
 const rows:MethodManifest['rows']=ids.map(id=>{
  const def=catalogById(id)!,a=x.observations.filter(o=>o.series_id===id).sort((u,v)=>u.period_end.localeCompare(v.period_end)),latest=a.at(-1),prev=a.at(-2),prev3m=latest?a.find(o=>o.period_end==='2026-06-30'):undefined,c=C.get(id);
  const state=def.status==='missing'?'missing':def.status==='restricted'?'restricted':c?'matched':latest?'not_matched':'no_data';
  return {series_id:id,type:def.type,unit:def.unit,change_kind:def.changeKind,name:def.name,weight:def.weight,display_only:false,state,reason:def.reason??null,latest_observation_id:latest?.observation_id??null,prev_observation_id:prev?.observation_id??null,prev3m_observation_id:prev3m?.observation_id??null,matched:Boolean(c),rule_id:c?.rule_id??null,support:c?{recovery:c.support.recovery??0,overheat:c.support.overheat??0,stagflation:c.support.stagflation??0,recession:c.support.recession??0}:null,contribution:c?{...c.contribution}:null};
 });
 rec(x).method_manifest={version:'macro-method-manifest/1',weights_version:METHODOLOGY_VERSION,rules_version:RULES_VERSION,catalog_version:CATALOG_VERSION,denominator:100,rows};
 return x;
}
type FixtureSeries=[string,string,string,string,string,string?,string?];
function classifiedFx(region:'US'|'CN',series:FixtureSeries[]):ClockInput{
 const input:RegimeInput={region,series:{}};const observations:ObservationRow[]=[];
 for(const [id,latestDate,latestValue,prevDate,prevValue,p3Date,p3Value] of series){
  const latest={observation_id:`${id}:${latestDate}`,period_end:latestDate,value_text:latestValue};
  const prev={observation_id:`${id}:${prevDate}`,period_end:prevDate,value_text:prevValue};
  const prev3m=p3Date?{observation_id:`${id}:${p3Date}`,period_end:p3Date,value_text:p3Value!}:undefined;
  input.series[id]={latest,prev,prev3m};
  for(const o of [latest,prev,prev3m])if(o&&!observations.some(x=>x.observation_id===o.observation_id))observations.push(obs(id,o.period_end,o.value_text));
 }
 const result=classifyRegime(input),regime=result.regime!;
 const snapshot:SnapshotRecord={...fx().snapshot,snapshot_id:`${region}-classified`,region,observation_ids:observations.map(o=>o.observation_id)};
 const regimeRecord:RegimeRecord={snapshot_id:snapshot.snapshot_id,region,rules_version:RULES_VERSION,regime,contributions:result.contributions,uncovered_weight:result.uncoveredWeight};
 const r6=(n:number)=>Math.round(n*1e6)/1e6;
 const margin=r6(100*(regime.norm[regime.primary_state]-(regime.secondary_state?regime.norm[regime.secondary_state]:0)));
 const f4=async():Promise<F4Match>=>({status:'card',judgment_id:`${region}-j`,card:{selected:regime.primary_state,lifecycle:'open',calibration:'pending',methodology:{id:'macro_regime',version:'v1',href:'/m'},as_of:snapshot.as_of},claim:{selected:regime.primary_state,distribution:{...regime.norm},margin_pp:margin,catalog_version:CATALOG_VERSION,scores_are_not_probabilities:true}});
 return {snapshot,observations,regimeRecord,f4};
}
describe('clock view',()=>{
 it('clock.status.8 hand calculated projection',async()=>{
  const v=await status(fx());expect(v.status).toBe('ok');if(v.status!=='ok')return;
  expect(v.rows.map(r=>r.series_id)).toEqual(['US_DFF','US_DGS10','US_DTWEXBGS','US_CPI_YOY','US_UNRATE','US_PPI_FD_YOY','US_ISM_PMI','US_VIX']);
  expect(v.rows.map(r=>r.state)).toEqual(['matched','matched','not_matched','matched','matched','no_data','missing','restricted']);
  expect(v.summary).toMatchObject({scores,norm,primary:'overheat',secondary:'recovery',margin_pp:4.807692,coverage:.65,matched_weight:65,denominator:100,uncovered_weight:35,growth_axis:.9,inflation_axis:-.1,tolerance:.000005});
  expect(v.rows[0].comparisons.find(x=>x.period_end==='2026-08-31')?.roles).toEqual(['prev']);
  expect(v.rows[0].display_change).toEqual({kind:'bp',value_text:'-10'});
  expect(v.rows[3].display_change).toEqual({kind:'pp',value_text:'0.1'});
  expect(v.rows[2].display_change?.kind).toBe('pct');
  expect(v.quadrants.find(q=>q.regime==='overheat')?.drivers.map(d=>d.series_id)).toEqual(['US_DGS10','US_DFF','US_CPI_YOY']);
 });
 it.each([
  ['1.duplicate_series',(x:ClockInput)=>rec(x).contributions.push({...rec(x).contributions[0]})],
  ['1.foreign_observation',(x:ClockInput)=>{rec(x).contributions[0].observation_id='foreign';}],
  ['1.not_latest',(x:ClockInput)=>{rec(x).contributions[0].observation_id='US_DFF:2026-08-31';}],
  ['2.weight',(x:ClockInput)=>{rec(x).contributions[0].weight=24;}],
  ['2.cell',(x:ClockInput)=>{rec(x).contributions[0].contribution.overheat+=.01;}],
  ['4.uncovered',(x:ClockInput)=>{rec(x).uncovered_weight++;}],
  ['4.coverage',(x:ClockInput)=>{rec(x).regime!.coverage=.64;}],
  ['8.rule_id',(x:ClockInput)=>{rec(x).contributions[0].rule_id='policy.lt2_5';}],
  ['8.support',(x:ClockInput)=>{rec(x).contributions[0].support.overheat=.3;rec(x).contributions[0].contribution.overheat=7.5;}],
  ['3.score_sum',(x:ClockInput)=>{rec(x).regime!.scores.overheat++;}],
  ['5.norm',(x:ClockInput)=>{rec(x).regime!.norm.overheat+=.001;}],
  ['5.primary',(x:ClockInput)=>{rec(x).regime!.primary_state='recovery';}],
  ['5.margin',(x:ClockInput)=>{rec(x).regime!.margin_pp+=.01;}],
  ['6.axis',(x:ClockInput)=>{rec(x).regime!.growth_axis=.5;}],
 ] as const)('invariant.%s',async(name,mutate)=>{const x=fx();mutate(x);const spy=x.f4;const v=await status(x);expect(v.status).toBe('reconcile_failed');expect(v.diagnostics[0].code).toBe(`invariant_${name[0]}`);expect(v).not.toHaveProperty('summary');expect(spy).not.toHaveBeenCalled();});
 it('rounding tolerance boundary',async()=>{const x=fx();rec(x).regime!.scores.overheat+=.000004;expect((await status(x)).status).toBe('ok');rec(x).regime!.scores.overheat+=.000002;expect((await status(x)).diagnostics[0].code).toBe('invariant_3');});
 it('clock.status.2 snapshot and rules versions',async()=>{const x=fx();x.snapshot.catalog_version='old';expect((await status(x)).status).toBe('version_unsupported');x.snapshot.catalog_version=CATALOG_VERSION;rec(x).rules_version='old';expect((await status(x)).status).toBe('version_unsupported');expect(x.f4).not.toHaveBeenCalled();});
 it('clock.status.3 integrity and clock.status.4 missing record',async()=>{const x=fx();x.observations.pop();expect((await status(x)).status).toBe('integrity_error');const y=fx();y.regimeRecord=null;expect((await status(y)).status).toBe('record_missing');});
 it.each(['none','earlier','ineligible','unavailable'] as const)('clock.status.6 %s',async kind=>{const x=fx();x.f4=vi.fn(async():Promise<F4Match>=>kind==='earlier'?{status:kind,judgment_id:'j',earlier_snapshot_id:'prior'}:kind==='ineligible'?{status:kind,judgment_id:'j',lifecycle:'abstained',abstain_reason:'coverage'}:kind==='unavailable'?{status:kind,reason:'timeout'}:{status:kind});const v=await status(x);expect(v.status).toBe(`f4_${kind}`);expect(v).not.toHaveProperty('summary');});
 it('invariant.7.selected',async()=>{const x=fx();const card=(await x.f4()) as Extract<F4Match,{status:'card'}>;card.claim.selected='recession';x.f4=async()=>card;const v=await status(x);expect(v.status).toBe('f4_mismatch');expect(v.diagnostics[0].code).toBe('invariant_7');});
 it('regime status states',()=>{const x=fx();expect(regimeStatusOf(null,'US',true)).toBe('unknown');expect(regimeStatusOf(rec(x),'US',false)).toBe('unknown');expect(regimeStatusOf(rec(x),'US',true)).toBe('classified');rec(x).regime=null;expect(regimeStatusOf(rec(x),'US',true)).toBe('zero_score');rec(x).uncovered_weight=50;expect(regimeStatusOf(rec(x),'US',true)).toBe('coverage_below_threshold');});
 it('clock.status.3 rejects duplicate periods and surplus roles',async()=>{
  const x=fx();x.observations.push({...x.observations[0],observation_id:'duplicate'});x.snapshot.observation_ids.push('duplicate');expect((await status(x)).status).toBe('integrity_error');
  const y=fx();y.observations.push(obs('US_CPI_YOY','2026-07-31','2.5'));y.snapshot.observation_ids.push('US_CPI_YOY:2026-07-31');expect((await status(y)).status).toBe('integrity_error');
 });
 it('clock.status.7 rejects distribution and null regime',async()=>{
  const x=fx();const card=(await x.f4()) as Extract<F4Match,{status:'card'}>;card.claim.distribution.recovery+=.001;x.f4=async()=>card;expect((await status(x)).status).toBe('f4_mismatch');
  const y=fx();rec(y).regime=null;expect((await status(y)).status).toBe('f4_mismatch');
 });
 it('clock.status.9 projects a validated method manifest and rejects tampering',async()=>{
  const x=manifestFx(),rows=rec(x).method_manifest!.rows;
  expect((await status(x)).status).toBe('ok');
  rows[0].contribution!.overheat+=.01;expect((await status(x)).diagnostics[0].code).toBe('invariant_9');rows[0].contribution!.overheat-=.01;
  rows[0].latest_observation_id='US_DFF:2026-08-31';expect((await status(x)).diagnostics[0].code).toBe('invariant_9');rows[0].latest_observation_id='US_DFF:2026-09-30';
  rows[0].change_kind='pp';expect((await status(x)).diagnostics[0].code).toBe('invariant_9');
 });
 it('invariant.9.misclassified',async()=>{
  const x=manifestFx();rec(x).method_manifest!.rows[0].display_only=true;
  const v=await status(x);expect(v.status).toBe('reconcile_failed');expect(v.diagnostics[0].code).toBe('invariant_9');
  expect(v).not.toHaveProperty('summary');
 });

 it('gate helpers return the same ordered status as buildClockView',()=>{
  const x=fx();expect(gateSnapshot(x.snapshot)).toEqual({ok:true});expect(gateObservations(x.snapshot,x.observations)).toEqual({ok:true});expect(gateRecord(rec(x))).toEqual({ok:true});
  x.snapshot.catalog_version='old';expect(gateSnapshot(x.snapshot)).toMatchObject({ok:false,status:'version_unsupported'});x.snapshot.catalog_version=CATALOG_VERSION;
  expect(gateObservations(x.snapshot,x.observations.slice(1))).toMatchObject({ok:false,status:'integrity_error'});
  expect(gateRecord(null)).toMatchObject({ok:false,status:'record_missing'});rec(x).rules_version='old';expect(gateRecord(rec(x))).toMatchObject({ok:false,status:'version_unsupported'});
 });
 it('clockMeta projects status, regime_status and diagnostics',async()=>{
  const x=fx(),card=(await x.f4()) as Extract<F4Match,{status:'card'}>,diagnostics=[{code:'invariant_2',ids:['US_DFF']}];
  expect(clockMeta(x.snapshot,rec(x),'reconcile_failed',diagnostics,card)).toMatchObject({status:'reconcile_failed',regime_status:'unknown',diagnostics,f4:{judgment_id:'j',lifecycle:'open',methodology_version:'v1'}});
  expect(clockMeta(x.snapshot,rec(x),'f4_mismatch',diagnostics,card)).toMatchObject({status:'f4_mismatch',regime_status:'classified',diagnostics});
  expect(clockMeta(x.snapshot,null,'record_missing',[])).toMatchObject({status:'record_missing',regime_status:'unknown',snapshot:{rules_version:null}});
 });
 it.each([
  ['US',[
   ['US_DFF','2026-10-31','4.33','2026-09-30','4.33','2026-07-31','4.33'],
   ['US_DGS10','2026-10-31','4.25','2026-09-30','4.15','2026-07-31','3.95'],
   ['US_DTWEXBGS','2026-10-31','126.5','2026-09-30','125','2026-07-31','122'],
   ['US_CPI_YOY','2026-09-30','2.9','2026-08-31','2.6','2026-06-30','2.7'],
   ['US_UNRATE','2026-09-30','4.1','2026-08-31','4','2026-06-30','3.8'],
   ['US_PPI_FD_YOY','2026-09-30','3.4','2026-08-31','3.1'],
  ],11.023622],
  ['CN',[
   ['CN_CPI_YOY','2026-09-30','0.3','2026-08-31','-0.4'],
   ['CN_PPI_YOY','2026-09-30','-2.3','2026-08-31','-2.9'],
   ['CN_PMI_MFG','2026-10-31','49.8','2026-09-30','49.8'],
   ['CN_GDP_YOY','2026-09-30','4.8','2026-06-30','5.2','2026-06-30','5.2'],
   ['CN_M2_YOY','2026-09-30','8.4','2026-08-31','8.8'],
   ['CN_EXPORT_YOY','2026-09-30','8.3','2026-08-31','2.4'],
   ['CN_CGB_10Y','2026-10-31','1.75','2026-09-30','1.86','2026-07-31','2.05'],
   ['CN_USDCNY_CP','2026-10-31','712.68','2026-09-30','711.2','2026-07-31','718.5'],
  ],28.333333],
 ] as ['US'|'CN',FixtureSeries[],number][])('real classifier fixture %s reconciles to ok',async(region,series,margin)=>{
  const x=classifiedFx(region,series);expect(rec(x).regime?.margin_pp).toBe(margin);
  const v=await status(x);expect(v.status).toBe('ok');if(v.status==='ok')expect(v.summary.margin_pp).toBe(margin);
 });

});
