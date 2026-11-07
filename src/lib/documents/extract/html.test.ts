// src/lib/documents/extract/html.test.ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {extractHtml} from './html';
import {ExtractTimeout} from './pdf';
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
  expect(p.text).toBe('A&B C\nx\ny 😀 丫 &#0; &bogus;\nfullwidth');
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

describe('extractHtml review fixes',()=>{
 it('page-break-after splits after the matching closing tag, content stays on its own page; nested same-name elements',()=>{
  expect(extractHtml(enc('<p>Revenue</p><div style="page-break-after:always">Cost</div><p>Profit</p>')).map(p=>p.text)).toEqual(['Revenue\nCost','Profit']);
  expect(extractHtml(enc('<div style="break-after:page">a<div>b</div>c</div><p>d</p>')).map(p=>p.text)).toEqual(['a\nb\nc','d']);
 });
 it('inline tags insert no whitespace; block tags, <br> are line breaks; cells are space separated; source newlines fold',()=>{
  expect(extractHtml(enc('<p>1<span>23</span>4 <b>(</b>5<i>0</i><font>)</font> 1<sup>2</sup>.<a href="x">5</a><ix:nonFraction name="n">9</ix:nonFraction></p>'))[0].text).toBe('1234 (50) 12.59');
  expect(extractHtml(enc('<table><tr><td>Revenue</td><td>1,234</td></tr><tr><td>Cost</td><td>(5)</td></tr></table>'))[0].text).toBe('Revenue 1,234\nCost (5)');
  expect(extractHtml(enc('<p>one\ntwo\n  three</p><p>four<br>five</p>'))[0].text).toBe('one two three\nfour\nfive');
 });
 it('unterminated tags and comments scale well below quadratic (20 KB to 160 KB)',()=>{
  for(const piece of ['<a ','<!--','<a href="','<a b=\'','<'+'x'.repeat(3),'<script ','<p '] ){
   const small=enc(piece.repeat(Math.floor(20_000/piece.length)));
   const large=enc(piece.repeat(Math.floor(160_000/piece.length)));
   // Warm both paths, then use the median of interleaved samples to tolerate scheduling pauses.
   extractHtml(small);extractHtml(large);
   const measure=(input:Uint8Array)=>{const start=performance.now();extractHtml(input);return performance.now()-start;};
   const smallTimes:number[]=[];const largeTimes:number[]=[];
   for(let i=0;i<7;i++){smallTimes.push(measure(small));largeTimes.push(measure(large));}
   const median=(times:number[])=>times.sort((a,b)=>a-b)[3];
   const smallMs=median(smallTimes);const largeMs=median(largeTimes);
   // 8x input would cost 64x for quadratic scanning; allow 24x for runtime noise.
   expect(largeMs/smallMs,piece).toBeLessThan(24);
   expect(Math.max(...largeTimes),piece).toBeLessThan(2000);
  }
  expect(extractHtml(enc('a < b <a href="x'))[0].text).toBe('a < b <a href="x');
 });
 it('drops <ix:header> and display:none elements (nested same-name tags included)',()=>{
  const html='<div>shown</div><ix:header><ix:hidden><ix:nonNumeric>secret</ix:nonNumeric></ix:hidden></ix:header><div style="display:none"><div>hid</div>den</div><p>after</p><span style="display: none">x</span>y';
  expect(extractHtml(enc(html))[0].text).toBe('shown\nafter\ny');
 });
 it('charset: <meta charset> wins, invalid UTF-8 falls back to windows-1252, BOM is dropped',()=>{
  const latin=Uint8Array.from([...enc('<meta charset="iso-8859-1"><p>caf'),0xe9,...enc('</p>')]);
  expect(extractHtml(latin)[0].text).toBe('café');
  expect(extractHtml(Uint8Array.from([...enc('<p>caf'),0xe9,...enc('</p>')]))[0].text).toBe('café');
  expect(extractHtml(Uint8Array.from([0xef,0xbb,0xbf,...enc('<p>ok</p>')]))[0].text).toBe('ok');
  expect(extractHtml(enc('<meta charset="utf-8"><p>日本</p>'))[0].text).toBe('日本');
 });
 it('R4: commented-out, script and style metas are not charset declarations; valid UTF-8 stays UTF-8',()=>{
  expect(extractHtml(enc('<!-- <meta charset="windows-1252"> --><p>日本 café</p>'))[0].text).toBe('日本 café');
  expect(extractHtml(enc('<script>var s="<meta charset=windows-1252>";</script><style>/*<meta charset=iso-8859-1>*/</style><p>日本</p>'))[0].text).toBe('日本');
  const real=Uint8Array.from([...enc('<!-- <meta charset="utf-8"> --><meta charset="iso-8859-1"><p>caf'),0xe9,...enc('</p>')]);
  expect(extractHtml(real)[0].text).toBe('café');   // the active meta is honoured, the commented one is not
  expect(extractHtml(Uint8Array.from([0xef,0xbb,0xbf,...enc('<!-- <meta charset="windows-1252"> --><p>日本</p>')]))[0].text).toBe('日本');
 });
 it('input cap and budget between segments',()=>{
  expect(()=>extractHtml(new Uint8Array(52_428_801))).toThrow('html_too_large');
  expect(()=>extractHtml(enc('<p>a</p><hr/><p>b</p>'),{remainingMs:()=>0})).toThrow(ExtractTimeout);
  expect(extractHtml(enc('<p>a</p><hr/><p>b</p>'),{remainingMs:()=>1000}).map(p=>p.text)).toEqual(['a','b']);
 });
});
