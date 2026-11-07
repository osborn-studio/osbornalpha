// src/lib/documents/extract/pdf.test.ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {existsSync as exists} from 'node:fs';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {extractPdf,layoutFromItems,pdfjsAssets,ExtractTimeout} from './pdf';
import type {RawItem} from './pdf';
import {cpSlice} from './pages-json';
import {cjkCidPdf,minimalTwoPagePdf,noTextPdf} from '../fixtures/pdf/build';
import type {PageLayout} from '../types';

const FIX=fileURLToPath(new URL('../fixtures/pdf/',import.meta.url));
const open={remainingMs:()=>60_000};
/** Every line, item and cell offset slices its own text out of the page text (code points). */
function assertOffsets(p:PageLayout){
 for(const l of p.lines){
  expect(cpSlice(p.text,l.char_start,l.char_end)).toBe(l.text);
  for(const it of l.items)expect(cpSlice(p.text,it.char_start,it.char_end)).toBe(it.text);
 }
 for(const t of p.tables){
  for(const c of t.cells)expect(cpSlice(p.text,c.char_start,c.char_end)).toBe(c.text);
  for(const h of t.header_lines)expect(cpSlice(p.text,h.char_start,h.char_end)).toBe(h.text);
 }
}

describe('fixture files',()=>{
 it('the committed PDFs are exactly the builder output (scripts/documents/make-fixture-pdf.ts)',()=>{
  expect(new Uint8Array(readFileSync(FIX+'minimal-two-pages.pdf'))).toEqual(minimalTwoPagePdf());
  expect(new Uint8Array(readFileSync(FIX+'no-text.pdf'))).toEqual(noTextPdf());
  expect(new Uint8Array(readFileSync(FIX+'cjk-cid.pdf'))).toEqual(cjkCidPdf());
  expect(minimalTwoPagePdf().length).toBeLessThanOrEqual(2048);
 });
});

describe('extractPdf (pdfjs-dist legacy build)',()=>{
 it('two pages: line clustering, gap spaces, NFKC, page order and code-point offsets past 𠀋 and 😀',async()=>{
  const {pages,hasTextLayer}=await extractPdf(minimalTwoPagePdf(),open);
  expect(hasTextLayer).toBe(true);
  expect(pages.map(p=>p.page_no)).toEqual([1,2]);
  expect(pages[0]).toMatchObject({width:300,height:300});
  expect(pages[0].text).toBe('𠀋😀 Revenue\nTotal 1,234 (5,678)\nCost (100) 90\n1');
  expect(pages[1].text).toBe('Page two\n𠀋cash 42');
  const [l0,l1]=pages[0].lines;
  expect(l0).toMatchObject({index:0,text:'𠀋😀 Revenue',char_start:0,char_end:10,y:270});
  expect(l0.items.map(i=>[i.text,i.char_start,i.char_end])).toEqual([['𠀋😀',0,2],['Revenue',3,10]]);
  expect(l1).toMatchObject({index:1,char_start:11,char_end:30});
  expect(pages[0].text.indexOf('Revenue')).toBe(5);   // UTF-16 index; the stored offset is the code-point index 3
  expect(l0.items[1].char_start).toBe(3);
  for(const p of pages)assertOffsets(p);
 });
 it('detects the two-row table with label and numeric cells (offsets relative to the page text)',async()=>{
  const {pages}=await extractPdf(minimalTwoPagePdf(),open);
  expect(pages[0].tables).toHaveLength(1);
  const t=pages[0].tables[0];
  expect(t).toMatchObject({row_count:2,col_count:3});
  expect(t.header_lines.map(l=>l.text)).toEqual(['𠀋😀 Revenue']);
  expect(t.cells.map(c=>[c.row,c.col,c.text,c.numeric])).toEqual([[0,0,'Total',false],[0,1,'1,234',true],[0,2,'(5,678)',true],[1,0,'Cost',false],[1,1,'(100)',true],[1,2,'90',true]]);
  expect(t.cells[1]).toMatchObject({line_index:1,char_start:17,char_end:22});
  expect(t.cells[1].bbox).toMatchObject({x0:150,y0:250});
  expect(pages[1].tables).toEqual([]);
 });
 it('no text layer: one empty page, hasTextLayer false',async()=>{
  const {pages,hasTextLayer}=await extractPdf(noTextPdf(),open);
  expect(hasTextLayer).toBe(false);
  expect(pages).toEqual([{page_no:1,width:300,height:300,text:'',lines:[],tables:[]}]);
 });
 it('budget exhausted → extract_timeout; garbage bytes reject',async()=>{
  await expect(extractPdf(minimalTwoPagePdf(),{remainingMs:()=>0})).rejects.toBeInstanceOf(ExtractTimeout);
  await expect(extractPdf(minimalTwoPagePdf(),{remainingMs:()=>60_000,maxPages:1})).rejects.toMatchObject({name:'ExtractTooManyPages',pages:2});   // R1-P2-7 round 2: bounded work
  await expect(extractPdf(new TextEncoder().encode('not a pdf'),open)).rejects.toThrow();
 });
 it('does not detach the caller\'s buffer',async()=>{
  const bytes=minimalTwoPagePdf();
  await extractPdf(bytes,open);
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes[0]).toBe(0x25);   // '%'
 });
 it('always hands pdf.js the packed CMaps and standard fonts (CID-keyed CJK fonts extract no Chinese without them)',async()=>{
  let params:Record<string,unknown>|null=null;
  const loader=async()=>({getDocument:(p:Record<string,unknown>)=>{params=p;return {promise:Promise.resolve({numPages:0}),destroy:async()=>{}};}}) as never;
  expect(await extractPdf(new Uint8Array([0x25]),open,{loader,assets:pdfjsAssets('/app')})).toEqual({pages:[],hasTextLayer:false});
  expect(params).toMatchObject({cMapUrl:'/app/node_modules/pdfjs-dist/cmaps/',cMapPacked:true,standardFontDataUrl:'/app/node_modules/pdfjs-dist/standard_fonts/'});
  await extractPdf(new Uint8Array([0x25]),open,{loader});
  expect(params).toMatchObject(pdfjsAssets());                                                // default: the app's node_modules
  const real=pdfjsAssets();
  expect(existsSync(join(real.cMapUrl,'UniCNS-UCS2-H.bcmap'))).toBe(true);                   // Traditional Chinese CMap ships with pdfjs-dist
  expect(existsSync(join(real.cMapUrl,'UniGB-UCS2-H.bcmap'))).toBe(true);
  expect(existsSync(real.standardFontDataUrl)).toBe(true);
 });
});

describe('layoutFromItems (synthetic items)',()=>{
 const it_=(str:string,x:number,y:number,w:number,h=10):RawItem=>({str,x,y,w,h});
 it('clusters by |Δy| <= half the item height, sorts by x, inserts one space only past a quarter-em gap',()=>{
  const {text,lines}=layoutFromItems([it_('B',21,100.4,10),it_('A',10,100,10),it_('C',40,99.8,10),it_('next',10,80,20)]);
  expect(text).toBe('AB C\nnext');   // A 10..20, B 21..31 (gap 1 ≤ 2.5), C at 40 (gap 9 > 2.5)
  expect(lines.map(l=>l.text)).toEqual(['AB C','next']);
 });
 it('folds whitespace, applies NFKC, drops whitespace-only items and fake-bold duplicates',()=>{
  const {text}=layoutFromItems([it_('Ｒｅｖｅｎｕｅ　　 ',10,100,60),it_(' ',70,100,5),it_('ﬁnal',80,100,20),it_('ﬁnal',80.3,100,20)]);
  expect(text).toBe('Revenue final');
 });
 it('splits a multi-word item into word pieces with interpolated x and keeps its spaces',()=>{
  const {lines}=layoutFromItems([it_('Total  1,234',0,50,110)]);
  expect(lines[0].text).toBe('Total 1,234');
  expect(lines[0].items.map(i=>[i.text,i.char_start,i.char_end,Math.round(i.x0),Math.round(i.x1)])).toEqual([['Total',0,5,0,50],['1,234',6,11,60,110]]);
 });
});

describe('review fixes',()=>{
 const it_=(str:string,x:number,y:number,w:number,h=10):RawItem=>({str,x,y,w,h});
 it('fake bold: the same text in the same box is dropped, adjacent repeated glyphs are kept',()=>{
  expect(layoutFromItems([it_('1',10,100,3),it_('1',13,100,3)]).text).toBe('11');
  expect(layoutFromItems([it_('1',10,100,4),it_('1',14,100,4)]).text).toBe('11');
  expect(layoutFromItems([it_('1',10,100,3),it_('1',13.5,100,3),it_('1',17,100,3)]).text).toBe('111');
  expect(layoutFromItems([it_('Total',10,100,30),it_('Total',10.3,100.2,30)]).text).toBe('Total');
  expect(layoutFromItems([it_('Total',10,100,30),it_('Total',10.3,100,31.5)]).text).toBe('TotalTotal');   // other width: not an overprint, both kept
 });
 it('budget: the clock is read before every page (second page times out), not only at the start',async()=>{
  let calls=0;
  await expect(extractPdf(minimalTwoPagePdf(),{remainingMs:()=>++calls<=2?60_000:0})).rejects.toBeInstanceOf(ExtractTimeout);
  expect(calls).toBe(3);   // start, page 1, page 2
 });
 it('default page cap applies when the caller sets none; an aborted signal stops the extraction and destroys the document task',async()=>{
  let destroyed=0;
  const mk=(numPages:number)=>async()=>({getDocument:()=>({promise:Promise.resolve({numPages}),destroy:async()=>{destroyed++;}})}) as never;
  await expect(extractPdf(new Uint8Array([0x25]),open,{loader:mk(1501)})).rejects.toMatchObject({name:'ExtractTooManyPages',pages:1501});
  const ac=new AbortController();ac.abort();
  await expect(extractPdf(new Uint8Array([0x25]),{remainingMs:()=>60_000,signal:ac.signal},{loader:mk(1)})).rejects.toBeInstanceOf(ExtractTimeout);
  expect(destroyed).toBe(2);
  let destroyedOnAbort=0;
  const ac2=new AbortController();
  const slow=async()=>({getDocument:()=>({promise:new Promise(()=>{}),destroy:async()=>{destroyedOnAbort++;}})}) as never;
  const run=extractPdf(new Uint8Array([0x25]),{remainingMs:()=>60_000,signal:ac2.signal},{loader:slow});
  await new Promise(r=>setTimeout(r,5));ac2.abort();
  await new Promise(r=>setTimeout(r,5));
  expect(destroyedOnAbort).toBeGreaterThanOrEqual(1);   // signal → task.destroy()
  void run;
 });
 it('CID-keyed CJK text (no embedded font, no ToUnicode) is extracted only through the packed CMaps',async()=>{
  const {pages}=await extractPdf(cjkCidPdf(),open);
  expect(pages[0].text).toBe('中文报告\n收益');
  for(const p of pages)assertOffsets(p);
  const without=await extractPdf(cjkCidPdf(),open,{assets:{cMapUrl:'/nonexistent/',cMapPacked:true,standardFontDataUrl:'/nonexistent/'}});
  expect(without.pages[0].text).toBe('');
 });
 it('pdfjsAssets are plain absolute directory paths with a trailing separator, never file:// URLs',()=>{
  const a=pdfjsAssets('/app');
  for(const v of [a.cMapUrl,a.standardFontDataUrl]){expect(v.startsWith('/')).toBe(true);expect(v.endsWith('/')).toBe(true);expect(v).not.toContain('file:');}
 });
});

// Local-only smoke against a real HKEX report (never committed): DOCS_REAL_PDF=/path/to.pdf npm test -- extract/pdf
const REAL=process.env.DOCS_REAL_PDF;
describe.skipIf(!REAL||!exists(REAL))('real HKEX PDF (local only)',()=>{
 it('pages 44–52 carry Chinese text and detected tables, offsets slice their text',async()=>{
  const {pages}=await extractPdf(new Uint8Array(readFileSync(REAL as string)),{remainingMs:()=>300_000});
  const sel=pages.filter(p=>p.page_no>=44&&p.page_no<=52);
  const han=sel.reduce((n,p)=>n+(p.text.match(/\p{Script=Han}/gu)?.length??0),0);
  expect(han).toBeGreaterThan(500);
  expect(sel.reduce((n,p)=>n+p.tables.length,0)).toBeGreaterThan(0);
  for(const p of sel)assertOffsets(p);
 },120_000);
});
