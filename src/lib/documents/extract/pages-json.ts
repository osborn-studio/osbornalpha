// src/lib/documents/extract/pages-json.ts
// pages.json and code-point helpers (spec §4.4, §7.2). Every character offset in the pipeline is a
// Unicode code point offset (Array.from), equal to PostgreSQL length/substr on UTF-8 text; nothing
// here uses String.prototype.slice/substring/length for offsets. Item text is normalised once
// (NFKC, whitespace runs folded to one space, trimmed) and offsets are recorded while the page text
// is concatenated, never searched for afterwards. pages.json is serialised with JSON.stringify over
// key-sorted objects (canonical at every level), so parse → serialise reproduces the same bytes and hash.
import {createHash} from 'node:crypto';
import {EXTRACTOR_VERSION,TABLE_ALGO_VERSION} from '../types';
import type {LayoutItem,LayoutLine,PageInsert,PageLayout,PagesJson} from '../types';

export const sha256Hex=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export const cpLength=(s:string)=>Array.from(s).length;
export const cpSlice=(s:string,start:number,end:number)=>Array.from(s).slice(start,end).join('');
/** NFKC, every whitespace run (incl. U+3000 and NBSP) folded to one ASCII space, trimmed. */
const LONE_SURROGATE=/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const C0_CONTROLS=/[\u0000-\u0008\u000e-\u001f\u007f]/g;   // \t \n \v \f \r are whitespace, folded below
/** Also: lone surrogates → U+FFFD (they cannot be stored as UTF-8 text), C0 controls other than whitespace removed. */
export const normalizeText=(s:string)=>s.replace(LONE_SURROGATE,'\ufffd').normalize('NFKC').replace(C0_CONTROLS,'').replace(/\s+/gu,' ').trim();

/** One positioned piece of a line; text is already normalised and non-empty. */
export interface LinePiece{text:string;x0:number;x1:number;y:number;h:number;spaceBefore:boolean}

/**
 * Concatenates rows into the page text ('\n' between rows, one ' ' before a piece whose spaceBefore
 * is set, except the first piece of a row) and records every offset while doing so.
 */
export function assemblePage(rows:{y:number;pieces:LinePiece[]}[]):{text:string;lines:LayoutLine[]}{
 const parts:string[]=[];const lines:LayoutLine[]=[];let pos=0;
 for(const row of rows){
  if(row.pieces.length===0)continue;
  if(lines.length>0){parts.push('\n');pos+=1;}
  const lineStart=pos;const items:LayoutItem[]=[];const lineParts:string[]=[];
  row.pieces.forEach((p,i)=>{
   if(i>0&&p.spaceBefore){parts.push(' ');lineParts.push(' ');pos+=1;}
   const start=pos;parts.push(p.text);lineParts.push(p.text);pos+=cpLength(p.text);
   items.push({text:p.text,x0:p.x0,x1:p.x1,y:p.y,h:p.h,char_start:start,char_end:pos});
  });
  lines.push({index:lines.length,y:row.y,x0:Math.min(...items.map(i=>i.x0)),x1:Math.max(...items.map(i=>i.x1)),text:lineParts.join(''),char_start:lineStart,char_end:pos,items});
 }
 return {text:parts.join(''),lines};
}

/** Canonical form: object keys sorted at every nesting level (arrays keep their order), so the bytes do not depend on construction order. */
function sortKeys(v:unknown):unknown{
 if(Array.isArray(v))return v.map(sortKeys);
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys((v as Record<string,unknown>)[k])]));
 return v;
}
export const serializePagesJson=(json:PagesJson)=>JSON.stringify(sortKeys(json));

export function buildPagesJson(input:{content_sha256:string;code_version:string;has_text_layer:boolean;pages:PageLayout[]}):{json:PagesJson;bytes:Uint8Array;sha256:string}{
 const json:PagesJson={extractor_version:EXTRACTOR_VERSION,table_algo_version:TABLE_ALGO_VERSION,code_version:input.code_version,content_sha256:input.content_sha256,has_text_layer:input.has_text_layer,
  pages:input.pages.map(p=>({page_no:p.page_no,width:p.width,height:p.height,text:p.text,lines:p.lines,tables:p.tables}))};
 const bytes=new TextEncoder().encode(serializePagesJson(json));
 return {json,bytes,sha256:sha256Hex(bytes)};
}

/** document_pages rows of one extraction: char_count in code points, text_hash = sha256(utf8(text)). */
export function pageInsertsOf(json:PagesJson):PageInsert[]{
 return json.pages.map(p=>({page_no:p.page_no,text:p.text,text_hash:sha256Hex(p.text),char_count:cpLength(p.text),width:p.width,height:p.height,line_count:p.lines.length,has_tables:p.tables.length>0}));
}

/** File written by scripts/documents/record-fixture.ts (spec §11.3): header fields plus the pages.json it produced.
 * pages_subset: only the pages chosen with --pages are stored (an 84-page report's full pages.json is ~4.9 MB);
 * page_count and content_sha256 still describe the whole PDF, the stored pages keep their page_no. */
export interface RecordedPagesFixture{doc_class?:'annual_report'|'interim_report';recorded_at:string;source_url:string;source_ref:string;content_sha256:string;bytes:number;page_count:number;extractor_version:string;table_algo_version:string;pages_subset?:true;pages_json:PagesJson}
const HEX64=/^[0-9a-f]{64}$/;
/** A subset's page numbers are strictly ascending inside 1..page_count. */
const subsetOk=(f:RecordedPagesFixture)=>f.pages_json.pages.every((p,i,a)=>Number.isInteger(p.page_no)&&p.page_no>=1&&p.page_no<=f.page_count&&(i===0||p.page_no>a[i-1].page_no));
export function parseRecordedFixture(text:string):{fixture:RecordedPagesFixture;pagesJsonBytes:Uint8Array;pagesJsonSha256:string}{
 const f=JSON.parse(text) as RecordedPagesFixture;
 if(!f||typeof f!=='object'||!HEX64.test(String(f.content_sha256))||!f.pages_json||!Array.isArray(f.pages_json.pages))throw new Error('invalid_fixture');
 const versionsOk=[f,f.pages_json].every(o=>o.extractor_version===EXTRACTOR_VERSION&&o.table_algo_version===TABLE_ALGO_VERSION);
 if(!versionsOk)throw new Error('invalid_fixture');
 if(f.pages_json.content_sha256!==f.content_sha256||(f.pages_subset===true?!subsetOk(f):f.pages_json.pages.length!==f.page_count))throw new Error('invalid_fixture');
 const pagesJsonBytes=new TextEncoder().encode(serializePagesJson(f.pages_json));
 return {fixture:f,pagesJsonBytes,pagesJsonSha256:sha256Hex(pagesJsonBytes)};
}
