// src/lib/macro/strategy/wiring.test.ts
// macroDbStrategyPort over P1's memory MacroDb (WP-S6 step 2). Semantics must match memoryStrategyPort (port.test.ts):
// ok rows only, highest version <= asOf, ascending history, newest non-failed snapshot with ties -> greatest id, 'truncated'.
import {describe,expect,it} from 'vitest';
import {CATALOG_VERSION,MACRO_CATALOG} from '../catalog';
import {MacroDbError} from '../db';
import {derivePolicyEvents} from '../events';
import {releaseTimeliness} from '../freshness';
import {memoryMacroDb} from '../memory-db';
import type {MemoryMacroDb} from '../memory-db';
import {SEED_FETCHED_AT,seedCatalog,seedPoints} from '../testing/seed';
import type {Region} from '../types';
import {FIXTURE_RULES} from './testing/fixture';
import {memoryStrategyPort} from './port';
import {fixture} from './testing/fixture';
import {macroDbStrategyPort} from './wiring';

const input=(region:Region,rev:number,inputRev:number,asOf='2026-11-06')=>({region,expectedRevision:rev,expectedInputRevision:inputRev,asOf,methodologyVersion:'m',catalogVersion:CATALOG_VERSION,
 observationIds:[],historyIds:[],catalogCounts:{verified:0,missing:0,restricted:0},regime:null,contributions:[],rulesVersion:'r',uncoveredWeight:0});
async function publish(db:MemoryMacroDb,region:Region,at:string):Promise<string>{
 db.setNow(at);const s=await db.publishState(region);
 return (await db.publishSnapshot(input(region,s.revision,s.inputRevision))).snapshot_id;
}
async function world(){
 const db=memoryMacroDb();await seedCatalog(db);return db;
}

describe('macroDbStrategyPort snapshots',()=>{
 it('publishState projects P1 revisions and maps missing rows to null',async()=>{
  const db=await world(),port=macroDbStrategyPort(db);
  expect(await macroDbStrategyPort({...db,publishState:async()=>{throw new MacroDbError('not_found');}}).publishState('US')).toBeNull();
  const state=await db.publishState('US');expect(await port.publishState('US')).toEqual({revision:state.revision,input_revision:state.inputRevision});
  await publish(db,'US','2026-10-01T08:00:00.000Z');
  const published=await db.publishState('US');expect(await port.publishState('US')).toEqual({revision:published.revision,input_revision:published.inputRevision});
 });
 it('activeSnapshot / snapshot pass through (null when none)',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  expect(await port.activeSnapshot('US')).toBeNull();expect(await port.snapshot('nope')).toBeNull();
  const id=await publish(db,'US','2026-10-01T08:00:00.000Z');
  expect((await port.activeSnapshot('US'))?.snapshot_id).toBe(id);
  expect((await port.snapshot(id))?.created_at).toBe('2026-10-01T08:00:00.000Z');
 });
 it('snapshotUpTo: newest non-failed of the region with created_at <= cutoff, across regions interleaved',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  const a=await publish(db,'US','2026-10-01T08:00:00.000Z');
  await publish(db,'CN','2026-10-02T08:00:00.000Z');
  const c=await publish(db,'US','2026-11-01T08:00:00.000Z');
  db.setNow('2026-11-03T08:00:00.000Z');await db.recordFailedSnapshot({region:'US',asOf:'2026-11-03',methodologyVersion:'m',catalogVersion:CATALOG_VERSION,reason:'x'});
  expect((await port.snapshotUpTo('US','2026-10-15T00:00:00Z'))?.snapshot_id).toBe(a);
  expect(await port.snapshotUpTo('US','2026-09-30T00:00:00Z')).toBeNull();
  expect((await port.snapshotUpTo('US','2026-12-01T00:00:00Z'))?.snapshot_id).toBe(c);   // the failed 11-03 one is skipped
  expect((await port.snapshotUpTo('US','2026-11-01T08:00:00.000Z'))?.snapshot_id).toBe(c);   // inclusive
  expect((await port.snapshotUpTo('CN','2026-12-01T00:00:00Z'))?.region).toBe('CN');
 });
 it('snapshotUpTo pages with a keyset: tiny pages give the same answer',async()=>{
  const db=await world();
  const ids:string[]=[];
  for(let i=0;i<7;i++)ids.push(await publish(db,i%2?'CN':'US',`2026-10-0${i+1}T08:00:00.000Z`));
  const small=macroDbStrategyPort(db,{pageSize:2}),big=macroDbStrategyPort(db);
  for(const cutoff of ['2026-10-04T00:00:00Z','2026-10-07T08:00:00.000Z','2026-12-01T00:00:00Z'])
   for(const r of ['US','CN'] as Region[])expect((await small.snapshotUpTo(r,cutoff))?.snapshot_id).toBe((await big.snapshotUpTo(r,cutoff))?.snapshot_id);
  expect((await small.snapshotUpTo('US','2026-12-01T00:00:00Z'))?.snapshot_id).toBe(ids[6]);
 });
 it("snapshotUpTo throws 'truncated' when paging cannot finish within maxPages",async()=>{
  const db=await world();
  for(let i=0;i<5;i++)await publish(db,'US',`2026-10-0${i+1}T08:00:00.000Z`);
  await expect(macroDbStrategyPort(db,{pageSize:2,maxPages:2}).snapshotUpTo('US','2026-12-01T00:00:00Z')).rejects.toThrow('truncated');
  // a cutoff reached inside the allowed pages still answers
  expect((await macroDbStrategyPort(db,{pageSize:2,maxPages:2}).snapshotUpTo('US','2026-10-02T00:00:00Z'))?.created_at).toBe('2026-10-01T08:00:00.000Z');
 });
});

describe('macroDbStrategyPort observations',()=>{
 it('observationsByIds: input order, unknown ids dropped; rows are projected (no storage fields)',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  const s=await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-08-31',value_text:'4'},{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1'}]);
  const a=s.ids.get('US_UNRATE|2026-08-31')!,b=s.ids.get('US_UNRATE|2026-09-30')!;
  const rows=await port.observationsByIds([b,'00000000-0000-4000-8000-00000000dead',a]);
  expect(rows.map(r=>r.observation_id)).toEqual([b,a]);
  expect(Object.keys(rows[0]).sort()).toEqual(['availability_basis','available_at','derived_from','ingested_at','observation_id','period_end','retrieval_id','series_id','status','transform','value_text','version']);
 });
 it('latestObservations: latest visible period, highest visible version, input order; asOf hides later availability',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-08-31',value_text:'4'},{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1'},
   {series_id:'US_FEDFUNDS_EFF_D',period_end:'2026-10-30',value_text:'4.33'}]);
  await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.2'}],{fetchedAt:'2026-11-05T05:30:00.000Z'});
  const early=await port.latestObservations(['US_FEDFUNDS_EFF_D','US_UNRATE','US_NONE'],{asOf:'2026-11-02T00:00:00Z'});
  expect(early.map(o=>[o.series_id,o.period_end,o.value_text,o.version])).toEqual([['US_FEDFUNDS_EFF_D','2026-10-30','4.33',1],['US_UNRATE','2026-09-30','4.1',1]]);
  const late=await port.latestObservations(['US_UNRATE'],{asOf:'2026-11-06T00:00:00Z'});
  expect(late.map(o=>[o.value_text,o.version])).toEqual([['4.2',2]]);
 });
 it('seriesHistory: highest visible version per period ascending, bounds, truncated beyond maxRows',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  await seedPoints(db,['2026-06-30','2026-07-31','2026-08-31','2026-09-30'].map((p,i)=>({series_id:'US_UNRATE',period_end:p,value_text:`${4+i/10}`})));
  await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'9'}],{fetchedAt:'2026-11-05T05:30:00.000Z'});
  expect((await port.seriesHistory('US_UNRATE',{asOf:'2026-11-06T00:00:00Z',maxRows:10})).map(o=>o.value_text)).toEqual(['4','4.1','4.2','9']);
  expect((await port.seriesHistory('US_UNRATE',{asOf:SEED_FETCHED_AT,maxRows:10})).map(o=>o.value_text)).toEqual(['4','4.1','4.2','4.3']);
  expect((await port.seriesHistory('US_UNRATE',{from:'2026-07-01',to:'2026-08-31',asOf:'2026-11-06T00:00:00Z',maxRows:10})).map(o=>o.period_end)).toEqual(['2026-07-31','2026-08-31']);
  await expect(port.seriesHistory('US_UNRATE',{asOf:'2026-11-06T00:00:00Z',maxRows:2})).rejects.toThrow('truncated');
 });
});

describe('seriesHistory maxRows counts periods after the highest-version dedup (parity with memoryStrategyPort)',()=>{
 it('two periods, one revised, maxRows 2: returns both rows like the reference; maxRows 1 truncates',async()=>{
  const db=await world();const port=macroDbStrategyPort(db);
  const first=await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-08-31',value_text:'4'},{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.1'}]);
  await seedPoints(db,[{series_id:'US_UNRATE',period_end:'2026-09-30',value_text:'4.2'}],{fetchedAt:'2026-11-05T05:30:00.000Z'});
  void first;
  const asOf='2026-11-06T00:00:00Z';
  const got=await port.seriesHistory('US_UNRATE',{asOf,maxRows:2});
  expect(got.map(o=>[o.period_end,o.value_text,o.version])).toEqual([['2026-08-31','4',1],['2026-09-30','4.2',2]]);
  const ref=memoryStrategyPort(fixture({observations:got.map(o=>({...o}))}));
  expect((await ref.seriesHistory('US_UNRATE',{asOf,maxRows:2})).map(o=>o.observation_id)).toEqual(got.map(o=>o.observation_id));
  await expect(port.seriesHistory('US_UNRATE',{asOf,maxRows:1})).rejects.toThrow('truncated');
  await expect(ref.seriesHistory('US_UNRATE',{asOf,maxRows:1})).rejects.toThrow('truncated');
 });
});

describe('macroDbStrategyPort static parts',()=>{
 const port=macroDbStrategyPort(memoryMacroDb());
 it('catalog and version are P1 catalog.ts',()=>{expect(port.catalog()).toBe(MACRO_CATALOG);expect(port.catalogVersion()).toBe(CATALOG_VERSION);});
 it('rules() projects P1 RULES in table order (equals the strategy fixture copy)',()=>{
  expect(port.rules()).toEqual(FIXTURE_RULES);
 });
 it('derivePolicyEvents is P2 and timeliness is P1',()=>{
  expect(port.derivePolicyEvents).toBe(derivePolicyEvents);
  const def=MACRO_CATALOG.find(d=>d.id==='US_UNRATE')!;
  expect(port.timeliness(def,'2026-08-31','2026-11-06')).toBe(releaseTimeliness(def,'2026-08-31','2026-11-06'));
  expect(port.timeliness(def,null,'2026-11-06')).toBe('missing');
 });
});
