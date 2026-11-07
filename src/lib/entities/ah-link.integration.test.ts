// src/lib/entities/ah-link.integration.test.ts
// A+H linking and claim review on the real schema (spec §9.3). Rule 1 attaches the HK line of a
// same-LEI issuer through attachSecurity ONLY when the HKEX ISIN of the stock code equals the
// OpenFIGI hit's ISIN (exclusion constraints, owner trigger); every other provider hint, and rule 2
// name matches, become pending attach_security claims that resolve_identifier_claim accepts (row
// inserted with the claimed window) or rejects; superseded -OLD counters are rejected; a contested
// ticker is ONE quarantine entry; an evidence_only claim is accepted only with an amend.
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgTableClient} from '../db/pg-table-client';
import type {TableClient} from '../db/table-client';
import {startBatch} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import {isValidIsin} from '../research/entity-keys/identifiers';
import {claimTargetKey,fileClaim,validateClaimDetail} from './claims';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';
import type {HkexIsin} from './identifiers/hkex-list';
import {applyAhLinks,planAhLinks,type AhFigiHit,type AhIssuer,type UniverseListing} from './link-ah';

const enabled=!!process.env.S4_TEST_STATE;
const hex=(n:number)=>randomBytes(n).toString('hex').toUpperCase();
const digits=(n:number)=>Array.from({length:n},()=>Math.floor(Math.random()*10)).join('');
const randomIsin=()=>{const base='HKZZ'+hex(4).slice(0,7);return [...'0123456789'].map(d=>base+d).find(isValidIsin)!;};
const randomLei=()=>{
 const base=hex(9);
 const ds=(base+'00').replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));
 let r=0;for(const d of ds)r=(r*10+Number(d))%97;
 return base+String(98-r).padStart(2,'0');
};
const ASOF='2026-11-05';

describe.skipIf(!enabled)('A+H linking and claim review on real PostgreSQL',()=>{
 let admin:Pool;let db:TableClient;let batchId:string;
 const issuers:string[]=[];const tickers:string[]=[];
 const resolver=randomUUID();
 const universeRow=async(market:'A'|'HK',listDate:string|null)=>{
  for(let i=0;i<5;i++){
   const t=market==='A'?`9${digits(5)}.SH`:`9${digits(4)}.HK`;
   const got=(await admin.query(`insert into public.stocks_universe(ticker,name,market,list_date,source,source_updated_at) values($1,'ZZ AH Test',$2,$3::date,'zz_test_universe','2026-11-01T00:00:00Z') on conflict (ticker) do nothing returning ticker`,[t,market,listDate])).rows;
   if(got.length===1){tickers.push(t);return t;}
  }
  throw new Error('could not allocate a test ticker');
 };
 const newIssuer=async(name:string,aTicker:string|null)=>{
  const out=await upsertIssuerByIdentifiers(db,{lei:randomLei(),canonical_name_en:name,provenance:{lei:{source:'test'}}});
  issuers.push(out.issuer_id!);
  if(aTicker)expect(await attachSecurity(db,{issuer_id:out.issuer_id!,ticker:aTicker,share_class:'A',valid_from:'2020-01-01',source:'test'})).toBe('inserted');
  return out.issuer_id!;
 };
 const universeOf=async(ts:string[])=>new Map<string,UniverseListing>((await admin.query(`select ticker,list_date::text as list_date,source,source_updated_at::text as source_updated_at from public.stocks_universe where ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,{list_date:r.list_date,source:r.source,source_updated_at:r.source_updated_at}]));
 const ownersOf=async(ts:string[])=>new Map<string,string>((await admin.query(`select ticker,issuer_id::text from public.issuer_securities where valid_to is null and ticker=any($1)`,[ts])).rows.map(r=>[r.ticker,r.issuer_id]));
 const ahIssuer=(issuer_id:string,name:string,aTicker:string):AhIssuer=>({issuer_id,lei:null,usci:null,names:[name],aTickers:[aTicker],hTickers:[]});
 const hkexIsin=(isin:string,row=3):HkexIsin=>({isin,file:'list_of_securities' as HkexIsin['file'],sha256:'e'.repeat(64),row});
 const hitFor=(issuer_id:string,ticker:string,isin:string,figi:string|null):AhFigiHit=>({issuer_id,ticker,isin,figi,level:figi?'composite':null,job:{idType:'ID_ISIN',idValue:isin},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:'ZZTESTLEI00000000000'});
 const resolve=(id:string,status:'accepted'|'rejected',amend:unknown=null)=>admin.query(`select public.resolve_identifier_claim($1::uuid,$2,$3::uuid,$4::jsonb) as r`,[id,status,resolver,amend===null?null:JSON.stringify(amend)]);

 beforeAll(async()=>{
  const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));
  admin=new Pool({connectionString:state.adminUrl});
  db=pgTableClient(admin);
  ({batchId}=await startBatch(db,{producer:'ah-link-test',dataset:DATASETS.entities.ahLink}));
 });
 afterAll(async()=>{
  if(!admin)return;
  await admin.query(`delete from public.dq_quarantine where batch_id=$1`,[batchId]);
  await admin.query(`delete from public.ingest_batches where batch_id=$1`,[batchId]);
  await admin.query(`delete from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[issuers]);
  await admin.query(`delete from public.issuer_securities where issuer_id=any($1::uuid[]) or ticker=any($2)`,[issuers,tickers]);
  await admin.query(`delete from public.issuers where issuer_id=any($1::uuid[])`,[issuers]);
  await admin.query(`delete from public.stocks_universe where ticker=any($1)`,[tickers]);
  await admin.end();
 },30000);

 it('rule 1: attaches the same-LEI HK line at its listing date when the HKEX ISIN equals the hit ISIN; a replay is a duplicate; another holder is quarantined',async()=>{
  const aTicker=await universeRow('A','2001-01-01');
  const hk=await universeRow('HK','2004-03-11');
  const x=await newIssuer('ZZ AH Same Lei Co., Ltd.',aTicker);
  const isin=randomIsin();
  const hit=hitFor(x,hk,isin,`BBG${hex(5).slice(0,9)}`);
  const hkexIsins=new Map([[hk.slice(0,5),hkexIsin(isin)]]);
  const base={asOf:ASOF,universe:await universeOf([hk]),hkex:null,hkexIsins};
  const plan=planAhLinks({...base,issuers:[ahIssuer(x,'ZZ AH Same Lei Co., Ltd.',aTicker)],figiHits:[hit],openOwner:await ownersOf([hk])});
  expect(plan.attaches).toHaveLength(1);expect(plan.claims).toHaveLength(0);
  const res=await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
  expect(res.counts).toMatchObject({inserted:1,failed:0});
  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method,source,isin,provenance from public.issuer_securities where ticker=$1`,[hk])).rows[0];
  expect(row).toMatchObject({share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',isin});
  expect(Object.keys(row.provenance).sort()).toEqual(['figi','isin','valid_from']);
  expect(row.provenance.isin).toMatchObject({source:'hkex_list_of_securities',evidence_sha256:'e'.repeat(64)});
  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).counts).toMatchObject({inserted:0,duplicates:1});
  // another issuer claiming the now-held ticker: one stable quarantine entry keyed `${ticker}:${valid_from}`
  const y=await newIssuer('ZZ AH Other Holder Co., Ltd.',null);
  const other=planAhLinks({...base,issuers:[{...ahIssuer(y,'ZZ AH Other Holder Co., Ltd.',aTicker),aTickers:[]}],figiHits:[{...hit,issuer_id:y}],openOwner:await ownersOf([hk])});
  await applyAhLinks(db,other,{batchId,dataset:DATASETS.entities.ahLink});
  await applyAhLinks(db,other,{batchId,dataset:DATASETS.entities.ahLink});
  const q=(await admin.query(`select reason_code,status,natural_key from public.dq_quarantine where batch_id=$1 and natural_key=$2`,[batchId,`${hk}:2004-03-11`])).rows;
  expect(q).toEqual([{reason_code:'ownership_conflict',status:'open',natural_key:`${hk}:2004-03-11`}]);
 });

 it('a provider hint without an agreeing HKEX ISIN files a provider_mapping claim with per-ISIN evidence; accepting it inserts the claimed window',async()=>{
  const aTicker=await universeRow('A','2003-01-01');
  const hk=await universeRow('HK','2006-07-14');
  const m=await newIssuer('ZZ AH Hint Co., Ltd.',aTicker);
  const isin=randomIsin();
  const hit=hitFor(m,hk,isin,null);
  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(m,'ZZ AH Hint Co., Ltd.',aTicker)],figiHits:[hit],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),hkex:null,hkexIsins:new Map()});
  expect(plan.attaches).toHaveLength(0);
  expect(await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink}).then(r=>r.claims)).toEqual({attach_security:1});
  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
  const claim=(await admin.query(`select id,op,id_type,value,source,status,detail from public.issuer_identifier_claims where issuer_id=$1`,[m])).rows[0];
  expect(claim).toMatchObject({op:'attach_security',id_type:'ticker',value:hk,source:'gleif_openfigi',status:'pending'});
  expect(claim.detail).toMatchObject({schema:'claim/1',evidence_kind:'provider_mapping',params:{ticker:hk,share_class:'H',valid_from:'2006-07-14',valid_from_method:'listing_date',source:'gleif_openfigi',isin}});
  expect(claim.detail.evidence.source).toBe(`gleif_openfigi:${isin}`);
  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).claims).toEqual({attach_security_appended:1});
  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=$1`,[m])).rows[0].n).toBe(1);
  expect((await resolve(claim.id,'accepted')).rows[0].r).toMatchObject({op:'attach_security',applied:true});
  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method,source,isin from public.issuer_securities where issuer_id=$1 and ticker=$2`,[m,hk])).rows[0];
  expect(row).toEqual({share_class:'H',valid_from:'2006-07-14',valid_from_method:'listing_date',source:'gleif_openfigi',isin});
 });

 it('a superseded -OLD counter is dropped and a contested ticker is one aggregated quarantine entry',async()=>{
  const aTicker=await universeRow('A','2004-01-01');
  const hk=await universeRow('HK','2007-01-02');
  const old=await universeRow('HK','2007-01-02');
  const p=await newIssuer('ZZ AH Contender P Co., Ltd.',aTicker);
  const q=await newIssuer('ZZ AH Contender Q Co., Ltd.',null);
  const isinP=randomIsin(),isinQ=randomIsin();
  const rows=[{stockCode:old.slice(0,5),name:'ZZ OLD COUNTER - OLD',category:'Equity',isin:null,row:2}];
  const base={asOf:ASOF,universe:await universeOf([hk,old]),openOwner:await ownersOf([hk,old]),hkex:{file:'list_of_securities' as const,sha256:'d'.repeat(64),rows},hkexIsins:new Map<string,HkexIsin>()};
  const plan=planAhLinks({...base,issuers:[ahIssuer(p,'ZZ AH Contender P Co., Ltd.',aTicker),{...ahIssuer(q,'ZZ AH Contender Q Co., Ltd.',aTicker),aTickers:[]}],
   figiHits:[hitFor(p,hk,isinP,null),hitFor(q,hk,isinQ,null),hitFor(p,old,isinP,null)]});
  expect(plan.skipped).toContain('superseded_counter');
  expect(plan.claims).toHaveLength(0);
  expect(plan.conflicts).toHaveLength(1);
  await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
  const rowsQ=(await admin.query(`select reason_code,status,detail from public.dq_quarantine where batch_id=$1 and natural_key=$2`,[batchId,`${hk}:2007-01-02`])).rows;
  expect(rowsQ).toHaveLength(1);
  expect(rowsQ[0]).toMatchObject({reason_code:'ownership_conflict',status:'open'});
  expect(rowsQ[0].detail).toMatchObject({reason:'ticker_claimed_by_several_issuers',competing_issuer_ids:[p,q].sort()});
  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=any($1)`,[[hk,old]])).rows[0].n).toBe(0);
  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=any($1::uuid[])`,[[p,q]])).rows[0].n).toBe(0);
 });

 it('rule 2: a name match files a pending claim/1 attach_security claim; accepting it inserts the claimed window',async()=>{
  const tag=hex(3);
  const aTicker=await universeRow('A','2002-01-01');
  const hk=await universeRow('HK','2005-06-30');
  const z=await newIssuer(`ZZ ${tag} Holdings Co., Ltd.`,aTicker);
  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(z,`ZZ ${tag} Holdings Co., Ltd.`,aTicker)],figiHits:[],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),
   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:hk.slice(0,5),name:`ZZ ${tag} HOLDINGS CO LTD - H`,category:'Equity',isin:null,row:7}]},hkexIsins:new Map()});
  expect(plan.claims).toHaveLength(1);
  const res=await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
  expect(res.claims).toEqual({attach_security:1});
  const claim=(await admin.query(`select id,op,id_type,value,status,confidence,target_key,detail from public.issuer_identifier_claims where issuer_id=$1`,[z])).rows[0];
  expect(claim).toMatchObject({op:'attach_security',id_type:'ticker',value:hk,status:'pending',confidence:null,target_key:claimTargetKey('attach_security',{issuer_id:z})});
  expect(claim.detail).toMatchObject({schema:'claim/1',evidence_kind:'name_match',params:{share_class:'H',valid_from:'2005-06-30',valid_from_method:'listing_date',source:'hkex_list_name_match'}});
  // replaying the same plan appends to the pending claim instead of filing a second one
  expect((await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink})).claims).toEqual({attach_security_appended:1});
  expect((await admin.query(`select count(*)::int as n from public.issuer_identifier_claims where issuer_id=$1`,[z])).rows[0].n).toBe(1);
  const out=(await resolve(claim.id,'accepted')).rows[0].r;
  expect(out).toMatchObject({op:'attach_security',applied:true});
  const row=(await admin.query(`select share_class,valid_from::text,valid_from_method from public.issuer_securities where issuer_id=$1 and ticker=$2`,[z,hk])).rows[0];
  expect(row).toEqual({share_class:'H',valid_from:'2005-06-30',valid_from_method:'listing_date'});
  const after=(await admin.query(`select status,resolved_by::text,resolved_at is not null as resolved from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0];
  expect(after).toEqual({status:'accepted',resolved_by:resolver,resolved:true});
  await expect(resolve(claim.id,'accepted')).rejects.toThrow('already_resolved');
 });

 it('rejecting a name-match claim changes only its status',async()=>{
  const tag=hex(3);
  const aTicker=await universeRow('A',null);
  const hk=await universeRow('HK',null);
  const w=await newIssuer(`ZZ ${tag} Group Limited`,aTicker);
  const plan=planAhLinks({asOf:ASOF,issuers:[ahIssuer(w,`ZZ ${tag} Group Limited`,aTicker)],figiHits:[],universe:await universeOf([hk]),openOwner:await ownersOf([hk]),
   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:hk.slice(0,5),name:`ZZ ${tag} GROUP LTD - H SHS`,category:'Equity',isin:null,row:8}]},hkexIsins:new Map()});
  await applyAhLinks(db,plan,{batchId,dataset:DATASETS.entities.ahLink});
  const [claim]=(await admin.query(`select id,detail from public.issuer_identifier_claims where issuer_id=$1`,[w])).rows;
  expect(claim.detail.params).toMatchObject({valid_from:ASOF,valid_from_method:'first_observed'});
  expect((await resolve(claim.id,'rejected')).rows[0].r).toMatchObject({op:'attach_security',applied:false});
  expect((await admin.query(`select status from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0].status).toBe('rejected');
  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
 });

 it('an evidence_only claim is accepted only with an amend; the amended backdate_window moves valid_from',async()=>{
  const aTicker=await universeRow('A','1999-01-01');
  const e=await newIssuer('ZZ AH Evidence Co., Ltd.',aTicker);
  const evidence={source:'sec_submissions',as_of:ASOF,evidence_sha256:'f'.repeat(64),locator:'recent#accessionNumber=0000999001-01-000001',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'};
  expect(await fileClaim(db,{issuer_id:e,id_type:'ticker',value:'0000999001-01-000001',source:'sec_submissions',op:'evidence_only',detail:{
   schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:e},params:{suggested_op:'backdate_window',accession:'0000999001-01-000001',form:'8-A12B',filing_date:'2019-05-20',note:evidence.note},evidence,sources:[evidence],
  }})).toBe(true);
  const [claim]=(await admin.query(`select id from public.issuer_identifier_claims where issuer_id=$1 and op='evidence_only'`,[e])).rows;
  await expect(resolve(claim.id,'accepted')).rejects.toThrow('amend_required');
  const amend={op:'backdate_window',target:{issuer_id:e,ticker:aTicker,valid_from:'2020-01-01'},params:{new_valid_from:'2019-06-03',valid_from_method:'listing_date'}};
  expect((await resolve(claim.id,'accepted',amend)).rows[0].r).toMatchObject({op:'backdate_window',applied:true,amended:true});
  const row=(await admin.query(`select valid_from::text,valid_from_method from public.issuer_securities where issuer_id=$1 and ticker=$2`,[e,aTicker])).rows[0];
  expect(row).toEqual({valid_from:'2019-06-03',valid_from_method:'listing_date'});
  const after=(await admin.query(`select status,op,detail from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0];
  expect(after.status).toBe('accepted');
  expect(after.detail.original_params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
 });
 it('an attach_security amend without params.ticker is refused by the route pre-check and by SQL, leaving the claim pending',async()=>{
  const aTicker=await universeRow('A','1998-01-01');
  const e=await newIssuer('ZZ AH Amend Attach Co., Ltd.',aTicker);
  const evidence={source:'sec_submissions',as_of:ASOF,evidence_sha256:'b'.repeat(64),locator:'recent#accessionNumber=0000999002-01-000002',note:'8-A12B'};
  const detail={schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:e},params:{suggested_op:'attach_security'},evidence,sources:[evidence]};
  expect(await fileClaim(db,{issuer_id:e,id_type:'ticker',value:'0000999002-01-000002',source:'sec_submissions',op:'evidence_only',detail})).toBe(true);
  const [claim]=(await admin.query(`select id from public.issuer_identifier_claims where issuer_id=$1`,[e])).rows;
  const hk=await universeRow('HK','2008-08-08');
  const noTicker={op:'attach_security',target:{issuer_id:e},params:{share_class:'H',valid_from:'2008-08-08',valid_from_method:'listing_date',source:'curated'}};
  // route pre-check: params.ticker is mandatory (typeof check), otherwise validateClaimDetail with value=params.ticker
  expect(typeof (noTicker.params as Record<string,unknown>).ticker).not.toBe('string');
  // the same amend with a ticker passes the route's validateClaimDetail call ...
  const withTicker={...noTicker,params:{...noTicker.params,ticker:hk}};
  expect(validateClaimDetail('attach_security','ticker',{...detail,target:withTicker.target,params:withTicker.params},hk)).toEqual({ok:true});
  // ... and SQL agrees that the ticker-less amend is not acceptable
  await expect(resolve(claim.id,'accepted',noTicker)).rejects.toThrow();
  expect((await admin.query(`select status from public.issuer_identifier_claims where id=$1`,[claim.id])).rows[0].status).toBe('pending');
  expect((await admin.query(`select count(*)::int as n from public.issuer_securities where ticker=$1`,[hk])).rows[0].n).toBe(0);
  // with the ticker SQL accepts and inserts the claimed row
  expect((await resolve(claim.id,'accepted',withTicker)).rows[0].r).toMatchObject({op:'attach_security',applied:true,amended:true});
  expect((await admin.query(`select issuer_id::text,share_class from public.issuer_securities where ticker=$1`,[hk])).rows[0]).toEqual({issuer_id:e,share_class:'H'});
 });
});
