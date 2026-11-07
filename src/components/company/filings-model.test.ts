import {describe,it,expect} from 'vitest';
import {typeLabel,fiscalLabel,citationBadge,originalHref,LINK_FAILED_ATTEMPTS} from './filings-model';
import type {FilingSummary} from '@/lib/company/types';

const f=(o:Partial<FilingSummary>):FilingSummary=>({filingId:'g',formType:'annual',fiscalYear:2024,fiscalPeriod:'FY',periodEnd:'2024-12-31',availableDate:'2025-04-03',sourceRef:'r',source:'tushare',url:null,documentUrl:null,citation:'pending',linkAttempts:0,factCount:418,mappingGen:1,...o});
describe('filings model',()=>{
 it('labels CN form types and keeps US forms verbatim',()=>{
  expect(typeLabel(f({formType:'semiannual'}),'CN')).toEqual({key:'semiannual'});
  expect(typeLabel(f({formType:'restatement'}),'CN')).toEqual({key:'restatement'});
  expect(typeLabel(f({formType:'weird' as FilingSummary['formType']}),'CN')).toEqual({key:'other'});
  expect(typeLabel(f({formType:'10-K',source:'edgar'}),'US')).toEqual({text:'10-K'});
  expect(fiscalLabel(f({fiscalYear:2025,fiscalPeriod:'Q3'}))).toBe('2025 Q3');
  expect(fiscalLabel(f({fiscalYear:null,fiscalPeriod:null}))).toBe('—');
 });
 it('maps citation to the badge, failing after 5 attempts',()=>{
  expect(LINK_FAILED_ATTEMPTS).toBe(5);
  expect(citationBadge(f({citation:'edgar',source:'edgar',url:'https://sec/x'}))).toEqual({kind:'edgar',href:'https://sec/x'});
  expect(citationBadge(f({citation:'linked',documentUrl:'https://cninfo/x.pdf'}))).toEqual({kind:'linked',href:'https://cninfo/x.pdf'});
  expect(citationBadge(f({citation:'pending',linkAttempts:4}))).toEqual({kind:'pending'});
  expect(citationBadge(f({citation:'pending',linkAttempts:5}))).toEqual({kind:'failed',attempts:5});
 });
 it('opens the original only when a URL exists, preferring the document',()=>{
  expect(originalHref(f({citation:'linked',documentUrl:'https://cninfo/x.pdf',url:'https://cninfo/notice'}))).toBe('https://cninfo/x.pdf');
  expect(originalHref(f({citation:'edgar',url:'https://sec/x'}))).toBe('https://sec/x');
  expect(originalHref(f({citation:'pending'}))).toBeNull();
 });
});
