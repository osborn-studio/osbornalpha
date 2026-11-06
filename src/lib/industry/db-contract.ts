// src/lib/industry/db-contract.ts
// Shared IndustryDb contract (spec §4.4–§4.9, §5.4, §6.1): the same scenarios run against
// memoryIndustryDb (db.test.ts) and pgIndustryDb (functions.integration.test.ts), so the in-memory
// rules later tasks rely on are exactly the SQL functions' rules. Not a test file: it registers
// describe/it only when called. Isolation on the shared test database: classification nodes,
// memberships and runs use a private version per scenario (harness.version(), which also registers
// an internal licence key 'scheme:sw2021:<version>'); source records use random ts_code and l1_code;
// marks use harness tickers. The four real licence rows are only read, never changed.
import {randomBytes,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {TableClient} from '../db/table-client';
import {recordAttempt} from '../dq/freshness';
import {IndustryDbError} from './types';
import type {
 AggMetric,ClassificationRow,DatasetKey,IndustryDb,LicenseStatus,MarkInput,MembershipTarget,NewMetricRun,OfficialInput,SchemeVersion,SourceMembershipInput,StagedMetricCell,
} from './types';

export interface IndustryContractHarness{
 db:IndustryDb;tables:TableClient;
 issuer():Promise<string>;batch():Promise<string>;
 /** A stocks_universe ticker no other test uses. */
 ticker():Promise<string>;
 /** A fresh private classification version; its licence key 'scheme:sw2021:<version>' exists and is internal. */
 version():Promise<string>;
 /** fact_sync_scope row (issuer, 'CN') with the given state_rev. */
 factScope(issuer:string,stateRev:number):Promise<void>;
 /** Makes the manifest index row `seconds` older (GC grace window). */
 ageManifest(hash:string,seconds:number):Promise<void>;
 close?():Promise<void>;
}

const hex=(n:number)=>randomBytes(n).toString('hex');
/** IndustryDbError code of a rejection, 'resolved' when it did not reject. */
export const code=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof IndustryDbError?e.code:`not_industry_db_error:${String(e)}`);
export const sha=()=>hex(32);
/** Six sw2021 nodes of a private version: A1 > A11 > A111 and B1 > B11 > B111. */
export function nodes(version:string):ClassificationRow[]{
 const v=version as SchemeVersion;
 const n=(c:string,level:number,parent:string|null):ClassificationRow=>({scheme:'sw2021',version:v,code:c,level,name_zh:`行业${c}`,name_en:null,parent_code:parent,attributes:{src:'SW2021'}});
 return [n('A1',1,null),n('A11',2,'A1'),n('A111',3,'A11'),n('B1',1,null),n('B11',2,'B1'),n('B111',3,'B11')];
}
export function sourceInput(o:Partial<SourceMembershipInput>={}):SourceMembershipInput{
 return {source:'tushare:index_member_all',ts_code:`Z${hex(3)}.SZ`,name:'测试公司',l1_code:`ZT${hex(3)}`,l2_code:'ZT2',l3_code:'ZT3',in_date:'2021-07-30',out_date:null,observed_at:'2026-11-06T00:00:00.000Z',raw_hash:sha(),locator:{page:1,row:0},...o};
}
/** One target row in the shape resolve-memberships.ts produces (§4.4 three rows per record). */
export function target(c:string,level:number,o:Partial<MembershipTarget>={}):MembershipTarget{
 return {code:c,level,valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,source:'tushare:index_member_all',provenance:{availability:'effective_date_assumed'},...o};
}
export const threeRows=(sourceId:string,o:Partial<MembershipTarget>={},codes:[string,string,string]=['A1','A11','A111'])=>
 codes.map((c,i)=>target(c,i+1,{...o,provenance:{availability:'effective_date_assumed',source_membership_id:sourceId}}));
export function newRun(version:string,batch:string,o:Partial<NewMetricRun>={}):NewMetricRun{
 return {scheme:'sw2021',version:version as SchemeVersion,level:1,facts_as_of:'2025-03-31',knowledge_date:'2025-03-31',history_class:'reconstruction',method_version:'industry-agg/1.0',
  config_hash:'c'.repeat(64),formula_version:'derive/1',code_version:'test',expected_grid:{codes:['A1'],period_ends:['2024-06-30','2024-12-31'],metrics:['member_count','gross_margin']},
  fingerprint_at:'2026-11-06T00:00:00.000Z',reused_from_run:null,batch_id:batch,...o};
}
export function cell(o:Partial<StagedMetricCell>&{metric:AggMetric;period_end:string}):StagedMetricCell{
 const instant=o.metric==='member_count';
 return {code:'A1',period_start:instant?o.period_end:`${o.period_end.slice(0,4)}-01-01`,duration:instant?'INSTANT':'12M',status:'missing',missing_reason:'empty_set',value:null,
  unit:instant?'count':'ratio',n_members:2,n_with_data:0,n_unresolved:0,manifest_hash:null,...o};
}
export const mark=(ticker:string,close:string,o:Partial<MarkInput>={}):MarkInput=>({ticker,trade_date:'2001-01-05',close,total_share:'1000',source:'tushare:daily_basic',upstream:'szse',raw_hash:sha(),locator:{page:1},...o});

export function industryDbContract(label:string,setup:()=>Promise<IndustryContractHarness>):void{
 describe(label,()=>{
  let h:IndustryContractHarness;let db:IndustryDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  /** A private version with the six nodes loaded. */
  const tree=async()=>{const v=await h.version();expect((await db.upsertClassifications(await h.batch(),nodes(v))).inserted).toBe(6);return v as SchemeVersion;};
  /** One current source record, resolved by applying its three rows to a fresh issuer. */
  const applied=async(v:SchemeVersion,o:Partial<SourceMembershipInput>={})=>{
   const b=await h.batch();const iss=await h.issuer();const src=sourceInput(o);
   await db.upsertSourceMemberships(b,[src]);
   const [rec]=await db.currentSourceMemberships({l1Code:src.l1_code});
   const res=await db.applyMemberships(b,iss,'sw2021',v,threeRows(rec.id,{valid_to:src.out_date,valid_to_available_date:src.out_date}),[rec.id],{method:'today',resolved_at:'2026-11-06'});
   return {b,iss,src,rec,res};
  };

  it('licences: the SIC dataset is public by migration; a private key toggles; unknown keys and statuses are refused',async()=>{
   expect(await db.isDatasetPublic('scheme:sic:sec-current')).toBe(true);
   const v=await h.version();const key=`scheme:sw2021:${v}` as DatasetKey;
   expect(await db.isDatasetPublic(key)).toBe(false);
   await db.setDatasetLicense(key,'public','contract',null);expect(await db.isDatasetPublic(key)).toBe(true);
   await db.setDatasetLicense(key,'internal','contract','back');expect(await db.isDatasetPublic(key)).toBe(false);
   expect(await code(db.setDatasetLicense(`scheme:nope:${hex(3)}` as DatasetKey,'public','contract',null))).toBe('unknown');
   expect(await code(db.setDatasetLicense(key,'open' as LicenseStatus,'contract',null))).toBe('unknown');
   expect(await code(db.setDatasetLicense(key,'public','',null))).toBe('unknown');
   expect(await db.isDatasetPublic(key)).toBe(false);
  });

  it('classifications: insert-only nodes (parents first), unchanged on replay, renames come back as conflicts and are not written; sic scheme and attributes round-trip',async()=>{
   const v=await h.version();const b=await h.batch();
   const rows=nodes(v);
   expect(await db.upsertClassifications(b,[...rows].reverse())).toEqual({inserted:6,unchanged:0,conflicts:[]});
   expect(await db.upsertClassifications(b,rows.map(r=>({...r,attributes:{...r.attributes}})))).toEqual({inserted:0,unchanged:6,conflicts:[]});
   const renamed={...rows[0],name_zh:'改名'};
   expect(await db.upsertClassifications(b,[renamed])).toEqual({inserted:0,unchanged:0,conflicts:[renamed]});
   const t=await db.classificationTree('sw2021',v as SchemeVersion);
   expect(t.map(r=>[r.code,r.level,r.parent_code])).toEqual([['A1',1,null],['B1',1,null],['A11',2,'A1'],['B11',2,'B1'],['A111',3,'A11'],['B111',3,'B11']]);
   expect(t[0]).toEqual(rows[0]);
   const sic:ClassificationRow={scheme:'sic',version:v as SchemeVersion,code:'0100',level:1,name_zh:null,name_en:'Agricultural Production-Crops',parent_code:null,attributes:{office:'Office of Trade & Services',b:{x:1,a:2}}};
   expect((await db.upsertClassifications(b,[sic])).inserted).toBe(1);
   expect(await db.upsertClassifications(b,[{...sic,attributes:{b:{a:2,x:1},office:'Office of Trade & Services'}}])).toEqual({inserted:0,unchanged:1,conflicts:[]});
   expect(await db.classificationTree('sic',v as SchemeVersion)).toEqual([sic]);
  });

  it('source records: same key + same content is a duplicate; out_date null→date and other changes supersede with a new current record; errors are recorded on unresolved records',async()=>{
   const b=await h.batch();const a=sourceInput();const other=sourceInput({l1_code:a.l1_code});
   expect(await db.upsertSourceMemberships(b,[a,other])).toEqual({inserted:2,superseded:0,duplicates:0,changed:[]});
   expect(await db.upsertSourceMemberships(b,[{...a,raw_hash:sha(),observed_at:'2026-11-07T00:00:00.000Z'}])).toEqual({inserted:0,superseded:0,duplicates:1,changed:[]});
   const before=(await db.currentSourceMemberships({l1Code:a.l1_code})).find(r=>r.ts_code===a.ts_code)!;
   expect(before).toMatchObject({scheme:'sw2021',version:'2021',status:'current',issuer_id:null,superseded_by:null,resolution:{},resolution_error:null,in_date:'2021-07-30',out_date:null,observed_at:'2026-11-06T00:00:00.000Z',batch_id:b});
   const closed=await db.upsertSourceMemberships(b,[{...a,out_date:'2023-01-01'}]);
   expect(closed).toMatchObject({inserted:0,superseded:1,duplicates:0});
   expect(closed.changed).toEqual([{old_id:before.id,new_id:expect.any(String),nullToDate:true}]);
   const renamed=await db.upsertSourceMemberships(b,[{...a,out_date:'2023-01-01',name:'新名'}]);
   expect(renamed.changed).toEqual([{old_id:closed.changed[0].new_id,new_id:expect.any(String),nullToDate:false}]);
   const cur=await db.currentSourceMemberships({l1Code:a.l1_code});
   expect(cur.map(r=>[r.ts_code,r.name,r.out_date]).sort()).toEqual([[a.ts_code,'新名','2023-01-01'],[other.ts_code,'测试公司',null]].sort());
   expect(cur.every(r=>r.status==='current'&&r.issuer_id===null)).toBe(true);
   expect(await db.recordResolutionError([renamed.changed[0].new_id,before.id],{code:'no_issuer',at:'2026-11-06T00:00:00.000Z'})).toBe(1);   // the superseded record is not touched
   expect((await db.currentSourceMemberships({l1Code:a.l1_code,unresolvedOnly:true})).find(r=>r.ts_code===a.ts_code)!.resolution_error).toEqual({code:'no_issuer',at:'2026-11-06T00:00:00.000Z'});
   expect(await code(db.recordResolutionError([before.id],{} as never))).toBe('unknown');
  });

  it('n_unresolved: current unresolved records of the code on `on`, known by knownBy, counted by distinct ts_code at levels 1–3',async()=>{
   const b=await h.batch();const l1=`ZU${hex(3)}`;const ts1=`Z${hex(3)}.SH`;
   const r1=sourceInput({l1_code:l1,ts_code:ts1,l3_code:'U31'});const r1b=sourceInput({l1_code:l1,ts_code:ts1,l3_code:'U32',in_date:'2021-08-02'});
   const r2=sourceInput({l1_code:l1,in_date:'2023-01-01'});const r3=sourceInput({l1_code:l1,out_date:'2022-06-30'});
   await db.upsertSourceMemberships(b,[r1,r1b,r2,r3]);
   const q=(on:string,knownBy:string,level=1,c=l1)=>db.unresolvedCount({code:c,level,on,knownBy});
   expect(await q('2022-12-31','2022-12-31')).toBe(1);      // r1/r1b one ts_code; r2 not yet in; r3 already out
   expect(await q('2022-01-01','2026-01-01')).toBe(2);
   expect(await q('2024-01-01','2022-12-31')).toBe(1);      // r2 entered after knownBy
   expect(await q('2022-06-30','2026-01-01')).toBe(2);      // out_date is the last member day, inclusive (spec 7th draft K3): r3 still counts on 2022-06-30
   expect(await q('2022-07-01','2026-01-01')).toBe(1);
   expect(await q('2021-07-29','2026-01-01')).toBe(0);
   expect(await q('2022-01-01','2026-01-01',3,'U31')).toBe(1);
   expect((await db.unresolvedOf({code:l1,level:1,on:'2022-01-01',knownBy:'2026-01-01'})).map(u=>`${u.ts_code}|${u.in_date}|${u.out_date}`).sort())
    .toEqual([`${ts1}|2021-07-30|null`,`${ts1}|2021-08-02|null`,`${r3.ts_code}|2021-07-30|2022-06-30`].sort());
   expect(await code(db.unresolvedCount({code:l1,level:4,on:'2022-01-01',knownBy:'2022-01-01'}))).toBe('unknown');
  });

  it('applyMemberships: three rows and the resolution in one call; a replay is all duplicates; an out_date correction supersedes the old rows and keeps them as history',async()=>{
   const v=await tree();
   const {b,iss,src,rec,res}=await applied(v);
   expect(res).toMatchObject({inserted:3,closed:0,superseded:0,duplicates:0});expect(res.membership_ids).toHaveLength(3);
   const r1=(await db.currentSourceMemberships({l1Code:src.l1_code}))[0];
   expect(r1).toMatchObject({id:rec.id,issuer_id:iss,resolution:{method:'today',resolved_at:'2026-11-06',membership_ids:res.membership_ids},resolution_error:null});
   const rows=await db.membershipsOfIssuer(iss,{scheme:'sw2021'});
   expect(rows.map(m=>[m.code,m.level,m.status,m.valid_from,m.valid_to,m.available_date,m.source_membership_id,m.batch_id])).toEqual([
    ['A1',1,'ok','2021-07-30',null,'2021-07-30',rec.id,b],['A11',2,'ok','2021-07-30',null,'2021-07-30',rec.id,b],['A111',3,'ok','2021-07-30',null,'2021-07-30',rec.id,b]]);
   expect(rows[0].provenance).toEqual({availability:'effective_date_assumed',source_membership_id:rec.id});
   expect(await db.applyMemberships(b,iss,'sw2021',v,threeRows(rec.id),[rec.id],{method:'today'})).toMatchObject({inserted:0,duplicates:3,superseded:0,closed:0,membership_ids:res.membership_ids});
   // out_date correction: new current record, old record superseded; applying it supersedes the three old rows
   const up=await db.upsertSourceMemberships(b,[{...src,out_date:'2024-01-02'}]);
   const newId=up.changed[0].new_id;
   const corr=await db.applyMemberships(b,iss,'sw2021',v,threeRows(newId,{valid_to:'2024-01-02',valid_to_available_date:'2024-01-02'}),[newId],{method:'today'});
   expect(corr).toMatchObject({inserted:3,superseded:3,closed:0,duplicates:0});
   const all=await db.membershipsOfIssuer(iss,{});
   const ok=all.filter(m=>m.status==='ok');const old=all.filter(m=>m.status==='superseded');
   expect(ok.map(m=>[m.code,m.valid_to,m.valid_to_available_date,m.source_membership_id])).toEqual([['A1','2024-01-02','2024-01-02',newId],['A11','2024-01-02','2024-01-02',newId],['A111','2024-01-02','2024-01-02',newId]]);
   expect(old.map(m=>[m.code,m.superseded_by])).toEqual(ok.map(m=>[m.code,m.membership_id]));
   expect(await db.membershipsOfIssuer(iss,{on:'2023-06-30'})).toHaveLength(6);    // every version whose window covers the date, any status
   expect((await db.membershipsOfIssuer(iss,{on:'2024-01-02'})).filter(m=>m.status==='ok')).toHaveLength(0);
   expect((await db.membershipCandidates({scheme:'sw2021',version:v,code:'A1',level:1,on:'2025-01-01'})).map(m=>`${m.issuer_id}|${m.status}`).sort()).toEqual([`${iss}|ok`,`${iss}|superseded`]);
   expect(await db.membershipCandidates({scheme:'sw2021',version:v,code:'A1',level:1,on:'2021-07-29'})).toEqual([]);
  });

  it('applyMemberships: two disjoint windows of one issuer corrected in ONE call — each old row points at the new row of its own source lineage (Codex round 1 #5)',async()=>{
   const v=await tree();const b=await h.batch();const iss=await h.issuer();
   const l1=`ZT${hex(3)}`,ts=`Z${hex(3)}.SZ`;
   const w1=sourceInput({l1_code:l1,ts_code:ts,in_date:'2019-01-01',out_date:'2019-12-31'}),w2=sourceInput({l1_code:l1,ts_code:ts,in_date:'2022-01-01',out_date:'2022-12-31'});
   await db.upsertSourceMemberships(b,[w1,w2]);
   const cur=await db.currentSourceMemberships({l1Code:l1});
   const id=(d:string)=>cur.find(r=>r.in_date===d)!.id;
   const rows=(sid:string,from:string,to:string)=>threeRows(sid,{valid_from:from,available_date:from,valid_to:to,valid_to_available_date:to});
   await db.applyMemberships(b,iss,'sw2021',v,[...rows(id('2019-01-01'),'2019-01-01','2020-01-01'),...rows(id('2022-01-01'),'2022-01-01','2023-01-01')],[id('2019-01-01'),id('2022-01-01')],{method:'today'});
   const up=await db.upsertSourceMemberships(b,[{...w1,out_date:'2019-11-30'},{...w2,out_date:'2022-11-30'}]);
   expect(up.changed).toHaveLength(2);
   const heirOf=new Map(up.changed.map(c=>[c.old_id,c.new_id]));
   const n1=heirOf.get(id('2019-01-01'))!,n2=heirOf.get(id('2022-01-01'))!;
   // the LATER window first: level-only matching would chain both old L1 rows to the 2022 row
   const res=await db.applyMemberships(b,iss,'sw2021',v,[...rows(n2,'2022-01-01','2022-12-01'),...rows(n1,'2019-01-01','2019-12-01')],[n2,n1],{method:'today'});
   expect(res).toMatchObject({inserted:6,superseded:6});
   const all=await db.membershipsOfIssuer(iss,{scheme:'sw2021'});
   const byId=new Map(all.map(m=>[m.membership_id,m]));
   const oldRows=all.filter(m=>m.status==='superseded');
   expect(oldRows).toHaveLength(6);
   for(const o of oldRows){
    const nxt=byId.get(o.superseded_by!)!;
    expect([nxt.status,nxt.level,nxt.valid_from,nxt.source_membership_id]).toEqual(['ok',o.level,o.valid_from,heirOf.get(o.source_membership_id!)]);
   }
  });

  it('correctMembershipWindows: an already-closed window is superseded by a corrected version of the same record (Codex round 2 R2-2)',async()=>{
   const v=await tree();
   const {b,iss,rec}=await applied(v,{out_date:'2024-01-02'});
   const before=(await db.membershipsOfIssuer(iss,{scheme:'sw2021'})).filter(m=>m.status==='ok');
   expect(before.map(m=>m.valid_to)).toEqual(['2024-01-02','2024-01-02','2024-01-02']);
   const fix=threeRows(rec.id,{valid_to:'2023-06-30',valid_to_available_date:'2023-06-30'});
   expect(await db.correctMembershipWindows(b,iss,'sw2021',v,rec.id,fix)).toMatchObject({inserted:3,superseded:3,duplicates:0,closed:0});
   const all=await db.membershipsOfIssuer(iss,{scheme:'sw2021'});
   const ok=all.filter(m=>m.status==='ok'),old=all.filter(m=>m.status==='superseded');
   expect(ok.map(m=>[m.level,m.valid_from,m.valid_to,m.valid_to_available_date,m.source_membership_id])).toEqual([[1,'2021-07-30','2023-06-30','2023-06-30',rec.id],[2,'2021-07-30','2023-06-30','2023-06-30',rec.id],[3,'2021-07-30','2023-06-30','2023-06-30',rec.id]]);
   expect(old.map(m=>[m.membership_id,m.superseded_by])).toEqual(before.map(m=>[m.membership_id,ok.find(o=>o.level===m.level)!.membership_id]));
   expect((await db.membershipsOfIssuer(iss,{on:'2023-09-30'})).filter(m=>m.status==='ok')).toEqual([]);   // excluded between the corrected and the old end
   expect(await db.correctMembershipWindows(b,iss,'sw2021',v,rec.id,fix)).toMatchObject({inserted:0,superseded:0,duplicates:3});
   expect(await code(db.correctMembershipWindows(b,await h.issuer(),'sw2021',v,rec.id,fix))).toBe('membership_conflict');   // not this issuer's record
   // an empty corrected window (delisted on the window start; R3-1) quarantines the ok rows, no successor
   const gone=threeRows(rec.id,{valid_to:'2021-07-30',valid_to_available_date:'2021-07-30'});
   expect(await db.correctMembershipWindows(b,iss,'sw2021',v,rec.id,gone)).toMatchObject({inserted:0,superseded:0,quarantined:3});
   const q3=(await db.membershipsOfIssuer(iss,{scheme:'sw2021'})).filter(m=>m.status==='quarantined');
   expect(q3.map(m=>[m.level,m.valid_to,(m.provenance as Record<string,unknown>).quarantine])).toEqual([1,2,3].map(l=>[l,'2023-06-30',{reason:'membership_after_delist',valid_to:'2021-07-30',batch_id:b}]));
   expect((await db.membershipsOfIssuer(iss,{scheme:'sw2021'})).filter(m=>m.status==='ok')).toEqual([]);
   expect(await code(db.correctMembershipWindows(b,iss,'sw2021',v,rec.id,[target('A1',1,{valid_from:'2020-01-01',provenance:{availability:'effective_date_assumed',source_membership_id:rec.id}})]))).toBe('membership_conflict');
  });

  it('applyMemberships is all-or-nothing: a conflicting third row or an overlap leaves no row, the old rows ok and the record unresolved',async()=>{
   const v=await tree();
   const {b,iss}=await applied(v);                                  // A1/A11/A111 from 2021-07-30, open
   const src=sourceInput();await db.upsertSourceMemberships(b,[src]);
   const [rec]=await db.currentSourceMemberships({l1Code:src.l1_code});
   const before=(await db.membershipsOfIssuer(iss,{})).length;
   const rows=[target('B1',1,{valid_from:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2020-01-01'}),target('B11',2,{valid_from:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2020-01-01'}),
    target('A111',3,{available_date:'2021-08-01'})];                // same key as the stored A111, other available_date, no supersession
   expect(await code(db.applyMemberships(b,iss,'sw2021',v,rows,[rec.id],{method:'today'}))).toBe('membership_conflict');
   expect((await db.membershipsOfIssuer(iss,{})).length).toBe(before);
   expect((await db.currentSourceMemberships({l1Code:src.l1_code}))[0].issuer_id).toBeNull();
   expect(await code(db.applyMemberships(b,iss,'sw2021',v,[target('B1',1,{valid_from:'2022-01-01'})],[rec.id],{method:'today'}))).toBe('membership_overlap');
   expect((await db.membershipsOfIssuer(iss,{})).length).toBe(before);
   expect((await db.currentSourceMemberships({l1Code:src.l1_code}))[0].issuer_id).toBeNull();
   const other=await h.issuer();
   expect(await code(db.applyMemberships(b,other,'sw2021',v,[target('A1',1)],[randomUUID()],{}))).toBe('membership_conflict');   // unknown source record
   expect(await code(db.applyMemberships(b,other,'sw2021',v,[target('A1',2)],[],{}))).toBe('unknown');                       // level is not the node's level
   expect(await db.applyMemberships(b,other,'sw2021',v,[target('B1',1,{valid_from:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2020-01-01'}),target('A1',1,{valid_from:'2020-01-01'})],[],{}))
    .toMatchObject({inserted:2});                                   // adjacent windows at one level are not an overlap
  });

  it('applyMemberships closes an open row whose key matches a dated target',async()=>{
   const v=await tree();
   const {b,iss}=await applied(v);
   const r=await db.applyMemberships(b,iss,'sw2021',v,[target('A1',1,{valid_to:'2022-02-01',valid_to_available_date:'2022-03-01'})],[],{});
   expect(r).toMatchObject({inserted:0,closed:1,superseded:0,duplicates:0});
   expect((await db.membershipsOfIssuer(iss,{})).find(m=>m.code==='A1')).toMatchObject({status:'ok',valid_to:'2022-02-01',valid_to_available_date:'2022-03-01'});
  });

  it('SIC: insert, duplicate on the same code, close-and-open on a new code, same_day_change when it changes again the same day',async()=>{
   const v=await h.version();const b=await h.batch();const iss=await h.issuer();
   // applySicMembership writes the real 'sec-current' version: codes ZT…/ZU… exist only in this scenario
   const c1=`ZT${hex(2)}`,c2=`ZU${hex(2)}`;
   await db.upsertClassifications(b,[c1,c2].map(c=>({scheme:'sic',version:'sec-current',code:c,level:1,name_zh:null,name_en:`SIC ${c} ${v}`,parent_code:null,attributes:{}})));
   // the caller holds the SIC scope lease of this issuer (Codex round 2 R2-3: the write itself is fenced)
   await h.tables.insert('industry_sync_scope',{issuer_id:iss,job:'sic',next_due_at:'2026-01-01T00:00:00.000Z',lease_until:'2999-01-01T00:00:00.000Z',lease_batch_id:b,
    last_attempt_at:null,last_success_at:null,last_status:null,updated_at:'2026-01-01T00:00:00.000Z'});
   const fence={leaseBatch:b};
   expect(await code(db.applySicMembership(b,iss,'2026-01-05',c1,{raw_hash:sha()},{leaseBatch:'00000000-0000-4000-8000-000000000000'}))).toBe('lease_lost');
   expect(await db.membershipsOfIssuer(iss,{scheme:'sic'})).toEqual([]);
   expect(await db.applySicMembership(b,iss,'2026-01-05',c1,{raw_hash:sha(),locator:{cik:'1'}},fence)).toBe('inserted');
   expect(await db.applySicMembership(b,iss,'2026-02-05',c1,{raw_hash:sha(),locator:{cik:'1'}},fence)).toBe('duplicate');
   expect(await db.applySicMembership(b,iss,'2026-03-05',c2,{raw_hash:sha(),locator:{cik:'1'}},fence)).toBe('changed');
   const rows=await db.membershipsOfIssuer(iss,{scheme:'sic'});
   expect(rows.map(m=>[m.code,m.valid_from,m.valid_to,m.valid_to_available_date,m.available_date,m.source,m.source_membership_id,m.provenance.availability])).toEqual([
    [c1,'2026-01-05','2026-03-05','2026-03-05','2026-01-05','sec:submissions',null,'observed'],[c2,'2026-03-05',null,null,'2026-03-05','sec:submissions',null,'observed']]);
   expect(await code(db.applySicMembership(b,iss,'2026-03-05',c1,{},fence))).toBe('same_day_change');
   expect(await code(db.applySicMembership(b,iss,'2026-04-05',`ZV${hex(3)}`,{},fence))).toBe('unknown');   // unknown_sic_code
   expect(await db.applySicMembership(b,iss,'2026-04-05',null,{},fence)).toBe('none');
  });

  it('marks: receipts make a retry of one fetch event a duplicate even after a later change (V7); A→B→A yields three observations; a changed retry payload is refused',async()=>{
   const b=await h.batch();const t=await h.ticker();
   const e1=await db.beginFetchEvent('marks',{trade_date:'2001-01-05'},b);
   expect(await db.applyObservations('marks',e1,[mark(t,'10.50')])).toEqual({inserted:1,duplicates:0,superseded:0});
   expect(await db.applyObservations('marks',e1,[mark(t,'10.50')])).toEqual({inserted:0,duplicates:1,superseded:0});    // retry of E1
   const e2=await db.beginFetchEvent('marks',{trade_date:'2001-01-05'},b);
   expect(await db.applyObservations('marks',e2,[mark(t,'10.5')])).toEqual({inserted:0,duplicates:1,superseded:0});     // unchanged A (numeric equality)
   const e3=await db.beginFetchEvent('marks',{trade_date:'2001-01-05'},b);
   expect(await db.applyObservations('marks',e3,[mark(t,'11')])).toEqual({inserted:0,duplicates:0,superseded:1});        // B
   await db.retryFetchEvent(e2);
   expect(await db.applyObservations('marks',e2,[mark(t,'10.50')])).toEqual({inserted:0,duplicates:1,superseded:0});    // retry E2: receipt wins, B stays
   expect((await db.currentMarksOn('2001-01-05',[t])).map(m=>[m.close,m.fetch_event_id])).toEqual([['11',e3]]);
   expect(await code(db.applyObservations('marks',e2,[mark(t,'12')]))).toBe('fetch_event_payload_changed');
   const e4=await db.beginFetchEvent('marks',{trade_date:'2001-01-05'},b);
   expect(await db.applyObservations('marks',e4,[mark(t,'10.50')])).toEqual({inserted:0,duplicates:0,superseded:1});   // back to A: a third observation
   const [cur]=await db.currentMarksOn('2001-01-05',[t]);
   expect(cur).toMatchObject({ticker:t,trade_date:'2001-01-05',close:'10.50',total_share:'1000',market_cap:'10500.00',status:'ok',fetch_event_id:e4,upstream:'szse',batch_id:b});
   expect(cur.supersedes).not.toBeNull();
   const items=await h.tables.select('dq_quarantine',{dataset:'industry.marks',natural_key:`${t}:2001-01-05`,reason_code:'mark_revised',status:'open'});
   expect(items).toHaveLength(1);                                    // one open item per key
   const q=await db.beginFetchEvent('marks',{trade_date:'2001-01-08'},b);
   expect(await db.applyObservations('marks',q,[mark(t,'5',{trade_date:'2001-01-08',status:'quarantined'})])).toEqual({inserted:1,duplicates:0,superseded:0});
   expect(await db.currentMarksOn('2001-01-08',[t])).toEqual([]);   // quarantined evidence never becomes current
   expect(await code(db.applyObservations('marks',randomUUID(),[mark(t,'1')]))).toBe('unknown');
  });

  it('marks: a call is atomic — a refused row rolls back the rows before it',async()=>{
   const b=await h.batch();const t1=await h.ticker();const t2=await h.ticker();
   const e=await db.beginFetchEvent('marks',{trade_date:'2001-01-09'},b);
   await db.applyObservations('marks',e,[mark(t2,'3',{trade_date:'2001-01-09'})]);
   expect(await code(db.applyObservations('marks',e,[mark(t1,'1',{trade_date:'2001-01-09'}),mark(t2,'4',{trade_date:'2001-01-09'})]))).toBe('fetch_event_payload_changed');
   expect(await db.currentMarksOn('2001-01-09',[t1,t2])).toHaveLength(1);
  });

  it('official observations follow the same receipt / compare / supersede rules',async()=>{
   const b=await h.batch();const v=await h.version();
   const off=(value:string):OfficialInput=>({scheme:'sw2021',version:v as '2021',code:'A1',trade_date:'2001-01-05',metric:'pe',value,source:'tushare:sw_daily',upstream:'swsresearch',raw_hash:sha(),locator:{}});
   const e1=await db.beginFetchEvent('official',{code:'A1'},b);
   expect(await db.applyObservations('official',e1,[off('12.30')])).toEqual({inserted:1,duplicates:0,superseded:0});
   const e2=await db.beginFetchEvent('official',{code:'A1'},b);
   expect(await db.applyObservations('official',e2,[off('12.3')])).toEqual({inserted:0,duplicates:1,superseded:0});
   expect(await db.applyObservations('official',e2,[off('12.3')])).toEqual({inserted:0,duplicates:1,superseded:0});
   const e3=await db.beginFetchEvent('official',{code:'A1'},b);
   expect(await db.applyObservations('official',e3,[off('13')])).toEqual({inserted:0,duplicates:0,superseded:1});
  });

  it('metric runs: generations, building-only staging, completeness, dependencies, one activation instant, obsolete and regressing runs refused, legal failures only',async()=>{
   const v=await tree();const b=await h.batch();const i1=await h.issuer();const i2=await h.issuer();
   const m=sha();expect(await db.registerManifest(m,'aggregate',123)).toBe(true);
   const r1=await db.createMetricRun(newRun(v,b));const r2=await db.createMetricRun(newRun(v,b,{facts_as_of:'2025-06-30',knowledge_date:'2025-06-30'}));
   expect([r1.generation,r2.generation]).toEqual([1,2]);
   expect(await db.metricRun(r1.runId)).toMatchObject({run_id:r1.runId,status:'building',generation:1,coverage_summary:{},activated_at:null,expected_grid:newRun(v,b).expected_grid,fingerprint_at:'2026-11-06T00:00:00.000Z'});
   await db.setMetricRunCoverage(r1.runId,{facts_scope_ready:true,share:'0.97'});
   const full=(pe:string,o:Partial<StagedMetricCell>={})=>cell({metric:'member_count',period_end:pe,status:'ok',missing_reason:null,value:'2',manifest_hash:m,n_with_data:2,...o});
   expect(await db.stageMetricRows(r1.runId,[full('2024-06-30')])).toBe(1);
   expect(await code(db.activateMetricRun(r1.runId))).toBe('incomplete_run');
   expect(await db.stageMetricRows(r1.runId,[full('2024-12-31'),cell({metric:'gross_margin',period_end:'2024-12-31'})])).toBe(2);   // gross_margin is not expected on 06-30
   expect(await code(db.stageMetricRows(r1.runId,[cell({metric:'roe',period_end:'2024-12-31',status:'ok',missing_reason:null,value:'0.1',manifest_hash:null})]))).toBe('unknown');   // ok needs a manifest
   expect(await code(db.activateMetricRun(r1.runId))).toBe('dependencies_incomplete');
   const deps=(rev:number)=>['2024-06-30','2024-12-31'].flatMap(pe=>[i1,i2].map(i=>({cell_key:`A1:${pe}`,issuer_id:i,state_rev:rev})));
   expect(await db.stageRunDependencies(r1.runId,'aggregate',deps(3))).toBe(4);
   const {activatedAt}=await db.activateMetricRun(r1.runId);
   expect(activatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
   const run1=(await db.activeMetricRun('sw2021',v,1))!;
   expect(run1).toMatchObject({run_id:r1.runId,status:'active',activated_at:activatedAt,coverage_summary:{facts_scope_ready:true,share:'0.97'}});
   const cells=await db.metricRowsOfRun(r1.runId);
   expect(cells.map(c=>[c.metric,c.period_end,c.status,c.value,c.updated_at])).toEqual([['gross_margin','2024-12-31','missing',null,activatedAt],['member_count','2024-06-30','ok','2',activatedAt],['member_count','2024-12-31','ok','2',activatedAt]]);
   expect(await db.metricRowsOfRun(r1.runId,{metrics:['member_count'],periodEnds:['2024-12-31']})).toHaveLength(1);
   expect(await db.runDependencies('aggregate',r1.runId)).toHaveLength(4);
   expect(await code(db.stageMetricRows(r1.runId,[]))).toBe('run_not_building');
   expect(await code(db.setMetricRunCoverage(r1.runId,{}))).toBe('run_not_building');
   expect(await code(db.failRun('aggregate',r1.runId,'x'))).toBe('illegal_transition');
   expect(await db.metricRunVisible(r1.runId)).toBe(false);                                     // licence internal
   await db.setDatasetLicense(`scheme:sw2021:${v}` as DatasetKey,'public','contract',null);
   expect(await db.metricRunVisible(r1.runId)).toBe(true);
   expect(await db.metricRunVisible(r2.runId)).toBe(false);                                     // building
   // r2 regresses one issuer of one cell → dependency_regression; restaged → activates and supersedes r1
   await db.stageMetricRows(r2.runId,[full('2024-06-30'),full('2024-12-31'),cell({metric:'gross_margin',period_end:'2024-12-31'})]);
   await db.stageRunDependencies(r2.runId,'aggregate',deps(4).map((d,i)=>i===3?{...d,state_rev:2}:d));
   expect(await code(db.activateMetricRun(r2.runId))).toBe('dependency_regression');
   await db.stageRunDependencies(r2.runId,'aggregate',[{cell_key:'A1:2024-12-31',issuer_id:i2,state_rev:3}]);
   await db.activateMetricRun(r2.runId);
   expect((await db.metricRun(r1.runId))!.status).toBe('superseded');
   expect((await db.activeMetricRun('sw2021',v,1))!.run_id).toBe(r2.runId);
   // late workers: a lower generation than the active run, or a newer generation with older facts, cannot activate
   const later={facts_as_of:'2025-06-30',knowledge_date:'2025-06-30'};
   const r3=await db.createMetricRun(newRun(v,b,later));const r4=await db.createMetricRun(newRun(v,b,later));const r5=await db.createMetricRun(newRun(v,b));
   expect([r3.generation,r4.generation,r5.generation]).toEqual([3,4,5]);
   for(const r of [r3,r4,r5]){await db.stageMetricRows(r.runId,[full('2024-06-30'),full('2024-12-31'),cell({metric:'gross_margin',period_end:'2024-12-31'})]);await db.stageRunDependencies(r.runId,'aggregate',deps(9));}
   await db.activateMetricRun(r4.runId);
   expect(await code(db.activateMetricRun(r3.runId))).toBe('obsolete_run');
   expect(await code(db.activateMetricRun(r5.runId))).toBe('obsolete_run');
   expect((await db.activeMetricRun('sw2021',v,1))!.run_id).toBe(r4.runId);
   await db.failRun('aggregate',r3.runId,'obsolete_run');
   expect(await db.metricRun(r3.runId)).toMatchObject({status:'failed',coverage_summary:{failure_reason:'obsolete_run'}});
   expect(await code(db.failRun('aggregate',r3.runId,'again'))).toBe('illegal_transition');
   expect(await code(db.activateMetricRun(randomUUID()))).toBe('unknown');
   await db.setDatasetLicense(`scheme:sw2021:${v}` as DatasetKey,'internal','contract',null);
  });

  it('marks: free_share is part of the content — a free_share revision is a new observation; null is allowed',async()=>{
   const b=await h.batch();const t=await h.ticker();
   const e1=await db.beginFetchEvent('marks',{},b);
   expect(await db.applyObservations('marks',e1,[mark(t,'10',{trade_date:'2001-06-01',free_share:null})])).toEqual({inserted:1,duplicates:0,superseded:0});
   const e2=await db.beginFetchEvent('marks',{},b);
   expect(await db.applyObservations('marks',e2,[mark(t,'10',{trade_date:'2001-06-01',free_share:'500'})])).toEqual({inserted:0,duplicates:0,superseded:1});
   const e3=await db.beginFetchEvent('marks',{},b);
   expect(await db.applyObservations('marks',e3,[mark(t,'10.00',{trade_date:'2001-06-01',free_share:'500'})])).toEqual({inserted:0,duplicates:1,superseded:0});
   expect((await db.currentMarksOn('2001-06-01',[t]))[0]).toMatchObject({free_share:'500',fetch_event_id:e2});
  });

  it('completeness is per (metric, duration): 12M only on December 31, 3M at every quarter end, TTM for roe, INSTANT for member_count',async()=>{
   const v=await tree();const b=await h.batch();
   const r=await db.createMetricRun(newRun(v,b,{expected_grid:{codes:['A1'],period_ends:['2024-09-30','2024-12-31'],metrics:['revenue_sum']}}));
   const rs=(pe:string,duration:'3M'|'12M')=>cell({metric:'revenue_sum',period_end:pe,duration,period_start:duration==='12M'?`${pe.slice(0,4)}-01-01`:`${pe.slice(0,4)}-${pe.slice(5)==='09-30'?'07-01':'10-01'}`,unit:'CNY'});
   await db.stageMetricRows(r.runId,[rs('2024-09-30','3M'),rs('2024-12-31','3M')]);
   expect(await code(db.activateMetricRun(r.runId))).toBe('incomplete_run');                 // 12M missing on 12-31
   await db.stageMetricRows(r.runId,[rs('2024-12-31','12M')]);
   expect(await code(db.activateMetricRun(r.runId))).toBe('dependencies_incomplete');        // completeness passed (no 12M needed on 09-30)
   await db.failRun('aggregate',r.runId,'test');
  });

  it('manifest index: register is idempotent and touches the row; GC lists only aged, unreferenced hashes; delete re-checks',async()=>{
   const v=await tree();const b=await h.batch();
   const free=sha(),used=sha();
   expect(await db.registerManifest(free,'aggregate',10)).toBe(true);
   expect(await db.registerManifest(free,'aggregate',10)).toBe(false);
   expect(await db.registerManifest(used,'aggregate',10)).toBe(true);
   const r=await db.createMetricRun(newRun(v,b));
   await db.stageMetricRows(r.runId,[cell({metric:'member_count',period_end:'2024-06-30',status:'ok',missing_reason:null,value:'1',manifest_hash:used})]);
   const gcHashes=async()=>(await db.manifestGcCandidates(100000)).map(c=>c.hash);
   const p1=(await db.manifestObjectPath(free))!;
   expect(p1).toMatch(new RegExp(`^sha256/${free}/[0-9a-f-]{36}\\.json\\.gz$`));
   expect(await db.manifestObjectPath(sha())).toBeNull();
   expect(await gcHashes()).not.toContain(free);                                             // younger than the grace window
   await h.ageManifest(free,2*86400);await h.ageManifest(used,2*86400);
   const cands=await db.manifestGcCandidates(100000);
   expect(cands.map(c=>c.hash)).toContain(free);expect(cands.map(c=>c.hash)).not.toContain(used);
   const cf=cands.find(c=>c.hash===free)!;
   expect(cf.objectPath).toBe(p1);
   expect(await db.deleteManifestIndex([{hash:free,claim:'00000000-0000-4000-8000-000000000000'}])).toBe(0);   // wrong token
   expect(await db.deleteManifestIndex([{hash:free,claim:cf.claim},{hash:used,claim:cf.claim}])).toBe(1);
   expect(await gcHashes()).not.toContain(free);
   expect(await db.registerManifest(free,'aggregate',10)).toBe(true);                       // gone: registering again creates it…
   expect(await db.manifestObjectPath(free)).not.toBe(p1);                                    // …as a new incarnation
   expect(await code(db.manifestGcCandidates(0))).toBe('unknown');
   // claim/tombstone protocol (Codex round 1 #4): candidate selected → the hash is reused → registration and staging refused
   const raced=sha();expect(await db.registerManifest(raced,'aggregate',10)).toBe(true);
   await h.ageManifest(raced,2*86400);
   const rc=(await db.manifestGcCandidates(100000)).find(c=>c.hash===raced)!;
   expect(rc).toBeDefined();
   expect(await gcHashes()).not.toContain(raced);
   expect(await code(db.registerManifest(raced,'aggregate',10))).toBe('manifest_gc_in_progress');
   const r2=await db.createMetricRun(newRun(v,b));
   expect(await code(db.stageMetricRows(r2.runId,[cell({metric:'member_count',period_end:'2024-06-30',status:'ok',missing_reason:null,value:'1',manifest_hash:raced})]))).toBe('manifest_gc_in_progress');
   expect(await db.deleteManifestIndex([{hash:raced,claim:rc.claim}])).toBe(1);
   expect(await db.registerManifest(raced,'aggregate',10)).toBe(true);
   await db.failRun('aggregate',r.runId,'test');await db.failRun('aggregate',r2.runId,'test');
  });

  it('state fingerprint and freshness',async()=>{
   const iss=await h.issuer();await h.factScope(iss,7);
   const f=await db.stateFingerprint('CN');
   expect(f.revs.get(iss)).toBe(7);expect(f.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
   const ds=`industry.contract-${hex(3)}`;
   await recordAttempt(h.tables,ds,{ok:true,cadence:'weekly',now:new Date('2026-11-06T00:00:00.000Z')});
   expect((await db.freshness()).find(r=>r.dataset===ds)).toEqual({dataset:ds,status:'fresh',last_ok_at:'2026-11-06T00:00:00.000Z'});
   await recordAttempt(h.tables,`other.contract-${hex(3)}`,{ok:true,cadence:'daily'});
   expect((await db.freshness()).every(r=>r.dataset.startsWith('industry.'))).toBe(true);
  });
 });
}
