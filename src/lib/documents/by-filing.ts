// Public filing → document binding. The database selects exact candidates under caller RLS and
// the F3 as-of/version rule; hidden rows are indistinguishable from absent rows to anon.
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseDocumentsDb} from './db';
import type {DocumentRow,DocumentsDb} from './types';

export interface FilingBinding{filing_id:string;issuer_id:string;source:string;source_ref:string;available_date:string}
export type BindingDocument={documentId:string};
export type BindingResult={filingId:string;asOf:string;document:BindingDocument|null;reason?:'not_found'|'ambiguous'|'restricted'};

export function selectFilingDocument(filing:FilingBinding,rows:Pick<DocumentRow,'document_id'|'issuer_id'|'source'|'source_ref'|'filing_source_ref'|'permission'>[],asOf:string,linkedIds?:ReadonlySet<string>):BindingResult{
 const source=filing.source==='tushare'?'cninfo':filing.source==='hkex'?'hkexnews':filing.source;
 const matches=rows.filter(d=>d.issuer_id===filing.issuer_id&&d.source===source&&d.permission==='public'&&
  (source==='hkexnews'?linkedIds?.has(d.document_id)===true:d.filing_source_ref===filing.source_ref));
 if(matches.length===0)return {filingId:filing.filing_id,asOf,document:null,reason:'not_found'};
 if(matches.length>1)return {filingId:filing.filing_id,asOf,document:null,reason:'ambiguous'};
 return {filingId:filing.filing_id,asOf,document:{documentId:matches[0].document_id}};
}

interface PublicClient{from:(table:string)=>any}
export async function resolveFilingDocument(filingId:string,asOf=new Date().toISOString().slice(0,10),client:PublicClient=getAnonSupabase() as unknown as PublicClient,db:DocumentsDb=supabaseDocumentsDb(getAnonSupabase())):Promise<BindingResult|null>{
 const {data:filing,error}=await client.from('filings').select('filing_id,issuer_id,source,source_ref,available_date,mapping_gen').eq('filing_id',filingId).lte('available_date',asOf).gt('mapping_gen',0).maybeSingle();
 if(error)throw new Error(error.message);
 if(!filing)return null;
 const f=filing as FilingBinding;
 const rows=await db.documentsByFiling({filingId,issuerId:f.issuer_id,source:f.source,sourceRef:f.source_ref},asOf);
 // SQL already applied exact binding, permission and HK link under anon RLS. Recheck non-HK
 // binding here as a defense against a malformed adapter response.
 if(f.source==='hkex')return rows.length===0?{filingId,asOf,document:null,reason:'not_found'}:rows.length>1?{filingId,asOf,document:null,reason:'ambiguous'}:{filingId,asOf,document:{documentId:rows[0].document_id}};
 return selectFilingDocument(f,rows,asOf);
}
