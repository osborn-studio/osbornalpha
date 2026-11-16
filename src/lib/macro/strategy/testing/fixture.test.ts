// src/lib/macro/strategy/testing/fixture.test.ts
// The test fixture is itself checked (plan 2026-11-07 Task 2): catalog rows mirror P1 §4.2 (+ US_FED_TARGET_D), rules
// mirror P1 §5.2 in table order, builders are deterministic, the Fed target data reproduce FRED's change dates.
import {describe,expect,it} from 'vitest';
import {REGIMES} from '../contract';
import {FIXTURE_CATALOG,FIXTURE_CATALOG_VERSION,FIXTURE_RULES,daily,fedTargetFixture,fixture,monthly,obs,snap} from './fixture';

describe('FIXTURE_CATALOG',()=>{
 const byId=new Map(FIXTURE_CATALOG.map(d=>[d.id,d]));
 it('has the 40 P1 rows plus US_FED_TARGET_D, unique ids, P1 missing/restricted sets',()=>{
  expect(FIXTURE_CATALOG).toHaveLength(41);
  expect(byId.size).toBe(41);
  expect(FIXTURE_CATALOG.filter(d=>d.status==='missing').map(d=>d.id).sort()).toEqual(['CN_AFRE_STOCK_YOY','CN_LPR_1Y','CN_MLF_1Y','US_ISM_PMI']);
  expect(FIXTURE_CATALOG.filter(d=>d.status==='restricted').map(d=>d.id).sort()).toEqual(['CN_CSI300','US_DJIA','US_NASDAQCOM','US_SP500','US_VIX','US_VIX_D']);
  for(const d of FIXTURE_CATALOG){
   expect({id:d.id,reason:d.status==='active'?d.reason===undefined:!!d.reason}).toEqual({id:d.id,reason:true});
   expect({id:d.id,source:d.status==='missing'?d.source===null:d.source!==null}).toEqual({id:d.id,source:true});
  }
 });
 it('keeps P1 weights (US 100, CN 125 over role=indicator) and resolvable derive/alias references',()=>{
  const w=(r:'US'|'CN')=>FIXTURE_CATALOG.filter(d=>d.region===r&&d.role==='indicator').reduce((s,d)=>s+d.weight,0);
  expect([w('US'),w('CN')]).toEqual([100,125]);
  for(const d of FIXTURE_CATALOG){
   if(d.derive)expect({id:d.id,ok:byId.has(d.derive.from)}).toEqual({id:d.id,ok:true});
   if(d.aliasOf)expect({id:d.id,ok:byId.has(d.aliasOf)}).toEqual({id:d.id,ok:true});
  }
  expect(byId.get('US_UST10Y')).toMatchObject({aliasOf:'US_DGS10',changeKind:'bp',role:'asset'});
  expect(byId.get('CN_CGB10Y')).toMatchObject({aliasOf:'CN_CGB_10Y',changeKind:'bp',role:'asset'});
  expect(byId.get('US_WTI')).toMatchObject({derive:{kind:'month_end',from:'US_WTI_D'},changeKind:'pct'});
 });
 it('adds US_FED_TARGET_D as a weight-0 immutable daily event source (spec §4.2)',()=>{
  expect(byId.get('US_FED_TARGET_D')).toMatchObject({region:'US',role:'event_source',type:'policy_rate',unit:'pct',nativeFrequency:'daily',period:'day',status:'active',weight:0,revisionPolicy:'immutable',changeKind:'bp'});
  expect(byId.get('US_FED_TARGET_D')!.source).toMatchObject({fetchHost:'fred.stlouisfed.org',rights:'public_domain'});
 });
});

describe('FIXTURE_RULES',()=>{
 it('is the P1 v1.0 table: 28 rows in table order, unique ids, supports only on the four regimes',()=>{
  expect(FIXTURE_RULES.rulesVersion).toBe('macro-regime-rules/1.0');
  expect(FIXTURE_RULES.rows).toHaveLength(28);
  expect(new Set(FIXTURE_RULES.rows.map(r=>r.rule_id)).size).toBe(28);
  expect(FIXTURE_RULES.rows.map(r=>r.type).filter((t,i,a)=>a.indexOf(t)===i)).toEqual(['policy_rate','bond_yield','fx','inflation_yoy','pmi','labor_rate','growth_yoy','liquidity_yoy','risk_index']);
  for(const r of FIXTURE_RULES.rows)for(const k of Object.keys(r.support))expect(REGIMES).toContain(k);
  expect(FIXTURE_RULES.rows[0]).toEqual({rule_id:'policy.lt2_5',type:'policy_rate',condition:{zh:'政策利率 < 2.5%',en:'policy rate < 2.5%'},support:{recovery:0.2,recession:0.7}});
  expect(FIXTURE_RULES.rows.find(r=>r.rule_id==='infl.gt4')!.support).toEqual({overheat:0.4,stagflation:0.6});
 });
});

describe('builders',()=>{
 it('obs: deterministic id, default available_at and ok status',()=>{
  expect(obs('US_UNRATE','2026-09-30','4.1')).toEqual({observation_id:'obs:US_UNRATE:2026-09-30:v1',series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1',version:1,
   available_at:'2026-09-30T12:00:00Z',availability_basis:'first_seen',ingested_at:'2026-09-30T12:00:00Z',status:'ok',retrieval_id:null,derived_from:null,transform:null});
  expect(obs('X','2026-01-31','1',{version:2,availableAt:'2026-03-01T00:00:00Z',status:'quarantined'})).toMatchObject({observation_id:'obs:X:2026-01-31:v2',available_at:'2026-03-01T00:00:00Z',status:'quarantined'});
 });
 it('monthly: month ends from firstMonth, null leaves a gap; daily: one row per point',()=>{
  expect(monthly('US_UNRATE','2025-11',['4.2',null,'4.0']).map(o=>[o.period_end,o.value_text])).toEqual([['2025-11-30','4.2'],['2026-01-31','4.0']]);
  expect(monthly('US_UNRATE','2024-02',['1'],{availableAt:'2024-03-05T00:00:00Z'})[0]).toMatchObject({period_end:'2024-02-29',available_at:'2024-03-05T00:00:00Z'});
  expect(daily('US_DGS10_D',[['2026-10-01','4.1'],['2026-10-02','4.2']]).map(o=>o.observation_id)).toEqual(['obs:US_DGS10_D:2026-10-01:v1','obs:US_DGS10_D:2026-10-02:v1']);
 });
 it('snap: id from region and created_at, active by default, counts from the catalog',()=>{
  const s=snap('US','2026-11-01T08:00:00.000Z',['a']);
  expect(s).toMatchObject({snapshot_id:'snap:US:2026-11-01T08:00:00.000Z',region:'US',as_of:'2026-11-01',status:'active',observation_ids:['a'],history_ids:[],catalog_version:FIXTURE_CATALOG_VERSION});
  expect(s.catalog_counts).toEqual({verified:17,missing:1,restricted:5});
  expect(snap('CN','2026-11-01T08:00:00.000Z',[],{status:'failed'}).status).toBe('failed');
 });
 it('fixture: defaults and overrides',()=>{
  const f=fixture();
  expect(f).toMatchObject({catalog:FIXTURE_CATALOG,catalogVersion:FIXTURE_CATALOG_VERSION,rules:FIXTURE_RULES,snapshots:[],observations:[]});
  expect(fixture({today:'2026-11-07'}).today).toBe('2026-11-07');
 });
});

describe('fedTargetFixture (sparse by design: change dates plus the day before)',()=>{
 const rows=fedTargetFixture();
 const of=(id:string)=>rows.filter(o=>o.series_id===id);
 it('single target 2007-09-17 … 2008-12-15 = 1.00, ascending, nine changes',()=>{
  const t=of('US_FED_TARGET_D');
  expect(t[0]).toMatchObject({period_end:'2007-09-17',value_text:'5.25'});
  expect(t[t.length-1]).toMatchObject({period_end:'2008-12-15',value_text:'1.00'});
  expect(t.map(o=>o.period_end)).toEqual([...t.map(o=>o.period_end)].sort());
  const changes=t.slice(1).filter((o,i)=>o.value_text!==t[i].value_text).map(o=>o.period_end);
  expect(changes).toEqual(['2007-09-18','2007-10-31','2007-12-11','2008-01-22','2008-01-30','2008-03-18','2008-04-30','2008-10-08','2008-10-29']);
 });
 it('range starts 2008-12-16 at 0.25 / 0.00 and both bounds share every date',()=>{
  const u=of('US_FED_TARGET_UPPER_D'),l=of('US_FED_TARGET_LOWER_D');
  expect([u[0].period_end,u[0].value_text,l[0].value_text]).toEqual(['2008-12-16','0.25','0.00']);
  expect(u.map(o=>o.period_end)).toEqual(l.map(o=>o.period_end));
  expect(u[u.length-1]).toMatchObject({period_end:'2024-12-19',value_text:'4.50'});
  expect(u.find(o=>o.period_end==='2015-12-16')!.value_text).toBe('0.25');   // day before the 2015 hike repeats the old range
 });
});
