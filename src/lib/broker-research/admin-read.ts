// src/lib/broker-research/admin-read.ts
// Service-role read models for the admin pages (spec §9.5): overview counts, the three FR-6 gates
// (display only), gold receipt, recent batches, open quarantine, "newer mapping available" published
// reports, outbox failures, licence impact counts, access log. None of these return full text, spans
// or signed URLs, so they are not ★ reads. Callers must have passed adminGate() first.
import {DATASETS} from '../dq/datasets';
import {getAdminSupabase} from '../supabase/admin';
import {selectAll,supabaseTableClient} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {listOpenQuarantine} from '../dq/quarantine';
import {supabaseBrokerResearchDb} from './db';
import {ratingKey} from './rules';
import type {BrokerResearchDb,EvalFieldStats,LicenceRow,RatingScaleRow,SettingsRow} from './types';

import type {AccessLogView,GoldReceiptView,LicenceView,OverviewData} from '@/app/(app)/admin/broker-research/_shared/admin-fetch';

export interface AdminReadDeps{db:BrokerResearchDb;tables:TableClient;now:()=>Date}
export function adminReadDeps():AdminReadDeps{const sb=getAdminSupabase();return {db:supabaseBrokerResearchDb({admin:sb}),tables:supabaseTableClient(sb),now:()=>new Date()};}
const str=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;
const today=(d:AdminReadDeps)=>d.now().toISOString().slice(0,10);
export const GOLD_MIN_DOCS=30;

export const isLicenceConfirmed=(l:LicenceRow,on:string)=>l.confirmed_at!==null&&l.confirmed_version===l.version&&l.valid_from<=on&&(l.valid_to===null||on<=l.valid_to);

export function worstField(perField:Record<string,EvalFieldStats>):{field:string;metric:'precision'|'recall';value:number}|null{
 let worst:{field:string;metric:'precision'|'recall';value:number}|null=null;
 for(const [field,s] of Object.entries(perField??{}))for(const metric of ['precision','recall'] as const){
  const v=s?.[metric];if(typeof v!=='number')continue;
  if(worst===null||v<worst.value)worst={field,metric,value:v};
 }
 return worst;
}
function goldView(r:Row|undefined,s:SettingsRow):GoldReceiptView|null{
 if(!r)return null;
 return {receiptId:String(r.receipt_id),ranAt:str(r.ran_at),passed:r.passed===true,nDocs:Number(r.n_docs??0),corpusMatches:s.approved_gold_corpus_hash!==null&&r.corpus_hash===s.approved_gold_corpus_hash,codeVersion:str(r.code_version),
  tuple:{extractorVersion:str(r.extractor_version),modelId:str(r.model_id),registryHash:str(r.registry_hash),promptVersion:str(r.prompt_version),schemaVersion:str(r.schema_version)},
  precisionMin:typeof r.precision_min==='number'?r.precision_min:null,recallMin:typeof r.recall_min==='number'?r.recall_min:null,worst:worstField((r.per_field??{}) as Record<string,EvalFieldStats>)};
}

/** Published reports where a rating-scale row newer than the publication now covers a target's raw label with a different scale (spec §4.9). */
export async function countMappingUpdates(deps:AdminReadDeps,reports:Row[]):Promise<number>{
 const scales=new Map<string,RatingScaleRow[]>();let n=0;
 for(const r of reports){
  if(r.status!=='published')continue;
  const inst=str(r.institution_id),pubId=str(r.current_publication_id),pd=str(r.published_date);if(!inst||!pubId||!pd)continue;
  const pub=await deps.db.getPublication(pubId);if(!pub)continue;
  if(!scales.has(inst))scales.set(inst,await deps.db.listRatingScales(inst));
  const list=scales.get(inst)??[];
  const targets=await deps.db.listTargets(String(r.report_id));
  const newer=targets.some(t=>t.rating_raw!==null&&list.some(s=>ratingKey(s.raw_label)===ratingKey(t.rating_raw!)&&s.created_at>pub.published_at&&s.valid_from<=pd&&(s.valid_to===null||pd<s.valid_to)&&s.scale_id!==t.scale_id));
  if(newer)n++;
 }
 return n;
}

export async function loadOverview(deps:AdminReadDeps):Promise<OverviewData>{
 const c=(table:string,match:Row)=>deps.tables.count(table,match);
 const [settings,licences,uploaded,parseFailed,published,withdrawn,pending,inReview,approved,outboxFailed,quarantineTotal]=await Promise.all([
  deps.db.getSettings(),deps.db.listLicences(),
  c('broker_report_documents',{status:'uploaded',promotion_pending:false}),c('broker_report_documents',{status:'parse_failed'}),
  c('broker_research_reports',{status:'published'}),c('broker_report_documents',{status:'withdrawn'}),
  c('broker_research_reports',{status:'draft',review_status:'pending'}),c('broker_research_reports',{status:'draft',review_status:'in_review'}),
  c('broker_research_reports',{status:'draft',review_status:'approved'}),c('broker_outbox',{status:'failed'}),c('dq_quarantine',{dataset:DATASETS.brokerResearch,status:'open'}),
 ]);
 const [parsed,reports,goldRows,batches,quarantineRows,reviewQueue,recentDocuments]=await Promise.all([
  selectAll(deps.tables,'broker_report_documents',{status:'parsed'},'document_id'),selectAll(deps.tables,'broker_research_reports',{},'report_id'),
  deps.tables.select('broker_eval_receipts',{corpus_kind:'gold'},{orderBy:'ran_at',desc:true,limit:1}),
  deps.tables.select('ingest_batches',{dataset:DATASETS.brokerResearch},{orderBy:'started_at',desc:true,limit:5}),
  listOpenQuarantine(deps.tables,DATASETS.brokerResearch,5),deps.db.reviewQueue({limit:20}),
  deps.tables.select('broker_report_documents',{},{orderBy:'uploaded_at',desc:true,limit:20}),
 ]);
 const withReport=new Set(reports.map(r=>String(r.document_id)));
 const confirmed=licences.filter(l=>isLicenceConfirmed(l,today(deps))).length;
 const gold=goldView(goldRows[0],settings);
 return {
  settings,
  counts:{toParse:uploaded+parseFailed,toExtract:parsed.filter(d=>!withReport.has(String(d.document_id))).length,toReview:pending+inReview,toPublish:approved,published,withdrawn},
  gates:{d1:{ok:confirmed>0,confirmed,total:licences.length},gold:{ok:gold!==null&&gold.passed&&gold.nDocs>=GOLD_MIN_DOCS&&gold.corpusMatches}},
  gold,batches,quarantine:{total:quarantineTotal,rows:quarantineRows},
  attention:{mappingUpdates:await countMappingUpdates(deps,reports),outboxFailed,licencesPending:licences.filter(l=>l.confirmed_version!==l.version).length},
  reviewQueue,recentDocuments,
 };
}

/** Impact counts per licence: what is public under it, and texts sent back to draft by a change (draft_reason is authoritative). */
export async function loadLicences(deps:AdminReadDeps):Promise<LicenceView[]>{
 const on=today(deps),out:LicenceView[]=[];
 for(const licence of await deps.db.listLicences()){
  const docs=await selectAll(deps.tables,'broker_report_documents',{licence_id:licence.licence_id},'document_id');
  let publishedReports=0,hiddenReports=0,approvedSnippets=0,approvedSummaries=0,revertedTexts=0;
  for(const d of docs){
   for(const r of await deps.tables.select('broker_research_reports',{document_id:d.document_id})){
    if(r.status==='published')publishedReports++;
    if(r.disclosure_ok===false)hiddenReports++;
    const id=r.report_id;
    approvedSnippets+=await deps.tables.count('broker_report_snippets',{report_id:id,status:'approved'});
    approvedSummaries+=await deps.tables.count('broker_report_summaries',{report_id:id,status:'approved'});
    for(const table of ['broker_report_snippets','broker_report_summaries'])
     revertedTexts+=(await selectAll(deps.tables,table,{report_id:id,status:'draft'},table==='broker_report_snippets'?'snippet_id':'summary_id')).filter(x=>x.draft_reason!==null&&x.draft_reason!==undefined).length;
   }
  }
  out.push({licence,confirmed:isLicenceConfirmed(licence,on),pending:licence.confirmed_version!==licence.version,documents:docs.length,publishedReports,hiddenReports,approvedSnippets,approvedSummaries,revertedTexts});
 }
 return out;
}

export async function loadAccessLog(deps:AdminReadDeps,opts:{documentId?:string;limit:number}):Promise<AccessLogView[]>{return deps.db.listAccessLog(opts);}

export type {AccessLogView,GoldReceiptView,LicenceView,OverviewData} from '@/app/(app)/admin/broker-research/_shared/admin-fetch';
