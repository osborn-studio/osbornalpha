// TEST-ONLY PostgreSQL BrokerResearchDb (spec §4.14): drives the shared contract through
// real tables, SQL functions and public views. Private content is never read from public views.
import type {Pool} from 'pg';
import {ident,typeParsers} from '../db/pg-table-client';
import {DEFAULT_QUEUE_LIMIT,FIELD_COLUMNS,HISTORY_COLUMNS,PUBLIC_CITATION_COLUMNS,PUBLIC_TARGET_COLUMNS,PURGE_TEXT,TARGET_COLUMNS,accessFromRow,analystFromRow,analystsDistinct,bundles,documentFromRow,dropUndefined,evalFromRow,fencedArgs,fieldFromRow,institutionFromRow,intentFromRow,licenceFromRow,outboxFromRow,publicRow,publicationFromRow,purgeFromRow,receiptFrom,reportFromRow,runFromRow,scaleFromRow,settingsFromRow,snippetFromRow,sqlColumns,summaryFromRow,targetFromRow,toBrokerResearchDbError,writeFromRow} from './db';
import type {PgErrorLike} from './db';
import {BrokerResearchDbError} from './types';
import type {BrokerResearchDb,PublicReportBundle,ReportAnalystRow} from './types';

type R=Record<string,unknown>;
const J=(v:unknown)=>v!==null&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v;

export function pgBrokerResearchDb(pool:Pool):BrokerResearchDb{
 const q=async(text:string,values:unknown[]=[]):Promise<R[]>=>{
  try{return (await pool.query({text,values:values.map(J),types:typeParsers})).rows as R[];}
  catch(e){throw toBrokerResearchDbError(e as PgErrorLike);}
 };
 const fn=async<T>(call:string,values:unknown[]):Promise<T>=>(await q(`select ${call} as v`,values))[0].v as T;
 const one=async(text:string,values:unknown[])=>(await q(text,values))[0]??null;
 const rel=(t:string)=>`public.${ident(t)}`;
 const insert=async(t:string,row:R,returning='*')=>{const p=dropUndefined(row),k=Object.keys(p);return (await q(`insert into ${rel(t)} (${k.map(ident).join(', ')}) values (${k.map((_,i)=>`$${i+1}`).join(', ')}) returning ${returning}`,k.map(c=>p[c])))[0];};
 const update=async(t:string,patch:R,where:string,whereValues:unknown[],returning='1')=>{const p=dropUndefined(patch),k=Object.keys(p);if(!k.length)return [] as R[];return q(`update ${rel(t)} set ${k.map((c,i)=>`${ident(c)} = $${i+1+whereValues.length}`).join(', ')} where ${where} returning ${returning}`,[...whereValues,...k.map(c=>p[c])]);};
 const missing=(what:string)=>new BrokerResearchDbError('not_found',`not_found:${what}`,what);
 return {
  async getSettings(){return settingsFromRow((await one(`select * from ${rel('broker_research_settings')} where id=1`,[]))!);},
  async setPublicEnabled(flag,by){await q(`update ${rel('broker_research_settings')} set public_enabled=$1,updated_by=$2,updated_at=now() where id=1`,[flag,by]);},
  async setApprovedGoldCorpus(hash,by){await q(`update ${rel('broker_research_settings')} set approved_gold_corpus_hash=$1,approved_gold_corpus_by=case when $1::text is null then null else $2::uuid end,approved_gold_corpus_at=case when $1::text is null then null else now() end,updated_by=$2,updated_at=now() where id=1`,[hash,by]);},
  async listLicences(){return (await q(`select * from ${rel('broker_report_licences')} order by created_at,licence_id`)).map(licenceFromRow);},
  async getLicence(id){const r=await one(`select * from ${rel('broker_report_licences')} where licence_id=$1`,[id]);return r?licenceFromRow(r):null;},
  async insertLicence(input){return licenceFromRow(await insert('broker_report_licences',input as unknown as R));},
  async updateLicence(id,patch){const [r]=await update('broker_report_licences',patch as R,'licence_id=$1',[id],'*');if(!r)throw missing('licence');return licenceFromRow(r);},
  async confirmLicence(id,by,version){const hit=await q(`update ${rel('broker_report_licences')} set confirmed_by=$2,confirmed_at=now(),confirmed_version=$3 where licence_id=$1 and version=$3 returning 1`,[id,by,version]);if(hit.length)return 'confirmed';if(!await one(`select 1 from ${rel('broker_report_licences')} where licence_id=$1`,[id]))throw missing('licence');return 'version_mismatch';},
  async insertIntent(row){await insert('broker_report_upload_intents',row as unknown as R,'intent_id');},
  async getIntent(id){const r=await one(`select * from ${rel('broker_report_upload_intents')} where intent_id=$1`,[id]);return r?intentFromRow(r):null;},
  async transitionIntent(id,from,to,patch){return (await update('broker_report_upload_intents',{status:to,...patch},'intent_id=$1 and status=$2',[id,from])).length>0;},
  async findDocumentBySha(sha){const r=await one(`select * from ${rel('broker_report_documents')} where sha256=$1`,[sha]);return r?documentFromRow(r):null;},
  async getDocument(id){const r=await one(`select * from ${rel('broker_report_documents')} where document_id=$1`,[id]);return r?documentFromRow(r):null;},
  async insertDocument(row){try{await insert('broker_report_documents',{...row,status:'uploaded',promotion_pending:true},'document_id');return 'inserted';}catch(e){if(e instanceof BrokerResearchDbError&&e.code==='duplicate_key')return 'duplicate';throw e;}},
  async withdrawWithIntent(id,reason,purge,by){await fn('public.broker_document_withdraw($1,$2,$3,$4)',[id,reason,purge,by]);},
  async updateDocument(id,patch){await update('broker_report_documents',patch as R,'document_id=$1',[id]);},
  claimLease:(id,token,ttl)=>fn('public.broker_document_claim_lease($1,$2,$3)',[id,token,ttl]),
  renewLease:(id,token,ttl)=>fn('public.broker_document_renew_lease($1,$2,$3)',[id,token,ttl]),
  fencedUpdateDocument:(id,token,patch)=>{const a=fencedArgs(patch);return fn('public.broker_document_fenced_update($1,$2,$3::jsonb,$4)',[id,token,a.patch,a.release]);},
  async insertRun(row){await insert('broker_report_runs',{...row,detail:row.detail??{}},'run_id');},
  finishRun:(id,token,patch)=>fn('public.broker_run_finish($1,$2,$3::jsonb)',[id,token,dropUndefined(patch as R)]),
  async getRun(id){const r=await one(`select * from ${rel('broker_report_runs')} where run_id=$1`,[id]);return r?runFromRow(r):null;},
  async listRuns(id){return (await q(`select * from ${rel('broker_report_runs')} where document_id=$1 order by started_at,run_id`,[id])).map(runFromRow);},
  async ensureReport(id,version){await q(`insert into ${rel('broker_research_reports')} (document_id,code_version) values ($1,$2) on conflict (document_id) do nothing`,[id,version]);return reportFromRow((await one(`select * from ${rel('broker_research_reports')} where document_id=$1`,[id]))!);},
  async getReport(id){const r=await one(`select * from ${rel('broker_research_reports')} where report_id=$1`,[id]);return r?reportFromRow(r):null;},
  async reportByDocument(id){const r=await one(`select * from ${rel('broker_research_reports')} where document_id=$1`,[id]);return r?reportFromRow(r):null;},
  async listReports(o){return (await q(`select * from ${rel('broker_research_reports')} where institution_id=$1 order by created_at,report_id`,[o.institutionId])).map(reportFromRow);},
  async updateReportDraft(id,patch){await update('broker_research_reports',patch as R,'report_id=$1',[id]);},
  async setReportFlags(id,flags){const p=dropUndefined(flags as R);if(Object.keys(p).length&&!(await update('broker_research_reports',p,'report_id=$1',[id])).length)throw missing('report');},
  extractCommit:async(id,token,run,rows)=>receiptFrom(await fn('public.broker_extract_commit($1,$2,$3,$4::jsonb)',[id,token,run,JSON.stringify(rows)])),
  fieldReview:async(id,action,payload,by)=>receiptFrom(await fn('public.broker_field_review($1,$2,$3::jsonb,$4)',[id,action,payload,by])),
  async insertHumanField(id,row,by){const x=await fn<R>('public.broker_field_add($1,$2::jsonb,$3)',[id,row,by]);return {fieldId:String(x.field_id),receipt:receiptFrom(x.receipt)};},
  upsertTargetOverride:async r=>receiptFrom(await fn('public.broker_target_override($1,$2,$3,$4,$5,$6)',[r.report_id,r.target_key,r.security_ticker,r.issuer_id,r.set_by,r.note])),
  materialize:async id=>receiptFrom(await fn('public.broker_report_materialize($1)',[id])),
  async listFields(id,o){return (await q(`select ${sqlColumns(FIELD_COLUMNS)} from ${rel('broker_report_fields')} where report_id=$1${o?.includeSuperseded?'':' and superseded_by_run_id is null'} order by target_key nulls first,field,occurrence,created_at,field_id`,[id])).map(fieldFromRow);},
  async listTargets(id){return (await q(`select ${sqlColumns(TARGET_COLUMNS)} from ${rel('broker_report_targets')} where report_id=$1 order by target_key`,[id])).map(targetFromRow);},
  async bindAnalyst(r){await q(`insert into ${rel('broker_report_analysts')} (report_id,analyst_id,role,field_id) values ($1,$2,$3,$4) on conflict (report_id,analyst_id) do update set role=excluded.role,field_id=excluded.field_id`,[r.report_id,r.analyst_id,r.role,r.field_id]);},
  async listReportAnalysts(id){return (await q(`select report_id,analyst_id,role,field_id from ${rel('broker_report_analysts')} where report_id=$1 order by analyst_id`,[id])) as unknown as ReportAnalystRow[];},
  async insertRuleReceipt(r){return String((await insert('broker_report_rule_receipts',{...r,results:JSON.stringify(r.results)},'receipt_id')).receipt_id);},
  async insertSnippet(r){return String((await insert('broker_report_snippets',{...r,status:'draft'},'snippet_id')).snippet_id);},
  async setSnippetStatus(id,p){await update('broker_report_snippets',p as R,'snippet_id=$1',[id]);},
  async getSnippet(id){const r=await one(`select * from ${rel('broker_report_snippets')} where snippet_id=$1`,[id]);return r?snippetFromRow(r):null;},
  async listSnippets(id){return (await q(`select * from ${rel('broker_report_snippets')} where report_id=$1 order by created_at,snippet_id`,[id])).map(snippetFromRow);},
  summaryCommit:async(id,token,run,row)=>String(await fn('public.broker_summary_commit($1,$2,$3,$4::jsonb)',[id,token,run,JSON.stringify(row)])),
  titleCommit:async(id,token,run,titles)=>{await fn('public.broker_title_commit($1,$2,$3,$4::jsonb)',[id,token,run,titles]);return 'ok';},
  extractSetScope:async(id,token,run,scope)=>receiptFrom(await fn('public.broker_extract_set_scope($1,$2,$3,$4)',[id,token,run,scope])),
  extractFinalize:async(id,token,run,detail)=>{await fn('public.broker_extract_finalize($1,$2,$3,$4::jsonb)',[id,token,run,detail]);return 'ok';},
  async insertSummary(r){return String((await insert('broker_report_summaries',r as unknown as R,'summary_id')).summary_id);},
  async setSummaryStatus(id,p){await update('broker_report_summaries',p as R,'summary_id=$1',[id]);},
  async getSummary(id){const r=await one(`select * from ${rel('broker_report_summaries')} where summary_id=$1`,[id]);return r?summaryFromRow(r):null;},
  async listSummaries(id){return (await q(`select * from ${rel('broker_report_summaries')} where report_id=$1 order by generated_at,summary_id`,[id])).map(summaryFromRow);},
  publishBlockers:async id=>((await fn<string[]|null>('public.broker_report_publish_blockers($1)',[id]))??[]).map(String),
  disclosureDigest:async id=>String(await fn('public.broker_report_disclosure_digest($1)',[id])),
  async disclosureRecheck(id,by,checks){const x=await fn<R>('public.broker_report_disclosure_recheck($1,$2,$3::jsonb)',[id,by,checks]);return {restored:x.restored===true,failures:((x.failures??[]) as unknown[]).map(String)};},
  publish:async(id,by)=>({publicationId:String(await fn('public.broker_report_publish($1,$2)',[id,by]))}),
  async unpublish(id,by,reason){await fn('public.broker_report_unpublish($1,$2,$3)',[id,by,reason]);},
  async getPublication(id){const r=await one(`select * from ${rel('broker_report_publications')} where publication_id=$1`,[id]);return r?publicationFromRow(r):null;},
  async upsertInstitution(r){
   const cols=['institution_id','name_en','name_zh','aliases','kind','rating_disclosure_url'];
   const p=dropUndefined(r as R),keys=cols.filter(c=>c in p),changed=keys.filter(c=>c!=='institution_id');
   const values=keys.map(c=>p[c]);
   // PostgreSQL checks NOT NULL on the proposed insert row before resolving a conflict.
   // Carry the existing required value into that row; it is not part of the update list.
   const missingName=!!r.institution_id&&!keys.includes('name_en');
   const insertKeys=missingName?[...keys,'name_en']:keys;
   const proposed=keys.map((c,i)=>`$${i+1}${c==='aliases'?'::text[]':''}`);
   if(missingName)proposed.push(`(select name_en from ${rel('research_institutions')} where institution_id=$1)`);
   const conflict=r.institution_id?changed.length?`on conflict (institution_id) do update set ${changed.map(c=>`${ident(c)}=excluded.${ident(c)}`).join(',')}`:'on conflict (institution_id) do nothing':'';
   const sql=`insert into ${rel('research_institutions')} (${insertKeys.map(ident).join(',')}) values (${proposed.join(',')}) ${conflict} returning institution_id`;
   return String((await one(sql,values))?.institution_id??r.institution_id);
  },
  async listInstitutions(){return (await q(`select * from ${rel('research_institutions')} order by name_en,institution_id`)).map(institutionFromRow);},
  async insertRatingScale(r){return String((await insert('research_rating_scales',r as unknown as R,'scale_id')).scale_id);},
  async closeRatingScale(id,to,by){if(!(await q(`update ${rel('research_rating_scales')} set valid_to=$2,closed_by=$3 where scale_id=$1 returning 1`,[id,to,by])).length)throw missing('rating_scale');},
  async listRatingScales(id){return (await q(`select * from ${rel('research_rating_scales')} where institution_id=$1 order by raw_label,valid_from,scale_id`,[id])).map(scaleFromRow);},
  async upsertAnalyst(r){
   const cols=['analyst_id','institution_id','display_name','name_variants','public_display'];
   const p=dropUndefined(r as R),keys=cols.filter(c=>c in p),changed=keys.filter(c=>c!=='analyst_id');
   const missing= r.analyst_id?['institution_id','display_name'].filter(c=>!keys.includes(c)):[];
   const insertKeys=[...keys,...missing],values=keys.map(c=>p[c]);
   const proposed=keys.map((c,i)=>`$${i+1}${c==='name_variants'?'::text[]':''}`);
   for(const c of missing)proposed.push(`(select ${ident(c)} from ${rel('research_analysts')} where analyst_id=$1)`);
   const conflict=r.analyst_id?changed.length?`on conflict (analyst_id) do update set ${changed.map(c=>`${ident(c)}=excluded.${ident(c)}`).join(',')}`:'on conflict (analyst_id) do nothing':'';
   const sql=`insert into ${rel('research_analysts')} (${insertKeys.map(ident).join(',')}) values (${proposed.join(',')}) ${conflict} returning analyst_id`;
   return String((await one(sql,values))?.analyst_id??r.analyst_id);
  },
  async listAnalysts(id){return (await q(`select * from ${rel('research_analysts')} where institution_id=$1 order by display_name,analyst_id`,[id])).map(analystFromRow);},
  async reviewQueue(o){return (await q(`select * from ${rel('broker_research_reports')} where status='draft' and review_status=any($1::text[]) order by updated_at,report_id limit $2`,[o.status?[o.status]:['pending','in_review'],o.limit??DEFAULT_QUEUE_LIMIT])).map(reportFromRow);},
  async logAccess(r){await insert('broker_report_access_log',r as unknown as R,'id');},
  async listAccessLog(o){return (await q(`select * from ${rel('broker_report_access_log')}${o.documentId?' where document_id=$2':''} order by created_at desc,id desc limit $1`,o.documentId?[o.limit,o.documentId]:[o.limit])).map(accessFromRow);},
  async insertEvalReceipt(r){return String((await insert('broker_eval_receipts',r as unknown as R,'receipt_id')).receipt_id);},
  async latestEvalReceipt(d){const r=await one(`select * from ${rel('broker_eval_receipts')} where behavior_digest=$1 order by ran_at desc,receipt_id desc limit 1`,[d]);return r?evalFromRow(r):null;},
  async takePendingOutbox(n){return (await q(`select * from ${rel('broker_outbox')} where status='pending' order by created_at,event_id limit $1`,[n])).map(outboxFromRow);},
  async markOutbox(id,o){await fn('public.broker_outbox_mark($1,$2,$3)',[id,o.delivered,o.delivered?null:o.error]);},
  async upsertPurgeStep(id,step,o){await fn('public.broker_purge_step_record($1,$2,$3,$4)',[id,step,o.ok,o.ok?null:o.error]);},
  async purgeSteps(id){return (await q(`select * from ${rel('broker_purge_steps')} where document_id=$1 order by step`,[id])).map(purgeFromRow);},
  async purgeReportText(id,step){const r=await one(`select r.status,d.sha256 from ${rel('broker_research_reports')} r join ${rel('broker_report_documents')} d on d.document_id=r.document_id where r.report_id=$1`,[id]);if(!r)throw missing('report');if(r.status!=='withdrawn')throw new BrokerResearchDbError('report_not_withdrawn');if(step==='quarantine_payload')return (await q(`update public.dq_quarantine set payload='{}'::jsonb where dataset='broker_research' and natural_key like $1 returning 1`,[`${r.sha256}:%`])).length;const t=PURGE_TEXT[step];return (await update(t.table,t.patch,'report_id=$1',[id])).length;},
  quarantineResolve:(id,status,by,payload)=>fn('public.broker_quarantine_resolve($1,$2,$3,$4::jsonb)',[id,status,by,payload]),
  async verifyCandidates(n){return (await q(`select d.* from ${rel('broker_report_documents')} d where exists (select 1 from ${rel('broker_research_reports')} r where r.document_id=d.document_id and r.status='published') order by d.last_verified_at asc nulls first,d.document_id limit $1`,[n])).map(documentFromRow);},
  async registerWrite(r){return String((await insert('broker_storage_writes',r as unknown as R,'write_id')).write_id);},
  async abandonWrite(id){await q(`update ${rel('broker_storage_writes')} set status='abandoned' where write_id=$1 and status='pending'`,[id]);},
  async finishWrite(id){await q(`update ${rel('broker_storage_writes')} set status='done',finished_at=now() where write_id=$1 and status='pending'`,[id]);},
  async writesFor(id){return (await q(`select * from ${rel('broker_storage_writes')} where document_id=$1 order by started_at,write_id`,[id])).map(writeFromRow);},
  async pendingWritesFor(id){return (await q(`select * from ${rel('broker_storage_writes')} where document_id=$1 and status='pending' order by started_at,write_id`,[id])).map(writeFromRow);},
  async unreconciledWrites(n){return (await q(`select w.* from ${rel('broker_storage_writes')} w join ${rel('broker_report_documents')} d on d.document_id=w.document_id where w.status in ('pending','done') and d.purge_requested_at is not null and w.next_attempt_at<=now() order by w.next_attempt_at,w.write_id limit $1`,[n])).map(writeFromRow);},
  async retryWrite(id,next,attempts){await q(`update ${rel('broker_storage_writes')} set next_attempt_at=$2,attempts=$3 where write_id=$1 and status in ('pending','done')`,[id,next,attempts]);},
  async markReconciled(id,at){await q(`update ${rel('broker_storage_writes')} set status='reconciled',reconciled_at=now(),deleted_at=$2 where write_id=$1 and status='done' and finished_at<=$2::timestamptz`,[id,at]);},
  async spreadReports(f){const rows=await q(`select report_id from public.broker_spread_latest_v where issuer_id=$1 and security_ticker=$2 and currency is not distinct from $3::text and published_date >= $4::date order by institution_id`,[f.issuerId,f.securityTicker,f.currency,f.from]);const out:PublicReportBundle[]=[];for(const row of rows){const r=await this.publicReport(String(row.report_id));if(r)out.push(r);}return out;},
  async publicReports(f){const v:unknown[]=[],w:string[]=[];const bind=(x:unknown)=>{v.push(x);return `$${v.length}`;};if(f.institutionId)w.push(`r.institution_id=${bind(f.institutionId)}`);if(f.scope)w.push(`r.scope=${bind(f.scope)}`);if(f.from)w.push(`r.published_date>=${bind(f.from)}::date`);if(f.to)w.push(`r.published_date<=${bind(f.to)}::date`);if(f.issuerId||f.rating||f.securityTicker!==undefined||f.currency!==undefined)w.push(`exists (select 1 from public.broker_report_targets_public_v t where t.report_id=r.report_id${f.issuerId?` and t.issuer_id=${bind(f.issuerId)}`:''}${f.rating?` and t.rating_normalized=${bind(f.rating)}`:''}${f.securityTicker!==undefined?` and t.security_ticker=${bind(f.securityTicker)}`:''}${f.currency!==undefined?` and case when t.target_price is not null then t.target_currency when t.price_at_report is not null then t.price_currency else null end is not distinct from ${bind(f.currency)}`:''})`);if(f.hasSummary!==undefined)w.push(`${f.hasSummary?'':'not '}exists (select 1 from public.broker_report_summaries_public_v s where s.report_id=r.report_id)`);if(f.cursor)w.push(`(r.published_date,r.report_id)<(${bind(f.cursor.publishedDate)}::date,${bind(f.cursor.reportId)}::uuid)`);const reports=await q(`select r.* from public.broker_reports_public_v r${w.length?` where ${w.join(' and ')}`:''} order by r.published_date desc,r.report_id desc limit ${bind(f.limit)}`,v);if(!reports.length)return [];const ids=reports.map(r=>r.report_id),insts=[...new Set(reports.map(r=>r.institution_id).filter(Boolean))];const [targets,summaries,snippets,institutions]=await Promise.all([q(`select ${sqlColumns(PUBLIC_TARGET_COLUMNS)} from public.broker_report_targets_public_v where report_id=any($1::uuid[])`,[ids]),q(`select report_id,lang from public.broker_report_summaries_public_v where report_id=any($1::uuid[])`,[ids]),q(`select report_id from public.broker_report_snippets_public_v where report_id=any($1::uuid[])`,[ids]),q(`select * from public.research_institutions_public_v where institution_id=any($1::uuid[])`,[insts])]);return bundles(reports,targets,summaries,snippets,institutions);},
  async publicReport(id){const report=await one(`select * from public.broker_reports_public_v where report_id=$1`,[id]);if(!report)return null;const [targets,citations,snippets,summaries,analysts,institutions]=await Promise.all([q(`select ${sqlColumns(PUBLIC_TARGET_COLUMNS)} from public.broker_report_targets_public_v where report_id=$1`,[id]),q(`select ${sqlColumns(PUBLIC_CITATION_COLUMNS)} from public.broker_report_citations_v where report_id=$1 order by target_key nulls first,field,occurrence`,[id]),q(`select * from public.broker_report_snippets_public_v where report_id=$1 order by page,snippet_id`,[id]),q(`select * from public.broker_report_summaries_public_v where report_id=$1 order by lang`,[id]),q(`select * from public.broker_analysts_public_v where report_id=$1 order by display_name`,[id]),report.institution_id?q(`select * from public.research_institutions_public_v where institution_id=$1`,[report.institution_id]):Promise.resolve([] as R[])]);const [b]=bundles([report],targets,summaries,snippets,institutions);return {...b,citations:citations.map(publicRow),snippets:snippets.map(publicRow),summaries:summaries.map(publicRow),analysts:analysts.map(publicRow)};},
  async publicInstitutions(){return (await q(`select * from public.research_institutions_public_v order by name_en,institution_id`)).map(publicRow);},
  async publicAnalysts(o){return analystsDistinct(await q(`select report_id,analyst_id,display_name,institution_id from public.broker_analysts_public_v where institution_id=$1`,[o.institutionId]),o.limit);},
  async ratingHistory(o){const v:unknown[]=[o.securityTicker];let w='security_ticker=$1';if(o.institutionId){v.push(o.institutionId);w+=` and institution_id=$${v.length}`;}if(o.currency){v.push(o.currency);w+=` and target_currency=$${v.length}`;}v.push(o.limit);return (await q(`select ${sqlColumns(HISTORY_COLUMNS)} from public.broker_rating_history_v where ${w} order by published_date desc,report_id desc limit $${v.length}`,v)).map(publicRow);},
 };
}
