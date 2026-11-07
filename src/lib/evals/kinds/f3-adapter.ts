// Explicit eval-only F3 read boundary. The production DocumentsDb contract supplies all rows;
// callers select licensed gold themselves. This module is never registered with the F6 runner.
import {encodeCursor} from '@/lib/documents/db';
import {integrityOf} from '@/lib/documents/citations';
import {cpLength} from '@/lib/documents/extract/pages-json';
import type {CandidateRow,CitationRow,DocumentsDb,PageRow} from '@/lib/documents/types';
import type {BBox,ExtractionOutput,PredictedField} from './extraction';

export type F3Adapted=ExtractionOutput|{document_sha256:string;status:'excluded';reason:'permission'|'superseded'}|{document_sha256:string;status:'read_error';reason:string};
const error=(sha:string,reason:string):F3Adapted=>({document_sha256:sha,status:'read_error',reason});
const box=(c:CitationRow,p:PageRow):BBox|null=>{
 const b=c.bbox,h=p.height,w=p.width;
 if(!b||h===null||w===null||!Number.isFinite(h)||!Number.isFinite(w)||h<=0||w<=0||![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)||b.x0<0||b.y0<0||b.x0>=b.x1||b.y0>=b.y1||b.x1>w||b.y1>h)return null;
 // F3 extract/pdf.ts records pdf.js page.view PDF user-space points with a bottom-left origin; F6 gold uses top-left points.
 return [b.x0,h-b.y1,b.x1,h-b.y0];
};
const valueOf=(c:CandidateRow):{field:string;value:string}|null=>{
 if(c.kind!=='financial_fact'&&c.kind!=='field')return null;
 const p=c.payload as Record<string,unknown>;
 const field=c.kind==='financial_fact'?p.concept:p.field;
 return typeof field==='string'&&field!==''&&typeof p.value==='string'?{field,value:p.value}:null;
};

/** A missing/corrupt document or citation makes the entire document unreadable; no field is guessed. */
export async function adaptF3Document(db:Pick<DocumentsDb,'documentById'|'documentVersions'|'extractionById'|'pagesOf'|'candidatesOf'|'citationsByIds'>,documentId:string,expectedSha?:string):Promise<F3Adapted>{
 const d=await db.documentById(documentId);
 const sha=d?.content_sha256??expectedSha;
 if(!sha)throw new Error('document_sha256_required');
 if(!d||d.document_id!==documentId||expectedSha&&d.content_sha256!==expectedSha)return error(sha,'missing_document');
 if(d.permission!=='public')return {document_sha256:sha,status:'excluded',reason:'permission'};
 const successor=await db.documentVersions(d.source,d.source_ref,{cursor:encodeCursor([d.source_version]),limit:1});
 // read_documents partitions by issuer (query scope), source, and source_ref, then selects the highest visible version.
 if(successor.rows.some(s=>s.issuer_id===d.issuer_id&&s.source===d.source&&s.source_ref===d.source_ref&&s.source_version>d.source_version))return {document_sha256:sha,status:'excluded',reason:'superseded'};
 if(d.mime!=='application/pdf'||!d.current_extraction_id)return error(sha,'missing_extraction');
 const ext=await db.extractionById(d.current_extraction_id);
 if(!ext||ext.extraction_id!==d.current_extraction_id||ext.document_id!==documentId||!ext.has_text_layer||!Number.isSafeInteger(ext.page_count)||ext.page_count<1)return error(sha,'missing_extraction');
 const pages:PageRow[]=[];
 for(let n=1;n<=ext.page_count;n+=100)pages.push(...await db.pagesOf(ext.extraction_id,Array.from({length:Math.min(100,ext.page_count-n+1)},(_,i)=>n+i)));
 const byNo=new Map(pages.map(p=>[p.page_no,p]));
 if(pages.length!==ext.page_count||byNo.size!==ext.page_count||pages.some(p=>p.extraction_id!==ext.extraction_id||!Number.isSafeInteger(p.page_no)||p.page_no<1||p.page_no>ext.page_count||!Number.isFinite(p.height)||p.height===null||p.height<=0))return error(sha,'missing_page');
 const candidates:CandidateRow[]=[];let cursor:string|null=null;const seen=new Set<string>();
 for(let n=0;n<1000;n++){
  const batch=await db.candidatesOf({extractionId:ext.extraction_id},{cursor,limit:100});candidates.push(...batch.rows);
  if(!batch.nextCursor)break;
  if(batch.nextCursor===cursor||seen.has(batch.nextCursor)||n===999)return error(sha,'candidate_pagination');
  seen.add(batch.nextCursor);cursor=batch.nextCursor;
 }
 // F3 publication and promotion accept confirmed|promoted; candidate and rejected are unsettled/unusable.
 const chosen=candidates.filter(c=>c.extraction_id===ext.extraction_id&&c.document_id===documentId&&(c.status==='confirmed'||c.status==='promoted')&&valueOf(c));
 const ids=chosen.map(c=>(c.citations as {value?:unknown}).value);
 if(ids.some(id=>typeof id!=='string'))return error(sha,'missing_citation');
 const cites:CitationRow[]=[];
 for(let n=0;n<ids.length;n+=100)cites.push(...await db.citationsByIds(ids.slice(n,n+100) as string[]));
 const byId=new Map(cites.map(c=>[c.citation_id,c]));const fields:PredictedField[]=[];
 for(const candidate of chosen){
  const v=valueOf(candidate)!;const id=(candidate.citations as {value:string}).value,c=byId.get(id),page=c&&byNo.get(c.page_no);
  if(!c||!page||c.document_id!==documentId||c.extraction_id!==ext.extraction_id||!Number.isSafeInteger(c.page_no)||c.page_no<1||c.page_no>ext.page_count||!Number.isSafeInteger(c.char_start)||!Number.isSafeInteger(c.char_end)||c.char_start<0||c.char_start>=c.char_end||c.char_end>cpLength(page.text)||!c.snippet.trim()||integrityOf(page,c)!=='ok')return error(sha,'invalid_citation');
  const bbox=box(c,page);if(!bbox)return error(sha,'missing_bbox');
  fields.push({field:v.field,value:v.value,page:c.page_no,bbox});
 }
 return {document_sha256:sha,status:'parsed',fields};
}
/** Excluded documents are omitted; read errors become F6 unparseable outputs, so one bad gold document marks every field read_error. */
export function toExtractionOutput(row:F3Adapted):ExtractionOutput|null{
 return row.status==='excluded'?null:row.status==='read_error'?{document_sha256:row.document_sha256,status:'unparseable',error:row.reason}:row;
}
