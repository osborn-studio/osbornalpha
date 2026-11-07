import {describe,expect,it} from 'vitest';
import {selectFilingDocument} from './by-filing';
import type {DocumentRow} from './types';

const filing={filing_id:'f',issuer_id:'i',source:'edgar',source_ref:'accn',available_date:'2026-04-01'};
const doc=(id:string,sourceRef='accn/main',filingRef='accn',permission:'public'|'private'='public'):Pick<DocumentRow,'document_id'|'issuer_id'|'source'|'source_ref'|'filing_source_ref'|'permission'>=>({document_id:id,issuer_id:'i',source:'edgar',source_ref:sourceRef,filing_source_ref:filingRef,permission});
const asOf='2026-04-01';

describe('filing document selector',()=>{
 it('requires the exact filing reference and issuer even when source refs differ',()=>{
  expect(selectFilingDocument(filing,[doc('wrong','accn','other'),{...doc('wrong-issuer'),issuer_id:'j'},doc('right')],asOf).document).toEqual({documentId:'right'});
 });
 it('reports independent matches as ambiguous',()=>{
  expect(selectFilingDocument(filing,[doc('a'),doc('b','accn/attachment')],asOf)).toEqual({filingId:'f',asOf,document:null,reason:'ambiguous'});
 });
 it('does not expose a restricted row to anon',()=>{
  expect(selectFilingDocument(filing,[doc('private','accn/main','accn','private')],asOf)).toEqual({filingId:'f',asOf,document:null,reason:'not_found'});
  expect(selectFilingDocument(filing,[doc('public')],asOf).document).toEqual({documentId:'public'});
 });
 it('uses the HK link and landed hkex → hkexnews source mapping',()=>{
  const hk={...filing,source:'hkex',source_ref:'hkex:notice:v1'};
  const row={...doc('hk','notice','irrelevant'),source:'hkexnews'};
  expect(selectFilingDocument(hk,[row],asOf,new Set(['hk'])).document).toEqual({documentId:'hk'});
  expect(selectFilingDocument(hk,[row],asOf,new Set())).toMatchObject({document:null,reason:'not_found'});
 });
});
