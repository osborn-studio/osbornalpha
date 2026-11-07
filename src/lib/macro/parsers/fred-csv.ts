// FRED public CSV → ParsedPoint (spec §4.4 "FRED CSV 解析"). Input is the exact evidence bytes of
// fredgraph.csv?id=<CODE>: header `observation_date,<CODE>`, then `YYYY-MM-DD,<value>` per line.
// The value text is kept as text (canonical decimal, never Number()); an empty field or `.` is a
// missing value and produces no point (missing stays missing). Monthly/quarterly rows are dated the
// first day of the period and are mapped to the period end. Locator = 1-based file line, column 1
// (the value column). Duplicate dates are all returned: macro_write_observations reports two
// different values for one period as `conflicting_rows`. Any structural surprise throws
// FredParseError, so a changed format can never be half-read.
import {canonical} from '../decimal';
import {isIsoDate,periodEndOf} from '../periods';
import type {ParsedPoint,PeriodKind} from '../types';

export const FRED_PARSER_VERSION='fred-csv/1';
export class FredParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message?`${code}: ${message}`:code);this.name='FredParseError';this.code=code;}
}
const CODE=/^[A-Z0-9_]{1,40}$/;

export function parseFredCsv(bytes:Uint8Array,opts:{seriesId:string;code:string;period:PeriodKind}):ParsedPoint[]{
 if(!CODE.test(opts.code))throw new FredParseError('bad_code');
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new FredParseError('bad_encoding');}
 if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
 const lines=text.split('\n');
 if(lines.length>0&&lines[lines.length-1]==='')lines.pop();   // trailing newline
 const strip=(l:string)=>l.endsWith('\r')?l.slice(0,-1):l;
 if(lines.length===0||strip(lines[0])!==`observation_date,${opts.code}`)throw new FredParseError('bad_header',strip(lines[0]??'').slice(0,80));
 const out:ParsedPoint[]=[];
 for(let i=1;i<lines.length;i++){
  const line=strip(lines[i]),lineNo=i+1;
  const comma=line.indexOf(',');
  if(comma<0||line.indexOf(',',comma+1)>=0)throw new FredParseError('bad_row',`line ${lineNo}`);
  const date=line.slice(0,comma),raw=line.slice(comma+1);
  if(!isIsoDate(date))throw new FredParseError('bad_date',`line ${lineNo}`);
  if(raw===''||raw==='.')continue;
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new FredParseError('bad_value',`line ${lineNo}`);}
  if(opts.period!=='day'){
   const start=opts.period==='month'?date.slice(8)==='01':date.slice(8)==='01'&&['01','04','07','10'].includes(date.slice(5,7));
   if(!start)throw new FredParseError('bad_period_start',`line ${lineNo}`);
  }
  out.push({seriesId:opts.seriesId,periodEnd:periodEndOf(date,opts.period),valueText,locator:{kind:'csv_row',line:lineNo,column:1}});
 }
 return out;
}
