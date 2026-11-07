// src/lib/industry/judgment-input.ts
// F4 input adapter for industry rows (spec §7.1, F4 §3.5 InputRef<'table_rows'>), delivered here and
// registered by F4's src/lib/judgments/inputs.ts (this plan writes nothing under src/lib/judgments).
// natural_key 'industry_metrics:<run_id>:<code>:<period_end>'; snapshot = every ok row of that
// (run, code, period_end) with the table's columns, ordered by (metric, period_start, duration);
// hash = digest(snapshot) (F4: RFC 8785 canonical JSON + sha256, the pa-v1 helper F4 reuses);
// available_at = end of the UTC day of the rows' updated_at (F4 §3.7 table_rows rule; = run activation,
// never facts_as_of / period_end / created_at); origin locator = the cell group's content-addressed
// manifest (exactly one per group, else 'input_ambiguous_manifest'). Reads go through the ANON IndustryDb, so a row of an invisible run, an unlicensed dataset
// or a building/failed run is 'input_not_public' (F4 §3.5 constructor rule). The valuation table is the
// deferred I-3 pipeline: its natural keys parse but construction answers 'unsupported_deferred_i3'.
import {digest} from '../research/ingest/pa-v1/json';
import {schemeDatasetKey} from './licenses';
import type {DatasetKey,IndustryDb,MetricCellRow} from './types';

export type IndustryTable='industry_metrics'|'industry_valuations';
export interface IndustryTableRowsRef{table:IndustryTable;natural_key:string}
export interface IndustryTableRowsSnapshot{table:IndustryTable;natural_key:string;rows:MetricCellRow[]}
export interface IndustryTableRowsInput{
 kind:'table_rows';ref:IndustryTableRowsRef;snapshot:IndustryTableRowsSnapshot;hash:string;available_at:string;
 origin:{publisher:'OsbornAlpha';adapter:string;locator:string;transform:string;license:DatasetKey};
}
export class IndustryInputError extends Error{constructor(public code:'invalid_natural_key'|'input_not_public'|'input_ambiguous_manifest'|'unsupported_deferred_i3'){super(code);this.name='IndustryInputError';}}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const metricsNaturalKey=(runId:string,code:string,periodEnd:string)=>`industry_metrics:${runId}:${code}:${periodEnd}`;
export const valuationsNaturalKey=(runId:string,code:string,tradeDate:string)=>`industry_valuations:${runId}:${code}:${tradeDate}`;
/** 'table:run:code:date' — codes never contain ':' (CODE_RE), so splitting is unambiguous. */
export function parseIndustryNaturalKey(nk:string):{table:IndustryTable;runId:string;code:string;date:string}|null{
 const parts=nk.split(':');
 if(parts.length!==4)return null;
 const [table,runId,code,date]=parts;
 if((table!=='industry_metrics'&&table!=='industry_valuations')||!UUID.test(runId)||!/^[A-Za-z0-9.\-]{1,32}$/.test(code)||!DATE.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)return null;
 return {table,runId,code,date};
}
/** F4 §3.7: a table_rows input is available at the end of its rows' updated_at UTC day. */
export function endOfUtcDay(ts:string):string{
 const d=new Date(ts);
 if(Number.isNaN(d.getTime()))throw new IndustryInputError('input_not_public');
 return `${d.toISOString().slice(0,10)}T23:59:59.999Z`;
}
const ROW_KEYS=['run_id','code','metric','period_start','period_end','duration','status','missing_reason','value','unit','n_members','n_with_data','n_unresolved','manifest_hash','updated_at'] as const;
const project=(r:MetricCellRow):MetricCellRow=>Object.fromEntries(ROW_KEYS.map(k=>[k,r[k]])) as unknown as MetricCellRow;
const order=(a:MetricCellRow,b:MetricCellRow)=>a.metric<b.metric?-1:a.metric>b.metric?1:a.period_start<b.period_start?-1:a.period_start>b.period_start?1:a.duration<b.duration?-1:a.duration>b.duration?1:0;

/** Builds the InputRef from the anon read path; throws IndustryInputError. */
export async function industryTableRowsInput(db:Pick<IndustryDb,'metricRun'|'metricRowsOfRun'>,ref:IndustryTableRowsRef):Promise<IndustryTableRowsInput>{
 const k=parseIndustryNaturalKey(ref.natural_key);
 if(!k||k.table!==ref.table)throw new IndustryInputError('invalid_natural_key');
 if(k.table==='industry_valuations')throw new IndustryInputError('unsupported_deferred_i3');
 const run=await db.metricRun(k.runId);
 if(!run||run.status!=='active')   // anon RLS only exposes active runs; anything else is not public
  throw new IndustryInputError('input_not_public');
 const rows=(await db.metricRowsOfRun(k.runId,{codes:[k.code],periodEnds:[k.date]})).filter(r=>r.code===k.code&&r.period_end===k.date&&r.status==='ok').sort(order);
 if(rows.length===0||rows.some(r=>r.updated_at===null))throw new IndustryInputError('input_not_public');
 const snapshot:IndustryTableRowsSnapshot={table:ref.table,natural_key:ref.natural_key,rows:rows.map(project)};
 // one manifest per (run, code, period_end) group (aggregation writes a group from one manifest); more would make the locator ambiguous
 const hashes=[...new Set(rows.map(r=>r.manifest_hash))];
 if(hashes.length!==1)throw new IndustryInputError('input_ambiguous_manifest');
 const latest=rows.map(r=>r.updated_at!).sort().at(-1)!;
 return {
  kind:'table_rows',ref:{table:ref.table,natural_key:ref.natural_key},snapshot,hash:digest(snapshot),available_at:endOfUtcDay(latest),
  origin:{publisher:'OsbornAlpha',adapter:run.method_version,locator:`manifest:${hashes[0]}`,
   transform:run.history_class==='reconstruction'?`${run.config_hash};history_class=reconstruction`:run.config_hash,license:schemeDatasetKey(run.scheme,run.version)},
 };
}
