// Column periods of HK statements (spec §7.5 step 2). Dates: 二零二五年十二月三十一日 (Chinese
// numerals, 〇/零), 2025年12月31日, 31 December 2025, December 31, 2025. The statement title region
// gives the main period: 截至<date>止(年度|六個月) / for the (year|six months) ended <date> → 12M/6M
// for IS and CF; 於<date> / as at <date> → INSTANT for BS. A table's header block gives its columns:
// full dates (balance sheets only, title-phrase lines skipped) or standalone years (dates masked
// first, Chinese-numeral years 二零二四年 included). Each token is placed by its x-span, taken from
// the header line's items (LayoutLine.items, contract change C-1; proportional inside a multi-token
// item), onto the numeric column whose span [min cell x0, median cell x1] it overlaps (± COL_TOLERANCE)
// with the nearest centre: a token over no column, or two different tokens over one column →
// 'unmappable'; the same token repeated over one column (bilingual headers) counts once. Only a
// header line without items (older pages.json) falls back to the RIGHTMOST numeric columns in order.
// A table without header tokens inherits the previous table's columns by the numeric columns' right
// edge (median bbox.x1, tolerance COL_TOLERANCE). Column rules: duration — the title year → title_duration, another
// year → title_year_substitution (same month/day); instant — a full date → column_date (title_instant
// when it is the title date), a year → title_instant for the title year, title_year_substitution in
// annual reports, interim_year_only otherwise (interim comparatives are often another month). Offsets
// are code points on the page text.
import type {LayoutItem,LayoutLine,LayoutTable} from '../types';
import {matchesIn} from './locate';
import type {StatementKind} from './locate';

const ZH_DIGIT:Record<string,number>={'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_RE='January|February|March|April|May|June|July|August|September|October|November|December';
const ZH_MONTH='十[一二]?|[一二三四五六七八九]';
const ZH_DAY='三十一?|二十[一二三四五六七八九]?|十[一二三四五六七八九]?|[一二三四五六七八九]';
/** No capturing groups: embeddable. */
export const DATE_SOURCE=[
 `[〇零一二三四五六七八九]{4}\\s*年\\s*(?:${ZH_MONTH})\\s*月\\s*(?:${ZH_DAY})\\s*日`,
 `\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日`,
 `\\d{1,2}\\s+(?:${MONTH_RE}),?\\s+\\d{4}`,
 `(?:${MONTH_RE})\\s+\\d{1,2},?\\s+\\d{4}`,
].join('|');
const DATE_RE=new RegExp(DATE_SOURCE,'gi');
const YEAR_RE=/([一二][〇零一二三四五六七八九]{3})\s*年|(?<![\d.,])((?:19|20)\d{2})(?:\s*年)?(?![\d.,年月])/g;
const DURATION_ZH=new RegExp(`截至\\s*(${DATE_SOURCE})\\s*止\\s*(年度|六個月|六个月)`,'i');
const DURATION_EN=new RegExp(`for\\s+the\\s+(year|six\\s+months)\\s+ended\\s+(${DATE_SOURCE})`,'i');
const INSTANT_ZH=new RegExp(`(?:於|于)\\s*(${DATE_SOURCE})`,'i');
const INSTANT_EN=new RegExp(`as\\s+(?:at|of)\\s+(${DATE_SOURCE})`,'i');
const PERIOD_PHRASE=new RegExp([DURATION_ZH,DURATION_EN,INSTANT_ZH,INSTANT_EN].map(r=>r.source).join('|'),'i');
export const COL_TOLERANCE=20;

const zhNumber=(s:string):number=>{
 if(!s.includes('十'))return ZH_DIGIT[s]??Number.NaN;
 const [a,b]=s.split('十');
 return (a?ZH_DIGIT[a]??Number.NaN:1)*10+(b?ZH_DIGIT[b]??Number.NaN:0);
};
function iso(y:number,m:number,d:number):string|null{
 if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31)return null;
 const t=new Date(Date.UTC(y,m-1,d));
 if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)return null;
 return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
const isoOf=(t:Date)=>t.toISOString().split('T')[0];
const monthOf=(name:string)=>MONTHS.indexOf(name.toLowerCase())+1;
export function parseDate(token:string):string|null{
 const t=token.replace(/\s+/g,' ').trim();
 let m=/^([〇零一二三四五六七八九]{4}) ?年 ?(十[一二]?|[一二三四五六七八九]) ?月 ?(\S+?) ?日$/.exec(t);
 if(m)return iso(Number([...m[1]].map(c=>ZH_DIGIT[c]).join('')),zhNumber(m[2]),zhNumber(m[3]));
 m=/^(\d{4}) ?年 ?(\d{1,2}) ?月 ?(\d{1,2}) ?日$/.exec(t);
 if(m)return iso(Number(m[1]),Number(m[2]),Number(m[3]));
 m=/^(\d{1,2}) ([A-Za-z]+),? (\d{4})$/.exec(t);
 if(m){const mo=monthOf(m[2]);return mo>0?iso(Number(m[3]),mo,Number(m[1])):null;}
 m=/^([A-Za-z]+) (\d{1,2}),? (\d{4})$/.exec(t);
 if(m){const mo=monthOf(m[1]);return mo>0?iso(Number(m[3]),mo,Number(m[2])):null;}
 return null;
}
export function findDates(text:string):{iso:string;text:string;start:number;end:number}[]{
 const out:{iso:string;text:string;start:number;end:number}[]=[];
 for(const m of matchesIn(text,DATE_RE)){const d=parseDate(m.text);if(d!==null)out.push({iso:d,text:m.text,start:m.start,end:m.end});}
 return out;
}
/** Standalone years; full dates are blanked first (same UTF-16 length, so positions are unchanged). */
export function findYears(text:string):{year:number;text:string;start:number;end:number}[]{
 const masked=text.replace(DATE_RE,m=>' '.repeat(m.length));
 return matchesIn(masked,YEAR_RE).map(m=>({year:m.groups[0]!==undefined?Number([...m.groups[0]].map(c=>ZH_DIGIT[c]).join('')):Number(m.groups[1]),text:m.text,start:m.start,end:m.end}));
}
export function withYear(date:string,year:number):string|null{const [,m,d]=date.split('-').map(Number);return iso(year,m,d);}
/** period_end − N months + 1 day; a month end starts on the first day of the month N − 1 months earlier. */
export function periodStart(end:string,duration:'12M'|'6M'):string{
 const [y,m,d]=end.split('-').map(Number);const months=duration==='12M'?12:6;
 const last=new Date(Date.UTC(y,m,0)).getUTCDate();
 if(d===last)return isoOf(new Date(Date.UTC(y,m-months,1)));
 const tm=m-1-months;const len=new Date(Date.UTC(y,tm+1,0)).getUTCDate();
 return isoOf(new Date(Date.UTC(y,tm,Math.min(d,len)+1)));
}

export interface TitlePeriod{duration:'12M'|'6M'|'INSTANT';date:string;page_no:number;start:number;end:number;text:string}
/** The statement's main period from its title-region lines (offsets on the page text). */
export function titlePeriod(statement:StatementKind,page_no:number,lines:LayoutLine[]):TitlePeriod|null{
 for(const line of lines){
  const at=(m:{start:number;end:number;text:string},duration:TitlePeriod['duration'],date:string|null):TitlePeriod|null=>date===null?null:{duration,date,page_no,start:line.char_start+m.start,end:line.char_start+m.end,text:m.text};
  if(statement==='BS'){
   for(const re of [INSTANT_ZH,INSTANT_EN]){const m=matchesIn(line.text,re)[0];const hit=m?at(m,'INSTANT',parseDate(m.groups[0]??'')):null;if(hit)return hit;}
   continue;
  }
  const zh=matchesIn(line.text,DURATION_ZH)[0];
  const zhHit=zh?at(zh,/年度/.test(zh.groups[1]??'')?'12M':'6M',parseDate(zh.groups[0]??'')):null;
  if(zhHit)return zhHit;
  const en=matchesIn(line.text,DURATION_EN)[0];
  const enHit=en?at(en,/year/i.test(en.groups[0]??'')?'12M':'6M',parseDate(en.groups[1]??'')):null;
  if(enHit)return enHit;
 }
 return null;
}

export interface NumericColumn{col:number;anchor:number;x0:number}
export interface ColumnRef{anchor:number;kind:'year'|'date';year:number;date:string|null;text:string;page_no:number;start:number;end:number}
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);const k=Math.floor(s.length/2);return s.length%2?s[k]:(s[k-1]+s[k])/2;};
/** Numeric columns of a table, left to right, anchored at the median right edge of their cells; x0 = the leftmost cell edge. */
export function numericColumns(table:LayoutTable):NumericColumn[]{
 const by=new Map<number,{x0:number[];x1:number[]}>();
 for(const c of table.cells){
  if(!c.numeric)continue;
  const x1=c.bbox!==null?c.bbox.x1:table.col_x0[c.col];const x0=c.bbox!==null?c.bbox.x0:table.col_x0[c.col];
  if(x1===undefined||x0===undefined||!Number.isFinite(x1)||!Number.isFinite(x0))continue;
  const l=by.get(c.col)??{x0:[],x1:[]};l.x0.push(x0);l.x1.push(x1);by.set(c.col,l);
 }
 return [...by.entries()].map(([col,xs])=>({col,anchor:median(xs.x1),x0:Math.min(...xs.x0)})).sort((a,b)=>a.anchor-b.anchor);
}
/** x-span of the line's code points [start, end) (line-relative) from its items, proportional inside an item; null when no item covers it. */
export function spanOf(line:LayoutLine,start:number,end:number):{x0:number;x1:number}|null{
 const a=line.char_start+start,b=line.char_start+end;
 const items=line.items.filter(i=>i.char_start<b&&a<i.char_end);
 if(items.length===0)return null;
 const at=(it:LayoutItem,p:number)=>{const n=it.char_end-it.char_start;const q=Math.min(Math.max(p,it.char_start),it.char_end);return n<=0?it.x0:it.x0+(it.x1-it.x0)*(q-it.char_start)/n;};
 return {x0:Math.min(...items.map(i=>at(i,a))),x1:Math.max(...items.map(i=>at(i,b)))};
}
/** The table's own header tokens placed on its numeric columns by x (see header); null without tokens; 'unmappable' when a token sits over no column, two different tokens share a column, or there are fewer numeric columns than tokens. */
export function headerColumns(statement:StatementKind,table:LayoutTable,page_no:number):ColumnRef[]|'unmappable'|null{
 type Token={kind:'year'|'date';year:number;date:string|null;text:string;start:number;end:number};
 type Placed={line:LayoutLine;t:Token};
 let best:{line:LayoutLine;tokens:Token[]}|null=null;
 let dateLines:{line:LayoutLine;tokens:Token[]}[]=[];
 if(statement==='BS'){
  for(const line of table.header_lines){
   if(PERIOD_PHRASE.test(line.text))continue;
   const tokens:Token[]=findDates(line.text).map(d=>({kind:'date',year:Number(d.iso.split('-')[0]),date:d.iso,text:d.text,start:d.start,end:d.end}));
   if(tokens.length===0)continue;
   dateLines.push({line,tokens});
   if(best===null||tokens.length>=best.tokens.length)best={line,tokens};
  }
 }
 if(best===null){
  for(const line of table.header_lines){
   const tokens:Token[]=findYears(line.text).map(y=>({kind:'year',year:y.year,date:null,text:y.text,start:y.start,end:y.end}));
   if(tokens.length>0&&(best===null||tokens.length>=best.tokens.length))best={line,tokens};
  }
 }
 if(best===null)return null;
 const cols=numericColumns(table);
 // balance-sheet dates may sit on different header lines (staggered over their columns): every positioned
 // date token of every line is placed by x; equivalent tokens (bilingual repeats) share a column
 const merged=dateLines.length>1&&dateLines.every(d=>d.line.items.length>0);
 const placed:Placed[]=merged?dateLines.flatMap(d=>d.tokens.map(t=>({line:d.line,t}))):best.tokens.map(t=>({line:best!.line,t}));
 const distinct=new Set(placed.map(p=>`${p.t.kind}:${p.t.year}:${p.t.date??''}`)).size;
 if(cols.length<(merged?distinct:best.tokens.length))return 'unmappable';
 const ref=(t:Token,line:LayoutLine,anchor:number):ColumnRef=>({anchor,kind:t.kind,year:t.year,date:t.date,text:t.text,page_no,start:line.char_start+t.start,end:line.char_start+t.end});
 if(!merged&&best.line.items.length===0){const right=cols.slice(cols.length-best.tokens.length);return best.tokens.map((t,i)=>ref(t,best!.line,right[i].anchor));}   // no positions: rightmost rule
 const out:ColumnRef[]=[];const used=new Map<number,Token>();
 for(const {line,t} of placed){
  const span=spanOf(line,t.start,t.end);if(span===null)return 'unmappable';
  const mid=(span.x0+span.x1)/2;const centre=(c:NumericColumn)=>(c.x0+c.anchor)/2;let pick:NumericColumn|null=null;
  for(const c of cols){
   if(span.x1<c.x0-COL_TOLERANCE||span.x0>c.anchor+COL_TOLERANCE)continue;
   if(pick===null||Math.abs(centre(c)-mid)<Math.abs(centre(pick)-mid))pick=c;
  }
  if(pick===null)return 'unmappable';
  const prev=used.get(pick.col);
  if(prev!==undefined){if(prev.kind===t.kind&&prev.year===t.year&&prev.date===t.date)continue;return 'unmappable';}
  used.set(pick.col,t);out.push(ref(t,line,pick.anchor));
 }
 return out.sort((x,y)=>x.anchor-y.anchor);
}
/** numeric column index → the nearest reference column within COL_TOLERANCE (unmatched columns, e.g. notes, are left out). */
export function mapColumns(table:LayoutTable,refs:ColumnRef[]):Map<number,ColumnRef>{
 const out=new Map<number,ColumnRef>();
 for(const c of numericColumns(table)){
  let best:{r:ColumnRef;d:number}|null=null;
  for(const r of refs){const d=Math.abs(r.anchor-c.anchor);if(d<=COL_TOLERANCE&&(best===null||d<best.d))best={r,d};}
  if(best!==null)out.set(c.col,best.r);
 }
 return out;
}
export type PeriodRule='title_duration'|'title_year_substitution'|'column_date'|'title_instant';
export interface ColumnPeriod{period_start:string|null;period_end:string;duration:'12M'|'6M'|'INSTANT';rule:PeriodRule;title_date:string;column_text:string;header:ColumnRef}
export function columnPeriod(title:TitlePeriod,ref:ColumnRef,annual:boolean):ColumnPeriod|'interim_year_only'|'invalid_date'{
 const titleYear=Number(title.date.split('-')[0]);
 const base={title_date:title.date,column_text:ref.text,header:ref};
 if(title.duration==='INSTANT'){
  if(ref.kind==='date'&&ref.date!==null)return {...base,period_start:null,period_end:ref.date,duration:'INSTANT',rule:ref.date===title.date?'title_instant':'column_date'};
  if(ref.year===titleYear)return {...base,period_start:null,period_end:title.date,duration:'INSTANT',rule:'title_instant'};
  if(!annual)return 'interim_year_only';
  const end=withYear(title.date,ref.year);
  return end===null?'invalid_date':{...base,period_start:null,period_end:end,duration:'INSTANT',rule:'title_year_substitution'};
 }
 const end=ref.year===titleYear?title.date:withYear(title.date,ref.year);
 if(end===null)return 'invalid_date';
 return {...base,period_start:periodStart(end,title.duration),period_end:end,duration:title.duration,rule:ref.year===titleYear?'title_duration':'title_year_substitution'};
}
