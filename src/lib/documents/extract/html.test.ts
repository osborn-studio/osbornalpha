// src/lib/documents/extract/html.test.ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {extractHtml} from './html';
import {cpLength,cpSlice} from './pages-json';

const enc=(s:string)=>new TextEncoder().encode(s);
const PLTR=readFileSync(fileURLToPath(new URL('../../research/ingest/__fixtures__/collectors/edgar-8k-pltr-20260803.htm',import.meta.url)));

describe('extractHtml',()=>{
 it('splits the recorded EDGAR 8-K at its two <hr style="page-break-after:always"/> markers',()=>{
  const pages=extractHtml(PLTR);
  expect(pages.map(p=>p.page_no)).toEqual([1,2,3]);
  expect(pages[0].lines.some(l=>l.text==='UNITED STATES')).toBe(true);
  expect(pages[1].lines[0].text).toBe('Item 2.02 - Results of Operations and Financial Condition');
  expect(pages[2].lines[0].text).toBe('SIGNATURES');
  expect(pages[2].text).toContain('/s/ Alexander C. Karp');
  for(const p of pages){
   expect(p).toMatchObject({width:null,height:null,tables:[]});
   for(const l of p.lines){expect(cpSlice(p.text,l.char_start,l.char_end)).toBe(l.text);expect(l.items).toHaveLength(1);}
  }
 });
 it('block boundaries and <br> are line breaks; script/style/comments dropped; htmlToText entities, invalid numeric entities kept',()=>{
  const [p]=extractHtml(enc('<html><head><style>p{x:1}</style><script>var a="<p>";</script></head><body><!-- c --><p>A&amp;B&nbsp;&nbsp;C</p><div>x<br/>y &#x1F600; &#20011; &#0; &bogus;</div><span>ｆｕｌｌ</span><span>width</span></body></html>'));
  expect(p.text).toBe('A&B C\nx\ny 😀 丫 &#0; &bogus;\nfull width');
 });
 it('page-break-before splits before the element, break-after:page after its start tag; empty segments are not pages',()=>{
  const pages=extractHtml(enc('<p>one</p><div style="page-break-before: always">two</div><div style="break-after:page"></div><p>three</p><hr/><hr/>'));
  expect(pages.map(p=>p.text)).toEqual(['one','two','three']);
 });
 it('no marker → one page; no text → one empty page',()=>{
  expect(extractHtml(enc('<p>only</p>')).map(p=>p.text)).toEqual(['only']);
  expect(extractHtml(enc('<html><body> </body></html>'))).toEqual([{page_no:1,width:null,height:null,text:'',lines:[],tables:[]}]);
 });
 it('does not truncate at 200,000 characters and offsets stay code points past supplementary characters',()=>{
  const big=`<p>𠀋😀 start</p><p>${'x'.repeat(250_000)}</p><p>end</p>`;
  const [p]=extractHtml(enc(big));
  expect(cpLength(p.text)).toBe(8+1+250_000+1+3);   // '𠀋😀 start' is 8 code points (10 UTF-16 units)
  expect(p.lines.map(l=>[l.char_start,l.char_end])).toEqual([[0,8],[9,250_009],[250_010,250_013]]);
  expect(cpSlice(p.text,250_010,250_013)).toBe('end');
 });
});
