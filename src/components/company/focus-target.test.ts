import {describe,it,expect} from 'vitest';
import {parseFocus,focusStatement,focusKey,resolveFocusOpen} from './focus-target';
import type {StatementsResponse} from '@/lib/company/client';

const ID='123e4567-e89b-42d3-a456-426614174000';
describe('parseFocus',()=>{
 it('accepts a known concept with a real period end and optional unit / fact id',()=>{
  expect(parseFocus({concept:'revenue',periodEnd:'2024-12-31',unit:'USD',factId:ID})).toEqual({concept:'revenue',periodEnd:'2024-12-31',unit:'USD',factId:ID});
  expect(parseFocus({concept:'revenue',periodEnd:'2024-12-31'})).toEqual({concept:'revenue',periodEnd:'2024-12-31',unit:null,factId:null});
 });
 it('drops invalid parts: unknown concept, impossible date, long unit, non-UUID fact id, arrays',()=>{
  expect(parseFocus({concept:'nope',periodEnd:'2024-12-31'})).toBeNull();
  expect(parseFocus({concept:'revenue',periodEnd:'2024-02-30'})).toBeNull();
  expect(parseFocus({concept:'revenue',periodEnd:'2024-12-31',unit:'x'.repeat(33)})?.unit).toBeNull();
  expect(parseFocus({concept:'revenue',periodEnd:'2024-12-31',factId:'zz'})?.factId).toBeNull();
  expect(parseFocus({concept:['revenue','cash'],periodEnd:'2024-12-31'})).toBeNull();
  expect(parseFocus({factId:ID})).toEqual({concept:null,periodEnd:null,unit:null,factId:ID});
  expect(parseFocus({})).toBeNull();
 });
});
describe('focusStatement',()=>{
 it('maps concepts to their statement, DEI to BS, no focus to IS',()=>{
  expect(focusStatement(null)).toBe('IS');
  expect(focusStatement(parseFocus({concept:'revenue',periodEnd:'2024-12-31'}))).toBe('IS');
  expect(focusStatement(parseFocus({concept:'cash',periodEnd:'2024-12-31'}))).toBe('BS');
  expect(focusStatement(parseFocus({concept:'operating_cash_flow',periodEnd:'2024-12-31'}))).toBe('CF');
  expect(focusStatement(parseFocus({concept:'shares_outstanding',periodEnd:'2024-12-31'}))).toBe('BS');
 });
});
const K='2024-01-01:2024-12-31:12M';
const grid=(statement:'IS'|'BS',unit='USD'):StatementsResponse=>({issuerId:'i',ticker:'AAPL',market:'US',asOf:'2026-11-06',otherUnitOnly:{},otherUnitsAlso:{},mappingGen:1,stateRev:1,truncated:false,statement,basis:'disclosed',
 periods:[{key:K,periodStart:'2024-01-01',periodEnd:'2024-12-31',duration:'12M'}],
 rows:[{concept:'revenue',unit,unitKind:'money',sourceConcepts:[],notes:null,cells:{[K]:{kind:'fact',factId:'f',value:'1',unit,availableDate:'2025-01-01',filingId:'g',disclosureSeq:1,isRevision:false,mappingGen:1,rawHash:'h',runId:'r',otherUnits:false}}}],
 filings:{},evidence:{},withheld:{evidenceIncomplete:0,citationPending:0}});
describe('resolveFocusOpen',()=>{
 const f=parseFocus({concept:'revenue',periodEnd:'2024-12-31',unit:'USD'})!;
 it('opens the history of the matching grid cell; factId wins and uses the by-fact drawer',()=>{
  expect(resolveFocusOpen(f,grid('IS'),6)).toMatchObject({kind:'history',key:{concept:'revenue',periodStart:'2024-01-01',periodEnd:'2024-12-31',unit:'USD'},duration:'12M',scaleExp:6});
  expect(resolveFocusOpen({...f,factId:ID},grid('IS'),6)).toEqual({kind:'historyByFact',factId:ID,scaleExp:6});
 });
 it('opens nothing for another statement, another unit, a missing period, or a truncated grid',()=>{
  expect(resolveFocusOpen(f,grid('BS'),6)).toBeNull();
  expect(resolveFocusOpen({...f,unit:'EUR'},grid('IS'),6)).toBeNull();
  expect(resolveFocusOpen({...f,periodEnd:'2023-12-31'},grid('IS'),6)).toBeNull();
  expect(resolveFocusOpen(f,{...grid('IS'),truncated:true},6)).toBeNull();
 });
 it('keys a navigation by all four parts',()=>{expect(focusKey(f)).toBe('revenue|2024-12-31|USD|');});
});
