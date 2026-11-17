// src/app/(app)/admin/broker-research/review/[reportId]/review-model.ts
// Pure model of the review page (spec §6.3, §9.5): payload normalisation, typed editing by field kind
// (typed/1 shapes: decimals as strings, ISO currency, integer months, fraction pct, ISO date), live-row
// grouping, open conflict groups, stale_run detection, blocker columns, page-text segmentation (UTF-16).
import type {CorrectedValue,DocumentRow,FieldName,FieldRow,LicenceRow,ReportRow,ReviewPayload,TypedValue,ValueUnit} from '@/lib/broker-research/public-types';

const arr=<T>(v:unknown):T[]=>Array.isArray(v)?v as T[]:[];
/** Guards the ★ GET reports/[reportId] body (contract ReviewPayload, built by C6) before the page uses it. */
export function normalizeReviewPayload(raw:unknown):ReviewPayload|null{
 const o=raw as Record<string,unknown>|null;
 if(!o||typeof o!=='object'||!o.report||!o.document||!o.licence||!Array.isArray(o.fields))return null;
 return {report:o.report as ReportRow,document:o.document as DocumentRow,licence:o.licence as LicenceRow,fields:arr(o.fields),targets:arr(o.targets),snippets:arr(o.snippets),summaries:arr(o.summaries),
  runs:arr(o.runs),blockers:arr<string>(o.blockers).filter(b=>typeof b==='string'),quarantine:arr(o.quarantine),institutions:arr(o.institutions),analysts:arr(o.analysts),reportAnalysts:arr(o.reportAnalysts)};
}
/** C6 correct payload (camelCase, explicit null = clear; the server re-derives with toTyped and lets these keys override). */
export function correctionPayload(v:TypedValue,span?:{page:number;start:number;end:number}):Record<string,unknown>{
 return {valueText:v.value_text,valueNum:v.value_num,valueCurrency:v.value_currency,valueUnit:v.value_unit,valueDate:v.value_date,...(span?{page:span.page,charStart:span.start,charEnd:span.end}:{})};
}

export type FieldKind='price'|'currency'|'months'|'pct'|'date'|'text';
const KIND:Record<FieldName,FieldKind>={institution:'text',analyst:'text',published_date:'date',price_as_of_date:'date',ticker:'text',rating:'text',target_price:'price',target_currency:'currency',target_horizon:'months',
 price_at_report:'price',price_currency:'currency',upside_stated:'pct',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct',valuation_method:'text',sector:'text',title:'text'};
export const fieldKind=(f:FieldName)=>KIND[f];
export const ALL_FIELDS=Object.keys(KIND) as FieldName[];
export const TARGET_LEVEL:FieldName[]=['ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','price_as_of_date','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method'];
export const REPORT_LEVEL:FieldName[]=['institution','analyst','published_date','sector','title'];
export const ABSENT_FIELDS:FieldName[]=['rating','target_price','analyst','target_horizon'];
export interface TypedForm{value_text:string;value_num:string;value_currency:string;value_date:string}
export const typedFormOf=(v:TypedValue):TypedForm=>({value_text:v.value_text,value_num:v.value_num??'',value_currency:v.value_currency??'',value_date:v.value_date??''});
const DEC=/^-?\d+(?:\.\d+)?$/;
const isDate=(s:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const ms=Date.parse(`${s}T00:00:00Z`);return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s;};
export function buildTyped(field:FieldName,f:TypedForm):{ok:true;value:CorrectedValue&TypedValue}|{ok:false;error:keyof TypedForm}{
 const text=f.value_text.trim(),num=f.value_num.trim(),cur=f.value_currency.trim().toUpperCase(),day=f.value_date.trim();
 const out=(value_num:string|null,value_currency:string|null,value_unit:ValueUnit|null,value_date:string|null,value_text=text)=>({ok:true as const,value:{value_text,value_num,value_currency,value_unit,value_date}});
 switch(fieldKind(field)){
  case 'price':if(!text)return {ok:false,error:'value_text'};if(!DEC.test(num))return {ok:false,error:'value_num'};if(cur&&!/^[A-Z]{3}$/.test(cur))return {ok:false,error:'value_currency'};return out(num,cur||null,'price',null);
  case 'currency':{const c=(cur||text).toUpperCase();if(!/^[A-Z]{3}$/.test(c))return {ok:false,error:'value_text'};return out(null,c,null,null,c);}
  case 'months':if(!text)return {ok:false,error:'value_text'};if(!/^\d{1,3}$/.test(num)||Number(num)<1)return {ok:false,error:'value_num'};return out(num,null,'months',null);
  case 'pct':if(!text)return {ok:false,error:'value_text'};if(!DEC.test(num))return {ok:false,error:'value_num'};return out(num,null,'pct',null);
  case 'date':if(!text)return {ok:false,error:'value_text'};if(!isDate(day))return {ok:false,error:'value_date'};return out(null,null,null,day);
  default:return text?out(null,null,null,null):{ok:false,error:'value_text'};
 }
}

const isLive=(f:FieldRow)=>f.superseded_by_run_id===null&&f.status!=='rejected';
export function groupFields(fields:FieldRow[]):Map<string,FieldRow[]>{
 const m=new Map<string,FieldRow[]>();
 for(const f of fields.filter(isLive)){const k=f.target_key??'';m.set(k,[...(m.get(k)??[]),f]);}
 return m;
}
/** Conflict groups still open: ≥ 2 candidate rows and no effective row in the group (spec §6.2). */
export function conflictGroups(fields:FieldRow[]):Map<string,FieldRow[]>{
 const m=new Map<string,FieldRow[]>();
 for(const f of fields.filter(x=>x.conflict_group!==null&&x.superseded_by_run_id===null))m.set(f.conflict_group!,[...(m.get(f.conflict_group!)??[]),f]);
 for(const [k,rows] of m){const cand=rows.filter(r=>r.status==='extracted'||r.status==='unverified');if(cand.length<2||rows.some(r=>r.status==='confirmed'||r.status==='corrected'))m.delete(k);}
 return m;
}
export const isStaleRun=(currentParseRunId:string|null,fields:FieldRow[])=>currentParseRunId!==null&&fields.some(f=>isLive(f)&&f.parse_run_id!==null&&f.parse_run_id!==currentParseRunId);

export function blockerParts(code:string):{key:string;arg:string|null}{const i=code.indexOf(':');return i<0?{key:code,arg:null}:{key:code.slice(0,i),arg:code.slice(i+1)};}
export function blockerColumns(blockers:string[]):{reviewReady:string[];publishReady:string[]}{
 return {reviewReady:blockers.filter(b=>b!=='review_not_approved'),publishReady:[...blockers]};
}

export interface Span{start:number;end:number;id:string}
/** Splits text around spans (sorted by start; a span overlapping an earlier one is dropped; ends clamp to the text). */
export function segmentText(text:string,spans:Span[]):{text:string;id:string|null}[]{
 const out:{text:string;id:string|null}[]=[];let pos=0;
 for(const s of [...spans].sort((a,b)=>a.start-b.start||a.end-b.end)){
  const start=Math.max(s.start,0),end=Math.min(s.end,text.length);
  if(start<pos||end<=start)continue;
  if(start>pos)out.push({text:text.slice(pos,start),id:null});
  out.push({text:text.slice(start,end),id:s.id});pos=end;
 }
 if(pos<text.length)out.push({text:text.slice(pos),id:null});
 return out;
}
export const remainingChars=(max:number|null,len:number)=>max===null?null:max-len;

export {adminJson,baseCode,BTN_PRIMARY,BTN_GHOST,CHIP_ACCENT,CHIP_WARN,ERROR_BAR,FIELD_LABEL,H3} from '../../_shared/admin-fetch';
const CHIP_BASE='inline-flex items-center rounded border px-1.5 py-0.5 text-[11px]';
export const CHIP_DANGER=`${CHIP_BASE} border-danger text-danger`;
export const DOT=(status:'ok'|'warn'|'err')=>`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${status==='ok'?'bg-accent':status==='warn'?'bg-warn':'bg-danger'}`;
