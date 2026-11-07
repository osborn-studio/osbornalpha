// src/lib/documents/hk-facts/pg-facts-port.ts
// TEST-ONLY HkFactsPort over node-postgres (plan F3 Task 13, 契约变更请求 D1-1): pass-through via
// pgFactsDb (FactsDbError), F3 functions via the same SQL the Supabase port calls through rpc
// (DocumentsDbError via toDocumentsDbError). Kept out of facts-port.ts so production modules never
// import `pg` (same discipline as src/lib/facts/pg-facts-db.ts). Nothing in src/app imports this.
import type {Pool} from 'pg';
import {typeParsers} from '../../db/pg-table-client';
import {pgFactsDb} from '../../facts/pg-facts-db';
import {toDocumentsDbError} from '../db';
import {HK_EXTRACTOR_REF} from '../types';
import type {CitationRole} from '../types';
import {assertExpectedRev,hkPassThrough,publicationOutcomeOf,resolveOutcomeOf} from './facts-port';
import type {HkFactsPort,HkRunStatus} from './facts-port';

export function pgHkFactsPort(pool:Pool):HkFactsPort{
 const run=async(text:string,values:unknown[])=>{
  try{return await pool.query({text,values,types:typeParsers});}
  catch(e){throw toDocumentsDbError(e as {message?:string;code?:string});}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await run(`select ${call} as v`,values)).rows[0].v as T;
 return {
  ...hkPassThrough(pgFactsDb(pool)),
  async runStatus(id){const r=(await run(`select status from public.fact_sync_runs where run_id=$1::uuid`,[id])).rows[0] as {status:HkRunStatus}|undefined;return r?.status??null;},
  async ensureHkScope(issuer,fetchKey){await fn('public.ensure_hk_fact_scope($1::uuid,$2::text)',[issuer,fetchKey]);},
  async renewLease(issuer,batch,ttl){return (await fn<boolean>('public.renew_hk_fact_lease($1::uuid,$2::uuid,$3::int)',[issuer,batch,ttl]))===true;},
  async bindFilingDocuments(id,rows){return Number(await fn('public.bind_filing_documents($1::uuid,$2::jsonb)',[id,JSON.stringify(rows)]));},
  async insertFactCitations(id,rows){return Number(await fn('public.insert_fact_citations($1::uuid,$2::jsonb)',[id,JSON.stringify(rows)]));},
  async publishHkRun(issuer,batch,id,manifest,expectedRev,zeroOutput){assertExpectedRev(expectedRev);return Number(await fn('public.publish_hk_run($1::uuid,$2::uuid,$3::uuid,$4::uuid[],$5::bigint,$6::jsonb)',[issuer,batch,id,manifest,expectedRev,JSON.stringify(zeroOutput)]));},
  async finishCandidatePublications(id){return publicationOutcomeOf(await fn<Record<string,unknown>|null>('public.finish_candidate_publications($1::uuid)',[id]));},
  async abandonCandidatePublications(id){return Number(await fn('public.abandon_candidate_publications($1::uuid)',[id]));},
  async promotionDue(pubGen,limit){return ((await fn<string[]|null>('public.hk_promotion_due($1::int,$2::text,$3::int)',[pubGen,HK_EXTRACTOR_REF,limit]))??[]).map(issuerId=>({issuerId:String(issuerId)}));},
  async zeroOutputDocuments(issuer,pubGen){return ((await fn<string[]|null>('public.hk_zero_output_documents($1::uuid,$2::int)',[issuer,pubGen]))??[]).map(String);},
  async resolveHkFactsQuarantine(item,chosen,by){return resolveOutcomeOf(await fn<Record<string,unknown>>('public.resolve_hk_facts_quarantine($1::uuid,$2::uuid[],$3::uuid)',[item,chosen,by]));},
  async citationsOfFact(factId){
   return ((await run(`select role, citation_id::text as citation_id from public.fact_citations where fact_id=$1::uuid order by role collate "C", citation_id`,[factId])).rows as {role:CitationRole;citation_id:string}[]).map(r=>({role:r.role,citation_id:r.citation_id}));
  },
  async hkFilingOfDocument(documentId){
   const r=(await run(`select fd.filing_id::text as filing_id, g.mapping_gen from public.filing_documents fd join public.filings g on g.filing_id=fd.filing_id where fd.document_id=$1::uuid order by fd.filing_id limit 1`,[documentId])).rows[0] as {filing_id:string;mapping_gen:number}|undefined;
   return r?{filing_id:r.filing_id,mapping_gen:Number(r.mapping_gen)}:null;
  },
 };
}
