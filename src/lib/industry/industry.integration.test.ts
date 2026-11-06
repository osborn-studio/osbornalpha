// src/lib/industry/industry.integration.test.ts
// I-0 (spec §4.3, §4.8, §13.2): migration 20261111090000 on real PostgreSQL — tables, the altered
// classification and membership tables (old exclusion gone, membership_id key, deferrable successor
// FK, per-level exclusion over ok rows), constraints, the bucket, the licence defaults, the weekly
// cadence, table privileges (service_role holds no write on protected tables) and the licence gate
// with real roles in three states (internal → public → internal). Rows are written as the admin
// role in an order the triggers of 20261111091000 accept (runs inserted in their final state, rows
// stamped at insert), because the functions are Task 2's subject. Isolation on the shared database:
// every scenario uses a private classification version 't…' with its own licence row; only the
// marks scenario toggles a real licence row (marks:tushare-daily_basic) and restores it. Rows are
// never cleaned up (memberships are append-only; test:db uses a fresh database per run).
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261111090000_industry_research.sql';
const PROTECTED=['industry_metric_runs','industry_metrics','industry_valuation_runs','industry_valuations','industry_valuation_pairs','industry_run_dependencies','industry_manifests',
 'security_marks','industry_official_valuations','industry_fetch_events','industry_observation_receipts','issuer_industry_memberships','industry_source_memberships'];
const TABLES=[...PROTECTED,'industry_classifications','industry_dataset_licenses','industry_sync_scope'];
const LICENSED=['industry_classifications','issuer_industry_memberships','industry_metric_runs','industry_metrics','industry_valuation_runs','industry_valuations','security_marks'];
const SERVICE_ONLY=TABLES.filter(t=>!LICENSED.includes(t));
const hex=(n:number)=>randomBytes(n).toString('hex');

// Same replay policy as facts.integration.test.ts (not exported there): one transaction, short
// lock_timeout, retry on lock timeout (55P03) and deadlock (40P01).
const RETRYABLE=new Set(['55P03','40P01']);
async function replayMigration(pool:Pool,sql:string,attempts=10):Promise<void>{
 for(let attempt=1;;attempt++){
  const c=await pool.connect();
  try{
   await c.query(`begin; set local lock_timeout='3s';\n${sql}\n;commit;`);
   return;
  }catch(e){
   await c.query('rollback').catch(()=>{});
   const code=(e as {code?:string}).code;
   if(attempt>=attempts||!code||!RETRYABLE.has(code))throw e;
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
  }finally{c.release();}
 }
}
type PgErr={message:string;code?:string};
/** Resolves with the rejection (message + SQLSTATE) so tests can assert both. */
const fails=(p:Promise<unknown>)=>p.then(()=>{throw new Error('expected rejection');},e=>e as PgErr);

describe.skipIf(!enabled)('I-0 industry research migration on real PostgreSQL',()=>{
 let admin:Pool;
 const q=async(text:string,values:unknown[]=[])=>(await admin.query(text,values)).rows as Record<string,any>[];
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_zh) values($1,'行业测试')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'industry-test','industry.test')`,[id]);return id;};
 const ticker=async()=>{const t=`ZZ${hex(4).toUpperCase()}`;await q(`insert into public.stocks_universe(ticker,name,market) values($1,'Industry Test','A')`,[t]);return t;};
 /** A private sw2021 version with nodes A1 > A11 and B1, and its own internal licence row. */
 const version=async()=>{
  const v=`t${hex(4)}`;
  await q(`insert into public.industry_dataset_licenses(dataset_key,status,decided_by) values($1,'internal','industry-test')`,[`scheme:sw2021:${v}`]);
  await q(`insert into public.industry_classifications(scheme,version,code,level,name_zh,parent_code) values('sw2021',$1,'A1',1,'甲',null),('sw2021',$1,'B1',1,'乙',null),('sw2021',$1,'A11',2,'甲一','A1')`,[v]);
  return v;
 };
 const setLicence=(key:string,status:string)=>q(`update public.industry_dataset_licenses set status=$2 where dataset_key=$1`,[key,status]);
 const membership=(iss:string,v:string,b:string,o:Record<string,unknown>={})=>{
  const r:Record<string,unknown>={membership_id:randomUUID(),issuer_id:iss,scheme:'sw2021',version:v,code:'A1',level:1,valid_from:'2021-07-30',available_date:'2021-07-30',source:'test',batch_id:b,...o};
  const k=Object.keys(r);return q(`insert into public.issuer_industry_memberships(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c])).then(()=>r.membership_id as string);
 };
 const run=async(v:string,b:string,status:string,generation:number)=>{
  const id=randomUUID();
  await q(`insert into public.industry_metric_runs(run_id,scheme,version,level,generation,facts_as_of,knowledge_date,history_class,method_version,config_hash,formula_version,code_version,expected_grid,fingerprint_at,batch_id,status,activated_at)
   values($1,'sw2021',$2,1,$3,'2025-03-31','2025-03-31','reconstruction','industry-agg/1.0','c','f','test','{"codes":["A1"],"period_ends":["2024-12-31"],"metrics":["member_count"]}',now(),$4,$5,case when $5 in ('active','superseded') then now() end)`,[id,v,generation,b,status]);
  return id;
 };
 const manifest=async()=>{const h=hex(32);await q(`insert into public.industry_manifests(manifest_hash,kind,byte_length,object_path) values($1,'aggregate',10,'sha256/'||$1||'/'||gen_random_uuid()||'.json.gz')`,[h]);return h;};
 const metricRow=(runId:string,o:Record<string,unknown>={})=>{
  const r:Record<string,unknown>={run_id:runId,code:'A1',metric:'member_count',period_start:'2024-12-31',period_end:'2024-12-31',duration:'INSTANT',status:'missing',missing_reason:'no_members',unit:'count',n_members:0,n_with_data:0,n_unresolved:0,...o};
  const k=Object.keys(r);return q(`insert into public.industry_metrics(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));
 };
 const fetchEvent=async(b:string)=>{const id=randomUUID();await q(`insert into public.industry_fetch_events(fetch_event_id,job,params,batch_id) values($1,'marks','{}',$2)`,[id,b]);return id;};
 const asRole=async<T>(role:string,body:(c:PoolClient)=>Promise<T>):Promise<T>=>{
  const c=await admin.connect();
  try{await c.query(`set role ${role}`);return await body(c);}
  finally{await c.query('reset role').catch(()=>{});c.release();}
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{await admin?.end();});

 it('creates every table with RLS, the bucket, the licence defaults and the weekly cadence, keeps issuers_cninfo_idx, and replays twice',async()=>{
  const rows=await q(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES]);
  expect(rows.map(r=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows)expect({t:r.relname,rls:r.relrowsecurity,force:r.relforcerowsecurity}).toEqual({t:r.relname,rls:true,force:false});
  expect(await q(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='industry-manifests'`)).toEqual([{id:'industry-manifests',public:false,file_size_limit:'20971520',allowed_mime_types:['application/gzip']}]);
  expect(await q(`select dataset_key,status from public.industry_dataset_licenses where dataset_key=any($1) order by dataset_key`,[['scheme:sw2021:2021','scheme:sic:sec-current','marks:tushare-daily_basic','official:tushare-sw_daily']]))
   .toEqual([{dataset_key:'marks:tushare-daily_basic',status:expect.any(String)},{dataset_key:'official:tushare-sw_daily',status:'internal'},{dataset_key:'scheme:sic:sec-current',status:'public'},{dataset_key:'scheme:sw2021:2021',status:'internal'}]);
  expect(await one(`select count(*)::int v from pg_indexes where schemaname='public' and indexname='issuers_cninfo_idx'`)).toBe(1);   // V11: reused, no twin
  expect(await one(`select count(*)::int v from pg_indexes where schemaname='public' and tablename='issuers' and indexdef like '%cninfo_org_id%'`)).toBe(1);
  const d='industry.test-'+hex(4);
  await q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'weekly','missing')`,[d]);
  expect((await fails(q(`insert into public.dq_freshness(dataset,expected_cadence,status) values($1,'hourly','missing')`,[d+'x']))).message).toMatch(/dq_freshness_expected_cadence_check/);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
  expect(await one(`select status v from public.industry_dataset_licenses where dataset_key='scheme:sic:sec-current'`)).toBe('public');
 },60000);

 it('issuer_industry_memberships: old exclusion dropped, membership_id primary key, deferrable successor FK, both classification FKs, partial key and per-level exclusion over ok rows',async()=>{
  const cons=await q(`select conname,contype,condeferrable,condeferred,pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.issuer_industry_memberships'::regclass order by conname`);
  const by=(n:string)=>cons.find(c=>c.conname===n);
  expect(by('issuer_industry_memberships_no_overlap')).toBeUndefined();
  expect(by('issuer_industry_memberships_pkey')).toMatchObject({contype:'p',def:'PRIMARY KEY (membership_id)'});
  expect(by('issuer_industry_memberships_superseded_by_fkey')).toMatchObject({contype:'f',condeferrable:true,condeferred:true});
  expect(by('issuer_industry_memberships_scheme_version_code_fkey')).toMatchObject({contype:'f'});
  expect(by('issuer_industry_memberships_classification_level_fkey')?.def).toBe('FOREIGN KEY (scheme, version, code, level) REFERENCES industry_classifications(scheme, version, code, level)');
  expect(by('issuer_industry_memberships_one_per_level')?.def).toMatch(/^EXCLUDE USING gist .*WHERE \(\(status = 'ok'::text\)\)$/);
  expect(await one(`select indexdef v from pg_indexes where indexname='issuer_industry_memberships_ok_key'`)).toMatch(/UNIQUE INDEX .* \(issuer_id, scheme, version, code, valid_from\) WHERE \(status = 'ok'::text\)/);
  const v=await version();const b=await batch();const iss=await issuer();
  const m1=await membership(iss,v,b);
  expect((await fails(membership(iss,v,b,{code:'B1',valid_from:'2022-01-01'}))).message).toMatch(/issuer_industry_memberships_one_per_level/);
  expect((await fails(membership(iss,v,b,{valid_to:'2022-01-01'}))).message).toMatch(/issuer_industry_memberships_to_available_pair/);
  const early={valid_from:'2019-01-01',available_date:'2019-01-01',valid_to:'2020-01-01',valid_to_available_date:'2020-01-01'};   // no overlap: the FK (checked after the exclusion) decides
  expect((await fails(membership(iss,v,b,{...early,code:'A11',level:1}))).message).toMatch(/issuer_industry_memberships_classification_level_fkey/);
  expect((await fails(membership(iss,v,b,{...early,code:'ZZ',level:1}))).message).toMatch(/issuer_industry_memberships_(scheme_version_code|classification_level)_fkey/);
  expect((await fails(membership(iss,v,b,{batch_id:randomUUID(),code:'A11',level:2}))).message).toMatch(/issuer_industry_memberships_batch_id_fkey/);
  await membership(iss,v,b,{code:'A11',level:2});                                   // another level: no overlap
  // ok→superseded needs the successor in the same update (CHECK); the successor may be inserted later in the transaction (deferred FK)
  expect((await fails(q(`update public.issuer_industry_memberships set status='superseded' where membership_id=$1`,[m1]))).message).toMatch(/issuer_industry_memberships_superseded_pair/);
  const c=await admin.connect();
  try{
   const m2=randomUUID();
   await c.query('begin');
   await c.query(`update public.issuer_industry_memberships set status='superseded',superseded_by=$2 where membership_id=$1`,[m1,m2]);
   await c.query(`insert into public.issuer_industry_memberships(membership_id,issuer_id,scheme,version,code,level,valid_from,valid_to,available_date,valid_to_available_date,source,batch_id) values($1,$2,'sw2021',$3,'A1',1,'2021-07-30','2024-01-02','2021-07-30','2024-01-02','test',$4)`,[m2,iss,v,b]);
   await c.query('commit');
   expect((await q(`select membership_id,status,superseded_by from public.issuer_industry_memberships where issuer_id=$1 and code='A1' order by status`,[iss])).map(r=>[r.status,r.superseded_by])).toEqual([['ok',null],['superseded',m2]]);
   await c.query('begin');
   await c.query(`update public.issuer_industry_memberships set status='superseded',superseded_by=$2 where membership_id=$1`,[m2,randomUUID()]);
   expect((await fails(c.query('commit'))).message).toMatch(/issuer_industry_memberships_superseded_by_fkey/);   // checked at commit
  }finally{await c.query('rollback').catch(()=>{});c.release();}
  expect(await one(`select status v from public.issuer_industry_memberships where code='A1' and issuer_id=$1 and valid_to is not null`,[iss])).toBe('ok');
 });

 it('new tables: named constraints, generated decimal text, partial unique keys',async()=>{
  const v=await version();const b=await batch();const t=await ticker();const e=await fetchEvent(b);
  const markIns=(o:Record<string,unknown>)=>{const r:Record<string,unknown>={ticker:t,trade_date:'2001-02-01',fetch_event_id:e,observed_at:'2001-02-01T00:00:00Z',close:'10.50',total_share:'1000',source:'tushare:daily_basic',upstream:'szse',raw_hash:'h',locator:{},batch_id:b,...o};
   const k=Object.keys(r);return q(`insert into public.security_marks(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')}) returning market_cap_text,close_text`,k.map(c=>r[c]));};
  expect(await markIns({})).toEqual([{market_cap_text:'10500.00',close_text:'10.50'}]);
  expect((await fails(markIns({trade_date:'2001-02-02',close:'0'}))).message).toMatch(/security_marks_close_check/);
  expect((await fails(markIns({}))).message).toMatch(/security_marks_event_key/);
  expect((await fails(markIns({fetch_event_id:await fetchEvent(b)}))).message).toMatch(/security_marks_current_uidx/);
  expect((await fails(markIns({trade_date:'2001-02-03',upstream:'nyse'}))).message).toMatch(/security_marks_upstream_check/);
  const src=(o:Record<string,unknown>)=>{const r:Record<string,unknown>={id:randomUUID(),scheme:'sw2021',version:'2021',source:'s',ts_code:`Z${hex(3)}.SZ`,l1_code:'L1',l2_code:'L2',l3_code:'L3',in_date:'2021-07-30',observed_at:'2026-11-06T00:00:00Z',batch_id:b,raw_hash:'h',locator:{},status:'current',...o};
   const k=Object.keys(r);return q(`insert into public.industry_source_memberships(${k.join(',')}) values(${k.map((_,i)=>`$${i+1}`).join(',')})`,k.map(c=>r[c]));};
  await src({ts_code:'ZDUP.SZ',source:`s-${hex(3)}`});
  expect((await fails(src({ts_code:'ZDUP.SZ',source:'s',scheme:'sw2014'}))).message).toMatch(/industry_source_memberships_scheme_check/);
  expect((await fails(src({status:'superseded'}))).message).toMatch(/industry_source_memberships_superseded_pair/);
  const s1=`s-${hex(3)}`;await src({ts_code:'ZK.SZ',source:s1});
  expect((await fails(src({ts_code:'ZK.SZ',source:s1}))).message).toMatch(/industry_source_memberships_current_key/);
  const r=await run(v,b,'building',1);const m=await manifest();
  expect((await fails(metricRow(r,{status:'ok',missing_reason:null,manifest_hash:m}))).message).toMatch(/industry_metrics_ok_value/);
  expect((await fails(metricRow(r,{status:'ok',missing_reason:null,value:'1'}))).message).toMatch(/industry_metrics_ok_manifest/);
  expect((await fails(metricRow(r,{missing_reason:null}))).message).toMatch(/industry_metrics_missing_reason/);
  expect((await fails(metricRow(r,{metric:'pe'}))).message).toMatch(/industry_metrics_metric_check/);
  expect((await fails(metricRow(r,{missing_reason:'no_data'}))).message).toMatch(/industry_metrics_missing_reason_check/);
  expect((await fails(metricRow(r,{status:'ok',missing_reason:null,value:'1',manifest_hash:hex(32)}))).message).toMatch(/industry_metrics_manifest_hash_fkey/);
  await metricRow(r,{status:'ok',missing_reason:null,value:'0.1234567890',manifest_hash:m,unit:'ratio'});
  expect(await one(`select value_text v from public.industry_metrics where run_id=$1`,[r])).toBe('0.1234567890');
  expect((await fails(run(v,b,'building',1))).message).toMatch(/industry_metric_runs_generation_key/);
  await run(v,b,'active',2);
  expect((await fails(run(v,b,'active',3))).message).toMatch(/industry_metric_runs_active_uidx/);
  expect((await fails(q(`insert into public.industry_metric_runs(run_id,scheme,version,level,generation,facts_as_of,knowledge_date,history_class,method_version,config_hash,formula_version,code_version,expected_grid,fingerprint_at,batch_id,status)
   values($1,'sw2021',$2,1,9,'2025-03-31','2025-03-31','reconstruction','m','c','f','x','{}',now(),$3,'superseded')`,[randomUUID(),v,b]))).message).toMatch(/industry_metric_runs_activated_iff/);
  const vr=randomUUID();
  await q(`insert into public.industry_valuation_runs(run_id,scheme,version,level,generation,method_version,config_hash,formula_version,code_version,expected_dates,comparator_basis,recompute_from,fingerprint_at,batch_id,status) values($1,'sw2021',$2,1,1,'m','c','f','x','[]','unknown','2024-01-01',now(),$3,'building')`,[vr,v,b]);
  const vrun=(gen:number,status:string)=>q(`insert into public.industry_valuation_runs(run_id,scheme,version,level,generation,method_version,config_hash,formula_version,code_version,expected_dates,comparator_basis,recompute_from,fingerprint_at,batch_id,status,published_at,activated_at)
   values($1,'sw2021',$2,1,$3,'m','c','f','x','[]','unknown','2024-01-01',now(),$4,$5,case when $5<>'building' then now() end,case when $5 in ('active','superseded') then now() end)`,[randomUUID(),v,gen,b,status]);
  expect((await fails(vrun(1,'building'))).message).toMatch(/industry_valuation_runs_generation_key/);
  await vrun(2,'active');
  expect((await fails(vrun(3,'active'))).message).toMatch(/industry_valuation_runs_active_uidx/);
  expect((await fails(q(`insert into public.industry_valuation_runs(run_id,scheme,version,level,generation,method_version,config_hash,formula_version,code_version,expected_dates,comparator_basis,recompute_from,fingerprint_at,batch_id,status) values($1,'sw2021',$2,1,4,'m','c','f','x','[]','unknown','2024-01-01',now(),$3,'published')`,[randomUUID(),v,b]))).message).toMatch(/industry_valuation_runs_published_at/);
  expect((await fails(q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,published) values($1,'sw2021',$2,'A1','2024-12-31','pb','ok',1,'2024-12-31',true)`,[vr,v]))).message).toMatch(/industry_valuations_published_requires/);
  expect((await fails(q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,mcap_coverage) values($1,'sw2021',$2,'A1','2024-12-31','pb','ok',1,'2024-12-31',1.5)`,[vr,v]))).message).toMatch(/industry_valuations_mcap_coverage_check/);
  expect((await fails(q(`insert into public.industry_valuation_pairs(run_id,scheme,version,code,trade_date,metric,pair_status) values($1,'sw2021',$2,'A1','2024-12-31','pb','close')`,[vr,v]))).message).toMatch(/industry_valuation_pairs_pair_status_check/);
  expect((await fails(q(`insert into public.industry_manifests(manifest_hash,kind,byte_length,object_path) values('XYZ','aggregate',1,'sha256/XYZ/x.json.gz')`))).message).toMatch(/industry_manifests_manifest_hash_check/);
  expect((await fails(q(`insert into public.industry_manifests(manifest_hash,kind,byte_length,object_path) values($1,'aggregate',1,$2)`,[hex(32),`sha256/${hex(32)}.json.gz`]))).message).toMatch(/industry_manifests_object_path_check/);
  expect((await fails(q(`insert into public.industry_classifications(scheme,version,code,level,name_en,attributes) values('sic',$1,'0100',1,'x','[]')`,[v]))).message).toMatch(/industry_classifications_attributes_object/);
  await q(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('sic',$1,'0100',1,'Crops')`,[v]);
  expect((await fails(q(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('naics',$1,'11',1,'x')`,[v]))).message).toMatch(/industry_classifications_scheme_check/);
 });

 it('privileges: protected tables give service_role SELECT only and client roles at most SELECT; classifications keep service insert/update; the SIC schedule is service read/write',async()=>{
  const priv=(role:string,t:string,p:string)=>one(`select has_table_privilege($1,'public.'||$2,$3) v`,[role,t,p]);
  for(const t of PROTECTED){
   expect({t,ok:await priv('service_role',t,'SELECT')}).toEqual({t,ok:true});
   for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE'])expect({t,p,ok:await priv('service_role',t,p)}).toEqual({t,p,ok:false});
  }
  for(const role of ['anon','authenticated'])for(const t of TABLES){
   expect({role,t,ok:await priv(role,t,'SELECT')}).toEqual({role,t,ok:LICENSED.includes(t)});
   for(const p of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])expect({role,t,p,ok:await priv(role,t,p)}).toEqual({role,t,p,ok:false});
  }
  expect([await priv('service_role','industry_classifications','INSERT'),await priv('service_role','industry_classifications','UPDATE'),await priv('service_role','industry_classifications','DELETE'),await priv('service_role','industry_classifications','TRUNCATE')]).toEqual([true,true,false,false]);
  expect([await priv('service_role','industry_dataset_licenses','SELECT'),await priv('service_role','industry_dataset_licenses','UPDATE')]).toEqual([true,false]);
  expect([await priv('service_role','industry_sync_scope','INSERT'),await priv('service_role','industry_sync_scope','UPDATE'),await priv('service_role','industry_sync_scope','DELETE'),await priv('service_role','industry_sync_scope','TRUNCATE')]).toEqual([true,true,true,false]);
  const b=await batch();const iss=await issuer();
  await asRole('service_role',async c=>{
   for(const t of PROTECTED)expect({t,code:(await fails(c.query(`truncate public.${t}`))).code}).toEqual({t,code:'42501'});
   expect((await fails(c.query(`insert into public.industry_manifests(manifest_hash,kind,byte_length,object_path) values($1,'aggregate',1,'x')`,[hex(32)]))).code).toBe('42501');
   expect((await fails(c.query(`update public.industry_dataset_licenses set status='public' where dataset_key='scheme:sw2021:2021'`))).code).toBe('42501');
   expect((await fails(c.query(`delete from public.industry_classifications where scheme='custom'`))).code).toBe('42501');
   await c.query(`insert into public.industry_sync_scope(issuer_id,job) values($1,'sic')`,[iss]);
   expect((await c.query(`update public.industry_sync_scope set lease_until=now()+interval '1 minute',lease_batch_id=$2 where issuer_id=$1`,[iss,b])).rowCount).toBe(1);
  });
  for(const role of ['anon','authenticated'])await asRole(role,async c=>{
   for(const t of SERVICE_ONLY)expect({role,t,code:(await fails(c.query(`select 1 from public.${t} limit 1`))).code}).toEqual({role,t,code:'42501'});
  });
 },60000);

 it('licence gate with real roles: internal → public → internal; only ok memberships, active runs, rows of active runs and published valuations; anon and authenticated alike',async()=>{
  const v=await version();const key=`scheme:sw2021:${v}`;const b=await batch();const iss=await issuer();
  await membership(iss,v,b);
  const qm=await membership(iss,v,b,{code:'A11',level:2});
  await q(`update public.issuer_industry_memberships set status='quarantined' where membership_id=$1`,[qm]);
  const m=await manifest();
  const active=await run(v,b,'active',1);const failed=await run(v,b,'failed',2);const building=await run(v,b,'building',3);
  const at=await one(`select activated_at v from public.industry_metric_runs where run_id=$1`,[active]);
  await metricRow(active,{status:'ok',missing_reason:null,value:'2',manifest_hash:m,n_members:2,n_with_data:2,updated_at:at});
  for(const r of [failed,building])await metricRow(r);
  const vr=randomUUID();
  await q(`insert into public.industry_valuation_runs(run_id,scheme,version,level,generation,method_version,config_hash,formula_version,code_version,expected_dates,comparator_basis,recompute_from,fingerprint_at,batch_id,status,published_at,activated_at)
   values($1,'sw2021',$2,1,1,'m','c','f','x','["2024-12-31","2025-01-31"]','ttm','2024-01-01',now(),$3,'active',now(),now())`,[vr,v,b]);
  await q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,series_qualified,published,updated_at)
   values($1,'sw2021',$2,'A1','2024-12-31','pb','ok',1.5,'2024-12-31',true,true,now()),($1,'sw2021',$2,'A1','2025-01-31','pb','ok',1.6,'2025-01-31',true,false,now())`,[vr,v]);
  const counts=async(role:string)=>asRole(role,async c=>{
   const n=async(sql:string,values:unknown[])=>Number((await c.query(sql,values)).rows[0].n);
   return {
    classes:await n(`select count(*) n from public.industry_classifications where version=$1`,[v]),
    members:await n(`select count(*) n from public.issuer_industry_memberships where version=$1`,[v]),
    runs:await n(`select count(*) n from public.industry_metric_runs where version=$1`,[v]),
    metrics:await n(`select count(*) n from public.industry_metrics where run_id=any($1::uuid[])`,[[active,failed,building]]),
    vruns:await n(`select count(*) n from public.industry_valuation_runs where version=$1`,[v]),
    vals:await n(`select count(*) n from public.industry_valuations where version=$1`,[v]),
    visible:(await c.query(`select public.industry_metric_run_visible($1) a,public.industry_metric_run_visible($2) f,public.industry_valuation_run_visible($3) vr`,[active,failed,vr])).rows[0],
   };
  });
  const none={classes:0,members:0,runs:0,metrics:0,vruns:0,vals:0,visible:{a:false,f:false,vr:false}};
  for(const role of ['anon','authenticated'])expect({role,...await counts(role)}).toEqual({role,...none});
  await setLicence(key,'public');
  for(const role of ['anon','authenticated'])expect({role,...await counts(role)}).toEqual({role,classes:3,members:1,runs:1,metrics:1,vruns:1,vals:1,visible:{a:true,f:false,vr:true}});
  await setLicence(key,'internal');
  for(const role of ['anon','authenticated'])expect({role,...await counts(role)}).toEqual({role,...none});
 },60000);

 it('marks licence: security_marks are readable only while marks:tushare-daily_basic is public, ok rows only',async()=>{
  const b=await batch();const t=await ticker();const e=await fetchEvent(b);
  await q(`insert into public.security_marks(ticker,trade_date,fetch_event_id,observed_at,close,total_share,source,upstream,raw_hash,locator,batch_id,status) values($1,'2001-03-01',$2,now(),1,1,'s','sse','h','{}',$3,'ok'),($1,'2001-03-02',$2,now(),1,1,'s','sse','h','{}',$3,'quarantined')`,[t,e,b]);
  const seen=()=>asRole('anon',async c=>Number((await c.query(`select count(*) n from public.security_marks where ticker=$1`,[t])).rows[0].n));
  const before=await one(`select status v from public.industry_dataset_licenses where dataset_key='marks:tushare-daily_basic'`);
  try{
   await setLicence('marks:tushare-daily_basic','internal');expect(await seen()).toBe(0);
   await setLicence('marks:tushare-daily_basic','public');expect(await seen()).toBe(1);
   await setLicence('marks:tushare-daily_basic','internal');expect(await seen()).toBe(0);
  }finally{await setLicence('marks:tushare-daily_basic',before);}
 });

 it('scheme public and official internal: no relation readable by anon carries an official value',async()=>{
  const v=await version();await setLicence(`scheme:sw2021:${v}`,'public');const b=await batch();const e=await fetchEvent(b);
  const marker='987654.321987';
  const off=randomUUID();
  await q(`insert into public.industry_official_valuations(observation_id,scheme,version,code,trade_date,metric,fetch_event_id,value,observed_at,source,upstream,raw_hash,batch_id) values($1,'sw2021',$2,'A1','2024-12-31','pe',$3,$4,now(),'tushare:sw_daily','swsresearch','h',$5)`,[off,v,e,marker,b]);
  const vr=randomUUID();
  await q(`insert into public.industry_valuation_runs(run_id,scheme,version,level,generation,method_version,config_hash,formula_version,code_version,expected_dates,comparator_basis,recompute_from,fingerprint_at,batch_id,status,published_at,activated_at)
   values($1,'sw2021',$2,1,1,'m','c','f','x','["2024-12-31"]','ttm','2024-01-01',now(),$3,'active',now(),now())`,[vr,v,b]);
  await q(`insert into public.industry_valuations(run_id,scheme,version,code,trade_date,metric,status,value,facts_as_of,series_qualified,published,updated_at) values($1,'sw2021',$2,'A1','2024-12-31','pe_ttm','ok',12.5,'2024-12-31',true,true,now())`,[vr,v]);
  await q(`insert into public.industry_valuation_pairs(run_id,scheme,version,code,trade_date,metric,official_observation_id,official_value,rel_diff,pair_status) values($1,'sw2021',$2,'A1','2024-12-31','pe_ttm',$3,$4,0.001,'within')`,[vr,v,off,marker]);
  const rels=(await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p') and has_table_privilege('anon',c.oid,'SELECT') order by 1`)).map(r=>r.relname as string);
  expect(rels).toEqual(expect.arrayContaining(['industry_valuations','industry_metrics','security_marks']));
  expect(rels).not.toContain('industry_valuation_pairs');expect(rels).not.toContain('industry_official_valuations');
  await asRole('anon',async c=>{
   expect(Number((await c.query(`select count(*) n from public.industry_valuations where run_id=$1`,[vr])).rows[0].n)).toBe(1);   // the cell is visible …
   for(const t of rels){
    const hit=await c.query(`select count(*)::int n from public.${t} x where strpos(x::text,$1) > 0`,[marker]).then(r=>r.rows[0].n as number,()=>0);
    expect({t,hit}).toEqual({t,hit:0});                                                                                          // … its official value is nowhere
   }
  });
 },60000);
});
