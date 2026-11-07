// Explicit eval-only F3 read boundary. The production DocumentsDb contract supplies all rows;
// callers select licensed gold themselves. This module is never registered with the F6 runner.
import {encodeCursor} from '@/lib/documents/db';
import {cpSlice,sha256Hex} from '@/lib/documents/extract/pages-json';
import type {CandidateRow,CitationRow,DocumentsDb,PageRow} from '@/lib/documents/types';
import type {BBox,ExtractionOutput,PredictedField} from './extraction';

export type F3Adapted=ExtractionOutput|{document_sha256:string;status:'excluded';reason:'permission'|'superseded'}|{document_sha256:string;status:'read_error';reason:string};
const error=(sha:string,reason:string):F3Adapted=>({document_sha256:sha,status:'read_error',reason});
const box=(c:CitationRow,p:PageRow):BBox|null=>{
 const b=c.bbox,h=p.height;
 if(!b||h===null||!Number.isFinite(h)||h<=0||![b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)||b.x0<0||b.y0<0||b.x0>=b.x1||b.y0>=b.y1||b.y1>h)return null;
 // F3 pdf.ts stores PDF user-space points from the bottom-left. F6 gold uses top-left points.
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
 if(!d||expectedSha&&d.content_sha256!==expectedSha)return error(sha,'missing_document');
 if(d.permission!=='public')return {document_sha256:sha,status:'excluded',reason:'permission'};
 const successor=await db.documentVersions(d.source,d.source_ref,{cursor:encodeCursor([d.source_version]),limit:1});
 if(successor.rows.length)return {document_sha256:sha,status:'excluded',reason:'superseded'};
 if(d.mime!=='application/pdf'||d.status!=='extracted'||!d.current_extraction_id)return error(sha,'missing_extraction');
 const ext=await db.extractionById(d.current_extraction_id);
 if(!ext||ext.document_id!==documentId||!ext.has_text_layer||!Number.isSafeInteger(ext.page_count)||ext.page_count<1)return error(sha,'missing_extraction');
 const pages:PageRow[]=[];
 for(let n=1;n<=ext.page_count;n+=100)pages.push(...await db.pagesOf(ext.extraction_id,Array.from({length:Math.min(100,ext.page_count-n+1)},(_,i)=>n+i)));
 const byNo=new Map(pages.map(p=>[p.page_no,p]));
 if(byNo.size!==ext.page_count||pages.some(p=>p.extraction_id!==ext.extraction_id||!Number.isFinite(p.height)||p.height===null||p.height<=0))return error(sha,'missing_page');
 const candidates:CandidateRow[]=[];let cursor:string|null=null;
 do{const batch=await db.candidatesOf({extractionId:ext.extraction_id},{cursor,limit:100});candidates.push(...batch.rows);cursor=batch.nextCursor;}while(cursor);
 const chosen=candidates.filter(c=>c.extraction_id===ext.extraction_id&&c.document_id===documentId&&c.status!=='rejected'&&valueOf(c));
 const ids=chosen.map(c=>(c.citations as {value?:unknown}).value);
 if(ids.some(id=>typeof id!=='string'))return error(sha,'missing_citation');
 const cites:CitationRow[]=[];
 for(let n=0;n<ids.length;n+=100)cites.push(...await db.citationsByIds(ids.slice(n,n+100) as string[]));
 const byId=new Map(cites.map(c=>[c.citation_id,c]));const fields:PredictedField[]=[];
 for(const candidate of chosen){
  const v=valueOf(candidate)!;const id=(candidate.citations as {value:string}).value,c=byId.get(id),page=c&&byNo.get(c.page_no);
  if(!c||!page||c.document_id!==documentId||c.extraction_id!==ext.extraction_id||!Number.isSafeInteger(c.page_no)||c.page_no<1||c.page_no>ext.page_count||c.text_hash!==page.text_hash||sha256Hex(page.text)!==page.text_hash||cpSlice(page.text,c.char_start,c.char_end)!==c.snippet)return error(sha,'invalid_citation');
  const bbox=box(c,page);if(!bbox)return error(sha,'missing_bbox');
  fields.push({field:v.field,value:v.value,page:c.page_no,bbox});
 }
 return {document_sha256:sha,status:'parsed',fields};
}
/** Excluded documents are omitted; read errors become F6 unparseable outputs, so one bad gold document marks every field read_error. */
export function toExtractionOutput(row:F3Adapted):ExtractionOutput|null{
 return row.status==='excluded'?null:row.status==='read_error'?{document_sha256:row.document_sha256,status:'unparseable',error:row.reason}:row;
}
