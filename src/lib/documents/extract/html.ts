// src/lib/documents/extract/html.ts
// HTML / iXBRL / XML text → PageLayout[] (spec §7.2). Pages split at page-break markers: an <hr>
// element (split after it), or any element whose style has page-break-before|page-break-after|
// break-before|break-after set to always|page (before → split at the start tag, after → split after
// the start tag; EDGAR writes these markers on empty elements, so the element's content is not
// tracked). No marker → one page. Text rules are collectors/edgar.ts::htmlToText's (script/style
// removed, tags dropped, the same entity table, numeric entities decoded) WITHOUT the 200,000
// truncation, plus line structure: block-level boundaries and <br> become line breaks (htmlToText
// folds everything to one line, so it cannot be reused as is). Each line is normalised like PDF
// items (NFKC, whitespace folded, trimmed); empty lines are dropped; a segment without text is not a
// page (pages are numbered after dropping; an all-empty document is one empty page). Lines carry one
// item spanning the line; HTML has no coordinates: y/x0/x1/h are 0, width/height null, no tables.
import type {PageLayout} from '../types';
import {assemblePage,normalizeText} from './pages-json';

const ENTITIES:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const BREAK_STYLE=/(?:page-break-before|page-break-after|break-before|break-after)\s*:\s*(?:always|page)/i;
const BLOCK=/<\/?(?:p|div|tr|li|ul|ol|h[1-6]|table|thead|tbody|tfoot|section|article|header|footer|blockquote|pre|dl|dt|dd|center|title)\b[^>]*>|<br\b[^>]*>/gi;

function decodeEntity(m:string,e:string):string{
 if(e[0]!=='#')return ENTITIES[e.toLowerCase()]??m;
 const cp=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
 return Number.isInteger(cp)&&cp>0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):m;
}

/** Positions (UTF-16 indexes into the raw markup; never used as text offsets) where a new page starts. */
function pageCuts(html:string):number[]{
 const cuts:number[]=[];
 for(const m of html.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)){
  const tag=m[0],start=m.index??0,end=start+tag.length;
  if(m[1].toLowerCase()==='hr'){cuts.push(end);continue;}
  const style=/\bstyle\s*=\s*("[^"]*"|'[^']*')/i.exec(tag)?.[1];
  if(!style||!BREAK_STYLE.test(style))continue;
  cuts.push(/(?:page-break-before|break-before)/i.test(style)?start:end);
 }
 return [...new Set(cuts)].sort((a,b)=>a-b);
}

function segmentLines(markup:string):string[]{
 const text=markup.replace(BLOCK,'\n').replace(/<[^>]+>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,decodeEntity);
 return text.split('\n').map(normalizeText).filter(l=>l!=='');
}

export function extractHtml(bytes:Uint8Array):PageLayout[]{
 const html=new TextDecoder('utf-8').decode(bytes).replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
 const cuts=[0,...pageCuts(html),html.length];
 const segments:string[][]=[];
 for(let k=0;k+1<cuts.length;k++){const lines=segmentLines(html.slice(cuts[k],cuts[k+1]));if(lines.length>0)segments.push(lines);}
 if(segments.length===0)segments.push([]);
 return segments.map((lines,k)=>{
  const {text,lines:layout}=assemblePage(lines.map(l=>({y:0,pieces:[{text:l,x0:0,x1:0,y:0,h:0,spaceBefore:false}]})));
  return {page_no:k+1,width:null,height:null,text,lines:layout,tables:[]};
 });
}
