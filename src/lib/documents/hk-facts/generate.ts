// HK financial-fact candidates of one pages.json (spec §7.5; plan F3 Task 14): locate the three
// primary statements, derive each column's period from the statement title and the table header,
// read the amount unit and the per-share sub-unit, map row labels to the 18 concepts inside their
// sections, read the cells as exact decimals, then cite every piece of evidence — value, label,
// unit, statement title (two statement_title entries: the title line carrying 綜合/Consolidated, which
// the `consolidated` check reads, and the period phrase the period was derived from, when it is a
// different range) and column header — through ctx.cite BEFORE returning the
// CandidateInsert rows (citations precede numbers, §7.4; each distinct range is cited once). Nothing
// is guessed: an ambiguous location, period, unit or label produces no candidate and one
// informational entry per code (key = extraction_id, details joined by '; '): locate_ambiguous /
// period_unparsed / unit_ambiguous / label_ambiguous / not_consolidated (F3_INFO_CODES). The same
// generator serves the primary (zh) and comparison (en) versions; candidates are inserted as
// 'candidate' by the caller (Task 15). natural_key = <concept>:<period_start|''>:<period_end>:
// <duration>:<unit>; fingerprint = sha256(canonical JSON of {natural_key, payload,
// snippets:{value, label, unit, period:[title line, period phrase, column header]}}) (§4.6).
import {createHash} from 'node:crypto';
import type {BatchError} from '../../dq/batches';
import {HK_EXTRACTOR_REF,HK_LABEL_GEN,HK_RULES_VERSION} from '../types';
import type {CandidateInsert,DocumentRow,ExtractionRow,FactCitations,FinancialFactPayload,LayoutCell,LayoutLine,LayoutTable,PageLayout,PagesJson} from '../types';
import {headingSection,matchConcepts,normalizeLabel} from './labels';
import type {Section} from './labels';
import {bodyLines,cpSlice,locateStatements,titleRegion} from './locate';
import type {LocatedStatement} from './locate';
import {columnPeriod,headerColumns,mapColumns,titlePeriod} from './period';
import type {ColumnPeriod,ColumnRef} from './period';
import {detectAmountUnit,detectEpsUnit} from './scale';
import type {Scale} from './scale';
import {applySign,cellValue,signWords} from './values';

type Bbox={x0:number;y0:number;x1:number;y1:number};
export interface CiteInput{page_no:number;char_start:number;char_end:number;bbox?:Bbox|null}
export interface GenerateContext{document:DocumentRow;extraction:ExtractionRow;cite:(input:CiteInput)=>Promise<string>}
export type HkInfoCode='locate_ambiguous'|'period_unparsed'|'unit_ambiguous'|'label_ambiguous'|'not_consolidated';
type Note=(code:HkInfoCode,detail:string)=>void;
interface Range{page_no:number;char_start:number;char_end:number;bbox:Bbox|null}
interface Draft{payload:FinancialFactPayload;value:Range;label:Range;unit:Range;unitCurrency:Range|null;titleLine:Range;title:Range;header:Range}
interface RowHit{concept:string;page:PageLayout;cells:LayoutCell[];label:Range;labelText:string;columns:Map<number,ColumnRef>;sectionLines:{page_no:number;line:LayoutLine}[];extraSources:{page_no:number;text:string;char_start:number}[]}

const EPS=new Set(['eps_basic','eps_diluted']);
const sha256=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const firstLine=(t:LayoutTable)=>Math.min(...t.cells.map(c=>c.line_index));
const rangeOf=(page_no:number,x:{char_start:number;char_end:number;bbox?:Bbox|null}):Range=>({page_no,char_start:x.char_start,char_end:x.char_end,bbox:x.bbox??null});
interface Part{text:string;char_start:number;char_end:number;bbox?:Bbox|null}
const partOf=(c:LayoutCell):Part=>({text:c.text,char_start:c.char_start,char_end:c.char_end,bbox:c.bbox});
export const naturalKey=(p:Pick<FinancialFactPayload,'concept'|'period_start'|'period_end'|'duration'|'unit'>)=>`${p.concept}:${p.period_start??''}:${p.period_end}:${p.duration}:${p.unit}`;
/** JSON with object keys sorted at every level and no whitespace. */
export function canonicalJson(v:unknown):string{
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 const o=v as Record<string,unknown>;
 return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

function draftsOf(st:LocatedStatement,annual:boolean,note:Note):Draft[]{
 const S=st.statement;const first=st.pages[0];
 const title=titlePeriod(S,first.page_no,titleRegion(first));
 if(title===null){note('period_unparsed',`${S}:title`);return [];}
 const titleRange:Range={page_no:title.page_no,char_start:title.start,char_end:title.end,bbox:null};
 const titleLineRange:Range={page_no:st.title.page_no,char_start:st.title.line.char_start,char_end:st.title.line.char_end,bbox:null};   // the statement title line (綜合…表 / Consolidated …)
 // amount unit: the first page's title region and its first table's header block
 const unitLines=new Map<number,LayoutLine>();
 for(const l of titleRegion(first))unitLines.set(l.index,l);
 const firstTable=[...first.tables].sort((a,b)=>firstLine(a)-firstLine(b))[0];
 for(const l of firstTable?.header_lines??[])unitLines.set(l.index,l);
 const amount=detectAmountUnit([...unitLines.values()].sort((a,b)=>a.index-b.index).map(line=>({page_no:first.page_no,line})));
 if(!amount.ok)note('unit_ambiguous',`${S}:${amount.reason}`);
 // rows in reading order with their section and column periods. A line without numeric cells — a
 // non-row line, or a label-only row that extract/tables.ts keeps inside a table — may open a
 // section (headingSection); otherwise it is remembered as the first half of a two-line label whose
 // numbers sit on the next line ("Net cash inflow/(outflow) from" + "operating activities"). The
 // lines since the current section opened are the EPS sub-unit sources ("(expressed in RMB cents
 // per share)" sits below the EPS heading).
 const hits:RowHit[]=[];let refs:ColumnRef[]|null=null;let section:Section=null;let sectionLines:RowHit['sectionLines']=[];let lastLabel:string|null=null;
 for(const page of st.pages){
  const tables=[...page.tables].sort((a,b)=>firstLine(a)-firstLine(b));
  const columnsOf=new Map<LayoutTable,Map<number,ColumnRef>>();const tableOfLine=new Map<number,LayoutTable>();
  for(const t of tables){
   for(const c of t.cells)tableOfLine.set(c.line_index,t);
   const own=headerColumns(S,t,page.page_no);
   if(own==='unmappable'){note('period_unparsed',`${S}:p${page.page_no}:columns`);columnsOf.set(t,new Map());continue;}
   if(own!==null)refs=own;
   if(refs===null){note('period_unparsed',`${S}:p${page.page_no}:no_header`);columnsOf.set(t,new Map());continue;}
   columnsOf.set(t,mapColumns(t,refs));
  }
  const body=bodyLines(page);let pending:LayoutLine[]=[];
  const sortedLines=[...page.lines].sort((a,b)=>a.index-b.index);
  const isTextOnly=(l:LayoutLine)=>!(body.has(l.index)?tableOfLine.get(l.index)?.cells.some(c=>c.line_index===l.index&&c.numeric):false)&&headingSection(l.text,null)===undefined;
  for(const [pos,line] of sortedLines.entries()){
   const t=body.has(line.index)?tableOfLine.get(line.index):undefined;
   const cells=t?t.cells.filter(c=>c.line_index===line.index):[];
   if(!cells.some(c=>c.numeric)){
    const s=headingSection(line.text,lastLabel);
    if(s!==undefined){section=s;sectionLines=[{page_no:page.page_no,line}];pending=[];}
    else{sectionLines.push({page_no:page.page_no,line});pending=[...pending.filter(x=>x.index===line.index-1),line].slice(-2);}
    continue;
   }
   const prev=pending.filter((x,k,a)=>x.index===line.index-(a.length-k));pending=[];
   const labelCells=cells.filter(c=>!c.numeric).sort((x,y)=>x.char_start-y.char_start);
   if(!t||labelCells.length===0)continue;
   // Label evidence (plan F3 Task 14 review). Every label cell on the numbers' own line is read together:
   // the leading label (col 0) and any trailing bilingual cell. The CITED label is the leading label,
   // preceded where needed by label-only text directly above (contiguous, no numbers); trailing cells and
   // lines below the row are never cited (the range would contain the numbers), so they only test the
   // reading: if the leading label plus a trailing cell or a continuation (above or below) names another
   // concept, none, or changes the sign (credit / 沖回 / decrease-only), the row is label_ambiguous and
   // yields no candidate. Continuation lines are label-only lines at the label's x, not headings, not
   // colon lines and not the EPS section's own unit lines; header lines never qualify (other x).
   const leading=labelCells.filter(c=>c.col===0).map(partOf),trailing=labelCells.filter(c=>c.col!==0).map(partOf);
   const rowNo=cells.find(c=>c.numeric)!.row;
   const lineAt=new Map(page.lines.map(l=>[l.index,l]));
   const epsHeading=(idx:number)=>section==='eps'&&sectionLines.some(x=>x.page_no===page.page_no&&x.line.index===idx);
   type Cont=Part&{idx:number};
   const usable=(c:Cont)=>{
    const l=lineAt.get(c.idx);const x0=(c.bbox!==null&&c.bbox!==undefined?c.bbox.x0:l?.x0)??line.x0;
    return !epsHeading(c.idx)&&!/[:：]\s*$/.test(c.text)&&headingSection(c.text,null)===undefined&&Math.abs(x0-line.x0)<=Math.max(12,2*(line.items[0]?.h??0));
   };
   const byIdx=new Map<number,Cont>();
   for(const c of t.cells)if(c.row===rowNo&&!c.numeric&&c.line_index!==line.index)byIdx.set(c.line_index,{...partOf(c),idx:c.line_index});
   for(const x of prev)if(!byIdx.has(x.index))byIdx.set(x.index,{text:x.text,char_start:x.char_start,char_end:x.char_end,idx:x.index});
   for(const dk of [1,2]){const n=sortedLines[pos+dk];if(n!==undefined&&n.index===line.index+dk&&isTextOnly(n)&&!byIdx.has(n.index))byIdx.set(n.index,{text:n.text,char_start:n.char_start,char_end:n.char_end,idx:n.index});}
   const textOf=(ps:Part[])=>ps.map(x=>x.text).join(' ');
   const conceptsOf=(ps:Part[])=>ps.length===0?[]:matchConcepts(textOf(ps),S,section);
   // a label-only line below that is the first half of the NEXT row's two-line label belongs to that row
   const claimedByNext=(c:Cont)=>{
    const nl=lineAt.get(c.idx+1);if(nl===undefined)return false;
    const nt=tableOfLine.get(nl.index);if(nt===undefined)return false;
    const nc=nt.cells.filter(x=>x.line_index===nl.index);
    if(!nc.some(x=>x.numeric))return false;
    return conceptsOf([c,...nc.filter(x=>!x.numeric&&x.col===0).map(partOf)]).length>0;
   };
   // a line below that starts a new label (capital letter / digit) is a heading or the next label, not a continuation
   const startsLabel=(x:string)=>/^[\p{Lu}\d]/u.test(x);
   const chain=(dir:1|-1):Cont[]=>{const out:Cont[]=[];for(let k=1;k<=2;k++){const c=byIdx.get(line.index+dir*k);if(c===undefined||!usable(c)||(dir===1&&(claimedByNext(c)||startsLabel(c.text))))break;out.push(c);}return out;};
   const above=chain(-1).reverse(),below=chain(1);
   lastLabel=textOf(leading.length>0?leading:trailing);
   let base:Part[]|null=null;let found:string[]=[];
   const alone=conceptsOf(leading);
   if(alone.length>0){base=leading;found=alone;}
   else if(leading.length>0){for(let n=1;n<=above.length&&base===null;n++){const ps=[...above.slice(-n),...leading];const f=conceptsOf(ps);if(f.length>0){base=ps;found=f;}}}
   const mainAll=[...leading,...trailing];
   if(base===null){
    // a concept appears only through uncitable text (trailing cell, line below): refuse rather than guess
    const probes=[mainAll,[...mainAll,...below],[...above,...mainAll],[...above,...mainAll,...below]];
    if(probes.some(ps=>conceptsOf(ps).length>0))note('label_ambiguous',`${S}:row:${normalizeLabel(textOf(mainAll))}`);
    continue;
   }
   const sign=signWords(textOf(base));
   const exts:Part[][]=[];
   if(trailing.length>0)exts.push([...base,...trailing]);
   for(let n=1;n<=below.length;n++)exts.push([...base,...below.slice(0,n)]);
   if(base===leading&&!startsLabel(textOf(leading)))for(let n=1;n<=above.length;n++)exts.push([...above.slice(-n),...base]);
   const agrees=found.length===1&&exts.every(e=>{const f=conceptsOf(e);return f.length===1&&f[0]===found[0]&&signWords(textOf(e))===sign;});
   const labelText=textOf(base);
   if(!agrees){note('label_ambiguous',`${S}:row:${normalizeLabel(labelText)}`);continue;}
   const label:Range={page_no:page.page_no,char_start:Math.min(...base.map(x=>x.char_start)),char_end:Math.max(...base.map(x=>x.char_end)),bbox:base.length===1&&base[0].bbox!==undefined?base[0].bbox:null};
   hits.push({concept:found[0],page,cells,label,labelText:normalizeLabel(labelText),columns:columnsOf.get(t)??new Map(),sectionLines:section==='eps'?[...sectionLines]:[],extraSources:trailing.map(x=>({page_no:page.page_no,text:x.text,char_start:x.char_start}))});
  }
 }
 // one row per concept and statement: identical repeats (same text in every mapped column) collapse, others are ambiguous
 const byConcept=new Map<string,RowHit[]>();
 for(const h of hits){const l=byConcept.get(h.concept)??[];l.push(h);byConcept.set(h.concept,l);}
 const signature=(r:RowHit)=>[...r.columns.entries()].map(([col,ref])=>`${ref.kind}:${ref.year}:${ref.date??''}=${r.cells.find(c=>c.numeric&&c.col===col)?.text??''}`).join('|');
 const drafts:Draft[]=[];
 for(const [concept,rows] of byConcept){
  if(rows.some(r=>signature(r)!==signature(rows[0]))){note('label_ambiguous',`${S}:${concept}`);continue;}
  const r=rows[0];
  let unit:string,scale:Scale,unitRange:Range;let unitCurrency:Range|null=null;
  if(EPS.has(concept)){
   const text=new Map(st.pages.map(p=>[p.page_no,p.text]));
   const sources=[{page_no:r.label.page_no,text:cpSlice(text.get(r.label.page_no)??'',r.label.char_start,r.label.char_end),char_start:r.label.char_start},
    ...r.extraSources,...r.sectionLines.map(x=>({page_no:x.page_no,text:x.line.text,char_start:x.line.char_start}))];
   const eps=detectEpsUnit(sources,amount.ok?amount.currency:null);
   if(!eps.ok){note('unit_ambiguous',`${S}:${concept}:${eps.reason}`);continue;}
   unit=eps.unit;scale=eps.scale;unitRange={...eps.cite,bbox:null};
   // R2-P1-1: 仙 / cents names no currency — the table's amount-unit evidence is cited as well
   if(eps.inherited){if(eps.currencyCite)unitCurrency={...eps.currencyCite,bbox:null};else{if(!amount.ok)continue;unitCurrency={...amount.cite,bbox:null};}}
  }else{
   if(!amount.ok)continue;
   unit=amount.currency;scale=amount.scale;unitRange={...amount.cite,bbox:null};
  }
  const periods:{col:number;period:ColumnPeriod}[]=[];
  for(const [col,ref] of r.columns){
   const p=columnPeriod(title,ref,annual);
   if(p==='interim_year_only'||p==='invalid_date'){note('period_unparsed',`${S}:${p}`);continue;}
   periods.push({col,period:p});
  }
  if(periods.length===0)continue;
  if(!periods.some(x=>x.period.rule==='title_duration'||x.period.rule==='title_instant')){note('period_unparsed',`${S}:no_main_column`);continue;}
  if(new Set(periods.map(x=>x.period.period_end)).size!==periods.length){note('period_unparsed',`${S}:duplicate_column_period`);continue;}
  for(const {col,period} of periods){
   const cell=r.cells.find(c=>c.numeric&&c.col===col);if(!cell)continue;
   const v=cellValue(cell.text,scale);if(v.kind!=='value')continue;
   const signed=applySign(concept,v.value,r.labelText);
   drafts.push({
    payload:{concept,statement:S,period_start:period.period_start,period_end:period.period_end,duration:period.duration,value:signed.value,presented:v.presented,unit,scale,sign_flip:signed.sign_flip,
     period_derivation:{rule:period.rule,title_date:period.title_date,column_text:period.column_text},consolidation:'consolidated'},
    value:rangeOf(r.page.page_no,cell),label:r.label,unit:unitRange,unitCurrency,titleLine:titleLineRange,title:titleRange,
    header:{page_no:period.header.page_no,char_start:period.header.start,char_end:period.header.end,bbox:null},
   });
  }
 }
 return drafts;
}

export async function generateHkCandidates(pages:PagesJson,ctx:GenerateContext):Promise<{candidates:CandidateInsert[];info:BatchError[]}>{
 const notes=new Map<HkInfoCode,string[]>();
 const note:Note=(code,detail)=>{const l=notes.get(code)??[];if(!l.includes(detail))l.push(detail);notes.set(code,l);};
 const located=locateStatements(pages);
 for(const i of located.info)note(i.code,i.detail);
 const annual=ctx.document.doc_class==='annual_report';
 const drafts=located.statements.flatMap(st=>draftsOf(st,annual,note));
 // the (extraction, kind, extractor_ref, natural_key) unique key: a clash with another value is ambiguous, an equal repeat collapses
 const byKey=new Map<string,Draft[]>();
 for(const d of drafts){const k=naturalKey(d.payload);byKey.set(k,[...(byKey.get(k)??[]),d]);}
 const kept:Draft[]=[];
 for(const [k,ds] of byKey){if(ds.some(d=>d.payload.value!==ds[0].payload.value)){note('label_ambiguous',`key:${k}`);continue;}kept.push(ds[0]);}
 const text=new Map(pages.pages.map(p=>[p.page_no,p.text]));
 const snippet=(r:Range)=>cpSlice(text.get(r.page_no)??'',r.char_start,r.char_end);
 const ids=new Map<string,string>();
 const cite=async(r:Range)=>{
  const k=`${r.page_no}:${r.char_start}:${r.char_end}`;const have=ids.get(k);if(have!==undefined)return have;
  const id=await ctx.cite({page_no:r.page_no,char_start:r.char_start,char_end:r.char_end,bbox:r.bbox});ids.set(k,id);return id;
 };
 const pageNos=[...new Set(kept.flatMap(d=>[d.value,d.label,d.unit,d.titleLine,d.title,d.header,...(d.unitCurrency?[d.unitCurrency]:[])].map(r=>r.page_no)))].sort((a,b)=>a-b);
 const same=(a:Range,b:Range)=>a.page_no===b.page_no&&a.char_start===b.char_start&&a.char_end===b.char_end;
 /** statement_title evidence: the title line, then the period phrase when it is a different range. */
 const titlesOf=(d:Draft)=>same(d.titleLine,d.title)?[d.titleLine]:[d.titleLine,d.title];
 const candidates:CandidateInsert[]=[];
 for(const d of kept){
  const citations:FactCitations={value:await cite(d.value),label:await cite(d.label),unit:await cite(d.unit),
   ...(d.unitCurrency?{unit_currency:await cite(d.unitCurrency)}:{}),period:[]};
  for(const t of titlesOf(d))citations.period.push({role:'statement_title',citation_id:await cite(t)});
  citations.period.push({role:'column_header',citation_id:await cite(d.header)});
  const natural_key=naturalKey(d.payload);
  const fingerprint=sha256(canonicalJson({natural_key,payload:d.payload,snippets:{value:snippet(d.value),label:snippet(d.label),unit:snippet(d.unit),...(d.unitCurrency?{unit_currency:snippet(d.unitCurrency)}:{}),period:[...titlesOf(d).map(snippet),snippet(d.header)]}}));
  candidates.push({kind:'financial_fact',extractor_kind:'rule',extractor_ref:HK_EXTRACTOR_REF,natural_key,citations,payload:d.payload,fingerprint,
   input_snapshot:{content_sha256:ctx.document.content_sha256,pages_json_sha256:ctx.extraction.pages_json_sha256,page_nos:pageNos,extractor_version:ctx.extraction.extractor_version,
    table_algo_version:ctx.extraction.table_algo_version,code_version:ctx.extraction.code_version,hk_label_gen:HK_LABEL_GEN,hk_rules_version:HK_RULES_VERSION}});
 }
 const info:BatchError[]=[...notes.entries()].map(([code,details])=>({code,key:ctx.extraction.extraction_id,message:details.join('; ')}));
 return {candidates,info};
}
