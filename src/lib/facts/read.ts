// src/lib/facts/read.ts
// Reference read semantics of read_facts (spec §4.6, §5.2), pure, for derive and tests. Per
// filing only rows whose mapping_gen equals the filing's activated mapping_gen count; rows
// visible at asOf (available_date <= asOf) with status ok form one sequence per K ordered by
// (available_date, created_at, fact_id); disclosure_seq is the position, is_current marks the
// last row, is_revision a numeric value change against the previous row (decimalEquals, never
// JS numbers). includeNonOk adds staged/quarantined rows OUTSIDE the sequences (disclosure_seq
// undefined, is_current false, is_revision false) exactly like the SQL window and memoryFactsDb
// (audit round-1 #14); history=false keeps current rows only, so non-ok rows never appear there.
// All string comparisons are plain code-unit (C collation) order; created_at is compared as an
// instant (Date.parse; equal instants compare equal so fact_id breaks the tie like PostgreSQL;
// unparseable values sort last, among themselves by string). Adapters normalise timestamps to
// millisecond ISO, so sub-millisecond ordering between different transactions is not reproduced
// (accepted limitation; SQL read_facts is authoritative in production). Sequences are scoped per
// (issuer_id, market, K); asOf/from/to must be YYYY-MM-DD. Output is ascending by K, not the SQL's
// period_end-desc key rank: callers that need the SQL order use readFacts.
import type {FactRow} from './types';
import {factKey} from './keys';
import {decimalEquals} from './json-numbers';

export interface SequenceOptions{
 asOf:string;
 /** filing_id → activated mapping_gen (filings.mapping_gen); rows of unknown filings are dropped. */
 filings:Map<string,number>;
 includeNonOk?:boolean;history?:boolean;concepts?:readonly string[];from?:string;to?:string;
}

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const cmpInstant=(a:string,b:string)=>{
 const x=Date.parse(a),y=Date.parse(b),bx=Number.isNaN(x),by=Number.isNaN(y);
 if(bx||by)return bx&&by?cmp(a,b):bx?1:-1;
 return x<y?-1:x>y?1:0;
};
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const checkDay=(name:string,v:string|undefined)=>{if(v!==undefined&&(!DAY.test(v)||Number.isNaN(Date.parse(`${v}T00:00:00Z`))))throw new RangeError(`${name} must be YYYY-MM-DD, got ${v}`);};
const scoped=(r:FactRow)=>`${r.issuer_id}\u0000${r.market}\u0000${factKey(r)}`;
const order=(a:FactRow,b:FactRow)=>cmp(a.available_date,b.available_date)||cmpInstant(a.created_at,b.created_at)||cmp(a.fact_id,b.fact_id);
const keyOrder=(a:FactRow,b:FactRow)=>cmp(a.concept,b.concept)||cmp(a.period_end,b.period_end)||cmp(a.period_start??'',b.period_start??'')||cmp(a.unit,b.unit)||cmp(a.consolidation,b.consolidation)||cmp(a.issuer_id,b.issuer_id)||cmp(a.market,b.market);

export function sequencesOf(rows:FactRow[],opts:SequenceOptions):FactRow[]{
 checkDay('asOf',opts.asOf);checkDay('from',opts.from);checkDay('to',opts.to);
 const concepts=opts.concepts?new Set(opts.concepts):null;
 const visible=rows.filter(r=>opts.filings.get(r.filing_id)===r.mapping_gen&&r.available_date<=opts.asOf&&(opts.includeNonOk||r.status==='ok')
  &&(concepts===null||concepts.has(r.concept))&&(opts.from===undefined||r.period_end>=opts.from)&&(opts.to===undefined||r.period_end<=opts.to));
 const byKey=new Map<string,FactRow[]>();
 for(const r of visible)if(r.status==='ok'){const k=scoped(r);const g=byKey.get(k)??[];g.push(r);byKey.set(k,g);}
 const out:FactRow[]=[];
 for(const g of byKey.values()){
  g.sort(order);
  g.forEach((r,i)=>{
   const prev=i>0?g[i-1]:null;
   out.push({...r,disclosure_seq:i+1,is_current:i===g.length-1,is_revision:prev!==null&&!decimalEquals(prev.value,r.value)});
  });
 }
 for(const r of visible)if(r.status!=='ok')out.push({...r,disclosure_seq:undefined,is_current:false,is_revision:false});
 const kept=opts.history?out:out.filter(r=>r.is_current);
 return kept.sort((a,b)=>keyOrder(a,b)||order(a,b));
}

/** Current ok row per K at asOf (history=false, ok only). */
export const currentFacts=(rows:FactRow[],opts:Omit<SequenceOptions,'history'|'includeNonOk'>):FactRow[]=>sequencesOf(rows,{...opts,history:false,includeNonOk:false});
