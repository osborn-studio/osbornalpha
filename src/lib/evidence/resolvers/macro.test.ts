// Topic spec §4.1 resolver tests.
// src/lib/evidence/resolvers/macro.test.ts
import {describe,expect,it} from 'vitest';
import {memorySources} from '../memory-sources';
import {macroFixture,OBS} from '../fixtures/macro';
import {macroResolver} from './macro';
import type {EvidenceRef} from '../ref';
const ref=(id:string,as_of='2026-11-14T00:00:00.000Z',locator?:Record<string,string>):EvidenceRef=>({v:1,kind:'macro_observation',id,as_of,...(locator?{locator}:{})});
const pub={audience:'public' as const,now:new Date('2026-11-15T00:00:00Z'),locale:'zh' as const};
describe('macro_observation resolver',()=>{
 const r=()=>macroResolver(memorySources(macroFixture()));
 it.each([
  ['an ok row',ref(OBS.unrateV1),'ok',null],
  ['an unknown id',ref('00000000-0000-4000-8000-0000000000ff'),'missing','not_found'],
  ['a locator that names another series',ref(OBS.unrateV1,undefined,{series_id:'US_CPI',period_end:'2026-08-31'}),'missing','locator_mismatch'],
  ['a series absent from the catalog',ref(OBS.orphan),'missing','catalog_missing'],
  ['a quarantined row',ref(OBS.quarantined),'retracted','quarantined'],
  ['an as_of before availability',ref(OBS.unrateV1,'2026-09-01T00:00:00.000Z'),'missing','not_yet_available'],
  ['a restricted series',ref(OBS.vix),'withheld','catalog_restricted'],
  ['a third-party series',ref(OBS.thirdParty),'withheld','licence_unconfirmed'],
 ] as const)('%s → %s:%s',async(_n,input,state,reason)=>{
  const [out]=await r().resolve([input],pub);
  expect([out.state,out.reason]).toEqual([state,reason]);
  if(state!=='ok'){expect(out.display.fact).toBeNull();expect(out.digest).toBeNull();}
 });
 it('renders the frozen value, drawer and freshness for an ok row',async()=>{
  const [out]=await r().resolve([ref(OBS.unrateV1)],pub);
  expect(out.display.fact).toEqual({template:'topic.macro_level',slots:{series:'US_UNRATE',period:'2026-08-31',value:{value_text:'4.3',unit:'pct'}}});
  expect(out.drawer).toMatchObject({kind:'macro_observation',identity:{id:OBS.unrateV1},attribution_key:'macro:attribution',links:{module_href:'/macro/US_UNRATE'}});
  expect(out.freshness).toEqual({dataset:'macro.fred',status:'fresh',checked_at:'2026-11-15T00:00:00.000Z'});
  expect(out.digest).toMatch(/^[0-9a-f]{64}$/);
 });
 it('never puts a withheld value anywhere in the public result (rule 3)',async()=>{
  const [out]=await r().resolve([ref(OBS.vix)],pub);
  expect(JSON.stringify(out)).not.toContain('18.75');
  expect(out.drawer).toEqual({kind:'macro_observation',identity:{id:OBS.vix,label:expect.stringContaining('US_VIX')},reason:'catalog_restricted'});
 });
 it('lets an admin see the value, marked admin_only',async()=>{
  const [out]=await r().resolve([ref(OBS.vix)],{...pub,audience:'admin'});
  expect([out.state,out.admin_only]).toEqual(['ok',true]);
 });
 it('is not moved by a later revision of the same period (rule 2) and reports it as the latest identity',async()=>{
  const src=memorySources(macroFixture());const res=macroResolver(src);
  const before=(await res.resolve([ref(OBS.unrateV1)],pub))[0].digest;
  src.seed.macro.rows.push({...src.seed.macro.rows.find(x=>x.observation_id===OBS.unrateV1)!,observation_id:OBS.unrateV2,version:2,value_text:'4.2',available_at:'2026-10-03T12:30:00.000Z'});
  expect((await res.resolve([ref(OBS.unrateV1)],pub))[0].digest).toBe(before);
  expect(await res.latestIdentity(ref(OBS.unrateV1))).toMatchObject({state:'ok',object_id:OBS.unrateV2,value:{value_text:'4.2',unit:'pct'}});
 });
 it('gives the same digest twice (rule 7)',async()=>{
  const a=await r().resolve([ref(OBS.unrateV1)],pub),b=await r().resolve([ref(OBS.unrateV1)],pub);
  expect(a[0].digest).toBe(b[0].digest);
 });
});
it('keeps latest restricted and retracted values out of drift',async()=>{
 const src=memorySources(macroFixture()),res=macroResolver(src);
 expect(await res.latestIdentity(ref(OBS.vix))).toMatchObject({state:'withheld',reason:'catalog_restricted',value:null});
 const row=src.seed.macro.rows.find(r=>r.observation_id===OBS.unrateV1)!;
 src.seed.macro.rows.push({...row,observation_id:OBS.unrateV2,period_end:'2026-09-30'});
 expect(await res.latestIdentity(ref(OBS.unrateV1))).toMatchObject({state:'ok',newer_period:'2026-09-30'});
 row.status='rejected';
 expect(await res.latestIdentity(ref(OBS.unrateV1))).toMatchObject({state:'retracted',reason:'rejected',value:null});
 const [out]=await res.resolve([ref(OBS.unrateV1)],pub);
 expect([out.state,out.reason,out.digest,out.display.fact]).toEqual(['retracted','rejected',null,null]);
});
