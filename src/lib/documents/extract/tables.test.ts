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

describe('detectTables review fixes',()=>{
 const L=(items:RawItem[])=>layoutFromItems(items).lines;
 const row=(y:number,label:string,a:string,b:string,extra:RawItem[]=[]):RawItem[]=>[{str:label,x:60,y,w:40,h:10},{str:a,x:300,y,w:40,h:10},{str:b,x:400,y,w:40,h:10},...extra];
 it('labelled rows whose amounts look like years are body rows; a bare year row is still a header',()=>{
  const t=detectTables(L([...row(100,'Revenue','3000','2800'),...row(86,'Cost','2025','2024'),...row(72,'Profit','975','776')]));
  expect(t).toHaveLength(1);
  expect(t[0].row_count).toBe(3);
  const t2=detectTables(L([...row(100,'Revenue','2025','2024'),...row(86,'Cost','1900','1901')]));
  expect(t2).toHaveLength(1);
  expect(t2[0].cells.map(c=>c.text)).toEqual(['Revenue','2025','2024','Cost','1900','1901']);
  const t3=detectTables(L([{str:'2025',x:300,y:120,w:40,h:10},{str:'2024',x:400,y:120,w:40,h:10},...row(100,'Revenue','1','2'),...row(86,'Cost','3','4')]));
  expect(t3[0].header_lines.map(l=>l.text)).toEqual(['2025 2024']);
  const t4=detectTables(L([{str:'Year ended 31 December',x:60,y:120,w:90,h:10},{str:'2025',x:300,y:120,w:40,h:10},{str:'2024',x:400,y:120,w:40,h:10},...row(100,'Revenue','1','2'),...row(86,'Cost','3','4')]));
  expect(t4[0].header_lines).toHaveLength(1);
 });
 it('fragmented numbers: separately drawn parentheses merge into one negative; offsets still slice',()=>{
  const items:RawItem[]=[
   {str:'Cost',x:60,y:100,w:30,h:10},{str:'(',x:300,y:100,w:3,h:10},{str:'50',x:303,y:100,w:10,h:10},{str:')',x:313,y:100,w:3,h:10},{str:'60',x:400,y:100,w:10,h:10},
   {str:'Profit',x:60,y:86,w:30,h:10},{str:'(800,000',x:300,y:86,w:40,h:10},{str:')',x:340,y:86,w:3,h:10},{str:'(70',x:400,y:86,w:15,h:10},{str:')',x:415,y:86,w:3,h:10},
  ];
  const {text,lines}=layoutFromItems(items);
  const [t]=detectTables(lines);
  expect(t.cells.map(c=>[c.row,c.col,c.text])).toEqual([[0,0,'Cost'],[0,1,'(50)'],[0,2,'60'],[1,0,'Profit'],[1,1,'(800,000)'],[1,2,'(70)']]);
  for(const c of t.cells)expect(cpSlice(text,c.char_start,c.char_end)).toBe(c.text);
  expect(t.cells[1].bbox).toMatchObject({x0:300,x1:316});
 });
 it('U+2212 minus is a sign',()=>{
  expect(isNumericItem('−12')).toBe(true);expect(isNumericItem('(−1,000)')).toBe(true);expect(isNumericItem('−')).toBe(true);
  const [t]=detectTables(L([...row(100,'Loss','−12','−3'),...row(86,'Gain','5','6')]));
  expect(t.cells.filter(c=>c.numeric).map(c=>c.text)).toEqual(['−12','−3','5','6']);
 });
 it('bilingual rows: a trailing label column 1 em past the figures is a second label cell',()=>{
  const bi=(y:number,en:string,a:string,b:string,zh:string)=>row(y,en,a,b,[{str:zh,x:480,y,w:30,h:10}]);
  const {text,lines}=layoutFromItems([...bi(100,'Revenue','1,234','1,100','收益'),...bi(86,'Cost','(5)','(6)','成本')]);
  const [t]=detectTables(lines);
  expect(t).toMatchObject({row_count:2,col_count:4});
  expect(t.cells.filter(c=>c.col===3).map(c=>[c.row,c.text,c.numeric])).toEqual([[0,'收益',false],[1,'成本',false]]);
  expect(t.cells.filter(c=>c.col===1||c.col===2).every(c=>c.numeric)).toBe(true);
  for(const c of t.cells)expect(cpSlice(text,c.char_start,c.char_end)).toBe(c.text);
  expect(t.col_x0).toEqual([60,300,400,480]);
 });
 it('wrapped labels: only a strictly nearer neighbour at <= 1.2 em and the same x continues a row; headings, titles and notes never do',()=>{
  const lab=(y:number,s:string,x=60):RawItem=>({str:s,x,y,w:60,h:10});
  const num=(y:number,a:string,b:string):RawItem[]=>[{str:a,x:300,y,w:20,h:10},{str:b,x:400,y,w:20,h:10}];
  const items=[lab(160,'Notes to the accounts',200),lab(130,'Profit for the year attributable'),lab(118,'to owners of the Company'),...num(118,'300','280'),
   lab(104,'Revenue'),...num(104,'5','6'),lab(92,'from contracts'),
   lab(78,'Attributable to:'),lab(64,'Owners',70),...num(64,'7','8')] as RawItem[];
  const {text,lines}=layoutFromItems(items);
  const [t]=detectTables(lines);
  expect(t.row_count).toBe(4);
  expect(t.cells.filter(c=>c.col===0).map(c=>[c.row,c.text])).toEqual([[0,'Profit for the year attributable'],[0,'to owners of the Company'],[1,'Revenue'],[1,'from contracts'],[2,'Attributable to:'],[3,'Owners']]);
  for(const c of t.cells)expect(cpSlice(text,c.char_start,c.char_end)).toBe(c.text);
  expect(t.header_lines.map(l=>l.text)).toEqual(['Notes to the accounts']);
 });
 it('R1: equal spacing or 1.4 em never attaches (the recheck reproduction: "from contracts…" must not join Cost)',()=>{
  const lab=(y:number,s:string):RawItem=>({str:s,x:60,y,w:60,h:10});
  const num=(y:number,a:string,b:string):RawItem[]=>[{str:a,x:300,y,w:20,h:10},{str:b,x:400,y,w:20,h:10}];
  for(const gap of [14,12]){
   const [t]=detectTables(layoutFromItems([lab(100,'Revenue'),...num(100,'100','200'),lab(100-gap,'from contracts with customers'),lab(100-2*gap,'Cost'),...num(100-2*gap,'100','200')]).lines);
   const owner=t.cells.find(c=>c.text==='from contracts with customers');
   expect(owner).toBeDefined();
   expect(owner?.row).toBe(1);                 // its own label-only row, not a cell of Cost (row 2)
   expect(t.cells.find(c=>c.text==='Cost')?.row).toBe(2);
   expect(t.row_count).toBe(3);
  }
  // a statement title and note text next to the table are never swallowed, however close
  const items=[lab(120,'Consolidated Statement of Profit or Loss'),lab(108,'Revenue'),...num(108,'1','2'),lab(96,'Cost'),...num(96,'3','4'),lab(83,'See accompanying notes')];
  const [t2]=detectTables(layoutFromItems(items).lines);
  expect(t2.cells.some(c=>/Consolidated|accompanying/.test(c.text))).toBe(false);
  expect(t2.header_lines.map(l=>l.text)).toEqual(['Consolidated Statement of Profit or Loss']);
 });
 it('header block: at most 6 lines, stops at a line wider than the table',()=>{
  const hdr:RawItem[]=Array.from({length:9},(_,k)=>({str:`H${k}`,x:300,y:300-k*14,w:20,h:10}));
  const wide:RawItem={str:'A very long running paragraph that is far wider than the table below it, spanning the page',x:0,y:300+14,w:900,h:10};
  const body=[...row(80,'Revenue','1','2'),...row(66,'Cost','3','4')];
  const [t]=detectTables(L([wide,...hdr,...body]));
  expect(t.header_lines.map(l=>l.text)).toEqual(['H3','H4','H5','H6','H7','H8']);
  const [t2]=detectTables(L([wide,...hdr.slice(5),...body]));
  expect(t2.header_lines.map(l=>l.text)).toEqual(['H5','H6','H7','H8']);
 });
});

describe('recheck fixes (R2, R3)',()=>{
 it('R2: two independently complete numbers two points apart are never concatenated; fragments still merge',()=>{
  const r=(y:number,l:string,a:string,b:string,c?:string):RawItem[]=>[{str:l,x:60,y,w:30,h:10},{str:a,x:300,y,w:25,h:10},{str:b,x:327,y,w:25,h:10},...(c?[{str:c,x:400,y,w:25,h:10}]:[])];
  const {text,lines}=layoutFromItems([...r(100,'Revenue','1,234','3,456'),...r(86,'Cost','5,678','7,890')]);
  expect(lines[0].text).toBe('Revenue 1,2343,456');   // text layer: no space inserted (gap 2pt <= quarter em)
  const [t]=detectTables(lines);
  expect(t.cells.filter(c=>c.numeric).map(c=>c.text)).toEqual(['1,234','3,456','5,678','7,890']);
  for(const c of t.cells)expect(cpSlice(text,c.char_start,c.char_end)).toBe(c.text);
  const three=detectTables(layoutFromItems([...r(100,'Revenue','1,234','3,456','9'),...r(86,'Cost','5,678','7,890','8')]).lines)[0];
  expect(three.cells.filter(c=>c.numeric).map(c=>c.text)).toEqual(['1,234','3,456','9','5,678','7,890','8']);
  // genuine fragments: sign + number, split inside one token (gap < 0.15 em)
  const f=detectTables(layoutFromItems([
   {str:'A',x:60,y:100,w:10,h:10},{str:'-',x:300,y:100,w:3,h:10},{str:'12',x:303,y:100,w:10,h:10},{str:'45',x:400,y:100,w:10,h:10},
   {str:'B',x:60,y:86,w:10,h:10},{str:'1,2',x:300,y:86,w:15,h:10},{str:'34',x:315.5,y:86,w:10,h:10},{str:'6',x:400,y:86,w:10,h:10}]).lines)[0];
  expect(f.cells.filter(c=>c.numeric).map(c=>c.text)).toEqual(['-12','45','1,234','6']);
 });
 it('R3: only a leading period phrase or an exact notes word makes a year-shaped row a header',()=>{
  const row=(y:number,l:string,a:string,b:string):RawItem[]=>[{str:l,x:60,y,w:90,h:10},{str:a,x:300,y,w:30,h:10},{str:b,x:400,y,w:30,h:10}];
  const t=detectTables(layoutFromItems([...row(100,'Revenue','3000','2800'),...row(86,'Prior year ended adjustment','2025','2024'),...row(72,'Profit','975','776')]).lines);
  expect(t).toHaveLength(1);
  expect(t[0].row_count).toBe(3);
  for(const label of ['Year ended 31 December','For the year ended 31 December','Notes','附註','截至十二月三十一日止年度']){
   const [h]=detectTables(layoutFromItems([...row(120,label,'2025','2024'),...row(100,'Revenue','1','2'),...row(86,'Cost','3','4')]).lines);
   expect(h.header_lines.map(l=>l.text.startsWith(label.slice(0,3)))).toContain(true);
   expect(h.row_count).toBe(2);
  }
  const [n]=detectTables(layoutFromItems([...row(100,'Notes receivable','2025','2024'),...row(86,'Cost','3','4')]).lines);
  expect(n.row_count).toBe(2);   // 'Notes receivable' is a labelled body row, only the exact word 'Notes' is a header
 });
});
