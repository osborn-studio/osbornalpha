// Public filing → document binding. The database read_documents RPC performs as-of version
// selection under anon RLS; this module only applies the exact filing reference binding.
import {getAnonSupabase} from '@/lib/supabase/anon';
import {supabaseDocumentsDb} from './db';
import type {DocumentRow,DocumentsDb,DocSource} from './types';

export interface FilingBinding{filing_id:string;issuer_id:string;source:string;source_ref:string;available_date:string}
export type BindingDocument={documentId:string;source:string;sourceRef:string;sourceVersion:number;availableDate:string;pageCount?:number;integrity:'unverified';currentExtraction:string|null};
export type BindingResult={filingId:string;document:BindingDocument|null;reason?:'not_found'|'ambiguous'|'restricted'};

export function selectFilingDocument(filing:FilingBinding,rows:Pick<DocumentRow,'document_id'|'issuer_id'|'source'|'source_ref'|'source_version'|'filing_source_ref'|'available_date'|'permission'|'current_extraction_id'|'status'>[],linkedSourceRef?:string|null):BindingResult{
 const source=filing.source==='tushare'?'cninfo':filing.source;
 const matches=rows.filter(d=>d.issuer_id===filing.issuer_id&&d.source===source&&d.permission==='public'&&
  (linkedSourceRef?d.source_ref===linkedSourceRef:d.filing_source_ref===filing.source_ref));
 if(matches.length===0)return {filingId:filing.filing_id,document:null,reason:linkedSourceRef?'restricted':'not_found'};
 if(matches.length>1)return {filingId:filing.filing_id,document:null,reason:'ambiguous'};
 const d=matches[0];
 return {filingId:filing.filing_id,document:{documentId:d.document_id,source:d.source,sourceRef:d.source_ref,sourceVersion:d.source_version,
  availableDate:d.available_date,integrity:'unverified',currentExtraction:d.current_extraction_id}};
}

interface PublicClient{from:(table:string)=>any}
export async function resolveFilingDocument(filingId:string,asOf=new Date().toISOString().slice(0,10),client:PublicClient=getAnonSupabase() as unknown as PublicClient,db:DocumentsDb=supabaseDocumentsDb(getAnonSupabase())):Promise<BindingResult|null>{
 const {data:filing,error}=await client.from('filings').select('filing_id,issuer_id,source,source_ref,available_date').eq('filing_id',filingId).maybeSingle();
 if(error)throw new Error(error.message);
 if(!filing)return null;
 const f=filing as FilingBinding;
 const source=(f.source==='tushare'?'cninfo':f.source) as DocSource;
 let linkedSourceRef:string|null=null;
 if(source==='hkexnews'){
  const linked=await client.from('filing_documents').select('document_id').eq('filing_id',filingId).maybeSingle();
  if(linked.error)throw new Error(linked.error.message);
  if(linked.data?.document_id){
   const linkedDoc=await db.documentById(linked.data.document_id);
   if(!linkedDoc)return {filingId,document:null,reason:'restricted'};
   linkedSourceRef=linkedDoc.source_ref;
  }
 }
 const rows:DocumentRow[]=[];
 let cursor:string|null=null;
 do{
  const page=await db.readDocuments(f.issuer_id,{asOf,source,cursor,limit:1000});
  rows.push(...page.rows);
  cursor=page.nextCursor;
 }while(cursor);
 return selectFilingDocument(f,rows,linkedSourceRef);
}
