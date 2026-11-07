// src/lib/industry/resolve-memberships.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {runClassificationsSw} from './classifications';
import {countUnresolved,membersAt} from './memberships';
import {memoryIndustryDb} from './memory-industry-db';
import {fixtureTushareCall} from './providers/tushare-industry';
import type {TushareCall} from './providers/tushare-industry';
import {resolveSourceMemberships,runResolveMemberships,targetsFor,windowEnd} from './resolve-memberships';
import type {ResolvedValue} from './resolve-memberships';
import {runMembershipsSw} from './source-memberships';
import type {IndustryDb,IndustryDeps,ManifestStore,SourceMembershipRow} from './types';
import {IndustryDbError} from './types';

const NOW='2026-11-09T02:00:00.000Z';const TODAY='2026-11-09';
const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
const noSleep=async()=>{};
// issuers of eleven recorded companies (load-a-share's job; seeded directly here, delisted ones included with an open
// security window — load-a-share never closes windows, spec §4.7 step 4)
const ISSUER:Record<string,string>={'600519.SH':'a0000000-0000-4000-8000-000000000001','000858.SZ':'a0000000-0000-4000-8000-000000000002','600887.SH':'a0000000-0000-4000-8000-000000000003',
 '000869.SZ':'a0000000-0000-4000-8000-000000000004','603288.SH':'a0000000-0000-4000-8000-000000000005','002770.SZ':'a0000000-0000-4000-8000-000000000006','600090.SH':'a0000000-0000-4000-8000-000000000007',
 '600036.SH':'a0000000-0000-4000-8000-000000000008','601398.SH':'a0000000-0000-4000-8000-000000000009','000001.SZ':'a0000000-0000-4000-8000-00000000000a','601166.SH':'a0000000-0000-4000-8000-00000000000b'};

async function setup(call:TushareCall=fixtureTushareCall(),db:IndustryDb=memoryIndustryDb()){
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_freshness:['dataset'],dq_quarantine:['id'],issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});
 for(const [ts,id] of Object.entries(ISSUER)){
  await tables.insert('issuers',{issuer_id:id,canonical_name_zh:ts,status:'active',merged_into:null});
  await tables.insert('issuer_securities',{issuer_id:id,ticker:ts,isin:null,figi:null,share_class:'A',is_primary:true,valid_from:'1990-01-01',valid_to:null});
 }
 const deps:IndustryDeps={tables,db,facts:memoryFactsDb(),manifests:unusedManifests,now:()=>new Date(NOW),codeVersion:'sha',tushare:call};
 await runClassificationsSw({...deps,tushare:fixtureTushareCall()},{sleep:noSleep});
 await runMembershipsSw(deps,{apply:true,sleep:noSleep});
 return {tables,db,deps};
}
const src=(over:Partial<SourceMembershipRow>):SourceMembershipRow=>({id:'s1',scheme:'sw2021',version:'2021',source:'tushare:index_member_all',ts_code:'600090.SH',name:'同济堂',l1_code:'801120.SI',l2_code:'801126.SI',l3_code:'851232.SI',in_date:'1997-06-16',out_date:'2017-06-28',observed_at:NOW,batch_id:'b',raw_hash:'h',locator:{row:1},status:'current',superseded_by:null,issuer_id:null,resolution:{},resolution_error:null,...over});

describe('targetsFor / resolveSourceMemberships (pure)',()=>{
 it('one record → L1/L2/L3 rows: valid_from = available_date = in_date; valid_to = valid_to_available_date = out_date + 1 day (K3)',()=>{
  expect(targetsFor(src({}))).toEqual([1,2,3].map((level,i)=>({code:['801120.SI','801126.SI','851232.SI'][i],level,valid_from:'1997-06-16',valid_to:'2017-06-29',available_date:'1997-06-16',valid_to_available_date:'2017-06-29',source:'tushare:index_member_all',
   provenance:{availability:'effective_date_assumed',source_membership_id:'s1',raw_hash:'h',locator:{row:1}}})));
 });
 it('windowEnd = min(out_date + 1, delist_date); delisting closes an open window',()=>{
  expect([windowEnd(null,null),windowEnd('2017-06-28',null),windowEnd(null,'2022-06-23'),windowEnd('2017-06-28','2022-07-07'),windowEnd('2022-12-31','2022-07-07'),windowEnd('2024-02-28',null)])
   .toEqual([null,'2017-06-29','2022-06-23','2017-06-29','2022-07-07','2024-02-29']);
  expect(targetsFor(src({ts_code:'002770.SZ',in_date:'2015-01-19',out_date:null}),'2022-06-23')[0]).toMatchObject({valid_to:'2022-06-23',valid_to_available_date:'2022-06-23'});
 });
 it('targetsFor carries provenance.delisting only where the delisting determines the window end',()=>{
  const ev={delist_date:'2022-06-23',raw_hash:'dh',batch_id:'b1',observed_at:NOW};
  const open=targetsFor(src({ts_code:'002770.SZ',in_date:'2015-01-19',out_date:null}),'2022-06-23',ev);
  expect(open.map(t=>t.provenance.delisting)).toEqual([ev,ev,ev]);
  expect(targetsFor(src({out_date:'2017-06-28'}),'2022-06-23',ev)[0].provenance.delisting).toBeUndefined();   // the record ends earlier by its own out_date
  expect(targetsFor(src({out_date:null}),null,ev)[0].provenance.delisting).toBeUndefined();
 });
 it('blocked ts_codes (delist_date missing) are never applied; resolver failures are kept apart from no_issuer',()=>{
  const plan=resolveSourceMemberships([src({id:'a',ts_code:'000001.SZ'}),src({id:'b',ts_code:'000002.SZ'})],new Map<string,ResolvedValue>([['000001.SZ','I1'],['000002.SZ',{error:'resolve_error',detail:'db_down',failure:true}]]),new Map(),{blocked:new Set(['000001.SZ'])});
  expect(plan.groups).toEqual([]);expect(plan.blocked).toEqual([{id:'a',ts_code:'000001.SZ',in_date:'1997-06-16'}]);
  expect(plan.unresolved).toEqual([{id:'b',ts_code:'000002.SZ',code:'resolve_error',detail:'db_down',failure:true}]);
 });
 it('groups records per issuer, keeps unresolved, resolver errors and after-delist records apart, ignores resolved/superseded rows',()=>{
  const plan=resolveSourceMemberships([src({}),src({id:'s2',l3_code:'851233.SI',in_date:'2017-06-29',out_date:null}),src({id:'s3',ts_code:'688999.SH'}),src({id:'s4',ts_code:'600001.SH'}),src({id:'s5',issuer_id:'x'}),src({id:'s6',status:'superseded'}),src({id:'s7',ts_code:'000662.SZ',in_date:'2021-07-30',out_date:null})],
   new Map<string,string|null|{error:string}>([['600090.SH','I7'],['688999.SH',null],['600001.SH',{error:'ambiguous_owner'}],['000662.SZ','I9']]),new Map([['600090.SH','2022-07-07'],['000662.SZ','2021-04-12']]));
  expect(plan.groups.map(g=>[g.issuer_id,g.sourceIds,g.rows.length,g.rows.map(r=>r.valid_to)])).toEqual([['I7',['s1','s2'],6,['2017-06-29','2017-06-29','2017-06-29','2022-07-07','2022-07-07','2022-07-07']]]);
  expect(plan.unresolved).toEqual([{id:'s4',ts_code:'600001.SH',code:'ambiguous_owner'},{id:'s3',ts_code:'688999.SH',code:'no_issuer'}]);
  expect(plan.afterDelist).toEqual([{id:'s7',ts_code:'000662.SZ',in_date:'2021-07-30',delist_date:'2021-04-12',issuer_id:'I9'}]);
 });
});

describe('runResolveMemberships (real recordings)',()=>{
 it('resolves by ticker as of today, writes three rows per record with K3 windows in one call per issuer, marks unresolved records and counts them',async()=>{
  const {tables,db,deps}=await setup();
  const r=await runResolveMemberships(deps,{triggeredBy:'cron'});
  expect(r.records).toEqual({applied:12,unresolved:217,failed:0,afterDelist:0,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0});
  expect(r.status).toBe('success');
  expect(r.errors[0]).toEqual({code:'skipped_summary',message:JSON.stringify({no_issuer:217})});
  const zhangyu=await db.membershipsOfIssuer(ISSUER['000869.SZ'],{scheme:'sw2021'});
  expect(zhangyu.filter(m=>m.status==='ok').map(m=>[m.level,m.code,m.valid_from,m.valid_to,m.available_date,m.valid_to_available_date]).sort()).toEqual([
   [1,'801120.SI','2000-10-10','2007-06-30','2000-10-10','2007-06-30'],[1,'801120.SI','2007-07-02',null,'2007-07-02',null],
   [2,'801126.SI','2000-10-10','2007-06-30','2000-10-10','2007-06-30'],[2,'801126.SI','2007-07-02',null,'2007-07-02',null],
   [3,'851233.SI','2000-10-10','2007-06-30','2000-10-10','2007-06-30'],[3,'851233.SI','2007-07-02',null,'2007-07-02',null],
  ]);
  expect(zhangyu.every(m=>m.provenance.availability==='effective_date_assumed'&&typeof m.provenance.source_membership_id==='string')).toBe(true);
  // delisting closes the open upstream window (K3); a historical record keeps out_date + 1
  expect((await db.membershipsOfIssuer(ISSUER['002770.SZ'],{scheme:'sw2021'})).map(m=>[m.level,m.valid_from,m.valid_to,m.valid_to_available_date])).toEqual([[1,'2015-01-19','2022-06-23','2022-06-23'],[2,'2015-01-19','2022-06-23','2022-06-23'],[3,'2015-01-19','2022-06-23','2022-06-23']]);
  expect((await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).map(m=>m.valid_to)).toEqual(['2017-06-29','2017-06-29','2017-06-29']);
  // K4 evidence: the delisting that determines the window end travels in provenance.delisting; a record ending by its own out_date has none
  const delRow=(await db.delistings()).find(d=>d.ts_code==='002770.SZ')!;
  expect((await db.membershipsOfIssuer(ISSUER['002770.SZ'],{scheme:'sw2021'})).map(m=>m.provenance.delisting)).toEqual(Array(3).fill({delist_date:'2022-06-23',raw_hash:delRow.raw_hash,batch_id:delRow.batch_id,observed_at:delRow.observed_at}));
  expect(delRow.delist_date).toBe('2022-06-23');
  expect((await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).map(m=>m.provenance.delisting)).toEqual([undefined,undefined,undefined]);
  const left=await db.currentSourceMemberships({unresolvedOnly:true});
  expect(left).toHaveLength(217);
  expect(left.every(s=>s.resolution_error?.code==='no_issuer')).toBe(true);
  const done=(await db.currentSourceMemberships({})).find(s=>s.ts_code==='600519.SH')!;
  expect(done.resolution).toMatchObject({method:'today',resolved_at:NOW,as_of:TODAY});
  expect(done.resolution.membership_ids).toHaveLength(3);
  for(const on of ['2023-12-31','2017-06-28','2017-06-29'])
   expect(countUnresolved(await db.currentSourceMemberships({}),{code:'801120.SI',level:1,on,knownBy:TODAY})).toBe(await db.unresolvedCount({code:'801120.SI',level:1,on,knownBy:TODAY}));
  expect(tables.rows('ingest_batches').at(-1)).toMatchObject({producer:'industry-sw-resolve',dataset:'industry.sw2021.memberships',status:'success'});
  expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sw2021.memberships')).toMatchObject({expected_cadence:'weekly',status:'fresh'});
  // a second run has nothing new to resolve except the retried unresolved records
  const again=await runResolveMemberships(deps,{});
  expect(again.records).toEqual({applied:0,unresolved:217,failed:0,afterDelist:0,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0});
 });
 it('correction path (a): an out_date correction supersedes the old record, and resolving the new record supersedes its membership rows',async()=>{
  // synthetic edit of a real response = earlier upstream state: 600090.SH's exit dated 2017-06-20
  const earlier:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='index_member_all')return r;
   const ts=r.fields.indexOf('ts_code'),out=r.fields.indexOf('out_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===out?'20170620':v):it)};
  };
  const {db,deps}=await setup(earlier);
  await runResolveMemberships(deps,{});
  const before=(await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).filter(m=>m.code==='801126.SI');
  expect(before.map(m=>[m.status,m.valid_to])).toEqual([['ok','2017-06-21']]);
  await runMembershipsSw({...deps,tushare:fixtureTushareCall()},{apply:true,sleep:noSleep});
  const r=await runResolveMemberships({...deps,tushare:fixtureTushareCall()},{});
  expect(r.records.applied).toBe(1);expect(r.counts.versioned).toBe(1);
  const l2=(await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).filter(m=>m.code==='801126.SI');
  const old=l2.find(m=>m.status==='superseded')!,next=l2.find(m=>m.status==='ok')!;
  expect(old.valid_to).toBe('2017-06-21');expect(next.valid_to).toBe('2017-06-29');
  expect(old.superseded_by).toBe(next.membership_id);
 });
 it('a delisting after resolution closes the already-resolved open rows on a later run (identical member payload; Codex round 1 #3)',async()=>{
  // run 1 — synthetic edit of a real response: 002770.SZ is not yet in stock_basic(D) (still listed)
  const listed:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code');return {...r,items:r.items.filter(it=>it[ts]!=='002770.SZ')};
  };
  const {tables,db,deps}=await setup(listed);
  await runResolveMemberships(deps,{});
  const before=await db.membershipsOfIssuer(ISSUER['002770.SZ'],{scheme:'sw2021'});
  expect(before.map(m=>[m.status,m.valid_to])).toEqual([['ok',null],['ok',null],['ok',null]]);
  // run 2 — the real response: 002770.SZ delisted 2022-06-23; index_member_all unchanged (still Y, out_date null)
  const r=await runResolveMemberships({...deps,tushare:fixtureTushareCall()},{});
  expect(r.records).toMatchObject({applied:0,delistClosed:1,delistConflicts:0});
  const after=await db.membershipsOfIssuer(ISSUER['002770.SZ'],{scheme:'sw2021'});
  expect(after.map(m=>[m.membership_id,m.status,m.valid_to,m.valid_to_available_date])).toEqual(before.map(m=>[m.membership_id,'ok','2022-06-23','2022-06-23']));   // same rows, closed in place
  expect((await db.currentSourceMemberships({})).find(s=>s.ts_code==='002770.SZ')!.issuer_id).toBe(ISSUER['002770.SZ']);
  const delRow=(await db.delistings()).find(d=>d.ts_code==='002770.SZ')!;
  expect(after.map(m=>m.provenance.delisting)).toEqual(Array(3).fill({delist_date:'2022-06-23',raw_hash:delRow.raw_hash,batch_id:delRow.batch_id,observed_at:delRow.observed_at}));   // merged in on the in-place closure
  // run 3 — nothing left to close
  expect((await runResolveMemberships({...deps,tushare:fixtureTushareCall()},{})).records).toMatchObject({delistClosed:0,delistConflicts:0});
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='membership_delist_conflict')).toEqual([]);
 });
 it('a delisting learned after an exit window closed supersedes it with the K3-bounded window (Codex round 2 R2-2)',async()=>{
  // run 1 — synthetic edit of a real response: 600090.SH not yet delisted; its 801126.SI window closed by out_date 2017-06-29
  const listed:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code');return {...r,items:r.items.filter(it=>it[ts]!=='600090.SH')};
  };
  const {tables,db,deps}=await setup(listed);
  await runResolveMemberships(deps,{});
  const before=(await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).filter(m=>m.code==='801126.SI');
  expect(before.map(m=>[m.status,m.valid_to])).toEqual([['ok','2017-06-29']]);
  // run 2 — synthetic edit of a real response: the delisting now known, dated before that out_date
  const earlyDelist:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===dl?'20161231':v):it)};
  };
  const r=await runResolveMemberships({...deps,tushare:earlyDelist},{});
  expect(r.records).toMatchObject({delistCorrected:1,delistConflicts:0});
  const all=await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'});
  const ok=all.filter(m=>m.status==='ok'),old=all.filter(m=>m.status==='superseded');
  expect(ok.length).toBe(3);expect(ok.every(m=>m.valid_to==='2016-12-31'&&m.valid_to_available_date==='2016-12-31')).toBe(true);
  expect(old.length).toBe(3);expect(old.every(m=>ok.some(o=>o.membership_id===m.superseded_by&&o.level===m.level&&o.source_membership_id===m.source_membership_id))).toBe(true);
  // the intervening period end 2017-03-31 no longer counts 600090.SH; 2016-06-30 still does
  const memberAt=async(on:string)=>(await db.membershipsOfIssuer(ISSUER['600090.SH'],{on})).some(m=>m.status==='ok');
  expect(await memberAt('2017-03-31')).toBe(false);
  expect(await memberAt('2016-06-30')).toBe(true);
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='membership_delist_conflict')).toEqual([]);
  // run 3 — idempotent
  expect((await runResolveMemberships({...deps,tushare:earlyDelist},{})).records).toMatchObject({delistCorrected:0,delistConflicts:0});
 });
 for(const [label,delistDate] of [['before','19970101'],['exactly on','19970616']] as const)
 it(`a delisting learned later ${label} an applied window's valid_from quarantines its ok rows; aggregation excludes them (Codex round 3 R3-1)`,async()=>{
  // run 1 — synthetic edit of a real response: 600090.SH not yet delisted → resolved, window [1997-06-16, 2017-06-29)
  const listed:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code');return {...r,items:r.items.filter(it=>it[ts]!=='600090.SH')};
  };
  const {tables,db,deps}=await setup(listed);
  await runResolveMemberships(deps,{});
  const q={scheme:'sw2021' as const,version:'2021' as const,code:'801120.SI',level:1,on:'2010-06-30',knownBy:'2026-11-06'};
  expect((await membersAt(db,q)).some(m=>m.issuer_id===ISSUER['600090.SH'])).toBe(true);
  // run 2 — synthetic edit of a real response: the delisting dated on/before in_date 1997-06-16
  const edited:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===dl?delistDate:v):it)};
  };
  const r=await runResolveMemberships({...deps,tushare:edited},{});
  expect(r.records).toMatchObject({afterDelist:1,delistCorrected:0,delistConflicts:0,failed:0});
  const all=await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'});
  expect(all.map(m=>m.status)).toEqual(['quarantined','quarantined','quarantined']);
  expect((await membersAt(db,q)).some(m=>m.issuer_id===ISSUER['600090.SH'])).toBe(false);   // excluded from aggregation
  expect(tables.rows('dq_quarantine').filter(x=>x.reason_code==='membership_after_delist').map(x=>x.natural_key)).toEqual(['sw2021:2021:600090.SH:1997-06-16']);
  // run 3 — nothing left to act on
  expect((await runResolveMemberships({...deps,tushare:edited},{})).records).toMatchObject({afterDelist:0,delistCorrected:0,delistConflicts:0});
 });
 it('in_date on or after the delisting date: not applied, quarantined membership_after_delist, resolution_error recorded',async()=>{
  // synthetic edit of a real response: 600090.SH's delist_date moved before its in_date (upstream has 6 such rows, K3)
  const edited:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===dl?'19970101':v):it)};
  };
  const {tables,db,deps}=await setup(edited);
  const r=await runResolveMemberships(deps,{});
  expect(r.records).toEqual({applied:11,unresolved:217,failed:0,afterDelist:1,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0});
  expect(await db.membershipsOfIssuer(ISSUER['600090.SH'],{})).toEqual([]);
  expect(tables.rows('dq_quarantine').map(q=>[q.reason_code,q.natural_key])).toEqual([['membership_after_delist','sw2021:2021:600090.SH:1997-06-16']]);
  expect((await db.currentSourceMemberships({unresolvedOnly:true})).find(s=>s.ts_code==='600090.SH')!.resolution_error).toMatchObject({code:'membership_after_delist'});
 });
 it('a rejected replacement quarantines the already-resolved predecessor rows atomically (Codex batch 3 P1): not members, no double count',async()=>{
  // run 1 — earlier upstream state (600090.SH exit 2017-06-20) is resolved; run 2 — the corrected record arrives but the delisting predates its in_date
  const earlier:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='index_member_all')return r;
   const ts=r.fields.indexOf('ts_code'),out=r.fields.indexOf('out_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===out?'20170620':v):it)};
  };
  const {tables,db,deps}=await setup(earlier);
  await runResolveMemberships(deps,{});
  expect((await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'})).filter(m=>m.status==='ok')).toHaveLength(3);
  await runMembershipsSw({...deps,tushare:fixtureTushareCall()},{apply:true,sleep:noSleep});
  const early:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='600090.SH'?it.map((v,i)=>i===dl?'19970101':v):it)};
  };
  const r=await runResolveMemberships({...deps,tushare:early},{});
  expect(r.records).toMatchObject({afterDelist:1,predecessorQuarantined:3,applied:0});
  expect(r.counts.quarantined).toBe(1);                         // the rejected replacement; the three predecessor rows are not source-record outcomes
  const mine=await db.membershipsOfIssuer(ISSUER['600090.SH'],{scheme:'sw2021'});
  expect(mine.filter(m=>m.status==='ok')).toEqual([]);
  expect(mine.filter(m=>m.status==='quarantined')).toHaveLength(3);
  expect(await membersAt(db,{scheme:'sw2021',version:'2021',code:'801120.SI',level:1,on:'2010-01-01',knownBy:TODAY}).then(m=>m.filter(x=>x.issuer_id===ISSUER['600090.SH']))).toEqual([]);
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='membership_predecessor_quarantined')).toHaveLength(3);
  expect(r.errors.filter(e=>e.code==='membership_predecessor_quarantined')).toHaveLength(3);
  expect(r.status).toBe('partial');
  // idempotent: the retry of the still-rejected replacement quarantines nothing more
  expect((await runResolveMemberships({...deps,tushare:early},{})).records.predecessorQuarantined).toBe(0);
 });
 it('a D row without a usable delist_date blocks that ts_code (delist_date_missing, non-info error), it does not mean "no delisting"',async()=>{
  const nullDate:TushareCall=async(api,params,fields)=>{
   const r=await fixtureTushareCall()(api,params,fields);if(api!=='stock_basic')return r;
   const ts=r.fields.indexOf('ts_code'),dl=r.fields.indexOf('delist_date');
   return {...r,items:r.items.map(it=>it[ts]==='002770.SZ'?it.map((v,i)=>i===dl?null:v):it)};
  };
  const {tables,db,deps}=await setup(nullDate);
  const r=await runResolveMemberships(deps,{});
  expect(r.status).toBe('partial');
  expect(r.records).toMatchObject({delistMissing:1,applied:11});
  expect(r.errors.map(e=>e.code)).toContain('delist_date_missing');
  expect(await db.membershipsOfIssuer(ISSUER['002770.SZ'],{})).toEqual([]);
  expect((await db.currentSourceMemberships({unresolvedOnly:true})).find(s=>s.ts_code==='002770.SZ')!.resolution_error).toMatchObject({code:'delist_date_missing'});
  expect(tables.rows('dq_quarantine').filter(q=>q.reason_code==='delist_date_missing').map(q=>q.natural_key)).toEqual(['sw2021:2021:002770.SZ:2015-01-19']);
  expect((await db.delistings()).some(d=>d.ts_code==='002770.SZ')).toBe(false);
 });
 it('an unexpected resolver exception is a failure (resolve_error with detail, counts.failed, non-info error, freshness not fresh); the batch is finished',async()=>{
  const {tables,db,deps}=await setup();
  const broken=new Proxy(tables,{get:(t,p)=>p==='select'?async(table:string,...a:unknown[])=>{if(table==='issuer_securities')throw new Error('securities_down');return (t.select as (...x:unknown[])=>Promise<unknown>)(table,...a);}:(t as unknown as Record<string|symbol,unknown>)[p]}) as typeof tables;
  const r=await runResolveMemberships({...deps,tables:broken},{});
  expect(r.counts.failed).toBeGreaterThan(0);expect(r.exitCode).toBe(1);
  expect(r.errors.some(e=>e.code==='resolve_error'&&e.message==='securities_down')).toBe(true);
  expect((await db.currentSourceMemberships({unresolvedOnly:true})).find(s=>s.ts_code==='600519.SH')!.resolution_error).toMatchObject({code:'resolve_error',detail:'securities_down'});
  expect(tables.rows('ingest_batches').at(-1)!.status).not.toBe('running');
  expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sw2021.memberships')).toMatchObject({consecutive_errors:1});
 });
 it('an exception in the body (database read) finishes the batch failed and records a failed attempt',async()=>{
  const {tables,db,deps}=await setup();
  const failing:IndustryDb=new Proxy(db,{get:(t,p)=>p==='delistings'?async()=>{throw new Error('db_down');}:(t as unknown as Record<string|symbol,unknown>)[p]});
  const r=await runResolveMemberships({...deps,db:failing},{});
  expect(r.status).toBe('failed');expect(r.exitCode).toBe(1);expect(r.errors.map(e=>e.message)).toContain('db_down');
  expect(tables.rows('ingest_batches').at(-1)!.status).toBe('failed');
  expect(tables.rows('dq_freshness').find(f=>f.dataset==='industry.sw2021.memberships')).toMatchObject({consecutive_errors:1});
 });
 it('an apply failure rolls the issuer back: records stay unresolved with resolution_error, the issuer is quarantined, the batch is partial',async()=>{
  const inner=memoryIndustryDb();
  const failing:IndustryDb=new Proxy(inner,{get:(t,p)=>p==='applyMemberships'?async(...a:Parameters<IndustryDb['applyMemberships']>)=>{if(a[1]===ISSUER['600519.SH'])throw new IndustryDbError('membership_overlap','23P01');return t.applyMemberships(...a);}:(t as unknown as Record<string|symbol,unknown>)[p]});
  const {tables,db,deps}=await setup(fixtureTushareCall(),failing);
  const r=await runResolveMemberships(deps,{});
  expect(r.status).toBe('partial');
  expect(r.records).toEqual({applied:11,unresolved:217,failed:1,afterDelist:0,delistClosed:0,delistCorrected:0,delistConflicts:0,delistMissing:0,predecessorQuarantined:0});
  expect(r.counts.quarantined).toBe(1);
  expect(await db.membershipsOfIssuer(ISSUER['600519.SH'],{})).toEqual([]);
  const rec=(await db.currentSourceMemberships({unresolvedOnly:true})).find(s=>s.ts_code==='600519.SH')!;
  expect(rec.resolution_error).toMatchObject({code:'membership_overlap',at:NOW});
  expect(tables.rows('dq_quarantine').map(q=>[q.dataset,q.table_name,q.natural_key,q.reason_code])).toEqual([['industry.sw2021.memberships','issuer_industry_memberships',`sw2021:2021:${ISSUER['600519.SH']}`,'membership_overlap']]);
  expect(JSON.parse(String(r.errors[0].message))).toEqual({no_issuer:217,apply_failed:1});
 });
});
