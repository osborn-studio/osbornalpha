// src/lib/entities/issuers-write.integration.test.ts
// The issuer write path (upsertIssuerByIdentifiers, attachSecurity, fileClaim) on the real schema
// through pgTableClient: unique indexes, the no-overlap exclusion, lifecycle triggers and the
// pending-claim unique index raise real SQLSTATEs instead of memory-client simulations.
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import type {TableClient} from '../db/table-client';
import {fileClaim} from './claims';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';

const enabled=!!process.env.S4_TEST_STATE;
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const randomCik=()=>String(1+Math.floor(Math.random()*9))+String(Math.floor(Math.random()*1e9)).padStart(9,'0');
/** ISO 17442: 18 random characters + two mod-97 check digits. */
const randomLei=()=>{
 const base=hex(9);
 const digits=(base+'00').replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
 let r=0;for(const d of digits)r=(r*10+Number(d))%97;
 return base+String(98-r).padStart(2,'0');
};

describe.skipIf(!enabled)('issuer write path on real PostgreSQL',()=>{
 let admin:Pool;
 let db:TableClient;
 const issuers:string[]=[];
 const tickers:string[]=[];
 const track=(id:string|null)=>{if(id)issuers.push(id);return id;};
 const usTicker=async()=>{
  const t='ZZ'+hex(4);
  const inserted=(await admin.query(`insert into public.stocks_universe(ticker,name,market) values($1,'Issuer Write Test','US') on conflict (ticker) do nothing returning ticker`,[t])).rows;
  if(inserted.length!==1)throw new Error('ZZ test ticker collided');
  tickers.push(t);
  return t;
 };
 const newIssuer=async(name='ZZ Write Test')=>{
  const out=await upsertIssuerByIdentifiers(db,{cik:randomCik(),canonical_name_en:name,provenance:{cik:{source:'test'}}});
  expect(out.created).toBe(true);
  return track(out.issuer_id)!;
 };
 const pendingClaims=async(issuer:string)=>(await admin.query(`select id_type,value from public.issuer_identifier_claims where issuer_id=$1 and status='pending' order by id_type,value`,[issuer])).rows;
 const sec=(issuer_id:string,ticker:string,valid_from:string,valid_to:string|null=null)=>({issuer_id,ticker,share_class:'common' as const,valid_from,valid_to,source:'test'});
 /** Hides existing ownership rows from the first pre-insert read, so the insert races the DB constraint. */
 const blindFirstRead=(seen:{code?:string|null})=>{
  let blind=true;
  const wrapped:TableClient={...db,
   select:async(t,m,o)=>{if(t==='issuer_securities'&&blind){blind=false;return [];}return db.select(t,m,o);},
   insert:async(t,r)=>{try{return await db.insert(t,r);}catch(e){seen.code=(e as {code?:string|null}).code;throw e;}},
  };
  return wrapped;
 };

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  db=pgTableClient(admin);
 });
 afterAll(async()=>{
  if(admin){
   // RESTRICT FKs: children first, merged issuers before their targets, tickers last.
   await admin.query(`delete from public.issuer_securities where issuer_id=any($1::uuid[]) or ticker=any($2)`,[issuers,tickers]);
   await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[]) and merged_into is not null`,[issuers]);
   await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[])`,[issuers]);
   await admin.query(`delete from public.stocks_universe where ticker=any($1)`,[tickers]);
   await admin.end();
  }
 },30000);

 it('creates, enriches with provenance, and turns a hard-id mismatch into exactly one pending claim',async()=>{
  const cik=randomCik(),lei=randomLei(),other=randomLei();
  const created=await upsertIssuerByIdentifiers(db,{cik,canonical_name_en:'ZZ Enrich Co',provenance:{cik:{source:'sec'}}});
  const id=track(created.issuer_id)!;
  expect(created.created).toBe(true);
  expect(await upsertIssuerByIdentifiers(db,{cik,lei,country_code:'US',canonical_name_zh:'测试',provenance:{lei:{source:'gleif'}}})).toEqual({issuer_id:id,created:false});
  const row=(await admin.query(`select lei,cik,country_code,canonical_name_en,canonical_name_zh,provenance from public.issuers where issuer_id=$1`,[id])).rows[0];
  expect(row).toEqual({lei,cik,country_code:'US',canonical_name_en:'ZZ Enrich Co',canonical_name_zh:'测试',provenance:{cik:{source:'sec'},lei:{source:'gleif'}}});
  for(let i=0;i<2;i++)expect(await upsertIssuerByIdentifiers(db,{cik,lei:other,provenance:{lei:{source:'test'}}})).toEqual({issuer_id:null,created:false,conflict:true,reason:'hard_id_mismatch'});
  expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:other}]);
  expect((await admin.query(`select lei from public.issuers where issuer_id=$1`,[id])).rows[0].lei).toBe(lei);
 });

 it('rejects creating a nameless issuer before the database check would',async()=>{
  await expect(upsertIssuerByIdentifiers(db,{cik:randomCik()})).rejects.toThrow('name_required');
 });

 it('returns hard_id_mismatch when another issuer takes the LEI between lookup and enrichment (real 23505)',async()=>{
  const id=await newIssuer();
  const cik=(await admin.query(`select cik from public.issuers where issuer_id=$1`,[id])).rows[0].cik as string;
  const lei=randomLei();
  let thief:string|null=null;
  const racing:TableClient={...db,update:async(t,m,p)=>{
   if(t==='issuers'&&'lei' in m&&!thief){
    thief=track(randomUUID());
    await admin.query(`insert into public.issuers(issuer_id,canonical_name_en,lei) values($1,'ZZ Thief',$2)`,[thief,lei]);
   }
   return db.update(t,m,p);
  }};
  expect(await upsertIssuerByIdentifiers(racing,{cik,lei,canonical_name_en:'Never Written'})).toEqual({issuer_id:null,created:false,conflict:true,reason:'hard_id_mismatch'});
  expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:lei}]);
  expect((await admin.query(`select lei,canonical_name_en from public.issuers where issuer_id=$1`,[id])).rows[0]).toEqual({lei:null,canonical_name_en:'ZZ Write Test'});
 });

 it('dedupes claims through the pending-unique index even when the pre-check misses',async()=>{
  const id=await newIssuer();
  const lei=randomLei();
  expect(await fileClaim(db,{issuer_id:id,id_type:'lei',value:lei,source:'test'})).toBe(true);
  const blindCount:TableClient={...db,count:async()=>0};
  expect(await fileClaim(blindCount,{issuer_id:id,id_type:'lei',value:lei,source:'test'})).toBe(false);
  await expect(admin.query(`insert into public.issuer_identifier_claims(id,issuer_id,id_type,value,source,confidence) values($1,$2,'lei',$3,'test',0.5)`,[randomUUID(),id,lei]))
   .rejects.toThrow(/issuer_identifier_claims_pending_unique/);
  expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:lei}]);
 });

 it('classifies attachSecurity as inserted/duplicate/conflict, including closed history before an open owner',async()=>{
  const a=await newIssuer(),b=await newIssuer(),c=await newIssuer();
  const t=await usTicker();
  expect(await attachSecurity(db,sec(a,t,'2010-01-01'))).toBe('inserted');
  expect(await attachSecurity(db,sec(a,t,'2010-01-01'))).toBe('duplicate');
  expect(await attachSecurity(db,sec(a,` ${t.toLowerCase()} `,'2015-01-01'))).toBe('duplicate');
  expect(await attachSecurity(db,{...sec(b,t,'2020-01-01'),isin:'US0378331005'})).toBe('conflict');
  expect(await pendingClaims(b)).toEqual([{id_type:'isin',value:'US0378331005'}]);
  // Closed history ending exactly where the open owner starts: half-open windows do not overlap.
  expect(await attachSecurity(db,sec(b,t,'2000-01-01','2005-01-01'))).toBe('inserted');
  expect(await attachSecurity(db,sec(c,t,'2005-01-01','2010-01-01'))).toBe('inserted');
  expect(await attachSecurity(db,sec(b,t,'2000-01-01','2005-01-01'))).toBe('duplicate');
  expect(await attachSecurity(db,sec(b,t,'2000-01-01','2006-01-01'))).toBe('conflict');
  expect(await attachSecurity(db,sec(c,t,'2008-01-01','2012-01-01'))).toBe('conflict');
  const rows=(await admin.query(`select issuer_id,valid_from::text,valid_to::text from public.issuer_securities where ticker=$1 order by valid_from`,[t])).rows;
  expect(rows).toEqual([{issuer_id:b,valid_from:'2000-01-01',valid_to:'2005-01-01'},{issuer_id:c,valid_from:'2005-01-01',valid_to:'2010-01-01'},{issuer_id:a,valid_from:'2010-01-01',valid_to:null}]);
 });

 it('maps real constraint races: closed overlap by another issuer (23P01) and a second open owner (23505) become conflict',async()=>{
  const a=await newIssuer(),b=await newIssuer();
  const t=await usTicker();
  expect(await attachSecurity(db,sec(a,t,'2010-01-01'))).toBe('inserted');
  const overlap:{code?:string|null}={};
  expect(await attachSecurity(blindFirstRead(overlap),sec(b,t,'2008-01-01','2012-01-01'))).toBe('conflict');
  expect(overlap.code).toBe('23P01');
  const open:{code?:string|null}={};
  expect(await attachSecurity(blindFirstRead(open),sec(b,t,'2020-01-01'))).toBe('conflict');
  expect(open.code).toBe('23505');
  const replay:{code?:string|null}={};
  expect(await attachSecurity(blindFirstRead(replay),sec(a,t,'2010-01-01'))).toBe('duplicate');
  expect(replay.code).toBe('23505');
  expect(Number((await admin.query(`select count(*) from public.issuer_securities where ticker=$1`,[t])).rows[0].count)).toBe(1);
 });

 it('rejects an open security on an issuer merged into an active one with issuer_not_active, but keeps closed history',async()=>{
  const a=await newIssuer(),b=await newIssuer();
  await admin.query(`update public.issuers set status='merged',merged_into=$2 where issuer_id=$1`,[a,b]);
  const t=await usTicker();
  await expect(attachSecurity(db,sec(a,t,'2020-01-01'))).rejects.toThrow(/^issuer_not_active$/);
  expect(await attachSecurity(db,sec(a,t,'2000-01-01','2005-01-01'))).toBe('inserted');
  expect(await attachSecurity(db,sec(b,t,'2020-01-01'))).toBe('inserted');
 });

 it('returns inactive_issuer for a dissolved hit and claims only the ids it does not hold',async()=>{
  const id=await newIssuer();
  const cik=(await admin.query(`select cik from public.issuers where issuer_id=$1`,[id])).rows[0].cik as string;
  await admin.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[id]);
  const lei=randomLei();
  expect(await upsertIssuerByIdentifiers(db,{cik,lei,canonical_name_en:'Zombie'})).toEqual({issuer_id:null,created:false,conflict:true,reason:'inactive_issuer'});
  expect(await pendingClaims(id)).toEqual([{id_type:'lei',value:lei}]);
 });
});
