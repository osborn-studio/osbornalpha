// src/lib/macro/parsers/chinabond.ts
// ChinaBond yield-curve history page → ParsedPoint (spec §4.4; evidence = the exact bytes of GET
// https://yield.chinabond.com.cn/cbweb-pbc-web/pbc/historyQuery?startDate=…&endDate=…&gjqx=0&qxId=ycqx&locale=cn_ZH
// made by AKShare bond_china_yield). Verified structure (2026-11-06): the data table is the one whose
// header row reads 曲线名称 | 日期 | 3月 | 6月 | 1年 | 3年 | 5年 | 7年 | 10年 | 30年 (header cells carry
// `3<!-- 月 -->月`-style comments), one <tr> per curve × date, newest first, an empty <td></td> for a
// missing tenor. Rows of the requested curve (中债国债收益率曲线) give period_end = 日期 and the value of the
// tenor column as decimal text. Locator: html_cell {table,row,cell}.
import {canonical} from '../decimal';
import {isIsoDate} from '../periods';
import type {ParsedPoint} from '../types';
import {htmlTables} from './html-table';

export const CHINABOND_PARSER_VERSION='chinabond-history/1';
export class ChinabondParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='ChinabondParseError';this.code=code;}
}

export function parseChinabondHistory(bytes:Uint8Array,opts:{seriesId:string;curve:string;column:string}):ParsedPoint[]{
 let html:string;
 try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ChinabondParseError('chinabond_bad_encoding');}
 const table=htmlTables(html).find(t=>t.rows.length>0&&t.rows[0].includes('曲线名称')&&t.rows[0].includes('日期')&&t.rows[0].includes(opts.column));
 if(!table)throw new ChinabondParseError('chinabond_no_table');
 const header=table.rows[0];
 const ni=header.indexOf('曲线名称'),di=header.indexOf('日期'),ci=header.indexOf(opts.column);
 const out:ParsedPoint[]=[];
 for(let r=1;r<table.rows.length;r++){
  const cells=table.rows[r];
  if(cells[ni]!==opts.curve)continue;
  const date=cells[di]??'';
  if(!isIsoDate(date))throw new ChinabondParseError('chinabond_bad_date',`row ${r}`);
  const raw=cells[ci]??'';
  if(raw==='')continue;
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new ChinabondParseError('chinabond_bad_value',`row ${r}`);}
  out.push({seriesId:opts.seriesId,periodEnd:date,valueText,locator:{kind:'html_cell',table:table.index,row:r,cell:ci}});
 }
 return out;
}
