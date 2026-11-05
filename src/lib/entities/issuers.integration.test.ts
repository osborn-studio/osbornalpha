// src/lib/entities/issuers.integration.test.ts
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

const enabled=!!process.env.S4_TEST_STATE;
const MIGRATION='supabase/migrations/20261105091000_issuers.sql';
const TABLES=['issuers','issuer_securities','issuer_identifier_claims','industry_classifications','issuer_industry_memberships'];
const PUBLIC_TABLES=TABLES.filter(t=>t!=='issuer_identifier_claims');
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const randomCik=()=>String(1+Math.floor(Math.random()*9))+String(Math.floor(Math.random()*1e9)).padStart(9,'0');

// Replays a migration in one transaction with a short lock_timeout, retrying lock timeouts
// (55P03) and deadlocks (40P01). The issuers migration alters research_entity_keys and
// research_entity_securities, which other DB suites use concurrently; without a timeout the ALTER
// would queue behind (and block) their locks.
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
   await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));   // jittered backoff: other suites hold locks on the shared DB
  }finally{c.release();}
 }
}

describe.skipIf(!enabled)('WP-F1a issuers on real PostgreSQL',()=>{
 let admin:Pool;
 const issuers:string[]=[];
 const tickers:string[]=[];
 const classifications:string[]=[];
 const newIssuer=async(cols='',vals='',params:unknown[]=[])=>{
  const id=randomUUID();issuers.push(id);
  await admin.query(`insert into public.issuers(issuer_id,canonical_name_en${cols}) values($1,'Test Co'${vals})`,[id,...params]);
  return id;
 };
 // Tickers enter the cleanup list only after their own insert succeeded. US tickers use a ZZ
 // prefix no seed uses; an A-share code can collide with seed data, so it is inserted with
 // ON CONFLICT DO NOTHING and the caller skips that case (returns null) rather than adopting it.
 const newTicker=async(kind:'US'|'A'):Promise<string|null>=>{
  const t=kind==='US'?'ZZ'+hex(4):String(100000+Math.floor(Math.random()*900000))+'.SH';
  const inserted=(await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,'Issuer Test',$2) on conflict (ticker) do nothing returning ticker`,[t,kind])).rows;
  if(inserted.length!==1) return null;
  tickers.push(t);
  return t;
 };
 const usTicker=async()=>{const t=await newTicker('US');if(!t) throw new Error('ZZ test ticker collided');return t;};
 const sec=(issuer:string,ticker:string,from:string,to:string|null,extraCols='',extraVals='',params:unknown[]=[])=>admin.query(`insert into public.issuer_securities(issuer_id,ticker,valid_from,valid_to,source${extraCols}) values($1,$2,$3,$4,'test'${extraVals})`,[issuer,ticker,from,to,...params]);
 const newVersion=async()=>{
  const version='t'+hex(4);
  await admin.query(`insert into public.industry_classifications(scheme,version,code,level,name_en) values('custom',$1,'10',1,'Energy')`,[version]);
  classifications.push(version);
  return version;
 };
 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
 });
 afterAll(async()=>{
  if(admin){
   // Child and link FKs are RESTRICT: children first, merged issuers before their targets.
   await admin.query(`delete from public.issuer_industry_memberships where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.issuer_securities where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[]) and merged_into is not null`,[issuers]);
   await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.industry_classifications where scheme='custom' and version=any($1)`,[classifications]);
   await admin.query(`delete from public.stocks_universe where ticker=any($1)`,[tickers]);
   await admin.end();
  }
 },30000);

 it('creates five tables with RLS, public-read policies on four, none on claims, link columns, and replays',async()=>{
  const rows=(await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1)`,[TABLES])).rows;
  expect(rows.map((r:{relname:string})=>r.relname).sort()).toEqual([...TABLES].sort());
  for(const r of rows) expect(r.relrowsecurity).toBe(true);
  const policies=(await admin.query(`select tablename,policyname from pg_policies where schemaname='public' and tablename=any($1) order by tablename`,[TABLES])).rows;
  expect(policies).toEqual([...PUBLIC_TABLES].sort().map(t=>({tablename:t,policyname:`${t} public read`})));
  const cols=(await admin.query(`select table_name,column_name,data_type from information_schema.columns where table_schema='public' and ((table_name='research_entity_keys' and column_name='issuer_id') or (table_name='research_entity_securities' and column_name='ticker')) order by table_name`)).rows;
  expect(cols).toEqual([{table_name:'research_entity_keys',column_name:'issuer_id',data_type:'uuid'},{table_name:'research_entity_securities',column_name:'ticker',data_type:'text'}]);
  await expect(replayMigration(admin,readFileSync(MIGRATION,'utf8'))).resolves.toBeUndefined();
 },60000);

 it('enforces named issuer constraints',async()=>{
  const cik=randomCik();
  const a=await newIssuer(',cik',',$2',[cik]);
  await expect(newIssuer(',cik',',$2',[cik])).rejects.toThrow(/issuers_cik_idx/);
  await expect(newIssuer(',cik',',$2',['0123'])).rejects.toThrow(/issuers_cik_check/);
  await expect(admin.query(`insert into public.issuers(issuer_id) values($1)`,[randomUUID()])).rejects.toThrow(/issuers_has_name/);
  await expect(admin.query(`update public.issuers set status='merged',merged_into=issuer_id where issuer_id=$1`,[a])).rejects.toThrow(/issuers_merged_not_self/);
  await expect(newIssuer(',status',`,'merged'`)).rejects.toThrow(/issuers_merged_iff_status/);
  await expect(newIssuer(',merged_into',',$2',[a])).rejects.toThrow(/issuers_merged_iff_status/);
  await expect(newIssuer(',provenance',`,'[]'::jsonb`)).rejects.toThrow(/issuers_provenance_object/);
  await newIssuer(',status,merged_into',`,'merged',$2`,[a]);
 },30000);

 it('enforces security ownership windows, identifiers and foreign keys',async()=>{
  const a=await newIssuer();
  const b=await newIssuer();
  const us=await usTicker();
  const cn=await newTicker('A')??await usTicker();
  await sec(a,us,'2020-01-01','2022-01-01');
  await expect(sec(b,us,'2020-01-01',null)).rejects.toThrow(/issuer_securities_ticker_valid_from_key/);
  await sec(b,us,'2022-01-01',null);
  await expect(sec(a,us,'2023-01-01',null)).rejects.toThrow(/issuer_securities_open_owner_idx/);
  await expect(sec(a,cn,'2020-01-01','2020-01-01')).rejects.toThrow(/issuer_securities_window/);
  await expect(sec(a,'ZZNOPE'+hex(4),'2020-01-01',null)).rejects.toThrow(/issuer_securities_ticker_fkey/);
  await expect(sec(a,cn,'2020-01-01',null,',figi',',$5',['XYZ123'])).rejects.toThrow(/issuer_securities_figi_check/);
  await expect(sec(a,cn,'2020-01-01',null,',share_class',`,'B'`)).rejects.toThrow(/issuer_securities_share_class_check/);
  await expect(sec(a,cn,'2020-01-01',null,',isin',',$5',['CN12345'])).rejects.toThrow(/issuer_securities_isin_check/);
  await sec(a,cn,'2020-01-01',null,',isin,figi,share_class,is_primary',`,$5,$6,'A',true`,['CNE'+hex(4)+'7','BBG'+hex(4).slice(0,8)+'0']);
  await expect(admin.query(`delete from public.stocks_universe where ticker=$1`,[cn])).rejects.toThrow(/issuer_securities_ticker_fkey/);
  await expect(admin.query(`delete from public.issuers where issuer_id=$1`,[a])).rejects.toThrow(/issuer_securities_issuer_id_fkey/);
  const owners=(await admin.query(`select issuer_id,valid_to from public.issuer_securities where ticker=$1 order by valid_from`,[us])).rows;
  expect(owners.map((r:{issuer_id:string})=>r.issuer_id)).toEqual([a,b]);

  const claim=(id_type:string,confidence:number,value='X',status='pending')=>admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence,status) values($1,$2,$3,$4,'test',$5,$6)`,[randomUUID(),a,id_type,value,confidence,status]);
  await claim('lei',0.9);
  await expect(claim('lei',0.8)).rejects.toThrow(/issuer_identifier_claims_pending_unique/);
  await claim('lei',0.8,'X','rejected');
  await claim('cik',0.7,'Y','accepted');
  await claim('cik',0.7,'Y','rejected');
  await claim('cik',0.6,'Y');
  const claims=(await admin.query(`select id_type,value,status from public.issuer_identifier_claims where issuer_id=$1 order by id_type,status`,[a])).rows;
  expect(claims).toEqual([{id_type:'cik',value:'Y',status:'accepted'},{id_type:'cik',value:'Y',status:'pending'},{id_type:'cik',value:'Y',status:'rejected'},{id_type:'lei',value:'X',status:'pending'},{id_type:'lei',value:'X',status:'rejected'}]);
  await expect(claim('ticker',0.5)).rejects.toThrow(/issuer_identifier_claims_id_type_check/);
  await expect(claim('cik',1.5)).rejects.toThrow(/issuer_identifier_claims_confidence_check/);

  const version=await newVersion();
  await expect(admin.query(`insert into public.industry_classifications(scheme,version,code,level) values('custom',$1,'11',1)`,[version])).rejects.toThrow(/industry_classifications_has_name/);
  const mem=(code:string)=>admin.query(`insert into public.issuer_industry_memberships(issuer_id,scheme,version,code,valid_from,source) values($1,'custom',$2,$3,'2020-01-01','test')`,[a,version,code]);
  await mem('10');
  await expect(mem('99')).rejects.toThrow(/issuer_industry_memberships_scheme_version_code_fkey/);
 },30000);

 it('rejects overlapping ownership windows and accepts adjacent ones',async()=>{
  const a=await newIssuer();
  const b=await newIssuer();
  const t1=await usTicker();
  await sec(a,t1,'2020-01-01','2022-01-01');
  await expect(sec(b,t1,'2021-01-01','2023-01-01')).rejects.toThrow(/issuer_securities_no_overlap/);
  await expect(sec(b,t1,'2021-06-01',null)).rejects.toThrow(/issuer_securities_no_overlap/);
  await expect(sec(b,t1,'2019-01-01','2020-06-01')).rejects.toThrow(/issuer_securities_no_overlap/);
  await expect(sec(b,t1,'2019-01-01',null)).rejects.toThrow(/issuer_securities_no_overlap/);
  const t2=await usTicker();
  await sec(a,t2,'2020-01-01','2021-01-01');
  await sec(b,t2,'2021-01-01',null);
  const rows=(await admin.query(`select issuer_id,valid_from::text,valid_to::text from public.issuer_securities where ticker=$1 order by valid_from`,[t2])).rows;
  expect(rows).toEqual([{issuer_id:a,valid_from:'2020-01-01',valid_to:'2021-01-01'},{issuer_id:b,valid_from:'2021-01-01',valid_to:null}]);
 },30000);

 it('rejects one ISIN on two tickers over overlapping windows and accepts sequential ones',async()=>{
  const a=await newIssuer();
  const b=await newIssuer();
  const isin='USZ'+hex(4)+'5';
  const [t1,t2,t3]=[await usTicker(),await usTicker(),await usTicker()];
  await sec(a,t1,'2020-01-01','2022-01-01',',isin',',$5',[isin]);
  await expect(sec(b,t2,'2021-01-01','2023-01-01',',isin',',$5',[isin])).rejects.toThrow(/issuer_securities_isin_no_overlap/);
  await expect(sec(b,t2,'2021-06-01',null,',isin',',$5',[isin])).rejects.toThrow(/issuer_securities_isin_no_overlap/);
  await expect(sec(b,t2,'2019-01-01','2020-06-01',',isin',',$5',[isin])).rejects.toThrow(/issuer_securities_isin_no_overlap/);
  await sec(b,t2,'2022-01-01','2024-01-01',',isin',',$5',[isin]);
  await sec(a,t3,'2024-01-01',null,',isin',',$5',[isin]);
  const rows=(await admin.query(`select issuer_id,ticker,valid_from::text from public.issuer_securities where isin=$1 order by valid_from`,[isin])).rows;
  expect(rows).toEqual([{issuer_id:a,ticker:t1,valid_from:'2020-01-01'},{issuer_id:b,ticker:t2,valid_from:'2022-01-01'},{issuer_id:a,ticker:t3,valid_from:'2024-01-01'}]);
 },30000);

 it('enforces the merge and ownership lifecycle',async()=>{
  const a=await newIssuer();
  const b=await newIssuer();
  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,a])).rejects.toThrow(/merge_target_not_active/);
  const c=await newIssuer();
  await expect(newIssuer(',status,merged_into',`,'merged',$2`,[a])).rejects.toThrow(/merge_target_not_active/);
  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[c]);
  await expect(newIssuer(',status,merged_into',`,'merged',$2`,[c])).rejects.toThrow(/merge_target_not_active/);
  const t=await usTicker();
  await expect(sec(a,t,'2021-01-01',null)).rejects.toThrow(/issuer_not_active/);
  await sec(a,t,'2020-01-01','2021-01-01');
  await expect(admin.query(`update public.issuer_securities set valid_to=null where issuer_id=$1 and ticker=$2`,[a,t])).rejects.toThrow(/issuer_not_active/);
  await sec(b,t,'2021-01-01',null);
 },30000);

 it('rejects merge chains: an issuer that others merged into cannot itself be merged or dissolved',async()=>{
  const a=await newIssuer(),b=await newIssuer(),c=await newIssuer();
  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c])).rejects.toThrow(/merge_target_has_referrers/);
  await expect(admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[b])).rejects.toThrow(/merge_target_has_referrers/);
  // Re-point the referrer first, then the former target can be retired.
  await admin.query(`update public.issuers set merged_into=$2 where issuer_id=$1`,[a,c]);
  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[b,c]);
  const rows=(await admin.query(`select issuer_id,status,merged_into from public.issuers where issuer_id=any($1::uuid[]) order by issuer_id`,[[a,b,c]])).rows;
  expect(rows).toEqual([{issuer_id:a,status:'merged',merged_into:c},{issuer_id:b,status:'merged',merged_into:c},{issuer_id:c,status:'active',merged_into:null}].sort((x,y)=>x.issuer_id.localeCompare(y.issuer_id)));
 },30000);

 it('refuses to retire an issuer that still holds an open security row',async()=>{
  const a=await newIssuer(),b=await newIssuer();
  const t=await usTicker();
  await sec(a,t,'2020-01-01',null);
  await expect(admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a])).rejects.toThrow(/open_securities_exist/);
  await expect(admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b])).rejects.toThrow(/open_securities_exist/);
  await admin.query(`update public.issuer_securities set valid_to='2024-01-01' where issuer_id=$1 and ticker=$2`,[a,t]);
  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[a]);
  expect((await admin.query(`select status from public.issuers where issuer_id=$1`,[a])).rows[0].status).toBe('dissolved');
 },30000);

 it('enforces the industry hierarchy and membership windows',async()=>{
  const version=await newVersion();
  const cls=(code:string,parent:string|null)=>admin.query(`insert into public.industry_classifications(scheme,version,code,level,name_en,parent_code) values('custom',$1,$2,2,'Sub',$3)`,[version,code,parent]);
  await expect(cls('20','20')).rejects.toThrow(/industry_classifications_parent_not_self/);
  await expect(cls('21','99')).rejects.toThrow(/industry_classifications_parent_fkey/);
  await cls('1010','10');
  const a=await newIssuer();
  const mem=(from:string,to:string|null)=>admin.query(`insert into public.issuer_industry_memberships(issuer_id,scheme,version,code,valid_from,valid_to,source) values($1,'custom',$2,'1010',$3,$4,'test')`,[a,version,from,to]);
  await mem('2020-01-01','2022-01-01');
  await expect(mem('2021-01-01',null)).rejects.toThrow(/issuer_industry_memberships_no_overlap/);
  await expect(mem('2023-01-01','2023-01-01')).rejects.toThrow(/issuer_industry_memberships_window/);
  await mem('2022-01-01',null);
 },30000);

 it('grants client roles SELECT only on public tables and nothing on claims',async()=>{
  for(const role of ['anon','authenticated']){
   for(const t of PUBLIC_TABLES) for(const [priv,want] of [['SELECT',true],['INSERT',false],['UPDATE',false],['DELETE',false],['TRUNCATE',false]] as const){
    const allowed=(await admin.query(`select has_table_privilege($1,'public.'||$2,$3) ok`,[role,t,priv])).rows[0].ok;
    expect({role,t,priv,allowed}).toEqual({role,t,priv,allowed:want});
   }
   for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
    const allowed=(await admin.query(`select has_table_privilege($1,'public.issuer_identifier_claims',$2) ok`,[role,priv])).rows[0].ok;
    expect({role,priv,allowed}).toEqual({role,priv,allowed:false});
   }
  }
  for(const t of TABLES) for(const priv of ['SELECT','INSERT','UPDATE','DELETE']){
   const ok=(await admin.query(`select has_table_privilege('service_role','public.'||$1,$2) ok`,[t,priv])).rows[0].ok;
   expect({t,priv,ok}).toEqual({t,priv,ok:true});
  }
  const seeded=await newIssuer();
  for(const role of ['anon','authenticated']){
   const c=await admin.connect();
   try{
    await c.query(`set role ${role}`);
    const rows=(await c.query(`select issuer_id from public.issuers where issuer_id=$1`,[seeded])).rows;
    expect({role,rows}).toEqual({role,rows:[{issuer_id:seeded}]});
    await expect(c.query(`select * from public.issuer_identifier_claims`)).rejects.toThrow(/permission denied/);
    await expect(c.query(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'x')`,[randomUUID()])).rejects.toThrow(/permission denied/);
   }finally{
    await c.query('reset role').catch(()=>{});
    c.release();
   }
  }
 },30000);
});
