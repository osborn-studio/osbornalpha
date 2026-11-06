// src/lib/entities/windows.ts
// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
// the EARLIEST holding row's valid_from to stocks_universe.list_date (method listing_date) and
// closes the LATEST open row at delist_date (method delisting), copying the exact source-row
// values into a SINGLE provenance key (never a reference to the mutable universe table, never a whole-object
// copy: the database merges the key atomically in set_security_window). A listing date after
// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
// (quarantined, row unchanged). US tickers carry no list_date and are left as first_observed.
// applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
import {MAX_PAGE,callRpc,type RangeOptions,type Row,type TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {isUnique} from './claims';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';

export const WINDOWS_RULES_VERSION='windows/1';
export const SEC_ROW_KEY=['issuer_id','ticker','valid_from'] as const;
export interface UniverseDates{ticker:string;list_date:string|null;delist_date:string|null;source:string|null;source_updated_at:string|null}
export interface WindowRow{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;provenance:Record<string,unknown>}
export type WindowChange=
 |{kind:'from';row:WindowRow;newValidFrom:string;provenance:Record<string,unknown>}
 |{kind:'to';row:WindowRow;validFrom:string;newValidTo:string;provenance:Record<string,unknown>};
export interface WindowConflict{row:WindowRow;reason:'list_date_after_first_observed'|'delist_on_or_before_valid_from';detail:Record<string,unknown>}
export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];unchanged:number;skipped:string[]}

/**
 * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
 * approach as the private helper in facts/scope.ts). A single order value with more than MAX_PAGE
 * rows cannot be paged and throws keyset_tie_group_overflow.
 */
export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
 const seen=new Set<string>(),out:Row[]=[];
 let cursor:string|null=null;
 for(;;){
  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
  if(page.length<MAX_PAGE)return out;
  const last=String(page[page.length-1][orderBy]);
  if(last===cursor)throw new Error('keyset_tie_group_overflow');
  cursor=last;
 }
}

const byFrom=(a:WindowRow,b:WindowRow)=>a.valid_from<b.valid_from?-1:a.valid_from>b.valid_from?1:0;

export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
 const byTicker=new Map<string,WindowRow[]>();
 for(const r of rows){const l=byTicker.get(r.ticker)??[];l.push(r);byTicker.set(r.ticker,l);}
 const plan:WindowPlan={changes:[],conflicts:[],unchanged:0,skipped:[]};
 for(const ticker of [...byTicker.keys()].sort()){
  const list=[...byTicker.get(ticker)!].sort(byFrom);
  const u=universe.get(ticker);
  if(!u){plan.skipped.push('not_in_universe');continue;}
  const first=list[0],last=list[list.length-1];
  let firstFrom=first.valid_from;
  if(u.list_date===null)plan.skipped.push('no_list_date');
  else if(first.valid_from_method==='listing_date')plan.unchanged++;
  else if(first.valid_from_method!=='first_observed'&&first.valid_from_method!=='curated')plan.skipped.push(`method_${first.valid_from_method}`);
  else if(u.list_date>first.valid_from)plan.conflicts.push({row:first,reason:'list_date_after_first_observed',detail:{list_date:u.list_date,valid_from:first.valid_from,source:u.source}});
  else{
   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
   firstFrom=u.list_date;
   plan.changes.push({kind:'from',row:first,newValidFrom:firstFrom,provenance});
  }
  if(u.delist_date!==null&&last.valid_to===null){
   const vf=last===first?firstFrom:last.valid_from;
   if(u.delist_date<=vf)plan.conflicts.push({row:last,reason:'delist_on_or_before_valid_from',detail:{delist_date:u.delist_date,valid_from:vf,source:u.source}});
   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
  }
 }
 plan.skipped.sort();
 return plan;
}

export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];
 counts.duplicates=plan.unchanged;
 const keyOf=(r:WindowRow)=>`${r.ticker}:${r.valid_from}`;
 const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,
  payload:{issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method},batchId:opts.batchId,
 },counts,errors,{code:reason,key:keyOf(r)});
 const blocked=new Set<string>();
 for(const c of plan.changes){
  const id=`${c.row.issuer_id}|${keyOf(c.row)}`;
  if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
  try{
   const out=await callRpc(tables,'set_security_window',c.kind==='from'
    ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.validFrom,p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
   if(out==='written'){counts.versioned++;continue;}
   if(out==='duplicate'){counts.duplicates++;continue;}
   if(c.kind==='from')blocked.add(id);
   counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
  }catch(e){
   if(c.kind==='from')blocked.add(id);
   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
   counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
  }
 }
 for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,rejectedSummary:{}};
}
