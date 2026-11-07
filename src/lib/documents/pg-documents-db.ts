// src/lib/documents/pg-documents-db.ts
// TEST-ONLY DocumentsDb over node-postgres (spec §4.11): it calls the same migration-one SQL
// functions supabaseDocumentsDb calls through rpc, and runs the single-table reads as plain SQL
// with the same filters, order and limits, so the shared contract and the offline integration
// tests exercise the real schema (locks, leases, triggers, RLS-free service reads). Nothing in
// src/app imports this. typeParsers keep date/timestamptz as the server's text: cursors carry the
// exact microsecond value and the db.ts normalisers turn timestamps into toISOString() form; int8
// and numeric arrive as strings and are Number()ed / canonicalised there. extraction_approvals is
// written directly (the one table service_role may write, §4.12). Errors are mapped with
// toDocumentsDbError exactly like PostgREST errors.
import type {Pool} from 'pg';
import {typeParsers} from '../db/pg-table-client';
import {
 CANDIDATE_KEYS,IN_CHUNK,PUBLICATION_KEYS,READ_DOC_KEYS,REFS_CHUNK,approvalArg,assetsArg,checkWriteRows,docArg,timestampUuidCursor,versionCursor,tsArg,approvalFromRow,assetFromRow,candidateFromRow,candidatesWhere,checkApprovalsLimit,checkIds,checkLimit,chunk,citationFromRow,
 decodeCursor,documentFromRow,extractionFromRow,lookaheadLimit,pageFromRow,pageOf,publicationFromRow,publicationsWhere,readDocumentsArgs,regenFilter,scopeFromRow,sliceRows,sqlCursor,toDocumentsDbError,
} from './db';
import type {Envelope,PgErrorLike} from './db';
import {DocumentsDbError,EXTRACTOR_VERSION,PAGE_LIMIT_MAX,TABLE_ALGO_VERSION} from './types';
import type {CandidateStatus,DocScopeRow,DocumentsDb,InsertVersionResult} from './types';

export function pgDocumentsDb(pool:Pool):DocumentsDb{
 const run=async(text:string,values:unknown[]=[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){throw toDocumentsDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
 const json=(v:unknown)=>v===null||v===undefined?null:JSON.stringify(v);
 const one=async(text:string,values:unknown[])=>(await run(text,values)).rows[0] as Record<string,unknown>|undefined;
 return {
  async reconcileScope(source,input,snapshotAt){return Number(await fn('public.reconcile_document_sync_scope($1,$2::jsonb,$3::timestamptz)',[source,json(input),snapshotAt??null]));},
  async renewSyncLease(issuer,source,batch,ttl){return (await fn<boolean>('public.renew_document_sync_lease($1,$2,$3,$4)',[issuer,source,batch,ttl]))===true;},
  async claimSyncLease(issuer,source,batch,ttl){return (await fn<boolean>('public.claim_document_sync_lease($1,$2,$3,$4)',[issuer,source,batch,ttl]))===true;},
  insertDocumentVersion:async(issuer,source,batch,doc,assets)=>fn<InsertVersionResult>('public.insert_document_version($1,$2,$3,$4::jsonb,$5::jsonb)',[issuer,source,batch,json(docArg(doc)),json(assetsArg(assets))]),
  insertUploadDocument:async(owner,doc)=>fn<InsertVersionResult>('public.insert_upload_document($1,$2::jsonb)',[owner,json(docArg(doc))]),
  async advanceCursor(issuer,source,batch,mode,cursor,done,reset=false){await fn('public.advance_document_cursor($1,$2,$3,$4,$5::jsonb,$6,$7)',[issuer,source,batch,mode,json(cursor),done,reset]);},
  async releaseSyncLease(issuer,source,batch,outcome,nextDue){await fn('public.release_document_sync_lease($1,$2,$3,$4,$5::timestamptz)',[issuer,source,batch,outcome,tsArg(nextDue,'next_due')]);},
  async reclassifyDocument(document,patch,actor){await fn('public.reclassify_document($1,$2::jsonb,$3)',[document,json(patch),actor]);},
  async claimExtractLease(document,batch,ttl){return (await fn<boolean>('public.claim_document_extract_lease($1,$2,$3)',[document,batch,ttl]))===true;},
  async renewExtractLease(document,batch,ttl){return (await fn<boolean>('public.renew_document_extract_lease($1,$2,$3)',[document,batch,ttl]))===true;},
  async finishExtract(document,batch,extraction,pages){return String(await fn('public.finish_document_extract($1,$2,$3::jsonb,$4::jsonb)',[document,batch,json(extraction),json(pages)]));},
  async failExtract(document,batch,code){await fn('public.fail_document_extract($1,$2,$3)',[document,batch,code]);},
  async failExtractTerminal(document,batch,code,detail){await fn('public.fail_document_extract_terminal($1,$2,$3,$4::jsonb)',[document,batch,code,JSON.stringify(detail)]);},
  async requestExtract(document,actor){await fn('public.request_document_extract($1,$2,$3,$4)',[document,actor,EXTRACTOR_VERSION,TABLE_ALGO_VERSION]);},
  async claimCandidatesLease(extraction,batch,ttl){return (await fn<boolean>('public.claim_candidates_lease($1,$2,$3)',[extraction,batch,ttl]))===true;},
  async renewCandidatesLease(extraction,batch,ttl){return (await fn<boolean>('public.renew_candidates_lease($1,$2,$3)',[extraction,batch,ttl]))===true;},
  async finishCandidates(extraction,batch,status){await fn('public.finish_candidates($1,$2,$3)',[extraction,batch,status]);},
  async requestCandidatesRegen(filter,actor){return Number(await fn('public.request_candidates_regen($1::jsonb,$2)',[json(regenFilter(filter)),actor]));},
  async writeCandidateChecks(extraction,batch,input){
   checkWriteRows(input);   // F3: one call = one transaction, like the rpc (cap is TS-only)
   const r=await fn<{written:number;inherited:number}>('public.write_candidate_checks($1,$2,$3::jsonb)',[extraction,batch,json(input)]);
   return {written:Number(r.written),inherited:Number(r.inherited)};
  },
  async insertCitation(row){return String(await fn('public.insert_citation($1::jsonb)',[json(row)]));},
  async publishCitations(ids){return Number(await fn('public.publish_citations($1::uuid[])',[ids]));},
  async insertCandidates(extraction,batch,input){
   checkWriteRows(input);
   return {inserted:Number((await fn<{inserted:number}>('public.insert_candidates($1,$2,$3::jsonb)',[extraction,batch,json(input)])).inserted)};
  },
  async decideCandidate(candidate,decision){const r=await fn<{status:CandidateStatus}>('public.decide_candidate($1,$2::jsonb)',[candidate,json(decision)]);return {status:r.status};},
  async stageCandidatePublication(candidate,pubGen,run_,factId){
   const r=await fn<{outcome:string}>('public.stage_candidate_publication($1,$2,$3,$4)',[candidate,pubGen,run_,factId]);
   if(r.outcome==='approval_revoked')throw new DocumentsDbError('approval_revoked');
  },
  async insertApproval(row){
   const a=approvalArg(row);   // canonical decimals in the band, like memory and Supabase
   const r=await one(`insert into public.extraction_approvals (extractor_ref, extractor_version, table_algo_version, code_version, concepts, gold_sha256, precision, recall, report_path, approved_by)
    values ($1,$2,$3,$4,$5::text[],$6,$7::numeric,$8::numeric,$9,$10) returning approval_id`,
    [a.extractor_ref,a.extractor_version,a.table_algo_version,a.code_version,a.concepts,a.gold_sha256,a.precision,a.recall,a.report_path,a.approved_by]);
   return String(r!.approval_id);
  },
  async revokeApproval(approvalId){return (await fn<boolean>('public.revoke_extraction_approval($1)',[approvalId]))===true;},
  async documentVersions(source,sourceRef,page){
   const limit=lookaheadLimit(page.limit);const after=page.cursor?versionCursor(page.cursor):null;
   const r=await run(`select * from public.disclosure_documents where source = $1 and source_ref = $2 and ($3::int is null or source_version > $3) order by source_version limit $4`,[source,sourceRef,after,limit+1]);
   return sliceRows(r.rows,limit,documentFromRow,x=>[Number(x.source_version)]);
  },
  async knownSourceRefs(issuer,source,refs){
   const out=new Set<string>();
   for(const part of chunk([...new Set(refs)],REFS_CHUNK))for(const x of (await fn<string[]|null>('public.known_source_refs($1,$2,$3::text[])',[issuer,source,part]))??[])out.add(x);
   return out;
  },
  async readDocuments(issuer,opts){
   const a=readDocumentsArgs(issuer,opts);
   return pageOf(await fn<Envelope>('public.read_documents($1,$2::date,$3,$4,$5::date,$6::date,$7::jsonb,$8,$9)',[a.p_issuer,a.p_as_of,a.p_source,a.p_doc_class,a.p_from,a.p_to,json(a.p_cursor),a.p_limit,a.p_all_versions]),documentFromRow,READ_DOC_KEYS);
  },
  async documentsByFiling(f,asOf){const r=await fn<{filing_found:boolean;rows:Record<string,unknown>[]}>('public.read_documents_by_filing($1,$2::date)',[f.filingId,asOf]);return {filingFound:r.filing_found,rows:r.rows.map(documentFromRow)};},
  async documentById(id){const r=await one(`select * from public.disclosure_documents where document_id = $1`,[id]);return r?documentFromRow(r):null;},
  async documentsByIds(ids){
   if(checkIds(ids).length===0)return [];
   return (await run(`select * from public.disclosure_documents where document_id = any($1::uuid[]) order by document_id`,[[...new Set(ids)]])).rows.map(documentFromRow);
  },
  async assetsOf(documentId){return (await run(`select * from public.document_assets where document_id = $1 order by role, filename limit $2`,[documentId,PAGE_LIMIT_MAX])).rows.map(assetFromRow);},
  async extractionsOf(documentId,page){
   const limit=lookaheadLimit(page.limit);const [at,id]=page.cursor?timestampUuidCursor(page.cursor):[null,null];
   const r=await run(`select * from public.document_extractions where document_id = $1 and ($2::timestamptz is null or (created_at, extraction_id) < ($2::timestamptz, $3::uuid))
    order by created_at desc, extraction_id desc limit $4`,[documentId,at,id,limit+1]);
   return sliceRows(r.rows,limit,extractionFromRow,x=>[String(x.created_at),String(x.extraction_id)]);
  },
  async extractionById(id){const r=await one(`select * from public.document_extractions where extraction_id = $1`,[id]);return r?extractionFromRow(r):null;},
  async pagesOf(extractionId,pageNos){
   if(checkIds(pageNos).length===0)return [];
   return (await run(`select * from public.document_pages where extraction_id = $1 and page_no = any($2::int[]) order by page_no`,[extractionId,[...new Set(pageNos)]])).rows.map(pageFromRow);
  },
  async citationById(id){const r=await one(`select * from public.document_citations where citation_id = $1`,[id]);return r?citationFromRow(r):null;},
  async citationsByIds(ids){
   if(checkIds(ids).length===0)return [];
   return (await run(`select * from public.document_citations where citation_id = any($1::uuid[]) order by citation_id`,[[...new Set(ids)]])).rows.map(citationFromRow);
  },
  async candidatesOf(where,page){
   const w=candidatesWhere(where);
   return pageOf(await fn<Envelope>('public.list_candidates($1,$2,$3,$4::jsonb,$5)',[w.p_extraction,w.p_status,w.p_issuer,json(sqlCursor(page.cursor,CANDIDATE_KEYS)),checkLimit(page.limit)]),candidateFromRow,CANDIDATE_KEYS);
  },
  async candidateById(id){const r=await one(`select * from public.extraction_candidates where candidate_id = $1`,[id]);return r?candidateFromRow(r):null;},
  async publicationsOf(where,page){
   const w=publicationsWhere(where);
   return pageOf(await fn<Envelope>('public.list_candidate_publications($1::uuid[],$2,$3,$4,$5,$6::jsonb,$7)',[w.p_candidate_ids,w.p_run,w.p_issuer,w.p_pub_gen,w.p_state,json(sqlCursor(page.cursor,PUBLICATION_KEYS)),checkLimit(page.limit)]),publicationFromRow,PUBLICATION_KEYS);
  },
  async approvalsFor(extractorRef,opts){
   const limit=checkApprovalsLimit(opts.limit);
   const r=(await run(`select * from public.extraction_approvals where extractor_ref = $1 and revoked_at is null order by approved_at desc, approval_id limit $2`,[extractorRef,limit+1])).rows;
   if(r.length>limit)throw new DocumentsDbError('too_many_approvals',`more than ${limit} approvals for ${extractorRef}`);
   return r.map(approvalFromRow);
  },
  async storedDue(limit){return ((await fn<Record<string,unknown>[]|null>('public.documents_stored_due($1)',[checkLimit(limit)]))??[]).map(documentFromRow);},
  async candidatesDue(limit){return ((await fn<Record<string,unknown>[]|null>('public.extractions_candidates_due($1)',[checkLimit(limit)]))??[]).map(extractionFromRow);},
  async scopeDue(source,now,limit){
   return (await run(`select * from public.document_sync_scope where source = $1 and priority > 0 and next_due_at <= $2::timestamptz order by next_due_at, priority desc, issuer_id limit $3`,[source,tsArg(now,'now'),checkLimit(limit)])).rows.map(scopeFromRow);
  },
  async scopeRows(source,issuerIds){
   const out:DocScopeRow[]=[];
   for(const part of chunk([...new Set(issuerIds)],IN_CHUNK))out.push(...(await run(`select * from public.document_sync_scope where source = $1 and issuer_id = any($2::uuid[]) order by issuer_id`,[source,part])).rows.map(scopeFromRow));
   return out;
  },
  async scopeAll(source){
   return (await run(`select * from public.document_sync_scope where source = $1 order by issuer_id`,[source])).rows.map(scopeFromRow);
  },
 };
}
