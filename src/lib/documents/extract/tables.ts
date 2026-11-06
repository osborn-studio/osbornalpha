// src/lib/documents/extract/tables.ts
// Table detection on one page's lines (spec §7.2, TABLE_ALGO_VERSION 'tables/1.0').
// - Numeric item: /^\(?[-–—]?[\d,]+(\.\d+)?\)?$/ containing a digit, or a lone dash.
// - Numeric tail of a line: the longest suffix of numeric items whose first item stands at least
//   TAIL_GAP_EM × height to the right of the item before it (shrunk from the left until it does).
//   Only tail items are cells; numbers and dashes inside a label ("Balance at 1 January 2026",
//   "Other income and gains – net", "– Basic") stay label text (checked on a recorded 0268.HK
//   interim report: without this rule label dashes became spurious columns).
// - Year row: every tail item is a bare 19xx/20xx year (an English header such as "2025 2024");
//   it is header text, never body.
// - Body line: not a year row and >= 2 tail items. A table is a run of body lines in which every
//   body line has a numeric item whose x-interval overlaps one of the previous body line's; up to
//   MAX_GAP_LINES non-body lines (sub-headings such as 以下人士應佔 / Attributable to, one-value rows)
//   between two aligned body lines are rows of the table; a year row ends the run. A run needs
//   MIN_BODY_ROWS body lines.
// - Header block: every line between the previous table's last row (or the page top) and the first
//   row, kept verbatim with offsets (titles, Chinese-numeral year rows, currency and multiplier words,
//   附註/Notes). Spec §7.2 says "up to the previous blank line"; the text layer has no blank lines,
//   so the block runs to the previous table or the page top (Part C note).
// - Columns: numeric items of body lines clustered by x-interval (overlap, or |Δx0| or |Δx1| within
//   half the narrower item: left- and right-aligned figures both cluster); col 0 is the label cell =
//   every item before the numeric tail; numeric columns are 1..k by x.
// Cell offsets are page offsets taken from the items; text = the code-point slice of the line text.
import type {LayoutCell,LayoutItem,LayoutLine,LayoutTable} from '../types';
import {cpSlice} from './pages-json';

export const MIN_BODY_ROWS=2;
export const MAX_GAP_LINES=3;
export const TAIL_GAP_EM=1;
const NUMERIC=/^\(?[-–—]?[\d,]+(\.\d+)?\)?$/;
const DASH=/^[-–—]$/;
const YEAR=/^(19|20)\d{2}$/;

export const isNumericItem=(s:string)=>(NUMERIC.test(s)&&/\d/.test(s))||DASH.test(s);
/** Items of the numeric tail (see header). */
function numericItems(l:LayoutLine):LayoutItem[]{
 const its=l.items;let k=its.length;
 while(k>0&&isNumericItem(its[k-1].text))k--;
 while(k>0&&k<its.length&&its[k].x0-its[k-1].x1<TAIL_GAP_EM*Math.max(its[k].h,its[k-1].h))k++;
 return its.slice(k);
}
const isYearRow=(l:LayoutLine)=>{const n=numericItems(l);return n.length>0&&n.every(i=>YEAR.test(i.text));};
const isBodyLine=(l:LayoutLine)=>!isYearRow(l)&&numericItems(l).length>=2;

interface Span{x0:number;x1:number}
function sameColumn(a:Span,b:Span):boolean{
 if(a.x0<=b.x1&&b.x0<=a.x1)return true;
 const tol=Math.min(a.x1-a.x0,b.x1-b.x0)/2;
 return Math.abs(a.x0-b.x0)<=tol||Math.abs(a.x1-b.x1)<=tol;
}
const aligned=(a:LayoutLine,b:LayoutLine)=>numericItems(a).some(x=>numericItems(b).some(y=>sameColumn(x,y)));

function clusterColumns(items:LayoutItem[]):Span[]{
 const cols:Span[]=[];
 for(const it of [...items].sort((a,b)=>a.x0-b.x0)){
  const c=cols.find(c=>sameColumn(c,it));
  if(c){c.x0=Math.min(c.x0,it.x0);c.x1=Math.max(c.x1,it.x1);}else cols.push({x0:it.x0,x1:it.x1});
 }
 cols.sort((a,b)=>a.x0-b.x0);
 const merged:Span[]=[];
 for(const c of cols){const last=merged.at(-1);if(last&&c.x0<=last.x1)last.x1=Math.max(last.x1,c.x1);else merged.push({...c});}
 return merged;
}
function columnOf(cols:Span[],it:LayoutItem):number{
 const hit=cols.findIndex(c=>it.x0<=c.x1&&c.x0<=it.x1);
 if(hit>=0)return hit;
 const mid=(it.x0+it.x1)/2;let best=0;
 cols.forEach((c,i)=>{if(Math.abs((c.x0+c.x1)/2-mid)<Math.abs((cols[best].x0+cols[best].x1)/2-mid))best=i;});
 return best;
}
function cellOf(line:LayoutLine,items:LayoutItem[],row:number,col:number,numeric:boolean):LayoutCell{
 const start=Math.min(...items.map(i=>i.char_start)),end=Math.max(...items.map(i=>i.char_end));
 return {row,col,text:cpSlice(line.text,start-line.char_start,end-line.char_start),
  bbox:{x0:Math.min(...items.map(i=>i.x0)),y0:Math.min(...items.map(i=>i.y)),x1:Math.max(...items.map(i=>i.x1)),y1:Math.max(...items.map(i=>i.y+i.h))},
  line_index:line.index,char_start:start,char_end:end,numeric};
}

function buildTable(lines:LayoutLine[],header:LayoutLine[],body:LayoutLine[]):LayoutTable{
 const cols=clusterColumns(body.flatMap(numericItems));
 const cells:LayoutCell[]=[];let labelX0=Number.POSITIVE_INFINITY;
 lines.forEach((line,row)=>{
  const tail=numericItems(line);
  const label=line.items.slice(0,line.items.length-tail.length);
  if(label.length>0){cells.push(cellOf(line,label,row,0,false));labelX0=Math.min(labelX0,label[0].x0);}
  const byCol=new Map<number,LayoutItem[]>();
  for(const it of tail){const c=columnOf(cols,it);byCol.set(c,[...(byCol.get(c)??[]),it]);}
  for(const [c,its] of [...byCol.entries()].sort((a,b)=>a[0]-b[0]))cells.push(cellOf(line,its,row,c+1,true));
 });
 if(!Number.isFinite(labelX0))labelX0=Math.min(...lines.map(l=>l.x0));
 return {header_lines:header,cells,row_count:lines.length,col_count:cols.length+1,col_x0:[labelX0,...cols.map(c=>c.x0)]};
}

export function detectTables(lines:LayoutLine[]):LayoutTable[]{
 const tables:LayoutTable[]=[];let prevEnd=-1;let i=0;
 while(i<lines.length){
  if(!isBodyLine(lines[i])){i++;continue;}
  let last=i,bodyCount=1,j=i+1,gaps=0;
  while(j<lines.length){
   const l=lines[j];
   if(isBodyLine(l)){
    if(!aligned(l,lines[last]))break;
    last=j;bodyCount++;gaps=0;j++;continue;
   }
   if(isYearRow(l)||gaps>=MAX_GAP_LINES)break;
   gaps++;j++;
  }
  if(bodyCount<MIN_BODY_ROWS){i++;continue;}
  const rows=lines.slice(i,last+1);
  tables.push(buildTable(rows,lines.slice(prevEnd+1,i),rows.filter(isBodyLine)));
  prevEnd=last;i=last+1;
 }
 return tables;
}
