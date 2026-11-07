// src/lib/entities/identifiers/gleif.test.ts
import {describe,it,expect} from 'vitest';
import {GLEIF_HEADER,filterGleifLines,parseGleifCsv,subsetForLeis} from './gleif';

const APPLE='HWUPKR0MPOU8FGXBT394',MSFT='INR2EJN1ERAN0W5ZP974',ABSENT='5493001KJTIIGC8Y1R12';
// US037833AK68 is an Apple bond ISIN: stage A keeps it (type judged in stage B). US0378331006 has a bad check digit.
const LINES=[GLEIF_HEADER,`${MSFT},US5949181045`,`${APPLE},US0378331005`,`${APPLE},US037833AK68`,`${APPLE},US0378331005`,'ZZZZZZZZZZZZZZZZZZ00,US88160R1014',`${MSFT},US0378331006`];
async function* stream(xs:string[]){for(const x of xs)yield x;}

describe('subsetForLeis',()=>{
 it('keeps wanted LEIs, dedupes, keeps bond ISINs, drops bad check digits and lists LEIs without ISINs',()=>{
  const s=subsetForLeis(LINES,new Set([APPLE,MSFT,ABSENT]));
  expect([...s.byLei]).toEqual([[APPLE,['US0378331005','US037833AK68']],[MSFT,['US5949181045']]]);
  expect(s.missing).toEqual([ABSENT]);
  expect(s.invalidIsins).toEqual([`${MSFT},US0378331006`]);
  expect(s.csv).toBe(`LEI,ISIN\n${APPLE},US0378331005\n${APPLE},US037833AK68\n${MSFT},US5949181045\n`);
  expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
 });
 it('is order independent: a shuffled input gives the same subset bytes and hash',()=>{
  const a=subsetForLeis(LINES,new Set([APPLE,MSFT]));
  const b=subsetForLeis([LINES[0],...LINES.slice(1).reverse()],new Set([MSFT,APPLE]));
  expect(b.csv).toBe(a.csv);expect(b.sha256).toBe(a.sha256);
 });
 it('reports a LEI in missing when every one of its ISINs fails the check digit',()=>{
  const s=subsetForLeis([GLEIF_HEADER,`${APPLE},US0378331006`,`${APPLE},US5949181046`,`${MSFT},US5949181045`],new Set([APPLE,MSFT]));
  expect([...s.byLei.keys()]).toEqual([MSFT]);
  expect(s.missing).toEqual([APPLE]);
  expect(s.invalidIsins).toEqual([`${APPLE},US0378331006`,`${APPLE},US5949181046`]);
  expect(s.csv).toBe(`LEI,ISIN\n${MSFT},US5949181045\n`);
 });
 it('rejects a wrong header with invalid_schema',()=>{
  expect(()=>subsetForLeis(['LEI;ISIN',`${APPLE};US0378331005`],new Set([APPLE]))).toThrow('invalid_schema');
  expect(()=>subsetForLeis([],new Set([APPLE]))).toThrow('invalid_schema');
 });
 it('replays a stored subset with parseGleifCsv',()=>{
  const s=subsetForLeis(LINES,new Set([APPLE,MSFT]));
  expect([...parseGleifCsv(s.csv)]).toEqual([...s.byLei]);
  expect(()=>parseGleifCsv('LEI,ISIN\nnocomma\n')).toThrow('invalid_schema');
 });
});

describe('filterGleifLines',()=>{
 it('strips a BOM and CR, keeps the header and the wanted lines only',async()=>{
  const out:string[]=[];
  for await(const l of filterGleifLines(stream([`﻿${GLEIF_HEADER}\r`,`${APPLE},US0378331005\r`,'OTHER,US5949181045\r']),new Set([APPLE])))out.push(l);
  expect(out).toEqual([GLEIF_HEADER,`${APPLE},US0378331005`]);
 });
});
