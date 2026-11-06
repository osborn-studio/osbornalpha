// src/lib/documents/extract/tables.test.ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {detectTables,isNumericItem} from './tables';
import {layoutFromItems} from './pdf';
import type {RawItem} from './pdf';
import {cpSlice} from './pages-json';

const page=JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/tables/hk-is-page.items.json',import.meta.url)),'utf8')) as {items:RawItem[]};

describe('isNumericItem',()=>{
 it('accepts figures, bracketed negatives and lone dashes; rejects years-with-text, note refs and bare punctuation',()=>{
  for(const s of ['1,234','(5,678)','-12','–','—','-','0.25','(1,000.5)','2025'])expect(isNumericItem(s)).toBe(true);
  for(const s of [',','()','6(a)','HK$\'000','二零二五年','12%','1.2.3'])expect(isNumericItem(s)).toBe(false);
 });
});

describe('detectTables on a synthetic HK income statement page',()=>{
 const {text,lines}=layoutFromItems(page.items);
 const tables=detectTables(lines);
 it('finds one table; the footer "- 10 -" is not absorbed',()=>{
  expect(tables).toHaveLength(1);
  expect(lines.at(-1)?.text).toBe('- 10 -');
 });
 it('keeps the header block verbatim, including the Chinese-numeral year row and the unit row',()=>{
  expect(tables[0].header_lines.map(l=>l.text)).toEqual(['綜合損益表','截至二零二五年十二月三十一日止年度','附註 二零二五年 二零二四年','千港元 千港元']);
  for(const h of tables[0].header_lines)expect(cpSlice(text,h.char_start,h.char_end)).toBe(h.text);
 });
 it('columns: label, note, current year, prior year; sub-heading and dash rows are rows of the table',()=>{
  const t=tables[0];
  expect(t).toMatchObject({row_count:6,col_count:4,col_x0:[60,305,375,465]});
  const grid=t.cells.map(c=>[c.row,c.col,c.text]);
  expect(grid).toEqual([
   [0,0,'收益'],[0,1,'5'],[0,2,'1,234,567'],[0,3,'1,100,000'],
   [1,0,'銷售成本'],[1,2,'(800,000)'],[1,3,'(700,000)'],
   [2,0,'毛利'],[2,2,'434,567'],[2,3,'400,000'],
   [3,0,'以下人士應佔:'],                       // NFKC: fullwidth colon → ':'
   [4,0,'本公司擁有人'],[4,2,'300,000'],[4,3,'280,000'],
   [5,0,'非控股權益'],[5,2,'–'],[5,3,'(1,000)'],
  ]);
  for(const c of t.cells)expect(cpSlice(text,c.char_start,c.char_end)).toBe(c.text);
  expect(t.cells.find(c=>c.text==='1,234,567')).toMatchObject({numeric:true,line_index:lines.findIndex(l=>l.text.startsWith('收益')),bbox:{x0:375,y0:730,x1:420,y1:740}});
  expect(t.cells.filter(c=>c.col===0).every(c=>!c.numeric)).toBe(true);
 });
 it('an English header with bare years stays in the header block; a single aligned body row is not a table',()=>{
  const en=layoutFromItems([
   {str:'Consolidated Statement of Profit or Loss',x:150,y:800,w:200,h:12},
   {str:'2025',x:400,y:770,w:20,h:10},{str:'2024',x:490,y:770,w:20,h:10},
   {str:"HK$'000",x:392,y:758,w:28,h:10},{str:"HK$'000",x:482,y:758,w:28,h:10},
   {str:'Revenue',x:60,y:740,w:35,h:10},{str:'1,234,567',x:375,y:740,w:45,h:10},{str:'1,100,000',x:465,y:740,w:45,h:10},
   {str:'Cost of sales',x:60,y:726,w:55,h:10},{str:'(800,000)',x:375,y:726,w:45,h:10},{str:'(700,000)',x:465,y:726,w:45,h:10},
  ]);
  const [t]=detectTables(en.lines);
  expect(t.header_lines.map(l=>l.text)).toEqual(['Consolidated Statement of Profit or Loss','2025 2024',"HK$'000 HK$'000"]);
  expect(t.row_count).toBe(2);
  expect(detectTables(en.lines.slice(0,4))).toEqual([]);   // title, years, unit, one body row
 });
 it('two tables on one page: the second header block starts after the first table',()=>{
  const two=layoutFromItems([
   {str:'A',x:10,y:500,w:5,h:10},{str:'1',x:100,y:500,w:5,h:10},{str:'2',x:200,y:500,w:5,h:10},
   {str:'B',x:10,y:490,w:5,h:10},{str:'3',x:100,y:490,w:5,h:10},{str:'4',x:200,y:490,w:5,h:10},
   {str:'2025',x:100,y:470,w:20,h:10},{str:'2024',x:200,y:470,w:20,h:10},
   {str:'C',x:10,y:450,w:5,h:10},{str:'5',x:100,y:450,w:5,h:10},{str:'6',x:200,y:450,w:5,h:10},
   {str:'D',x:10,y:440,w:5,h:10},{str:'7',x:100,y:440,w:5,h:10},{str:'8',x:200,y:440,w:5,h:10},
  ]);
  const ts=detectTables(two.lines);
  expect(ts.map(t=>t.header_lines.map(l=>l.text))).toEqual([[],['2025 2024']]);
  expect(ts.map(t=>t.row_count)).toEqual([2,2]);
 });
});
