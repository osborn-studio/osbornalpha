// WP-D Task 3, amendment A3: PBOC stock-table growth cells from declared-charset HTML evidence.
import {canonical} from '../decimal';
import {monthEnd} from '../periods';
import type {ParsedPoint} from '../types';
import {htmlTables} from './html-table';

export const PBOC_AFRE_PARSER_VERSION='pboc-afre-stock/1';
const MONTH=/^(\d{4})\.(\d{1,2}|Q[1-4])$/;
const VALUE=/^-?\d+(\.\d+)?$/;
const STOCK=/^社会融资规模存量(AFRE\(stock\))?$/;
const norm=(s:string)=>s.replace(/[\s\u3000]+/g,'').replace(/（/g,'(').replace(/）/g,')');

export class PbocAfreParseError extends Error{
 readonly code:string;
 constructor(code:string,message?:string){super(message??code);this.name='PbocAfreParseError';this.code=code;}
}
const fail=(code:string):never=>{throw new PbocAfreParseError(code);};

/** Decoder label declared by the file's own first 2048 bytes. */
export function afreDecoderLabel(bytes:Uint8Array):string|null{
 const head=new TextDecoder('latin1').decode(bytes.slice(0,2048));
 const meta=[...head.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
 for(const tag of meta){
  const declared=/\bcharset\s*=\s*["']?([\w-]+)/i.exec(tag)?.[1]?.toLowerCase();
  if(!declared)continue;
  if(declared==='utf-8')return 'utf-8';
  if(declared==='gb2312'||declared==='gbk'||declared==='gb18030')return 'gb18030';
  return null;
 }
 return null;
}

export function parseAfreStockYoy(bytes:Uint8Array,opts:{seriesId:string}):ParsedPoint[]{
 const label=afreDecoderLabel(bytes);
 if(!label)return fail('afre_bad_encoding');
 let html:string;
 try{html=new TextDecoder(label,{fatal:true}).decode(bytes);}catch{return fail('afre_bad_encoding');}
 const tables=htmlTables(html).filter(t=>norm(t.rows[0]?.[0]??'')==='社会融资规模存量统计表');
 if(tables.length!==1)fail('afre_title_missing');
 const t=tables[0];
 const hi=t.rows.findIndex(row=>row.some(cell=>MONTH.test(norm(cell))));
 if(hi<0)fail('afre_bad_month');
 const header=t.rows[hi].map(norm);
 let last=header.length-1;
 while(last>=1&&header[last]==='')last--;
 if(last<1)fail('afre_bad_month');
 const months:{year:number;month:number}[]=[];
 const seen=new Set<string>();
 for(let i=1;i<=last;i++){
  const m=MONTH.exec(header[i]);
  if(!m)return fail('afre_bad_month');
  const year=Number(m[1]),month=m[2].startsWith('Q')?Number(m[2][1])*3:Number(m[2]);
  const key=`${year}-${month}`;
  if(year<2000||year>2100||month<1||month>12||seen.has(key))fail('afre_bad_month');
  seen.add(key);months.push({year,month});
 }
 const sub=(t.rows[hi+1]??[]).map(norm);
 const growthCells:number[]=[];
 for(let i=1;i<sub.length&&growthCells.length<months.length;i++){
  if(sub[i]!=='存量')continue;
  if(sub[i+1]!=='增速(%)')fail('afre_header_mismatch');
  growthCells.push(i+1);i++;
 }
 if(growthCells.length!==months.length)fail('afre_header_mismatch');
 const rows=t.rows.map((row,index)=>({row,index})).filter(({row})=>STOCK.test(norm(row[0]??'')));
 if(rows.length===0)fail('afre_row_missing');
 if(rows.length!==1)fail('afre_row_ambiguous');
 const {row,index}=rows[0];
 const out:ParsedPoint[]=[];
 months.forEach(({year,month},i)=>{
  const cell=growthCells[i],raw=norm(row[cell]??'');
  if(raw===''||raw==='-')return;
  if(!VALUE.test(raw))fail('afre_bad_value');
  let valueText:string;
  try{valueText=canonical(raw);}catch{return fail('afre_bad_value');}
  out.push({seriesId:opts.seriesId,periodEnd:monthEnd(year,month),valueText,
   locator:{kind:'html_cell',table:t.index,row:index,cell}});
 });
 return out;
}
