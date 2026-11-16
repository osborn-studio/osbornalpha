// Statement location for HK periodic reports (spec §7.5 step 1) and the code-point text helpers
// shared by the hk-facts modules. A statement (IS / BS / CF) is the consecutive run of pages whose
// title region — the page lines above the first table body row — carries one of its titles
// (traditional, simplified or English; HKEX reports are often bilingual, both scripts on the same
// page, e.g. "Condensed Consolidated Interim Income Statement" over 簡明綜合中期利潤表 — any title line
// of either script counts) and that have at least one table. Titles tolerate 簡明/Condensed and
// 中期/Interim (the patterns are unanchored): IS 損益表/利潤表/收益表/Income Statement/Statement of
// Profit or Loss (or Comprehensive Income); BS 財務狀況表/資產負債表/Statement of Financial
// Position/Balance Sheet; CF 現金流量表/Statement of Cash Flows/Cash Flow Statement. A separate
// statement of comprehensive income (a title naming 全面 / 綜合收益表 / Comprehensive) is not the income
// statement when pages titled as a plain income statement exist; only when none exist is the
// combined 損益及其他全面收益表 / "profit or loss and other comprehensive income" statement used.
// Notes pages (a title-region line with 表附註 / 表附注 / Notes to) never count; a bare "附註/Notes"
// column header does not make a notes page. Non-consecutive hits → locate_ambiguous; no title line
// with 綜合 / 综合 / Consolidated on the first page → not_consolidated; no hit → the statement is
// missing (no info). Offsets are Unicode code points relative to the page text (plan F3
// conventions): regex indexes (UTF-16) are converted with cpIndex, never used as offsets directly.
import type {LayoutLine,PageLayout,PagesJson} from '../types';

export type StatementKind='IS'|'BS'|'CF';
export const STATEMENTS:readonly StatementKind[]=['IS','BS','CF'];
const TITLE:Record<StatementKind,RegExp>={
 IS:/損益表|损益表|利潤表|利润表|收益表|income statement|statement of (?:profit or loss|comprehensive income)/i,
 BS:/財務狀況表|财务状况表|資產負債表|资产负债表|statement of financial position|balance sheet/i,
 CF:/現金流量表|现金流量表|statement of cash flows|cash flow statement/i,
};
/** An IS title naming comprehensive income: a separate CI statement or the combined P&L + OCI statement. */
const COMPREHENSIVE=/全面|綜合收益表|综合收益表|comprehensive/i;
const CONSOLIDATED=/綜合|综合|consolidated/i;
const NOTES=/表附註|表附注|notes to/i;

export interface LocatedStatement{statement:StatementKind;pages:PageLayout[];title:{page_no:number;line:LayoutLine};consolidated:boolean}
export interface LocateInfo{code:'locate_ambiguous'|'not_consolidated';detail:string}
export interface LocateResult{statements:LocatedStatement[];info:LocateInfo[]}
export interface TextMatch{text:string;start:number;end:number;groups:(string|undefined)[]}

/** Code points of `s` before UTF-16 index `utf16`. */
export function cpIndex(s:string,utf16:number):number{let cp=0,u=0;for(const ch of s){if(u>=utf16)break;u+=ch.length;cp++;}return cp;}
export function cpSlice(s:string,start:number,end:number):string{return Array.from(s).slice(start,end).join('');}
/** Every match of `re` (global flag added when missing) with code-point start/end inside `s`. */
export function matchesIn(s:string,re:RegExp):TextMatch[]{
 const g=new RegExp(re.source,re.flags.includes('g')?re.flags:`${re.flags}g`);const out:TextMatch[]=[];
 for(const m of s.matchAll(g)){const start=cpIndex(s,m.index??0);out.push({text:m[0],start,end:start+Array.from(m[0]).length,groups:m.slice(1)});}
 return out;
}
/** Line indexes that are table body rows (any table of the page). */
export function bodyLines(page:PageLayout):Set<number>{const s=new Set<number>();for(const t of page.tables)for(const c of t.cells)s.add(c.line_index);return s;}
/** Lines above the first table body row; empty when the page has no table. */
export function titleRegion(page:PageLayout):LayoutLine[]{
 const body=bodyLines(page);if(body.size===0)return [];
 const first=Math.min(...body);
 return page.lines.filter(l=>l.index<first).sort((a,b)=>a.index-b.index);
}

export function locateStatements(json:PagesJson):LocateResult{
 const info:LocateInfo[]=[];const statements:LocatedStatement[]=[];
 const pages=[...json.pages].sort((a,b)=>a.page_no-b.page_no);
 const regions=new Map(pages.map(p=>[p.page_no,titleRegion(p)]));
 for(const statement of STATEMENTS){
  let hits:{page:PageLayout;lines:LayoutLine[];plain:boolean}[]=[];
  for(const page of pages){
   const region=regions.get(page.page_no)!;
   if(region.some(l=>NOTES.test(l.text)))continue;
   const lines=region.filter(l=>TITLE[statement].test(l.text));
   if(lines.length>0)hits.push({page,lines,plain:statement!=='IS'||lines.some(l=>!COMPREHENSIVE.test(l.text))});
  }
  if(hits.some(h=>h.plain))hits=hits.filter(h=>h.plain);     // a separate comprehensive-income statement is not the IS
  if(hits.length===0)continue;
  const nos=hits.map(x=>x.page.page_no);
  if(nos.some((n,i)=>i>0&&n!==nos[i-1]+1)){info.push({code:'locate_ambiguous',detail:`${statement}:${nos.join(',')}`});continue;}
  const title=hits[0].lines.find(l=>CONSOLIDATED.test(l.text));
  if(!title){info.push({code:'not_consolidated',detail:`${statement}:p${nos[0]}`});continue;}
  statements.push({statement,pages:hits.map(x=>x.page),title:{page_no:hits[0].page.page_no,line:title},consolidated:true});
 }
 return {statements,info};
}
