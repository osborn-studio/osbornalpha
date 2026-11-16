import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {PagesJson} from '../types';
import {cpIndex,cpSlice,locateStatements,matchesIn,titleRegion} from './locate';

const fixture=(name:string)=>JSON.parse(readFileSync(`src/lib/documents/fixtures/hkex/_synthetic/${name}.json`,'utf8')) as PagesJson;

describe('code-point helpers',()=>{
 it('convert UTF-16 indexes to code points and slice by code points',()=>{
  const s='😀𠀋 綜合損益表';
  expect(cpIndex(s,5)).toBe(3);                                        // '綜' sits after two surrogate pairs and a space
  expect(cpSlice(s,3,5)).toBe('綜合');
  expect(matchesIn(s,/損益表/)).toEqual([{text:'損益表',start:5,end:8,groups:[]}]);
  expect(matchesIn(s,/(綜)(合)/g).map(m=>m.groups)).toEqual([['綜','合']]);
 });
});

describe('locateStatements (spec §7.5 step 1)',()=>{
 it('finds the three statements of the annual fixture and ignores the notes page',()=>{
  const r=locateStatements(fixture('annual-zh'));
  expect(r.info).toEqual([]);
  expect(r.statements.map(s=>[s.statement,s.pages.map(p=>p.page_no),s.title.page_no,s.title.line.text,s.consolidated])).toEqual([
   ['IS',[3],3,'綜合損益表',true],['BS',[4],4,'綜合財務狀況表',true],['CF',[5],5,'綜合現金流量表',true]]);
 });
 it('reads English titles; a statement that is not there is simply missing',()=>{
  const r=locateStatements(fixture('interim-en'));
  expect(r.info).toEqual([]);
  expect(r.statements.map(s=>[s.statement,s.pages.map(p=>p.page_no)])).toEqual([['IS',[2]],['BS',[3]]]);
 });
 it('not consolidated and non-consecutive pages produce info and no statement',()=>{
  const r=locateStatements(fixture('edge-cases'));
  expect(r.statements.map(s=>s.statement)).toEqual(['BS']);
  expect(r.info).toEqual([{code:'not_consolidated',detail:'IS:p1'},{code:'locate_ambiguous',detail:'CF:3,5'}]);
 });
 it('bilingual interim (0268-shaped): titles in either script with 簡明/中期 and Condensed/Interim; the separate comprehensive-income statement is not the IS',()=>{
  const r=locateStatements(fixture('interim-bilingual'));
  expect(r.info).toEqual([]);
  expect(r.statements.map(s=>[s.statement,s.pages.map(p=>p.page_no),s.title.line.text])).toEqual([
   ['IS',[45],'CONDENSED CONSOLIDATED INTERIM INCOME STATEMENT'],['BS',[44],'CONDENSED CONSOLIDATED INTERIM STATEMENT OF FINANCIAL POSITION'],['CF',[47],'CONDENSED CONSOLIDATED INTERIM CASH FLOW STATEMENT']]);
 });
 it('a combined profit-or-loss and comprehensive-income statement is used when no plain income statement exists',()=>{
  const json=fixture('interim-bilingual');
  const only={...json,pages:json.pages.filter(p=>p.page_no!==45)};
  expect(locateStatements(only).statements.find(s=>s.statement==='IS')?.pages.map(p=>p.page_no)).toEqual([46]);
  const zhOnly={...only,pages:only.pages.map(p=>p.page_no!==46?p:{...p,lines:p.lines.map(l=>l.index===0?{...l,text:'綜合損益及其他全面收益表'}:l)})};
  expect(locateStatements(zhOnly).statements.find(s=>s.statement==='IS')?.title.line.text).toBe('綜合損益及其他全面收益表');
 });
 it('the title region is every line above the first table body row',()=>{
  const p=fixture('annual-zh').pages.find(x=>x.page_no===3)!;
  expect(titleRegion(p).map(l=>l.text)).toEqual(['綜合損益表','截至二零二五年十二月三十一日止年度','附註 二零二五年 二零二四年','人民幣千元 人民幣千元']);
  expect(titleRegion({...p,tables:[]})).toEqual([]);
 });
});
