// src/lib/industry/db.test.ts
// memoryIndustryDb against the shared contract, memory-only helpers (clock, decimal product, pruning,
// seeded valuations), licence keys, error mapping, and the supabaseIndustryDb wiring (rpc names and
// p_ arguments, chunking, paging, normalisation) over a stub client.
import {randomBytes,randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {TableClient} from '../db/table-client';
import type {ScopeRow} from '../facts/types';
import {IndustryDbError,STAGE_CHUNK,supabaseIndustryDb,toIndustryDbError} from './db';
import {cell,industryDbContract,mark,newRun,nodes,sha,sourceInput,threeRows} from './db-contract';
import {DATASET_KEYS,DEFAULT_LICENSES,isDatasetKey,isLicensedStatus,schemeDatasetKey} from './licenses';
import {memoryIndustryDb,mulDecimalText,trimScale} from './memory-industry-db';
import type {SchemeVersion,ValuationCellRow,ValuationRunRow} from './types';

const hex=(n:number)=>randomBytes(n).toString('hex');
const scopeRow=(issuer_id:string,state_rev:number):ScopeRow=>({issuer_id,market:'CN',reasons:[],priority:1,fetch_key:'k',next_due_at:'2026-01-01T00:00:00.000Z',lease_until:null,lease_batch_id:null,state_rev,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});

industryDbContract('memoryIndustryDb contract',async()=>{
 const scope=new Map<string,number>();
 // the injected tables stand for the schema's foreign keys: issuers, ingest_batches and stocks_universe are populated by the harness
 const tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id'],ingest_batches:['batch_id'],stocks_universe:['ticker']});
 const db=memoryIndustryDb({tables,facts:{scopeAll:async()=>[...scope].map(([i,r])=>scopeRow(i,r))}});
 let offset=0;
 const make=async(table:string,key:string,value:string)=>{await tables.insert(table,{[key]:value});return value;};
 return {db,tables:db.tables,actor:async()=>randomUUID(),issuer:()=>make('issuers','issuer_id',randomUUID()),batch:()=>make('ingest_batches','batch_id',randomUUID()),ticker:()=>make('stocks_universe','ticker',`ZZ${hex(4).toUpperCase()}`),
  version:async()=>{const v=`t${hex(4)}`;db.seedLicense(`scheme:sw2021:${v}`,'internal');return v;},
  factScope:async(i,rev)=>{scope.set(i,rev);},
  ageManifest:async(_hash,seconds)=>{offset+=seconds*1000;db.setNow(new Date(Date.now()+offset).toISOString());}};
});

describe('licences',()=>{
 it('four dataset keys with the migration defaults; scheme keys only for the loaded versions',()=>{
  expect(DATASET_KEYS).toEqual(['scheme:sw2021:2021','scheme:sic:sec-current','marks:tushare-daily_basic','official:tushare-sw_daily']);
  expect(DATASET_KEYS.filter(k=>DEFAULT_LICENSES[k]==='public')).toEqual(['scheme:sic:sec-current']);
  expect(schemeDatasetKey('sw2021','2021')).toBe('scheme:sw2021:2021');
  expect(schemeDatasetKey('sic','sec-current')).toBe('scheme:sic:sec-current');
  expect(()=>schemeDatasetKey('sw2021','sec-current')).toThrow('invalid_scheme_version');
  expect(isDatasetKey('marks:tushare-daily_basic')).toBe(true);expect(isDatasetKey('scheme:sw2014:2014')).toBe(false);
  expect(isLicensedStatus('public')).toBe(true);expect(isLicensedStatus('open')).toBe(false);
 });
});

describe('toIndustryDbError',()=>{
 it('maps the code-as-message convention, 23P01 and 42501',()=>{
  for(const c of ['membership_conflict','same_day_change','incomplete_run','obsolete_run','dependencies_incomplete','dependency_regression','pairs_mismatch','illegal_transition','run_not_building','fetch_event_payload_changed'] as const)
   expect(toIndustryDbError({message:`${c}: detail`,code:'P0001'})).toMatchObject({name:'IndustryDbError',code:c});
  expect(toIndustryDbError({message:'membership_overlap: x',code:'23P01'}).code).toBe('membership_overlap');
  expect(toIndustryDbError({message:'conflicting key value violates exclusion constraint',code:'23P01'}).code).toBe('membership_overlap');
  expect(toIndustryDbError({message:'permission denied for table industry_metrics',code:'42501'})).toMatchObject({code:'unknown',message:'permission_denied'});
  expect(toIndustryDbError({message:'append_only: illegal_transition active -> building',code:'23514'}).code).toBe('unknown');
  expect(toIndustryDbError({message:'run_not_found',code:'P0002'})).toMatchObject({code:'unknown',message:'run_not_found'});
  const e=new IndustryDbError('obsolete_run');expect(toIndustryDbError(e)).toBe(e);
 });
});

describe('memoryIndustryDb specifics',()=>{
 it('multiplies decimals with PostgreSQL scale rules and trims scale like trim_scale',()=>{
  expect(mulDecimalText('10.50','1000')).toBe('10500.00');expect(mulDecimalText('0.5','0.25')).toBe('0.125');
  expect(mulDecimalText('12345678901234567890','2')).toBe('24691357802469135780');expect(mulDecimalText('1.5','-2')).toBe('-3.0');
  expect(trimScale('10.500')).toBe('10.5');expect(trimScale('-0.0')).toBe('0');expect(trimScale('007')).toBe('7');
 });
 it('activation uses the injected clock; rows and run share one instant',async()=>{
  const db=memoryIndustryDb();const v=`t${hex(3)}`;db.seedLicense(`scheme:sw2021:${v}`,'internal');
  db.setNow('2026-11-06T23:59:59.000Z');
  await db.upsertClassifications('b',nodes(v));
  const {runId}=await db.createMetricRun(newRun(v,'b',{expected_grid:{codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count']}}));
  await db.stageMetricRows(runId,[cell({metric:'member_count',period_end:'2024-12-31',n_members:0})]);
  db.setNow('2026-11-07T00:00:01.000Z');
  const {activatedAt}=await db.activateMetricRun(runId);
  expect(activatedAt).toBe('2026-11-07T00:00:01.000Z');
  expect((await db.metricRun(runId))!.created_at).toBe('2026-11-06T23:59:59.000Z');
  expect((await db.metricRowsOfRun(runId)).map(c=>c.updated_at)).toEqual([activatedAt]);
 });
 it('quarantine items of a call that fails are not written',async()=>{
  const db=memoryIndustryDb();const t='ZZMEM';
  const e1=await db.beginFetchEvent('marks',{},'b');await db.applyObservations('marks',e1,[mark(t,'1')]);
  const e2=await db.beginFetchEvent('marks',{},'b');
  await expect(db.applyObservations('marks',e2,[mark(t,'2'),{...mark(t,'0'),trade_date:'2001-01-06'}])).rejects.toMatchObject({code:'unknown',message:'security_marks_close_check'});
  expect(await db.tables.select('dq_quarantine',{reason_code:'mark_revised'})).toEqual([]);
  expect((await db.currentMarksOn('2001-01-05',[t])).map(m=>m.close)).toEqual(['1']);
 });
 it('pruneRuns keeps the newest superseded runs per family and clears reused_from_run of pruned runs',async()=>{
  const db=memoryIndustryDb();const v=`t${hex(3)}`;
  await db.upsertClassifications('b',nodes(v));
  const grid={codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count' as const]};
  const ids:string[]=[];
  for(let i=0;i<4;i++){
   const {runId}=await db.createMetricRun(newRun(v,'b',{expected_grid:grid,reused_from_run:ids.at(-1)??null}));
   await db.stageMetricRows(runId,[cell({metric:'member_count',period_end:'2024-12-31',n_members:0})]);
   await db.activateMetricRun(runId);ids.push(runId);
  }
  expect(await db.pruneRuns(1)).toBe(2);                                            // superseded: gen 1..3; keep gen 3
  expect(await db.metricRun(ids[0])).toBeNull();expect(await db.metricRun(ids[1])).toBeNull();
  expect((await db.metricRun(ids[2]))!.reused_from_run).toBeNull();
  expect((await db.metricRun(ids[3]))!.status).toBe('active');
  await expect(db.pruneRuns(0)).rejects.toMatchObject({message:'invalid_keep'});
 });
 it('observation writes are atomic with their quarantine items: a failing filing rolls the call back and a retry applies it once',async()=>{
  const base=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset']});let failFiling=true;
  const tables:TableClient={...base,insert:async(t,row)=>{if(t==='dq_quarantine'&&failFiling){failFiling=false;throw new Error('filing_failed');}return base.insert(t,row);}};
  const db=memoryIndustryDb({tables});const t='ZZATOM';
  const e1=await db.beginFetchEvent('marks',{},'b');await db.applyObservations('marks',e1,[mark(t,'1')]);
  const e2=await db.beginFetchEvent('marks',{},'b');
  await expect(db.applyObservations('marks',e2,[mark(t,'2')])).rejects.toThrow('filing_failed');
  expect((await db.currentMarksOn('2001-01-05',[t])).map(m=>m.close)).toEqual(['1']);                       // the revision was not installed
  expect(db.marks().filter(m=>m.status==='superseded')).toEqual([]);
  expect(await db.applyObservations('marks',e2,[mark(t,'2')])).toEqual({inserted:0,duplicates:0,superseded:1});   // no receipt was left: the retry is a normal revision
  expect(await tables.select('dq_quarantine',{reason_code:'mark_revised',status:'open'})).toHaveLength(1);
 });
 it('a call revising two marks whose SECOND filing fails leaves no open item behind; the retry files exactly one open item per revision (batch 1 Codex review)',async()=>{
  const base=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset']});let filings=0,failAt=2;
  const tables:TableClient={...base,insert:async(t,row)=>{if(t==='dq_quarantine'){filings++;if(filings===failAt)throw new Error('filing_failed');}return base.insert(t,row);}};
  const db=memoryIndustryDb({tables});const a='ZZTWOA',b='ZZTWOB';
  const e1=await db.beginFetchEvent('marks',{},'b');await db.applyObservations('marks',e1,[mark(a,'1'),mark(b,'1')]);
  const e2=await db.beginFetchEvent('marks',{},'b');
  await expect(db.applyObservations('marks',e2,[mark(a,'2'),mark(b,'2')])).rejects.toThrow('filing_failed');
  expect(await tables.select('dq_quarantine',{reason_code:'mark_revised',status:'open'})).toEqual([]);          // the first item was compensated
  expect((await db.currentMarksOn('2001-01-05',[a,b])).map(m=>m.close).sort()).toEqual(['1','1']);
  failAt=-1;
  expect(await db.applyObservations('marks',e2,[mark(a,'2'),mark(b,'2')])).toEqual({inserted:0,duplicates:0,superseded:2});
  const open=await tables.select('dq_quarantine',{reason_code:'mark_revised',status:'open'});
  expect(open.map(r=>r.natural_key).sort()).toEqual([`${a}:2001-01-05`,`${b}:2001-01-05`]);
 });
 it('foreign keys are mirrored once the injected tables hold rows: unknown issuer, ticker and batch are refused; empty tables are not authoritative',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset']});
  const db=memoryIndustryDb({tables});
  await db.applyObservations('marks',await db.beginFetchEvent('marks',{},'b'),[mark('ZZANY','1')]);        // stocks_universe empty: accepted
  await tables.insert('stocks_universe',{ticker:'ZZKNOWN'});
  const e=await db.beginFetchEvent('marks',{},'b');
  await expect(db.applyObservations('marks',e,[mark('ZZKNOWN','1',{trade_date:'2001-02-01'}),mark('ZZOTHER','1',{trade_date:'2001-02-01'})])).rejects.toMatchObject({code:'unknown',message:'security_marks_ticker_fkey'});
  expect(await db.currentMarksOn('2001-02-01',['ZZKNOWN'])).toEqual([]);                                  // mixed batch: nothing written
  await tables.insert('ingest_batches',{batch_id:'known-batch'});
  await expect(db.createMetricRun(newRun('v','other-batch'))).rejects.toMatchObject({message:'invalid_batch'});
  await tables.insert('issuers',{issuer_id:'known-issuer'});
  await expect(db.applyMemberships('known-batch','other-issuer','sw2021','2021',[],[],{})).rejects.toMatchObject({message:'issuer_not_found'});
 });
 it('pruneRuns never prunes a run cited by a judgment (table present in the injected tables, like the SQL function)',async()=>{
  const tables=memoryTableClient({dq_quarantine:['id'],dq_freshness:['dataset']});
  const db=memoryIndustryDb({tables});const v=`t${hex(3)}`;
  await db.upsertClassifications('b',nodes(v));
  const grid={codes:['A1'],period_ends:['2024-12-31'],metrics:['member_count' as const]};
  const ids:string[]=[];
  for(let i=0;i<4;i++){
   const {runId}=await db.createMetricRun(newRun(v,'b',{expected_grid:grid}));
   await db.stageMetricRows(runId,[cell({metric:'member_count',period_end:'2024-12-31',n_members:0})]);
   await db.activateMetricRun(runId);ids.push(runId);
  }
  await tables.insert('judgments',{id:'j1',evidence:{run:ids[0]}});
  expect(await db.pruneRuns(1)).toBe(1);                                                                  // gen 1 is cited; gen 2 goes; gen 3 is kept
  expect((await db.metricRun(ids[0]))!.status).toBe('superseded');expect(await db.metricRun(ids[1])).toBeNull();expect(await db.metricRun(ids[2])).not.toBeNull();
 });
 it('seeded valuation runs: activeValuationRun and publishedValuations return published rows only',async()=>{
  const db=memoryIndustryDb();
  const run:ValuationRunRow={run_id:'vr',scheme:'sw2021',version:'2021',level:1,generation:1,method_version:'industry-val/1.0',config_hash:'c',formula_version:'f',code_version:'x',expected_dates:['2024-12-31'],
   comparator_basis:'ttm',recompute_from:'2024-01-01',carried_from_run:null,fingerprint_at:'2026-11-06T00:00:00.000Z',batch_id:'b',status:'active',reconciliation:{},created_at:'2026-11-06T00:00:00.000Z',published_at:'2026-11-06T00:00:00.000Z',activated_at:'2026-11-06T00:00:00.000Z'};
  const row=(code:string,published:boolean):ValuationCellRow=>({run_id:'vr',scheme:'sw2021',version:'2021',code,trade_date:'2024-12-31',metric:'pb',status:'ok',missing_reason:null,value:'1.5',facts_as_of:'2024-12-31',n_members:3,n_with_data:3,n_unresolved:0,mcap_coverage:'1',manifest_hash:null,updated_at:'2026-11-06T00:00:00.000Z',series_qualified:published,published});
  db.seedValuationRun(run,[row('A1',true),row('B1',false)]);
  expect((await db.activeValuationRun('sw2021','2021',1))!.run_id).toBe('vr');
  expect((await db.publishedValuations('vr',{})).map(r=>r.code)).toEqual(['A1']);
  expect(await db.publishedValuations('vr',{from:'2025-01-01'})).toEqual([]);
 });
});

describe('supabaseIndustryDb',()=>{
 type Call={fn:string;args:Record<string,unknown>};
 type Op=[string,unknown[]];
 type FromResponder=(table:string,ops:Op[])=>unknown[];
 const builder=(table:string,respond:FromResponder)=>{
  const ops:Op[]=[];
  const proxy:Record<string|symbol,unknown>=new Proxy({},{get:(_t,m)=>m==='then'
   ?(res:(v:unknown)=>unknown,rej:(e:unknown)=>unknown)=>Promise.resolve({data:respond(table,ops),error:null}).then(res,rej)
   :(...a:unknown[])=>{ops.push([String(m),a]);return proxy;}});
  return proxy;
 };
 const stub=(respond:(fn:string,args:Record<string,unknown>)=>{data?:unknown;error?:{message:string;code?:string}|null},from:FromResponder=()=>{throw new Error('from() not expected');})=>{
  const calls:Call[]=[];const pages:{table:string;ops:Op[]}[]=[];
  const client={rpc:async(fn:string,args:Record<string,unknown>)=>{calls.push({fn,args});const r=respond(fn,args);return {data:r.data??null,error:r.error??null};},
   from:(table:string)=>builder(table,(t,ops)=>{pages.push({table:t,ops});return from(t,ops);})};
  return {calls,pages,db:supabaseIndustryDb(client as unknown as SupabaseClient)};
 };
 it('calls the write functions with p_ arguments and normalises their jsonb results',async()=>{
  const {calls,db}=stub(fn=>({data:fn==='apply_industry_memberships'?{inserted:3,closed:0,superseded:1,duplicates:0,membership_ids:['m1','m2','m3']}
   :fn==='apply_sic_memberships'?{outcome:'changed',membership_id:'m'}:fn==='create_industry_metric_run'?{run_id:'r',generation:'7'}
   :fn==='activate_industry_metric_run'?{activated_at:'2026-11-07T00:00:00.123456+00:00'}:fn==='industry_state_fingerprint'?{taken_at:'2026-11-07T00:00:00+00:00',revs:[{issuer_id:'i',state_rev:'4'}]}
   :fn==='upsert_industry_source_memberships'?{inserted:1,superseded:1,duplicates:0,changed:[{old_id:'o',new_id:'n',null_to_date:true}]}
   :fn==='industry_freshness'?[{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:'2026-11-06T00:00:00+00:00'}]:true}));
  expect(await db.applyMemberships('b','i','sw2021','2021',threeRows('s'),['s'],{method:'today'})).toEqual({inserted:3,closed:0,superseded:1,duplicates:0,membership_ids:['m1','m2','m3']});
  expect(calls.at(-1)).toEqual({fn:'apply_industry_memberships',args:{p_batch:'b',p_issuer:'i',p_scheme:'sw2021',p_version:'2021',p_rows:threeRows('s'),p_source_ids:['s'],p_resolution:{method:'today'}}});
  expect(await db.applySicMembership('b','i','2026-01-05','3571',{raw_hash:'h'},{leaseBatch:'b'})).toBe('changed');
  expect(calls.at(-1)!.args).toEqual({p_batch:'b',p_issuer:'i',p_version:'sec-current',p_observed:'2026-01-05',p_code:'3571',p_provenance:{raw_hash:'h'},p_lease_batch:'b',p_sec_submissions:null});
  const run=newRun('2021','b');
  expect(await db.createMetricRun(run)).toEqual({runId:'r',generation:7});
  expect(calls.at(-1)).toEqual({fn:'create_industry_metric_run',args:{p:{scheme:'sw2021',version:'2021',level:1,facts_as_of:'2025-03-31',knowledge_date:'2025-03-31',history_class:'reconstruction',method_version:'industry-agg/1.0',
   config_hash:'c'.repeat(64),formula_version:'derive/1',code_version:'test',expected_grid:run.expected_grid,fingerprint_at:'2026-11-06T00:00:00.000Z',reused_from_run:null,batch_id:'b'}}});
  expect(await db.activateMetricRun('r')).toEqual({activatedAt:'2026-11-07T00:00:00.123Z'});
  const f=await db.stateFingerprint('CN');expect(f.takenAt).toBe('2026-11-07T00:00:00.000Z');expect([...f.revs]).toEqual([['i',4]]);
  expect(calls.at(-1)).toEqual({fn:'industry_state_fingerprint',args:{p_market:'CN'}});
  const src=sourceInput();
  expect(await db.upsertSourceMemberships('b',[src])).toEqual({inserted:1,superseded:1,duplicates:0,changed:[{old_id:'o',new_id:'n',nullToDate:true}]});
  expect(calls.at(-1)).toEqual({fn:'upsert_industry_source_memberships',args:{p_batch:'b',p_rows:[{...src}]}});
  expect(await db.freshness()).toEqual([{dataset:'industry.agg.sw2021',status:'fresh',last_ok_at:'2026-11-06T00:00:00.000Z'}]);
  await db.failRun('valuation','r','x');expect(calls.at(-1)).toEqual({fn:'fail_industry_run',args:{p_kind:'valuation',p_run:'r',p_reason:'x'}});
  await db.setDatasetLicense('scheme:sw2021:2021','public','admin@x',null);expect(calls.at(-1)).toEqual({fn:'set_industry_dataset_license',args:{p_key:'scheme:sw2021:2021',p_status:'public',p_by:'admin@x',p_note:null}});
  expect(await db.registerManifest(sha(),'aggregate',10)).toBe(true);expect(calls.at(-1)!.fn).toBe('put_industry_manifest');
  await db.pruneRuns(12);expect(calls.at(-1)).toEqual({fn:'prune_industry_runs',args:{p_keep:12}});
 });
 it('chunks staging and observations at STAGE_CHUNK rows and sums the results; an empty stage still calls once',async()=>{
  const {calls,db}=stub((fn,args)=>({data:fn==='apply_observations'?{inserted:(args.p_rows as unknown[]).length,duplicates:0,superseded:0}:(args.p_rows as unknown[]).length}));
  const rows=Array.from({length:1200},(_,i)=>cell({metric:'member_count',period_end:`2024-12-31`,code:`C${i}`}));
  expect(await db.stageMetricRows('r',rows)).toBe(1200);
  expect(calls.map(c=>[c.fn,(c.args.p_rows as unknown[]).length])).toEqual([['stage_industry_metrics',STAGE_CHUNK],['stage_industry_metrics',STAGE_CHUNK],['stage_industry_metrics',200]]);
  expect((calls[0].args.p_rows as Record<string,unknown>[])[0]).toEqual({code:'C0',metric:'member_count',period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',status:'missing',missing_reason:'empty_set',value:null,unit:'count',n_members:2,n_with_data:0,n_unresolved:0,manifest_hash:null});
  expect(await db.stageMetricRows('r',[])).toBe(0);expect(calls.at(-1)).toEqual({fn:'stage_industry_metrics',args:{p_run:'r',p_rows:[]}});
  const marks=Array.from({length:501},(_,i)=>mark(`T${i}`,'1'));
  expect(await db.applyObservations('marks','e',marks)).toEqual({inserted:501,duplicates:0,superseded:0});
  expect(calls.slice(-2).map(c=>[c.fn,c.args.p_kind,c.args.p_fetch_event,(c.args.p_rows as unknown[]).length])).toEqual([['apply_observations','marks','e',500],['apply_observations','marks','e',1]]);
 });
 it('pages complete-set reads past max_rows with the filters in the query, reading decimals from *_text columns',async()=>{
  const membership=(i:number)=>({membership_id:`m${i}`,issuer_id:'i',scheme:'sw2021',version:'2021',code:'A1',level:1,valid_from:'2021-07-30',valid_to:null,available_date:'2021-07-30',valid_to_available_date:null,source:'s',source_membership_id:null,batch_id:'b',status:'ok',superseded_by:null,provenance:{availability:'effective_date_assumed'}});
  const {pages,db}=stub(()=>({data:null}),(table,ops)=>{
   const [from,to]=ops.find(o=>o[0]==='range')![1] as [number,number];
   if(table==='issuer_industry_memberships')return Array.from({length:Math.max(0,Math.min(1001,to+1)-from)},(_,i)=>membership(from+i));
   if(table==='security_marks')return [{observation_id:'o',ticker:'000001.SZ',trade_date:'2024-12-31',fetch_event_id:'e',observed_at:'2025-01-01T00:00:00.5+00:00',close:10.5,total_share:1000,market_cap:10500,close_text:'10.50',total_share_text:'1000',market_cap_text:'10500.00',source:'s',upstream:'szse',raw_hash:'h',locator:{},batch_id:'b',status:'ok',supersedes:null}];
   if(table==='industry_metrics')return [{run_id:'r',code:'A1',metric:'roe',period_start:'2024-01-01',period_end:'2024-12-31',duration:'TTM',status:'ok',missing_reason:null,value:0.1234567891,value_text:'0.1234567891',unit:'ratio',n_members:'3',n_with_data:3,n_unresolved:0,manifest_hash:'m',updated_at:'2025-01-01T00:00:00+00:00'}];
   if(table==='industry_source_memberships')return [{id:'s1',ts_code:'000001.SZ',in_date:'2021-07-30',out_date:null},{id:'s2',ts_code:'000001.SZ',in_date:'2021-08-02',out_date:null}];
   return [];
  });
  expect(await db.membershipCandidates({scheme:'sw2021',version:'2021',code:'A1',level:1,on:'2024-12-31'})).toHaveLength(1001);
  expect(pages.map(p=>p.ops.find(o=>o[0]==='range')![1])).toEqual([[0,999],[1000,1999]]);
  expect(pages[0].ops).toEqual(expect.arrayContaining([['eq',['code','A1']],['eq',['level',1]],['lte',['valid_from','2024-12-31']],['order',['issuer_id']]]));
  await db.membershipsOfIssuer('i',{on:'2024-12-31'});
  expect(pages.at(-1)!.ops).toEqual(expect.arrayContaining([['lte',['valid_from','2024-12-31']],['or',['valid_to.is.null,valid_to.gt.2024-12-31']]]));
  expect((await db.currentMarksOn('2024-12-31',['000001.SZ']))[0]).toMatchObject({close:'10.50',total_share:'1000',market_cap:'10500.00',observed_at:'2025-01-01T00:00:00.500Z'});
  expect((await db.metricRowsOfRun('r',{metrics:['roe']}))[0]).toMatchObject({value:'0.1234567891',n_members:3,updated_at:'2025-01-01T00:00:00.000Z'});
  expect(pages.at(-1)!.ops).toEqual(expect.arrayContaining([['in',['metric',['roe']]]]));
  expect(await db.unresolvedCount({code:'A1',level:2,on:'2024-12-31',knownBy:'2024-06-30'})).toBe(1);
  expect(pages.filter(p=>p.table==='industry_security_delistings').at(-1)!.ops).toEqual(expect.arrayContaining([['lte',['delist_date','2024-12-31']]]));   // K4: delisted ts_codes are filtered
  expect(pages.filter(p=>p.table==='industry_source_memberships').at(-1)!.ops).toEqual(expect.arrayContaining([['eq',['l2_code','A1']],['is',['issuer_id',null]],['lte',['in_date','2024-06-30']],['or',['out_date.is.null,out_date.gte.2024-12-31']]]));
 });
 it('quarantineMembershipLineage calls the rpc with p_ arguments and normalises its result',async()=>{
  const {calls,db}=stub(()=>({data:{quarantined:2,membership_ids:['m1','m2']}}));
  expect(await db.quarantineMembershipLineage('b','sw2021','2021',['s1'],'no_issuer')).toEqual({quarantined:2,membership_ids:['m1','m2']});
  expect(calls.at(-1)).toEqual({fn:'quarantine_industry_membership_lineage',args:{p_batch:'b',p_scheme:'sw2021',p_version:'2021',p_sources:['s1'],p_reason:'no_issuer'}});
 });
 it('maps PostgREST errors to IndustryDbError codes',async()=>{
  const {db}=stub(fn=>({error:fn==='activate_industry_metric_run'?{message:'dependency_regression',code:'P0001'}:fn==='apply_industry_memberships'?{message:'membership_overlap: x',code:'23P01'}:{message:'permission denied for function x',code:'42501'}}));
  await expect(db.activateMetricRun('r')).rejects.toMatchObject({name:'IndustryDbError',code:'dependency_regression'});
  await expect(db.applyMemberships('b','i','sw2021','2021' as SchemeVersion,[],[],{})).rejects.toMatchObject({code:'membership_overlap'});
  await expect(db.pruneRuns(1)).rejects.toMatchObject({code:'unknown',message:'permission_denied'});
 });
});
