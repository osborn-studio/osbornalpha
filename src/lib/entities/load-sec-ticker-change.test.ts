// src/lib/entities/load-sec-ticker-change.test.ts
// Ticker-change detection on the real issuer write path (memory client): spec §4.3.4 fixture
// T0 (CIK X holds OLD) → T1 (X holds NEW, OLD gone) → T2 (still gone, +7 days, new hash,
// submissions tickers=['NEW']), plus the waiting, unconfirmed, reappearing and other-CIK paths.
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {SecExchangeRow} from '../research/entity-keys/parsers';
import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,lastSeenFromSnapshots,planSecLoad,sameSecTicker,snapshotMetaOf,unknownIdentities,type TickerChangeDeps} from './load-sec';
import {parseSecCompanyTickersExchange} from '../research/entity-keys/parsers';
import type {Row,TableClient} from '../db/table-client';
import {resolveIssuer} from './resolve';

const T0='2026-11-01',T1='2026-11-02',T2='2026-11-09',T3='2026-11-20';
const F=(d:string)=>`${d}T06:00:00.000Z`;
const H=(c:string)=>c.repeat(64);
const BATCH='33333333-3333-4333-8333-333333333333';
const CIK='1000001',OTHER='1000002';
const UNIVERSE=new Set(['OLD','NEW','BRK.B','BRK.A']);
const snap=(sha:string)=>`sec-tickers-exchange/${sha}.json`;
const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
async function run(c:TableClient&{rows(t:string):Row[]},rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW']),rejected:{cik?:string;ticker?:string}[]=[],lastSeen:TickerChangeDeps['lastSeenAsOf']=async()=>T0){
 await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
 return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH,snapshotPath:snap(fileSha),rejected},{confirm,lastSeenAsOf:lastSeen});
}
const issuerOf=(c:ReturnType<typeof memoryTableClient>,cik:string)=>String(c.rows('issuers').find(x=>x.cik===cik)!.issuer_id);
const rowOf=(c:ReturnType<typeof memoryTableClient>,ticker:string,validFrom?:string)=>c.rows('issuer_securities').find(x=>x.ticker===ticker&&(validFrom===undefined||x.valid_from===validFrom))!;
const prov=(row:Record<string,unknown>)=>row.provenance as Record<string,Record<string,unknown>|undefined>;

describe('snapshot gating',()=>{
 it('rejects older as_of / fetched_at and files below 90% of the previous row count',()=>{
  const prev={as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')};
  expect(checkSnapshot(null,{as_of:T0,fetched_at:F(T0),rows:1})).toBe('ok');
  expect(checkSnapshot(prev,{as_of:T0,fetched_at:F(T2),rows:100})).toBe('stale_snapshot');
  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T0),rows:100})).toBe('stale_snapshot');
  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T2),rows:89})).toBe('incomplete_snapshot');
  expect(checkSnapshot(prev,{as_of:T1,fetched_at:F(T1),rows:90})).toBe('ok');
  expect(checkSnapshot({as_of:T1,fetched_at:null,rows:null,sha256:null},{as_of:T1,fetched_at:F(T0),rows:1})).toBe('ok');
 });
 it('reads the previous snapshot from a batch receipt',()=>{
  expect(snapshotMetaOf({tool_versions:{as_of:T1,fetched_at:F(T1),rows:'100',sha256:H('1'),file:'x'}})).toEqual({as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')});
  expect(snapshotMetaOf({tool_versions:{file:'x',as_of:T0}})).toEqual({as_of:T0,fetched_at:null,rows:null,sha256:null});
  expect(snapshotMetaOf({tool_versions:{}})).toBeNull();
 });
 it('indexes file tickers per CIK in exact and normalized form, owners by exact form only',()=>{
  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW'),r(OTHER,'BRK.A'),r(CIK,'BRK.A')]);
  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK','BRK-B','BRK.A','BRK.B']);
  expect([...ix.owners.get('BRK.B')!]).toEqual([CIK]);expect([...ix.owners.get('BRK-B')!]).toEqual([CIK]);
  expect([...ix.owners.get('NEW')!]).toEqual([OTHER]);
  expect([...ix.owners.get('BRK')!].sort()).toEqual([CIK,OTHER]);     // ambiguous alias keeps every owner
  expect(sameSecTicker('BRK.B','brk-b')).toBe(true);expect(sameSecTicker('BRK.B','BRK.A')).toBe(false);
 });
});

describe('detectTickerChanges (spec §4.3.4 fixture, E3)',()=>{
 it('E3: OLD resolves to X before the change and while pending; after the confirmed close only for the past',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  const x=issuerOf(c,CIK);
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
  const t1=await run(c,[r(CIK,'NEW')],T1,H('1'));
  expect(t1.pending).toBe(1);
  expect(rowOf(c,'OLD').valid_to).toBeNull();
  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange'],first_missing_raw_path:snap(H('1'))});
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T1}))?.issuer_id).toBe(x);
  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
  expect(t2.closed).toBe(1);
  const old=rowOf(c,'OLD');
  expect(old).toMatchObject({valid_from:T0,valid_to:T1,valid_to_method:'sec_file_absent'});
  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),closing_raw_path:snap(H('2')),first_missing_raw_path:snap(H('1')),submissions_sha256:H('e'),last_seen_as_of:T0});
  expect(prov(old).pending_change).toMatchObject({replacement_tickers:['NEW']});
  expect(await resolveIssuer(c,{ticker:'OLD'},{asOf:T1})).toBeNull();
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
  expect(rowOf(c,'NEW')).toMatchObject({issuer_id:x,valid_from:T1,valid_from_method:'first_observed',valid_to:null});
  const claims=c.rows('issuer_identifier_claims');
  expect(claims.map(k=>[k.op,k.id_type,k.value,k.source])).toEqual([['evidence_only','ticker','OLD','sec_company_tickers_exchange']]);
  expect((claims[0].detail as {params:Record<string,unknown>;target:unknown}).params).toMatchObject({suggested_op:'backdate_window',old_ticker:'OLD',replacement_tickers:['NEW'],first_missing_as_of:T1});
  expect((claims[0].detail as {target:unknown}).target).toEqual({issuer_id:x});
 });
 it('waits while fewer than 7 days have passed or the file hash is unchanged',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const soon=await run(c,[r(CIK,'NEW')],'2026-11-05',H('3'));
  expect(soon.skippedSummary).toMatchObject({close_pending:1});
  const sameHash=await run(c,[r(CIK,'NEW')],T2,H('1'));
  expect(sameHash.skippedSummary).toMatchObject({close_pending:1});
  expect(rowOf(c,'OLD').valid_to).toBeNull();
 });
 it('does not close without the submissions confirmation',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const listed=await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW','OLD']));
  expect(listed.skippedSummary).toMatchObject({close_unconfirmed:1});
  const down=await run(c,[r(CIK,'NEW')],T2,H('2'),async()=>null);
  expect(down.errors.map(e=>e.code)).toContain('sec_unavailable');
  expect(rowOf(c,'OLD').valid_to).toBeNull();
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
 });
 it('clears pending_change when the ticker reappears for the same CIK',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const back=await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],'2026-11-03',H('4'));
  expect(back.cleared).toBe(1);
  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
 });
 it('a ticker listed under another CIK is an ownership_conflict and is not closed',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(OTHER,'OLD'),r(CIK,'NEW')],T1,H('1'));
  expect(c.rows('dq_quarantine').some(q=>q.natural_key===`OLD:${T0}`&&q.reason_code==='ownership_conflict'&&(q.detail as {reason:string}).reason==='ticker_listed_under_other_cik')).toBe(true);
  expect(rowOf(c,'OLD')).toMatchObject({valid_to:null});
  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
 });
 it('after a close, a reappearance opens a new first_observed row and leaves the closed row unchanged',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  await run(c,[r(CIK,'NEW')],T2,H('2'));
  const closed=structuredClone(rowOf(c,'OLD',T0));
  await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],T3,H('5'));
  expect(rowOf(c,'OLD',T0)).toEqual(closed);
  expect(rowOf(c,'OLD',T3)).toMatchObject({valid_to:null,valid_from_method:'first_observed'});
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T3}))?.issuer_id).toBe(issuerOf(c,CIK));
 });
});

describe('review fixes',()=>{
 const miss=async(c:ReturnType<typeof memoryTableClient>,ticker:string,extra:Partial<{confirm:TickerChangeDeps['confirm'];rejected:{cik?:string;ticker?:string}[]}>={})=>{
  await run(c,[r(CIK,ticker)],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'),confirmed(['NEW']),extra.rejected);
  return run(c,[r(CIK,'NEW')],T2,H('2'),extra.confirm??confirmed(['NEW']),extra.rejected);
 };
 it('P1 one ticker rule: submissions listing BRK-B prevents closing BRK.B',async()=>{
  const c=memoryTableClient(KEYS);
  const t2=await miss(c,'BRK.B',{confirm:confirmed(['NEW','BRK-B'])});
  expect(t2.skippedSummary).toMatchObject({close_unconfirmed:1});
  expect(rowOf(c,'BRK.B').valid_to).toBeNull();
 });
 it('P1 one ticker rule: the file listing BRK-B for the same CIK is presence for BRK.B',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'BRK.B')],T0,H('0'));
  const t1=await run(c,[r(CIK,'BRK-B')],T1,H('1'));
  expect(t1.pending).toBe(0);expect(prov(rowOf(c,'BRK.B')).pending_change).toBeUndefined();
 });
 it('P1 another CIK owning BRK-B is an ownership_conflict for BRK.B',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'BRK.B')],T0,H('0'));
  await run(c,[r(OTHER,'BRK-B'),r(CIK,'NEW')],T1,H('1'));
  expect(c.rows('dq_quarantine').some(q=>q.natural_key===`BRK.B:${T0}`&&q.reason_code==='ownership_conflict')).toBe(true);
  expect(prov(rowOf(c,'BRK.B')).pending_change).toBeUndefined();
 });
 it('P1 rejected rows are unknown, not absence: no first miss for their CIK or ticker',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  const bad=parseSecCompanyTickersExchange(JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[Number(CIK),'','OLD','Nasdaq']]}));
  expect(bad.rejected).toEqual([{index:0,reason:'missing_name',cik:CIK,ticker:'OLD'}]);
  const t1=await run(c,[r(OTHER,'NEW')],T1,H('1'),confirmed(['NEW']),bad.rejected);
  expect(t1.pending).toBe(0);expect(t1.skippedSummary).toMatchObject({unknown_rejected_row:1});
  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
  // a row that cannot be identified at all makes every absence unknown
  const t1b=await run(c,[r(OTHER,'NEW')],T1,H('1'),confirmed(['NEW']),[{}]);
  expect(t1b.pending).toBe(0);
  expect(unknownIdentities([{ticker:'BRK-B'}]).tickers.has('BRK.B')).toBe(true);
 });
 it('P1 a rejected row also blocks the close of a pending change',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW']),[{cik:CIK}]);
  expect(t2.closed).toBe(0);expect(rowOf(c,'OLD').valid_to).toBeNull();
 });
 it('P2 durable claim: a claim write that fails after the close is filed by the next run',async()=>{
  const mem=memoryTableClient(KEYS);
  let fail=true;
  const c=new Proxy(mem,{get(t,k,rcv){
   if(k==='insert')return async(table:string,row:Row)=>{if(fail&&table==='issuer_identifier_claims')throw new Error('boom');return t.insert(table,row);};
   const v=Reflect.get(t,k,rcv);return typeof v==='function'?v.bind(t):v;
  }}) as unknown as typeof mem;
  await run(mem,[r(CIK,'OLD')],T0,H('0'));
  await run(mem,[r(CIK,'NEW')],T1,H('1'));
  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
  expect(rowOf(mem,'OLD').valid_to).toBe(T1);expect(mem.rows('issuer_identifier_claims')).toEqual([]);
  expect(t2.errors.map(e=>e.code)).toContain('ticker_change_error');
  fail=false;
  const t3=await run(c,[r(CIK,'NEW')],T3,H('5'));
  expect(t3.claims).toBe(1);
  expect(mem.rows('issuer_identifier_claims').map(k=>[k.op,k.id_type,k.value])).toEqual([['evidence_only','ticker','OLD']]);
  const t4=await run(c,[r(CIK,'NEW')],'2026-11-21',H('6'));
  expect(t4.claims).toBe(0);expect(mem.rows('issuer_identifier_claims')).toHaveLength(1);
 });
 it('P2 the snapshot path is recorded in the pending marker, the close provenance and the claim',async()=>{
  const c=memoryTableClient(KEYS);
  await miss(c,'OLD');
  expect(prov(rowOf(c,'OLD')).valid_to).toMatchObject({closing_raw_path:snap(H('2')),first_missing_raw_path:snap(H('1'))});
  expect((c.rows('issuer_identifier_claims')[0].detail as {evidence:{locator:string}}).evidence.locator).toBe(snap(H('2')));
 });
 it('P2 last_seen_as_of comes only from a retained snapshot that listed the ticker for that CIK',async()=>{
  const rowsA=[r(CIK,'OLD')],rowsB=[r(OTHER,'OLD')],rowsC=[r(CIK,'NEW')];
  const snaps=[{as_of:T0,rows:rowsA},{as_of:T1,rows:rowsC},{as_of:'2026-10-01',rows:rowsB},{as_of:'2026-09-01',rows:null}];
  expect(lastSeenFromSnapshots(snaps,CIK,'OLD',T2)).toBe(T0);
  expect(lastSeenFromSnapshots(snaps,OTHER,'OLD',T2)).toBe('2026-10-01');
  expect(lastSeenFromSnapshots(snaps,CIK,'NEW',T1)).toBeNull();
  expect(lastSeenFromSnapshots([{as_of:T0,rows:null}],CIK,'OLD',T2)).toBeNull();
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const seen:string[][]=[];
  await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW']),[],async(cik,t,b)=>{seen.push([cik,t,b]);return null;});
  expect(seen).toEqual([[CIK,'OLD',T1]]);
  expect(prov(rowOf(c,'OLD')).valid_to!.last_seen_as_of).toBeNull();
 });
});
