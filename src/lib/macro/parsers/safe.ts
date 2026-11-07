// src/lib/macro/parsers/safe.ts
// SAFE RMB central parity query page → ParsedPoint (spec §4.2 "人民币汇率中间价 美元", unit CNY per 100 USD,
// never converted; evidence = the exact bytes of POST https://www.safe.gov.cn/AppStructured/hlw/RMBQuery.do
// made by AKShare currency_boc_safe). Verified structure (2026-11-06): <table class="list" id="InfoTable">
// with a header row of <th> 日期 | 美元 | 欧元 | … (25 currencies; header cells carry template comments),
// then one <tr> per date (newest first) with <td> cells, plus one leftover template row whose only cell is
// "-&nbsp;" (skipped: its first cell is not a date). "-" or "" = no value. Locator: html_cell. The XLSX
// history file the same AKShare call downloads is not evidence here (no XLSX locator; bucket MIME list).
import {canonical} from '../decimal';
import {isIsoDate} from '../periods';
import type {ParsedPoint} from '../types';
import {htmlTables} from './html-table';

export const SAFE_PARSER_VERSION='safe-rmbquery/1';
export class SafeParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='SafeParseError';this.code=code;}
}

export function parseSafeCentralParity(bytes:Uint8Array,opts:{seriesId:string;column:string}):ParsedPoint[]{
 let html:string;
 try{html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new SafeParseError('safe_bad_encoding');}
 const table=htmlTables(html).find(t=>t.rows.length>0&&t.rows[0][0]==='日期'&&t.rows[0].includes(opts.column));
 if(!table)throw new SafeParseError('safe_no_table');
 const ci=table.rows[0].indexOf(opts.column);
 const out:ParsedPoint[]=[];
 for(let r=1;r<table.rows.length;r++){
  const cells=table.rows[r];
  if(!isIsoDate(cells[0]??''))continue;
  const raw=cells[ci]??'';
  if(raw===''||raw==='-')continue;
  let valueText:string;
  try{valueText=canonical(raw);}catch{throw new SafeParseError('safe_bad_value',`row ${r}`);}
  out.push({seriesId:opts.seriesId,periodEnd:cells[0],valueText,locator:{kind:'html_cell',table:table.index,row:r,cell:ci}});
 }
 return out;
}
