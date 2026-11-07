// src/lib/macro/ingest.test.ts
import {createHash} from 'node:crypto';
import {beforeEach,describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {CATALOG_VERSION,MACRO_CATALOG} from './catalog';
import {MacroDbError} from './db';
import {UNACCOUNTED_ERROR,batchStatusFromCounts} from '../dq/batches';
import {IngestAbort,MAX_BATCH_ERRORS,batchFinalizeInput,chunkWrites,deriveAndWrite,derivedOf,ingestEvidence} from './ingest';
import type {IngestDeps} from './ingest';
import {memoryMacroDb} from './memory-db';
import {parseFredCsv} from './parsers/fred-csv';
import type {EvidenceInput,ParsedPoint} from './types';

const BATCH='11111111-1111-4111-8111-111111111111';
const enc=(s:string)=>new TextEncoder().encode(s);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
function evidence(text:string,opts:{adapter?:'fred_csv'|'akshare';fetchedAt?:string;url?:string}={}):EvidenceInput{
 const bytes=enc(text),adapter=opts.adapter??'fred_csv';
 const url=opts.url??(adapter==='fred_csv'?'https://fred.stlouisfed.org/graph/fredgraph.csv?id=X&cosd=2000-01-01':'https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData');
 return {sha256:sha(bytes),bytes,adapter,fetchUrl:url,fetchHost:new URL(url).host,httpStatus:200,contentType:adapter==='fred_csv'?'application/csv':'application/json;charset=UTF-8',fetchedAt:opts.fetchedAt??'2026-11-06T05:30:00.000Z',toolVersions:{parser:'test/1'}};
}
const fred=(code:string,seriesId:string,period:'day'|'month',rows:string,opts:{fetchedAt?:string}={})=>{
 const text=`observation_date,${code}\n${rows}`;
 return {evidence:evidence(text,opts),parsed:parseFredCsv(enc(text),{seriesId,code,period})};
};
function fakeEvidence(){
 const failing=new Set<string>();const puts:EvidenceInput[]=[];
 return {failing,puts,async put(e:EvidenceInput){if(failing.has(e.sha256))throw new Error('upload_failed');puts.push(e);return {objectPath:`${e.adapter}/${e.sha256}.csv`,status:'stored' as const};}};
}

/** dq_quarantine rows written through the TableClient are mirrored into the memory MacroDb (same id), so linkQuarantine /
 *  resolveConflict see the items quarantine() creates — in production both are the same Postgres table. */
function mirrorQuarantine(t:ReturnType<typeof memoryTableClient>,m:ReturnType<typeof memoryMacroDb>){
 const insert=t.insert.bind(t);
 t.insert=async(table,row)=>{
  const out=await insert(table,row);
  if(table==='dq_quarantine')m.addQuarantineItem({id:String(row.id),dataset:String(row.dataset),table_name:String(row.table_name),natural_key:String(row.natural_key),reason_code:String(row.reason_code),batch_id:String(row.batch_id)});
  return out;
 };
 return t;
}
const ADMIN='00000000-0000-4000-8000-0000000000aa';
/** An admin resolution, as Task 18 does it: the MacroDb item and the dq_quarantine row both close. */
const resolveBoth=async(id:string,decision:'accept'|'reject',observationId?:string)=>{
 if(decision==='accept')db.setBatchStatus(BATCH,'success');   // commit 213f9da: accept needs a finished success/partial batch
 try{await db.resolveConflict(id,decision,ADMIN,observationId);}finally{db.setBatchStatus(BATCH,'running');}
 await tables.update('dq_quarantine',{id},{status:decision==='accept'?'resolved_accept':'resolved_reject',resolved_by:ADMIN,resolved_at:'2026-11-06T06:00:00.000Z'});
};

let db:ReturnType<typeof memoryMacroDb>,tables:ReturnType<typeof memoryTableClient>,ev:ReturnType<typeof fakeEvidence>,deps:IngestDeps;
beforeEach(async()=>{
 db=memoryMacroDb();tables=mirrorQuarantine(memoryTableClient({dq_quarantine:['id']}),db);ev=fakeEvidence();
 deps={db,evidence:ev,tables,codeVersion:'a'.repeat(40),now:()=>new Date('2026-11-06T05:30:00Z')};
 await db.upsertCatalog(MACRO_CATALOG,CATALOG_VERSION,'macro-regime-rules/1.0');
 db.setBatchStatus(BATCH,'running');   // commit 213f9da: writes need a declared, running batch
});
const history=(id:string)=>db.seriesHistory(id,{maxRows:1000});
// Row values are `unknown` (TableClient Row): stringify before comparing / sorting (第 4 稿 P1-1).
const quarantined=()=>tables.rows('dq_quarantine').map(r=>({dataset:String(r.dataset),table:String(r.table_name),key:String(r.natural_key),reason:String(r.reason_code),batch:String(r.batch_id)}));

describe('ingestEvidence',()=>{
 it('stores evidence, writes one retrieval and lossless observations with available_at = fetched_at',async()=>{
  const r=fred('DGS10','US_DGS10_D','day','2026-10-01,4.10\n2026-10-02,\n2026-10-05,4.123456789012345678\n');
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[r]});
  expect(rec.counts).toEqual({fetched:2,inserted:2,duplicates:0,versioned:0,quarantined:0,failed:0});
  expect(rec.usable).toBe(2);
  expect(rec.errors).toEqual([]);expect(rec.retrievalIds).toHaveLength(1);
  expect(ev.puts.map(e=>e.sha256)).toEqual([r.evidence.sha256]);
  const ret=await db.retrieval(rec.retrievalIds[0]);
  expect(ret).toMatchObject({sha256:r.evidence.sha256,fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:'2026-11-06T05:30:00.000Z',batch_id:BATCH});
  const rows=await history('US_DGS10_D');
  expect(rows.map(o=>[o.period_end,o.value_text,o.version,o.available_at,o.retrieval_id,o.locator])).toEqual([
   ['2026-10-01','4.1',1,'2026-11-06T05:30:00.000Z',rec.retrievalIds[0],{kind:'csv_row',line:2,column:1}],
   ['2026-10-05','4.123456789012345678',1,'2026-11-06T05:30:00.000Z',rec.retrievalIds[0],{kind:'csv_row',line:4,column:1}],
  ]);
 });
 it('counts a re-fetch of identical values as duplicates but still records a new retrieval',async()=>{
  const r=fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n');
  const a=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[r]});
  const b=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.10\n',{fetchedAt:'2026-11-07T05:30:00.000Z'})]});
  expect(b.counts).toMatchObject({fetched:1,inserted:0,duplicates:1});
  expect(b.retrievalIds[0]).not.toBe(a.retrievalIds[0]);
  expect((await history('US_DGS10_D'))[0].available_at).toBe('2026-11-06T05:30:00.000Z');   // first seen stays
 });
 it('quarantines rule failures as rule_failed:<ruleId> and never writes them',async()=>{
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n2026-10-02,45\n2026-10-05,4.2\n')]});
  expect(rec.counts).toEqual({fetched:3,inserted:2,duplicates:0,versioned:0,quarantined:1,failed:0});
  expect((await history('US_DGS10_D')).map(o=>o.period_end)).toEqual(['2026-10-01','2026-10-05']);   // 4.2 judged against 4.1, not 45
  expect(quarantined().sort((a,b)=>a.reason<b.reason?-1:1)).toEqual([
   {dataset:'macro.fred',table:'macro_observations',key:'US_DGS10_D|2026-10-02',reason:'rule_failed:macro.jump',batch:BATCH},
   {dataset:'macro.fred',table:'macro_observations',key:'US_DGS10_D|2026-10-02',reason:'rule_failed:macro.range',batch:BATCH},
  ]);
 });
 it('cross-checks claims by decimal equality: equal forms write, a different value is adapter_mismatch',async()=>{
  const text='{"data":[]}';
  const pt=(periodEnd:string,valueText:string,i:number):ParsedPoint=>({seriesId:'CN_PMI_MFG',periodEnd,valueText,locator:{kind:'json_pointer',pointer:`/data/${i}/values/0/value`}});
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'akshare',retrievals:[{
   evidence:evidence(text,{adapter:'akshare'}),
   parsed:[pt('2026-10-31','49.3',0),pt('2026-09-30','50.1',1),pt('2026-08-31','49.8',2)],
   claims:[{series_id:'CN_PMI_MFG',period_end:'2026-10-31',value_text:'49.30'},{series_id:'CN_PMI_MFG',period_end:'2026-09-30',value_text:'50.2'}],   // 08-31 has no claim: written unchecked
  }]});
  expect(rec.counts).toMatchObject({fetched:3,inserted:2,quarantined:1,failed:0});
  expect((await history('CN_PMI_MFG')).map(o=>[o.period_end,o.value_text])).toEqual([['2026-08-31','49.8'],['2026-10-31','49.3']]);
  expect(quarantined()).toEqual([{dataset:'macro.akshare',table:'macro_observations',key:'CN_PMI_MFG|2026-09-30',reason:'adapter_mismatch',batch:BATCH}]);
  expect(tables.rows('dq_quarantine')[0].detail).toEqual({value_text:'50.1',claim_value_texts:['50.2']});
 });
 it('fails every point of a retrieval whose evidence upload fails, and carries on with the next one',async()=>{
  const bad=fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n2026-10-02,4.2\n'),good=fred('UNRATE','US_UNRATE','month','2026-09-01,4.2\n');
  ev.failing.add(bad.evidence.sha256);
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[bad,good]});
  expect(rec.counts).toEqual({fetched:3,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:2});
  expect(rec.errors).toEqual([{code:'evidence_upload_failed',key:'US_DGS10_D'}]);
  expect(rec.retrievalIds).toHaveLength(1);
  expect(await history('US_DGS10_D')).toEqual([]);
  expect((await history('US_UNRATE')).map(o=>o.value_text)).toEqual(['4.2']);
 });
 it('rejects points of series that are unknown, derived, restricted or of another adapter',async()=>{
  const p=(seriesId:string):ParsedPoint=>({seriesId,periodEnd:'2026-10-01',valueText:'1',locator:{kind:'csv_row',line:2,column:1}});
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[{evidence:evidence('observation_date,X\n2026-10-01,1\n'),parsed:[p('NOPE'),p('US_DGS10'),p('US_VIX_D'),p('CN_PMI_MFG')]}]});
  expect(rec.counts).toMatchObject({fetched:4,inserted:0,failed:4});
  expect(rec.errors.map(e=>e.key).sort()).toEqual(['CN_PMI_MFG','NOPE','US_DGS10','US_VIX_D']);
  expect(rec.errors.every(e=>e.code==='unknown_series')).toBe(true);
 });
 it('versions a revisable series and quarantines an immutable revision while the old value keeps serving',async()=>{
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('UNRATE','US_UNRATE','month','2026-09-01,4.2\n'),fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]});
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[
   fred('UNRATE','US_UNRATE','month','2026-09-01,4.3\n',{fetchedAt:'2026-11-07T05:30:00.000Z'}),
   fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-07T05:30:00.000Z'}),
  ]});
  expect(rec.counts).toMatchObject({fetched:2,versioned:1,quarantined:1,failed:0});
  expect((await history('US_UNRATE')).map(o=>[o.value_text,o.version])).toEqual([['4.3',2]]);
  expect((await history('US_DGS10_D')).map(o=>[o.value_text,o.version])).toEqual([['4.1',1]]);
  expect(quarantined()).toEqual([{dataset:'macro.fred',table:'macro_observations',key:'US_DGS10_D|2026-10-01',reason:'unexpected_revision',batch:BATCH}]);
  expect(tables.rows('dq_quarantine')[0].detail).toEqual({value_text:'4.15',current_value_text:'4.1'});
  const itemId=String(tables.rows('dq_quarantine')[0].id);
  expect((await db.quarantineMembers(itemId)).map(m=>[m.value_text,m.status])).toEqual([['4.15','quarantined']]);   // bound to the stored row
  // Re-delivery of the same conflicting value: the RPC reports the conflict again (no new row), and quarantine()
  // reuses the OPEN item with the same (dataset, table, natural_key, reason_code) — still exactly one item.
  const again=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-08T05:30:00.000Z'})]});
  expect(again.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
  expect(db.allObservations().filter(o=>o.series_id==='US_DGS10_D'&&o.status==='quarantined')).toHaveLength(1);
  // A second, different conflicting value reuses the same open item (first payload kept): the members table binds both
  // values, so accepting the later one cannot silently promote the first (第 4 稿 P1-4).
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.2\n',{fetchedAt:'2026-11-09T05:30:00.000Z'})]});
  expect(tables.rows('dq_quarantine')).toHaveLength(1);
  const members=await db.quarantineMembers(itemId);
  expect(members.map(m=>m.value_text)).toEqual(['4.15','4.2']);
  await resolveBoth(itemId,'accept',members[1].observation_id);
  expect((await db.quarantineMembers(itemId)).map(m=>[m.value_text,m.status])).toEqual([['4.15','rejected'],['4.2','ok']]);
 });
 it('a rejected value redelivered is previously_rejected: counted as a duplicate, no new quarantine item, no error (第 5 稿 P1-2)',async()=>{
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]});
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-07T05:30:00.000Z'})]});
  await resolveBoth(String(tables.rows('dq_quarantine')[0].id),'reject');
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-08T05:30:00.000Z'})]});
  expect(rec.counts).toEqual({fetched:1,inserted:0,duplicates:1,versioned:0,quarantined:0,failed:0});
  expect(rec.usable).toBe(0);                                                                     // a duplicate counter, but not usable data (第 6 稿 P2-1)
  expect(rec.errors).toEqual([]);
  expect(tables.rows('dq_quarantine')).toHaveLength(1);                                           // no new item for a final value
  expect(db.allObservations().filter(o=>o.series_id==='US_DGS10_D').map(o=>o.status)).toEqual(['ok','rejected']);
 });
 it('an item closed between quarantine() and the link is re-parked as a NEW open item and linked; a link that keeps failing aborts (第 5 稿 P2-3)',async()=>{
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]});
  const link=db.linkQuarantine.bind(db);let raced=false;
  db.linkQuarantine=async(id,ids,fence)=>{
   if(!raced){raced=true;await resolveBoth(id,'reject');}                                           // an admin closes the item right before our link
   return link(id,ids,fence);
  };
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-07T05:30:00.000Z'})]});
  expect(rec.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
  const items=tables.rows('dq_quarantine');
  expect(items.map(r=>String(r.status)).sort()).toEqual(['open','resolved_reject']);
  const open=String(items.find(r=>r.status==='open')!.id);
  expect((await db.quarantineMembers(open)).map(m=>[m.value_text,m.status])).toEqual([['4.15','quarantined']]);   // never left unbound
  db.linkQuarantine=async()=>{throw new MacroDbError('rpc_failed','link down');};
  await expect(ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.2\n',{fetchedAt:'2026-11-08T05:30:00.000Z'})]}))
   .rejects.toMatchObject({name:'IngestAbort',code:'quarantine_link_failed',key:'US_DGS10_D|2026-10-01'});
 });
 for(const decision of ['accept','reject'] as const){
  it(`a concurrent ${decision} of the reused member between quarantine() and the link completes the link: no abort, no new empty item (第 6 稿 P2-3)`,async()=>{
   await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]});
   await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-07T05:30:00.000Z'})]});   // quarantined and linked
   const itemId=String(tables.rows('dq_quarantine')[0].id);
   const [member]=await db.quarantineMembers(itemId);
   const link=db.linkQuarantine.bind(db);let raced=false;
   db.linkQuarantine=async(id,ids,fence)=>{
    if(!raced){raced=true;await resolveBoth(id,decision,decision==='accept'?member.observation_id:undefined);}   // the admin decides right before our link
    return link(id,ids,fence);
   };
   const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.15\n',{fetchedAt:'2026-11-08T05:30:00.000Z'})]});   // the redelivery reuses that row
   expect(rec.counts).toMatchObject({fetched:1,quarantined:1,failed:0});
   expect(tables.rows('dq_quarantine').map(r=>String(r.status))).toEqual([decision==='accept'?'resolved_accept':'resolved_reject']);   // no new item
   expect((await db.quarantineMembers(itemId)).map(m=>[m.value_text,m.status])).toEqual([['4.15',decision==='accept'?'ok':'rejected']]);
  });
 }
 it('stops with IngestAbort(fenced) when the run was taken over: nothing is written, nothing is counted (第 5 稿 P1-3)',async()=>{
  const old='33333333-3333-4333-8333-333333333333',next='44444444-4444-4444-8444-444444444444';
  db.setBatchStatus(old,'running');db.setBatchStatus(next,'running');
  const lease={maxAgeMs:1,processingTimeoutMs:600_000,takeover:false};
  const t=(await db.claimIngest(old,'macro.akshare',lease)).ownerToken!;
  await new Promise(r=>setTimeout(r,5));
  expect((await db.claimIngest(next,'macro.akshare',lease)).aborted).toEqual([old]);              // older than max age: aborted
  await expect(ingestEvidence(deps,{batchId:old,adapter:'fred_csv',ownerToken:t,retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]}))
   .rejects.toMatchObject({name:'IngestAbort',code:'fenced'});
  expect(await history('US_DGS10_D')).toEqual([]);
 });
 it('writes neither value of a period that appears twice with different values in one evidence',async()=>{
  const rec=await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n2026-10-01,4.2\n2026-10-02,4.3\n')]});
  expect(rec.counts).toMatchObject({fetched:3,inserted:1,quarantined:1});
  expect((await history('US_DGS10_D')).map(o=>o.period_end)).toEqual(['2026-10-02']);
  expect(quarantined()).toEqual([{dataset:'macro.fred',table:'macro_observations',key:'US_DGS10_D|2026-10-01',reason:'conflicting_rows',batch:BATCH}]);
 });
 it('counts a failed write call as failed rows instead of throwing',async()=>{
  // Proxy keeps memoryMacroDb's own methods bound whatever its implementation style (object or class).
  const failing=new Proxy(db,{get:(t,k)=>k==='writeObservations'?async()=>{throw new Error('rpc down');}:typeof Reflect.get(t,k)==='function'?Reflect.get(t,k).bind(t):Reflect.get(t,k)});
  const broken:IngestDeps={...deps,db:failing};
  const rec=await ingestEvidence(broken,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n2026-10-02,4.2\n')]});
  expect(rec.counts).toMatchObject({fetched:2,inserted:0,failed:2});
  expect(rec.errors).toEqual([{code:'write_failed',key:'US_DGS10_D'}]);
 });
 it('a native abort after committed writes carries the committed outcomes as partial counts (四轮 P2-2)',async()=>{
  const B2='55555555-5555-4555-8555-555555555555';
  db.setBatchStatus(B2,'running');
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('DGS10','US_DGS10_D','day','2026-10-01,4.1\n')]});
  db.setBatchStatus(BATCH,'success');   // 213f9da: the earlier batch must be finished for its row to be the current value of B2's conflict
  db.linkQuarantine=async()=>{throw new MacroDbError('rpc_failed','link down');};
  const e=await ingestEvidence(deps,{batchId:B2,adapter:'fred_csv',retrievals:[
   fred('UNRATE','US_UNRATE','month','2026-08-01,4.1\n2026-09-01,4.2\n'),                                       // inserted 2
   fred('DGS10','US_DGS10_D','day','2026-10-01,4.2\n2026-10-02,4.3\n',{fetchedAt:'2026-11-08T05:30:00.000Z'}),   // 1 inserted + 1 stored quarantined, then the link fails
   fred('CPIAUCSL','US_CPI_INDEX','month','2026-09-01,330\n'),                                                 // never reached
  ]}).catch(x=>x);
  expect(e).toBeInstanceOf(IngestAbort);expect(e.code).toBe('quarantine_link_failed');
  const mine=db.allObservations().filter(o=>o.batch_id===B2);
  const ok=mine.filter(o=>o.status==='ok').length,q=mine.filter(o=>o.status==='quarantined').length;
  expect([ok,q]).toEqual([3,1]);
  expect(e.partial.counts).toEqual({fetched:4,inserted:ok,duplicates:0,versioned:0,quarantined:q,failed:0});   // = committed rows; the third retrieval is not counted
  expect(e.partial.usable).toBe(3);expect(e.partial.retrievalIds).toHaveLength(2);expect(e.partial.errors).toEqual([]);
  expect(batchFinalizeInput(e.partial,new Date('2026-11-08T05:31:00Z'),'failed')).toMatchObject({status:'failed',counts:{inserted:3,quarantined:1}});
 });
});

describe('batchFinalizeInput (第 6 稿 P1-1/P2-4)',()=>{
 const NOW=new Date('2026-11-06T05:31:00.000Z');
 const c=(o:Partial<Record<'fetched'|'inserted'|'duplicates'|'versioned'|'quarantined'|'failed',number>>)=>({fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0,...o});
 it('computes the status finishBatch would, or the forced one; prepends unaccounted; caps errors like finishBatch',()=>{
  for(const [counts,errors] of [[c({fetched:2,inserted:2}),[]],[c({fetched:2,inserted:1,failed:1}),[]],[c({fetched:1,failed:1}),[]],[c({fetched:1,quarantined:1}),[{code:'no_native_outcomes'}]],[c({}),[{code:'skipped_summary'}]]] as const)
   expect(batchFinalizeInput({counts,errors:[...errors]},NOW).status).toBe(batchStatusFromCounts(counts,[...errors]));
  expect(batchFinalizeInput({counts:c({fetched:3,inserted:3}),errors:[{code:'quarantine_link_failed'}]},NOW,'failed')).toMatchObject({status:'failed',counts:{inserted:3}});   // never partial after a fatal abort
  expect(batchFinalizeInput({counts:c({fetched:2}),errors:[]},NOW)).toEqual({status:'failed',counts:c({fetched:2}),errors:[UNACCOUNTED_ERROR],finishedAt:NOW.toISOString()});
  const many=Array.from({length:MAX_BATCH_ERRORS+5},(_,i)=>({code:'x',key:String(i),message:'m'.repeat(600)}));
  const capped=batchFinalizeInput({counts:c({fetched:1,inserted:1}),errors:many},NOW).errors;
  expect(capped).toHaveLength(MAX_BATCH_ERRORS+1);expect(capped[0].message).toHaveLength(500);expect(capped.at(-1)).toEqual({code:'truncated',message:'5 more'});
  expect(()=>batchFinalizeInput({counts:c({}),errors:[]},new Date(NaN))).toThrow('invalid_now');
 });
});

describe('chunkWrites',()=>{
 it('never splits one (series, period) group across calls',()=>{
  const rows=[{series_id:'A',period_end:'2026-01-01'},{series_id:'A',period_end:'2026-01-02'},{series_id:'A',period_end:'2026-01-02'},{series_id:'B',period_end:'2026-01-01'}];
  expect(chunkWrites(rows,2).map(c=>c.map(r=>`${r.series_id}${r.period_end.slice(-1)}`))).toEqual([['A1','A2','A2'],['B1']]);
  expect(chunkWrites(rows,1).map(c=>c.length)).toEqual([1,2,1]);
  expect(chunkWrites([],10)).toEqual([]);
 });
});

describe('deriveAndWrite',()=>{
 it('orders derived series after their inputs',()=>{
  const ids=derivedOf('US').map(d=>d.id);
  expect(ids).toContain('US_DGS10');expect(ids).toContain('US_CPI_YOY');
  expect(derivedOf('CN').every(d=>d.region==='CN')).toBe(true);
 });
 it('writes month_end and yoy rows inside the triggering batch with derived_from and transform',async()=>{
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[
   fred('DGS10','US_DGS10_D','day','2026-09-29,4.3\n2026-09-30,4.35\n2026-10-01,4.4\n2026-11-02,4.5\n'),
   fred('CPIAUCSL','US_CPI_INDEX','month','2025-09-01,324.368\n2026-09-01,336.298\n2025-10-01,\n2026-10-01,337.1\n'),
  ]});
  const rec=await deriveAndWrite(deps,'US',BATCH);
  expect(rec.errors).toEqual([]);
  const dgs=await history('US_DGS10');
  expect(dgs.map(o=>[o.period_end,o.value_text,o.transform])).toEqual([['2026-09-30','4.35','month_end@1'],['2026-10-31','4.4','month_end@1']]);   // November is the current month
  const input=(await history('US_DGS10_D')).find(o=>o.period_end==='2026-09-30')!;
  const witness=(await history('US_DGS10_D')).find(o=>o.period_end==='2026-10-01')!;
  expect(dgs[0].derived_from).toEqual([input.observation_id,witness.observation_id]);   // df4a85e: next-month completion witness is an inputexpect(dgs[0].available_at).toBe(input.available_at);
  expect(dgs[0].batch_id).toBe(BATCH);expect(dgs[0].retrieval_id).toBeNull();
  const cpi=await history('US_CPI_YOY');
  expect(cpi.map(o=>[o.period_end,o.value_text])).toEqual([['2026-09-30','3.6779']]);   // 2026-10 has no 2025-10 base (shutdown gap)
  const again=await deriveAndWrite(deps,'US',BATCH);
  expect(again.counts.inserted).toBe(0);expect(again.counts.duplicates).toBe(again.counts.fetched);
 });
 it('recomputes the whole derived history every run: a CPI revision three years back moves that month and month + 12 (第 4 稿 P1-7)',async()=>{
  const months=['2022-09-01','2023-09-01','2024-09-01','2025-09-01','2026-09-01'];
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('CPIAUCSL','US_CPI_INDEX','month',months.map((m,i)=>`${m},${100+i*3}\n`).join(''))]});
  await deriveAndWrite(deps,'US',BATCH);
  const before=new Map((await history('US_CPI_YOY')).map(o=>[o.period_end,o.value_text]));
  expect(before.get('2023-09-30')).toBe('3');expect(before.get('2024-09-30')).toBe('2.9126');
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[fred('CPIAUCSL','US_CPI_INDEX','month','2023-09-01,104\n',{fetchedAt:'2026-11-07T05:30:00.000Z'})]});
  const rec=await deriveAndWrite(deps,'US',BATCH);
  const after=new Map((await history('US_CPI_YOY')).map(o=>[o.period_end,o.value_text]));
  expect(after.get('2023-09-30')).toBe('4');                                                      // the revised month (104/100)
  expect(after.get('2024-09-30')).toBe('1.9231');                                                 // month + 12 uses the revised base (106/104)
  expect(after.get('2025-09-30')).toBe(before.get('2025-09-30'));expect(after.get('2026-09-30')).toBe(before.get('2026-09-30'));
  expect(rec.counts.versioned).toBe(2);
 });
 it('derives from eligible rows plus its own batch only: rows of an abandoned batch are never inputs (第 4 稿 P1-5)',async()=>{
  const ABANDONED='22222222-2222-4222-8222-222222222222';
  db.setBatchStatus(ABANDONED,'running');
  await ingestEvidence(deps,{batchId:ABANDONED,adapter:'fred_csv',retrievals:[fred('CPIAUCSL','US_CPI_INDEX','month','2025-09-01,100\n2026-09-01,103\n')]});
  db.setBatchStatus(ABANDONED,'failed');   // written while running, then abandoned
  const rec=await deriveAndWrite(deps,'US',BATCH);
  expect(rec.counts.fetched).toBe(0);
  expect(await history('US_CPI_YOY')).toEqual([]);
 });
 it('a derivation abort after committed derived writes carries exactly those rows as partial counts (四轮 P2-2)',async()=>{
  await ingestEvidence(deps,{batchId:BATCH,adapter:'fred_csv',retrievals:[
   fred('DGS10','US_DGS10_D','day','2026-09-30,4.35\n2026-10-01,4.4\n2026-11-02,4.5\n'),
   fred('CPIAUCSL','US_CPI_INDEX','month','2025-09-01,324.368\n2026-09-01,336.298\n'),
  ]});
  const write=db.writeObservations.bind(db);const seen=new Set<string>();
  db.writeObservations=async(b,c,rows,t)=>{
   const id=rows[0]?.series_id;
   if(rows.some(r=>'derived_from' in r)){if(seen.size>0&&!seen.has(id))throw new MacroDbError('fenced');seen.add(id);}   // the second derived series aborts
   return write(b,c,rows,t);
  };
  const e=await deriveAndWrite(deps,'US',BATCH).catch(x=>x);
  expect(e).toBeInstanceOf(IngestAbort);expect(e.code).toBe('fenced');
  const derived=db.allObservations().filter(o=>o.batch_id===BATCH&&o.derived_from!==null);
  expect(derived.length).toBeGreaterThan(0);
  expect(e.partial.counts).toEqual({fetched:derived.length,inserted:derived.length,duplicates:0,versioned:0,quarantined:0,failed:0});   // the aborted series' rows are not counted
 });
});
