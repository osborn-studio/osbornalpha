// src/lib/macro/db-contract.ts
// Shared MacroDb contract (plan "写入规则 / 发布资格 / 发布规则 / 隔离裁决 / ingest 租约、所有者令牌、分块与独占可续完成";
// spec §4.3, §0.2 M10, M16, M24, N2, N3; 第 4 稿 P1-4/P1-5/P1-6/P1-11/P2-1/P2-4; 第 5 稿 P1-2/P1-3/P1-4/P1-6/P2-1/P2-3). The same scenarios run against memoryMacroDb in db.test.ts; the SQL functions are
// pinned by the same branches in macro.integration.test.ts, so the in-memory rules the unit tests
// rely on are the SQL rules. Not a test file: it registers describe/it only when called. Every
// case uses its own series ids; publish state is shared, so cases read it right before publishing.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {DATASETS} from '../dq/datasets';
import {MacroDbError} from './db';
import type {MacroDb} from './db';
import type {MacroSeriesDef,ObservationRow,ObservationWrite,PublishInput,Region} from './types';

export interface MacroContractHarness{
 db:MacroDb;
 /** A RUNNING batch (SQL: an ingest_batches row; memory: setBatchStatus(id,'running')). */
 batch(dataset?:string):Promise<string>;
 /** Finishes a batch (SQL: status + finished_at; memory: setBatchStatus). */
 finish(batchId:string,status?:'success'|'partial'|'failed'):Promise<void>;
 /** Inserts an open dq_quarantine item (table_name macro_observations). */
 addQuarantine(i:{dataset:string;naturalKey:string;batchId:string;reasonCode:string}):Promise<string>;
 quarantineStatus(id:string):Promise<string|null>;
 /** A user id the resolver may act as (an auth.users row for SQL). */
 resolver():Promise<string>;
 /** ok versions of (series, period) of ANY batch, ascending (service-level read; db.versionsOf is public: finished batches only). */
 peek(series:string,period:string):Promise<ObservationRow[]>;
 close?():Promise<void>;
}
export const T1='2026-11-01T05:30:00.000Z',T2='2026-11-02T05:30:00.000Z',T3='2026-11-03T05:30:00.000Z';
export const sid=(p='T')=>`${p}_${randomBytes(5).toString('hex').toUpperCase()}`;
export function testDef(id:string,o:Partial<MacroSeriesDef>={}):MacroSeriesDef{
 return {id,region:'US',role:'indicator',type:'labor_rate',name:{zh:id,en:id},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',
  source:{adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher:{zh:'美国劳工统计局',en:'BLS'},via:{zh:'FRED',en:'FRED'},seriesKey:id,rights:'public_domain',attribution:{zh:'来源：BLS，经 FRED',en:'Source: BLS via FRED'}},
  revisionPolicy:'revisable',weight:0,changeKind:'pp',definitionVersion:1,...o};
}
export const nativeRow=(series:string,period:string,value:string,retrieval:string,at:string,revisable=true):ObservationWrite=>({series_id:series,period_end:period,value_text:value,available_at:at,revisable,retrieval_id:retrieval,locator:{kind:'csv_row',line:2,column:1}});
export const derivedRow=(series:string,period:string,value:string,from:string[],at:string):ObservationWrite=>({series_id:series,period_end:period,value_text:value,available_at:at,revisable:true,derived_from:from,transform:'month_end@1'});
/** 'code:message' of a MacroDbError rejection, 'resolved' when it did not reject. */
export const outcome=(p:Promise<unknown>)=>p.then(()=>'resolved',e=>e instanceof MacroDbError?`${e.code}:${e.message}`:`not_macro_db_error:${String(e)}`);
const zero={inserted:0,duplicates:0,versioned:0,quarantined:0,conflicts:[]};

export function macroDbContract(label:string,setup:()=>Promise<MacroContractHarness>):void{
 describe(label,()=>{
  let h:MacroContractHarness;let db:MacroDb;
  beforeAll(async()=>{h=await setup();db=h.db;},60000);
  afterAll(async()=>{await h?.close?.();},30000);
  const catalog=async(defs:MacroSeriesDef[])=>{const v=`macro-catalog/${randomBytes(6).toString('hex')}`;await db.upsertCatalog(defs,v,'macro-rules/1');return v;};
  /** token: the run's owner token (AKShare path); omitted = a batch without a run (FRED cron). */
  const retrieval=async(b:string,at:string,text=`body-${randomUUID()}`,token:string|null=null)=>{
   const bytes=new TextEncoder().encode(text);const sha=createHash('sha256').update(bytes).digest('hex');
   return db.putRetrieval({sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:bytes.byteLength},
    {fetch_url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:at,batch_id:b,tool_versions:{node:'22'}},token);
  };
  const LEASE={maxAgeMs:7_200_000,processingTimeoutMs:600_000,takeover:false};
  const zeroCounts={fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0};
  /** A fresh series with one ok observation 2026-09-30 = 4.1 available at T2, written in the FINISHED (success) batch b0 so the row
   *  is publication-eligible. `b` is a second, still RUNNING batch for the test's later writes (a finished batch takes no
   *  more writes, review R2); finish it before relying on its rows. */
  const seeded=async(o:Partial<MacroSeriesDef>={})=>{
   const s=sid();const v=await catalog([testDef(s,o)]);const b0=await h.batch();const r=await retrieval(b0,T2);
   expect((await db.writeObservations(b0,'c',[nativeRow(s,'2026-09-30','4.1',r,T2)])).inserted).toBe(1);
   await h.finish(b0,'success');
   const [row]=await db.versionsOf(s,'2026-09-30');
   return {s,v,b0,b:await h.batch(),r,id:row.observation_id};
  };
  const input=(region:Region,st:{revision:number;inputRevision:number},catalogVersion:string,ids:string[]):PublishInput=>({region,expectedRevision:st.revision,expectedInputRevision:st.inputRevision,asOf:'2026-11-06',methodologyVersion:'macro-method/1.0',catalogVersion,observationIds:ids,historyIds:[],catalogCounts:{verified:1,missing:0,restricted:0},regime:null,contributions:[],rulesVersion:'macro-rules/1',uncoveredWeight:0});

  it('catalog: idempotent per version, a version never names two catalogs, writes need an active non-alias series',async()=>{
   const s=sid();const v=await catalog([testDef(s)]);
   await expect(db.upsertCatalog([testDef(s)],v,'macro-rules/1')).resolves.toBeUndefined();
   expect(await outcome(db.upsertCatalog([testDef(s,{weight:5})],v,'macro-rules/1'))).toBe('rpc_failed:catalog_version_conflict');
   expect(await outcome(db.upsertCatalog([testDef(s)],'v1','macro-rules/1'))).toBe('rpc_failed:invalid_catalog_version');
   const m=sid('M');const a=sid('A');
   await catalog([testDef(m,{status:'missing',source:null,reason:{zh:'无',en:'none'}}),testDef(a,{role:'asset',aliasOf:s})]);
   const b=await h.batch();const r=await retrieval(b,T1);
   expect(await outcome(db.writeObservations(b,'c',[nativeRow(m,'2026-09-30','1',r,T1)]))).toBe('rpc_failed:invalid_series');
   expect(await outcome(db.writeObservations(b,'c',[nativeRow(a,'2026-09-30','1',r,T1)]))).toBe('rpc_failed:invalid_series');
   expect(await outcome(db.writeObservations(b,'c',[nativeRow(sid('NOPE'),'2026-09-30','1',r,T1)]))).toBe('rpc_failed:invalid_series');
  });

  it('evidence: one object per sha256, a retrieval per fetch, provenance checks',async()=>{
   const b=await h.batch();const text='observation_date,UNRATE\n2026-09-01,4.1\n';
   const r1=await retrieval(b,T1,text);const r2=await retrieval(b,T2,text);
   expect(r1).not.toBe(r2);
   const sha=createHash('sha256').update(text).digest('hex');
   expect(await db.evidenceObject(sha)).toMatchObject({sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv',content_type:'text/csv',byte_length:text.length});
   expect(await db.retrieval(r2)).toEqual({retrieval_id:r2,sha256:sha,fetch_url:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:T2,batch_id:b,tool_versions:{node:'22'}});
   expect(await db.evidenceObject('0'.repeat(64))).toBeNull();
   expect(await db.retrieval(randomUUID())).toBeNull();
   expect((await db.retrievalsOf(sha)).map(x=>x.retrieval_id)).toEqual([r1,r2]);                 // fetched_at ascending
   expect(await db.retrievalsOf('0'.repeat(64))).toEqual([]);
   expect((await db.retrievalsByIds([r2,randomUUID(),r1,r2])).map(x=>[x.retrieval_id,x.sha256])).toEqual([[r2,sha],[r1,sha]]);
   const obj={sha256:sha,object_path:`fred_csv/${sha}.csv`,adapter:'fred_csv' as const,content_type:'text/csv',byte_length:999};
   const rec={fetch_url:'https://fred.stlouisfed.org/x',fetch_host:'fred.stlouisfed.org',http_status:200,fetched_at:T1,batch_id:b,tool_versions:{}};
   expect(await outcome(db.putRetrieval(obj,rec))).toBe('rpc_failed:evidence_mismatch');
   const other=createHash('sha256').update('other').digest('hex');
   const ok={...obj,sha256:other,object_path:`fred_csv/${other}.csv`,byte_length:5};
   expect(await outcome(db.putRetrieval(ok,{...rec,fetch_url:'https://evil.example.com/x'}))).toMatch(/^rpc_failed:.*macro_retrievals_host/);
   expect(await outcome(db.putRetrieval(ok,{...rec,fetched_at:'2026-11-01T05:30:00.000123Z'}))).toBe('rpc_failed:invalid_retrieval');
   expect(await outcome(db.putRetrieval({...ok,object_path:`akshare/${other}.csv`},rec))).toMatch(/^rpc_failed:.*macro_evidence_path/);
  });

  it('write: insert, duplicate, versioned; input_revision bumps only for touched regions',async()=>{
   const s=sid();await catalog([testDef(s)]);const b=await h.batch();
   const us0=await db.publishState('US');const cn0=await db.publishState('CN');
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-08-31','4.1',await retrieval(b,T1),T1)])).toEqual({...zero,inserted:1});
   const [v1]=await h.peek(s,'2026-08-31');
   expect(v1).toMatchObject({series_id:s,period_end:'2026-08-31',value_text:'4.1',version:1,status:'ok',available_at:T1,availability_basis:'first_seen',derived_from:null,transform:null,code_version:'c',batch_id:b,locator:{kind:'csv_row',line:2,column:1}});
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+1);
   expect((await db.publishState('CN')).inputRevision).toBe(cn0.inputRevision);
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-08-31','4.1',await retrieval(b,T2),T2)])).toEqual({...zero,duplicates:1});
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+1);
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-08-31','4.2',await retrieval(b,T3),T3)])).toEqual({...zero,versioned:1});
   expect((await h.peek(s,'2026-08-31')).map(x=>[x.version,x.value_text])).toEqual([[1,'4.1'],[2,'4.2']]);
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+2);
   expect(await db.writeObservations(b,'c',[])).toEqual(zero);
   const rh=await retrieval(b,T3);                                                                // html_cell locator (Task 9 HTML tables)
   expect((await db.writeObservations(b,'c',[{...nativeRow(s,'2026-07-31','2.04',rh,T3),locator:{kind:'html_cell',table:1,row:3,cell:13}}])).inserted).toBe(1);
   expect((await h.peek(s,'2026-07-31'))[0].locator).toEqual({kind:'html_cell',table:1,row:3,cell:13});
   expect(await outcome(db.writeObservations(b,'c',[{...nativeRow(s,'2026-06-30','1',rh,T3),locator:{kind:'xlsx_cell'} as never}]))).toBe('rpc_failed:invalid_row');
  });

  it('write: unexpected_revision quarantines once per value; conflicting_rows writes nothing',async()=>{
   const {s,b}=await seeded({revisionPolicy:'immutable'});
   const us0=await db.publishState('US');
   const c1=await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(b,T3),T3,false)]);
   expect(c1).toEqual({...zero,quarantined:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'unexpected_revision',value_text:'4.5',current_value_text:'4.1',observation_id:expect.any(String)}]});
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+1);
   const c2=await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(b,T3),T3,false)]);
   expect(c2).toEqual(c1);                                                                        // same observation_id: the existing quarantined row
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+1);   // same quarantined value: no new row
   expect((await h.peek(s,'2026-09-30')).map(x=>x.value_text)).toEqual(['4.1']);   // quarantined rows are never read
   expect((await db.latestObservations([s]))[0].value_text).toBe('4.1');
   const r=await retrieval(b,T3);
   const c3=await db.writeObservations(b,'c',[nativeRow(s,'2026-10-31','5',r,T3),nativeRow(s,'2026-10-31','5.1',r,T3),nativeRow(s,'2026-10-31','5',r,T3)]);
   expect(c3).toEqual({...zero,quarantined:1,conflicts:[
    {series_id:s,period_end:'2026-10-31',reason:'conflicting_rows',value_text:'5',current_value_text:null,observation_id:null},
    {series_id:s,period_end:'2026-10-31',reason:'conflicting_rows',value_text:'5.1',current_value_text:null,observation_id:null}]});
   expect(await h.peek(s,'2026-10-31')).toEqual([]);
   expect((await db.publishState('US')).inputRevision).toBe(us0.inputRevision+1);
  });

  it('write: stale_delivery, missing_evidence, missing_input, derived rows; an invalid row refuses the whole call',async()=>{
   const {s,b,id}=await seeded();
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','3.9',await retrieval(b,T1),T1)])).toEqual({...zero,quarantined:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'stale_delivery',value_text:'3.9',current_value_text:'4.1',observation_id:expect.any(String)}]});
   expect((await db.latestObservations([s]))[0].value_text).toBe('4.1');
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-06-30','1',randomUUID(),T1)])).toEqual({...zero,conflicts:[{series_id:s,period_end:'2026-06-30',reason:'missing_evidence',value_text:'1',current_value_text:null,observation_id:null}]});
   const d=sid('D');await catalog([testDef(d,{derive:{kind:'month_end',from:s}})]);
   expect(await db.writeObservations(b,'c',[derivedRow(d,'2026-09-30','4.1',[randomUUID()],T2)])).toEqual({...zero,conflicts:[{series_id:d,period_end:'2026-09-30',reason:'missing_input',value_text:'4.1',current_value_text:null,observation_id:null}]});
   expect(await outcome(db.writeObservations(b,'c',[derivedRow(d,'2026-09-30','4.1',[id],T3)]))).toBe('rpc_failed:invalid_available_at');
   expect(await db.writeObservations(b,'c',[derivedRow(d,'2026-09-30','4.1',[id],T2)])).toEqual({...zero,inserted:1});
   expect((await h.peek(d,'2026-09-30'))[0]).toMatchObject({value_text:'4.1',retrieval_id:null,locator:null,derived_from:[id],transform:'month_end@1',available_at:T2});
   const r=await retrieval(b,T3);
   const good=nativeRow(s,'2026-05-31','1',r,T3);
   expect(await outcome(db.writeObservations(b,'c',[good,nativeRow(s,'2026-04-30','1',r,T2)]))).toBe('rpc_failed:invalid_available_at');
   expect(await outcome(db.writeObservations(b,'c',[good,nativeRow(s,'2026-04-30','1.50',r,T3)]))).toBe('rpc_failed:invalid_value_text');
   expect(await outcome(db.writeObservations(b,'c',[good,nativeRow(s,'2026-04-30','-0',r,T3)]))).toBe('rpc_failed:invalid_value_text');
   expect(await outcome(db.writeObservations(b,'c',[good,nativeRow(d,'2026-04-30','1',r,T3)]))).toBe('rpc_failed:invalid_row');
   expect(await outcome(db.writeObservations(b,'c',[good,{...derivedRow(d,'2026-04-30','1',[id],T2),transform:'yoy_from_index@1'}]))).toBe('rpc_failed:invalid_row');
   expect(await h.peek(s,'2026-05-31')).toEqual([]);                                     // all-or-nothing
  });

  it('reads: latest (asOf, periodEndLte), history (range, asOf, highest version, truncated), versionsOf, observationsByIds — ok rows only',async()=>{
   const s=sid();const s2=sid();await catalog([testDef(s),testDef(s2,{revisionPolicy:'immutable'})]);const b=await h.batch();
   const r1=await retrieval(b,T1);
   await db.writeObservations(b,'c',['2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-30'].map((p,i)=>nativeRow(s,p,String(i+1),r1,T1)));
   await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','5.5',await retrieval(b,T3),T3)]);
   await db.writeObservations(b,'c',[nativeRow(s2,'2026-09-30','9',r1,T1)]);
   await db.writeObservations(b,'c',[nativeRow(s2,'2026-09-30','8',await retrieval(b,T3),T3,false)]);   // quarantined
   await h.finish(b,'success');   // public reads only see finished success/partial batches
   const latest=await db.latestObservations([s,s2]);
   expect(latest.map(x=>[x.series_id,x.period_end,x.value_text,x.version]).sort()).toEqual([[s,'2026-09-30','5.5',2],[s2,'2026-09-30','9',1]].sort());
   expect((await db.latestObservations([s],{asOf:T2}))[0]).toMatchObject({period_end:'2026-09-30',value_text:'5',version:1});
   expect((await db.latestObservations([s],{periodEndLte:'2026-08-31'}))[0]).toMatchObject({period_end:'2026-08-31',value_text:'4'});
   expect(await db.latestObservations([s],{asOf:'2026-01-01T00:00:00.000Z'})).toEqual([]);
   expect(await db.latestObservations([])).toEqual([]);
   expect((await db.seriesHistory(s,{maxRows:100})).map(x=>[x.period_end,x.value_text])).toEqual([['2026-05-31','1'],['2026-06-30','2'],['2026-07-31','3'],['2026-08-31','4'],['2026-09-30','5.5']]);
   expect((await db.seriesHistory(s,{maxRows:100,asOf:T2})).map(x=>x.value_text)).toEqual(['1','2','3','4','5']);
   expect((await db.seriesHistory(s,{maxRows:100,from:'2026-06-30',to:'2026-08-31'})).map(x=>x.period_end)).toEqual(['2026-06-30','2026-07-31','2026-08-31']);
   expect(await outcome(db.seriesHistory(s,{maxRows:5}))).toMatch(/^truncated:/);              // 6 raw rows (two versions of 2026-09-30)
   expect((await db.seriesHistory(s,{maxRows:6})).length).toBe(5);
   expect((await db.versionsOf(s2,'2026-09-30')).map(x=>x.value_text)).toEqual(['9']);
   const ids=(await db.versionsOf(s,'2026-09-30')).map(x=>x.observation_id);
   const got=await db.observationsByIds([ids[1],randomUUID(),ids[0],ids[1]]);
   expect(got.map(x=>x.observation_id)).toEqual([ids[1],ids[0]]);                              // input order, unknown dropped, deduplicated
  });

  it('publish: manifest validation, supersede, stale_publisher on revision and input_revision, failed snapshots, since-paging, regimeOf',async()=>{
   const {s,v,b,id}=await seeded();
   const cn=sid('C');await catalog([testDef(cn,{region:'CN'})]);
   await db.writeObservations(b,'c',[nativeRow(cn,'2026-09-30','1',await retrieval(b,T2),T2)]);
   const cnId=(await h.peek(cn,'2026-09-30'))[0].observation_id;
   let st=await db.publishState('US');
   for(const bad of [[cnId],[randomUUID()],[id,id]])expect(await outcome(db.publishSnapshot(input('US',st,v,bad)))).toBe('invalid_manifest:invalid_manifest');
   expect(await outcome(db.publishSnapshot(input('US',st,'macro-catalog/000000000000',[id])))).toBe('invalid_manifest:invalid_manifest');
   expect(await outcome(db.publishSnapshot({...input('US',st,v,[id]),catalogCounts:{verified:-1,missing:0,restricted:0}}))).toBe('invalid_manifest:invalid_manifest');
   const p1=await db.publishSnapshot(input('US',st,v,[id]));
   expect(p1.revision).toBe(st.revision+1);
   const s1=(await db.snapshot(p1.snapshot_id))!;
   expect(await db.publishState('US')).toEqual({revision:st.revision+1,inputRevision:st.inputRevision});
   expect(await db.snapshot(p1.snapshot_id)).toMatchObject({snapshot_id:p1.snapshot_id,region:'US',as_of:'2026-11-06',revision:p1.revision,methodology_version:'macro-method/1.0',catalog_version:v,observation_ids:[id],catalog_counts:{verified:1,missing:0,restricted:0},status:'active',failure_reason:null});
   expect(await db.regimeOf(p1.snapshot_id)).toEqual({snapshot_id:p1.snapshot_id,region:'US',regime:null,contributions:[],rules_version:'macro-rules/1',uncovered_weight:0});
   expect(await outcome(db.publishSnapshot(input('US',st,v,[id])))).toBe('stale_publisher:stale_publisher');
   st=await db.publishState('US');
   await db.writeObservations(b,'c',[nativeRow(s,'2026-10-31','4.4',await retrieval(b,T3),T3)]);
   expect(await outcome(db.publishSnapshot(input('US',st,v,[id])))).toBe('stale_publisher:stale_publisher');
   st=await db.publishState('US');
   const p2=await db.publishSnapshot(input('US',st,v,[id]));
   expect((await db.activeSnapshot('US'))?.snapshot_id).toBe(p2.snapshot_id);
   expect((await db.snapshot(p1.snapshot_id))?.status).toBe('superseded');
   const s2=(await db.snapshot(p2.snapshot_id))!;
   expect((await db.previousSnapshot('US',s2.created_at))?.snapshot_id).toBe(p1.snapshot_id);   // superseded counts as previous
   expect((await db.previousSnapshot('US',s1.created_at))?.snapshot_id).not.toBe(p1.snapshot_id);   // strictly before
   expect(await db.previousSnapshot('CN','1970-01-01T00:00:00.000Z')).toBeNull();
   const failed=await db.recordFailedSnapshot({region:'US',asOf:'2026-11-06',methodologyVersion:'macro-method/1.0',catalogVersion:v,reason:'evidence_upload_failed'});
   expect(await db.snapshot(failed)).toMatchObject({status:'failed',failure_reason:'evidence_upload_failed',observation_ids:[],revision:p2.revision});
   expect((await db.activeSnapshot('US'))?.snapshot_id).toBe(p2.snapshot_id);
   expect(await db.publishState('US')).toEqual({revision:p2.revision,inputRevision:st.inputRevision});
   expect((await db.previousSnapshot('US','2999-01-01T00:00:00.000Z'))?.snapshot_id).toBe(p2.snapshot_id);   // failed snapshots are never "previous"
   expect(await db.snapshot(randomUUID())).toBeNull();
   expect(await db.regimeOf(randomUUID())).toBeNull();
   const all=await db.snapshotsSince(null,1000);
   expect(all.map(x=>x.snapshot_id)).toEqual(expect.arrayContaining([p1.snapshot_id,p2.snapshot_id]));
   expect(all.map(x=>x.snapshot_id)).not.toContain(failed);
   for(let i=1;i<all.length;i++)expect(all[i-1].created_at<all[i].created_at||(all[i-1].created_at===all[i].created_at&&all[i-1].snapshot_id<all[i].snapshot_id)).toBe(true);
   expect((await db.snapshotsSince({created_at:all[0].created_at,snapshot_id:all[0].snapshot_id},1000)).map(x=>x.snapshot_id)).toEqual(all.slice(1).map(x=>x.snapshot_id));
   expect(await db.snapshotsSince(null,1)).toHaveLength(1);
   expect(await db.snapshotsSince(null,0)).toEqual([]);
  });

  it('quarantine members + resolveConflict: accept one member (the rest rejected), reject all, reject_only, no resurrection',async()=>{
   const {s,b}=await seeded({revisionPolicy:'immutable'});
   const ra=(await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
   const rb=(await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.6',await retrieval(b,T3),T3,false)])).conflicts[0].observation_id!;
   const by=await h.resolver();
   const item=(series:string,reasonCode='unexpected_revision',period='2026-09-30',dataset='macro.fred')=>h.addQuarantine({dataset,naturalKey:`${series}|${period}`,batchId:b,reasonCode});
   const a=await item(s);
   expect(await db.linkQuarantine(a,[ra,rb])).toBe(2);                                             // one item, two values
   expect(await db.linkQuarantine(a,[ra])).toBe(0);
   expect(await outcome(db.linkQuarantine(a,[randomUUID()]))).toBe('rpc_failed:invalid_member');
   expect((await db.quarantineMembers(a)).map(m=>[m.value_text,m.status])).toEqual([['4.5','quarantined'],['4.6','quarantined']]);
   const st0=await db.publishState('US');
   expect(await outcome(db.resolveConflict(a,'accept',by))).toBe('rpc_failed:observation_required');
   expect(await outcome(db.resolveConflict(a,'accept',by,randomUUID()))).toBe('rpc_failed:not_member');
   expect(await outcome(db.resolveConflict(a,'maybe' as never,by,rb))).toBe('rpc_failed:invalid_decision');
   expect(await outcome(db.resolveConflict(a,'accept',by,rb))).toBe('rpc_failed:member_ineligible');   // its batch is still running (review R1)
   await h.finish(b,'success');
   await db.resolveConflict(a,'accept',by,rb);
   expect(await h.quarantineStatus(a)).toBe('resolved_accept');
   expect((await db.quarantineMembers(a)).map(m=>[m.value_text,m.status])).toEqual([['4.5','rejected'],['4.6','ok']]);
   expect((await h.peek(s,'2026-09-30')).map(x=>[x.version,x.value_text])).toEqual([[1,'4.1'],[3,'4.6']]);
   expect((await db.latestObservations([s]))[0].value_text).toBe('4.6');
   expect((await db.publishState('US')).inputRevision).toBe(st0.inputRevision+1);
   expect(await outcome(db.resolveConflict(a,'accept',by,rb))).toBe('already_resolved:already_resolved');
   expect(await db.linkQuarantine(a,[ra])).toBe(0);                                                // closed: its exact member was disposed by this item → complete (第 6 稿 P2-3)
   const w2=await h.batch();
   const rc=(await db.writeObservations(w2,'c',[nativeRow(s,'2026-09-30','4.7',await retrieval(w2,T3),T3,false)])).conflicts[0].observation_id!;
   expect(await outcome(db.linkQuarantine(a,[rc]))).toBe('quarantine_closed:quarantine_closed');   // a row still quarantined needs a new item (第 5 稿 P2-3)
   const again=await db.writeObservations(w2,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(w2,T3),T3,false)]);
   expect(again).toEqual({...zero,duplicates:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'previously_rejected',value_text:'4.5',current_value_text:'4.6',observation_id:ra}]});   // never inserted again (第 5 稿 P1-2)
   const a2=await item(s);await db.linkQuarantine(a2,[ra]);
   expect(await outcome(db.resolveConflict(a2,'accept',by,ra))).toBe('rpc_failed:not_quarantined');   // rejected rows never come back
   await db.resolveConflict(a2,'reject',by);
   const o=await seeded({revisionPolicy:'immutable'});
   const ro=(await db.writeObservations(o.b,'c',[nativeRow(o.s,'2026-09-30','7',await retrieval(o.b,T3),T3,false)])).conflicts[0].observation_id!;
   const rj=await item(o.s);await db.linkQuarantine(rj,[ro]);
   const st1=await db.publishState('US');
   expect(await outcome(db.resolveConflict(rj,'reject',by,ro))).toBe('rpc_failed:observation_not_allowed');
   await db.resolveConflict(rj,'reject',by);
   expect(await h.quarantineStatus(rj)).toBe('resolved_reject');
   expect((await db.quarantineMembers(rj)).map(m=>m.status)).toEqual(['rejected']);
   expect((await h.peek(o.s,'2026-09-30')).map(x=>x.value_text)).toEqual(['4.1']);
   expect((await db.publishState('US')).inputRevision).toBe(st1.inputRevision);
   for(const reasonCode of ['rule_failed:macro.range','adapter_mismatch']){
    const none=await item(o.s,reasonCode,'2026-08-31');
    expect(await outcome(db.resolveConflict(none,'accept',by,ro))).toBe('reject_only:reject_only');   // SQL-enforced
    await db.resolveConflict(none,'reject',by);
   }
   expect(await outcome(db.resolveConflict(randomUUID(),'accept',by,ro))).toBe('not_found:not_found');
   expect(await outcome(db.resolveConflict(await item(o.s,'x','2026-07-31',DATASETS.facts('US')),'accept',by,ro))).toBe('rpc_failed:invalid_item');
  });

  it('public reads (RLS parity): rows of running / failed batches are invisible to latestObservations / seriesHistory / versionsOf / observationsByIds',async()=>{
   const s=sid();await catalog([testDef(s)]);
   const open=await h.batch();
   await db.writeObservations(open,'c',[nativeRow(s,'2026-09-30','1',await retrieval(open,T1),T1)]);
   const pending=await db.latestEligible([s],{includeBatch:open});   // the explicit eligible read sees the open batch
   const ids=pending.map(x=>x.observation_id);
   expect(ids.length).toBe(1);
   expect(await db.latestObservations([s])).toEqual([]);
   expect(await db.seriesHistory(s,{maxRows:10})).toEqual([]);
   expect(await db.versionsOf(s,'2026-09-30')).toEqual([]);
   expect(await db.observationsByIds(ids)).toEqual([]);
   await h.finish(open,'failed');
   expect(await db.latestObservations([s])).toEqual([]);
   expect(await db.seriesHistory(s,{maxRows:10})).toEqual([]);
   expect(await db.versionsOf(s,'2026-09-30')).toEqual([]);
   const ok=await h.batch();
   await db.writeObservations(ok,'c',[nativeRow(s,'2026-08-31','2',await retrieval(ok,T2),T2)]);
   expect(await db.latestObservations([s])).toEqual([]);
   await h.finish(ok,'partial');
   expect((await db.latestObservations([s])).map(x=>x.period_end)).toEqual(['2026-08-31']);
   expect((await db.seriesHistory(s,{maxRows:10})).map(x=>x.period_end)).toEqual(['2026-08-31']);
   expect((await db.versionsOf(s,'2026-08-31')).length).toBe(1);
  });

  it('eligibility: running / failed batches stay out of latestEligible / eligibleHistory / publish; includeBatch admits the open batch',async()=>{
   const {s,v,id}=await seeded();
   const open=await h.batch();
   await db.writeObservations(open,'c',[nativeRow(s,'2026-10-31','4.4',await retrieval(open,T3),T3)]);
   const pending=(await h.peek(s,'2026-10-31'))[0].observation_id;
   expect((await db.latestEligible([s])).map(x=>x.observation_id)).toEqual([id]);
   expect((await db.latestEligible([s],{includeBatch:open})).map(x=>x.observation_id)).toEqual([pending]);
   expect((await db.eligibleHistory(s,{maxRows:10})).map(x=>x.period_end)).toEqual(['2026-09-30']);
   expect((await db.eligibleHistory(s,{maxRows:10,includeBatch:open})).map(x=>x.period_end)).toEqual(['2026-09-30','2026-10-31']);
   expect(await outcome(db.eligibleHistory(s,{maxRows:1,includeBatch:open}))).toMatch(/^truncated:/);
   let st=await db.publishState('US');
   expect(await outcome(db.publishSnapshot(input('US',st,v,[pending])))).toBe('invalid_manifest:invalid_manifest');
   expect(await outcome(db.publishSnapshot({...input('US',st,v,[id]),historyIds:[pending]}))).toBe('invalid_manifest:invalid_manifest');
   await h.finish(open,'failed');
   expect(await outcome(db.publishSnapshot(input('US',st,v,[pending])))).toBe('invalid_manifest:invalid_manifest');
   const later=await h.batch();
   expect((await db.writeObservations(later,'c',[nativeRow(s,'2026-10-31','4.4',await retrieval(later,T3),T3)])).inserted).toBe(1);   // not a duplicate of the abandoned row
   await h.finish(later,'success');
   const fresh=(await db.latestEligible([s]))[0];
   expect(fresh).toMatchObject({period_end:'2026-10-31',version:2});
   st=await db.publishState('US');
   expect((await db.publishSnapshot({...input('US',st,v,[fresh.observation_id]),historyIds:[id,fresh.observation_id]})).revision).toBe(st.revision+1);
   expect((await db.activeSnapshot('US'))?.history_ids).toEqual([id,fresh.observation_id]);
  });

  it('republishSnapshot: a NEW active snapshot copying a frozen one; stale_publisher / invalid_manifest / not_found',async()=>{
   const {v,id}=await seeded();
   let st=await db.publishState('US');const p1=await db.publishSnapshot({...input('US',st,v,[id]),historyIds:[id]});
   st=await db.publishState('US');await db.publishSnapshot(input('US',st,v,[id]));
   st=await db.publishState('US');
   expect(await outcome(db.republishSnapshot(p1.snapshot_id,st.revision-1,st.inputRevision))).toBe('stale_publisher:stale_publisher');
   const back=await db.republishSnapshot(p1.snapshot_id,st.revision,st.inputRevision);
   expect(back.revision).toBe(st.revision+1);expect(back.snapshot_id).not.toBe(p1.snapshot_id);
   expect(await db.activeSnapshot('US')).toMatchObject({snapshot_id:back.snapshot_id,observation_ids:[id],history_ids:[id],catalog_version:v,status:'active'});
   expect((await db.snapshot(p1.snapshot_id))?.status).toBe('superseded');
   expect(await db.regimeOf(back.snapshot_id)).toMatchObject({regime:null,rules_version:'macro-rules/1'});
   st=await db.publishState('US');
   const failed=await db.recordFailedSnapshot({region:'US',asOf:'2026-11-06',methodologyVersion:'macro-method/1.0',catalogVersion:v,reason:'boom'});
   expect(await outcome(db.republishSnapshot(failed,st.revision,st.inputRevision))).toBe('invalid_manifest:invalid_manifest');
   expect(await outcome(db.republishSnapshot(randomUUID(),st.revision,st.inputRevision))).toBe('not_found:not_found');
  });

  it('publish key (第 5 稿 P1-4): a used key replays its snapshot (replayed:true) and publishes nothing',async()=>{
   const {v,id}=await seeded();
   let st=await db.publishState('US');const key=`cron:${randomUUID()}`;
   const p1=await db.publishSnapshot({...input('US',st,v,[id]),publishKey:key});
   expect(p1).toEqual({snapshot_id:expect.any(String),revision:st.revision+1,replayed:false});
   expect(await db.publishSnapshot({...input('US',st,v,[id]),publishKey:key})).toEqual({...p1,replayed:true});   // a retry holding the old state
   expect((await db.publishState('US')).revision).toBe(st.revision+1);
   st=await db.publishState('US');
   expect((await db.publishSnapshot({...input('US',st,v,[id]),publishKey:`cron:${randomUUID()}`})).replayed).toBe(false);
  });

  it('rejected values are final (第 5 稿 P1-2): ok 4.1 → 4.2 rejected → a newer 4.2 redelivery is previously_rejected and inserts nothing',async()=>{
   const {s,b}=await seeded();                                                                          // revisable; 4.1 available at T2
   const rej=(await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.2',await retrieval(b,T1),T1)])).conflicts[0].observation_id!;
   const q=await h.addQuarantine({dataset:'macro.fred',naturalKey:`${s}|2026-09-30`,batchId:b,reasonCode:'stale_delivery'});
   await db.linkQuarantine(q,[rej]);await db.resolveConflict(q,'reject',await h.resolver());
   const st0=await db.publishState('US');
   expect(await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.2',await retrieval(b,T3),T3)])).toEqual({...zero,duplicates:1,conflicts:[{series_id:s,period_end:'2026-09-30',reason:'previously_rejected',value_text:'4.2',current_value_text:'4.1',observation_id:rej}]});
   expect((await h.peek(s,'2026-09-30')).map(x=>x.value_text)).toEqual(['4.1']);
   expect((await db.publishState('US')).inputRevision).toBe(st0.inputRevision);
  });

  it('quarantine reuse (第 5 稿 P1-6): a failed batch’s quarantined row is not reused; the successful redelivery gets its own version; accepting it publishes; the stranded member is member_ineligible',async()=>{
   const {s,v}=await seeded({revisionPolicy:'immutable'});
   const failedB=await h.batch();
   const stranded=(await db.writeObservations(failedB,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(failedB,T3),T3,false)])).conflicts[0].observation_id!;
   await h.finish(failedB,'failed');
   const okB=await h.batch();
   const own=(await db.writeObservations(okB,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(okB,T3),T3,false)])).conflicts[0].observation_id!;
   expect(own).not.toBe(stranded);
   expect((await db.writeObservations(okB,'c',[nativeRow(s,'2026-09-30','4.5',await retrieval(okB,T3),T3,false)])).conflicts[0].observation_id).toBe(own);   // the current batch's row is reused
   const q=await h.addQuarantine({dataset:'macro.fred',naturalKey:`${s}|2026-09-30`,batchId:failedB,reasonCode:'unexpected_revision'});
   expect(await db.linkQuarantine(q,[stranded,own])).toBe(2);
   await h.finish(okB,'success');
   const by=await h.resolver();
   expect(await outcome(db.resolveConflict(q,'accept',by,stranded))).toBe('rpc_failed:member_ineligible');
   await db.resolveConflict(q,'accept',by,own);
   expect((await db.quarantineMembers(q)).map(m=>[m.observation_id,m.status])).toEqual([[stranded,'rejected'],[own,'ok']]);
   const st=await db.publishState('US');
   expect((await db.publishSnapshot(input('US',st,v,[own]))).revision).toBe(st.revision+1);
  });

  it('ingest lease with owner tokens, chunk claims (a repeat never re-processes), stored errors/keys, exclusive resumable finish',async()=>{
   const ds=`macro.t${randomBytes(4).toString('hex')}`;
   const b1=await h.batch(ds),b2=await h.batch(ds);
   const c1=await db.claimIngest(b1,ds,LEASE);
   expect(c1).toEqual({status:'claimed',ownerToken:expect.any(String),aborted:[],holder:null});
   const t=c1.ownerToken!;
   expect(await db.claimIngest(b2,ds,LEASE)).toEqual({status:'busy',ownerToken:null,aborted:[],holder:b1});
   const c={fetched:3,inserted:2,duplicates:1,versioned:0,quarantined:0,failed:0};
   expect(await db.claimChunk(b1,1,2,t)).toEqual({status:'claimed'});
   expect(await db.claimChunk(b1,1,2,t)).toMatchObject({status:'processing',chunk:{seq:1,state:'processing'}});
   expect(await outcome(db.claimChunk(b1,1,2,randomUUID()))).toBe('fenced:fenced');
   expect(await outcome(db.claimChunk(b1,0,3,t))).toBe('rpc_failed:chunk_total_mismatch');
   expect(await outcome(db.claimChunk(b1,2,2,t))).toBe('rpc_failed:invalid_chunk');
   expect(await outcome(db.claimChunk(randomUUID(),0,1,t))).toBe('rpc_failed:batch_not_claimed');
   expect(await outcome(db.completeChunk(b1,1,{counts:c,nativeUsable:4,errors:[],claimKeys:[],locatedKeys:[]},t))).toBe('rpc_failed:invalid_chunk');   // > inserted+versioned+duplicates (第 6 稿 P2-1)
   const done=await db.completeChunk(b1,1,{counts:c,nativeUsable:2,errors:[{code:'parse_failed',key:'CN_A'}],claimKeys:['CN_A|2026-09-30'],locatedKeys:[]},t);
   expect(done).toEqual({seq:1,total:2,state:'done',counts:c,native_usable:2,errors:[{code:'parse_failed',key:'CN_A'}],claim_keys:['CN_A|2026-09-30'],located_keys:[]});
   expect(await outcome(db.completeChunk(b1,1,{counts:c,nativeUsable:3,errors:[],claimKeys:[],locatedKeys:[]},t))).toBe('rpc_failed:chunk_not_processing');
   expect(await db.claimChunk(b1,1,2,t)).toEqual({status:'done',chunk:done});                      // the stored receipt
   expect(await db.beginFinish(b1,2,t)).toEqual({status:'incomplete',missing:[0]});
   await db.claimChunk(b1,0,2,t);
   const zeroth=await db.completeChunk(b1,0,{counts:{...c,fetched:1},nativeUsable:3,errors:[],claimKeys:[],locatedKeys:['CN_A|2026-09-30']},t);
   expect(await db.chunksOf(b1)).toEqual([zeroth,done]);
   expect(await outcome(db.beginFinish(b1,2,randomUUID()))).toBe('fenced:fenced');                   // only the owner finishes
   const f1=await db.beginFinish(b1,2,t);
   expect(f1).toEqual({status:'finishing',progress:{},finishToken:expect.any(String)});
   if(f1.status!=='finishing')throw new Error('unreachable');
   expect(await db.ingestRun(b1)).toEqual({dataset:ds,state:'finishing',progress:{}});
   expect(await db.recordFinishStep(b1,'derived',{counts:c,errors:[]},{ownerToken:t,finishToken:f1.finishToken})).toEqual({derived:{counts:c,errors:[]}});
   const f2=await db.beginFinish(b1,2,t);                                                              // a retried finish resumes…
   if(f2.status!=='finishing')throw new Error('unreachable');
   expect(f2.progress).toEqual({derived:{counts:c,errors:[]}});
   expect(f2.finishToken).not.toBe(f1.finishToken);                                                    // …with a new finish token
   expect(await outcome(db.recordFinishStep(b1,'batch_finished',{status:'success',date:'2026-11-06'},{ownerToken:t,finishToken:f1.finishToken}))).toBe('fenced:fenced');
   const fence={ownerToken:t,finishToken:f2.finishToken};
   await db.recordFinishStep(b1,'publish_attempt',{at:T3,status:'stale',reason:null},fence);
   expect((await db.recordFinishStep(b1,'publish_attempt',{at:T3,status:'failed',reason:'rpc_failed'},fence)).attempts).toEqual([{at:T3,status:'stale',reason:null},{at:T3,status:'failed',reason:'rpc_failed'}]);
   await db.recordFinishStep(b1,'receipt',{status:'success'},fence);
   expect(await db.beginFinish(b1,2,t)).toMatchObject({status:'finished',progress:{derived:{counts:c,errors:[]},receipt:{status:'success'}}});
   expect(await outcome(db.recordFinishStep(b1,'published',{},fence))).toBe('rpc_failed:run_not_finishing');
   expect(await outcome(db.recordFinishStep(b1,'published',{},{ownerToken:t,finishToken:f1.finishToken}))).toBe('fenced:fenced');   // an obsolete token: fenced before any state error (第 6 稿 P1-1)
   expect(await outcome(db.recordFinishStep(b1,'freshness_recorded' as never,{},fence))).toBe('rpc_failed:invalid_step');          // only recordFreshness writes it
   expect(await db.claimIngest(await h.batch(ds),ds,LEASE)).toMatchObject({status:'claimed'});   // the finished run released the lease
   expect(await db.ingestRun(randomUUID())).toBeNull();
  });

  it('owner fence after a takeover (第 5 稿 P1-3/P2-1): the stalled run is aborted, every old-owner mutation is fenced, a new batch succeeds',async()=>{
   const ds=`macro.t${randomBytes(4).toString('hex')}`;const s=sid();await catalog([testDef(s)]);
   const old=await h.batch(ds);
   const t1=(await db.claimIngest(old,ds,{...LEASE,processingTimeoutMs:1})).ownerToken!;
   const r1=await retrieval(old,T2,undefined,t1);
   expect(await db.claimChunk(old,0,1,t1)).toEqual({status:'claimed'});
   expect((await db.writeObservations(old,'c',[nativeRow(s,'2026-09-30','4.1',r1,T2)],t1)).inserted).toBe(1);   // the worker crashes before completeChunk
   expect(await outcome(db.writeObservations(old,'c',[nativeRow(s,'2026-08-31','4',r1,T2)]))).toBe('fenced:fenced');   // a run's batch never takes a token-less write
   await new Promise(r=>setTimeout(r,5));
   const fresh=await h.batch(ds);
   expect(await db.claimIngest(fresh,ds,LEASE)).toMatchObject({status:'busy',holder:old});             // without takeover nothing is aborted
   const next=await h.batch(ds);
   const c2=await db.claimIngest(next,ds,{...LEASE,takeover:true});
   expect(c2).toMatchObject({status:'claimed',aborted:[old],holder:null});
   expect(await db.ingestRun(old)).toMatchObject({state:'aborted',progress:{aborted:{by:next,reason:'stalled_chunk'}}});
   const st=await db.publishState('US');const v=await catalog([testDef(sid())]);
   const calls:[string,()=>Promise<unknown>][]=[
    ['putRetrieval',()=>retrieval(old,T3,undefined,t1)],
    ['writeObservations',()=>db.writeObservations(old,'c',[nativeRow(s,'2026-10-31','4.2',r1,T2)],t1)],
    ['linkQuarantine',()=>db.linkQuarantine(randomUUID(),[randomUUID()],{batchId:old,ownerToken:t1})],
    ['claimChunk',()=>db.claimChunk(old,0,1,t1)],
    ['completeChunk',()=>db.completeChunk(old,0,{counts:zeroCounts,nativeUsable:0,errors:[],claimKeys:[],locatedKeys:[]},t1)],
    ['beginFinish',()=>db.beginFinish(old,1,t1)],
    ['recordFinishStep',()=>db.recordFinishStep(old,'derived',{},{ownerToken:t1,finishToken:randomUUID()})],
    ['publishSnapshot',()=>db.publishSnapshot({...input('US',st,v,[]),publishKey:`ingest:${old}`,batchId:old,ownerToken:t1})],
   ];
   for(const [name,call] of calls)expect({name,r:await outcome(call())}).toEqual({name,r:'fenced:fenced'});
   expect((await db.claimIngest(await h.batch(ds),ds,LEASE)).aborted).toEqual([old]);                  // listed while its batch still runs
   await h.finish(old,'failed');                                                                        // what the start route does
   expect((await db.claimIngest(await h.batch(ds),ds,LEASE)).aborted).toEqual([]);
   const r2=await retrieval(next,T3,undefined,c2.ownerToken);
   expect(await db.writeObservations(next,'c',[nativeRow(s,'2026-09-30','4.1',r2,T3)],c2.ownerToken)).toMatchObject({inserted:1,duplicates:0});   // not a duplicate of the abandoned row
   await h.finish(next,'success');
   expect((await db.latestEligible([s]))[0]).toMatchObject({batch_id:next,version:2});
  });

  it('write / evidence need a RUNNING batch (review R2): finished batches take neither; unknown batches are invalid_batch',async()=>{
   const s=sid();await catalog([testDef(s)]);const b=await h.batch();const r=await retrieval(b,T1);
   await h.finish(b,'success');
   expect(await outcome(db.writeObservations(b,'c',[nativeRow(s,'2026-08-31','4.1',r,T1)]))).toBe('rpc_failed:batch_not_running');
   expect(await outcome(retrieval(b,T1))).toBe('rpc_failed:batch_not_running');
   const ghost=randomUUID();
   expect(await outcome(db.writeObservations(ghost,'c',[]))).toBe('rpc_failed:invalid_batch');
   expect(await outcome(retrieval(ghost,T1))).toBe('rpc_failed:invalid_batch');
   const failed=await h.batch();await h.finish(failed,'failed');
   expect(await outcome(db.writeObservations(failed,'c',[]))).toBe('rpc_failed:batch_not_running');
   expect(await h.peek(s,'2026-08-31')).toEqual([]);
  });

  it('claimIngest validates its batch (invalid_batch): unknown, another dataset, finished; an aborted run is never resurrected',async()=>{
   const ds=`macro.t${randomBytes(4).toString('hex')}`;
   expect(await outcome(db.claimIngest(randomUUID(),ds,LEASE))).toBe('rpc_failed:invalid_batch');
   expect(await outcome(db.claimIngest(await h.batch('macro.other'),ds,LEASE))).toBe('rpc_failed:invalid_batch');
   const done=await h.batch(ds);await h.finish(done,'success');
   expect(await outcome(db.claimIngest(done,ds,LEASE))).toBe('rpc_failed:invalid_batch');     // never reopens a finished batch
   const old=await h.batch(ds);
   const t0=(await db.claimIngest(old,ds,{...LEASE,processingTimeoutMs:1})).ownerToken!;
   await db.claimChunk(old,0,1,t0);
   const next=await h.batch(ds);
   let c=await db.claimIngest(next,ds,{...LEASE,takeover:true});
   for(let i=0;i<200&&c.status==='busy';i++){await new Promise(r=>setTimeout(r,10));c=await db.claimIngest(next,ds,{...LEASE,takeover:true});}   // wait out the 1 ms processing timeout
   expect(c).toMatchObject({status:'claimed',aborted:[old]});                                  // the stalled chunk aborts the run of `old`
   expect((await db.ingestRun(old))?.state).toBe('aborted');
   const f=await db.beginFinish(next,0,c.ownerToken!);
   if(f.status!=='finishing')throw new Error('unreachable');
   await db.recordFinishStep(next,'receipt',{status:'success'},{ownerToken:c.ownerToken!,finishToken:f.finishToken});   // releases the lease
   expect(await outcome(db.claimIngest(old,ds,LEASE))).toMatch(/^rpc_failed:.*duplicate key/);   // old's batch still runs, but its aborted run stays aborted
   expect((await db.ingestRun(old))?.state).toBe('aborted');
  });

  it('publication fence and cursor (review A2/A4/R3): a rotated-out finish token cannot publish; a publish key is region-bound; created_at strictly increases across regions',async()=>{
   const ds=`macro.t${randomBytes(4).toString('hex')}`;
   const {v,id}=await seeded();const cn=sid('C');const cv=await catalog([testDef(cn,{region:'CN'})]);
   const b=await h.batch(ds);const t=(await db.claimIngest(b,ds,LEASE)).ownerToken!;
   const f1=await db.beginFinish(b,0,t);const f2=await db.beginFinish(b,0,t);
   if(f1.status!=='finishing'||f2.status!=='finishing')throw new Error('unreachable');
   const key=`ingest:${randomUUID()}`;
   const base={...input('US',await db.publishState('US'),v,[id]),publishKey:key,batchId:b,ownerToken:t};
   expect(await outcome(db.publishSnapshot({...base,finishToken:f1.finishToken}))).toBe('fenced:fenced');      // rotated out
   expect(await outcome(db.publishSnapshot({...base,finishToken:null}))).toBe('fenced:fenced');              // missing
   const ok=await db.publishSnapshot({...base,finishToken:f2.finishToken});
   expect(ok.replayed).toBe(false);
   // R3: a stored key replays only for its own region
   expect(await outcome(db.publishSnapshot({...input('CN',await db.publishState('CN'),cv,[]),publishKey:key}))).toBe('invalid_manifest:invalid_manifest');
   expect(await db.publishSnapshot({...input('US',await db.publishState('US'),v,[id]),publishKey:key})).toEqual({...ok,replayed:true});
   // A4: strictly increasing, in commit order, across regions (publish, republish, failed)
   const p2=await db.publishSnapshot(input('CN',await db.publishState('CN'),cv,[]));
   const p3=await db.publishSnapshot(input('US',await db.publishState('US'),v,[id]));
   const cst=await db.publishState('CN');
   const p4=await db.republishSnapshot(p2.snapshot_id,cst.revision,cst.inputRevision);
   const failed=await db.recordFailedSnapshot({region:'US',asOf:'2026-11-06',methodologyVersion:'macro-method/1.0',catalogVersion:v,reason:'x'});
   const at=async(snapshotId:string)=>(await db.snapshot(snapshotId))!.created_at;
   const stamps=[await at(ok.snapshot_id),await at(p2.snapshot_id),await at(p3.snapshot_id),await at(p4.snapshot_id),await at(failed)];
   for(let i=1;i<stamps.length;i++)expect(stamps[i]>stamps[i-1]).toBe(true);
  });

  it('partial batches are publishable; a derived chain deeper than 8 raises ancestry_too_deep (review R4)',async()=>{
   const s=sid();const v=await catalog([testDef(s)]);const b=await h.batch();
   await db.writeObservations(b,'c',[nativeRow(s,'2026-09-30','4.1',await retrieval(b,T2),T2)]);
   const id=(await h.peek(s,'2026-09-30'))[0].observation_id;
   expect(await outcome(db.publishSnapshot(input('US',await db.publishState('US'),v,[id])))).toBe('invalid_manifest:invalid_manifest');   // still running
   await h.finish(b,'partial');
   expect((await db.publishSnapshot(input('US',await db.publishState('US'),v,[id]))).replayed).toBe(false);
   const chain=Array.from({length:10},()=>sid('D'));
   await catalog(chain.map((c,i)=>testDef(c,{derive:{kind:'month_end',from:i===0?s:chain[i-1]}})));
   const d=await h.batch();const ids:string[]=[];let prev=id;
   for(let i=0;i<9;i++){
    expect((await db.writeObservations(d,'c',[derivedRow(chain[i],'2026-09-30','4.1',[prev],T2)])).inserted).toBe(1);
    prev=(await h.peek(chain[i],'2026-09-30'))[0]?.observation_id;ids.push(prev);
   }
   expect(await outcome(db.writeObservations(d,'c',[derivedRow(chain[9],'2026-09-30','4.1',[prev],T2)]))).toBe('rpc_failed:ancestry_too_deep');
   await h.finish(d,'success');
   expect(await outcome(db.publishSnapshot(input('US',await db.publishState('US'),v,[ids[8]])))).toBe('rpc_failed:ancestry_too_deep');
   expect((await db.publishSnapshot(input('US',await db.publishState('US'),v,[ids[7]]))).replayed).toBe(false);   // 8 levels walk completely
  });
 });
}
