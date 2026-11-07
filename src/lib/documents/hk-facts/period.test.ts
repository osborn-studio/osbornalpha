import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {buildPage} from '../fixtures/hkex/_synthetic/build';
import type {LayoutLine,PagesJson} from '../types';
import {cpSlice} from './locate';
import {columnPeriod,findDates,findYears,headerColumns,mapColumns,numericColumns,parseDate,periodStart,titlePeriod,withYear} from './period';
import type {ColumnRef,TitlePeriod} from './period';

const fixture=(name:string)=>JSON.parse(readFileSync(`src/lib/documents/fixtures/hkex/_synthetic/${name}.json`,'utf8')) as PagesJson;
const ln=(text:string,index=0,char_start=0):LayoutLine=>({index,y:0,x0:0,x1:0,text,char_start,char_end:char_start+Array.from(text).length,items:[]});

describe('dates and years',()=>{
 it('parses Chinese numerals, Arabic Chinese and English dates; refuses impossible ones',()=>{
  expect(parseDate('二零二五年十二月三十一日')).toBe('2025-12-31');
  expect(parseDate('二〇二四年六月三十日')).toBe('2024-06-30');
  expect(parseDate('二零二五年 十二月 三十一日')).toBe('2025-12-31');
  expect(parseDate('2025年6月30日')).toBe('2025-06-30');
  expect(parseDate('31 December 2025')).toBe('2025-12-31');
  expect(parseDate('June 30, 2025')).toBe('2025-06-30');
  expect(parseDate('二零二五年二月三十日')).toBeNull();
  expect(parseDate('二零二五年十二月')).toBeNull();
  expect(parseDate('31 Decembre 2025')).toBeNull();
 });
 it('finds dates and standalone years (dates masked) with code-point positions',()=>{
  const t='😀 截至二零二五年十二月三十一日止年度 二零二四年 2023 1,2024';
  expect(findDates(t)).toEqual([{iso:'2025-12-31',text:'二零二五年十二月三十一日',start:4,end:16}]);
  expect(findYears(t)).toEqual([{year:2024,text:'二零二四年',start:20,end:25},{year:2023,text:'2023',start:26,end:30}]);
  expect(findYears('30 June 2025 31 December 2024')).toEqual([]);
 });
 it('withYear and periodStart (month ends start on the 1st; other days N months back + 1 day)',()=>{
  expect(withYear('2025-12-31',2024)).toBe('2024-12-31');
  expect(withYear('2024-02-29',2023)).toBeNull();
  expect(periodStart('2025-12-31','12M')).toBe('2025-01-01');
  expect(periodStart('2025-06-30','6M')).toBe('2025-01-01');
  expect(periodStart('2025-03-31','12M')).toBe('2024-04-01');
  expect(periodStart('2025-06-15','6M')).toBe('2024-12-16');
 });
});

describe('titlePeriod (spec §7.5 step 2)',()=>{
 it('duration titles in Chinese and English, instant titles for the balance sheet, offsets on the page',()=>{
  expect(titlePeriod('IS',3,[ln('綜合損益表'),ln('截至二零二五年十二月三十一日止年度',1,6)])).toEqual({duration:'12M',date:'2025-12-31',page_no:3,start:6,end:23,text:'截至二零二五年十二月三十一日止年度'});
  expect(titlePeriod('CF',2,[ln('For the six months ended 30 June 2025')])).toMatchObject({duration:'6M',date:'2025-06-30',start:0,end:37});
  expect(titlePeriod('IS',2,[ln('截至二零二五年六月三十日止六個月')])).toMatchObject({duration:'6M',date:'2025-06-30'});
  expect(titlePeriod('BS',4,[ln('於二零二五年十二月三十一日')])).toMatchObject({duration:'INSTANT',date:'2025-12-31',text:'於二零二五年十二月三十一日'});
  expect(titlePeriod('BS',3,[ln('As at 30 June 2025')])).toMatchObject({duration:'INSTANT',date:'2025-06-30'});
  expect(titlePeriod('BS',3,[ln('截至二零二五年六月三十日止六個月')])).toBeNull();
  expect(titlePeriod('IS',3,[ln('於二零二五年十二月三十一日')])).toBeNull();
  expect(titlePeriod('IS',3,[ln('綜合損益表')])).toBeNull();
 });
});

describe('columns',()=>{
 const title:TitlePeriod={duration:'12M',date:'2025-12-31',page_no:3,start:0,end:1,text:'x'};
 const ref=(o:Partial<ColumnRef>={}):ColumnRef=>({anchor:420,kind:'year',year:2025,date:null,text:'二零二五年',page_no:3,start:10,end:15,...o});
 it('maps header years onto the numeric columns under them; years-less tables inherit by right edge',()=>{
  const p=fixture('annual-zh').pages.find(x=>x.page_no===3)!;
  const [t1,t2,t3]=p.tables;
  expect(numericColumns(t1).map(c=>c.anchor)).toEqual([320,420,500]);                       // notes, 2025, 2024
  const refs=headerColumns('IS',t1,3);
  expect(Array.isArray(refs)&&refs.map(r=>[r.kind,r.year,r.anchor,cpSlice(p.text,r.start,r.end)])).toEqual([['year',2025,420,'二零二五年'],['year',2024,500,'二零二四年']]);
  expect(headerColumns('IS',t2,3)).toBeNull();                                               // '以下人士應佔：'
  expect(headerColumns('IS',t3,3)).toBeNull();                                               // '每股盈利（人民幣元）'
  expect([...mapColumns(t2,refs as ColumnRef[]).values()].map(r=>r.year)).toEqual([2025,2024]);
  expect([...mapColumns(t1,refs as ColumnRef[]).keys()]).toEqual([2,3]);                    // col 0 = label, col 1 = notes (maps to nothing)
 });
 it('balance sheets prefer full-date headers and skip the title phrase',()=>{
  const p=fixture('interim-en').pages.find(x=>x.page_no===3)!;
  const refs=headerColumns('BS',p.tables[0],3);
  expect(Array.isArray(refs)&&refs.map(r=>[r.kind,r.date,r.text])).toEqual([['date','2025-06-30','30 June 2025'],['date','2024-12-31','31 December 2024']]);
 });
 it('more header tokens than numeric columns is unmappable',()=>{
  const page=buildPage({page_no:1,lines:['2025 2024',{label:'收益',values:['1','']}]});
  expect(headerColumns('IS',page.tables[0],1)).toBe('unmappable');
 });
 it('places header tokens by their item x (C-1); the rightmost rule is only the fallback for lines without items',()=>{
  const page=buildPage({page_no:1,lines:[{header:['2025','']},{label:'收益',note:'5',values:['1','2']},{label:'毛利',values:['3','4']}]});
  const refs=headerColumns('IS',page.tables[0],1);
  expect(Array.isArray(refs)&&refs.map(r=>[r.year,r.anchor])).toEqual([[2025,420]]);          // over the middle column, not the rightmost
  const bare={...page.tables[0],header_lines:page.tables[0].header_lines.map(l=>({...l,items:[]}))};
  const fallback=headerColumns('IS',bare,1);
  expect(Array.isArray(fallback)&&fallback.map(r=>[r.year,r.anchor])).toEqual([[2025,500]]);
  const away=buildPage({page_no:1,lines:['2025',{label:'收益',values:['1','2']}]});              // a plain line: one item at the label x, over no column
  expect(headerColumns('IS',away.tables[0],1)).toBe('unmappable');
 });
 it('bilingual headers: two year lines over the same columns map once; BS dates over the columns',()=>{
  const json=fixture('interim-bilingual');
  const is=json.pages.find(x=>x.page_no===45)!;
  const refs=headerColumns('IS',is.tables[0],45);
  expect(Array.isArray(refs)&&refs.map(r=>[r.year,r.anchor,r.text])).toEqual([[2026,420,'二零二六年'],[2025,500,'二零二五年']]);
  const bs=json.pages.find(x=>x.page_no===44)!;
  const d=headerColumns('BS',bs.tables[0],44);
  expect(Array.isArray(d)&&d.map(r=>[r.kind,r.date,r.anchor])).toEqual([['date','2026-06-30',420],['date','2025-12-31',500]]);
 });
 it('derives the period of a column (rules title_duration, title_year_substitution, title_instant, column_date)',()=>{
  expect(columnPeriod(title,ref(),true)).toMatchObject({period_start:'2025-01-01',period_end:'2025-12-31',duration:'12M',rule:'title_duration',title_date:'2025-12-31',column_text:'二零二五年'});
  expect(columnPeriod(title,ref({year:2024,text:'二零二四年'}),true)).toMatchObject({period_start:'2024-01-01',period_end:'2024-12-31',duration:'12M',rule:'title_year_substitution',column_text:'二零二四年'});
  const half={...title,duration:'6M' as const,date:'2025-06-30'};
  expect(columnPeriod(half,ref({year:2024}),false)).toMatchObject({period_start:'2024-01-01',period_end:'2024-06-30',duration:'6M',rule:'title_year_substitution'});
  const bs={...title,duration:'INSTANT' as const};
  expect(columnPeriod(bs,ref(),true)).toMatchObject({period_start:null,period_end:'2025-12-31',duration:'INSTANT',rule:'title_instant'});
  expect(columnPeriod(bs,ref({year:2024}),true)).toMatchObject({period_start:null,period_end:'2024-12-31',rule:'title_year_substitution'});
  const interimBs={...bs,date:'2025-06-30'};
  expect(columnPeriod(interimBs,ref(),false)).toMatchObject({period_end:'2025-06-30',rule:'title_instant'});
  expect(columnPeriod(interimBs,ref({year:2024}),false)).toBe('interim_year_only');
  expect(columnPeriod(interimBs,ref({kind:'date',year:2024,date:'2024-12-31',text:'31 December 2024'}),false)).toMatchObject({period_end:'2024-12-31',rule:'column_date',column_text:'31 December 2024'});
  expect(columnPeriod(interimBs,ref({kind:'date',year:2025,date:'2025-06-30'}),false)).toMatchObject({rule:'title_instant'});
  expect(columnPeriod({...title,date:'2024-02-29'},ref({year:2023}),true)).toBe('invalid_date');
 });
});
