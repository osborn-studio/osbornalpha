// src/app/api/admin/documents/candidates/route.ts
// GET admin candidate list (spec §9): one of status / extraction / issuer is required (extraction
// wins over issuer; a status next to an extraction filters that page). Each candidate carries its
// checks, every cited span (role, page, code-point range, snippet — a citation that cannot be read
// is listed with nulls), the document title and its publications. Cursor paging per §4.11.
import {requireAdminUser} from '@/lib/admin/auth';
import {adminFailure,json,jsonError,UUID_RE} from '@/lib/documents/candidates/admin-http';
import {supabaseDocumentsDb} from '@/lib/documents/db';
import {DocumentsDbError} from '@/lib/documents/types';
import type {CandidateRow,CandidateStatus,CitationRow,DocumentRow,FactCitations,PublicationRow} from '@/lib/documents/types';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const dynamic='force-dynamic';
const STATUSES:readonly CandidateStatus[]=['candidate','confirmed','rejected','promoted'];
const PARAMS=['status','extraction','issuer','cursor','limit'] as const;

function citedIds(c:CandidateRow):[string,string][]{
 const x=c.citations as Partial<FactCitations>;const out:[string,string][]=[];
 for(const r of ['value','label','unit','unit_currency'] as const){const id=x[r];if(typeof id==='string')out.push([r,id]);}
 for(const p of Array.isArray(x.period)?x.period:[])out.push([`period:${p.role}`,p.citation_id]);
 return out;
}
function view(c:CandidateRow,cites:Map<string,CitationRow>,docs:Map<string,DocumentRow|null>,pubs:Map<string,PublicationRow[]>){
 return {candidateId:c.candidate_id,documentId:c.document_id,documentTitle:docs.get(c.document_id)?.title??null,extractionId:c.extraction_id,kind:c.kind,extractorKind:c.extractor_kind,
  extractorRef:c.extractor_ref,naturalKey:c.natural_key,status:c.status,decisionKind:c.decision_kind,decidedBy:c.decided_by,decidedAt:c.decided_at,approvalId:c.approval_id,inheritedFrom:c.inherited_from,
  checksPassed:c.checks_passed,checks:c.checks,payload:c.payload,
  citations:citedIds(c).map(([role,id])=>{const r=cites.get(id);return {role,citationId:id,pageNo:r?.page_no??null,charStart:r?.char_start??null,charEnd:r?.char_end??null,snippet:r?.snippet??null};}),
  publications:(pubs.get(c.candidate_id)??[]).map(p=>({pubGen:p.pub_gen,runId:p.run_id,factId:p.fact_id,state:p.state,updatedAt:p.updated_at}))};
}

export async function GET(request:Request){
 try{
  await requireAdminUser();
  const url=new URL(request.url);
  for(const k of PARAMS)if(url.searchParams.getAll(k).length>1)return jsonError(`invalid_parameter:${k}`,400);
  const status=url.searchParams.get('status'),extraction=url.searchParams.get('extraction'),issuer=url.searchParams.get('issuer'),cursor=url.searchParams.get('cursor'),limitRaw=url.searchParams.get('limit');
  if(status!==null&&!STATUSES.includes(status as CandidateStatus))return jsonError('invalid_parameter:status',400);
  if(extraction!==null&&!UUID_RE.test(extraction))return jsonError('invalid_parameter:extraction',400);
  if(issuer!==null&&!UUID_RE.test(issuer))return jsonError('invalid_parameter:issuer',400);
  let limit=100;
  if(limitRaw!==null){if(!/^\d{1,4}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>1000)return jsonError('invalid_parameter:limit',400);limit=Number(limitRaw);}
  const st=status as CandidateStatus|null;
  const where=extraction!==null?{extractionId:extraction}:issuer!==null?(st!==null?{issuerId:issuer,status:st}:{issuerId:issuer}):st!==null?{status:st}:null;
  if(where===null)return jsonError('invalid_parameter:status',400);
  const db=supabaseDocumentsDb(getAdminSupabase());
  let page;
  try{page=await db.candidatesOf(where,{cursor,limit});}
  catch(e){if(e instanceof DocumentsDbError&&e.code==='invalid_input')return jsonError('invalid_parameter:cursor',400);throw e;}
  const rows=extraction!==null&&st!==null?page.rows.filter(c=>c.status===st):page.rows;
  const ids=[...new Set(rows.flatMap(c=>citedIds(c).map(([,id])=>id)))];
  const cites=new Map<string,CitationRow>();
  for(let i=0;i<ids.length;i+=100)for(const r of await db.citationsByIds(ids.slice(i,i+100)))cites.set(r.citation_id,r);
  const docs=new Map<string,DocumentRow|null>();
  const docIds=[...new Set(rows.map(c=>c.document_id))];
  for(let i=0;i<docIds.length;i+=100)for(const d of await db.documentsByIds(docIds.slice(i,i+100)))docs.set(d.document_id,d);
  const pubs=new Map<string,PublicationRow[]>();
  const cids=rows.map(c=>c.candidate_id);
  for(let i=0;i<cids.length;i+=100){
   const part=cids.slice(i,i+100);
   let cur:string|null=null;
   do{
    const pg=await db.publicationsOf({candidateIds:part},{cursor:cur,limit:1000});
    for(const p of pg.rows){const g=pubs.get(p.candidate_id)??[];g.push(p);pubs.set(p.candidate_id,g);}
    cur=pg.nextCursor;
   }while(cur!==null);
  }
  return json({candidates:rows.map(c=>view(c,cites,docs,pubs)),nextCursor:page.nextCursor});
 }catch(e){return adminFailure(e,'admin/documents/candidates');}
}
