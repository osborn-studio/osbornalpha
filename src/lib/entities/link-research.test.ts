import {describe,it,expect,vi,beforeEach} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {Row} from '../db/table-client';
import {batchStatusFromCounts} from '../dq/batches';
import type {IssuerInput,IssuerSecurityInput} from './types';
import {applyResearchLink,planResearchLink} from './link-research';
import type {EntityKeyRow,EntitySecurityRow} from './link-research';
import {loaderOutcome} from './load-sec';

const fake=vi.hoisted(()=>({issuers:new Map<string,string>(),owners:new Map<string,string>(),conflicts:new Set<string>()}));
vi.mock('./issuers',()=>({
 upsertIssuerByIdentifiers:vi.fn(async(client:{insert:(t:string,r:object)=>Promise<unknown>},input:IssuerInput)=>{
  const id=String(input.cik??input.lei??input.usci);
  if(fake.conflicts.has(id))return {issuer_id:null,created:false,conflict:true,reason:'hard_id_conflict'};
  const existing=fake.issuers.get(id);
  if(existing)return {issuer_id:existing,created:false};
  const issuer_id=`iss-${id}`;fake.issuers.set(id,issuer_id);
  await client.insert('issuers',{issuer_id,...input});
  return {issuer_id,created:true};
 }),
 attachSecurity:vi.fn(async(client:{insert:(t:string,r:object)=>Promise<unknown>},sec:IssuerSecurityInput)=>{
  const owner=fake.owners.get(sec.ticker);
  if(owner)return owner===sec.issuer_id?'duplicate':'conflict';
  fake.owners.set(sec.ticker,sec.issuer_id);
  await client.insert('issuer_securities',{...sec});
  return 'inserted';
 }),
}));

beforeEach(()=>{fake.issuers.clear();fake.owners.clear();fake.conflicts.clear();});

const AS_OF='2026-11-05';
const U='11111111-1111-1111-1111-111111111111';
const OTHER='22222222-2222-2222-2222-222222222222';
const LEI='3003003LS77D1DRDDE25',USCI='913300002539329145';
const key=(over:Partial<EntityKeyRow>):EntityKeyRow=>({user_id:U,entity_id:'e',lei:null,usci:null,cik:null,cninfo_org_id:null,names_zh:[],names_en:['Name'],home_market:'US',issuer_id:null,...over});
const sec=(over:Partial<EntitySecurityRow>):EntitySecurityRow=>({user_id:U,id:'s',entity_id:'e',exchange_code:'AAPL',isin:null,market:'US',security_type:'common',is_primary:false,valid_from:'2000-01-01',valid_to:null,...over});
const universe=(entries:Record<string,string>)=>new Map(Object.entries(entries));
const kprov={source:'research_entity_keys',as_of:AS_OF};

describe('planResearchLink',()=>{
 it('promotes only valid, named, hard-identified entities with source-only provenance and evidence-based country/share class',()=>{
  const plan=planResearchLink(
   [key({entity_id:'e1',lei:LEI,usci:USCI,cninfo_org_id:'gssh0600570',names_zh:['恒生电子'],names_en:['Hundsun Technologies Inc.'],home_market:'A'}),
    key({entity_id:'e2',names_zh:['无标识']}),
    key({entity_id:'e3',cik:'320193',names_en:[42,'Apple Inc.'],issuer_id:'already'})],
   [sec({id:'s1',entity_id:'e1',exchange_code:'600570.SH',isin:'CNE000001GN7',market:'A',is_primary:true,valid_from:'2003-12-16'}),
    sec({id:'s2',entity_id:'e3',exchange_code:'AAPL',security_type:'adr'}),
    sec({id:'s3',entity_id:'e3',exchange_code:'NOPE'})],
   universe({'600570.SH':'A',AAPL:'US'}),AS_OF,
  );
  expect(plan.fetched).toBe(3);
  expect(plan.issuers).toEqual([
   {entity_key:`${U}:e1`,user_id:U,entity_id:'e1',current_issuer_id:null,input:{lei:LEI,usci:USCI,cik:null,cninfo_org_id:'gssh0600570',canonical_name_zh:'恒生电子',canonical_name_en:'Hundsun Technologies Inc.',country_code:'CN',provenance:{lei:kprov,usci:kprov,cninfo_org_id:kprov,canonical_name_zh:kprov,canonical_name_en:kprov,country_code:kprov}}},
   {entity_key:`${U}:e3`,user_id:U,entity_id:'e3',current_issuer_id:'already',input:{lei:null,usci:null,cik:'320193',cninfo_org_id:null,canonical_name_zh:null,canonical_name_en:'Apple Inc.',country_code:null,provenance:{cik:kprov,canonical_name_en:kprov}}},
  ]);
  const sprov={source:'research_entity_securities'};
  expect(plan.securities).toEqual([
   {entity_key:`${U}:e1`,user_id:U,entity_id:'e1',security_id:'s1',ticker:'600570.SH',isin:'CNE000001GN7',share_class:'A',is_primary:true,valid_from:'2003-12-16',valid_to:null,source:'research_entity_securities',provenance:sprov},
   {entity_key:`${U}:e3`,user_id:U,entity_id:'e3',security_id:'s2',ticker:'AAPL',isin:null,share_class:'ADR',is_primary:false,valid_from:'2000-01-01',valid_to:null,source:'research_entity_securities',provenance:sprov},
  ]);
  expect(plan.skipped).toEqual([{entity_key:`${U}:e2`,reason:'no_hard_identifier'},{entity_key:`${U}:e3`,security_id:'s3',reason:'ticker_not_in_universe:NOPE'}]);
 });

 it('never writes the user id or entity ids into public issuer or security inputs',()=>{
  const plan=planResearchLink(
   [key({entity_id:'ent-secret-1',cik:'320193'}),key({entity_id:'ent-secret-2',usci:USCI,home_market:'A'})],
   [sec({id:'sec-secret-1',entity_id:'ent-secret-1'}),sec({id:'sec-secret-2',entity_id:'ent-secret-2',exchange_code:'600570',market:'A'})],
   universe({AAPL:'US','600570.SH':'A'}),AS_OF,
  );
  expect(plan.issuers).toHaveLength(2);
  expect(plan.securities).toHaveLength(2);
  const pub=JSON.stringify([plan.issuers.map(i=>i.input),plan.securities.map(({entity_key:_k,user_id:_u,entity_id:_e,security_id:_s,...rest})=>rest)]);
  for(const secret of [U,'ent-secret-1','ent-secret-2','sec-secret-1','sec-secret-2'])expect(pub).not.toContain(secret);
 });

 it('validates identifiers and requires a name',()=>{
  const plan=planResearchLink(
   [key({entity_id:'a',lei:'NOTALEI000000000000X'}),key({entity_id:'b',usci:'913300002539329140'}),key({entity_id:'c',cik:'0'}),
    key({entity_id:'d',cik:'12345678901'}),key({entity_id:'e',cik:'320193',names_zh:[1,null],names_en:'Apple'})],
   [],new Map(),AS_OF,
  );
  expect(plan.issuers).toEqual([]);
  expect(plan.skipped.map(s=>s.reason)).toEqual(['invalid_identifier:lei','invalid_identifier:usci','invalid_identifier:cik','invalid_identifier:cik','name_required']);
 });

 it('sets H only with mainland evidence, B-share prefixes become other, and checks ticker validity and market',()=>{
  const plan=planResearchLink(
   [key({entity_id:'h',usci:USCI,home_market:'HK'}),key({entity_id:'hk',lei:LEI,home_market:'HK'}),key({entity_id:'ha',cik:'1',home_market:'A'})],
   [sec({id:'1',entity_id:'h',exchange_code:'700',market:'HK'}),
    sec({id:'2',entity_id:'hk',exchange_code:'5',market:'HK'}),
    sec({id:'3',entity_id:'ha',exchange_code:'1398',market:'HK'}),
    sec({id:'4',entity_id:'h',exchange_code:'900901',market:'A'}),
    sec({id:'5',entity_id:'h',exchange_code:'200596.SZ',market:'A'}),
    sec({id:'6',entity_id:'h',exchange_code:'ABCDEF',market:'A'}),
    sec({id:'7',entity_id:'h',exchange_code:'00941',market:'HK'})],
   universe({'00700.HK':'HK','00005.HK':'HK','01398.HK':'HK','900901.SH':'A','200596.SZ':'A','00941.HK':'US'}),AS_OF,
  );
  expect(plan.issuers.map(i=>i.input.country_code)).toEqual(['CN',null,null]);
  expect(plan.securities.map(s=>[s.ticker,s.share_class])).toEqual([['00700.HK','H'],['00005.HK','unknown'],['01398.HK','H'],['900901.SH','other'],['200596.SZ','other']]);
  expect(plan.skipped.map(s=>s.reason)).toEqual(['invalid_ticker:ABCDEF','market_mismatch:00941.HK']);
 });

 it('links the exact upper-cased code before normalizing it (BRK.A never collapses to BRK)',()=>{
  const plan=planResearchLink(
   [key({entity_id:'b',cik:'1067983',names_en:['Berkshire Hathaway']})],
   [sec({id:'1',entity_id:'b',exchange_code:'brk.a'}),sec({id:'2',entity_id:'b',exchange_code:'BRK/A',market:'other'})],
   universe({'BRK.A':'US',BRK:'US'}),AS_OF,
  );
  expect(plan.securities.map(s=>s.ticker)).toEqual(['BRK.A','BRK.A']);
  expect(plan.skipped).toEqual([]);
 });
});

describe('applyResearchLink',()=>{
 const KEYS={research_entity_keys:['user_id','entity_id'],research_entity_securities:['user_id','id']};
 const seed=()=>{
  const c=memoryTableClient(KEYS);
  const rows:[string,Row][]=[
   ['research_entity_keys',{...key({entity_id:'e1',cik:'320193',names_en:['Apple Inc.']})}],
   ['research_entity_keys',{...key({entity_id:'e2',cik:'789019',names_en:['Microsoft']})}],
   ['research_entity_keys',{...key({user_id:OTHER,entity_id:'e1',cik:'320193',names_en:['Apple Inc.']})}],
   ['research_entity_securities',{...sec({id:'s1',entity_id:'e1',exchange_code:'AAPL'}),ticker:null}],
   ['research_entity_securities',{...sec({id:'s2',entity_id:'e2',exchange_code:'MSFT'}),ticker:null}],
   ['research_entity_securities',{...sec({user_id:OTHER,id:'s1',entity_id:'e1',exchange_code:'AAPL'}),ticker:null}],
   ['stocks_universe',{ticker:'AAPL',market:'US'}],['stocks_universe',{ticker:'MSFT',market:'US'}],
  ];
  return Promise.all(rows.map(([t,r])=>c.insert(t,r))).then(()=>c);
 };
 const planFor=async(c:ReturnType<typeof memoryTableClient>)=>planResearchLink(
  (await c.select('research_entity_keys',{user_id:U})) as unknown as EntityKeyRow[],
  (await c.select('research_entity_securities',{user_id:U})) as unknown as EntitySecurityRow[],
  new Map((await c.select('stocks_universe',{})).map(r=>[String(r.ticker),String(r.market)])),AS_OF);

 it('links issuers and securities for one user; a second run is all duplicates and succeeds; other users are untouched',async()=>{
  const c=await seed();
  const otherBefore=[c.rows('research_entity_keys').filter(r=>r.user_id===OTHER),c.rows('research_entity_securities').filter(r=>r.user_id===OTHER)];
  const first=await applyResearchLink(c,await planFor(c),{userId:U});
  expect(first.counts).toEqual({fetched:2,inserted:4,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(first.errors).toEqual([]);
  expect(c.rows('research_entity_keys').filter(r=>r.user_id===U).map(r=>r.issuer_id)).toEqual(['iss-320193','iss-789019']);
  expect(c.rows('research_entity_securities').filter(r=>r.user_id===U).map(r=>r.ticker)).toEqual(['AAPL','MSFT']);
  const second=await applyResearchLink(c,await planFor(c),{userId:U});
  expect(second.counts).toEqual({fetched:2,inserted:0,duplicates:4,versioned:0,quarantined:0,failed:0});
  const status=batchStatusFromCounts(second.counts,second.errors);
  expect(status).toBe('success');
  expect(loaderOutcome(status,second.counts)).toEqual({ok:true,exitCode:0});
  expect([c.rows('research_entity_keys').filter(r=>r.user_id===OTHER),c.rows('research_entity_securities').filter(r=>r.user_id===OTHER)]).toEqual(otherBefore);
  const pub=JSON.stringify([c.rows('issuers'),c.rows('issuer_securities')]);
  for(const secret of [U,'e1','e2','s1','s2'])expect(pub).not.toMatch(new RegExp(`"${secret}"`));
 });

 it('quarantines a conflicting issuer, links nothing for it and blocks its securities as failed',async()=>{
  fake.conflicts.add('789019');
  const c=await seed();
  const res=await applyResearchLink(c,await planFor(c),{userId:U});
  expect(res.counts).toEqual({fetched:2,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:1});
  expect(res.errors.map(e=>[e.code,e.key])).toEqual([['issuer_conflict',`${U}:e2`],['blocked_by_issuer',`${U}:e2:s2`]]);
  expect(c.rows('research_entity_keys').find(r=>r.user_id===U&&r.entity_id==='e2')?.issuer_id).toBeNull();
  expect(c.rows('research_entity_securities').find(r=>r.user_id===U&&r.id==='s2')?.ticker).toBeNull();
  expect(c.rows('issuer_securities').map(r=>r.ticker)).toEqual(['AAPL']);
  expect(loaderOutcome(batchStatusFromCounts(res.counts,res.errors),res.counts).exitCode).toBe(1);
 });

 it('counts the public insert, then fails the link when the private update hits no row',async()=>{
  const c=memoryTableClient(KEYS);
  await c.insert('stocks_universe',{ticker:'AAPL',market:'US'});
  const plan=planResearchLink([key({entity_id:'ghost',cik:'320193'})],[sec({id:'gs',entity_id:'ghost'})],universe({AAPL:'US'}),AS_OF);
  const res=await applyResearchLink(c,plan,{userId:U});
  expect(res.counts).toEqual({fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:2});
  expect(res.errors.map(e=>e.code)).toEqual(['link_failed','blocked_by_issuer']);
  const status=batchStatusFromCounts(res.counts,res.errors);
  expect(status).toBe('partial');
  expect(loaderOutcome(status,res.counts)).toEqual({ok:false,exitCode:1});
 });

 it('records a relink and still updates the link',async()=>{
  const c=await seed();
  await c.update('research_entity_keys',{user_id:U,entity_id:'e1'},{issuer_id:'old-issuer'});
  const res=await applyResearchLink(c,await planFor(c),{userId:U});
  expect(res.errors).toEqual([{code:'relink',key:`${U}:e1`,message:'old-issuer->iss-320193'}]);
  expect(c.rows('research_entity_keys').find(r=>r.user_id===U&&r.entity_id==='e1')?.issuer_id).toBe('iss-320193');
 });

 it('summarizes skips in one error, fails an empty plan and refuses a plan for another user',async()=>{
  const empty=planResearchLink([key({entity_id:'x'})],[],new Map(),AS_OF);
  const res=await applyResearchLink(memoryTableClient(),empty,{userId:U});
  expect(res.errors).toEqual([{code:'skipped_summary',message:'{"no_hard_identifier":1}'},{code:'empty_plan',message:'no research entity qualified for promotion'}]);
  expect(batchStatusFromCounts(res.counts,res.errors)).toBe('failed');
  const plan=planResearchLink([key({entity_id:'x',cik:'1'})],[],new Map(),AS_OF);
  await expect(applyResearchLink(memoryTableClient(),plan,{userId:OTHER})).rejects.toThrow('plan_user_mismatch');
 });
});
