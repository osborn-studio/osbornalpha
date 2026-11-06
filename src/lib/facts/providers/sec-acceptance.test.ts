// src/lib/facts/providers/sec-acceptance.test.ts
import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {filingInsert} from '../db-contract';
import {memoryFactsDb} from '../memory-facts-db';
import {FactsDbError} from '../types';
import type {Budget} from '../types';
import {memoryRawStore} from '../../dq/raw-store';
import {createPacer} from './shared';
import {SEC_MIN_INTERVAL_MS,fetchSubmissions} from '../../entities/identifiers/sec-submissions';
import {acceptanceIndex,enrichAcceptance,parseAcceptanceDateTime} from './sec-acceptance';

const budget:Budget={remainingMs:()=>60_000,signal:new AbortController().signal};
type Entry=SubmissionFiling;
const entry=(accessionNumber:string,filingDate:string,acceptanceDateTime:string|null,form='10-Q',page='recent'):Entry=>({accessionNumber,filingDate,reportDate:'2023-12-31',acceptanceDateTime,form,primaryDocument:'d.htm',isInlineXBRL:true,page});
// Task 6a shape: SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:{…, filings}, complete}
const PAGE1='CIK0000320193-submissions-001.json';
const snapshot=(recent:Entry[],pages:{name:string;sha256:string}[]=[]):SubmissionsSnapshot=>({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'a'.repeat(64),path:`sec-submissions/${'a'.repeat(64)}.json`},
 pages:pages.map(x=>({...x,path:`sec-submissions/${x.sha256}.json`})),parsed:{filings:recent},complete:true} as unknown as SubmissionsSnapshot);

describe('parseAcceptanceDateTime',()=>{
 it('accepts SEC UTC timestamps and refuses everything else (missing stays missing)',()=>{
  expect(parseAcceptanceDateTime('2026-09-18T00:53:51.000Z')).toBe('2026-09-18T00:53:51.000Z');
  expect(parseAcceptanceDateTime('2024-02-01T21:05:00Z')).toBe('2024-02-01T21:05:00.000Z');
  for(const v of [null,'',' 2024-02-01T21:05:00Z','2024-02-01 21:05:00','2024-02-01T21:05:00+01:00','2024-02-30T10:00:00.000Z','20240201',42])expect(parseAcceptanceDateTime(v)).toBeNull();
 });
});

describe('acceptanceIndex',()=>{
 it('indexes by accessionNumber; a repeated accession with the same values is kept, a disagreeing one is ambiguous and left out',()=>{
  const {index,ambiguous}=acceptanceIndex([entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('B','2024-03-01','2024-03-01T10:00:00.000Z'),entry('B','2024-03-02','2024-03-01T10:00:00.000Z'),entry('C','2024-04-01',null)]);
  expect(index.get('A')).toEqual({accessionNumber:'A',filingDate:'2024-02-01',form:'10-Q',acceptedAt:'2024-02-01T21:05:00.000Z',page:'recent'});
  expect(index.has('B')).toBe(false);expect(ambiguous).toEqual(['B']);
  expect(index.get('C')!.acceptedAt).toBeNull();
 });
});

async function seeded(){
 const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
 await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'0000320193'}]);await db.claimLease(iss,'US',b,600);
 const run=await db.beginRun(iss,'US',b,1);
 const f=(ref:string,availableDate:string)=>filingInsert(iss,{sourceRef:ref,availableDate});
 const ok=f('0000320193-24-000001','2024-02-01'),mismatch=f('0000320193-24-000002','2024-05-02'),absent=f('0000320193-24-000003','2024-08-02'),noTime=f('0000320193-24-000004','2024-11-01');
 await db.stageFilings(run,[ok,mismatch,absent,noTime]);await db.publishRun(run,[ok,mismatch,absent,noTime].map(x=>x.filing_id));
 const snap=snapshot([entry(ok.sourceRef,'2024-02-01','2024-02-01T21:05:00.000Z'),entry(mismatch.sourceRef,'2024-05-01','2024-05-01T20:00:00.000Z'),entry(noTime.sourceRef,'2024-11-01',null)]);
 return {db,iss,ok,mismatch,absent,noTime,snap};
}

describe('enrichAcceptance (spec §4.5)',()=>{
 it('writes acceptance for matching filings; a filingDate ≠ available_date becomes a sec.filing_date_vs_submissions result and no write; unknown or time-less accessions are skipped_summary',async()=>{
  const {db,iss,ok,mismatch,snap}=await seeded();
  const record=vi.fn(async(_r:unknown)=>{});
  const submissions=vi.fn(async(_c:string,_b:Budget,_coverFrom:string)=>snap);
  const out=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
  expect(submissions).toHaveBeenCalledWith('0000320193',budget,'2024-01-25');   // coverFrom = earliest pending available_date − 7 days (plan audit R3)
  expect(out.counts).toMatchObject({fetched:2,inserted:1,duplicates:0,failed:1});
  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2})}]);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record.mock.calls[0][0]).toEqual({natural_key:`320193:${mismatch.sourceRef}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
   left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
   detail:{left_text:'2024-05-02',right_text:'2024-05-01',left:{filing_id:mismatch.filing_id,source_ref:mismatch.sourceRef},right:{document:'submissions',sha256:'a'.repeat(64),locator:`filings.recent[accessionNumber=${mismatch.sourceRef}]`}}});
  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
  expect((await db.findFilingBySourceRef('edgar',mismatch.sourceRef))!.accepted_at).toBeNull();
  // second pass: the accepted filing is no longer pending; the mismatch is reported again
  const again=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
  expect(again.counts).toMatchObject({fetched:1,inserted:0,failed:1});
  expect(submissions.mock.calls[1][2]).toBe('2024-04-25');                       // the accepted 2024-02-01 filing no longer widens the window
 });
 it('a pending accession listed only in a historical files[] page is fetched through coverFrom and written; a mismatch there cites that page and its hash (plan audit R3)',async()=>{
  const {db,iss,absent,noTime}=await seeded();
  const histSha='e'.repeat(64);
  const withPage=snapshot([entry(noTime.sourceRef,'2024-11-01',null)],[{name:PAGE1,sha256:histSha}]);
  (withPage.parsed.filings as Entry[]).push(entry(absent.sourceRef,'2024-08-02','2024-08-02T20:30:00.000Z','10-Q',PAGE1));
  const mainOnly=snapshot([entry(noTime.sourceRef,'2024-11-01',null)]);
  // the stub answers like fetchSubmissions: the historical page is included only when coverFrom reaches it
  const submissions=vi.fn(async(_c:string,_b:Budget,coverFrom:string)=>coverFrom<='2024-08-02'?withPage:mainOnly);
  const out=await enrichAcceptance({db,submissions,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(submissions.mock.calls[0][2]<='2024-08-02').toBe(true);
  expect((await db.findFilingBySourceRef('edgar',absent.sourceRef))!.accepted_at).toBe('2024-08-02T20:30:00.000Z');
  expect(out.counts).toMatchObject({inserted:1});
  // filingDate disagreeing on the historical page: the result points at PAGE1 and its sha256, not the main document
  const {db:db2,iss:iss2,absent:absent2}=await seeded();
  const moved=snapshot([],[{name:PAGE1,sha256:histSha}]);
  (moved.parsed.filings as Entry[]).push(entry(absent2.sourceRef,'2024-08-01','2024-08-01T20:30:00.000Z','10-Q',PAGE1));
  const record=vi.fn(async(_r:unknown)=>{});
  await enrichAcceptance({db:db2,submissions:async()=>moved,recordDateMismatch:record},{issuerId:iss2,cik10:'0000320193'},budget);
  expect(record.mock.calls[0][0]).toMatchObject({detail:{right:{document:PAGE1,sha256:histSha,locator:`${PAGE1}[accessionNumber=${absent2.sourceRef}]`}}});
 });
 it('without a recorder the mismatches are returned and the receipt says they were not recorded',async()=>{
  const {db,iss,snap}=await seeded();
  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.mismatches).toHaveLength(1);
  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,filing_date_mismatch_unrecorded:1})}]);
 });
 it('acceptance_conflict counts as failed with its own error; the same value again is a duplicate; other errors are thrown',async()=>{
  const {db,iss,ok,snap}=await seeded();
  const conflicting={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new FactsDbError('acceptance_conflict');})};
  const out=await enrichAcceptance({db:conflicting,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.counts).toMatchObject({fetched:2,inserted:0,failed:2});
  expect(out.errors).toContainEqual({code:'acceptance_conflict',key:ok.sourceRef});
  const dup={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>false)};
  expect((await enrichAcceptance({db:dup,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).counts).toMatchObject({duplicates:1});
  const broken={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new Error('db down');})};
  await expect(enrichAcceptance({db:broken,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).rejects.toThrow('db down');
 });
 it('submissions unavailable → sec_unavailable, nothing written; no pending filing → no fetch at all',async()=>{
  const {db,iss}=await seeded();
  const out=await enrichAcceptance({db,submissions:async()=>{throw new Error('404');}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.counts).toMatchObject({fetched:0,inserted:0,failed:0});
  expect(out.errors).toEqual([{code:'sec_unavailable',key:iss,message:'404'}]);
  const none=vi.fn();
  expect((await enrichAcceptance({db,submissions:none},{issuerId:randomUUID(),cik10:'0000000001'},budget)).counts.fetched).toBe(0);
  expect(none).not.toHaveBeenCalled();
 });
});

describe('enrichAcceptance review fixes (Task 12 Codex)',()=>{
 const cik='0000320193';
 it('a time-less entry with a different filingDate is a mismatch first; with the same date it is acceptance_not_found',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:cik}]);await db.claimLease(iss,'US',b,600);
  const run=await db.beginRun(iss,'US',b,1);
  const a=filingInsert(iss,{sourceRef:'0000320193-24-000010',availableDate:'2024-02-01'}),c=filingInsert(iss,{sourceRef:'0000320193-24-000011',availableDate:'2024-03-01'});
  await db.stageFilings(run,[a,c]);await db.publishRun(run,[a.filing_id,c.filing_id]);
  const snap=snapshot([entry(a.sourceRef,'2024-02-02',null),entry(c.sourceRef,'2024-03-01','bad')]);
  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:cik},budget);
  expect(out.mismatches).toHaveLength(1);expect(out.counts).toMatchObject({fetched:1,failed:1,inserted:0});
  expect(out.errors[0].message).toContain('"acceptance_not_found":1');
 });
 it('stops starting writes when the budget is spent and reports deadline_hit with the remaining count',async()=>{
  const {db,iss,snap}=await seeded();
  let n=0;const b:Budget={remainingMs:()=>(n++<1?60_000:0),signal:new AbortController().signal};
  const out=await enrichAcceptance({db,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},b);
  const hit=out.errors.find(e=>e.code==='deadline_hit');
  expect(hit).toBeDefined();expect(JSON.parse(hit!.message!).remaining).toBeGreaterThan(0);
 });
 it('fetchSubmissions keeps conflicting duplicates from recent/history; enrichAcceptance writes nothing for that accession (acceptance_ambiguous, failed)',async()=>{
  const {db,iss,ok}=await seeded();
  const main=JSON.stringify({cik,name:'X',tickers:['X'],exchanges:[],filings:{recent:{accessionNumber:[ok.sourceRef],filingDate:['2024-02-01'],reportDate:[''],acceptanceDateTime:['2024-02-01T21:05:00.000Z'],form:['10-Q'],primaryDocument:['d.htm'],isInlineXBRL:[1]},
   files:[{name:'CIK0000320193-submissions-001.json',filingCount:1,filingFrom:'2000-01-01',filingTo:'2024-02-01'}]}});
  const page=JSON.stringify({accessionNumber:[ok.sourceRef],filingDate:['2024-02-01'],reportDate:[''],acceptanceDateTime:['2024-02-01T22:00:00.000Z'],form:['10-Q'],primaryDocument:['d.htm'],isInlineXBRL:[1]});
  const fetchStub=(async(u:string|URL|Request)=>new Response(String(u).includes('-001')?page:main,{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
  const raw=memoryRawStore();
  const out=await enrichAcceptance({db,submissions:(c,bb,from)=>fetchSubmissions(c,{fetch:fetchStub,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),sleep:async()=>{},now:()=>0,budget:bb},{coverFrom:from}),recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},budget);
  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBeNull();
  expect(out.errors[0].message).toContain('"acceptance_ambiguous":1');
  expect(out.counts.failed).toBeGreaterThanOrEqual(1);
 });
});
