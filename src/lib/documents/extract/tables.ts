// src/lib/documents/extract/tables.ts
// Table detection on one page's lines (spec §7.2, TABLE_ALGO_VERSION 'tables/1.0').
// - Tokens: adjacent items with no space between them in the line text (char_end === next char_start,
//   i.e. a geometry gap below the space width) are merged into one token before any numeric test, so
//   '(' '50' ')' and '(800,000' ')' parse as one parenthesised negative. Cell offsets come from the
//   merged items, so they keep pointing at the original evidence.
// - Numeric token: /^\(?[-–—−]?[\d,]+(\.\d+)?\)?$/ containing a digit (U+2212 minus included), or a lone dash.
// - Numeric tail of a line: the longest suffix of numeric tokens whose first token stands at least
//   TAIL_GAP_EM × height to the right of the token before it (shrunk from the left until it does).
//   Only tail tokens are cells; numbers and dashes inside a label ("Balance at 1 January 2026",
//   "Other income and gains – net", "– Basic") stay label text (checked on a recorded 0268.HK
//   interim report: without this rule label dashes became spurious columns).
// - Trailing label: tokens after the last numeric token, starting at least TAIL_GAP_EM × height past it
//   (bilingual rows "Revenue 1,234 1,100 收益"), become a last label cell.
// - Year row (a header, never body): the whole tail is bare 19xx/20xx years AND the line has no row
//   label, or its label is a period/notes word (年度/截至/year ended/Notes …). A labelled row whose
//   amounts happen to look like years ("Cost 2025 2024") is a body row.
// - Body line: not a year row and >= 2 tail tokens. A table is a run of body lines in which every
//   body line has a numeric token whose x-interval overlaps one of the previous body line's; up to
//   MAX_GAP_LINES non-body lines (sub-headings such as 以下人士應佔 / Attributable to, one-value rows)
//   between two aligned body lines are rows of the table; a year row ends the run. A run needs
//   MIN_BODY_ROWS body lines.
// - Wrapped labels: a label-only line (no numbers, not ending in a colon) directly above or below a
//   body row at the same label x (line spacing <= 1.8 × height) is a continuation of that row: it
//   becomes an extra col-0 cell of the same row (its own line_index and offsets, so each cell still
//   slices its text out of the page) and stays inside the table. Up to MAX_CONT_LINES per side.
// - Header block: the lines between the previous table's last row (or the page top) and the first
//   row, at most MAX_HEADER_LINES of them, nearest first, stopping at a line wider than the table
//   (a page title or running text), kept verbatim with offsets.
// - Columns: numeric tokens of body lines clustered by x-interval (overlap, or |Δx0| or |Δx1| within
//   half the narrower token: left- and right-aligned figures both cluster); col 0 is the label cell =
//   every token before the numeric tail; numeric columns are 1..k by x; a trailing label is col k+1.
// Cell offsets are page offsets taken from the items; text = the code-point slice of the line text.
import type {LayoutCell,LayoutItem,LayoutLine,LayoutTable} from '../types';
import {cpSlice} from './pages-json';

export const MIN_BODY_ROWS=2;
export const MAX_GAP_LINES=3;
export const MAX_CONT_LINES=2;
export const MAX_HEADER_LINES=6;
export const TAIL_GAP_EM=1;
const CONT_SPACING_EM=1.8;
const NUMERIC=/^\(?[-–—−]?[\d,]+(\.\d+)?\)?$/;
const DASH=/^[-–—−]$/;
const YEAR=/^(19|20)\d{2}$/;
const PERIOD_LABEL=/年度|截至|止年|止六個月|止六个月|year(s)? ended|period ended|six months|as (at|of)\b|^notes?$|附[註注]/i;

export const isNumericItem=(s:string)=>(NUMERIC.test(s)&&/\d/.test(s))||DASH.test(s);

interface Analysis{tokens:LayoutItem[];label:LayoutItem[];tail:LayoutItem[];trailing:LayoutItem[]}
const cache=new WeakMap<LayoutLine,Analysis>();
function tokensOf(l:LayoutLine):LayoutItem[]{
 const out:LayoutItem[]=[];
 for(const it of l.items){
  const prev=out.at(-1);
  if(prev&&prev.char_end===it.char_start)out[out.length-1]={text:prev.text+it.text,x0:Math.min(prev.x0,it.x0),x1:Math.max(prev.x1,it.x1),y:prev.y,h:Math.max(prev.h,it.h),char_start:prev.char_start,char_end:it.char_end};
  else out.push(it);
 }
 return out;
}
function analyze(l:LayoutLine):Analysis{
 const hit=cache.get(l);if(hit)return hit;
 const tokens=tokensOf(l);
 let lastNum=-1;
 for(let k=tokens.length-1;k>=0;k--)if(isNumericItem(tokens[k].text)){lastNum=k;break;}
 let body=tokens,trailing:LayoutItem[]=[];
 if(lastNum>=0&&lastNum<tokens.length-1&&tokens[lastNum+1].x0-tokens[lastNum].x1>=TAIL_GAP_EM*Math.max(tokens[lastNum].h,tokens[lastNum+1].h)){body=tokens.slice(0,lastNum+1);trailing=tokens.slice(lastNum+1);}
 let k=body.length;
 while(k>0&&isNumericItem(body[k-1].text))k--;
 while(k>0&&k<body.length&&body[k].x0-body[k-1].x1<TAIL_GAP_EM*Math.max(body[k].h,body[k-1].h))k++;
 const a={tokens,label:body.slice(0,k),tail:body.slice(k),trailing};
 cache.set(l,a);return a;
}
const numericItems=(l:LayoutLine)=>analyze(l).tail;
function isYearRow(l:LayoutLine):boolean{
 const a=analyze(l);
 if(a.tail.length===0||!a.tail.every(i=>YEAR.test(i.text)))return false;
 return a.label.length===0||PERIOD_LABEL.test(a.label.map(i=>i.text).join(' '));
}
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

interface Row{main:LayoutLine;above:LayoutLine[];below:LayoutLine[]}
/** A label-only line that can continue the label of `body` (see header). */
function continues(g:LayoutLine,body:LayoutLine):boolean{
 const a=analyze(g),b=analyze(body);
 if(a.tail.length>0||a.trailing.length>0||a.label.length===0||b.label.length===0||isBodyLine(g)||isYearRow(g))return false;
 if(/[:：]$/.test(g.text))return false;
 const h=Math.max(a.label[0].h,b.label[0].h,1);
 return Math.abs(a.label[0].x0-b.label[0].x0)<=0.5*h&&Math.abs(g.y-body.y)<=CONT_SPACING_EM*h;
}

function buildTable(rows:Row[],header:LayoutLine[]):LayoutTable{
 const mains=rows.map(r=>r.main);
 const cols=clusterColumns(mains.filter(isBodyLine).flatMap(numericItems));
 const cells:LayoutCell[]=[];let labelX0=Number.POSITIVE_INFINITY;let trailX0=Number.POSITIVE_INFINITY;
 rows.forEach((r,row)=>{
  for(const line of [...r.above,r.main,...r.below]){
   const a=analyze(line);
   const label=line===r.main?a.label:a.tokens;
   if(label.length>0){cells.push(cellOf(line,label,row,0,false));labelX0=Math.min(labelX0,label[0].x0);}
  }
  const a=analyze(r.main);
  const byCol=new Map<number,LayoutItem[]>();
  for(const it of a.tail){const c=columnOf(cols,it);byCol.set(c,[...(byCol.get(c)??[]),it]);}
  for(const [c,its] of [...byCol.entries()].sort((x,y)=>x[0]-y[0]))cells.push(cellOf(r.main,its,row,c+1,true));
  if(a.trailing.length>0){cells.push(cellOf(r.main,a.trailing,row,cols.length+1,false));trailX0=Math.min(trailX0,a.trailing[0].x0);}
 });
 if(!Number.isFinite(labelX0))labelX0=Math.min(...mains.map(l=>l.x0));
 const hasTrail=Number.isFinite(trailX0);
 return {header_lines:header,cells,row_count:rows.length,col_count:cols.length+1+(hasTrail?1:0),col_x0:[labelX0,...cols.map(c=>c.x0),...(hasTrail?[trailX0]:[])]};
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
  // wrapped labels: claim continuation lines above a body row first (nearest wins), then below
  const claimed=new Set<number>();
  const above=new Map<number,LayoutLine[]>(),below=new Map<number,LayoutLine[]>();
  const lo=Math.max(prevEnd+1,i-MAX_CONT_LINES);
  const isMain=(k:number)=>k>=i&&k<=last&&isBodyLine(lines[k]);
  for(let b=lo;b<=last;b++){
   if(!isMain(b))continue;
   const got:LayoutLine[]=[];
   for(let k=b-1;k>=Math.max(lo,b-MAX_CONT_LINES)&&!claimed.has(k)&&!isMain(k)&&continues(lines[k],got.length>0?got[0]:lines[b]);k--){got.unshift(lines[k]);claimed.add(k);}
   if(got.length>0)above.set(b,got);
  }
  for(let b=i;b<=Math.min(last+MAX_CONT_LINES,lines.length-1);b++){
   if(!isMain(b))continue;
   const got:LayoutLine[]=[];
   for(let k=b+1;k<=Math.min(lines.length-1,b+MAX_CONT_LINES)&&k<=last+MAX_CONT_LINES&&!claimed.has(k)&&!isMain(k)&&continues(lines[k],got.length>0?got[got.length-1]:lines[b]);k++){got.push(lines[k]);claimed.add(k);}
   if(got.length>0)below.set(b,got);
  }
  const start=Math.min(i,...[...claimed]);
  const end=Math.max(last,...[...claimed]);
  const rows:Row[]=[];
  for(let k=start;k<=end;k++){
   if(claimed.has(k))continue;
   rows.push({main:lines[k],above:above.get(k)??[],below:below.get(k)??[]});
  }
  const tableLines=lines.slice(start,end+1);
  const tx0=Math.min(...tableLines.map(l=>l.x0)),tx1=Math.max(...tableLines.map(l=>l.x1));
  const header:LayoutLine[]=[];
  for(let k=start-1;k>prevEnd&&header.length<MAX_HEADER_LINES;k--){
   if(lines[k].x1-lines[k].x0>tx1-tx0)break;
   header.unshift(lines[k]);
  }
  tables.push(buildTable(rows,header));
  prevEnd=end;i=end+1;
 }
 return tables;
}
