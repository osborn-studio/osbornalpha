// src/lib/company/db.test.ts
// memoryCompanyDb against the shared contract; memory-only rules; supabaseCompanyDb wiring over a stub
// client (rpc names/args, chunking, inbox merge across chunks with microsecond cursors, error mapping);
// readSnapshot / memorySnapshotReader (spec §0.1 item 3).
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {factInsert,filingInsert} from '../facts/db-contract';
import {memoryFactsDb} from '../facts/memory-facts-db';
import {companyDbContract,coverageInput,filingPublishedOf} from './db-contract';
import {CompanyDbError,decodeInboxCursor,encodeCursor,supabaseCompanyDb,toCompanyDbError,tsKey} from './db';
import {memoryCompanyDb} from './memory-company-db';
import {memorySnapshotReader,readSnapshot} from './snapshot-read';

companyDbContract('memoryCompanyDb contract',async()=>{
 const facts=memoryFactsDb();const db=memoryCompanyDb({facts});
 return {db,facts,
  issuer:async(name='ZZ Company')=>{const id=randomUUID();db.registerIssuer(id,name);return id;},
  user:async()=>randomUUID(),
  batch:async(producer='company-digest')=>{const id=randomUUID();db.registerBatch(id,{producer,status:'running',code_version:'test-sha',tool_versions:{node:'test'}});return id;}};
});

/** A published single-filing US stream in memory (state_rev 1). */
async function memoryStream(){
 const facts=memoryFactsDb();const db=memoryCompanyDb({facts});
 const iss=randomUUID();const fb=randomUUID();const b=randomUUID();
 db.registerIssuer(iss,'ZZ Mem');db.registerBatch(fb,{producer:'facts-sync'});db.registerBatch(b);
 await facts.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'k'}]);await facts.claimLease(iss,'US',fb,600);
 const run=await facts.beginRun(iss,'US',fb,1);const f=filingInsert(iss);const g=filingInsert(iss,{availableDate:'2024-05-01',formType:'10-Q',fiscalPeriod:'Q1',periodEnd:'2024-03-31'});
 await facts.stageFilings(run,[f,g]);
 const x=factInsert(iss,f);const y=factInsert(iss,f,{concept:'net_income_parent',value:'7'});
 await facts.stageFacts(run,[x,y]);await facts.publishRun(run,[f.filing_id,g.filing_id]);
 return {facts,db,iss,b,f,g,x,y};
}

describe('memoryCompanyDb specifics',()=>{
 it('validates the whole replace before writing anything (one SQL statement / transaction)',async()=>{
  const {facts,db,iss,b,f}=await memoryStream();
  const good=filingPublishedOf((await facts.filingsOfIssuer(iss,'US',{})).find(r=>r.filing_id===f.filing_id)!,2);
  const a=await db.beginAttempt(iss,'US',new Date());
  await expect(db.replaceDigest(iss,'US',b,a,randomUUID(),1,false,[good,{...good,natural_key:'x'}],coverageInput())).rejects.toMatchObject({code:'invalid_event'});
  expect(db.events()).toEqual([]);expect(db.coverage()).toEqual([]);
  expect(db.states()[0]).toMatchObject({digested_rev:0,last_status:null});
 });
 it('stamps first_seen_at / rebuilt_at with the injected clock and serialises calls',async()=>{
  const {facts,db,iss,b,f}=await memoryStream();
  const good=filingPublishedOf((await facts.filingsOfIssuer(iss,'US',{})).find(r=>r.filing_id===f.filing_id)!,2);
  db.setNow('2026-11-06T10:00:00.000Z');
  const a=await db.beginAttempt(iss,'US',new Date('2026-11-06T10:00:00.000Z'));
  const [r1,r2]=await Promise.allSettled([db.replaceDigest(iss,'US',b,a,randomUUID(),1,false,[good],coverageInput()),db.replaceDigest(iss,'US',b,a,randomUUID(),1,false,[good],coverageInput())]);
  expect([r1.status,r2.status]).toEqual(['fulfilled','fulfilled']);
  expect(db.events()).toHaveLength(1);
  expect(db.events()[0]).toMatchObject({first_seen_at:'2026-11-06T10:00:00.000Z',rebuilt_at:'2026-11-06T10:00:00.000Z',retired_at:null});
 });
});

type Ops=[string,...unknown[]][];
/** A SupabaseClient stand-in: records rpc calls and the chained query operations of every from(); results come from the handlers. */
function stub(h:{rpc?:(fn:string,args:Record<string,unknown>)=>{data:unknown;error:unknown};from?:(table:string,ops:Ops)=>{data:unknown;error:unknown}}={}){
 const calls:{fn:string;args:Record<string,unknown>}[]=[];const queries:{table:string;ops:Ops}[]=[];
 const client={
  rpc:(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});return Promise.resolve(h.rpc?.(fn,args)??{data:null,error:null});},
  from:(table:string)=>{
   const ops:Ops=[];queries.push({table,ops});
   const b:object=new Proxy({},{get:(_t,prop)=>prop==='then'
    ?(res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve(h.from?.(table,ops)??{data:[],error:null}).then(res,rej)
    :(...a:unknown[])=>{ops.push([String(prop),...a]);return b;}});
   return b;
  },
 };
 return {client:client as unknown as SupabaseClient,calls,queries};
}
const rawEvent=(o:Record<string,unknown>)=>({event_id:'e'.repeat(64),issuer_id:randomUUID(),market:'US',kind:'filing_published',natural_key:'k',occurred_on:'2024-02-01',period_end:null,concept:null,filing_id:null,
 payload:{},meta:{},payload_hash:'f'.repeat(64),based_on_rev:1,first_seen_at:'2026-11-06T10:00:00.123456+00:00',payload_changed_at:null,retired_at:null,rebuilt_at:'2026-11-06T10:00:00.123456+00:00',
 rebuild_id:randomUUID(),rebuild_batch_id:randomUUID(),...o});

describe('supabaseCompanyDb wiring',()=>{
 it('calls the SQL functions with p_* arguments and normalises numbers',async()=>{
  const s=stub({rpc:fn=>({data:fn==='replace_company_digest'?{upserted:'2',changed:'1',retired:'0',revived:'0'}:fn==='begin_company_digest_attempt'?'7':fn==='company_digest_backlog'?'3':
   fn==='company_digest_due'?[{issuerId:'i',market:'US',stateRev:'5',digestedRev:'2'}]:true,error:null})});
  const db=supabaseCompanyDb(s.client);const now=new Date('2026-11-06T00:00:00.000Z');
  expect(await db.beginAttempt('i','US',now)).toBe(7);
  const events=[filingPublishedOf({filing_id:'f',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:'2024-02-01',source_ref:'r'} as never,1)];
  expect(await db.replaceDigest('i','US','b',7,'r',5,true,events,coverageInput())).toEqual({upserted:2,changed:1,retired:0,revived:0});
  expect(await db.markDigestFailed('i','US',7,now)).toBe(true);
  expect(await db.backlog()).toEqual({failedStreams:3});
  expect(await db.digestDue(now,10)).toEqual([{issuerId:'i',market:'US',stateRev:5,digestedRev:2}]);
  expect(s.calls.map(c=>c.fn)).toEqual(['begin_company_digest_attempt','replace_company_digest','mark_company_digest_failed','company_digest_backlog','company_digest_due']);
  expect(s.calls[1].args).toEqual({p_issuer:'i',p_market:'US',p_batch:'b',p_attempt_id:7,p_rebuild_id:'r',p_based_on_rev:5,p_sweep:true,p_events:events,p_coverage:coverageInput()});
  expect(s.calls[0].args).toEqual({p_issuer:'i',p_market:'US',p_now:'2026-11-06T00:00:00.000Z'});
 });
 it('maps database errors by the first word of the message; detail is kept; the rest is internal',()=>{
  expect(toCompanyDbError({message:'stale_computation',code:'55P03'})).toMatchObject({code:'stale_computation',message:'stale_computation'});
  expect(toCompanyDbError({message:'invalid_event',code:'22023',details:'event: unexpected key'})).toMatchObject({code:'invalid_event',message:'invalid_event: event: unexpected key'});
  expect(toCompanyDbError({message:'invalid_event',code:'22023',detail:'payload: missing key'})).toMatchObject({message:'invalid_event: payload: missing key'});   // node-postgres spelling
  expect(toCompanyDbError({message:'watch_limit',code:'23514',details:'MAX_COMPANY_WATCHES = 200'})).toMatchObject({code:'watch_limit'});
  expect(toCompanyDbError({message:'invalid_attempt',code:'22023'})).toMatchObject({code:'internal',message:'invalid_attempt'});
  expect(toCompanyDbError({message:'insert or update on table violates foreign key constraint',code:'23503'},'invalid_read')).toMatchObject({code:'invalid_read'});
  expect(toCompanyDbError({message:'insert or update on table violates foreign key constraint',code:'23503'})).toMatchObject({code:'internal'});
  const e=new CompanyDbError('watch_limit');expect(toCompanyDbError(e)).toBe(e);
 });
 it('evidenceOf deduplicates and calls company_fact_evidence with at most 100 ids per call',async()=>{
  const s=stub({rpc:(_fn,args)=>({data:Object.fromEntries((args.p_fact_ids as string[]).slice(0,1).map(id=>[id,{fact_id:id,raw_hash:'r',snapshot_sha256:'s',snapshot_path:'p',hash_locator:'l',json_pointer:'/x',field:null,source:'edgar',api:null,url:null,params:null,
   captured_at:'2024-02-02T00:00:00+00:00',http_status:200,page:null,index_version:'company-evidence/1',run_id:'run',code_version:'sha',tool_versions:{},mapping_version:'facts-map/1'}])),error:null})});
  const ids=Array.from({length:150},()=>randomUUID());
  const m=await supabaseCompanyDb(s.client).evidenceOf([...ids,...ids.slice(0,10)]);
  expect(s.calls.map(c=>(c.args.p_fact_ids as string[]).length)).toEqual([100,50]);
  expect(m.size).toBe(2);expect(m.get(ids[0])).toMatchObject({captured_at:'2024-02-02T00:00:00.000Z',http_status:200});
 });
 it('eventsOfIssuers merges per-chunk keyset pages exactly (microseconds) and builds the cursor from the raw timestamp',async()=>{
  const ids=Array.from({length:150},()=>randomUUID());
  const a='a'.repeat(64),bb='b'.repeat(64),f='f'.repeat(64);
  const s=stub({from:(_t,ops)=>{const part=(ops.find(o=>o[0]==='in'&&o[1]==='issuer_id')![2] as string[]);
   return {data:part.length===100?[rawEvent({event_id:a,first_seen_at:'2026-11-06T10:00:00.123457+00:00'})]:[rawEvent({event_id:bb,first_seen_at:'2026-11-06T10:00:00.123457+00:00'}),rawEvent({event_id:f,first_seen_at:'2026-11-06T10:00:00.123456+00:00'})],error:null};}});
  const db=supabaseCompanyDb(s.client);
  const p=await db.eventsOfIssuers(ids,{limit:2});
  expect(p.rows.map(r=>r.event_id)).toEqual([bb,a]);
  expect(decodeInboxCursor(p.nextCursor!)).toEqual(['2026-11-06T10:00:00.123457+00:00',a]);
  expect(s.queries.map(q=>q.ops.find(o=>o[0]==='limit'))).toEqual([['limit',3],['limit',3]]);
  await db.eventsOfIssuers(ids,{limit:2,cursor:p.nextCursor});
  expect(s.queries[2].ops).toContainEqual(['or',`first_seen_at.lt."2026-11-06T10:00:00.123457+00:00",and(first_seen_at.eq."2026-11-06T10:00:00.123457+00:00",event_id.lt.${a})`]);
  expect(s.queries[2].ops).toContainEqual(['is','retired_at',null]);
 });
 it('markRead upserts receipts ignoring duplicates; an unwatched issuer (23503) is invalid_read',async()=>{
  const ok=stub({from:(_t,ops)=>({data:(ops.find(o=>o[0]==='upsert')![1] as unknown[]).map(()=>({event_id:'x'})),error:null})});
  const id='c'.repeat(64);
  expect(await supabaseCompanyDb(ok.client).markRead('u','i',[id,id])).toEqual({inserted:1});
  expect(ok.queries[0].ops[0]).toEqual(['upsert',[{user_id:'u',issuer_id:'i',event_id:id}],{onConflict:'user_id,event_id',ignoreDuplicates:true}]);
  const fk=stub({from:()=>({data:null,error:{message:'insert or update on table "company_event_reads" violates foreign key constraint',code:'23503'}})});
  await expect(supabaseCompanyDb(fk.client).markRead('u','i',[id])).rejects.toMatchObject({code:'invalid_read'});
  await expect(supabaseCompanyDb(ok.client).markRead('u','i',['nope'])).rejects.toMatchObject({code:'invalid_read'});
 });
});

describe('cursors and timestamps',()=>{
 it('tsKey orders PostgREST, node-postgres and ISO forms of the same instant identically, to the microsecond',()=>{
  const k=tsKey('2026-11-06T10:00:00.123456+00:00');
  expect(tsKey('2026-11-06 10:00:00.123456+00')).toBe(k);
  expect(tsKey('2026-11-06T10:00:00.123456Z')).toBe(k);
  expect(tsKey('2026-11-06 18:00:00.123456+08')).toBe(k);
  expect(tsKey('2026-11-06T10:00:00.123Z')! < k!).toBe(true);
  expect(tsKey('2026-11-06T10:00:00Z')).toBe(tsKey('2026-11-06 10:00:00+00'));
  for(const bad of ['yesterday','2026-11-06','2026-11-06T10:00:00.1234567Z','2026-11-06T10:00:00+00:00),x'])expect(tsKey(bad)).toBeNull();
 });
 it('decodes only well-formed cursors',()=>{
  const id='d'.repeat(64);
  expect(decodeInboxCursor(encodeCursor(['2026-11-06 10:00:00.5+00',id]))).toEqual(['2026-11-06 10:00:00.5+00',id]);
  for(const bad of ['', 'x', encodeCursor(['nope',id]), encodeCursor(['2026-11-06T10:00:00Z','x'])])expect(()=>decodeInboxCursor(bad)).toThrow(CompanyDbError);
 });
});

describe('snapshot readers',()=>{
 it('readSnapshot calls company_read_snapshot and converts the envelope with resultFromEnvelope',async()=>{
  const fact={fact_id:'f1',issuer_id:'i',market:'US',filing_id:'g1',run_id:'r',concept:'revenue',source_concept:'Revenues',statement:'IS',period_start:'2023-01-01',period_end:'2023-12-31',duration:'12M',value:'100.50',value_text:'100.50',unit:'USD',consolidation:'consolidated',available_date:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h',created_at:'2024-02-01T00:00:00+00:00',disclosure_seq:1,is_current:true,is_revision:false};
  const filing={filingId:'g1',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-12-31',availableDate:'2024-02-01',sourceRef:'0000320193-24-000001',source:'edgar',url:'https://www.sec.gov/x',documentUrl:null,citation:'edgar',linkAttempts:0,factCount:1,mappingGen:1};
  const s=stub({rpc:()=>({data:{facts:{state_rev:3,rows:[fact],truncated:false,row_count:1},filings:[filing]},error:null})});
  const out=await readSnapshot(s.client,'i','US',{concepts:['revenue'],asOf:'2030-01-01',history:true});
  expect(s.calls).toEqual([{fn:'company_read_snapshot',args:{p_issuer:'i',p_market:'US',p_concepts:['revenue'],p_as_of:'2030-01-01',p_from:null,p_to:null,p_history:true,p_limit:null}}]);
  expect(out).toEqual({stateRev:3,truncated:false,rows:[{...fact,value:'100.50'}],filings:[filing]});
  const e=stub({rpc:()=>({data:null,error:{message:'permission denied for function company_read_snapshot',code:'42501'}})});
  await expect(readSnapshot(e.client,'i','US',{concepts:null,asOf:'2030-01-01',history:false})).rejects.toMatchObject({code:'internal'});
 });
 it('memorySnapshotReader: ok facts of the active generation, filings with mapping_gen > 0 and available by asOf, factCount and citation in-snapshot',async()=>{
  const {facts,iss,f,g,x,y}=await memoryStream();
  const read=memorySnapshotReader(facts);
  const all=await read(iss,'US',{concepts:null,asOf:'2030-01-01',history:true});
  expect({rev:all.stateRev,trunc:all.truncated,facts:all.rows.map(r=>r.fact_id).sort()}).toEqual({rev:1,trunc:false,facts:[x.fact_id,y.fact_id].sort()});
  expect(all.filings.map(r=>[r.filingId,r.factCount,r.citation,r.mappingGen])).toEqual([[g.filing_id,0,'edgar',1],[f.filing_id,2,'edgar',1]]);
  const early=await read(iss,'US',{concepts:['revenue'],asOf:'2024-03-01',history:false});
  expect({facts:early.rows.map(r=>r.fact_id),filings:early.filings.map(r=>r.filingId)}).toEqual({facts:[x.fact_id],filings:[f.filing_id]});
 });
});
