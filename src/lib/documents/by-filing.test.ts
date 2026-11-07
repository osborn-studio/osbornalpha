import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {FILING_DOCUMENT_SOURCES,resolveFilingDocument} from './by-filing';
import type {DocumentsDb,DocumentRow} from './types';

const filingId='11111111-1111-4111-8111-111111111111';
const asOf='2026-04-01';
const row={document_id:'doc',issuer_id:'issuer',source:'edgar',source_ref:'accn/main',source_version:2,available_date:asOf,current_extraction_id:null,permission:'public'} as DocumentRow;
const db=(filingFound:boolean,rows:DocumentRow[]=[])=>({documentsByFiling:vi.fn().mockResolvedValue({filingFound,rows})}) as unknown as DocumentsDb;

describe('filing document resolver',()=>{
 it('uses the database filing visibility decision and returns actual binding fields',async()=>{
  const database=db(true,[row]);
  expect(await resolveFilingDocument(filingId,asOf,database)).toEqual({filingId,asOf,document:{documentId:'doc',issuerId:'issuer',source:'edgar',sourceRef:'accn/main',sourceVersion:2,availableDate:asOf,currentExtractionId:null}});
  expect(database.documentsByFiling).toHaveBeenCalledWith({filingId},asOf);
 });
 it('distinguishes an invisible filing from no public document and ambiguity',async()=>{
  expect(await resolveFilingDocument(filingId,asOf,db(false))).toBeNull();
  expect(await resolveFilingDocument(filingId,asOf,db(true))).toMatchObject({document:null,reason:'not_found'});
  expect(await resolveFilingDocument(filingId,asOf,db(true,[row,{...row,document_id:'other'}]))).toMatchObject({document:null,reason:'ambiguous'});
 });
 it('keeps the TypeScript source map aligned with the SQL CASE and filing CHECK',()=>{
  const sql=readFileSync('supabase/migrations/20261118093000_documents_by_filing.sql','utf8');
  for(const [filing,document] of Object.entries(FILING_DOCUMENT_SOURCES))expect(sql).toContain(`when '${filing}' then '${document}'`);
  const check=readFileSync('supabase/migrations/20261117091000_fact_citations.sql','utf8');
  for(const filing of Object.keys(FILING_DOCUMENT_SOURCES))expect(check).toContain(`'${filing}'`);
 });
});
