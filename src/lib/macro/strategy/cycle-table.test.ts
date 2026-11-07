// cycle-table.ts (spec §5.5): episodes vs P2 cycles, left-censored / ongoing / gap_after, column resolution, the three
// boundaries, the 7-day rule, coverage, degenerate, month_not_closed, non-positive base, restricted, truncated, manifest.
import {describe,expect,it} from 'vitest';
import type {Boundary,CycleCell,EventGap,ManifestInput,ManifestRead,StoredManifest,StrategyManifest,StrategyPolicyEvent} from './contract';
import {buildCycleTable,buildCycleTableManifest,policyEpisodes,resolveColumn} from './cycle-table';
import {freezeDef,manifestHash,monthEnd} from './manifest';
import {subtract,toBp} from './numeric';
import {mergePolicyEvents} from './policy-events';
import {memoryStrategyPort} from './port';
import {FIXTURE_CATALOG,daily,fixture,monthly,snap} from './testing/fixture';

const ev=(d:string,bp:string,from='0',to='0'):StrategyPolicyEvent=>({kind:'policy_target_change',region:'US',effective_date:d,upper_from:from,upper_to:to,lower_from:'0',lower_to:'0',change_bp:bp,source:'derived',evidence:['a','b','c','d'],version:'macro-events/1',basis:'range'});
const HIKES=[ev('2022-03-17','25','0.25','0.5'),ev('2022-05-05','50','0.5','1'),ev('2023-07-27','25','5.25','5.5')];
const CUTS=[ev('2024-09-19','-50','5.5','5'),ev('2024-11-08','-25','5','4.75'),ev('2024-12-19','-25','4.75','4.5')];
const CATALOG=FIXTURE_CATALOG.map(freezeDef);
const input=(role:string,id:string,d:string,v:string):ManifestInput=>({series_id:id,role,observation_id:`obs:${id}:${d}:v1`,period_end:d,value_text:v,version:1,available_at:`${d}T12:00:00Z`,source:{kind:'history',as_of:'2025-06-30T00:00:00Z'}});
const dailyIn=(id:string,pts:[string,string][])=>pts.map(([d,v])=>input(`col:${id}:history`,id,d,v));
const monthIn=(id:string,pts:[string,string][])=>pts.map(([ym,v])=>input(`col:${id}:month_end`,id,monthEnd(ym),v));
function manifest(o:{events:StrategyPolicyEvent[];inputs:ManifestInput[];boundary?:Boundary;cutoff?:string;gaps?:EventGap[];reads?:ManifestRead[]}):StoredManifest{
 const body:StrategyManifest={kind:'cycle_table',params:{boundary:o.boundary??'event_day'},cutoff:o.cutoff??'2025-06-30T00:00:00Z',snapshots:{US:null,CN:null},catalog:CATALOG,reads:o.reads??[],inputs:o.inputs,events:o.events,gaps:o.gaps??[],catalog_version:'macro-catalog/test',method_version:'macro-cycle-table/1',code_version:'test'};
 return {manifest_id:'00000000-0000-4000-8000-000000000003',manifest_hash:manifestHash(body),body,created_at:body.cutoff};
}
const at=(v:ReturnType<typeof buildCycleTable>,ep:number,col:string):CycleCell=>v.cells[String(ep)][col];

describe('policyEpisodes',()=>{
 it('runs from the first to the LAST event of a direction (no plateau, no extension to the flip)',()=>{
  expect(policyEpisodes([...HIKES,...CUTS],[],'2025-06-30')).toEqual([
   {index:0,direction:'hike',start:'2022-03-17',end:'2023-07-27',events:3,upper_from:'0.25',upper_to:'5.5',cumulative_bp:'100',left_censored:true,ongoing:false,gap_after:false},
   {index:1,direction:'cut',start:'2024-09-19',end:'2024-12-19',events:3,upper_from:'5.5',upper_to:'4.5',cumulative_bp:'-100',left_censored:false,ongoing:true,gap_after:false},
  ]);
 });
 it('ongoing only while the cutoff is less than 12 months after the last event',()=>{
  expect(policyEpisodes(CUTS,[],'2025-12-18').at(-1)?.ongoing).toBe(true);
  expect(policyEpisodes(CUTS,[],'2025-12-19').at(-1)?.ongoing).toBe(false);
 });
 it('a §5.4 gap breaks a run and marks the episode before it',()=>{
  const gap:EventGap={kind:'transition_unverified',reason:'upper_first_not_2008-12-16',near:'2008-12-16'};
  const eps=policyEpisodes([ev('2008-10-08','-50'),ev('2008-10-29','-50'),ev('2015-12-17','25')],[gap],'2016-01-31');
  expect(eps.map(e=>[e.direction,e.start,e.end,e.gap_after])).toEqual([['cut','2008-10-08','2008-10-29',true],['hike','2015-12-17','2015-12-17',false]]);
  const same=policyEpisodes([ev('2008-10-29','-50'),ev('2009-01-10','-25')],[gap],'2009-02-01');
  expect(same.map(e=>[e.start,e.end,e.gap_after])).toEqual([['2008-10-29','2008-10-29',true],['2009-01-10','2009-01-10',false]]);
  expect(policyEpisodes([ev('2008-10-29','-50')],[gap],'2009-02-01')[0].gap_after).toBe(true);
 });
 it('a 0 bp switch event (unchanged upper, moved lower) opens no episode and invents no direction',()=>{
  const derive=memoryStrategyPort(fixture()).derivePolicyEvents;
  const r=mergePolicyEvents(derive,[{observation_id:'s',period_end:'2008-12-15',value_text:'1'}],[{observation_id:'u',period_end:'2008-12-16',value_text:'1'}],[{observation_id:'l',period_end:'2008-12-16',value_text:'0.75'}]);
  expect(r.events.map(e=>e.change_bp)).toEqual(['0']);
  expect(policyEpisodes([ev('2008-10-29','-50'),...r.events],r.gaps,'2009-02-01').map(e=>[e.direction,e.start,e.end,e.events])).toEqual([['cut','2008-10-29','2008-10-29',1]]);
 });
});

describe('resolveColumn',()=>{
 it('resolves asset views to month-end and native daily series',()=>{
  expect(resolveColumn('US_UST10Y',CATALOG)).toMatchObject({change_kind:'bp',monthly_series:'US_DGS10',daily_series:'US_DGS10_D',restricted:false});
  expect(resolveColumn('CN_CGB10Y',CATALOG)).toMatchObject({monthly_series:'CN_CGB_10Y',daily_series:'CN_CGB_10Y_D'});
  expect(resolveColumn('US_WTI',CATALOG)).toMatchObject({change_kind:'pct',monthly_series:'US_WTI',daily_series:'US_WTI_D'});
  expect(resolveColumn('US_DTWEXBGS',CATALOG)).toMatchObject({monthly_series:'US_DTWEXBGS',daily_series:'US_DTWEXBGS_D'});
  expect(resolveColumn('CN_USDCNY_CP',CATALOG)).toMatchObject({monthly_series:'CN_USDCNY_CP',daily_series:'CN_USDCNY_CP_D'});
  expect(resolveColumn('US_SP500',CATALOG)).toMatchObject({restricted:true,daily_series:null,monthly_series:null});
  expect(resolveColumn('NOPE',CATALOG)).toMatchObject({daily_series:null,monthly_series:null,restricted:false});
 });
});

describe('boundaries',()=>{
 // daily US 10Y around the 2022-03-17 → 2023-07-27 hike episode; monthly month ends for the month_end boundary
 const d10=dailyIn('US_DGS10_D',[['2022-03-14','2.13'],['2022-03-16','2.18'],['2022-03-17','2.20'],['2022-03-18','2.14'],['2023-07-26','3.87'],['2023-07-27','4.00'],['2023-07-28','3.96'],['2023-08-31','4.09']]);
 const m10=monthIn('US_DGS10',[['2022-02','1.83'],['2022-03','2.32'],['2023-07','3.97']]);
 const v=(b:Boundary,o:Partial<Parameters<typeof manifest>[0]>={})=>buildCycleTable(manifest({events:HIKES,inputs:[...d10,...m10],...o,boundary:b}));
 it('event_day: last row before start → last row on or before end',()=>{
  expect(at(v('event_day'),0,'US_UST10Y')).toMatchObject({status:'ok',from:{period_end:'2022-03-16',value_text:'2.18'},to:{period_end:'2023-07-27',value_text:'4.00'},change_text:'182',change_raw:182,change_kind:'bp'});
 });
 it('first_trading_day: first row on or after start → first row on or after end',()=>{
  expect(at(v('first_trading_day'),0,'US_UST10Y')).toMatchObject({status:'ok',from:{period_end:'2022-03-17'},to:{period_end:'2023-07-27'},change_text:'180'});
 });
 it('month_end (acceptance 3): 2023-07 month end minus 2022-02 month end, exact × 100',()=>{
  const c=at(v('month_end'),0,'US_UST10Y');
  expect(c).toMatchObject({status:'ok',from:{period_end:'2022-02-28'},to:{period_end:'2023-07-31'}});
  expect(c.status==='ok'&&c.change_text).toBe(toBp(subtract('3.97','1.83')));
 });
 it('a chosen row more than 7 days away, or a boundary outside the series, is out_of_coverage',()=>{
  const sparse=dailyIn('US_DGS10_D',[['2022-03-01','2.00'],['2023-07-27','4.00'],['2023-08-31','4.09']]);
  expect(at(v('event_day',{inputs:sparse}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});   // 16 days before start
  const late=dailyIn('US_DGS10_D',[['2022-03-17','2.20'],['2023-07-27','4.00']]);
  expect(at(v('event_day',{inputs:late}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});     // nothing before start
  const short=dailyIn('US_DGS10_D',[['2022-03-16','2.18'],['2023-07-20','3.80']]);
  expect(at(v('first_trading_day',{inputs:short}),0,'US_UST10Y')).toEqual({status:'missing',reason:'out_of_coverage'});   // end after the last row
 });
 it('both ends on one row → degenerate (single-event episode, first_trading_day)',()=>{
  const one=buildCycleTable(manifest({events:[ev('2022-03-17','25')],inputs:d10,boundary:'first_trading_day'}));
  expect(at(one,0,'US_UST10Y')).toEqual({status:'missing',reason:'degenerate'});
 });
 it('an end month not closed at the cutoff → month_not_closed',()=>{
  expect(at(v('month_end',{cutoff:'2023-07-30T00:00:00Z'}),0,'US_UST10Y')).toEqual({status:'missing',reason:'month_not_closed'});
 });
 it('pct columns refuse a non-positive base; restricted columns are restricted; no data is out_of_coverage; truncated reads say so',()=>{
  const wti=dailyIn('US_WTI_D',[['2022-03-16','-1'],['2023-07-27','80']]);
  expect(at(v('event_day',{inputs:wti}),0,'US_WTI')).toEqual({status:'missing',reason:'non_positive_base'});
  const pos=dailyIn('US_WTI_D',[['2022-03-16','80'],['2023-07-27','100']]);
  expect(at(v('event_day',{inputs:pos}),0,'US_WTI')).toMatchObject({status:'ok',change_text:'100/80',change_raw:25,change_kind:'pct'});   // exact ratio, rounded only at display
  expect(at(v('event_day'),0,'US_SP500')).toEqual({status:'restricted'});
  expect(at(v('event_day'),0,'CN_CGB10Y')).toEqual({status:'missing',reason:'out_of_coverage'});
  expect(at(v('event_day',{reads:[{series_id:'US_DGS10_D',purpose:'col',state:'truncated'}]}),0,'US_UST10Y')).toEqual({status:'missing',reason:'history_truncated'});
 });
 it('the view carries versions, columns in config order and the manifest gaps',()=>{
  const gap:EventGap={kind:'transition_unverified',reason:'x',near:'2008-12-16'};
  const t=v('event_day',{gaps:[gap]});
  expect(t).toMatchObject({version:'macro-cycle-table/1',episodes_version:'macro-policy-episodes/1',boundary:'event_day',gaps:[gap]});
  expect(t.columns.map(c=>c.id)).toEqual(['US_UST10Y','CN_CGB10Y','US_WTI','US_DTWEXBGS','CN_USDCNY_CP','US_SP500','US_NASDAQCOM','US_DJIA','CN_CSI300']);
 });
 it('the boundary comes from manifest.params; a manifest without a valid boundary is refused',()=>{
  expect(v('month_end').boundary).toBe('month_end');
  const bad=manifest({events:HIKES,inputs:d10});bad.body.params={};
  expect(()=>buildCycleTable(bad)).toThrow('invalid_manifest_params:boundary');
 });
 it('a truncated event history is shown as a history_truncated gap, never as an ordinary empty history',()=>{
  const gap:EventGap={kind:'history_truncated',reason:'US_FED_TARGET_UPPER_D',near:'2025-06-30'};
  const t=buildCycleTable(manifest({events:[],inputs:d10,gaps:[gap]}));
  expect(t.episodes).toEqual([]);
  expect(t.gaps).toEqual([gap]);
 });
});

describe('buildCycleTableManifest',()=>{
 it('freezes events, daily and month-end histories of resolvable columns, and skips restricted columns',async()=>{
  const us=snap('US','2025-06-30T06:00:00Z',[]);
  const f=fixture({snapshots:[us],observations:[
   ...daily('US_FED_TARGET_UPPER_D',[['2022-03-16','0.25'],['2022-03-17','0.5']]),...daily('US_FED_TARGET_LOWER_D',[['2022-03-16','0'],['2022-03-17','0.25']]),
   ...daily('US_DGS10_D',[['2022-03-16','2.18'],['2022-03-17','2.20']]),...monthly('US_DGS10','2022-02',['1.83','2.32'])]});
  const body=await buildCycleTableManifest(memoryStrategyPort(f),{now:new Date('2025-07-01T00:00:00Z'),codeVersion:'test',boundary:'month_end'});
  expect(body.kind).toBe('cycle_table');expect(body.cutoff).toBe(us.created_at);
  expect(body.params).toEqual({boundary:'month_end'});
  const other=await buildCycleTableManifest(memoryStrategyPort(f),{now:new Date('2025-07-01T00:00:00Z'),codeVersion:'test',boundary:'event_day'});
  expect(manifestHash(other)).not.toBe(manifestHash(body));   // each boundary is its own manifest identity
  expect(body.events?.map(e=>[e.effective_date,e.change_bp,e.basis])).toEqual([['2022-03-17','25','range']]);
  expect(body.inputs.filter(i=>i.role==='col:US_DGS10_D:history')).toHaveLength(2);
  expect(body.inputs.filter(i=>i.role==='col:US_DGS10:month_end')).toHaveLength(2);
  expect(body.reads.find(r=>r.series_id==='CN_CGB_10Y_D')?.state).toBe('missing');
  expect(body.reads.some(r=>r.series_id==='US_SP500')).toBe(false);
  expect(body.catalog.some(d=>d.id==='US_UST10Y')).toBe(true);
  expect(body.method_version).toBe('macro-cycle-table/1');
 });
});
