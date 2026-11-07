// src/lib/dq/dashboard-blocks.ts
// The plan-3 blocks of GET /api/admin/dq (spec §7 table): the filing calendar (per-market counts
// that never depend on the market filter, plus the attention rows and the no-rule rows for the
// selected market), pending identifier claims (with the securities an evidence_only amendment can
// target), and reconciliation failures by pair (distinct natural keys, latest row) with each cycle pair's latest cycle. Reads go
// through TableClient (equality + range filters only); every list is bounded.
import {callRpc,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import type {Market} from '../facts/types';
import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';

export const MARKETS:readonly Market[]=['US','CN'];
export const CALENDAR_ROWS_MAX=100;
export const CALENDAR_NO_RULE_MAX=50;
export const CLAIMS_MAX=50;
export const DUE_SOON_DAYS=7;
export type ByMarket=Record<Market,number>;
export interface CalendarBlock{overdueByMarket:ByMarket;filedNotIngestedByMarket:ByMarket;unknownUpstreamByMarket:ByMarket;noRuleByMarket:ByMarket;estimatedByMarket:ByMarket;rows:Row[];noRuleRows:Row[]}
export interface ClaimsBlock{rows:Row[];total:number;securitiesByIssuer:Record<string,Row[]>}
export type ReconciliationsByPair=Record<string,{failed:number;lastCycle:{cycle_id:string;status:string;finished_at:string|null}|null}>;

const addDaysIso=(iso:string,n:number)=>new Date(Date.parse(`${iso}T00:00:00Z`)+n*86_400_000).toISOString().slice(0,10);
async function byMarket(client:TableClient,match:Row):Promise<ByMarket>{
 const [us,cn]=await Promise.all(MARKETS.map(m=>client.count('dq_filing_expectations',{...match,market:m})));
 return {US:us,CN:cn};
}
/** Attention order: overdue, filed-not-ingested, due within 7 days, unknown upstream; then due date (none last), period end. */
const RANK:Record<string,number>={overdue:0,filed_not_ingested:1,pending:2,unknown_upstream:3};
const rowKey=(r:Row)=>`${r.issuer_id}|${r.market}|${r.report_kind}|${r.period_end}`;

export async function loadCalendarBlock(client:TableClient,market:Market|undefined,now:Date):Promise<CalendarBlock>{
 const today=now.toISOString().slice(0,10);
 const scope:Row=market?{market}:{};
 /**
  * Attention order BEFORE the limit: due date ascending (nulls last), then period end descending. TableClient has one order key,
  * so when the page is full the rows tied on the boundary due date are re-read ordered by period end (a tie beyond that is unspecified).
  */
 const list=async(match:Row,extra:{gte?:Record<string,string>;lt?:Record<string,string>}={})=>{
  const first=await client.select('dq_filing_expectations',{...scope,...match},{orderBy:'due_date',limit:CALENDAR_ROWS_MAX,...extra});
  if(first.length<CALENDAR_ROWS_MAX)return first;
  const edge=first[first.length-1].due_date??null;
  const tied=await client.select('dq_filing_expectations',{...scope,...match,due_date:edge},{orderBy:'period_end',desc:true,limit:CALENDAR_ROWS_MAX,...extra});
  return [...first.filter(r=>(r.due_date??null)!==edge),...tied];
 };
 const [overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,overdue,filed,soon,unknown,noRuleRows]=await Promise.all([
  byMarket(client,{disclosure_state:'overdue'}),byMarket(client,{disclosure_state:'filed_not_ingested'}),byMarket(client,{disclosure_state:'unknown_upstream'}),
  byMarket(client,{deadline_state:'no_rule'}),byMarket(client,{period_end_estimated:true}),
  list({disclosure_state:'overdue'}),list({disclosure_state:'filed_not_ingested'}),
  list({disclosure_state:'pending'},{gte:{due_date:today},lt:{due_date:addDaysIso(today,DUE_SOON_DAYS+1)}}),
  list({disclosure_state:'unknown_upstream'}),
  client.select('dq_filing_expectations',{...scope,deadline_state:'no_rule'},{orderBy:'period_end',desc:true,limit:CALENDAR_NO_RULE_MAX}),
 ]);
 const seen=new Set<string>();
 const rows=[...overdue,...filed,...soon,...unknown].filter(r=>{const k=rowKey(r);if(seen.has(k))return false;seen.add(k);return true;})
  .sort((a,b)=>(RANK[String(a.disclosure_state)]??9)-(RANK[String(b.disclosure_state)]??9)||String(a.due_date??'9999').localeCompare(String(b.due_date??'9999'))||String(b.period_end).localeCompare(String(a.period_end))||rowKey(a).localeCompare(rowKey(b)))
  .slice(0,CALENDAR_ROWS_MAX);
 return {overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,rows,noRuleRows};
}

export async function loadClaimsBlock(client:TableClient):Promise<ClaimsBlock>{
 const [rows,total]=await Promise.all([
  client.select('issuer_identifier_claims',{status:'pending'},{orderBy:'created_at',desc:true,limit:CLAIMS_MAX}),
  client.count('issuer_identifier_claims',{status:'pending'}),
 ]);
 const issuers=[...new Set(rows.filter(r=>r.op==='evidence_only').map(r=>String(r.issuer_id)))];
 const lists=await Promise.all(issuers.map(id=>selectAll(client,'issuer_securities',{issuer_id:id},'valid_from')));
 const securitiesByIssuer=Object.fromEntries(issuers.map((id,i)=>[id,lists[i].map(s=>({ticker:s.ticker,valid_from:s.valid_from,valid_to:s.valid_to??null,valid_from_method:s.valid_from_method??null,is_primary:s.is_primary===true}))]));
 return {rows,total,securitiesByIssuer};
}

/**
 * Failed count per pair = distinct natural keys whose LATEST row failed, aggregated in SQL (dq_reconcile_failed_counts):
 * out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count.
 * Known limitation: a key that later leaves the sample keeps its last failed row in the count.
 */
export async function loadReconciliationsByPair(client:TableClient):Promise<ReconciliationsByPair>{
 const cyclePairs=new Set<string>(CYCLE_PAIR_IDS);
 const counts=await callRpc(client,'dq_reconcile_failed_counts',{});
 const failedBy=new Map<string,number>(Array.isArray(counts)?counts.map((r:Row)=>[String(r.pair),Number(r.failed)] as [string,number]):[]);
 const entries=await Promise.all(RECONCILE_PAIR_IDS.map(async pair=>{
  const cycles=cyclePairs.has(pair)?await client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):[] as Row[];
  const c=cycles[0];
  return [pair,{failed:failedBy.get(pair)??0,lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
 }));
 return Object.fromEntries(entries);
}
