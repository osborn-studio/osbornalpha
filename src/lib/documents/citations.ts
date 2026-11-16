// src/lib/documents/citations.ts
// Citations (spec §4.5, §7.4): cite() reads the cited extraction's page, takes the code-point slice
// [char_start, char_end) as the snippet (empty/whitespace-only or out of range → invalid_citation),
// records the page's text_hash and inserts through insert_citation (which re-checks both). verify()
// recomputes integrity against the immutable page row: 'ok' iff sha256(page text) equals the recorded
// text_hash and the code-point slice equals the snippet; currentExtraction = the citation's
// extraction is the document's current one. citationView() is the GET /api/citations/[id] body; it
// returns null when the document is not visible through `db` (anon RLS) so callers answer 404.
// Convention: cite before you publish a number (the citation id travels with the number).
import {DocumentsDbError} from './types';
import type {CitationCreator,CitationRow,DocumentRow,DocumentsDb,PageRow} from './types';
import {cpLength,cpSlice,sha256Hex} from './extract/pages-json';

export interface CiteInput{document_id:string;extraction_id:string;page_no:number;char_start:number;char_end:number;bbox?:{x0:number;y0:number;x1:number;y1:number}|null;created_by:CitationCreator;created_ref:string}
export interface Verification{integrity:'ok'|'corrupt';currentExtraction:boolean}
export interface CitationView{
 citationId:string;documentId:string;extractionId:string;pageNo:number;charStart:number;charEnd:number;bbox:CitationRow['bbox'];snippet:string;textHash:string;
 integrity:'ok'|'corrupt';currentExtraction:boolean;createdBy:CitationCreator;createdRef:string;
 document:{title:string;sourceUrl:string|null;publishedAt:string;availableAt:string;docClass:DocumentRow['doc_class'];language:DocumentRow['language']};
}

const invalid=(why:string)=>new DocumentsDbError('invalid_citation',`invalid_citation:${why}`);
const isOffset=(n:unknown):n is number=>Number.isSafeInteger(n)&&(n as number)>=0;

export async function cite(db:Pick<DocumentsDb,'extractionById'|'pagesOf'|'insertCitation'>,input:CiteInput):Promise<string>{
 if(!isOffset(input.char_start)||!isOffset(input.char_end)||input.char_end<=input.char_start)throw invalid('range');
 if(!Number.isSafeInteger(input.page_no)||input.page_no<1)throw invalid('page_no');
 if(typeof input.created_ref!=='string'||input.created_ref.length===0)throw invalid('created_ref');
 const extraction=await db.extractionById(input.extraction_id);
 if(!extraction||extraction.document_id!==input.document_id)throw invalid('extraction');
 const [page]=await db.pagesOf(input.extraction_id,[input.page_no]);
 if(!page)throw invalid('page');
 if(input.char_end>cpLength(page.text))throw invalid('range');
 const snippet=cpSlice(page.text,input.char_start,input.char_end);
 if(snippet.trim()==='')throw invalid('empty');
 return db.insertCitation({document_id:input.document_id,extraction_id:input.extraction_id,page_no:input.page_no,char_start:input.char_start,char_end:input.char_end,
  bbox:input.bbox??null,snippet,text_hash:page.text_hash,created_by:input.created_by,created_ref:input.created_ref});
}

/** Integrity of one citation against its page row (null page = corrupt: pages are never deleted). */
export function integrityOf(page:PageRow|undefined,c:CitationRow):'ok'|'corrupt'{
 if(!page)return 'corrupt';
 return sha256Hex(page.text)===c.text_hash&&page.text_hash===c.text_hash&&cpSlice(page.text,c.char_start,c.char_end)===c.snippet?'ok':'corrupt';
}

export async function verify(db:Pick<DocumentsDb,'citationById'|'pagesOf'|'documentById'>,citationId:string):Promise<Verification|null>{
 const c=await db.citationById(citationId);
 if(!c)return null;
 const [[page],doc]=await Promise.all([db.pagesOf(c.extraction_id,[c.page_no]),db.documentById(c.document_id)]);
 return {integrity:integrityOf(page,c),currentExtraction:doc?.current_extraction_id===c.extraction_id};
}

export async function citationView(db:Pick<DocumentsDb,'pagesOf'|'documentById'>,c:CitationRow):Promise<CitationView|null>{
 const [[page],doc]=await Promise.all([db.pagesOf(c.extraction_id,[c.page_no]),db.documentById(c.document_id)]);
 if(!doc)return null;
 return {citationId:c.citation_id,documentId:c.document_id,extractionId:c.extraction_id,pageNo:c.page_no,charStart:c.char_start,charEnd:c.char_end,bbox:c.bbox,snippet:c.snippet,textHash:c.text_hash,
  integrity:integrityOf(page,c),currentExtraction:doc.current_extraction_id===c.extraction_id,createdBy:c.created_by,createdRef:c.created_ref,
  document:{title:doc.title,sourceUrl:doc.source_url,publishedAt:doc.published_at,availableAt:doc.available_at,docClass:doc.doc_class,language:doc.language}};
}

/** The anon route's public citation decision, shared with the PostgreSQL bridge test. */
export async function readPublicCitationById(db:Pick<DocumentsDb,'citationById'|'documentById'|'pagesOf'>,id:string):Promise<CitationView|null>{
 const citation=await db.citationById(id);
 const document=citation?await db.documentById(citation.document_id):null;
 return citation&&document?.permission==='public'?citationView(db,citation):null;
}
