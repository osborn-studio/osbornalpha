import {describe,expect,it} from 'vitest';
import {memoryDocumentsDb} from './memory-documents-db';
import type {DocumentRow} from './types';
const filing={filingId:'f',issuerId:'i',source:'edgar' as const,sourceRef:'accn',availableDate:'2026-02-01',mappingGen:2};
const row=(id:string,version:number,ref='accn')=>({document_id:id,issuer_id:'i',source:'edgar',source_ref:'accn/main',filing_source_ref:ref,source_version:version,available_date:'2026-03-01',available_at:`2026-03-0${version}T00:00:00Z`,permission:'public'}) as DocumentRow;
describe('memory filing selector',()=>{
 it('binds before ranking versions with the SQL source key',async()=>{
  const db=memoryDocumentsDb({filings:[filing]});
  db._raw.documents.set('v1',row('v1',1));db._raw.documents.set('v2',row('v2',2,'other'));
  expect((await db.documentsByFiling({filingId:'f'},'2026-04-01')).rows.map(d=>d.document_id)).toEqual(['v1']);
 });
 it('uses published generation and as-of visibility and hides private metadata',async()=>{
  const db=memoryDocumentsDb({filings:[filing]});
  db._raw.documents.set('private',{...row('private',1),permission:'private'});
  expect(await db.documentsByFiling({filingId:'f'},'2026-01-01')).toEqual({filingFound:false,rows:[]});
  expect(await db.documentsByFiling({filingId:'f'},'2026-04-01')).toEqual({filingFound:true,rows:[]});
 });
 it('does not let an RLS-hidden private version mask a public bound version',async()=>{
  const db=memoryDocumentsDb({filings:[filing]});
  db._raw.documents.set('public',row('public',1));
  db._raw.documents.set('private',{...row('private',2),permission:'private'});
  expect((await db.documentsByFiling({filingId:'f'},'2026-04-01')).rows.map(d=>d.document_id)).toEqual(['public']);
 });
});
