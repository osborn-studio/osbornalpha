// src/lib/judgments/macro-api.test.ts
import {describe,expect,it} from 'vitest';
import {MacroUnavailable,fixtureMacroReadApi,observationIdOf,unavailableMacroReadApi,validateMacroFixture} from './macro-api';
import type {MacroFixture} from './macro-api';
import type {Regime,RegimeResult} from './types';

const obs=(series_id:string,period_end:string,vintage_id:string,value:number,available_at:string)=>({observation_id:observationIdOf({series_id,period_end,vintage_id}),series_id,period_end,vintage_id,value,unit:'pct',available_at});
const regime=(primary:Regime,secondary:Regime|null,norm:Record<Regime,number>):RegimeResult=>({primary_state:primary,secondary_state:secondary,scores:norm,norm,coverage:0.8,margin_pp:Math.round((norm[primary]-(secondary?norm[secondary]:0))*1000)/10,growth_axis:0.5,inflation_axis:-0.2});
const O1=obs('us_ism_pmi','2026-09-30','v1',49.1,'2026-10-01T14:00:00.000Z');
const O2=obs('us_cpi_yoy','2026-09-30','v1',2.9,'2026-10-15T12:30:00.000Z');
const O2R=obs('us_cpi_yoy','2026-09-30','v2',3.4,'2026-11-13T13:30:00.000Z');
const R1=regime('recovery','overheat',{recovery:0.4,overheat:0.3,stagflation:0.2,recession:0.1});
const R2=regime('overheat','recovery',{recovery:0.3,overheat:0.4,stagflation:0.2,recession:0.1});
const FX:MacroFixture={fixture_version:'macro-fixture/1',observations:[O1,O2,O2R],
 snapshots:[
  {snapshot_id:'s-2',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id,O2.observation_id],regime:R1,created_at:'2026-10-16T01:00:00.000Z',status:'active'},
  {snapshot_id:'s-1',region:'US',as_of:'2026-10-16',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id],regime:null,created_at:'2026-10-16T01:00:00.000Z',status:'superseded'},
  {snapshot_id:'s-0',region:'US',as_of:'2026-10-02',methodology_version:'v1.0',catalog_version:'cat-1',observation_ids:[O1.observation_id],regime:null,created_at:'2026-10-02T01:00:00.000Z',status:'failed'}],
 series_catalog:{US:[{id:'us_cpi_yoy',weight:0.25,updated_at:'2026-10-01T00:00:00Z'}]},
 classifications:[
  {region:'US',reference_period:'2026-10',macro_methodology_version:'v1.0',visible_from:'2026-10-16T00:00:00.000Z',regime:R1,observation_ids:[O1.observation_id,O2.observation_id],catalog:{version:'cat-1',weights:{us_cpi_yoy:0.25,us_ism_pmi:0.25},rules_version:'rules-1'}},
  {region:'US',reference_period:'2026-10',macro_methodology_version:'v1.0',visible_from:'2026-11-14T00:00:00.000Z',regime:R2,observation_ids:[O1.observation_id,O2R.observation_id],catalog:{version:'cat-1',weights:{us_cpi_yoy:0.25,us_ism_pmi:0.25},rules_version:'rules-1'}}]};

describe('fixtureMacroReadApi (spec §12.1)',()=>{
 it('validates ids, references and vintage availability',()=>{
  expect(()=>validateMacroFixture({...FX,fixture_version:'x'})).toThrow(/fixture_version/);
  expect(()=>validateMacroFixture({...FX,observations:[{...O1,observation_id:'wrong'},O2,O2R]})).toThrow(/observation_id/);
  expect(()=>validateMacroFixture({...FX,observations:[O1,O1,O2,O2R]})).toThrow(/duplicate observation/);
  expect(()=>validateMacroFixture({...FX,classifications:[{...FX.classifications[1],visible_from:'2026-11-01T00:00:00.000Z'}]})).toThrow(/before it is available/);
  expect(()=>validateMacroFixture({...FX,snapshots:[{...FX.snapshots[0],observation_ids:['nope']}]})).toThrow(/observation nope/);
  expect(validateMacroFixture(FX)).toBe(FX);
 });
 it('observation / snapshot / seriesCatalog return clones',async()=>{
  const api=fixtureMacroReadApi(FX);
  expect(await api.observation(O2.observation_id)).toEqual({series_id:'us_cpi_yoy',period_end:'2026-09-30',vintage_id:'v1',value:2.9,unit:'pct',available_at:'2026-10-15T12:30:00.000Z'});
  expect(await api.observation('missing')).toBeNull();
  const s=(await api.snapshot('s-2'))!;s.observation_ids.push('x');
  expect((await api.snapshot('s-2'))!.observation_ids).toHaveLength(2);
  expect(await api.seriesCatalog('US')).toEqual([{id:'us_cpi_yoy',weight:0.25,updated_at:'2026-10-01T00:00:00Z'}]);
  expect(await api.seriesCatalog('CN')).toEqual([]);
 });
 it('snapshotsSince orders by (created_at, snapshot_id), skips failed, honours the marker and the limit',async()=>{
  const api=fixtureMacroReadApi(FX);
  expect((await api.snapshotsSince(null,10)).map(s=>s.snapshot_id)).toEqual(['s-1','s-2']);
  expect((await api.snapshotsSince({created_at:'2026-10-16T01:00:00.000Z',snapshot_id:'s-1'},10)).map(s=>s.snapshot_id)).toEqual(['s-2']);
  expect((await api.snapshotsSince(null,1)).map(s=>s.snapshot_id)).toEqual(['s-1']);
 });
 it('classifyAsOf picks the classification visible at the cutoff; a revision can change the argmax',async()=>{
  const api=fixtureMacroReadApi(FX);
  const early=await api.classifyAsOf('US','2026-10','2026-11-01T00:00:00.000Z','v1.0');
  expect(early.regime?.primary_state).toBe('recovery');
  expect(early.observation_refs.map(o=>o.vintage_id)).toEqual(['v1','v1']);
  const late=await api.classifyAsOf('US','2026-10','2027-01-31T00:00:00.000Z','v1.0');
  expect(late.regime?.primary_state).toBe('overheat');
  expect(late.catalog).toEqual({version:'cat-1',weights:{us_cpi_yoy:0.25,us_ism_pmi:0.25},rules_version:'rules-1'});
  await expect(api.classifyAsOf('US','2026-10','2026-10-01T00:00:00.000Z','v1.0')).rejects.toBeInstanceOf(MacroUnavailable);
  await expect(api.classifyAsOf('US','2026-10','2027-01-31T00:00:00.000Z','v2.0')).rejects.toBeInstanceOf(MacroUnavailable);
 });
 it('unavailableMacroReadApi rejects every method with MacroUnavailable',async()=>{
  const api=unavailableMacroReadApi();
  for(const p of [api.observation('x'),api.snapshot('x'),api.snapshotsSince(null,1),api.seriesCatalog('US'),api.classifyAsOf('US','2026-10','2026-11-01T00:00:00.000Z','v1.0')])
   await expect(p).rejects.toMatchObject({name:'MacroUnavailable',reason:'macro_workbench_absent'});
 });
});
