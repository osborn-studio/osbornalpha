// src/lib/dq/reconcile/gold-cn.ts
// A-share annual-report gold set (spec §5.4, T14; schema 'gold/cn-annual/1'), validator and the printed-precision
// rules. Fixed: the six concepts of the annual report table 主要会计数据和财务指标 (BS concepts INSTANT, IS/CF 12M,
// eps CNY/share with multiplier 1), fiscal years FY2022–FY2025 (owner decision E), only the 本期 column, recorder
// and reviewer as code names that must differ. The validator rejects anything that is not the EXACT product
// tickers × fiscal_years × concepts. Every row carries tushare_source_ref = <ts_code>:<end_date>:<report_type>:<ann_date>,
// independently verified by recorder and reviewer to be the same version as the PDF (pdf_sha256); the pair binds the
// left side ONLY through it (filings.document_ref is a cross-check). Interval: center = printed × multiplier,
// radius = 0.5 × 10^-decimals × multiplier; automatic quarantine only for exact printing (multiplier 1, two
// decimals), rounded printing gets a review item. goldTemplate builds the transcription template (every printed and
// source field '<pending>', so it fails validation until transcribed); pickCnSample is §5.4's sample rule.
import {conceptById} from '../../facts/concepts';
import {canonicalDecimal} from '../../facts/json-numbers';
import {mulDecimal} from './decimal';

export const GOLD_CN_SCHEMA='gold/cn-annual/1';
export const CN_GOLD_PATH='src/lib/dq/fixtures/gold/cn-annual-v1.json';
export const CN_GOLD_PARSER='gold-cn/1';
export const CN_GOLD_CONCEPTS=['revenue_operating','net_income_parent','total_assets','equity_parent','operating_cash_flow','eps_basic'] as const;
export type CnGoldConcept=typeof CN_GOLD_CONCEPTS[number];
export const CN_GOLD_FISCAL_YEARS:readonly number[]=[2022,2023,2024,2025];
export const CN_GOLD_MULTIPLIERS:readonly number[]=[1,1000,10000,1000000,100000000];
export interface GoldCnSource{document:string;cninfo_announcement_id:string;announcement_date:string;pdf_url:string;pdf_sha256:string;page:number;table:string}
export interface GoldCnRow{ticker:string;fiscal_year:number;concept:CnGoldConcept;printed_value:string;printed_unit_multiplier:number;printed_decimals:number;column:'本期';report_type?:number;source:GoldCnSource;tushare_source_ref:string;recorded_at:string}
export interface GoldCnFile{schema:typeof GOLD_CN_SCHEMA;tickers:string[];fiscal_years:number[];concepts:string[];recorded_by:string;reviewed_by:string;rows:GoldCnRow[]}

const TICKER=/^\d{6}\.(SH|SZ|BJ)$/,CODE=/^[A-Za-z0-9_-]{1,32}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,PRINTED=/^-?\d+(\.\d+)?$/;
const REF=/^(\d{6}\.(?:SH|SZ|BJ)):(\d{8}):(\d+):(\d{8})$/;
const str=(v:unknown):v is string=>typeof v==='string'&&v.trim()!=='';
const fraction=(v:string)=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};

export const cnGoldKey=(r:Pick<GoldCnRow,'ticker'|'fiscal_year'|'concept'|'tushare_source_ref'>)=>`${r.ticker}:${r.fiscal_year}:${r.concept}:${r.tushare_source_ref.split(':')[2]??''}`;

export function validateGoldCn(json:unknown):{ok:true;file:GoldCnFile}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const f=json as Partial<GoldCnFile>|null;
 if(!f||typeof f!=='object')return {ok:false,errors:['not_an_object']};
 if(f.schema!==GOLD_CN_SCHEMA)e('schema');
 const tickers=Array.isArray(f.tickers)?f.tickers:[];
 if(tickers.length===0)e('tickers: empty');
 if(tickers.some(t=>typeof t!=='string'||!TICKER.test(t)))e('tickers: invalid ticker');
 if(new Set(tickers).size!==tickers.length)e('tickers: duplicate');
 const years=Array.isArray(f.fiscal_years)?f.fiscal_years:[];
 if(JSON.stringify([...years].sort())!==JSON.stringify([...CN_GOLD_FISCAL_YEARS]))e('fiscal_years: must be FY2022–FY2025');
 const concepts=Array.isArray(f.concepts)?f.concepts:[];
 if(concepts.length!==CN_GOLD_CONCEPTS.length||!CN_GOLD_CONCEPTS.every(c=>concepts.includes(c)))e('concepts: must be the fixed six');
 if(!str(f.recorded_by)||!CODE.test(f.recorded_by))e('recorded_by: code name');
 if(!str(f.reviewed_by)||!CODE.test(f.reviewed_by))e('reviewed_by: code name');
 if(f.recorded_by===f.reviewed_by)e('recorded_by == reviewed_by');
 const rows=Array.isArray(f.rows)?f.rows:[];
 const seen=new Set<string>();
 rows.forEach((r,i)=>{
  const at=`rows[${i}]`;
  if(!r||typeof r!=='object'){e(`${at}: not an object`);return;}
  const combo=`${r.ticker}|${r.fiscal_year}|${r.concept}`;
  if(!tickers.includes(r.ticker)||!years.includes(r.fiscal_year)||!(CN_GOLD_CONCEPTS as readonly string[]).includes(r.concept))e(`${at}: ${combo} outside the product`);
  if(seen.has(combo))e(`${at}: duplicate ${combo}`);seen.add(combo);
  if(typeof r.printed_value!=='string'||!PRINTED.test(r.printed_value))e(`${at}.printed_value`);
  else if(!Number.isInteger(r.printed_decimals)||r.printed_decimals<0||r.printed_decimals>6||fraction(r.printed_value)!==r.printed_decimals)e(`${at}.printed_decimals`);
  if(!CN_GOLD_MULTIPLIERS.includes(r.printed_unit_multiplier))e(`${at}.printed_unit_multiplier`);
  if(r.concept==='eps_basic'&&r.printed_unit_multiplier!==1)e(`${at}: eps multiplier must be 1`);
  if(r.column!=='本期')e(`${at}.column`);
  const s=(r.source??{}) as Partial<GoldCnSource>;
  if(!Number.isInteger(s.page)||(s.page as number)<1)e(`${at}.source.page`);
  if(typeof s.pdf_sha256!=='string'||!SHA.test(s.pdf_sha256))e(`${at}.source.pdf_sha256`);
  if(!str(s.cninfo_announcement_id))e(`${at}.source.cninfo_announcement_id`);
  if(typeof s.announcement_date!=='string'||!DATE.test(s.announcement_date))e(`${at}.source.announcement_date`);
  if(!str(s.document))e(`${at}.source.document`);
  if(!str(s.table))e(`${at}.source.table`);
  if(typeof s.pdf_url!=='string'||!/^https?:\/\//.test(s.pdf_url))e(`${at}.source.pdf_url`);
  const m=typeof r.tushare_source_ref==='string'?REF.exec(r.tushare_source_ref):null;
  if(!m)e(`${at}.tushare_source_ref`);
  else{
   if(m[1]!==r.ticker)e(`${at}.tushare_source_ref: ts_code ${m[1]} != ${r.ticker}`);
   if(m[2]!==`${r.fiscal_year}1231`)e(`${at}.tushare_source_ref: end_date ${m[2]} != ${r.fiscal_year}1231`);
   if(m[3]!==String(r.report_type??1))e(`${at}.tushare_source_ref: report_type ${m[3]} != ${r.report_type??1}`);
  }
  if(typeof r.recorded_at!=='string'||Number.isNaN(Date.parse(r.recorded_at)))e(`${at}.recorded_at`);
 });
 for(const t of tickers)for(const y of years)for(const c of CN_GOLD_CONCEPTS)if(!seen.has(`${t}|${y}|${c}`))e(`missing ${t}|${y}|${c}`);
 return errors.length>0?{ok:false,errors}:{ok:true,file:f as GoldCnFile};
}

export function printedInterval(r:Pick<GoldCnRow,'printed_value'|'printed_unit_multiplier'|'printed_decimals'>):{center:string;radius:string}{
 const mult=String(r.printed_unit_multiplier);
 return {center:mulDecimal(canonicalDecimal(r.printed_value),mult),radius:mulDecimal(canonicalDecimal(`5e-${r.printed_decimals+1}`),mult)};
}
export const autoQuarantinable=(r:Pick<GoldCnRow,'printed_unit_multiplier'|'printed_decimals'>):boolean=>r.printed_unit_multiplier===1&&r.printed_decimals===2;
export function cnPeriodOf(fy:number,concept:string):{period_start:string|null;period_end:string;duration:'12M'|'INSTANT';unit:'CNY'|'CNY/share'}{
 const def=conceptById(concept);if(!def)throw new Error(`unknown_concept:${concept}`);
 const instant=def.nature==='instant';
 return {period_start:instant?null:`${fy}-01-01`,period_end:`${fy}-12-31`,duration:instant?'INSTANT':'12M',unit:def.unitKind==='per_share'?'CNY/share':'CNY'};
}

/** §5.4 sample: valid unique tickers ascending, the first min(n, N). */
export function pickCnSample(tickers:readonly (string|null)[],n=30):string[]{
 return [...new Set(tickers.filter((t):t is string=>typeof t==='string'&&TICKER.test(t)))].sort().slice(0,Math.max(0,n));
}
/** Transcription template: the exact product, every printed/source field '<pending>' (fails validateGoldCn until filled). */
export function goldTemplate(tickers:readonly string[]):Omit<GoldCnFile,'rows'>&{rows:Record<string,unknown>[]}{
 const P='<pending>';
 return {schema:GOLD_CN_SCHEMA,tickers:[...tickers],fiscal_years:[...CN_GOLD_FISCAL_YEARS],concepts:[...CN_GOLD_CONCEPTS],recorded_by:P,reviewed_by:P,
  rows:tickers.flatMap(ticker=>CN_GOLD_FISCAL_YEARS.flatMap(fiscal_year=>CN_GOLD_CONCEPTS.map(concept=>({ticker,fiscal_year,concept,printed_value:P,printed_unit_multiplier:concept==='eps_basic'?1:P,printed_decimals:P,column:'本期',
   source:{document:P,cninfo_announcement_id:P,announcement_date:P,pdf_url:P,pdf_sha256:P,page:P,table:'主要会计数据和财务指标'},tushare_source_ref:P,recorded_at:P}))))};
}
