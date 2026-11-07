// src/lib/judgments/inputs-db.ts
// JudgmentInputsDb implementations (spec §5.7, §3.5): the read-only path every input builder,
// replay reconciliation and resolver uses. anonJudgmentInputsDb reads ONLY through the anon client
// (RLS on): read_facts is security invoker with EXECUTE for anon and the financial_facts policy
// shows anon status='ok' rows only; filings, issuers, issuer_securities, industry_classifications,
// issuer_industry_memberships and stocks_universe are anon-selectable; judgments are visible to
// anon only for publishable methods (Task 2 RLS). metricsOfIssuer is deliberately absent (S05).
// table_rows natural keys: industry_classifications 'scheme:version:code',
// issuer_industry_memberships 'issuer_id:scheme:version', macro_series 'US'|'CN' (served by
// MacroReadApi.seriesCatalog until the workbench table exists — plan Part B deviation 1). Rows are
// normalised for hashing (*_at timestamps → toISOString(), rows sorted by canonical form).
// issuerPrimarySecurity: holdings whose half-open window [valid_from, valid_to) contains `on`, joined
// to stocks_universe.market ∈ {A, HK, US}; the single is_primary holding wins, else the single
// holding; anything else is ambiguous → null (never guess). memoryJudgmentInputsDb runs the same
// code over memoryFactsDb + memoryTableClient and hides non-ok facts like the anon policy.
// kline: anon default = readKlineRange (Task 7); the memory variant defaults to unsupportedKline (no network in tests).
import type {SupabaseClient} from '@supabase/supabase-js';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {supabaseTableClient} from '@/lib/db/table-client';
import {selectAll} from '@/lib/db/table-client';
import type {Row,TableClient} from '@/lib/db/table-client';
import {supabaseFactsDb} from '@/lib/facts/db';
import {memoryFactsDb} from '@/lib/facts/memory-facts-db';
import type {FactsDb} from '@/lib/facts/types';
import type {JudgmentInputsDb,JudgmentRow,MacroReadApi,PriceMarket,PublicTable} from './types';
import {PUBLIC_TABLES} from './types';
import {canonicalize} from './canonical';
import {JudgmentError} from './errors';
import {deriveMetricsAsOf} from './facts-derive';
import {unavailableMacroReadApi} from './macro-api';
import {readKlineRange} from './kline';

export type KlineFn=JudgmentInputsDb['kline'];
/** No price source wired: every request is unsupported. */
export const unsupportedKline:KlineFn=async()=>({failure:'unsupported'});
const PRICE_MARKETS:readonly PriceMarket[]=['A','HK','US'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso=(v:unknown)=>new Date(String(v)).toISOString();
const isoKeys=(r:Row):Record<string,unknown>=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,k.endsWith('_at')&&typeof v==='string'&&Number.isFinite(Date.parse(v))?iso(v):v]));
export function normalizeTableRows(rows:Row[]):Record<string,unknown>[]{
 return rows.map(isoKeys).map(r=>({r,c:canonicalize(r)})).sort((a,b)=>a.c<b.c?-1:a.c>b.c?1:0).map(x=>x.r);
}
const NK:Record<PublicTable,RegExp>={
 industry_classifications:/^([^:]+):([^:]+):([^:]+)$/,
 issuer_industry_memberships:/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([^:]+):([^:]+)$/,
 macro_series:/^(US|CN)$/,
};
export function parseNaturalKey(table:PublicTable,key:string):string[]{
 if(!(PUBLIC_TABLES as readonly string[]).includes(table))throw new JudgmentError('input_not_allowed',`table ${table} is not a public input table`);
 const m=NK[table].exec(key);
 if(!m)throw new JudgmentError('input_not_allowed',`natural key ${key} is not valid for ${table}`);
 return m.slice(1);
}
async function publicTableRows(tables:TableClient,macro:MacroReadApi,table:PublicTable,naturalKey:string):Promise<Record<string,unknown>[]>{
 const parts=parseNaturalKey(table,naturalKey);
 let rows:Row[];
 if(table==='industry_classifications'){const [scheme,version,code]=parts;rows=await tables.select(table,{scheme,version,code},{limit:2});}
 else if(table==='issuer_industry_memberships'){
  const [issuer_id,scheme,version]=parts;
  // Paged until an empty page (PostgREST max_rows may be small); order by code (valid_from breaks ties only within a code).
  rows=await selectAll(tables,table,{issuer_id,scheme,version},'code');
 }else rows=await macro.seriesCatalog(parts[0] as 'US'|'CN');
 return normalizeTableRows(rows);
}
/** A judgments table row (PostgREST or memory) → JudgmentRow with toISOString() timestamps. */
export function judgmentFromTable(r:Row):JudgmentRow{
 const isoOrNull=(v:unknown)=>v===null||v===undefined?null:iso(v);
 return {...(r as unknown as JudgmentRow),as_of:String(r.as_of).slice(0,10),registered_at:iso(r.registered_at),created_at:iso(r.created_at),settle_after:isoOrNull(r.settle_after),settle_by:isoOrNull(r.settle_by)};
}
async function publicJudgmentFrom(tables:TableClient,id:string):Promise<JudgmentRow|null>{
 if(!UUID.test(id))return null;
 const [r]=await tables.select('judgments',{judgment_id:id},{limit:1});
 return r?judgmentFromTable(r):null;
}
async function primarySecurityFrom(tables:TableClient,issuerId:string,on:string):Promise<{ticker:string;market:PriceMarket}|null>{
 const held=(await selectAll(tables,'issuer_securities',{issuer_id:issuerId},'ticker'))
  .filter(r=>String(r.valid_from)<=on&&(r.valid_to===null||r.valid_to===undefined||on<String(r.valid_to)));
 const out:{ticker:string;market:PriceMarket;primary:boolean}[]=[];
 for(const r of held){
  const [u]=await tables.select('stocks_universe',{ticker:String(r.ticker)},{limit:1});
  const market=u?.market as PriceMarket|undefined;
  if(market&&PRICE_MARKETS.includes(market))out.push({ticker:String(r.ticker),market,primary:r.is_primary===true});
 }
 const primary=out.filter(x=>x.primary);
 const pick=primary.length===1?primary[0]:primary.length===0&&out.length===1?out[0]:null;
 return pick?{ticker:pick.ticker,market:pick.market}:null;
}
/** The FactsDb subset judgments may use; factsByIds hides non-ok rows (the anon policy does the same server-side). */
export function publicFacts(db:FactsDb):JudgmentInputsDb['facts']{
 return {
  readFacts:(issuer,market,o)=>db.readFacts(issuer,market,{concepts:o.concepts,asOf:o.asOf,history:o.history}),
  // Returns ok facts of ANY mapping generation; used only by --reconcile (replay of frozen fact ids), never to discover inputs.
  factsByIds:async ids=>(await db.factsByIds(ids)).filter(r=>r.status==='ok'),
  // The anon policy on filings is using(true): unpublished filings (mapping_gen<=0) are visible, so drop them BEFORE limit
  // (complete-set read, then slice: gen-0 rows never consume limit slots).
  filingsOfIssuer:async(issuer,market,o)=>{const rows=(await db.filingsOfIssuer(issuer,market,{to:o.to})).filter(f=>f.mapping_gen>0);return o.limit===undefined?rows:rows.slice(0,o.limit);},
 };
}
function inputsDbOf(p:{facts:FactsDb;tables:TableClient;macro:MacroReadApi;kline:KlineFn}):JudgmentInputsDb{
 const facts=publicFacts(p.facts);
 return {
  facts,
  deriveMetricsAsOf:(issuer,market,asOf,formulaVersion)=>deriveMetricsAsOf(facts,issuer,market,asOf,formulaVersion),
  macro:p.macro,
  tableRows:(table,key)=>publicTableRows(p.tables,p.macro,table,key),
  publicJudgment:id=>publicJudgmentFrom(p.tables,id),
  kline:p.kline,
  issuerPrimarySecurity:(issuer,on)=>primarySecurityFrom(p.tables,issuer,on),
 };
}
export interface AnonInputsDeps{anon:SupabaseClient;macro?:MacroReadApi;kline?:KlineFn}
export function anonJudgmentInputsDb(d:AnonInputsDeps):JudgmentInputsDb{
 return inputsDbOf({facts:supabaseFactsDb(d.anon),tables:supabaseTableClient(d.anon),macro:d.macro??unavailableMacroReadApi(),kline:d.kline??(req=>readKlineRange(req))});
}
export interface MemoryInputsFixture{facts?:FactsDb;tables?:TableClient;macro?:MacroReadApi;judgments?:JudgmentRow[];kline?:KlineFn}
/** Test double over memory stores; `judgments` are treated as publishable public rows. */
export function memoryJudgmentInputsDb(fx:MemoryInputsFixture={}):JudgmentInputsDb{
 const tables=fx.tables??memoryTableClient();
 const base=inputsDbOf({facts:fx.facts??memoryFactsDb(),tables,macro:fx.macro??unavailableMacroReadApi(),kline:fx.kline??unsupportedKline});
 const judgments=new Map((fx.judgments??[]).map(j=>[j.judgment_id,j] as const));
 return {...base,publicJudgment:async id=>{const j=judgments.get(id);return j?structuredClone(j):base.publicJudgment(id);}};
}
