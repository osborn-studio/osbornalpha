import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {afterAll,describe,expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {pgTableClient} from '@/lib/db/pg-table-client';
import type {TableClient} from '@/lib/db/table-client';
import {startBatch} from '@/lib/dq/batches';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import {pgFactsDb} from '@/lib/facts/pg-facts-db';
import {resolvePublicIssuer} from '@/lib/facts/public-route';
import type {FactRow,FactsDb} from '@/lib/facts/types';
import {memorySnapshotReader,snapshotFromEnvelope} from '../snapshot-read';
import {makeDeps,realFact,realRecord,secRow} from '../route-test-kit';
import {companyRoute,type Handler,type RouteCtx} from '../route';
import {factsHandler,FACTS_PARAMS} from './facts';
import {statementsHandler,STATEMENTS_PARAMS} from './statements';
import {filingsHandler,FILINGS_PARAMS} from './filings';

const wiring=vi.hoisted(()=>({deps:null as unknown}));
vi.mock('../deps',()=>({productionReadDeps:()=>wiring.deps}));
const cases:[string,Handler,readonly string[],Record<string,string>][]=[
 ['facts',factsHandler,FACTS_PARAMS,{concept:'revenue',periodStart:'2022-09-25',periodEnd:'2023-09-30',unit:'USD'}],
 ['statements',statementsHandler,STATEMENTS_PARAMS,{statement:'IS'}],
 ['filings',filingsHandler,FILINGS_PARAMS,{}],
];
for(const backend of ['memory','postgres'] as const){
 describe.skipIf(backend==='postgres'&&!process.env.S4_TEST_STATE)(`company target fence (${backend})`,()=>{
  let pool:Pool|undefined;
  afterAll(async()=>{await pool?.end();});
  async function setup(){
   let tables:TableClient,db:FactsDb;
   const by=randomUUID(),source=randomUUID(),target=randomUUID();
   const ticker=`${source.replaceAll('-','').slice(0,5).replace(/[0-9]/g,n=>String.fromCharCode(71+Number(n))).toUpperCase()}`;
   if(backend==='postgres'){
    pool??=new Pool({connectionString:JSON.parse(readFileSync(process.env.S4_TEST_STATE!,'utf8')).adminUrl});
    tables=pgTableClient(pool);db=pgFactsDb(pool);
    await pool.query('insert into auth.users(id,email) values($1,$2)',[by,`${by}@target.test`]);
   }else{tables=memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from']});db=memoryFactsDb(tables);}
   for(const id of [source,target])await tables.insert('issuers',{issuer_id:id,status:'active',merged_into:null,canonical_name_en:'Target fence test'});
   if(pool)await pool.query("insert into stocks_universe(ticker,name,market) values($1,'Target fence test','US')",[ticker]);
   // A historical alias remains owned by source; resolving its merge must preserve the alias and date.
   await tables.insert('issuer_securities',{...secRow(source,ticker,{valid_to:'2025-01-01',valid_to_method:'curated'}),source:'test'});
   const deps=makeDeps(tables);deps.facts=db;
   deps.snapshot=backend==='memory'?memorySnapshotReader(db as ReturnType<typeof memoryFactsDb>):async(i,m,o)=>snapshotFromEnvelope((await pool!.query('select public.company_read_snapshot($1,$2,$3::text[],$4::date,$5::date,$6::date,$7,$8) as v',[i,m,o.concepts,o.asOf,o.from??null,o.to??null,o.history,o.limit??null])).rows[0].v);
   const rows:FactRow[]=[];
   for(const [index,id] of [source,target].entries()){
    await db.reconcileScope('US',[{issuer_id:id,reasons:[],priority:1,fetch_key:'target-test'}]);
    const {batchId:batch}=await startBatch(tables,{producer:'target-test',dataset:'financial_facts',triggeredBy:'script'});await db.claimLease(id,'US',batch,60);const run=await db.beginRun(id,'US',batch,1);
    const filing=randomUUID(),available=`2024-0${index+2}-01`;
    await db.stageFilings(run,[{filing_id:filing,issuer_id:id,sourceRef:filing,market:'US',source:'edgar',origin:'sec',formType:'10-K',fiscalYear:2023,fiscalPeriod:'FY',periodEnd:'2023-09-30',availableDate:available,url:'https://www.sec.gov/target-test'}]);
    const fact=realFact({fact_id:randomUUID(),issuer_id:id,filing_id:filing,run_id:run,available_date:available,value:String(100+index),value_text:String(100+index)});
    await db.stageFacts(run,[{...fact,consolidation:'consolidated'}]);await db.publishRun(run,[filing]);rows.push(fact);
   }
   vi.mocked(deps.company.evidenceOf).mockImplementation(async ids=>new Map(rows.filter(f=>ids.includes(f.fact_id)).map(f=>[f.fact_id,{...realRecord(f),run_id:f.run_id}])));
   const issuer=await resolvePublicIssuer(tables,ticker,'2025-02-01','2024-06-01');expect(issuer?.issuerId).toBe(source);
   const ctx:RouteCtx={mode:'public',admin:false,now:new Date('2025-02-01'),today:'2025-02-01',asOf:'2025-02-01',asOfGiven:true,issuer:issuer!,params:new Map(),deps,userId:null};
   const merge=async()=>{
    await db.setMerge(source,target,by);
    // memoryFactsDb keeps its topology separately from issuer tables (SQL set_merge updates both).
    if(backend==='memory')await tables.update('issuers',{issuer_id:source},{status:'merged',merged_into:target});
   };
   return {ctx,db,source,target,merge,rows,ticker,by};
  }
  it.each(cases)('%s follows a target merged away after resolution, before first lineage read',async(_name,handler,_params,query)=>{
   const {ctx,db,source,target,merge,rows,ticker}=await setup();await merge();
   // The old checks see the SAME singleton twice even though targetOf has changed.
   expect(await db.targetOf(source)).toBe(target);expect(await db.lineageOf(source)).toEqual([source]);expect(await db.lineageOf(source)).toEqual([source]);
   ctx.params=new Map(Object.entries(query));const out=await handler(ctx,new Request('https://test.invalid'));
   if(out instanceof Response)throw Error('unexpected response');
   expect(out.body).toMatchObject({issuerId:target,ticker,lineage:expect.arrayContaining([source,target])});
   if(_name==='facts')expect((out.body as {series:{factId:string;issuerId:string}[]}).series).toEqual(rows.map(r=>expect.objectContaining({factId:r.fact_id,issuerId:r.issuer_id})));
   if(_name==='statements')expect((out.body as {factOwners:unknown}).factOwners).toEqual({[rows[1].fact_id]:target});
   if(_name==='filings')expect((out.body as {filings:unknown[]}).filings).toHaveLength(2);
   expect(ctx.issuer).toMatchObject({issuerId:source,ticker,tickerAsOf:'2024-06-01'});
  });
  it.each(cases)('%s catches a merge inside the first lineage read and retries with the new target',async(_name,handler,_params,query)=>{
   const {ctx,db,source,target,merge}=await setup();const lineage=db.lineageOf.bind(db);let merged=false;
   ctx.deps.facts={...db,lineageOf:async id=>{if(!merged){merged=true;await merge();}return lineage(id);}};
   ctx.params=new Map(Object.entries(query));const out=await handler(ctx,new Request('https://test.invalid'));
   if(out instanceof Response)throw Error('unexpected response');
   expect(out.body).toMatchObject({issuerId:target,lineage:expect.arrayContaining([source,target])});
  });
  it.each(cases)('%s fences a merge after the last snapshot/evidence read',async(name,handler,_params,query)=>{
   const {ctx,source,target,merge}=await setup();let merged=false;
   if(name==='filings'){
    const snapshot=ctx.deps.snapshot;ctx.deps.snapshot=async(...args)=>{const snap=await snapshot(...args);if(!merged){merged=true;await merge();}return snap;};
   }else{
    const evidence=vi.mocked(ctx.deps.company.evidenceOf).getMockImplementation()!;
    vi.mocked(ctx.deps.company.evidenceOf).mockImplementation(async ids=>{const records=await evidence(ids);if(!merged){merged=true;await merge();}return records;});
   }
   ctx.params=new Map(Object.entries(query));const out=await handler(ctx,new Request('https://test.invalid'));
   if(out instanceof Response)throw Error('unexpected response');
   expect(merged).toBe(true);expect(out.body).toMatchObject({issuerId:target,lineage:expect.arrayContaining([source,target])});
  });
  it.each(cases)('%s returns 503/no-store after three targets merge away during reads',async(name,handler,params,query)=>{
   const {ctx,ticker,db,by}=await setup();
   const lineage=db.lineageOf.bind(db);let reads=0,merges=0;
   ctx.deps.facts={...db,lineageOf:async id=>{
    if(reads++%2===0){
     const next=randomUUID();await ctx.deps.tables.insert('issuers',{issuer_id:next,status:'active',merged_into:null,canonical_name_en:'Next target'});
     const refs=await ctx.deps.tables.select('issuers',{merged_into:id});await db.setMerge(id,next,by);merges++;
     if(backend==='memory'){
      for(const row of refs)await ctx.deps.tables.update('issuers',{issuer_id:row.issuer_id},{merged_into:next});
      await ctx.deps.tables.update('issuers',{issuer_id:id},{status:'merged',merged_into:next});
     }
    }
    return lineage(id);
   }};
   wiring.deps=ctx.deps;
   const url=new URL(`https://test.invalid/api/companies/${ticker}/${name}`);for(const [k,v] of Object.entries({...query,tickerAsOf:'2024-06-01'}))url.searchParams.set(k,v);
   const response=await companyRoute({tag:name,mode:'public',params,handler})(new Request(url),{params:Promise.resolve({ticker})});
   expect(response.status).toBe(503);expect(response.headers.get('Cache-Control')).toBe('no-store');expect(await response.json()).toMatchObject({error:{code:'lineage_unstable'}});expect(merges).toBe(3);expect(reads).toBe(6);
  });
 });
}
