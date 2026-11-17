// Real PG17 parity against read_facts; fresh database and unique issuers, as in facts.integration.test.ts.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {pgFactsBatchReader} from './read-batch';
import {pgFactsDb} from './pg-facts-db';
const enabled=!!process.env.S4_TEST_STATE;
type FactSpec={filing_id:string;fact_id?:string;concept?:string;period_start?:string|null;period_end?:string;duration?:string;value?:string;unit?:string;available_date?:string};
describe.skipIf(!enabled)('read_facts_batch PG17 parity',()=>{
 let admin:Pool;
 const RETRYABLE=new Set(['55P03','40P01']);
 // Each q call is one autocommit statement; failed attempts leave no changes, so retrying is safe.
 const q=async(text:string,values:unknown[]=[]):Promise<Record<string,any>[]>=>{
  for(let attempt=1;;attempt++){
   try{return (await admin.query(text,values)).rows as Record<string,any>[];}
   catch(e){
    const code=(e as {code?:string}).code;
    if(attempt>=10||!code||!RETRYABLE.has(code))throw e;
    await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
   }
  }
 };
 const one=async(text:string,values:unknown[]=[])=>(await q(text,values))[0]?.v;
 const issuer=async()=>{const id=randomUUID();await q(`insert into public.issuers(issuer_id,canonical_name_en) values($1,'ZZ Facts Test')`,[id]);return id;};
 const batch=async()=>{const id=randomUUID();await q(`insert into public.ingest_batches(batch_id,producer,dataset) values($1,'facts-sync','facts.us')`,[id]);return id;};
 const scope=(iss:string)=>one(`select public.reconcile_fact_sync_scope('US',$1::jsonb) v`,[JSON.stringify([{issuer_id:iss,reasons:['test'],priority:10,fetch_key:'0000000001'}])]);
 const claim=(iss:string,b:string,ttl=600)=>one(`select public.claim_fact_sync_lease($1,'US',$2,$3) v`,[iss,b,ttl]);
 const begin=(iss:string,b:string,gen=1)=>one(`select public.begin_sync_run($1,'US',$2,$3) v`,[iss,b,gen]);
 const filing=async(run:string,available='2024-02-01',sourceRef=randomUUID())=>{
  const id=randomUUID();
  const m=await one(`select public.stage_filings($1,$2::jsonb) v`,[run,JSON.stringify([{filing_id:id,source:'edgar',origin:'sec',form_type:'10-K',fiscal_year:2023,fiscal_period:'FY',period_end:'2023-12-31',available_date:available,source_ref:sourceRef,url:null}])]);
  return m[sourceRef] as string;
 };
 const factRow=(f:FactSpec)=>({fact_id:f.fact_id??randomUUID(),filing_id:f.filing_id,concept:f.concept??'revenue',source_concept:'Revenues',statement:f.concept==='total_assets'?'BS':'IS',period_start:f.period_start===undefined?'2023-10-01':f.period_start,period_end:f.period_end??'2023-12-31',duration:f.duration??'3M',value:f.value??'100',unit:f.unit??'USD',consolidation:'consolidated',available_date:f.available_date??'2024-02-01',mapping_version:'facts-map/1',raw_hash:'h'});
 const stage=async(run:string,rows:FactSpec[])=>{const full=rows.map(factRow);const n=await one(`select public.stage_facts($1,$2::jsonb) v`,[run,JSON.stringify(full)]);return {n:n as number,ids:full.map(r=>r.fact_id)};};

 const publish=(run:string,manifest:string[])=>one(`select public.publish_sync_run($1,$2::uuid[]) v`,[run,manifest]);
 beforeAll(async()=>{const state=JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8'));admin=new Pool({connectionString:state.adminUrl});});
 afterAll(async()=>{await admin?.end();});
 const readBatch=(ids:(string|null)[]|null,history:boolean,asOf='2030-01-01',concepts:string[]|null=['revenue','total_assets'])=>one(`select public.read_facts_batch($1::uuid[],'US',$2::text[],$3::date,$4) v`,[ids,concepts,asOf,history]);
 async function parity(ids:(string|null)[],history:boolean,asOf='2030-01-01'){
  const out=await readBatch(ids,history,asOf);
  expect(out.map((e:{issuer_id:string})=>e.issuer_id)).toEqual([...new Set(ids.filter(x=>x!==null))].sort());
  for(const {issuer_id,...env} of out)expect(env).toEqual(await one(`select public.read_facts($1,'US',$2::text[],$3::date,null,null,$4,null,false) v`,[issuer_id,['revenue','total_assets'],asOf,history]));
  return out;
 }
 it.each([true,false])('isolates windows, revisions, active generations, cutoff, non-ok and empty issuers (history=%s)',async history=>{
  const ids:string[]=[];
  for(let i=0;i<2;i++){
   const iss=await issuer(),b=await batch();ids.push(iss);await scope(iss);await claim(iss,b);
   const run=await begin(iss,b),f0=await filing(run,'2024-01-01'),f=await filing(run);
   await stage(run,[{filing_id:f0,value:String(90+i),available_date:'2024-01-01'},{filing_id:f,value:String(100+i)}]);await publish(run,[f0,f]);
   const gen2=await begin(iss,b,2);await stage(gen2,[{filing_id:f,value:String(120+i)}]);await publish(gen2,[f]);
   // Pending rows are non-ok and must not leak into either history mode.
   const pending=await begin(iss,b,2);await stage(pending,[{filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',value:'999'}]);
  }
  const empty=await issuer();await scope(empty);const noScope=await issuer();
  const input=[ids[1],null,empty,ids[0],noScope,ids[1]];
  const out=await parity(input,history);
  for(const id of ids){const env=out.find((e:{issuer_id:string})=>e.issuer_id===id);expect(env.row_count).toBe(history?2:1);expect(env.rows.at(-1)).toMatchObject({mapping_gen:2,disclosure_seq:2,is_revision:true,is_current:true});}
  expect(out.find((e:{issuer_id:string})=>e.issuer_id===noScope)).toEqual({issuer_id:noScope,state_rev:0,truncated:false,row_count:0,rows:[]});
  const cut=await parity(input,history,'2024-01-15');for(const id of ids)expect(cut.find((e:{issuer_id:string})=>e.issuer_id===id).row_count).toBe(1);
  const opts={concepts:['revenue','total_assets'],asOf:'2030-01-01',history};
  const normalized=await pgFactsBatchReader(admin).readFactsBatch(ids,'US',opts);
  for(const id of ids)expect(normalized.get(id)).toEqual(await pgFactsDb(admin).readFacts(id,'US',opts));
 });
 it('caps one issuer independently next to a normal issuer in both history modes',async()=>{
  const large=await issuer(),normal=await issuer();
  for(const [iss,count] of [[large,10001],[normal,1]] as const){
   const b=await batch();await scope(iss);await claim(iss,b);const run=await begin(iss,b),f=await filing(run);
   // Same 500-row staging helper/constraints as facts.integration.test.ts's cap test.
   for(let start=0;start<count;start+=500){const rows:FactSpec[]=[];for(let i=start;i<Math.min(start+500,count);i++)rows.push({filing_id:f,concept:'total_assets',period_start:null,duration:'INSTANT',period_end:new Date(Date.UTC(1990,0,1)+i*86400000).toISOString().slice(0,10),value:String(i)});await stage(run,rows);}
   await publish(run,[f]);
  }
  for(const history of [true,false]){const out=await parity([large,normal],history);expect(out.find((e:{issuer_id:string})=>e.issuer_id===large)).toMatchObject({truncated:true,row_count:0,rows:[]});expect(out.find((e:{issuer_id:string})=>e.issuer_id===normal).row_count).toBe(1);}
 },120000);
 it('guards inputs and restricts execute to service_role',async()=>{
  for(const concepts of [null,[]])await expect(readBatch([],true,'2030-01-01',concepts)).rejects.toMatchObject({code:'22023'});
  await expect(readBatch(Array.from({length:201},()=>randomUUID()),true)).rejects.toMatchObject({code:'22023'});
  expect(await readBatch(null,true)).toEqual([]);expect(await readBatch([],false)).toEqual([]);
  for(const role of ['anon','authenticated','service_role'])expect(await one(`select has_function_privilege($1,'public.read_facts_batch(uuid[],text,text[],date,boolean)','EXECUTE') v`,[role])).toBe(role==='service_role');
 });
 const readSlice=(ids:(string|null)[]|null,history:boolean,from:string|null=null,to:string|null=null,durations:string[]|null=['12M'],concepts:string[]|null=['revenue','total_assets'])=>one(`select public.read_facts_batch_slice($1::uuid[],'US',$2::text[],'2030-01-01'::date,$3::date,$4::date,$5::boolean,$6::text[]) v`,[ids,concepts,from,to,history,durations]);
 it('matches duration-filtered read_facts across history, bounds and duration selections',async()=>{
  const iss=await issuer(),empty=await issuer(),b=await batch();await scope(iss);await claim(iss,b);
  const run=await begin(iss,b),files:string[]=[];
  // Duration is deliberately absent from the disclosure key. Filtering it before windows
  // would incorrectly make the middle annual disclosure current and renumber the last one.
  for(const [i,duration] of ['3M','12M','3M','12M'].entries()){
   const available=`2024-0${i+1}-01`,f=await filing(run,available);files.push(f);
   await stage(run,[{filing_id:f,period_start:'2023-01-01',duration,value:String(100+i),available_date:available},
    {filing_id:f,concept:'total_assets',period_start:'2023-01-01',duration:i===3?'3M':'12M',value:String(200+i),available_date:available}]);
  }
  const f=files[0];
  await stage(run,[{filing_id:f,period_start:'2021-01-01',period_end:'2021-12-31',duration:'12M',available_date:'2024-01-01'},
   {filing_id:f,period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',available_date:'2024-01-01'}]);
  await publish(run,files);
  for(const history of [true,false])for(const [from,to] of [[null,null],['2023-01-01',null],[null,'2023-12-31'],['2023-01-01','2023-12-31']] as const)for(const durations of [['12M'],['12M','3M']]){
   const out=await readSlice([iss,null,empty,iss],history,from,to,durations);
   expect(out.map((e:{issuer_id:string})=>e.issuer_id)).toEqual([iss,empty].sort());
   for(const {issuer_id,...env} of out){
    const full=await one(`select public.read_facts($1,'US',$2::text[],'2030-01-01'::date,$3::date,$4::date,$5::boolean,null,false) v`,[issuer_id,['revenue','total_assets'],from,to,history]);
    const rows=full.rows.filter((r:{duration:string})=>durations.includes(r.duration));
    expect(env).toEqual({...full,rows,row_count:rows.length});
   }
  }
  const annual=(await readSlice([iss],true,'2023-01-01','2023-12-31'))[0].rows.filter((r:{concept:string})=>r.concept==='revenue');
  expect(annual.map((r:{disclosure_seq:number;is_current:boolean;is_revision:boolean})=>[r.disclosure_seq,r.is_current,r.is_revision])).toEqual([[2,false,true],[4,true,true]]);
  expect((await readSlice([iss],false,'2023-01-01','2023-12-31'))[0].rows.every((r:{concept:string})=>r.concept==='revenue')).toBe(true);
  const normalized=await pgFactsBatchReader(admin).readFactsBatch([iss],'US',{concepts:['revenue'],asOf:'2030-01-01',history:false,from:'2023-01-01',to:'2023-12-31',durations:['12M']});
  const full=await pgFactsDb(admin).readFacts(iss,'US',{concepts:['revenue'],asOf:'2030-01-01',history:false,from:'2023-01-01',to:'2023-12-31'});
  expect(normalized.get(iss)).toEqual({...full,rows:full.rows.filter(r=>r.duration==='12M')});
 });
 it('applies the cap after duration filtering, independently per issuer',async()=>{
  const annual=await issuer(),quarterly=await issuer();
  for(const [iss,duration] of [[annual,'12M'],[quarterly,'3M']]){
   const b=await batch();await scope(iss);await claim(iss,b);const run=await begin(iss,b),f=await filing(run);
   for(let start=0;start<10001;start+=500){
    const rows:FactSpec[]=[];
    for(let i=start;i<Math.min(start+500,10001);i++){
     const end=new Date(Date.UTC(1990,0,1)+i*86400000).toISOString().slice(0,10);
     rows.push({filing_id:f,period_start:'1989-01-01',period_end:end,duration,value:String(i)});
    }
    await stage(run,rows);
   }
   if(iss===quarterly)await stage(run,[{filing_id:f,period_start:'2023-01-01',duration:'12M'}]);
   await publish(run,[f]);
  }
  for(const history of [true,false]){
   const out=await readSlice([annual,quarterly],history);
   expect(out.find((e:{issuer_id:string})=>e.issuer_id===annual)).toMatchObject({truncated:true,row_count:0,rows:[]});
   expect(out.find((e:{issuer_id:string})=>e.issuer_id===quarterly)).toMatchObject({truncated:false,row_count:1,rows:[{duration:'12M'}]});
  }
 },120000);
 it('guards slice inputs and grants only service_role execution',async()=>{
  for(const durations of [null,[]])await expect(readSlice([],false,null,null,durations)).rejects.toMatchObject({code:'22023'});
  for(const concepts of [null,[]])await expect(readSlice([],false,null,null,['12M'],concepts)).rejects.toMatchObject({code:'22023'});
  await expect(readSlice(Array.from({length:201},()=>randomUUID()),false)).rejects.toMatchObject({code:'22023'});
  expect(await readSlice(null,false)).toEqual([]);expect(await readSlice([],true)).toEqual([]);
  for(const role of ['anon','authenticated','service_role'])expect(await one(`select has_function_privilege($1,'public.read_facts_batch_slice(uuid[],text,text[],date,date,date,boolean,text[])','EXECUTE') v`,[role])).toBe(role==='service_role');
 });

});
