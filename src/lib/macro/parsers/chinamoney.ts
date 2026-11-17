// CFETS LprHis JSON → ParsedPoint (WP-D Task 2; P5 §5.3). Input is recorded evidence bytes from a
// single calendar-year window. A refused wider window has data.message and must fail closed.
// records[] are newest first; "---" means no quote for that tenor. Quotes before 2019-08-20 belong
// to the earlier mechanism and are excluded by firstPeriod. Locator points into the input bytes.
// Values stay canonical decimal text; duplicate dates must agree or the entire page is refused.
import {canonical} from '../decimal';
import {isIsoDate} from '../periods';
import type {ParsedPoint} from '../types';

export const CHINAMONEY_PARSER_VERSION='chinamoney-lprhis/1';
const PLAIN_DECIMAL=/^-?[0-9]+(\.[0-9]+)?$/;

export class ChinamoneyParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='ChinamoneyParseError';this.code=code;}
}

interface LprDoc{head?:{rep_code?:unknown};data?:{message?:unknown;baseCurveCfgList?:unknown};records?:unknown}

export function parseLprHis(bytes:Uint8Array,opts:{seriesId:string;field:'1Y'|'5Y';firstPeriod:string}):ParsedPoint[]{
 let doc:LprDoc;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ChinamoneyParseError('lpr_bad_json');}
 if(!doc||typeof doc!=='object'||doc.head?.rep_code!=='200')throw new ChinamoneyParseError('lpr_unsuccessful');
 const message=doc.data?.message;
 if(typeof message==='string'&&message!=='')throw new ChinamoneyParseError('lpr_window_refused',message);
 const tenors=doc.data?.baseCurveCfgList;
 if(!Array.isArray(tenors)||!tenors.includes(opts.field))throw new ChinamoneyParseError('lpr_tenor_missing',opts.field);
 if(!Array.isArray(doc.records))throw new ChinamoneyParseError('lpr_bad_json','records');
 const byDate=new Map<string,ParsedPoint>();
 doc.records.forEach((rec,i)=>{
  if(!rec||typeof rec!=='object')throw new ChinamoneyParseError('lpr_bad_row',`records/${i}`);
  const row=rec as Record<string,unknown>;
  const date=row.showDateCN;
  if(typeof date!=='string'||!isIsoDate(date))throw new ChinamoneyParseError('lpr_bad_date',`records/${i}`);
  if(date<opts.firstPeriod)return;
  const raw=row[opts.field];
  if(raw===undefined||raw===null||raw==='---'||raw==='')return;
  if(typeof raw!=='string'||!PLAIN_DECIMAL.test(raw))throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new ChinamoneyParseError('lpr_bad_value',`records/${i}/${opts.field}`);}
  const prev=byDate.get(date);
  if(prev){if(prev.valueText!==valueText)throw new ChinamoneyParseError('lpr_conflicting_rows',date);return;}
  byDate.set(date,{seriesId:opts.seriesId,periodEnd:date,valueText,locator:{kind:'json_pointer',pointer:`/records/${i}/${opts.field}`}});
 });
 return [...byDate.values()].sort((a,b)=>a.periodEnd<b.periodEnd?-1:1);
}
