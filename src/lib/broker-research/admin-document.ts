// src/lib/broker-research/admin-document.ts
// Document page read model (spec §9.5 文档页): document, licence, report, immutable runs, purge steps.
// No full text, spans or signed URLs here (the "view original" button goes through the ★ route).
import type {AdminReadDeps} from './admin-read';
import type {DocumentRow,LicenceRow,PurgeStepRow,ReportRow,RunRow} from './types';

export interface DocumentPageData{document:DocumentRow;licence:LicenceRow|null;report:ReportRow|null;runs:RunRow[];purgeSteps:PurgeStepRow[]}
export async function loadDocumentPage(deps:AdminReadDeps,documentId:string):Promise<DocumentPageData|null>{
 const document=await deps.db.getDocument(documentId);if(!document)return null;
 const [licence,report,runs,purgeSteps]=await Promise.all([deps.db.getLicence(document.licence_id),deps.db.reportByDocument(documentId),deps.db.listRuns(documentId),deps.db.purgeSteps(documentId)]);
 return {document,licence,report,runs:runs.map(r=>({...r,detail:Object.fromEntries(Object.entries(r.detail).filter(([k,v])=>['error_code','page_count','ocr_used','ocr_version','candidates','calls'].includes(k)&&['string','number','boolean'].includes(typeof v)))})).sort((a,b)=>b.started_at.localeCompare(a.started_at)),purgeSteps};
}

