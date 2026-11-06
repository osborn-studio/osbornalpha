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

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261107091000_facts_extensions.sql';
const PLAN2='supabase/migrations/20261106090000_financial_facts.sql';

// Same replay policy as facts.integration.test.ts (not exported there).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);return;}
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
   expect(await fails(replace([{issuer_id:s,state_rev:2}]))).toMatchObject({message:'invalid_based_on'});              // must contain p_issuer
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
});
