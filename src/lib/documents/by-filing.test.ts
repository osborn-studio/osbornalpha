import {describe,expect,it} from 'vitest';
import {selectFilingDocument} from './by-filing';
import type {DocumentRow} from './types';

const filing={filing_id:'f',issuer_id:'i',source:'edgar',source_ref:'accn',available_date:'2026-04-01'};
const doc=(id:string,sourceRef='accn/main',version=1,filingRef='accn'):Pick<DocumentRow,'document_id'|'issuer_id'|'source'|'source_ref'|'source_version'|'filing_source_ref'|'available_date'|'permission'|'current_extraction_id'|'status'>=>({document_id:id,issuer_id:'i',source:'edgar',source_ref:sourceRef,source_version:version,filing_source_ref:filingRef,available_date:'2026-04-01',permission:'public',current_extraction_id:null,status:'stored'});

describe('filing document selector',()=>{
 it('requires the exact filing reference and issuer',()=>{
  expect(selectFilingDocument(filing,[doc('other','other/main',1,'other'),{...doc('wrong-issuer'),issuer_id:'j'},doc('right')]).document?.documentId).toBe('right');
 });
 it('uses the as-of selected version and reports independent matches as ambiguous',()=>{
  expect(selectFilingDocument(filing,[doc('v2','accn/main',2)]).document?.sourceVersion).toBe(2);
  expect(selectFilingDocument(filing,[doc('a'),doc('b','accn/attachment')])).toEqual({filingId:'f',document:null,reason:'ambiguous'});
 });
 it('does not expose a restricted document',()=>{
  expect(selectFilingDocument(filing,[])).toEqual({filingId:'f',document:null,reason:'not_found'});
 });
});
