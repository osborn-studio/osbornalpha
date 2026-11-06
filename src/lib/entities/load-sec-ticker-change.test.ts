// src/lib/entities/load-sec-ticker-change.test.ts
// Ticker-change detection on the real issuer write path (memory client): spec §4.3.4 fixture
// T0 (CIK X holds OLD) → T1 (X holds NEW, OLD gone) → T2 (still gone, +7 days, new hash,
// submissions tickers=['NEW']), plus the waiting, unconfirmed, reappearing and other-CIK paths.
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {SecExchangeRow} from '../research/entity-keys/parsers';
import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,planSecLoad,snapshotMetaOf,type TickerChangeDeps} from './load-sec';
import {resolveIssuer} from './resolve';

const T0='2026-11-01',T1='2026-11-02',T2='2026-11-09',T3='2026-11-20';
const F=(d:string)=>`${d}T06:00:00.000Z`;
const H=(c:string)=>c.repeat(64);
const BATCH='33333333-3333-4333-8333-333333333333';
const CIK='1000001',OTHER='1000002';
const UNIVERSE=new Set(['OLD','NEW']);
const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
async function run(c:ReturnType<typeof memoryTableClient>,rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW'])){
 await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
 return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH},{confirm,lastSeenAsOf:async()=>T0});
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
  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW')]);
  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK-B','BRK.B']);
  expect(ix.cikByTicker.get('BRK-B')).toBe(CIK);expect(ix.cikByTicker.has('BRK.B')).toBe(false);
  expect(ix.cikByTicker.get('NEW')).toBe(OTHER);
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
  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']});
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T1}))?.issuer_id).toBe(x);
  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
  expect(t2.closed).toBe(1);
  const old=rowOf(c,'OLD');
  expect(old).toMatchObject({valid_from:T0,valid_to:T1,valid_to_method:'sec_file_absent'});
  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),submissions_sha256:H('e'),last_seen_as_of:T0});
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
