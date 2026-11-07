// src/lib/dq/dq-extensions.integration.test.ts
// F3-4 (plan 3 spec §3.2, §9.2): migration 20261107091000 on real PostgreSQL — filings acceptance
// columns and set_filing_acceptance, financial_metrics.based_on_lineage (upgrade + replay),
// read_filing_facts, read_facts_lineage (and read_facts as a wrapper with identical output),
// replace_financial_metrics_lineage (and its wrapper), set_merge / set_dissolved with the topology
// guard (S1, R3), fact_promote_rows predicates on every promotion entry (T6), adopt_candidate (T1,
// T5, U3), restore_reconciled (R1), resolve_lineage_conflict, the reconcile cursor and
// apply_reconcile_result (T2), grants. Every test owns its issuers (and its `test.<hex>` pair), so
// suites running in parallel on the shared database never meet.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import {pgFactsDb} from '../facts/pg-facts-db';
import {FORMULA_VERSION,materialize} from '../facts/derive';
import {resolveFactsItem} from './facts-resolver';
import {computeFreshness} from './freshness';
import type {Cadence} from './freshness';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'; set local deadlock_timeout='50ms'; select pg_advisory_xact_lock(hashtext('test:migration-replay'));\n${sql}\n;commit;`);return;}
  catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
/** body inside one transaction that is ALWAYS rolled back; retried on lock timeout / deadlock (body must be repeatable). */
async function inRolledBackTx(pool:Pool,body:(c:PoolClient)=>Promise<void>,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s'`);await body(c);return;}
  catch(e){
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{await c.query('rollback').catch(()=>{});c.release();}
 }
}
interface Tx{c:PoolClient;pid:number;commit():Promise<void>}
async function inTx(pool:Pool,body:(tx:Tx)=>Promise<void>):Promise<void>{
 const c=await pool.connect();let open=false;let broken:Error|undefined;
 try{
  await c.query('begin');open=true;
  const pid=Number((await c.query('select pg_backend_pid() p')).rows[0].p);
  await body({c,pid,commit:async()=>{await c.query('commit');open=false;}});
 }finally{
  if(open)await c.query('rollback').catch(e=>{broken=e as Error;});
  c.release(broken);
 }
}
async function stillBlockedBehind(pool:Pool,pid:number,p:Promise<unknown>):Promise<void>{
 let settled=false;p.then(()=>{settled=true;},()=>{settled=true;});
 for(const deadline=Date.now()+3000;;){
  const n=Number((await pool.query(`select count(*)::int n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`,[pid])).rows[0].n);
  if(n>=1)break;
  if(settled||Date.now()>deadline)throw new Error(`no backend blocked behind pid ${pid} (settled=${settled})`);
  await new Promise(r=>setTimeout(r,20));
 }
 expect(settled).toBe(false);
}
type PgErr={message:string;code?:string};
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string;mapping_version?:string};
type Envelope={state_rev:number;rows:Record<string,unknown>[];truncated:boolean;row_count:number};
type LineageEnvelope={state_revs:{issuer_id:string;state_rev:number}[];lineage:string[];rows:Record<string,unknown>[];conflicts:{key:Record<string,string|null>;available_date:string;fact_ids:string[]}[];truncated:boolean;row_count:number};

describe.skipIf(!enabled)('F3-4 facts extensions migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async(name='ZZ Ext Test')=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,$2)`,[id,name]);return id;};
 const user=async()=>{const id=randomUUID();await q(`insert into auth.users(id,email) values($1,$2)`,[id,`${id}@ext.test`]);return id;};
 const batch=async(dataset='facts.us',finished=false)=>{
  const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'ext-test',$2)`,[id,dataset]);
  if(finished)await q(`update public.ingest_batches set status='success',finished_at=now() where batch_id=$1`,[id]);
  return id;
 };
 const scope=(iss:string,market='US')=>one(`select public.reconcile_fact_sync_scope($1,$2::jsonb) v`,[market,JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,market='US')=>one(`select public.claim_fact_sync_lease($1,$2,$3,600) v`,[iss,market,b]);
 const begin=(iss:string,b:string,gen=1,market='US')=>one(`select public.begin_sync_run($1,$2,$3,$4) v`,[iss,market,b,gen]);
 const filing=async(run:string,o:{available?:string;sourceRef?:string;source?:string;origin?:string;form?:string}={})=>{
  const id=randomUUID();const sourceRef=o.sourceRef??`0000${randomUUID().slice(0,6)}-24-${randomUUID().slice(0,6)}`;
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:o.source??'edgar',origin:o.origin??'sec',form_type:o.form??'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:o.available??'2024-02-01',source_ref:sourceRef,url:null}])]);
  return {id:m[sourceRef] as string,sourceRef};
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:f.mapping_version??'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return full.map(r=>r.fact_id);};
 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 const rev=(iss:string,market='US')=>one(`select public.fact_state_rev($1,$2) v`,[iss,market]).then(Number);
 const status=async(id:string)=>(await q(`select status from public.financial_facts where fact_id=$1`,[id]))[0]?.status??null;
 const merge=(s:string,t:string,by:string)=>one(`select public.set_merge($1,$2,$3) v`,[s,t,by]);
 const dissolve=(i:string,by:string)=>q(`select public.set_dissolved($1,$2)`,[i,by]);
 const lineageRead=async(issuers:string[],o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts_lineage($1::uuid[],'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[issuers,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as LineageEnvelope;
 const factsRead=async(iss:string,o:{concepts?:string[];asOf?:string;history?:boolean;limit?:number|null;nonOk?:boolean}={},client:Pool|PoolClient=admin)=>
  (await client.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,[iss,o.concepts??['revenue','total_assets'],o.asOf??'2030-01-01',o.history??true,o.limit??null,o.nonOk??false])).rows[0].v as Envelope;
 const metric=(v:string,name='gross_margin')=>({metric:name,period_start:'2023-10-01',period_end:'2023-12-31',duration:'3M',value:v,unit:'ratio',input_unit:'USD',basis:'us_standard',formula_version:'facts-derive/1.0',inputs:[],as_of:'2024-03-01'});
 /** A leased US issuer with one published gen-1 run: f0 (2024-01-01) carries r0 = revenue 90, f (2024-02-01) carries r = revenue 100, same key. state_rev 1. */
 const published=async()=>{
  const iss=await issuer();const b=await batch();expect(await scope(iss)).toBe(1);expect(await claim(iss,b)).toBe(true);
  const run=await begin(iss,b);const f0=await filing(run,{available:'2024-01-01'});const f=await filing(run);
  const [r0]=await stage(run,[{filing_id:f0.id,value:'90',available_date:'2024-01-01'}]);
  const [r]=await stage(run,[{filing_id:f.id,value:'100'}]);
  expect(await publish(run,[f0.id,f.id])).toBe(2);
  return {iss,b,run,f0:f0.id,f:f.id,fRef:f.sourceRef,r0,r};
 };
 /** Another published issuer with one revenue row on 2024-02-01 for the same key (value given). */
 const sibling=async(value:string)=>{
  const iss=await issuer();const b=await batch();await scope(iss);await claim(iss,b);
  const run=await begin(iss,b);const f=await filing(run);const [x]=await stage(run,[{filing_id:f.id,value}]);await publish(run,[f.id]);
  return {iss,b,run,f:f.id,x};
 };
 const sql=()=>readFileSync(MIGRATION,'utf8');

 beforeAll(async()=>{admin=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});});
 afterAll(async()=>{await admin?.end();});

 describe('8a: acceptance, lineage reads, lineage metrics, topology',()=>{
  it('filings.accepted_at: set once through set_filing_acceptance only; no role may write it directly; the plan-2 link columns stay writable (T11)',async()=>{
   const {iss,f}=await published();
   for(const role of ['anon','authenticated','service_role'])for(const col of ['accepted_at','acceptance_source'])
    expect({role,col,ok:await one(`select has_column_privilege($1,'public.filings',$2,'UPDATE') v`,[role,col])}).toEqual({role,col,ok:false});
   expect(await fails(q(`update public.filings set accepted_at=now(),acceptance_source='sec_submissions' where filing_id=$1`,[f]))).toMatchObject({code:'23514',message:expect.stringContaining('append_only:')});
   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','other') v`,[f]))).toMatchObject({message:'invalid_acceptance',code:'22023'});
   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[randomUUID()]))).toMatchObject({message:'filing_not_found'});
   expect(await one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[f])).toBe(true);
   expect(await one(`select public.set_filing_acceptance($1,'2024-02-01T21:05:00Z','sec_submissions') v`,[f])).toBe(false);
   expect(await fails(one(`select public.set_filing_acceptance($1,'2024-02-01T21:06:00Z','sec_submissions') v`,[f]))).toMatchObject({message:'acceptance_conflict',code:'P0001'});
   expect(await q(`select accepted_at=$2::timestamptz ok,acceptance_source from public.filings where filing_id=$1`,[f,'2024-02-01T21:05:00Z'])).toEqual([{ok:true,acceptance_source:'sec_submissions'}]);
   // value → other value, even with the function's flag on, is refused by the trigger
   await inRolledBackTx(admin,async c=>{
    await c.query(`select set_config('facts.allow_acceptance_write','on',true)`);
    await expect(c.query(`update public.filings set accepted_at=accepted_at+interval '1 second' where filing_id=$1`,[f])).rejects.toMatchObject({code:'23514'});
   });
   // pair constraint: one without the other is refused
   await inRolledBackTx(admin,async c=>{
    const run=(await c.query(`select run_id from public.filings where filing_id=$1`,[f])).rows[0].run_id;
    await expect(c.query(`insert into public.filings(filing_id,issuer_id,market,source,origin,form_type,available_date,source_ref,run_id,accepted_at) values($1,$2,'US','edgar','sec','10-K','2024-01-01',$3,$4,now())`,[randomUUID(),iss,`x-${randomUUID()}`,run])).rejects.toMatchObject({code:'23514'});
   });
   // T11: service_role still updates the three link columns; mapping_gen and url stay closed
   const c=await admin.connect();
   try{
    await c.query('set role service_role');
    expect((await c.query(`update public.filings set document_ref='doc',document_url='https://example.test/doc',link_attempts=1 where filing_id=$1`,[f])).rowCount).toBe(1);
    await expect(c.query(`update public.filings set accepted_at=null where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
    await expect(c.query(`update public.filings set mapping_gen=5 where filing_id=$1`,[f])).rejects.toThrow(/permission denied/);
   }finally{await c.query('reset role').catch(()=>{});c.release();}
   await expect(q(`update public.filings set url='x' where filing_id=$1`,[f])).rejects.toThrow(/append_only:/);
  });

  it('set_filing_acceptance refuses a non-edgar filing',async()=>{
   const iss=await issuer();const b=await batch('facts.cn');await scope(iss,'CN');await claim(iss,b,'CN');
   const run=await begin(iss,b,1,'CN');const g=await filing(run,{source:'tushare',origin:'sse',form:'annual',sourceRef:`600000.SH:20231231:1:${randomUUID().slice(0,8)}`});
   expect(await fails(one(`select public.set_filing_acceptance($1,now(),'sec_submissions') v`,[g.id]))).toMatchObject({message:'invalid_acceptance'});
  });

  it('read_filing_facts returns every generation and status of one filing with the run status; ok-only without include_non_ok; service_role only',async()=>{
   const {iss,b,f,r}=await published();
   const run2=await begin(iss,b,2);const [a2]=await stage(run2,[{filing_id:f,value:'101'}]);await publish(run2,[f]);   // r stays as gen-1 evidence
   const run3=await begin(iss,b,2);const [st]=await stage(run3,[{filing_id:f,concept:'net_income',value:'5'}]);      // staged
   const all=(await one(`select public.read_filing_facts($1,true) v`,[f])).rows as Record<string,unknown>[];
   expect(all.map(x=>[x.fact_id,x.mapping_gen,x.status,x.run_status,x.value])).toEqual([[r,1,'ok','published','100'],[st,2,'staged','staged','5'],[a2,2,'ok','published','101']]);
   const ok=(await one(`select public.read_filing_facts($1,false) v`,[f])).rows as Record<string,unknown>[];
   expect(ok.map(x=>x.fact_id)).toEqual([r,a2]);
   expect(await one(`select public.read_filing_facts($1,true) v`,[randomUUID()])).toEqual({rows:[]});
  });

  it('read_facts is a wrapper of read_facts_lineage with output identical to the plan-2 function in ok / includeNonOk / history modes (T7)',async()=>{
   const {iss,b,f}=await published();
   const run2=await begin(iss,b,2);await stage(run2,[{filing_id:f,value:'101'},{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'7'}]);await publish(run2,[f]);
   const run3=await begin(iss,b,2);const g=await filing(run3,{available:'2024-03-01'});const [qd]=await stage(run3,[{filing_id:g.id,value:'120',available_date:'2024-03-01'}]);
   const item=randomUUID();
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'same_day_conflict',$3,$4::jsonb)`,[item,`${iss}:US:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-03-01`,b,JSON.stringify({key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:'2024-03-01'},fact_ids:[qd],values:[],run_id:run3})]);
   await one(`select public.quarantine_facts($1,$2::uuid[],$3) v`,[run3,[qd],item]);await publish(run3,[g.id]);
   const run4=await begin(iss,b,2);await stage(run4,[{filing_id:g.id,concept:'total_assets',period_start:null,duration:'INSTANT',value:'8',available_date:'2024-03-01'}]);   // staged, unpublished
   const legacyText=(()=>{const s=readFileSync(PLAN2,'utf8');const start=s.indexOf('create or replace function public.read_facts(');const end=s.indexOf('\n$$;',start);return s.slice(start,end+4).replace('create or replace function public.read_facts(','create function pg_temp.read_facts_v8(');})();
   const c=await admin.connect();
   try{
    await c.query(legacyText);
    for(const o of [{history:false,nonOk:false},{history:true,nonOk:false},{history:true,nonOk:true},{history:false,nonOk:true},{history:true,nonOk:true,limit:1}]){
     const args=[iss,['revenue','total_assets'],'2030-01-01',o.history,(o as {limit?:number}).limit??null,o.nonOk];
     const legacy=(await c.query(`select pg_temp.read_facts_v8($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v as Envelope;
     const wrapped=(await c.query(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v as Envelope;
     expect(wrapped).toEqual(legacy);                                                                  // field by field
     expect((await c.query(`select pg_temp.read_facts_v8($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) = public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,$5,$6) v`,args)).rows[0].v).toBe(true);
     const lin=await lineageRead([iss],{history:o.history,nonOk:o.nonOk,limit:(o as {limit?:number}).limit??null},c);
     expect({state_rev:lin.state_revs[0].state_rev,rows:lin.rows,truncated:lin.truncated,row_count:lin.row_count}).toEqual(legacy);
     expect(lin.conflicts).toEqual([]);expect(lin.lineage).toEqual([iss]);
    }
    const nonOk=(await lineageRead([iss],{history:true,nonOk:true},c)).rows.filter(x=>x.status!=='ok');
    expect(nonOk.length).toBeGreaterThan(0);
    for(const x of nonOk)expect(x).toMatchObject({disclosure_seq:null,is_current:false,is_revision:false});
    expect((await lineageRead([iss],{history:false,nonOk:true},c)).rows.every(x=>x.status==='ok')).toBe(true);   // non-ok rows only with history
   }finally{c.release();}
  });

  it('read_facts_lineage: two members suppress a cross-issuer same-day disagreement into conflicts (ok rows only) and the earlier disclosure becomes current; equal values are no conflict; anon sees ok only',async()=>{
   const {iss:t,r0,r}=await published();
   const {iss:s,x}=await sibling('200');
   const env=await lineageRead([t,s,t],{concepts:['revenue'],history:true});
   expect(env.lineage).toEqual([t,s].sort());
   expect(env.state_revs).toEqual([t,s].sort().map(id=>({issuer_id:id,state_rev:1})));
   expect(env.conflicts).toEqual([{key:{concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD'},available_date:'2024-02-01',fact_ids:[r,x].sort()}]);
   expect(env.rows.map(y=>[y.fact_id,y.issuer_id,y.disclosure_seq,y.is_current])).toEqual([[r0,t,1,true]]);
   expect((await lineageRead([t],{concepts:['revenue'],history:false})).rows.map(y=>y.fact_id)).toEqual([r]);   // one member: no suppression
   const {iss:u,x:ux}=await sibling('100');
   const same=await lineageRead([t,u],{concepts:['revenue'],history:true});
   expect(same.conflicts).toEqual([]);
   expect(same.rows.map(y=>y.fact_id)).toEqual([r0,r,ux]);
   expect(same.rows.at(-1)).toMatchObject({fact_id:ux,is_current:true,is_revision:false,disclosure_seq:3});
   // a quarantined row on the disputed key does not take part in suppression
   await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[x]);
   expect((await lineageRead([t,s],{concepts:['revenue'],history:true})).conflicts).toEqual([]);
   const c=await admin.connect();
   try{
    await c.query('set role anon');
    const anon=await lineageRead([t,s],{concepts:['revenue'],history:true,nonOk:true},c);
    expect(anon.rows.every(y=>y.status==='ok')).toBe(true);
    expect(anon.state_revs.map(v=>v.issuer_id)).toEqual([t,s].sort());
   }finally{await c.query('reset role').catch(()=>{});c.release();}
  });

  it('replace_financial_metrics_lineage: member revs and the lineage set are checked under the scope locks; the wrapper writes a one-member vector',async()=>{
   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
   const lin=(v:{issuer_id:string;state_rev:number}[])=>JSON.stringify(v);
   const replace=(based:{issuer_id:string;state_rev:number}[],rows:unknown[]=[metric('0.5')],who=t,market='US')=>one(`select public.replace_financial_metrics_lineage($1,$2,$3::jsonb,$4::jsonb) v`,[who,market,lin(based),JSON.stringify(rows)]);
   expect(await one(`select public.replace_financial_metrics($1,'US',1,$2::jsonb) v`,[t,JSON.stringify([metric('0.4')])])).toBe(1);
   expect(await q(`select based_on_rev,based_on_lineage from public.financial_metrics where issuer_id=$1`,[t])).toEqual([{based_on_rev:'1',based_on_lineage:[{issuer_id:t,state_rev:1}]}]);
   await merge(s,t,by);                                                                                // revs: t 2, s 2
   expect(await fails(replace([{issuer_id:t,state_rev:2}]))).toMatchObject({message:'stale_computation',code:'P0001'});   // lineage grew
   expect(await fails(one(`select public.replace_financial_metrics($1,'US',2,'[]'::jsonb) v`,[t]))).toMatchObject({message:'stale_computation'});   // the one-member wrapper no longer fits
   expect(await fails(replace([{issuer_id:t,state_rev:2},{issuer_id:s,state_rev:1}]))).toMatchObject({message:'stale_computation'});
   expect(await replace([{issuer_id:s,state_rev:2},{issuer_id:t,state_rev:2}])).toBe(1);
   const [row]=await q(`select based_on_rev,based_on_lineage from public.financial_metrics where issuer_id=$1`,[t]);
   expect(row).toEqual({based_on_rev:'2',based_on_lineage:[{issuer_id:t,state_rev:2},{issuer_id:s,state_rev:2}].sort((a,b)=>a.issuer_id<b.issuer_id?-1:1)});
   expect(await fails(replace([{issuer_id:t,state_rev:2},{issuer_id:t,state_rev:2}]))).toMatchObject({message:'invalid_based_on',code:'22023'});
   expect(await fails(replace([{issuer_id:s,state_rev:2}]))).toMatchObject({message:'invalid_based_on'});
   // a merged issuer is no longer a materialisation target: the caller re-resolves T(i) and retries
   expect(await fails(one(`select public.replace_financial_metrics_lineage($1,'US',$2::jsonb,'[]'::jsonb) v`,[s,JSON.stringify([{issuer_id:s,state_rev:2}])]))).toMatchObject({message:'stale_computation',code:'P0001'});              // must contain p_issuer
   const lone=await issuer();
   expect(await fails(replace([{issuer_id:lone,state_rev:0}],[],lone,'CN'))).toMatchObject({message:'scope_missing',code:'P0001'});
   expect(await fails(one(`select public.replace_financial_metrics($1,'US',0,'[]'::jsonb) v`,[lone]))).toMatchObject({message:'scope_missing'});
   expect(await fails(one(`select public.replace_financial_metrics($1,'US',3,'[]'::jsonb) v`,[lone]))).toMatchObject({message:'stale_computation'});   // plan-2 contract: no scope ⇒ rev 0
   expect(await fails(q(`update public.financial_metrics set based_on_lineage='[]' where issuer_id=$1`,[t]))).toMatchObject({code:'23514'});
  });

  it('upgrade on a database with data: the first replay adds based_on_lineage and backfills it once; a second replay leaves newer evidence untouched',async()=>{
   const {iss}=await published();
   expect(await one(`select public.replace_financial_metrics($1,'US',1,$2::jsonb) v`,[iss,JSON.stringify([metric('0.5')])])).toBe(1);
   await inRolledBackTx(admin,async c=>{
    await c.query("select pg_advisory_xact_lock(hashtext('test:migration-replay'))");   // serialise with every other replay
    await c.query(`alter table public.financial_metrics drop column based_on_lineage`);   // back to the plan-2 shape (its constraint goes with it)
    await c.query(`insert into public.financial_metrics(issuer_id,market,metric,period_start,period_end,duration,value,unit,input_unit,basis,formula_version,inputs,based_on_rev,as_of) values($1,'US','legacy_metric','2023-10-01','2023-12-31','3M',1,'ratio','USD','us_standard','facts-derive/1.0','[]',7,'2024-03-01')`,[iss]);
    await c.query(sql());
    const read=async()=>(await c.query(`select metric,based_on_lineage from public.financial_metrics where issuer_id=$1 order by metric`,[iss])).rows;
    expect(await read()).toEqual([{metric:'gross_margin',based_on_lineage:[{issuer_id:iss,state_rev:1}]},{metric:'legacy_metric',based_on_lineage:[{issuer_id:iss,state_rev:7}]}]);
    await c.query(`update public.financial_metrics set based_on_lineage=jsonb_build_array(jsonb_build_object('issuer_id',issuer_id,'state_rev',99)) where issuer_id=$1 and metric='legacy_metric'`,[iss]);
    await c.query(sql());                                                                                       // replay: guarded, no second backfill
    expect((await read())[1]).toEqual({metric:'legacy_metric',based_on_lineage:[{issuer_id:iss,state_rev:99}]});
   });
  },60000);

  it('topology guard (S1): a fresh connection cannot write status/merged_into; after set_merge returns inside a transaction a direct update is still refused; the setting is restored on the error path',async()=>{
   const a=await issuer(),b=await issuer(),d=await issuer(),by=await user();   // d: active, no referrers (plan-1 merge_target_has_referrers would otherwise fire before the guard)
   expect(await fails(q(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]))).toMatchObject({code:'23514',message:expect.stringContaining('topology_write_forbidden')});
   const c=await admin.connect();
   try{
    await c.query('begin');
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[a,b,by])).rows[0].v).toEqual({repointed:0});
    expect(['',null]).toContain((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v);
    await c.query('savepoint s1');
    await expect(c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[d])).rejects.toMatchObject({code:'23514',message:expect.stringContaining('topology_write_forbidden')});
    await c.query('rollback to savepoint s1');
    await c.query('savepoint s2');
    await expect(c.query(`select public.set_merge($1,$2,$3)`,[a,b,by])).rejects.toMatchObject({message:'source_not_active'});   // error path
    await c.query('rollback to savepoint s2');
    expect(['',null]).toContain((await c.query(`select current_setting('entities.allow_topology_write',true) v`)).rows[0].v);
    await expect(c.query(`update public.issuers set merged_into=null,status='active' where issuer_id=$1`,[a])).rejects.toMatchObject({code:'23514'});
    await c.query('rollback');
   }finally{c.release();}
   expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[a])).toEqual([{status:'active',merged_into:null}]);   // rolled back
  });

  it('set_merge (R3): A→B then B→C re-points A to C before retiring B; every affected scope (both markets, placeholders created) bumps; audit rows; plan-1 trigger errors pass through',async()=>{
   const a=await issuer(),b=await issuer(),c=await issuer(),by=await user();
   expect(await merge(a,b,by)).toEqual({repointed:0});
   expect(await q(`select market,priority,reasons,fetch_key,state_rev from public.fact_sync_scope where issuer_id=$1 order by market`,[a])).toEqual([{market:'CN',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'},{market:'US',priority:0,reasons:[],fetch_key:'topology',state_rev:'1'}]);
   expect(await merge(b,c,by)).toEqual({repointed:1});
   expect(await q(`select issuer_id,status,merged_into from public.issuers where issuer_id=any($1::uuid[]) order by issuer_id`,[[a,b,c]])).toEqual([{issuer_id:a,status:'merged',merged_into:c},{issuer_id:b,status:'merged',merged_into:c},{issuer_id:c,status:'active',merged_into:null}].sort((x,y)=>x.issuer_id<y.issuer_id?-1:1));
   expect(await q(`select issuer_id,market,state_rev from public.fact_sync_scope where issuer_id=any($1::uuid[]) order by issuer_id,market`,[[a,b,c]])).toEqual([a,b,c].sort().flatMap(id=>['CN','US'].map(m=>({issuer_id:id,market:m,state_rev:id===c?'1':'2'}))));
   expect(await q(`select action,object_id,detail from public.research_audit_log where user_id=$1 order by created_at`,[by])).toEqual([{action:'entities.merge',object_id:a,detail:{source:a,target:b,repointed:0}},{action:'entities.merge',object_id:b,detail:{source:b,target:c,repointed:1}}]);
   expect(await fails(merge(b,c,by))).toMatchObject({message:'source_not_active'});
   const d=await issuer();
   expect(await fails(merge(d,b,by))).toMatchObject({code:'23514',message:expect.stringContaining('merge_target_not_active')});
   expect(await fails(merge(d,d,by))).toMatchObject({message:'invalid_merge',code:'22023'});
   expect(await fails(merge(d,randomUUID(),by))).toMatchObject({message:expect.stringContaining('merge_target_not_active')});
   expect(await q(`select status from public.issuers where issuer_id=$1`,[d])).toEqual([{status:'active'}]);
  });

  it('set_merge registers the target as a pending member of the latest facts.lineage_same_day cycle',async()=>{
   const s=await issuer(),t=await issuer(),by=await user();
   await inRolledBackTx(admin,async c=>{
    await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values('facts.lineage_same_day',$1,now()+interval '100 years',now()+interval '100 years','[]','complete',0)`,[`facts.lineage_same_day-test-${randomUUID().slice(0,8)}`]);
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
    const [latest]=(await c.query(`select detail from public.dq_reconcile_cycles where pair='facts.lineage_same_day' order by (status='running') desc, started_at desc limit 1`)).rows;
    expect(latest.detail.pending_members).toEqual(expect.arrayContaining([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]));   // one entry per merged source (plan audit Q2)
   });
  });

  it('set_merge with an empty dq_reconcile_cycles table commits and leaves no cycle row (registration falls back to the runner re-enumerating merged_into, decision #6)',async()=>{
   const s=await issuer(),t=await issuer(),by=await user();
   await inRolledBackTx(admin,async c=>{
    await c.query("select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:facts.lineage_same_day'))");   // same key set_merge takes, before the deletes
    await c.query(`delete from public.dq_reconcile_cursor where pair='facts.lineage_same_day'`);
    await c.query(`delete from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`);
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s,t,by])).rows[0].v).toEqual({repointed:0});
    expect((await c.query(`select count(*)::int n from public.dq_reconcile_cycles where pair='facts.lineage_same_day'`)).rows[0].n).toBe(0);
    expect((await c.query(`select status,merged_into from public.issuers where issuer_id=$1`,[s])).rows).toEqual([{status:'merged',merged_into:t}]);
   });
  });

  it('set_merge serialises with materialisation: a lineage write that waits behind it is refused as stale_computation',async()=>{
   const {iss:t}=await published();const {iss:s}=await sibling('100');const by=await user();
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);
    const p=one(`select public.replace_financial_metrics_lineage($1,'US',$2::jsonb,'[]'::jsonb) v`,[t,JSON.stringify([{issuer_id:t,state_rev:1}])]);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await commit();
    expect(await fails(p)).toMatchObject({message:'stale_computation'});
   });
  });

  it('set_dissolved: refuses referrers and non-active issuers; locks, bumps and audits',async()=>{
   const a=await issuer(),b=await issuer(),by=await user();
   await merge(a,b,by);
   expect(await fails(dissolve(b,by))).toMatchObject({message:'has_referrers'});
   const d=await issuer();
   await dissolve(d,by);
   expect(await q(`select status,merged_into from public.issuers where issuer_id=$1`,[d])).toEqual([{status:'dissolved',merged_into:null}]);
   expect((await q(`select state_rev from public.fact_sync_scope where issuer_id=$1 order by market`,[d])).map(x=>x.state_rev)).toEqual(['1','1']);
   expect(await fails(dissolve(d,by))).toMatchObject({message:'source_not_active'});
   expect(await q(`select action from public.research_audit_log where user_id=$1 and object_id=$2`,[by,d])).toEqual([{action:'entities.dissolve'}]);
  });

  it('grants: new functions are service_role only (read_facts_lineage: every client role); plan-2 grants are unchanged; replays',async()=>{
   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
   for(const role of ['anon','authenticated','service_role']){
    expect(await fn(role,'public.read_facts_lineage(uuid[],text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
    expect(await fn(role,'public.read_facts(uuid,text,text[],date,date,date,boolean,int,boolean)')).toBe(true);
    for(const sig of ['public.fact_promote_rows(uuid,text,uuid[])','public.fact_topology_lock(uuid[])','public.fact_set_merge_body(uuid,uuid,uuid)','public.fact_set_dissolved_body(uuid,uuid)'])
     expect({role,sig,ok:await fn(role,sig)}).toEqual({role,sig,ok:false});
   }
   for(const sig of ['public.set_filing_acceptance(uuid,timestamptz,text)','public.read_filing_facts(uuid,boolean)','public.replace_financial_metrics_lineage(uuid,text,jsonb,jsonb)','public.replace_financial_metrics(uuid,text,bigint,jsonb)','public.set_merge(uuid,uuid,uuid)','public.set_dissolved(uuid,uuid)']){
    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
    expect({sig,ok:await fn('service_role',sig)}).toEqual({sig,ok:true});
   }
   await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
  },60000);
 });
 describe('8b: promotion predicates, adopt_candidate, restore_reconciled, resolve_lineage_conflict',()=>{
  const item=async(o:{dataset?:string;reason:string;nk?:string;b:string;payload:Record<string,unknown>;detail?:Record<string,unknown>;status?:string;by?:string})=>{
   const id=randomUUID();
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload,detail) values($1,$2,'financial_facts',$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [id,o.dataset??'facts.us',o.nk??`ext:${randomUUID()}`,o.reason,o.b,JSON.stringify(o.payload),JSON.stringify(o.detail??{})]);
   if(o.status&&o.status!=='open')await q(`update public.dq_quarantine set status=$2,resolved_by=$3,resolved_at=now() where id=$1`,[id,o.status,o.by??randomUUID()]);
   return id;
  };
  const park=(id:string)=>q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[id]);
  const promote=(iss:string,ids:string[])=>one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,ids]);
  const resolveFacts=(id:string,chosen:string[],by:string)=>one(`select public.resolve_facts_quarantine($1,$2::uuid[],$3) v`,[id,chosen,by]);
  const restore=(id:string,b:string,hash:string|null,by:string)=>one(`select public.restore_reconciled($1,$2,$3,$4) v`,[id,b,hash,by]);
  const itemRow=async(id:string)=>(await q(`select status,detail,payload from public.dq_quarantine where id=$1`,[id]))[0];
  const latest=(passed:boolean,hash='h1')=>({latest_result:{passed,reconciliation_id:randomUUID(),at:'2026-11-05T00:00:00Z',inputs_hash:hash}});
  const cand=(ref:string,value:string,o:Record<string,unknown>={})=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:ref,rawHash:`h-${value}`,...o});
  const NK=(iss:string,ref:string,gen=1,k='revenue:2023-07-01:2023-09-30:consolidated:USD')=>`${iss}:US:${k}:${ref}:${gen}`;
  const ambiguous=(o:{iss:string;b:string;run:string;ref:string;candidates?:Record<string,unknown>[];key?:Record<string,unknown>})=>item({reason:'ambiguous_value',b:o.b,nk:NK(o.iss,o.ref),
   payload:{key:o.key??{issuer_id:o.iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD'},candidates:o.candidates??[cand(o.ref,'110'),cand(o.ref,'111')],run_id:o.run}});
  const adopt=(id:string,index:number,b:string,expected:number,by:string)=>one(`select public.adopt_candidate($1,$2,$3,$4,$5) v`,[id,index,b,expected,by]);
  const lineageItem=(t:string,b:string,ids:string[],date='2024-02-01')=>item({reason:'lineage_conflict',b,nk:`${t}:revenue:2023-10-01:2023-12-31:consolidated:USD:${date}`,payload:{fact_ids:ids,values:[]}});
  const resolveLineage=(id:string,keep:string,b:string,by:string)=>one(`select public.resolve_lineage_conflict($1,$2,$3,$4) v`,[id,keep,b,by]);

  it('T6: an open, rejected or not-passing reconcile_mismatch blocks promotion through promote_quarantined and resolve_facts_quarantine; accepted-and-passing does not',async()=>{
   const {iss,b,r}=await published();const by=await user();
   await park(r);
   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
   expect(await promote(iss,[r])).toBe(0);                                                            // open
   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[m,by]);
   expect(await promote(iss,[r])).toBe(0);                                                            // rejected: the left is really wrong
   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_accept',by});
   const other=await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[r]}});
   expect(await resolveFacts(other,[],by)).toMatchObject({promoted:0,skipped:1});                      // resolve_facts_quarantine honours the predicate too
   const m3=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false)});
   expect(await fails(resolveFacts(m3,[],by))).toMatchObject({message:'use_dedicated_resolver',code:'22023'});   // the generic resolver cannot bypass restore_reconciled
   expect((await itemRow(m3)).status).toBe('open');
   expect(await status(r)).toBe('quarantined');
   await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=any($1::uuid[])`,[[m2,m3],JSON.stringify(latest(true))]);
   await q(`update public.dq_quarantine set status='resolved_accept',resolved_by=$2,resolved_at=now() where id=$1`,[m3,by]);   // closed by hand: the generic resolver refuses it
   expect(await promote(iss,[r])).toBe(0);                                                            // m is still a reject
   await q(`update public.dq_quarantine set status='resolved_accept',detail=detail||$2::jsonb where id=$1`,[m,JSON.stringify(latest(true))]);
   expect(await promote(iss,[r])).toBe(1);
  });

  it('resolve_facts_quarantine refuses reconcile_mismatch and lineage_conflict (passing result with a changed inputs hash cannot be closed or promoted); restore_reconciled still works with the matching hash',async()=>{
   const {iss,b,r}=await published();const by=await user();const rb=await batch();
   await park(r);
   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
   expect(await fails(resolveFacts(m,[],by))).toMatchObject({message:'use_dedicated_resolver'});
   const l=await lineageItem(iss,b,[r]);
   expect(await fails(resolveFacts(l,[],by))).toMatchObject({message:'use_dedicated_resolver'});
   expect([(await itemRow(m)).status,(await itemRow(l)).status,await status(r)]).toEqual(['open','open','quarantined']);
   expect(await fails(restore(m,rb,'changed',by))).toMatchObject({message:'not_passing'});
   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[l,by]);   // only to free the member for the matching-hash restore
   await q(`update public.dq_quarantine set payload=jsonb_set(payload,'{fact_ids}','[]') where id=$1`,[l]);
   expect(await restore(m,rb,'h1',by)).toEqual({promoted:1,skipped:[]});
   expect(await status(r)).toBe('ok');
  });

  it('T6: a resolved lineage_conflict binds promotion to its chosen rows, for payload members and for the rows it quarantined',async()=>{
   const {iss,b,r0,r}=await published();const by=await user();
   await park(r);await park(r0);
   const l=await item({reason:'lineage_conflict',b,payload:{fact_ids:[r]},detail:{chosen_fact_ids:[],quarantined_fact_ids:[r0]},status:'resolved_accept',by});
   expect(await promote(iss,[r,r0])).toBe(0);
   await q(`update public.dq_quarantine set detail=jsonb_set(detail,'{chosen_fact_ids}',$2::jsonb) where id=$1`,[l,JSON.stringify([r0])]);
   expect(await promote(iss,[r,r0])).toBe(1);
   expect([await status(r0),await status(r)]).toEqual(['ok','quarantined']);
  });

  it('restore_reconciled (R1): passing with the same hash closes the item first and really promotes; another hash or a failing result is not_passing; another open item makes the row skip',async()=>{
   const {iss,b,r0,r}=await published();const by=await user();const rb=await batch();
   await park(r);
   const m=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
   const before=await rev(iss);
   expect(await fails(restore(m,rb,'h2',by))).toMatchObject({message:'not_passing',code:'P0001'});
   expect(await fails(restore(m,rb,null,by))).toMatchObject({message:'not_passing'});
   expect(await fails(restore(m,await batch('facts.us',true),'h1',by))).toMatchObject({message:'batch_mismatch'});
   expect(await restore(m,rb,'h1',by)).toEqual({promoted:1,skipped:[]});
   expect(await status(r)).toBe('ok');expect(await rev(iss)).toBe(before+1);
   const row=await itemRow(m);
   expect(row.status).toBe('resolved_accept');
   expect(row.detail).toMatchObject({restored_by_batch:rb,chosen_fact_ids:[r],hook:{stage:'materialize',state:'pending'}});
   expect(await fails(restore(m,rb,'h1',by))).toMatchObject({message:'item_not_open'});
   await park(r0);
   const n=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:latest(false,'h1')});
   expect(await fails(restore(n,rb,'h1',by))).toMatchObject({message:'not_passing'});
   await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[r0]}});                                 // still referenced elsewhere
   await q(`update public.dq_quarantine set detail=detail||$2::jsonb where id=$1`,[n,JSON.stringify(latest(true,'h1'))]);
   expect(await restore(n,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r0,reason:'ineligible'}]});
   expect((await itemRow(n)).status).toBe('resolved_accept');expect(await status(r0)).toBe('quarantined');
   const wrong=await item({reason:'identity_bs',b,payload:{key:{},fact_ids:[]}});
   expect(await fails(restore(wrong,rb,'h1',by))).toMatchObject({message:'item_not_open'});
  });

  it('restore_reconciled skips rows blocked by the new T6 predicates: a resolved lineage_conflict that chose another row, a second reconcile_mismatch resolved_reject',async()=>{
   const {iss,b,r0,r}=await published();const by=await user();const rb=await batch();
   await park(r0);await park(r);
   await item({reason:'lineage_conflict',b,payload:{fact_ids:[r0]},detail:{chosen_fact_ids:[r]},status:'resolved_accept',by});
   const m1=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r0]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
   expect(await restore(m1,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r0,reason:'ineligible'}]});
   expect(await status(r0)).toBe('quarantined');
   await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:latest(false),status:'resolved_reject',by});
   const m2=await item({reason:'reconcile_mismatch',b,payload:{fact_ids:[r]},detail:{...latest(true,'h1'),issuer_id:iss,market:'US'}});
   expect(await restore(m2,rb,'h1',by)).toEqual({promoted:0,skipped:[{fact_id:r,reason:'ineligible'}]});
   expect(await status(r)).toBe('quarantined');
  });

  it('adopt_candidate (T5): maps the persisted camelCase candidate, takes issuer and market from the filing, generation from the anchor run, mapping_version from retained rows; the hook in the same transaction; a management run',async()=>{
   const {iss,b,run,f,fRef}=await published();const by=await user();const ab=await batch();
   const id=await ambiguous({iss,b,run,ref:fRef,key:{issuer_id:randomUUID(),market:'CN'}});        // payload key is never trusted
   const out=await adopt(id,1,ab,1,by);
   expect(out).toMatchObject({issuer_id:iss,market:'US'});
   const [fact]=await q(`select issuer_id,market,filing_id,run_id,concept,source_concept,statement,period_start::text ps,period_end::text pe,duration,value_text,unit,consolidation,available_date::text ad,mapping_gen,mapping_version,status,raw_hash from public.financial_facts where fact_id=$1`,[out.fact_id]);
   expect(fact).toEqual({issuer_id:iss,market:'US',filing_id:f,run_id:out.run_id,concept:'revenue',source_concept:'us-gaap:Revenues',statement:'IS',ps:'2023-07-01',pe:'2023-09-30',duration:'3M',value_text:'111',unit:'USD',consolidation:'consolidated',ad:'2024-02-01',mapping_gen:1,mapping_version:'facts-map/1',status:'ok',raw_hash:'h-111'});
   expect(await q(`select issuer_id,market,batch_id,mapping_gen,status,manifest,published_at is not null pub from public.fact_sync_runs where run_id=$1`,[out.run_id])).toEqual([{issuer_id:iss,market:'US',batch_id:ab,mapping_gen:1,status:'published',manifest:[],pub:true}]);
   expect(await q(`select mapping_gen from public.filings where filing_id=$1`,[f])).toEqual([{mapping_gen:1}]);   // a management run activates nothing
   const row=await itemRow(id);
   expect(row.status).toBe('resolved_accept');
   expect(row.detail).toMatchObject({chosen_candidate_index:1,adopted_fact_id:out.fact_id,run_id:out.run_id,issuer_id:iss,market:'US',batch_id:ab,hook:{stage:'materialize',state:'pending'}});
   expect(await rev(iss)).toBe(2);
   expect((await factsRead(iss,{concepts:['revenue'],history:false})).rows.map(x=>x.fact_id)).toContain(out.fact_id);
   expect(await fails(adopt(id,0,ab,2,by))).toMatchObject({message:'item_not_open'});
  });

  it('adopt_candidate codes: invalid_choice, invalid_candidate, filing_not_found, batch_mismatch, stale_evaluation, generation_moved; the item stays open',async()=>{
   const {iss,b,run,fRef}=await published();const by=await user();const ab=await batch();
   const id=await ambiguous({iss,b,run,ref:fRef,candidates:[cand(fRef,'110'),cand(fRef,'111',{rawHash:undefined}),cand(fRef,'112',{periodStart:null}),cand('no-such-accession','113'),cand(fRef,'1e5')]});
   for(const i of [-1,5])expect(await fails(adopt(id,i,ab,1,by))).toMatchObject({message:'invalid_choice',code:'22023'});
   for(const i of [1,2,4])expect(await fails(adopt(id,i,ab,1,by))).toMatchObject({message:'invalid_candidate',code:'22023'});
   expect(await fails(adopt(id,3,ab,1,by))).toMatchObject({message:'filing_not_found',code:'P0001'});
   expect(await fails(adopt(id,0,await batch('facts.us',true),1,by))).toMatchObject({message:'batch_mismatch'});
   expect(await fails(adopt(id,0,await batch('facts.cn'),1,by))).toMatchObject({message:'batch_mismatch'});
   expect(await fails(adopt(id,0,ab,0,by))).toMatchObject({message:'stale_evaluation'});
   const moved=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2),payload:{candidates:[cand(fRef,'110')],run_id:run}});
   expect(await fails(adopt(moved,0,ab,1,by))).toMatchObject({message:'generation_moved'});
   const noRun=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,1,'revenue:2023-07-01:2023-09-30:consolidated:EUR'),payload:{candidates:[cand(fRef,'110')],run_id:randomUUID()}});
   expect(await fails(adopt(noRun,0,ab,1,by))).toMatchObject({message:'generation_moved'});
   const notAmbiguous=await item({reason:'odd_duration',b,payload:{candidates:[cand(fRef,'110')],run_id:run}});
   expect(await fails(adopt(notAmbiguous,0,ab,1,by))).toMatchObject({message:'invalid_choice'});
   expect((await itemRow(id)).status).toBe('open');expect(await rev(iss)).toBe(1);
  });

  it('adopt_candidate: duplicate on the full candidate key in any status; an old-generation row with the same key is no duplicate (T1); replay_required without exactly one retained mapping_version',async()=>{
   const {iss,b,run,f,fRef}=await published();const by=await user();
   const k4='revenue:2023-10-01:2023-12-31:consolidated:USD';                                          // the key of r on f, generation 1
   const four=(value:string)=>cand(fRef,value,{periodStart:'2023-10-01',periodEnd:'2023-12-31'});
   const dup=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,1,k4),payload:{candidates:[four('105')],run_id:run}});
   expect(await fails(adopt(dup,0,await batch(),1,by))).toMatchObject({message:'duplicate'});
   const run2=await begin(iss,b,2);await stage(run2,[{filing_id:f,concept:'net_income',value:'5',mapping_version:'facts-map/2'}]);await publish(run2,[f]);   // f moves to gen 2, r stays as evidence
   const old=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2,k4),payload:{candidates:[four('105')],run_id:run2}});
   const out=await adopt(old,0,await batch(),2,by);
   expect(await q(`select mapping_gen,mapping_version from public.financial_facts where fact_id=$1`,[out.fact_id])).toEqual([{mapping_gen:2,mapping_version:'facts-map/2'}]);
   const run3=await begin(iss,b,2);await stage(run3,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'9',mapping_version:'facts-map/3'}]);await publish(run3,[f]);
   const run4=await begin(iss,b,2);await publish(run4,[]);                                              // an anchor run without rows
   const rr=await item({reason:'ambiguous_value',b,nk:NK(iss,fRef,2),payload:{candidates:[cand(fRef,'110')],run_id:run4}});
   expect(await fails(adopt(rr,0,await batch(),await rev(iss),by))).toMatchObject({message:'replay_required'});
   const run5=await begin(iss,b,1);const z=await filing(run5);await publish(run5,[z.id]);                // anchor run without rows, filing without rows at its generation
   const zr=await item({reason:'ambiguous_value',b,nk:NK(iss,z.sourceRef,1),payload:{candidates:[cand(z.sourceRef,'110')],run_id:run5}});
   expect(await fails(adopt(zr,0,await batch(),await rev(iss),by))).toMatchObject({message:'replay_required'});
  });

  it('adopt_candidate conflict_exists (U3): a visible ok row with another value for (K, date), or an open same_day_conflict / lineage_conflict on it even with no ok competitor left',async()=>{
   const {iss,b,run,fRef}=await published();const by=await user();
   const run2=await begin(iss,b,1);const g=await filing(run2);
   const [y]=await stage(run2,[{filing_id:g.id,period_start:'2023-07-01',period_end:'2023-09-30',value:'109'}]);await publish(run2,[g.id]);
   const a=await ambiguous({iss,b,run,ref:fRef});
   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
   await park(y);
   const key={issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-07-01',period_end:'2023-09-30',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'};
   const sd=await item({reason:'same_day_conflict',b,nk:`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,payload:{key,fact_ids:[y],values:[]}});
   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[sd,by]);
   const ln=await item({reason:'lineage_conflict',b,nk:`${iss}:revenue:2023-07-01:2023-09-30:consolidated:USD:2024-02-01`,payload:{fact_ids:[y]}});
   expect(await fails(adopt(a,0,await batch(),2,by))).toMatchObject({message:'conflict_exists'});
   await q(`update public.dq_quarantine set status='resolved_reject',resolved_by=$2,resolved_at=now() where id=$1`,[ln,by]);
   expect(await adopt(a,0,await batch(),2,by)).toMatchObject({issuer_id:iss});
  });

  it('adopt_candidate lineage (Codex P2): a competing ok value at another lineage member, with no open item, → conflict_exists',async()=>{
   const {iss:t,b}=await published();const by=await user();            // t holds revenue 100 for 2023-10-01..12-31 on 2024-02-01
   const u=await issuer();const ub=await batch();await scope(u);await claim(u,ub);
   const run=await begin(u,ub);const g=await filing(run);
   await stage(run,[{filing_id:g.id,concept:'total_assets',period_start:null,duration:'INSTANT',value:'9'}]);await publish(run,[g.id]);
   await merge(u,t,by);
   const key={periodStart:'2023-10-01',periodEnd:'2023-12-31'};
   const own=await item({reason:'ambiguous_value',b:ub,nk:NK(u,g.sourceRef),payload:{candidates:[cand(g.sourceRef,'150',key),cand(g.sourceRef,'100',key)],run_id:run}});
   expect(await fails(adopt(own,0,await batch(),await rev(u),by))).toMatchObject({message:'conflict_exists'});   // 150 against t's 100, u has no row of its own
   expect((await itemRow(own)).status).toBe('open');
   expect(await adopt(own,1,await batch(),await rev(u),by)).toMatchObject({issuer_id:u});                        // the same value agrees
   void b;
  });

  it('adopt_candidate: a merge of the filing issuer into a third issuer committing between the target read and the lock → lineage_changed',async()=>{
   const {iss:g,b,run,fRef}=await published();const w=await issuer();await scope(w);const by=await user();
   const a=await ambiguous({iss:g,b,run,ref:fRef});const ab=await batch();const expected=await rev(g);
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[g]);
    const p=adopt(a,0,ab,expected,by);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await c.query(`select public.set_merge($1,$2,$3)`,[g,w,by]);          // same tx as the held lock: the merge commits first
    await commit();
    expect(await fails(p)).toMatchObject({message:'lineage_changed'});
   });
   expect((await itemRow(a)).status).toBe('open');
  });

  it('adopt_candidate: two adoptions racing on different lineage members serialise; the second sees the first',async()=>{
   const t=await issuer();const bt=await batch();await scope(t);await claim(t,bt);
   const a=await sibling('0');const c=await sibling('0');
   const by=await user();await merge(a.iss,t,by);await merge(c.iss,t,by);
   const [{source_ref:aref}]=await q(`select source_ref from public.filings where filing_id=$1`,[a.f]);
   const [{source_ref:cref}]=await q(`select source_ref from public.filings where filing_id=$1`,[c.f]);
   const ia=await item({reason:'ambiguous_value',b:a.b,nk:NK(a.iss,aref),payload:{candidates:[cand(aref,'111')],run_id:a.run}});
   const ic=await item({reason:'ambiguous_value',b:c.b,nk:NK(c.iss,cref),payload:{candidates:[cand(cref,'222')],run_id:c.run}});
   const ab=await batch();
   await inTx(admin,async({c:cx,pid,commit})=>{
    await cx.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[c.iss]);
    const p1=adopt(ia,0,ab,await rev(a.iss),by);p1.catch(()=>{});
    await stillBlockedBehind(admin,pid,p1);
    const p2=adopt(ic,0,ab,await rev(c.iss),by);p2.catch(()=>{});
    await commit();
    const res=await Promise.allSettled([p1,p2]);
    expect(res.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const bad=res.find(x=>x.status==='rejected') as PromiseRejectedResult;
    expect(bad.reason).toMatchObject({message:'conflict_exists'});
   });
  });

  it('resolve_lineage_conflict: locks the whole lineage, re-queries under the lock, leaves exactly one ok value, persists the verdict that promote_quarantined then obeys',async()=>{
   const {iss:t,b,r}=await published();const {iss:s,b:sb,x}=await sibling('200');const by=await user();
   const run2=await begin(s,sb);const g=await filing(run2);const [z]=await stage(run2,[{filing_id:g.id,value:'300'}]);await publish(run2,[g.id]);   // not in the payload
   await merge(s,t,by);
   expect((await lineageRead([t,s],{concepts:['revenue']})).conflicts[0].fact_ids).toEqual([r,x,z].sort());
   const id=await lineageItem(t,b,[r,x]);
   const revs=[await rev(t),await rev(s)];
   expect(await fails(resolveLineage(id,randomUUID(),await batch(),by))).toMatchObject({message:'invalid_choice'});
   expect(await resolveLineage(id,r,await batch(),by)).toEqual({quarantined:2});
   expect([await status(r),await status(x),await status(z)]).toEqual(['ok','quarantined','quarantined']);
   expect([await rev(t),await rev(s)]).toEqual([revs[0]+1,revs[1]+1]);
   const row=await itemRow(id);
   expect(row.status).toBe('resolved_accept');
   expect(row.detail).toMatchObject({chosen_fact_ids:[r],quarantined_fact_ids:[x,z].sort(),issuer_id:t,market:'US',hook:{stage:'materialize',state:'pending'}});
   const env=await lineageRead([t,s],{concepts:['revenue'],history:false});
   expect(env.conflicts).toEqual([]);expect(env.rows.map(y=>y.fact_id)).toEqual([r]);
   expect(await one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[s,[x,z]])).toBe(0);    // the verdict binds
  });

  it('resolve_lineage_conflict: payload rows outside the lineage → lineage_changed; a kept row that is not ok → unresolved with nothing changed; it waits behind a lock on any member scope',async()=>{
   const {iss:t,b,r}=await published();const {iss:s,x}=await sibling('200');const {x:outsider}=await sibling('250');const by=await user();
   await merge(s,t,by);
   const bad=await lineageItem(t,b,[r,outsider],'2024-02-02');
   expect(await fails(resolveLineage(bad,r,await batch(),by))).toMatchObject({message:'lineage_changed'});
   const id=await lineageItem(t,b,[r,x]);
   await park(r);
   expect(await fails(resolveLineage(id,r,await batch(),by))).toMatchObject({message:'unresolved'});
   expect(await status(x)).toBe('ok');expect((await itemRow(id)).status).toBe('open');                 // rolled back
   await q(`update public.financial_facts set status='ok' where fact_id=$1`,[r]);
   const ab=await batch();
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select 1 from public.fact_sync_scope where issuer_id=$1 and market='US' for update`,[s]);
    const p=resolveLineage(id,x,ab,by);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await commit();
    expect(await p).toEqual({quarantined:1});
   });
   expect([await status(r),await status(x)]).toEqual(['quarantined','ok']);
   const malformed=await item({reason:'lineage_conflict',b,nk:`${t}:revenue:2024-02-01`,payload:{fact_ids:[r]}});
   expect(await fails(resolveLineage(malformed,r,ab,by))).toMatchObject({message:'invalid_choice'});
  });

  it('resolve_lineage_conflict: a target that is no longer active → target_not_active (distinct from lineage_changed)',async()=>{
   const {iss:t,b,r}=await published();const w=await issuer();await scope(w);const by=await user();
   const id=await lineageItem(t,b,[r]);
   await merge(t,w,by);
   expect(await fails(resolveLineage(id,r,await batch(),by))).toMatchObject({message:'target_not_active',code:'P0001'});
   expect((await itemRow(id)).status).toBe('open');
  });

  it('grants: the three verdict functions are service_role only',async()=>{
   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
   for(const sig of ['public.adopt_candidate(uuid,int,uuid,bigint,uuid)','public.restore_reconciled(uuid,uuid,text,uuid)','public.resolve_lineage_conflict(uuid,uuid,uuid,uuid)']){
    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
    expect(await fn('service_role',sig)).toBe(true);
   }
  });
 });

 describe('8c: reconcile cursor and apply_reconcile_result',()=>{
  const newPair=()=>`test.${randomUUID().slice(0,8)}`;   // one pair per test: never meets another suite's running cycle
  const keysOf=(m:{expected:number;keys?:string[]})=>m.keys??Array.from({length:m.expected},(_,i)=>`k${i+1}`);
  const cycle=async(pair:string,members:{issuer_id:string;market?:string;expected:number;keys?:string[]}[],status='running')=>{
   const id=`${pair}-${randomUUID().slice(0,8)}`;
   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total) values($1,$2,now(),$3,$4::jsonb,$5,$6)`,
    [pair,id,status==='running'?null:new Date().toISOString(),JSON.stringify(members.map(m=>({issuer_id:m.issuer_id,market:m.market??'US',expected_keys:keysOf(m).map(k=>({naturalKey:k,locator:{}}))}))),status,members.reduce((n,m)=>n+m.expected,0)]);
   for(const m of members)await q(`insert into public.dq_reconcile_cursor(pair,cycle_id,issuer_id,market,expected) values($1,$2,$3,$4,$5)`,[pair,id,m.issuer_id,m.market??'US',m.expected]);
   return id;
  };
  type FenceJson={pair:string;cycle_id:string;issuer_id:string;market:string;batch_id:string;attempt:number};
  const claimM=(pair:string,cy:string,iss:string,b:string,market='US')=>one(`select public.claim_reconcile_member($1,$2,$3,$4,$5) v`,[pair,cy,iss,market,b]) as Promise<FenceJson|null>;
  const apply=(fence:FenceJson,result:Record<string,unknown>)=>one(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(fence),JSON.stringify(result)]);
  const complete=(fence:FenceJson)=>one(`select public.complete_reconcile_member($1::jsonb) v`,[JSON.stringify(fence)]);
  const failM=(fence:FenceJson,err:string)=>q(`select public.fail_reconcile_member($1::jsonb,$2)`,[JSON.stringify(fence),err]);
  const cursor=async(pair:string,cy:string,iss:string)=>(await q(`select state,attempts,claimed_by,last_error,compared_passed,compared_failed,not_compared from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]))[0];
  const expire=(pair:string,cy:string,iss:string)=>q(`update public.dq_reconcile_cursor set claim_until=clock_timestamp()-interval '1 second' where pair=$1 and cycle_id=$2 and issuer_id=$3`,[pair,cy,iss]);
  const res=(nk:string,o:Record<string,unknown>={})=>({natural_key:nk,kind:'numeric',outcome:'compared',passed:false,left_value:'100',right_value:'99',abs_diff:'1',rel_diff:'0.01',tolerance:'0',
   left_source:'companyfacts',right_source:'ixbrl',detail:{right:{document:'d',sha256:'s',locator:'ix:nonFraction#c1'}},action:'record',inputs_hash:'h1',...o});
  const resultRows=(pair:string)=>q(`select natural_key,outcome,passed,attempt,issuer_id,market,cycle_id,dataset,batch_id,detail->>'item_id' item_id from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);

  it('claim (S4): pending → fence attempt 1; held → null; expired → attempt 2; failed with attempts < 3 → claimable; failed at 3 is terminal; a cycle that is not running → null',async()=>{
   const iss=await issuer();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:0}]);
   const b1=await batch(`reconcile.${pair}`),b2=await batch(`reconcile.${pair}`);
   expect(await claimM(pair,cy,iss,b1)).toEqual({pair,cycle_id:cy,issuer_id:iss,market:'US',batch_id:b1,attempt:1});
   expect(await claimM(pair,cy,iss,b2)).toBeNull();
   await expire(pair,cy,iss);
   const f2=(await claimM(pair,cy,iss,b2))!;expect(f2).toMatchObject({batch_id:b2,attempt:2});
   await failM(f2,'boom');
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:2,last_error:'boom'});
   const f3=(await claimM(pair,cy,iss,b1))!;expect(f3).toMatchObject({attempt:3});
   await failM(f3,'again');
   expect(await claimM(pair,cy,iss,b2)).toBeNull();
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'failed',attempts:3});
   const other=await issuer();const pair2=newPair();const done=await cycle(pair2,[{issuer_id:other,expected:0}],'complete');
   expect(await claimM(pair2,done,other,b1)).toBeNull();
  });

  it('fence: an expired, foreign or stale-attempt fence is fence_failed for apply / complete / fail and writes nothing',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   for(const f of [{...fence,batch_id:randomUUID()},{...fence,attempt:2},{...fence,cycle_id:'nope'},{...fence,attempt:undefined} as unknown as FenceJson]){
    expect(await fails(apply(f,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed',code:'P0001'});
    expect(await fails(complete(f))).toMatchObject({message:'fence_failed'});
    expect(await fails(failM(f,'x'))).toMatchObject({message:'fence_failed'});
   }
   await expire(pair,cy,iss);
   expect(await fails(apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'fence_failed'});
   expect(await resultRows(pair)).toEqual([]);
   expect(await status(r)).toBe('ok');
   expect(await q(`select 1 from public.dq_quarantine where natural_key like $1`,[`${pair}:%`])).toEqual([]);
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'claimed',attempts:1});
  });

  it('apply_reconcile_result: result row + mismatch item + quarantine + hook pending in one transaction; the same key again is reused; complete derives the counts (member_incomplete before); drc_done_accounted (S5)',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:3}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const before=await rev(iss);
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   expect(a).toMatchObject({reused:false,quarantined:1,materialize:{issuer_id:iss,market:'US'}});
   expect(await status(r)).toBe('quarantined');expect(await rev(iss)).toBe(before+1);
   const [row]=await q(`select dataset,natural_key,reason_code,status,batch_id,payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
   expect(row).toMatchObject({dataset:'facts.us',natural_key:`${pair}:k1:${r}`,reason_code:'reconcile_mismatch',status:'open',batch_id:w});
   expect(row.payload).toMatchObject({fact_ids:[r],left_value:'100',right_value:'99',right_locator:'ix:nonFraction#c1',
    key:{issuer_id:iss,market:'US',concept:'revenue',period_start:'2023-10-01',period_end:'2023-12-31',consolidation:'consolidated',unit:'USD',available_date:'2024-02-01'}});
   expect(row.detail).toMatchObject({pair,reconciliation_id:a.reconciliation_id,inputs_hash:'h1',issuer_id:iss,market:'US',latest_result:{passed:false,reconciliation_id:a.reconciliation_id,inputs_hash:'h1'},hook:{stage:'materialize',state:'pending'}});
   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}))).toEqual({reused:true,reconciliation_id:a.reconciliation_id,item_id:a.item_id,quarantined:0,materialize:null});
   expect(await rev(iss)).toBe(before+1);
   expect(await fails(complete(fence))).toMatchObject({message:'member_incomplete'});
   await apply(fence,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
   await apply(fence,res('k3',{outcome:'right_missing',left_value:'5',right_value:null,abs_diff:null,rel_diff:null}));
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:1,not_compared:1});
   expect(await cursor(pair,cy,iss)).toMatchObject({state:'done',compared_passed:1,compared_failed:1,not_compared:1});
   expect((await resultRows(pair)).map(x=>[x.natural_key,x.outcome,x.passed,x.attempt,x.issuer_id,x.market,x.cycle_id,x.dataset,x.batch_id])).toEqual(
    ['k1','k2','k3'].map((k,i)=>[k,i===2?'right_missing':'compared',i===1,1,iss,'US',cy,`reconcile.${pair}`,w]));
   expect((await resultRows(pair))[0].item_id).toBe(a.item_id);
   expect(await fails(apply(fence,res('k4')))).toMatchObject({message:'fence_failed'});                   // done: the fence no longer holds
   await expect(q(`update public.dq_reconcile_cursor set compared_passed=null where pair=$1 and cycle_id=$2`,[pair,cy])).rejects.toMatchObject({code:'23514'});
  });

  it('apply_reconcile_result touches only the member\'s published ok rows; a quarantined left gets latest_result on its open items; review and lineage items change no visibility; invalid results write nothing',async()=>{
   const {iss,b,r0,r}=await published();const {x}=await sibling('5');
   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:8,keys:['k0','k1','k1m','k1p','k2','k3','k4','k5']}]);const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   expect(await fails(apply(fence,res('k0',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result',code:'22023'});   // another issuer's row
   expect(await fails(apply(fence,res('k0',{action:'quarantine_left'})))).toMatchObject({message:'invalid_result'});      // left_fact_id required
   expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
   expect(await fails(apply(fence,res('k0',{left_value:'1e5x'})))).toMatchObject({message:'invalid_result'});
   // dq_reconciliations_numeric_sides / _nonnumeric_sides surface as invalid_result (22023), not 23514, and write nothing
   expect(await fails(apply(fence,res('k0',{right_value:null})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect(await fails(apply(fence,res('k0',{left_value:null})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect(await fails(apply(fence,res('k0',{kind:'text'})))).toMatchObject({message:'invalid_result',code:'22023'});           // numeric fields on a text compare
   expect(await fails(apply(fence,res('k0',{kind:'date',left_value:null,right_value:null,abs_diff:'1',rel_diff:null})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect(await fails(apply(fence,res('k0',{kind:'text',left_value:null,right_value:null,abs_diff:null,rel_diff:'0',action:'quarantine_left',left_fact_id:r})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect(await status(r)).toBe('ok');
   expect(await resultRows(pair)).toEqual([]);
   const run2=await begin(iss,b);const g=await filing(run2);const [st]=await stage(run2,[{filing_id:g.id,concept:'net_income',value:'3'}]);
   expect(await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:st}))).toMatchObject({quarantined:0,item_id:null,materialize:null});   // staged: recorded only
   expect(await status(st)).toBe('staged');
   // quarantine_left with passed=true or a non-compared outcome on an ok left row → result row only (接口对齐记录 #5)
   expect(await apply(fence,res('k1p',{action:'quarantine_left',left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
   expect(await apply(fence,res('k1m',{action:'quarantine_left',left_fact_id:r,outcome:'right_missing',right_value:null,abs_diff:null,rel_diff:null}))).toMatchObject({quarantined:0,item_id:null,materialize:null});
   expect(await status(r)).toBe('ok');
   const q1=await apply(fence,res('k2',{action:'quarantine_left',left_fact_id:r0}));
   const q2=await apply(fence,res('k3',{left_fact_id:r0,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h9'}));
   expect(q2).toMatchObject({quarantined:0,item_id:q1.item_id,materialize:null});
   expect((await q(`select detail->'latest_result' lr from public.dq_quarantine where id=$1`,[q1.item_id]))[0].lr).toMatchObject({passed:true,reconciliation_id:q2.reconciliation_id,inputs_hash:'h9'});
   const rv=await apply(fence,res('k4',{action:'review_item',item:{natural_key:`${pair}:k4`,payload:{fact_ids:[r],left_value:'100',right_value:'99'}}}));
   const ln=await apply(fence,res('k5',{action:'lineage_item',item:{natural_key:`${iss}:revenue:2023-10-01:2023-12-31:consolidated:USD:2024-02-01`,payload:{fact_ids:[r],values:[]}}}));
   expect(await q(`select reason_code,status,dataset from public.dq_quarantine where id=any($1::uuid[]) order by reason_code`,[[rv.item_id,ln.item_id]])).toEqual([{reason_code:'lineage_conflict',status:'open',dataset:'facts.us'},{reason_code:'reconcile_review',status:'open',dataset:'facts.us'}]);
   expect(await status(r)).toBe('ok');
   const kinds=await q(`select natural_key,kind,outcome from public.dq_reconciliations where pair=$1 order by natural_key`,[pair]);
   expect(kinds.map(k=>k.natural_key)).toEqual(['k1','k1m','k1p','k2','k3','k4','k5']);
  });

  it('apply_reconcile_result holds the member scope lock: a concurrent publish_sync_run waits for it',async()=>{
   const {iss,b,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const run2=await begin(iss,b);
   await inTx(admin,async({c,pid,commit})=>{
    // 'record' with a left row writes no scope row: only the explicit scope lock can make the publish wait
    await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('k1',{action:'record',left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))]);
    const p=publish(run2,[]);p.catch(()=>{});
    await stillBlockedBehind(admin,pid,p);
    await commit();
    expect(await p).toBe(0);
   });
   expect(await rev(iss)).toBe(2);                                            // the publish only; apply bumped nothing
  });

  it('T2: keys committed before the lease is lost stay valid; the successor reuses them; the old worker is fenced out; counts are not doubled',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:2}]);
   const wa=await batch(`reconcile.${pair}`),wb=await batch(`reconcile.${pair}`);
   const fa=(await claimM(pair,cy,iss,wa))!;
   const k1=await apply(fa,res('k1',{action:'quarantine_left',left_fact_id:r}));
   await expire(pair,cy,iss);
   const fb=(await claimM(pair,cy,iss,wb))!;expect(fb).toMatchObject({attempt:2,batch_id:wb});
   expect(await fails(apply(fa,res('k2',{passed:true})))).toMatchObject({message:'fence_failed'});
   expect(await fails(complete(fa))).toMatchObject({message:'fence_failed'});
   expect(await apply(fb,res('k1',{action:'quarantine_left',left_fact_id:r}))).toMatchObject({reused:true,reconciliation_id:k1.reconciliation_id,item_id:k1.item_id});
   await apply(fb,res('k2',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
   expect(await complete(fb)).toEqual({compared_passed:1,compared_failed:1,not_compared:0});
   expect((await resultRows(pair)).map(x=>[x.natural_key,x.attempt])).toEqual([['k1',1],['k2',2]]);
   expect(await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1`,[`${pair}:k1:${r}`])).toEqual([{n:1}]);
  });

  it('a crash between apply_reconcile_result and materialisation leaves the item open with hook pending (picked up by --pending-hooks, Task 11)',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));   // committed; the "runner" dies here
   expect(await q(`select status,detail->'hook'->>'state' hook,detail->>'issuer_id' issuer from public.dq_quarantine where id=$1`,[a.item_id])).toEqual([{status:'open',hook:'pending',issuer:iss}]);
  });

  it('reconcile_mismatch items only ever name the fence issuer/market rows: payload.fact_ids never spans a lineage (restore_reconciled promotes one issuer)',async()=>{
   const {iss,r}=await published();const {iss:src,x}=await sibling('100');const by=await user();
   const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:3,keys:['kx','km','k1']}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   // a row of an unrelated issuer is refused for the fence member
   expect(await fails(apply(fence,res('kx',{action:'quarantine_left',left_fact_id:x})))).toMatchObject({message:'invalid_result'});
   // a member merged INTO the fence issuer is still another issuer's row: refused as well (rolled-back transaction: no topology left behind)
   await inRolledBackTx(admin,async c=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[src,iss,by]);
    expect(await fails(c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb)`,[JSON.stringify(fence),JSON.stringify(res('km',{action:'quarantine_left',left_fact_id:x}))]))).toMatchObject({message:'invalid_result'});
   },1);
   expect(await status(x)).toBe('ok');
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   const [row]=await q(`select payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
   expect(row.payload.fact_ids).toEqual([r]);
   expect(await q(`select distinct issuer_id,market from public.financial_facts where fact_id=any($1::uuid[])`,[row.payload.fact_ids])).toEqual([{issuer_id:iss,market:'US'}]);
   expect(row.detail).toMatchObject({issuer_id:iss,market:'US'});
   const bad=await q(`select q.id from public.dq_quarantine q where q.reason_code='reconcile_mismatch' and q.detail->>'pair'=$1
     and exists(select 1 from jsonb_array_elements_text(q.payload->'fact_ids') i join public.financial_facts f on f.fact_id=i::uuid where f.issuer_id<>$2 or f.market<>'US')`,[pair,iss]);
   expect(bad).toEqual([]);
  });

  it('frozen expected keys: duplicates refused at creation; a key outside the frozen set is invalid_result; complete needs exact coverage (member_incomplete otherwise)',async()=>{
   const iss=await issuer();const pair=newPair();
   expect(await fails(openC(admin,pair,`${pair}-d`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'A',locator:{}},{naturalKey:'A',locator:{}}]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([]);
   const {iss:i2,r}=await published();const pair2=newPair();
   const cy=`${pair2}-c`;
   expect(await openC(admin,pair2,cy,[{issuer_id:i2,market:'US',expected_keys:[{naturalKey:'A',locator:{}},{naturalKey:'B',locator:{}}]}],[])).toMatchObject({created:true});
   const w=await batch(`reconcile.${pair2}`);const fence=(await claimM(pair2,cy,i2,w))!;
   await apply(fence,res('A',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}));
   expect(await fails(apply(fence,res('C',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect((await resultRows(pair2)).map(x=>x.natural_key)).toEqual(['A']);
   expect(await fails(complete(fence))).toMatchObject({message:'member_incomplete'});
   await apply(fence,res('B',{action:'quarantine_left',left_fact_id:r}));
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:1,not_compared:0});
  });

  it('passed=true only with outcome compared (invalid_result before any write); a non-compared result never sets or overwrites latest_result on an open mismatch',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:4}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   expect(await fails(apply(fence,res('k2',{left_fact_id:r,outcome:'right_missing',passed:true,right_value:null,abs_diff:null,rel_diff:null})))).toMatchObject({message:'invalid_result',code:'22023'});
   expect((await resultRows(pair)).map(x=>x.natural_key)).toEqual(['k1']);
   const lr=async()=>(await q(`select detail->'latest_result' lr from public.dq_quarantine where id=$1`,[a.item_id]))[0].lr;
   expect(await lr()).toMatchObject({passed:false});
   await apply(fence,res('k2',{left_fact_id:r,passed:true,right_value:'100',abs_diff:'0',rel_diff:'0',inputs_hash:'h2'}));
   expect(await lr()).toMatchObject({passed:true,inputs_hash:'h2'});
   await apply(fence,res('k3',{left_fact_id:r,outcome:'right_missing',right_value:null,abs_diff:null,rel_diff:null,inputs_hash:'h3'}));
   expect(await lr()).toMatchObject({passed:true,inputs_hash:'h2'});         // passing evidence not overwritten
  });

  it('a failing compare on a left row already quarantined for another reason still opens the reconcile_mismatch item (no visibility change) and generic promotion stays blocked',async()=>{
   const {iss,r}=await published();const pair=newPair();const cy=await cycle(pair,[{issuer_id:iss,expected:1}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   await q(`update public.financial_facts set status='quarantined' where fact_id=$1`,[r]);     // quarantined by something else
   const before=await rev(iss);
   const a=await apply(fence,res('k1',{action:'quarantine_left',left_fact_id:r}));
   expect(a).toMatchObject({reused:false,quarantined:0,materialize:null});
   expect(a.item_id).toBeTruthy();
   const [row]=await q(`select reason_code,status,payload,detail from public.dq_quarantine where id=$1`,[a.item_id]);
   expect(row).toMatchObject({reason_code:'reconcile_mismatch',status:'open'});
   expect(row.payload.fact_ids).toEqual([r]);
   expect(row.detail.latest_result).toMatchObject({passed:false});
   expect(row.detail.hook).toBeUndefined();
   expect(await rev(iss)).toBe(before);
   expect(await one(`select public.promote_quarantined($1,'US',$2::uuid[]) v`,[iss,[r]])).toBe(0);
   expect(await status(r)).toBe('quarantined');
  });

  it('two members creating the same review item key serialise: the second reuses the open item (no unique violation)',async()=>{
   const {iss:a1}=await published();const {iss:a2}=await published();const pair=newPair();
   const cy=await cycle(pair,[{issuer_id:a1,expected:1,keys:['kA']},{issuer_id:a2,expected:1,keys:['kB']}]);
   const w1=await batch(`reconcile.${pair}`),w2=await batch(`reconcile.${pair}`);
   const f1=(await claimM(pair,cy,a1,w1))!,f2=(await claimM(pair,cy,a2,w2))!;
   const nk=`${pair}:shared-item`;
   const mk=(key:string)=>res(key,{action:'review_item',item:{natural_key:nk,payload:{fact_ids:[],values:[]}}});
   let second:Promise<any>|undefined;let first:any;
   await inTx(admin,async({c,pid,commit})=>{
    first=(await c.query(`select public.apply_reconcile_result($1::jsonb,$2::jsonb) v`,[JSON.stringify(f1),JSON.stringify(mk('kA'))])).rows[0].v;
    second=apply(f2,mk('kB'));second.catch(()=>{});
    await stillBlockedBehind(admin,pid,second);
    await commit();
   });
   const sec=await second!;
   expect(sec.item_id).toBe(first.item_id);
   expect(await q(`select count(*)::int n from public.dq_quarantine where natural_key=$1 and status='open'`,[nk])).toEqual([{n:1}]);
  });

  it('open_reconcile_cycle freezes issuer_id as canonical uuid text (upper-case input works end to end); a non-uuid issuer_id and a natural key repeated across members are invalid_members',async()=>{
   const {iss}=await published();const pair=newPair();const cy=`${pair}-c`;
   const out=await openC(admin,pair,cy,[{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}],[]);
   expect(out.cycle.members).toEqual([{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'k1',locator:{}}]}]);
   const w=await batch(`reconcile.${pair}`);const fence=(await claimM(pair,cy,iss,w))!;
   expect(await apply(fence,res('k1',{passed:true,right_value:'100',abs_diff:'0',rel_diff:'0'}))).toMatchObject({reused:false});
   expect(await complete(fence)).toEqual({compared_passed:1,compared_failed:0,not_compared:0});
   const p2=newPair(),other=await issuer();
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:'not-a-uuid',market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[]},{issuer_id:iss.toUpperCase(),market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,p2,`${p2}-x`,[{issuer_id:iss,market:'US',expected_keys:[{naturalKey:'dup',locator:{}}]},{issuer_id:other,market:'US',expected_keys:['dup']}],[]))).toMatchObject({message:'invalid_members'});
   expect(await q(`select 1 from public.dq_reconcile_cycles where pair=$1`,[p2])).toEqual([]);
  });

  // ---- open_reconcile_cycle (section 13, plan audit Q2): atomic creation, per-entry consumption, the lock shared with set_merge
  type Opened={created:boolean;cycle:Record<string,any>;transferred:unknown[]};
  const openC=(c:Pool|PoolClient,pair:string,id:string,members:unknown[],pending:unknown[])=>
   c.query(`select public.open_reconcile_cycle($1,$2,now(),$3::jsonb,$4::jsonb) v`,[pair,id,JSON.stringify(members),JSON.stringify(pending)]).then(r=>r.rows[0].v as Opened);
  const LINEAGE='facts.lineage_same_day';
  const lid=()=>`${LINEAGE}-${randomUUID().slice(0,8)}`;
  /** inside a rolled-back transaction only: no running lineage cycle from another suite, plus a "latest" row set_merge writes to */
  const lineageStage=async(c:PoolClient,pending:unknown[])=>{
   await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[LINEAGE]);   // pair cycle lock FIRST, then cycle rows (same order as the runner / open_reconcile_cycle; avoids deadlock with the real lineage pair run in lineage.integration.test.ts)
   await c.query(`update public.dq_reconcile_cycles set status='complete', finished_at=now() where pair=$1 and status='running'`,[LINEAGE]);
   const id=`${LINEAGE}-old-${randomUUID().slice(0,8)}`;
   await c.query(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now()+interval '100 years',now()+interval '100 years','[]','complete',0,$3::jsonb)`,[LINEAGE,id,JSON.stringify({pending_members:pending})]);
   return id;
  };
  const pendingIn=async(c:Pool|PoolClient,pair:string,id:string)=>(await c.query(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id])).rows[0].detail as Record<string,unknown>;

  it('open_reconcile_cycle: cycle row and every cursor in one call; only the listed pending entries are consumed; a running cycle is returned unchanged',async()=>{
   const t1=await issuer(),t2=await issuer();
   const e1={issuer_id:t1,market:'US',source:randomUUID()},e2={issuer_id:t2,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e1,e2]);
    const id=lid();
    const out=await openC(c,LINEAGE,id,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k1',locator:{}},{naturalKey:'k2',locator:{}}]}],[e1]);
    expect(out).toMatchObject({created:true,transferred:[e1],cycle:{cycle_id:id,status:'running',expected_total:2,detail:{pending_merged_from:[old],pending_transferred:[e1]}}});
    expect((await c.query(`select issuer_id,market,expected,state from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[LINEAGE,id])).rows).toEqual([{issuer_id:t1,market:'US',expected:2,state:'pending'}]);
    expect(await pendingIn(c,LINEAGE,old)).toEqual({pending_members:[e2],pending_consumed_by:id});    // e2 was not listed: it waits for the next cycle
    const again=await openC(c,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[]}],[e2]);
    expect(again).toMatchObject({created:false,transferred:[],cycle:{cycle_id:id}});
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([e2]);                        // nothing consumed by the loser
   });
  });

  it('open_reconcile_cycle: a merge registered after the runner snapshot survives creation — neither overwritten nor consumed (stale-snapshot interleaving)',async()=>{
   const s=await issuer(),t=await issuer(),t0=await issuer(),by=await user();
   const e0={issuer_id:t0,market:'US',source:randomUUID()};
   await inRolledBackTx(admin,async c=>{
    const old=await lineageStage(c,[e0]);
    const snapshot=[e0];                                                          // the runner read pending_members here
    await c.query(`select public.set_merge($1,$2,$3)`,[s,t,by]);                  // a merge lands before the function runs
    const out=await openC(c,LINEAGE,lid(),[{issuer_id:t0,market:'US',expected_keys:[]}],snapshot);
    expect(out.transferred).toEqual([e0]);
    expect((out.cycle.members as {issuer_id:string}[]).map(m=>m.issuer_id)).toEqual([t0]);
    expect((await pendingIn(c,LINEAGE,old)).pending_members).toEqual([{issuer_id:t,market:'CN',source:s},{issuer_id:t,market:'US',source:s}]);
   });
  });

  it('open_reconcile_cycle and set_merge serialise on the cycle lock, both ways',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   let waiter:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    await c.query(`select public.set_merge($1,$2,$3)`,[s1,t1,by]);                // holds the cycle lock until this transaction ends
    waiter=inRolledBackTx(admin,async c2=>{await openC(c2,LINEAGE,lid(),[],[]);},1);waiter.catch(()=>{});
    await stillBlockedBehind(admin,pid,waiter);
   });                                                                              // rolled back: the merge never happened, the waiter proceeds
   await expect(waiter).resolves.toBeUndefined();
   let merger:Promise<unknown>|undefined;
   await inTx(admin,async({c,pid})=>{
    await openC(c,LINEAGE,lid(),[],[]);                                             // takes the cycle lock (created or not)
    merger=one(`select public.set_merge($1,$2,$3) v`,[s2,t2,by]);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
   });                                                                              // rolled back: no cycle was created
   await expect(merger).resolves.toEqual({repointed:0});
  });

  it('lock order (plan audit R1): a creator whose cycle contains the merge target and a concurrent set_merge into that target both complete, in either order — no deadlock',async()=>{
   const s1=await issuer(),t1=await issuer(),s2=await issuer(),t2=await issuer(),by=await user();
   const lockSql=`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`;
   // (a) the creator already holds the cycle lock and has not inserted its cursors yet; the merge arrives now.
   //     Fixed order: the merge waits on the advisory lock holding NO scope/issuer row; the creator's cursor
   //     insert for t1 (KEY SHARE on issuers via the FK) does not wait; both finish. Old order: the merge held
   //     t1 FOR UPDATE while waiting → 40P01 on one side.
   let merger:Promise<unknown>|undefined;let opened:Opened|undefined;
   await inTx(admin,async({c,pid})=>{
    await lineageStage(c,[]);
    await c.query(lockSql,[LINEAGE]);                                              // what open_reconcile_cycle takes first
    merger=inRolledBackTx(admin,async c2=>{
     expect((await c2.query(`select public.set_merge($1,$2,$3) v`,[s1,t1,by])).rows[0].v).toEqual({repointed:0});
    },1);merger.catch(()=>{});
    await stillBlockedBehind(admin,pid,merger);
    expect(await q(`select distinct l.locktype from pg_locks l join pg_stat_activity a on a.pid=l.pid where not l.granted and $1 = any(pg_blocking_pids(a.pid))`,[pid])).toEqual([{locktype:'advisory'}]);   // the merge waits on the advisory lock, not on a row
    opened=await openC(c,LINEAGE,lid(),[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[]);   // re-entrant advisory lock; cursor insert on t1
   });                                                                              // rolled back
   expect(opened).toMatchObject({created:true});
   await expect(merger).resolves.toBeUndefined();
   // (b) the merge into t2 runs first and holds every lock; the creator for a cycle containing t2 waits, then finishes.
   let creator:Promise<void>|undefined;
   await inTx(admin,async({c,pid})=>{
    expect((await c.query(`select public.set_merge($1,$2,$3) v`,[s2,t2,by])).rows[0].v).toEqual({repointed:0});
    creator=inRolledBackTx(admin,async c2=>{
     await lineageStage(c2,[]);
     expect(await openC(c2,LINEAGE,lid(),[{issuer_id:t2,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[])).toMatchObject({created:true});
    },1);creator.catch(()=>{});
    await stillBlockedBehind(admin,pid,creator);
   });                                                                              // rolled back: the creator proceeds
   await expect(creator).resolves.toBeUndefined();
  });

  it('open_reconcile_cycle: invalid members are refused; a creator that dies before commit leaves pending, cycle and cursors untouched, and the rerun consumes once (crash recovery)',async()=>{
   const t1=await issuer();const pair=newPair();
   const e1={issuer_id:t1,market:'US',source:randomUUID()};
   expect(await fails(openC(admin,pair,`${pair}-x`,[],[e1]))).toMatchObject({message:'invalid_members',code:'22023'});              // a pending entry without its resolved member
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US',expected_keys:[]},{issuer_id:t1,market:'US',expected_keys:[]}],[]))).toMatchObject({message:'invalid_members'});
   expect(await fails(openC(admin,pair,`${pair}-x`,[{issuer_id:t1,market:'US'}],[]))).toMatchObject({message:'invalid_members'});   // keys not resolved
   const old=`${pair}-old`;
   await q(`insert into public.dq_reconcile_cycles(pair,cycle_id,started_at,finished_at,members,status,expected_total,detail) values($1,$2,now(),now(),'[]','complete',0,$3::jsonb)`,[pair,old,JSON.stringify({pending_members:[e1]})]);
   await inRolledBackTx(admin,async c=>{await openC(c,pair,`${pair}-dead`,[{issuer_id:t1,market:'US',expected_keys:[]}],[e1]);});   // the creator dies before commit
   expect(await q(`select cycle_id from public.dq_reconcile_cycles where pair=$1`,[pair])).toEqual([{cycle_id:old}]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1`,[pair])).toEqual([{n:0}]);
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([e1]);
   expect(await openC(admin,pair,`${pair}-live`,[{issuer_id:t1,market:'US',expected_keys:[{naturalKey:'k',locator:{}}]}],[e1])).toMatchObject({created:true,transferred:[e1]});
   expect((await pendingIn(admin,pair,old)).pending_members).toEqual([]);
   expect(await q(`select count(*)::int n from public.dq_reconcile_cursor where pair=$1 and cycle_id=$2`,[pair,`${pair}-live`])).toEqual([{n:1}]);
  });

  // ---- Task 14b review: settle_reconcile_cycle / record_cycle_freshness
  const COUNTS={compared_passed:1,compared_failed:0,not_compared:0,exec_failed_members:0};
  const settleC=(pair:string,id:string,ok:boolean,status='complete')=>one(`select public.settle_reconcile_cycle($1,$2,$3,$4::jsonb,$5::jsonb) v`,[pair,id,status,JSON.stringify(COUNTS),JSON.stringify({status:'pending',ok,detail:{cycle_id:id}})]) as Promise<boolean>;
  const recordF=(pair:string,id:string,dataset:string,cadence:string,at:string)=>one(`select public.record_cycle_freshness($1,$2,$3,$4,$5::timestamptz) v`,[pair,id,dataset,cadence,at]) as Promise<string>;
  const freshRow=async(dataset:string)=>(await q(`select * from public.dq_freshness where dataset=$1`,[dataset]))[0];

  it('settle_reconcile_cycle: a pending_members entry committed while settlement waits on the cycle lock survives; only detail.freshness is added; a settled cycle answers false',async()=>{
   const pair=newPair(),i1=await issuer();const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
   const entry={issuer_id:i1,market:'US',source:randomUUID()};
   let settling:Promise<boolean>|undefined;
   await inTx(admin,async({c,pid,commit})=>{
    await c.query(`select pg_advisory_xact_lock(hashtext('dq_reconcile_cycle:'||$1))`,[pair]);   // what set_merge holds while it registers
    settling=settleC(pair,id,true);settling.catch(()=>{});
    await stillBlockedBehind(admin,pid,settling);
    await c.query(`update public.dq_reconcile_cycles set detail = jsonb_set(detail,'{pending_members}',$3::jsonb) where pair=$1 and cycle_id=$2`,[pair,id,JSON.stringify([entry])]);
    await commit();
   });
   await expect(settling).resolves.toBe(true);
   const [row]=await q(`select status,finished_at,detail,compared_passed from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id]);
   expect(row).toMatchObject({status:'complete',compared_passed:1,detail:{pending_members:[entry],freshness:{status:'pending',ok:true}}});
   expect(row.finished_at).not.toBeNull();
   expect(await settleC(pair,id,true)).toBe(false);
   expect(await fails(one(`select public.settle_reconcile_cycle($1,$2,'running','{}'::jsonb,'{}'::jsonb) v`,[pair,id]))).toMatchObject({message:'invalid_settlement',code:'22023'});
  });

  it('record_cycle_freshness: idempotent per cycle — the second call answers already and consecutive_errors moved once; running / unknown / unsettled-freshness cycles are refused softly',async()=>{
   const pair=newPair(),i1=await issuer(),i2=await issuer();const ds=`reconcile.${pair}`;
   const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('not_terminal');
   expect(await recordF(pair,'nope',ds,'weekly','2026-11-05T00:00:00Z')).toBe('not_found');
   expect(await settleC(pair,id,false,'complete_with_gaps')).toBe(true);
   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('recorded');
   expect(await recordF(pair,id,ds,'weekly','2026-11-05T00:00:00Z')).toBe('already');
   expect(await freshRow(ds)).toMatchObject({consecutive_errors:1,status:'missing',expected_cadence:'weekly',detail:{cycle_id:id}});
   expect((await q(`select detail from public.dq_reconcile_cycles where pair=$1 and cycle_id=$2`,[pair,id]))[0].detail).toMatchObject({freshness:{status:'recorded',ok:false}});
   // a terminal cycle without a freshness marker (legacy rows)
   const legacy=await cycle(pair,[{issuer_id:i2,expected:1}],'complete');
   expect(await recordF(pair,legacy,ds,'weekly','2026-11-06T00:00:00Z')).toBe('no_freshness');
   expect(await fails(recordF(pair,id,ds,'hourly','2026-11-05T00:00:00Z'))).toMatchObject({message:'invalid_freshness',code:'22023'});
   // two failed cycles recorded in order give the second consecutive error → error
   const id2=await cycle(pair,[{issuer_id:i2,expected:1}]);await settleC(pair,id2,false,'complete_with_gaps');
   expect(await recordF(pair,id2,ds,'weekly','2026-11-12T00:00:00Z')).toBe('recorded');
   expect(await freshRow(ds)).toMatchObject({consecutive_errors:2,status:'error'});
  });

  it('record_cycle_freshness: the SQL status / counters / last_ok_at equal the TS recordAttempt + computeFreshness on a table of cases',async()=>{
   const day=86_400_000,at=new Date('2026-11-20T00:00:00Z');
   const cases:{cadence:Cadence;ok:boolean;prior?:{lastOkAgeDays:number|null;errors:number}}[]=[
    {cadence:'weekly',ok:true},{cadence:'weekly',ok:false},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:null,errors:1}},
    {cadence:'weekly',ok:false,prior:{lastOkAgeDays:8,errors:0}},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:9,errors:0}},{cadence:'weekly',ok:false,prior:{lastOkAgeDays:10,errors:0}},
    {cadence:'daily',ok:false,prior:{lastOkAgeDays:3,errors:0}},{cadence:'daily',ok:false,prior:{lastOkAgeDays:4,errors:0}},
    {cadence:'monthly',ok:false,prior:{lastOkAgeDays:34,errors:0}},{cadence:'monthly',ok:false,prior:{lastOkAgeDays:35,errors:0}},
    {cadence:'quarterly',ok:false,prior:{lastOkAgeDays:95,errors:0}},{cadence:'quarterly',ok:false,prior:{lastOkAgeDays:96,errors:0}},
    {cadence:'event',ok:false,prior:{lastOkAgeDays:400,errors:0}},{cadence:'event',ok:false},
    {cadence:'weekly',ok:true,prior:{lastOkAgeDays:30,errors:5}},
   ];
   for(const [n,k] of cases.entries()){
    const pair=newPair(),i1=await issuer();const ds=`reconcile.${pair}`;const id=await cycle(pair,[{issuer_id:i1,expected:1}]);
    const prevOk=k.prior&&k.prior.lastOkAgeDays!==null?new Date(at.getTime()-k.prior.lastOkAgeDays*day):null;
    if(k.prior)await q(`insert into public.dq_freshness(dataset,expected_cadence,last_ok_at,last_attempt_at,consecutive_errors,status) values($1,$2,$3,$3,$4,$5)`,[ds,k.cadence,prevOk,k.prior.errors,prevOk?'fresh':'missing']);
    await settleC(pair,id,k.ok,k.ok?'complete':'complete_with_gaps');
    expect(await recordF(pair,id,ds,k.cadence,at.toISOString())).toBe('recorded');
    const errors=k.ok?0:(k.prior?.errors??0)+1,lastOk=k.ok?at:prevOk;
    const want=computeFreshness({cadence:k.cadence,lastOkAt:lastOk,consecutiveErrors:errors,now:at});
    const got=await freshRow(ds);
    expect({n,status:got.status,errors:got.consecutive_errors,lastOk:got.last_ok_at?new Date(got.last_ok_at).toISOString():null}).toEqual({n,status:want,errors,lastOk:lastOk?lastOk.toISOString():null});
   }
  });

  it('grants: cursor functions, apply_reconcile_result and open_reconcile_cycle are service_role only; the fence helper is closed to every role; replays',async()=>{
   const fn=(role:string,sig:string)=>one(`select has_function_privilege($1,$2,'EXECUTE') v`,[role,sig]);
   for(const sig of ['public.claim_reconcile_member(text,text,uuid,text,uuid)','public.complete_reconcile_member(jsonb)','public.fail_reconcile_member(jsonb,text)','public.apply_reconcile_result(jsonb,jsonb)','public.open_reconcile_cycle(text,text,timestamptz,jsonb,jsonb)','public.settle_reconcile_cycle(text,text,text,jsonb,jsonb)','public.record_cycle_freshness(text,text,text,text,timestamptz)']){
    for(const role of ['anon','authenticated'])expect({sig,role,ok:await fn(role,sig)}).toEqual({sig,role,ok:false});
    expect(await fn('service_role',sig)).toBe(true);
   }
   for(const role of ['anon','authenticated','service_role'])expect(await fn(role,'public.reconcile_fence_lock(jsonb)')).toBe(false);
   await expect(replayMigration(admin,sql())).resolves.toBeUndefined();
  },60000);
 });

 describe('Task 11: E8 on PostgreSQL',()=>{
  it('E8: an ambiguous_value item adopted through resolveFactsItem — the value is served by readFacts and financial_metrics.based_on_lineage moves; a repeat POST is already_resolved',async()=>{
   const db=pgFactsDb(admin);const tables=pgTableClient(admin);
   const {iss,b,run,f,fRef}=await published();
   const run2=await begin(iss,b);await stage(run2,[{filing_id:f,concept:'gross_profit',period_start:'2023-07-01',period_end:'2023-09-30',value:'40'}]);await publish(run2,[f]);
   await materialize(db,iss,'US',{today:'2030-01-01'});
   const m0=await db.metricsOfIssuer(iss,'US',FORMULA_VERSION);
   expect(m0.some(m=>m.metric==='gross_margin'&&m.period_end==='2023-09-30')).toBe(false);
   const cand=(value:string)=>({concept:'revenue',sourceConcept:'us-gaap:Revenues',statement:'IS',periodStart:'2023-07-01',periodEnd:'2023-09-30',duration:'3M',value,unit:'USD',consolidation:'consolidated',filingRef:fRef,rawHash:`h-${value}`});
   const id=randomUUID();
   await q(`insert into public.dq_quarantine(id,dataset,table_name,natural_key,reason_code,batch_id,payload) values($1,'facts.us','financial_facts',$2,'ambiguous_value',$3,$4::jsonb)`,
    [id,`${iss}:US:revenue:2023-07-01:2023-09-30:consolidated:USD:${fRef}:1`,b,JSON.stringify({key:{issuer_id:iss,market:'US'},candidates:[cand('110'),cand('111')],run_id:run})]);
   const by=await user();
   const row=async()=>(await tables.select('dq_quarantine',{id},{limit:1}))[0];
   const r=await resolveFactsItem(db,tables,await row(),{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:by,today:'2030-01-01'});
   expect(r).toMatchObject({outcome:'resolved',hook:{stage:'done',state:'done'}});
   const env=await db.readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01'});
   expect(env.rows.find(x=>x.fact_id===r.adoptedFactId)).toMatchObject({value:'110',is_current:true});
   const m1=await db.metricsOfIssuer(iss,'US',FORMULA_VERSION);
   expect(m1.find(m=>m.metric==='gross_margin'&&m.period_end==='2023-09-30')!.value).toBe('0.3636363636');
   expect(m1[0].based_on_lineage).toEqual([{issuer_id:iss,state_rev:await rev(iss)}]);
   expect(m1[0].based_on_lineage).not.toEqual(m0[0].based_on_lineage);
   expect((await row()).detail).toMatchObject({chosen_candidate_index:0,adopted_fact_id:r.adoptedFactId,hook:{stage:'done',state:'done'}});
   expect((await resolveFactsItem(db,tables,await row(),{status:'resolved_accept',chosenCandidateIndex:0,resolvedBy:by})).outcome).toBe('already_resolved');
  },60000);
 });
});
