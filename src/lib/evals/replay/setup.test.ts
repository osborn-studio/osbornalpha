// src/lib/evals/replay/setup.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MAPPING_GEN} from '../../facts/concepts';
import {FORMULA_VERSION} from '../../facts/derive';
import {sameDayConflictKey} from '../../facts/keys';
import {sha256Hex} from '../canonical-json';
import {memoryTableClient} from '../../db/memory-table-client';
import {buildFrozenMemory,configSha256,groupSealedSetups,sealSetup,sealSetupFromPaths,setupSha256,withoutFreshness} from './setup';
import type {FrozenBuild,FrozenSetup,FrozenSetupDraft,FrozenWorld} from './setup';

const EDGAR='src/lib/evals/fixtures/edgar/';
const SEED='src/lib/evals/fixtures/issuers/f6-seed.json';
const FILES=['CIK0009990601.json','CIK0009990602.json','CIK0009990603.json','CIK0009990603.amended.json','CIK0009990603.conflict.json'];
const C_ID='f6000000-0000-4000-8000-000009990603';
const TODAY='2026-11-20';
const fileSha=(p:string)=>sha256Hex(readFileSync(p));
const draft=(over:Partial<FrozenSetupDraft>={}):FrozenSetupDraft=>({initial_state:'empty_after_migrations',issuer_seed:{path:SEED,sha256:fileSha(SEED)},
 fixture_manifest:FILES.map(f=>({path:EDGAR+f,sha256:fileSha(EDGAR+f)})),sync_order:['CIK0009990603.json'],today:TODAY,mapping_gen:MAPPING_GEN,formula_version:FORMULA_VERSION,
 quarantine_resolutions:[],config_sha256:configSha256(),...over});
const setup=(over:Partial<FrozenSetupDraft>={}):FrozenSetup=>sealSetup(draft(over));
const worldOf=(b:FrozenBuild):FrozenWorld=>{if(!b.ok)throw new Error(b.mismatch);return b.world;};
const NI={concept:'net_income_parent',period_start:'2022-09-25',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'};
const rev=(w:FrozenWorld,asOf:string)=>w.db.readFacts(C_ID,'US',{concepts:['revenue'],asOf,from:'2023-09-30',to:'2023-09-30'}).then(r=>r.rows.filter(x=>x.duration==='12M').map(x=>x.value_text));

describe('setupSha256 / sealSetup',()=>{
 it('hashes the canonical JSON of every field but setup_sha256 (key order and the old hash do not matter)',()=>{
  const d=draft();
  const reordered=Object.fromEntries(Object.entries(d).reverse()) as unknown as FrozenSetupDraft;
  expect(setupSha256(reordered)).toBe(setupSha256(d));
  expect(sealSetup(d).setup_sha256).toBe(setupSha256(d));
  expect(setupSha256({...sealSetup(d)})).toBe(setupSha256(d));
  expect(setupSha256({...d,today:'2026-11-21'})).not.toBe(setupSha256(d));
 });
});

describe('buildFrozenMemory (spec §5.3.1, §0 R5-2)',()=>{
 it('seeds the issuers, reconciles their scope and syncs ZZEVC with the fixed clock; issuers are keyed by ticker',async()=>{
  const b=await buildFrozenMemory(setup());
  expect(b.ok).toBe(true);
  if(!b.ok)return;
  expect(b.issuers).toEqual({ZZEVA:'f6000000-0000-4000-8000-000009990601',ZZEVB:'f6000000-0000-4000-8000-000009990602',ZZEVC:C_ID});
  const w=b.world;
  expect(w.today).toBe(TODAY);expect(w.now.toISOString()).toBe('2026-11-20T12:00:00.000Z');
  expect(await rev(w,TODAY)).toEqual(['383285000000']);
  expect((await w.db.filingsOfIssuer(C_ID,'US',{})).map(f=>f.source_ref)).toEqual(['0009990603-23-000106']);
  expect([...w.storage.objects.keys()]).toContain(`edgar/${C_ID}/${fileSha(EDGAR+'CIK0009990603.json')}.json`);
  expect((await w.db.scopeRows('US',[C_ID]))[0]).toMatchObject({fetch_key:'0009990603',priority:10});
  expect(await w.tables.select('dq_freshness',{dataset:'facts.us'})).toEqual([]);   // the fixed clock never reaches dq_freshness
 });
 it('withoutFreshness drops dq_freshness writes only; sealSetupFromPaths fills every hash from the bytes',async()=>{
  const t=memoryTableClient({dq_freshness:['dataset'],x:['id']});
  const w=withoutFreshness(t);
  await w.upsert('dq_freshness',{dataset:'facts.us',status:'stale'},'dataset');await w.insert('x',{id:'1'});
  expect(await t.select('dq_freshness',{dataset:'facts.us'})).toEqual([]);expect(await w.select('x',{id:'1'})).toHaveLength(1);
  const d=draft();
  const sealed=sealSetupFromPaths({initial_state:d.initial_state,issuer_seed:{path:SEED},fixture_manifest:FILES.map(f=>({path:EDGAR+f})),sync_order:d.sync_order,today:d.today,mapping_gen:d.mapping_gen,formula_version:d.formula_version,quarantine_resolutions:[]});
  expect(sealed).toEqual(sealSetup(d));
 });
 it('sync() replays a later manifest fixture: the 10-K/A is a new disclosure, replayable by asOf',async()=>{
  const w=worldOf(await buildFrozenMemory(setup()));
  const r=await w.sync('CIK0009990603.amended.json');
  expect(r.counts).toMatchObject({versioned:1,inserted:0,failed:0});
  expect(await rev(w,'2026-06-14')).toEqual(['383285000000']);
  expect(await rev(w,'2026-06-15')).toEqual(['383285000001']);
 });
 it('the A and B fixtures carry the source values under rewritten accessions only',async()=>{
  const w=worldOf(await buildFrozenMemory(setup({sync_order:['CIK0009990601.json','CIK0009990602.json']})));
  const refs=[...(await w.db.filingsOfIssuer(w.issuers.ZZEVA,'US',{})),...(await w.db.filingsOfIssuer(w.issuers.ZZEVB,'US',{}))].map(f=>f.source_ref);
  expect(refs).toContain('0009990601-23-000106');expect(refs).toContain('0009990602-23-035122');
  expect(refs.filter(r=>!/^000999060[12]-/.test(r))).toEqual([]);
  const b=await w.db.readFacts(w.issuers.ZZEVB,'US',{concepts:['revenue'],asOf:TODAY,from:'2023-06-30',to:'2023-06-30'});
  expect(b.rows.filter(x=>x.duration==='12M').map(x=>x.value_text)).toEqual(['211915000000']);
 },60_000);
 it('quarantine_resolutions resolve the listed same-day conflict by value',async()=>{
  const key=sameDayConflictKey(C_ID,'US',NI,'2023-11-03');
  const w=worldOf(await buildFrozenMemory(setup({sync_order:['CIK0009990603.json','CIK0009990603.conflict.json'],quarantine_resolutions:[{natural_key:key,chosen_values:['96995000000']}]})));
  const ni=await w.db.readFacts(C_ID,'US',{concepts:['net_income_parent'],asOf:TODAY,from:'2023-09-30',to:'2023-09-30',history:true,includeNonOk:true});
  expect(ni.rows.filter(x=>x.duration==='12M').map(x=>[x.value_text,x.status]).sort()).toEqual([['96995000000','ok'],['96995000007','quarantined']]);
  expect(await w.db.openConflicts(C_ID,'US')).toEqual([]);
 });
 it('every mismatch is reported (ok:false) and nothing is synced; fields are named',async()=>{
  const cases:[FrozenSetup,RegExp][]=[
   [{...setup(),today:'2026-11-21'},/^setup_sha256/],
   [setup({initial_state:'something_else' as 'empty_after_migrations'}),/^initial_state/],
   [setup({today:'2026-13-40'}),/^today/],
   [setup({mapping_gen:MAPPING_GEN+1}),/^mapping_gen/],
   [setup({formula_version:'v1'}),/^formula_version/],
   [setup({config_sha256:'0'.repeat(64)}),/^config_sha256/],
   [setup({issuer_seed:{path:SEED,sha256:'0'.repeat(64)}}),/^issuer_seed/],
   [setup({fixture_manifest:[{path:EDGAR+'CIK0009990603.json',sha256:'0'.repeat(64)}]}),/^fixture_manifest:src\/lib\/evals\/fixtures\/edgar\/CIK0009990603\.json/],
   [setup({fixture_manifest:[{path:EDGAR+'CIK0009990699.json',sha256:'0'.repeat(64)}]}),/^fixture_manifest/],
   [setup({sync_order:['CIK0009990604.json']}),/^sync_order/],
   [setup({quarantine_resolutions:[{natural_key:'nope',chosen_values:['1']}]}),/^quarantine_resolutions/],
  ];
  for(const [s,re] of cases){const b=await buildFrozenMemory(s);expect(b.ok,re.source).toBe(false);if(!b.ok)expect(b.mismatch).toMatch(re);}
 });
 it('sync() of a name outside the manifest is a SetupMismatch',async()=>{
  const w=worldOf(await buildFrozenMemory(setup()));
  await expect(w.sync('CIK0009990603.other.json')).rejects.toMatchObject({name:'SetupMismatch',field:'fixture_manifest'});
 });
});

describe('groupSealedSetups (P1-6)',()=>{
 it('recomputes every case: a tampered second case keeping the declared hash is a mismatch, never grouped with the first',()=>{
  const a=setup();const tampered={...a,today:'2026-11-21'};   // same declared setup_sha256, different content
  const r=groupSealedSetups([{case_id:'c1',setup:a},{case_id:'c2',setup:tampered},{case_id:'c3',setup:{...a}}]);
  expect(r.groups.map(g=>g.cases.map(c=>c.case_id))).toEqual([['c1','c3']]);
  expect(r.mismatched.map(m=>[m.case.case_id,m.mismatch])).toEqual([['c2','setup_sha256']]);
  expect(groupSealedSetups([{case_id:'x',setup:null}]).mismatched.map(m=>m.mismatch)).toEqual(['setup']);
 });
});
