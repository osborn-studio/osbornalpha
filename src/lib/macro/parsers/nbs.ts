// src/lib/macro/parsers/nbs.ts
// National Bureau of Statistics data-stream response → ParsedPoint (spec §4.4; evidence = the exact bytes of
// POST https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData made by AKShare
// macro_china_nbs_nation). Verified shape (2026-11-06):
//   {"data":[{"code":"202610MM"|"202603SS","name":"2026年10月","values":[{"i_showname":"制造业采购经理指数 (%) ",
//     "_id":"…","value":"49.3","da":"000000000000",…},…]},…],"success":true,"state":20000,"message":"成功"}
// `value` is a JSON string (lossless); "" = not yet released → no point. The series is selected by
// i_showname with all whitespace removed. Period codes: YYYYMMMM → month end, YYYY0QSS → quarter end.
// Locator: json_pointer /data/<i>/values/<j>/value. Any deviation (numeric value, two matching indicators
// in one period, unknown period code, success≠true) throws NbsParseError.
import {canonical} from '../decimal';
import {monthEnd,quarterEnd} from '../periods';
import type {ParsedPoint,PeriodKind} from '../types';

export const NBS_PARSER_VERSION='nbs-esdata/1';
export class NbsParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='NbsParseError';this.code=code;}
}
const strip=(s:unknown)=>typeof s==='string'?s.replace(/\s+/g,''):'';
const NATIONAL='000000000000';

function periodEndOfCode(code:unknown,period:PeriodKind):string{
 const s=typeof code==='string'?code:'';
 const m=/^(\d{4})(\d{2})MM$/.exec(s),q=/^(\d{4})0([1-4])SS$/.exec(s);
 if(period==='month'&&m&&Number(m[2])>=1&&Number(m[2])<=12)return monthEnd(Number(m[1]),Number(m[2]));
 if(period==='quarter'&&q)return quarterEnd(Number(q[1]),Number(q[2]));
 throw new NbsParseError('nbs_period_code',s.slice(0,20));
}

export function parseNbsEsData(bytes:Uint8Array,opts:{seriesId:string;indicator:string;period:PeriodKind}):ParsedPoint[]{
 let doc:unknown;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new NbsParseError('nbs_bad_json');}
 const d=doc as {success?:unknown;data?:unknown};
 if(!d||d.success!==true||!Array.isArray(d.data))throw new NbsParseError('nbs_unsuccessful');
 const target=strip(opts.indicator);
 if(!target)throw new NbsParseError('nbs_bad_indicator');
 const out:ParsedPoint[]=[];
 d.data.forEach((item:unknown,i:number)=>{
  const it=item as {code?:unknown;values?:unknown};
  if(!it||!Array.isArray(it.values))throw new NbsParseError('nbs_bad_item',`data/${i}`);
  const periodEnd=periodEndOfCode(it.code,opts.period);
  const hits:number[]=[];
  it.values.forEach((v:unknown,j:number)=>{
   const x=v as {i_showname?:unknown;da?:unknown};
   if(x&&strip(x.i_showname)===target&&(x.da===undefined||x.da===NATIONAL))hits.push(j);
  });
  if(hits.length===0)return;
  if(hits.length>1)throw new NbsParseError('nbs_ambiguous',`data/${i}`);
  const j=hits[0];
  const raw=(it.values[j] as {value?:unknown}).value;
  if(typeof raw!=='string')throw new NbsParseError('nbs_value_not_string',`data/${i}/values/${j}`);
  const t=raw.trim();
  if(t==='')return;
  let valueText:string;
  try{valueText=canonical(t);}catch{throw new NbsParseError('nbs_bad_value',`data/${i}/values/${j}`);}
  out.push({seriesId:opts.seriesId,periodEnd,valueText,locator:{kind:'json_pointer',pointer:`/data/${i}/values/${j}/value`}});
 });
 return out;
}
