// src/lib/evals/adapters/memory-world.ts
// TEST-ONLY in-memory facts world for the adapter unit tests (Task 7). memoryFactsDb + memoryTableClient +
// memorySnapshotStore, issuers / issuer_securities rows for resolveIssuer, a small companyfacts document builder
// (numbers written as JSON number literals, like SEC), and syncs through the REAL runFactsSync + parseCompanyFacts,
// so raw_hash, locators, runs, batches and snapshot objects are genuine. overlay() exposes the facts tables that live
// inside memoryFactsDb (financial_facts, filings, fact_sync_runs) to TableClient reads, the way service_role sees them.
// Nothing outside tests imports this file.
import {memoryTableClient} from '../../db/memory-table-client';
import type {Row,TableClient} from '../../db/table-client';
import {memoryFactsDb} from '../../facts/memory-facts-db';
import type {MemoryFactsDb} from '../../facts/memory-facts-db';
import {companyFactsUrl,parseCompanyFacts} from '../../facts/providers/edgar-companyfacts';
import {ProviderError,padCik,snapshotOf,stringifyPreservingNumbers} from '../../facts/providers/shared';
import {memorySnapshotStore} from '../../facts/snapshot-store';
import {runFactsSync} from '../../facts/sync';
import type {SyncReceipt} from '../../facts/sync';

export const CODE_VERSION='c'.repeat(40);
export const UNIT_ISSUER='00000000-0000-4000-8000-000009990611';
export const UNIT_CIK='9990611';
export const UNIT_TICKER='ZZEVU';
export interface CfEntry{tag:string;unit?:string;start?:string;end:string;val:string;accn:string;form?:string;filed:string;fy?:number;fp?:string}

/** companyfacts bytes with every value as a JSON number literal (decodeWithSchema reads `val` losslessly). */
export function companyFactsDoc(cik:string,name:string,entries:CfEntry[]):Uint8Array{
 const facts:Record<string,Record<string,{units:Record<string,unknown[]>}>>={'us-gaap':{}};
 for(const e of entries){
  const tag=facts['us-gaap'][e.tag]??(facts['us-gaap'][e.tag]={units:{}});
  const unit=e.unit??'USD';
  (tag.units[unit]??(tag.units[unit]=[])).push({...(e.start?{start:e.start}:{}),end:e.end,val:{__num:e.val},accn:e.accn,fy:{__num:String(e.fy??Number(e.end.slice(0,4)))},fp:e.fp??'FY',form:e.form??'10-K',filed:e.filed});
 }
 return new TextEncoder().encode(stringifyPreservingNumbers({cik:{__num:cik},entityName:name,facts}));
}

const FACT_TABLES=new Set(['financial_facts','filings','fact_sync_runs']);
/** Read-only view of memoryFactsDb's own tables through the TableClient interface; every other table is `base`. */
export function overlayTables(db:MemoryFactsDb,base:TableClient):TableClient{
 const mirror=async()=>{
  const t=memoryTableClient();
  for(const f of db.facts())await t.insert('financial_facts',f as unknown as Row);
  for(const g of db.filings())await t.insert('filings',g as unknown as Row);
  for(const r of db.runs())await t.insert('fact_sync_runs',r as unknown as Row);
  return t;
 };
 const readOnly=(table:string)=>{if(FACT_TABLES.has(table))throw new Error(`read_only_overlay:${table}`);};
 return {
  insert:async(t,r)=>{readOnly(t);return base.insert(t,r);},
  update:async(t,m,p)=>{readOnly(t);return base.update(t,m,p);},
  upsert:async(t,r,c)=>{readOnly(t);return base.upsert(t,r,c);},
  select:async(t,m,o)=>FACT_TABLES.has(t)?(await mirror()).select(t,m,o):base.select(t,m,o),
  count:async(t,m,o)=>FACT_TABLES.has(t)?(await mirror()).count(t,m,o):base.count(t,m,o),
 };
}

export interface MemoryWorld{
 db:MemoryFactsDb;tables:ReturnType<typeof memoryTableClient>;storage:ReturnType<typeof memorySnapshotStore>;
 issuerId:string;cik:string;ticker:string;overlay:TableClient;
 /** One runFactsSync of `doc` for the issuer at `at` (memory db clock fixed to it). */
 sync(doc:Uint8Array,opts?:{mappingGen?:number;at?:string}):Promise<SyncReceipt>;
}
export async function memoryWorld(o:{issuerId?:string;cik?:string;ticker?:string;name?:string}={}):Promise<MemoryWorld>{
 const issuerId=o.issuerId??UNIT_ISSUER,cik=o.cik??UNIT_CIK,ticker=o.ticker??UNIT_TICKER;
 const tables=memoryTableClient({ingest_batches:['batch_id'],dq_quarantine:['id'],dq_freshness:['dataset'],issuers:['issuer_id']});
 const db=memoryFactsDb(tables);const storage=memorySnapshotStore();
 await tables.insert('issuers',{issuer_id:issuerId,status:'active',cik,canonical_name_en:o.name??'ZZ Eval Unit Co',canonical_name_zh:null,lei:null,usci:null,merged_into:null,country_code:'US'});
 await tables.insert('issuer_securities',{issuer_id:issuerId,ticker,isin:null,figi:null,share_class:'common',is_primary:true,valid_from:'2000-01-01',valid_to:null,source:'test'});
 await db.reconcileScope('US',[{issuer_id:issuerId,reasons:['test'],priority:10,fetch_key:padCik(cik)}]);
 let current:Uint8Array|null=null;
 const sync=async(doc:Uint8Array,opts:{mappingGen?:number;at?:string}={})=>{
  current=doc;
  const at=new Date(opts.at??'2026-11-20T12:00:00.000Z');
  db.setNow(at.toISOString());
  return runFactsSync({db,tables,storage,
   fetchUs:async cik10=>{if(!current)throw new ProviderError('no_companyfacts',cik10);return snapshotOf(current,{source:'edgar',url:companyFactsUrl(cik10),fetched_at:at.toISOString()});},
   fetchCn:async()=>{throw new ProviderError('tushare_unavailable','memory world is US only');},
   parseUs:(s,p)=>parseCompanyFacts(s,{sinceYear:p.sinceYear}),
   parseCn:()=>{throw new ProviderError('parse_error','memory world is US only');},
   now:()=>at,deadline:null,codeVersion:CODE_VERSION},
   {market:'US',limit:1,issuerIds:[issuerId],dryRun:false,triggeredBy:'script',...(opts.mappingGen!==undefined?{mappingGen:opts.mappingGen}:{})});
 };
 return {db,tables,storage,issuerId,cik,ticker,overlay:overlayTables(db,tables),sync};
}
