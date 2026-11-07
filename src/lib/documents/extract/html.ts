// src/lib/documents/extract/html.ts
// HTML / iXBRL / XML text → PageLayout[] (spec §7.2). One linear pass over the markup (indexOf on '<'
// and '>', each position visited a bounded number of times: unterminated '<a' / '<!--' cannot go
// quadratic), no regex over the whole document with nested quantifiers.
// - Charset: UTF-8 BOM, else <meta charset=…> / http-equiv content-type in the first 4 KB, else UTF-8,
//   else windows-1252 when the bytes are not valid UTF-8. Input is capped at MAX_DOC_BYTES.
// - Pages: an <hr> (split after it); an element whose style has page-break-before|break-before
//   always|page (split before its start tag); page-break-after|break-after always|page (split after
//   its matching closing tag, or at once for void / self-closing elements). No marker → one page.
// - Text: script, style, comments, <ix:header> blocks and display:none elements are dropped. Source
//   whitespace (newlines included) folds to one space; only block-level tags and <br> end a line;
//   td/th/caption separate with a space; every other tag (span, b, i, font, a, sup, sub,
//   ix:nonfraction, …) inserts nothing, so '1<span>23</span>4' is '1234'. Entities use the collectors/
//   edgar.ts::htmlToText table plus numeric references, WITHOUT its 200,000-character truncation.
// - Lines are normalised like PDF items (NFKC, whitespace folded, trimmed); empty lines are dropped;
//   a segment without text is not a page (pages are numbered after dropping; an all-empty document is
//   one empty page). Lines carry one item spanning the line; HTML has no coordinates: y/x0/x1/h are 0,
//   width/height null, no tables. The optional budget is checked between page segments.
import {MAX_DOC_BYTES} from '../types';
import type {PageLayout} from '../types';
import {assemblePage,normalizeText} from './pages-json';
import {ExtractTimeout} from './pdf';

const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const BREAK_BEFORE=/(?:page-break-before|break-before)\s*:\s*(?:always|page)/i;
const BREAK_AFTER=/(?:page-break-after|break-after)\s*:\s*(?:always|page)/i;
const HIDDEN=/display\s*:\s*none/i;
const BLOCK=new Set(['p','div','tr','li','ul','ol','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','section','article','header','footer','blockquote','pre','dl','dt','dd','center','title','br']);
const CELL=new Set(['td','th','caption']);
const VOID=new Set(['br','hr','img','meta','link','input','col','area','base','wbr']);
const MAX_TAG_LEN=16384;

function decodeEntity(m:string,e:string):string{
 if(e[0]!=='#')return ENTITIES[e.toLowerCase()]??m;
 const cp=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
 return Number.isInteger(cp)&&cp>0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):m;
}
const decodeEntities=(t:string)=>t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,decodeEntity);

export function decodeHtmlBytes(bytes:Uint8Array):string{
 if(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return new TextDecoder('utf-8').decode(bytes.subarray(3));
 const head=new TextDecoder('latin1').decode(bytes.subarray(0,4096));
 const m=/<meta\b[^>]*?charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(head);
 if(m){try{return new TextDecoder(m[1]).decode(bytes);}catch{/* unknown label: sniff below */}}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}
}

export interface HtmlBudget{remainingMs():number}

export function extractHtml(bytes:Uint8Array,budget?:HtmlBudget):PageLayout[]{
 if(bytes.length>MAX_DOC_BYTES)throw new Error('html_too_large');
 const html=decodeHtmlBytes(bytes);
 const n=html.length;
 const segments:string[][]=[];let lines:string[]=[];let buf:string[]=[];
 const flushLine=()=>{if(buf.length>0){const t=normalizeText(buf.join(''));buf=[];if(t!=='')lines.push(t);}};
 const pageBreak=()=>{
  flushLine();
  if(lines.length>0){segments.push(lines);lines=[];}
  if(budget&&budget.remainingMs()<=0)throw new ExtractTimeout();
 };
 const text=(t:string)=>{if(t!=='')buf.push(decodeEntities(t.replace(/\s+/g,' ')));};
 const lastGt=html.lastIndexOf('>');
 let nextGt=-1;
 let hidden:{name:string;depth:number}|null=null;
 const afterStack:{name:string;depth:number}[]=[];
 let i=0;
 while(i<n){
  let lt=html.indexOf('<',i);
  if(lt<0)lt=n;
  if(lt>i&&!hidden)text(html.slice(i,lt));
  if(lt>=n)break;
  i=lt;
  if(html.startsWith('<!--',i)){const e=html.indexOf('-->',i+4);i=e<0?n:e+3;continue;}
  const c1=html.charAt(i+1);
  const isTag=/[a-z/!?]/i.test(c1);
  if(!isTag||i>lastGt){if(!hidden)text('<');i++;continue;}
  if(nextGt<i)nextGt=html.indexOf('>',i);
  if(nextGt<0||nextGt-i>MAX_TAG_LEN){if(!hidden)text('<');i++;continue;}
  const tag=html.slice(i,nextGt+1);i=nextGt+1;
  if(c1==='!'||c1==='?')continue;   // doctype, processing instruction
  const m=/^<(\/?)([a-z][\w:.-]*)/i.exec(tag);
  if(!m)continue;
  const closing=m[1]==='/',name=m[2].toLowerCase(),selfClosing=/\/\s*>$/.test(tag)||VOID.has(name);
  if(hidden){
   if(name===hidden.name&&!selfClosing){hidden.depth+=closing?-1:1;if(hidden.depth===0)hidden=null;}
   continue;
  }
  if(!closing&&(name==='script'||name==='style'||name==='ix:header')){
   const end=new RegExp(`</${name}\\s*>`,'gi');end.lastIndex=i;
   const e=end.exec(html);i=e?e.index+e[0].length:n;
   continue;
  }
  if(closing){
   if(BLOCK.has(name))flushLine();else if(CELL.has(name))buf.push(' ');
   const top=afterStack.at(-1);
   if(top&&top.name===name){top.depth--;if(top.depth===0){afterStack.pop();pageBreak();}}
   continue;
  }
  const style=/\bstyle\s*=\s*("[^"]*"|'[^']*')/i.exec(tag)?.[1]??'';
  if(HIDDEN.test(style)&&!selfClosing){hidden={name,depth:1};continue;}
  if(name==='hr'){pageBreak();continue;}
  if(BREAK_BEFORE.test(style))pageBreak();
  if(BLOCK.has(name))flushLine();else if(CELL.has(name))buf.push(' ');
  if(BREAK_AFTER.test(style)){
   if(selfClosing)pageBreak();
   else afterStack.push({name,depth:1});
  }else{
   const top=afterStack.at(-1);
   if(top&&top.name===name&&!selfClosing)top.depth++;
  }
 }
 pageBreak();
 if(segments.length===0)segments.push([]);
 return segments.map((ls,k)=>{
  const {text:t,lines:layout}=assemblePage(ls.map(l=>({y:0,pieces:[{text:l,x0:0,x1:0,y:0,h:0,spaceBefore:false}]})));
  return {page_no:k+1,width:null,height:null,text:t,lines:layout,tables:[]};
 });
}
