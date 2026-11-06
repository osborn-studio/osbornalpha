// src/lib/entities/identifiers/hkex-list.ts
// Stage D (spec §4.1.4): HKEX securities lists → (stock code, name, category, ISIN). Columns are
// located by header text, never by position (HKEX changed the layout; circular CT/118/25 added ISIN
// to ListOfSecurities.xlsx). A file without an ISIN column still yields names and categories, which
// the A+H name match uses (§4.2.2). ISIN precedence follows HKEX_LIST_FILES priority.
import {createHash} from 'node:crypto';
import * as XLSX from 'xlsx';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
export const XLS_MIME='application/vnd.ms-excel' as const;
export type HkexFileId='list_of_securities'|'isin_hkex'|'isin_other_agencies';
export interface HkexListFile{id:HkexFileId;file:string;contentType:typeof XLSX_MIME|typeof XLS_MIME;url:string|null;priority:number}
/** Expected file names inside `--hkex <dir>`; Task 4b stores each under its own `contentType` (the two ISIN workbooks are legacy OLE .xls). URLs and file names verified 2026-11-05 (docs/audits/2026-11-05-data-foundation-3/verification.md). */
export const HKEX_LIST_FILES:readonly HkexListFile[]=[
 {id:'list_of_securities',file:'ListOfSecurities.xlsx',contentType:XLSX_MIME,url:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx',priority:1},
 {id:'isin_hkex',file:'isinsehk.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls',priority:2},
 {id:'isin_other_agencies',file:'isino.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls',priority:3},
];
export interface HkexListRow{stockCode:string;name:string|null;category:string|null;isin:string|null;row:number}
export interface HkexListParse{
 file:HkexFileId;sha256:string;headerRow:number;
 columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
 rows:HkexListRow[];rejected:{row:number;reason:'invalid_stock_code'|'invalid_isin'}[];
}
export interface HkexIsin{isin:string;file:HkexFileId;sha256:string;row:number}

const norm=(v:unknown)=>v==null?'':String(v).replace(/\s+/g,' ').trim().toLowerCase();
/** ListOfSecurities.xlsx says "Stock Code"; the two ISIN workbooks (verified 2026-11-05) say "HK Stock Code". */
const isCodeHeader=(h:string)=>h==='stock code'||h==='hk stock code';
const text=(v:unknown)=>v==null||String(v).trim()===''?null:String(v).trim();

export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
 let grid:unknown[][];
 try{
  // nodim: the live HKEX file declares a stale <dimension> (A1:R8 for 17k rows), which would truncate the grid.
  const wb=XLSX.read(bytes,{type:'array',nodim:true} as XLSX.ParsingOptions);
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws)throw new Error('no sheet');
  grid=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:false,defval:null,blankrows:true});
 }catch{throw new Error('invalid_schema');}
 const headerIdx=grid.slice(0,30).findIndex(r=>Array.isArray(r)&&r.some(c=>isCodeHeader(norm(c))));
 if(headerIdx<0)throw new Error('invalid_schema');
 const header=(grid[headerIdx] as unknown[]).map(norm);
 const find=(pred:(h:string)=>boolean)=>{const i=header.findIndex(pred);return i<0?null:i;};
 const columns={
  stockCode:header.findIndex(isCodeHeader),
  name:find(h=>h==='name of securities'||h==='name of security'||h==='name'||h==='stocks'),
  category:find(h=>h==='category'),
  isin:find(h=>h.startsWith('isin')),
 };
 const rows:HkexListRow[]=[];
 const rejected:HkexListParse['rejected']=[];
 for(let i=headerIdx+1;i<grid.length;i++){
  const r=grid[i];
  if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
  const code=text(r[columns.stockCode])??'';
  if(isCodeHeader(norm(code)))continue;   // the ISIN workbooks repeat the header above their second table
  if(!/^\d{1,5}$/.test(code)){rejected.push({row:i+1,reason:'invalid_stock_code'});continue;}
  const cell=(c:number|null)=>c===null?null:text(r[c]);
  let isin=cell(columns.isin)?.toUpperCase()??null;
  if(isin!==null&&!isValidIsin(isin)){rejected.push({row:i+1,reason:'invalid_isin'});isin=null;}
  rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
 }
 return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected};
}

/** Stock code → ISIN by file priority (first file wins); a different ISIN in a later file is listed in conflicts. */
export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
 const prio=(f:HkexFileId)=>HKEX_LIST_FILES.find(x=>x.id===f)!.priority;
 const ordered=[...parses].sort((a,b)=>prio(a.file)-prio(b.file));
 const byCode=new Map<string,HkexIsin>();
 const seen=new Map<string,{file:HkexFileId;isin:string}[]>();
 for(const p of ordered)for(const r of p.rows){
  if(!r.isin)continue;
  const list=seen.get(r.stockCode)??[];
  if(!list.some(x=>x.isin===r.isin))list.push({file:p.file,isin:r.isin});
  seen.set(r.stockCode,list);
  if(!byCode.has(r.stockCode))byCode.set(r.stockCode,{isin:r.isin,file:p.file,sha256:p.sha256,row:r.row});
 }
 const conflicts=[...seen].filter(([,l])=>l.length>1).map(([stockCode,isins])=>({stockCode,isins})).sort((a,b)=>a.stockCode<b.stockCode?-1:1);
 return {byCode,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
}
