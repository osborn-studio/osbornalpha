// Filing identity and public visibility are resolved inside read_documents_by_filing under caller RLS.
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseDocumentsDb} from './db';
import type {DocumentRow,DocumentsDb} from './types';

/** Every value of filings_source_check, mirrored by the SQL CASE and checked in by-filing.test.ts. */
export const FILING_DOCUMENT_SOURCES={edgar:'edgar',tushare:'cninfo',hkex:'hkexnews'} as const;
export type BindingDocument={documentId:string;issuerId:string;source:string;sourceRef:string;sourceVersion:number;availableDate:string;currentExtractionId:string|null};
export type BindingResult={filingId:string;asOf:string;document:BindingDocument|null;reason?:'not_found'|'ambiguous'|'restricted'};

function bindingOf(r:DocumentRow):BindingDocument{
 return {documentId:r.document_id,issuerId:r.issuer_id!,source:r.source,sourceRef:r.source_ref,sourceVersion:r.source_version,availableDate:r.available_date,currentExtractionId:r.current_extraction_id};
}
export async function resolveFilingDocument(filingId:string,asOf=new Date().toISOString().slice(0,10),db:DocumentsDb=supabaseDocumentsDb(getAnonSupabase())):Promise<BindingResult|null>{
 const result=await db.documentsByFiling({filingId},asOf);
 if(!result.filingFound)return null;
 if(result.rows.length===0)return {filingId,asOf,document:null,reason:'not_found'};
 if(result.rows.length>1)return {filingId,asOf,document:null,reason:'ambiguous'};
 return {filingId,asOf,document:bindingOf(result.rows[0])};
}
