// src/lib/broker-research/db.ts
// BrokerResearchDb over Supabase (spec §4.14, plan §共享契约). Private methods use the service-role
// client (tables + RPCs of 20261119091000); public methods use the anon client and read only the
// §4.11 views. Every write that needs a lock, a lease, server time, an attempts counter or a hash
// is an RPC; plain CRUD goes through .from() (the A1 triggers still guard it). numeric columns are
// selected `::text` so decimals never pass through JS numbers; timestamps are normalised to
// toISOString(). Errors: SQL `raise '<code>[:<detail>]'` → BrokerResearchDbError(code, message,
// detail); 23505 → duplicate_key; other 23xxx → constraint_violation (detail = constraint name).
// The normalisers, column lists and bundle builder below are shared with pgBrokerResearchDb (A5).
// New RPCs are not registered in database.types.ts (repo convention): the client is narrowed here.
import type {SupabaseClient} from '@supabase/supabase-js';
import {BrokerResearchDbError} from './types';
import type {AccessLogInput,AnalystRow,BrokerResearchDb,DocumentRow,EvalReceiptRow,FieldRow,InstitutionRow,IntentRow,LicenceRow,MaterializeReceipt,OutboxEvent,PublicReportBundle,PublicationRow,PurgeStepRow,PurgeTextStep,RatingScaleRow,ReportAnalystRow,ReportRow,RuleReceiptRow,RunRow,SettingsRow,SnippetRow,StorageWriteRow,SummaryRow,TargetRow} from './types';
export {BrokerResearchDbError} from './types';
export type {BrokerResearchDb} from './types';

export const READ_PAGE=1000;
export const DEFAULT_QUEUE_LIMIT=50;
type R=Record<string,unknown>;

export interface PgErrorLike{message?:string;code?:string|null;details?:string|null}
/** PostgreSQL / PostgREST error → BrokerResearchDbError (shared by the Supabase and pg adapters). */
export function toBrokerResearchDbError(e:PgErrorLike):BrokerResearchDbError{
 if(e instanceof BrokerResearchDbError)return e;
 const message=e.message??'';
 if(e.code==='23505')return new BrokerResearchDbError('duplicate_key',message,/constraint "([^"]+)"/.exec(message)?.[1]);
 if(e.code==='55P03'||message==='lease_lost')return new BrokerResearchDbError('lease_lost',message);
 const m=/^([a-z][a-z0-9_]*)(?::([\s\S]*))?$/.exec(message);
 if(m&&(!e.code?.startsWith('23')||m[1]==='append_only'))return new BrokerResearchDbError(m[1],message,m[2]);
 if(e.code?.startsWith('23'))return new BrokerResearchDbError('constraint_violation',message,/constraint "([^"]+)"/.exec(message)?.[1]);
 return new BrokerResearchDbError('unknown',message||'unknown');
}

export const isoTs=(v:unknown):string=>new Date(String(v)).toISOString();
const isoOrNull=(v:unknown):string|null=>v===null||v===undefined?null:isoTs(v);
const numOrNull=(v:unknown):number|null=>v===null||v===undefined?null:Number(v);
const strOrNull=(v:unknown):string|null=>v===null||v===undefined?null:String(v);
function norm<T>(r:R,o:{ts?:string[];num?:string[];dec?:string[]}):T{
 const x:R={...r};
 for(const k of o.ts??[])if(k in x)x[k]=isoOrNull(x[k]);
 for(const k of o.num??[])if(k in x)x[k]=numOrNull(x[k]);
 for(const k of o.dec??[])if(k in x)x[k]=strOrNull(x[k]);
 return x as T;
}
export const settingsFromRow=(r:R):SettingsRow=>{const x=norm<R>(r,{ts:['approved_gold_corpus_at','updated_at']});delete x.id;return x as unknown as SettingsRow;};
export const licenceFromRow=(r:R)=>norm<LicenceRow>(r,{ts:['confirmed_at','created_at','updated_at']});
export const intentFromRow=(r:R)=>norm<IntentRow>(r,{ts:['created_at','expires_at','checkpoint_at'],num:['byte_size']});
export const documentFromRow=(r:R)=>norm<DocumentRow>(r,{ts:['uploaded_at','lease_until','last_verified_at','withdrawn_at','purged_at','purge_requested_at'],num:['byte_size']});
export const runFromRow=(r:R)=>norm<RunRow>(r,{ts:['started_at','finished_at']});
export const reportFromRow=(r:R)=>norm<ReportRow>(r,{ts:['created_at','updated_at']});
export const targetFromRow=(r:R)=>norm<TargetRow>(r,{dec:['target_price','price_at_report','upside_pct']});
export const fieldFromRow=(r:R)=>norm<FieldRow>(r,{ts:['reviewed_at','created_at'],dec:['value_num'],num:['extractor_confidence']});
export const snippetFromRow=(r:R)=>norm<SnippetRow>(r,{ts:['approved_at','created_at']});
export const summaryFromRow=(r:R)=>norm<SummaryRow>(r,{ts:['approved_at','generated_at']});
export const publicationFromRow=(r:R)=>norm<PublicationRow>(r,{ts:['published_at','unpublished_at']});
export const ruleReceiptFromRow=(r:R)=>norm<RuleReceiptRow>(r,{ts:['created_at']});
export const institutionFromRow=(r:R)=>norm<InstitutionRow>(r,{ts:['created_at']});
export const scaleFromRow=(r:R)=>norm<RatingScaleRow>(r,{ts:['created_at','closed_at']});
export const analystFromRow=(r:R)=>norm<AnalystRow>(r,{ts:['created_at']});
export const evalFromRow=(r:R)=>norm<EvalReceiptRow>(r,{ts:['ran_at'],num:['precision_min','recall_min']});
export const outboxFromRow=(r:R)=>norm<OutboxEvent>(r,{ts:['created_at','delivered_at']});
export const purgeFromRow=(r:R)=>norm<PurgeStepRow>(r,{ts:['at']});
export const writeFromRow=(r:R)=>norm<StorageWriteRow>(r,{ts:['started_at','finished_at','reconciled_at','next_attempt_at','deleted_at'],num:['attempts']});
export const accessFromRow=(r:R)=>norm<AccessLogInput&{id:string;created_at:string}>(r,{ts:['created_at']});
export const PUBLIC_TS=['available_at','published_at','generated_at','prev_available_at','last_available_at'];
/** A public view row: timestamps ISO; decimals arrive as text (casts in the column lists). */
export const publicRow=(r:R):R=>norm<R>(r,{ts:PUBLIC_TS});
export function receiptFrom(x:unknown):MaterializeReceipt{
 const o=(x??{}) as R;
 return {effectiveHash:String(o.effectiveHash),materializedHash:String(o.materializedHash),targets:Number(o.targets),basis:o.basis as MaterializeReceipt['basis']};
}

// Column lists: PostgREST `alias:column::text` syntax; pg converts them with sqlColumns().
export const FIELD_COLUMNS='field_id,report_id,parse_run_id,run_id,superseded_by_run_id,target_key,field,occurrence,value_text,value_num:value_num::text,value_currency,value_unit,value_date,page,char_start,char_end,value_source_text,extractor,extractor_confidence,status,corrected,conflict_group,detail,reviewed_by,reviewed_at,created_at';
export const TARGET_COLUMNS='report_id,target_key,basis,ticker_as_stated,security_ticker,issuer_id,resolution,rating_raw,rating_normalized,scale_id,target_price:target_price::text,target_currency,target_horizon_months,price_at_report:price_at_report::text,price_currency,price_as_of_date,upside_pct:upside_pct::text,upside_formula_version,input_hash';
export const PUBLIC_TARGET_COLUMNS='report_id,publication_id,target_key,ticker_as_stated,security_ticker,issuer_id,rating_raw,rating_normalized,scale_id,target_price:target_price::text,target_currency,target_horizon_months,upside_pct:upside_pct::text,target_price_public,price_at_report:price_at_report::text,price_currency,price_as_of_date,upside_formula_version';
export const PUBLIC_CITATION_COLUMNS='report_id,field_id,target_key,field,occurrence,page,value_text,value_num:value_num::text,value_currency,value_unit,value_date,status,extractor_kind';
export const HISTORY_COLUMNS='report_id,prev_report_id,target_key,institution_id,security_ticker,issuer_id,published_date,prev_published_date,rating_normalized,prev_rating_normalized,scale_id,prev_scale_id,target_price:target_price::text,prev_target_price:prev_target_price::text,target_currency,upside_formula_version,prev_upside_formula_version,code_version,prev_code_version,available_at,prev_available_at';
/** PostgREST column list → SQL select list ("a:b::text" → "b::text as a"). */
/** purgeReportText step → table and column patch (shared with pgBrokerResearchDb; quarantine_payload is handled per adapter). */
export const PURGE_TEXT:Record<Exclude<PurgeTextStep,'quarantine_payload'>,{table:string;patch:R;key:string}>={
 fields_text:{table:'broker_report_fields',patch:{value_source_text:null,corrected:null,status:'rejected'},key:'field_id'},   // corrected_iff: a rejected row has no correction
 snippets_text:{table:'broker_report_snippets',patch:{text:null,status:'rejected'},key:'snippet_id'},
 summaries:{table:'broker_report_summaries',patch:{status:'rejected'},key:'summary_id'},
};
/** verifyCandidates order: last_verified_at asc, never verified first, then document_id. */
export const verifyOrder=(a:DocumentRow,b:DocumentRow)=>{
 const x=a.last_verified_at,y=b.last_verified_at;
 const c=x===y?0:x===null?-1:y===null?1:x<y?-1:1;
 return c||(a.document_id<b.document_id?-1:a.document_id>b.document_id?1:0);
};
/** Distinct analysts of broker_analysts_public_v rows (one row per report binding) with report_count. */
export function analystsDistinct(rows:R[],limit:number):R[]{
 const m=new Map<string,R>();
 for(const r of rows){const k=String(r.analyst_id);const x=m.get(k);if(x)x.report_count=Number(x.report_count)+1;else m.set(k,{analyst_id:r.analyst_id,display_name:r.display_name,institution_id:r.institution_id,report_count:1});}
 return [...m.values()].sort((a,b)=>byStr('display_name')(a,b)||byStr('analyst_id')(a,b)).slice(0,limit);
}
export const sqlColumns=(list:string)=>list.split(',').map(c=>{const m=/^(\w+):(\w+)::text$/.exec(c);return m?`${m[2]}::text as ${m[1]}`:c;}).join(', ');

const byStr=(k:string)=>(a:R,b:R)=>{const x=String(a[k]??''),y=String(b[k]??'');return x<y?-1:x>y?1:0;};
/** Assembles list bundles from the public view rows of one page of reports (order of `reports` kept). */
export function bundles(reports:R[],targets:R[],summaries:R[],snippets:R[],institutions:R[]):PublicReportBundle[]{
 return reports.map(r=>({
  report:publicRow(r),
  targets:targets.filter(t=>t.report_id===r.report_id).map(publicRow).sort(byStr('target_key')),
  hasSummary:{zh:summaries.some(x=>x.report_id===r.report_id&&x.lang==='zh'),en:summaries.some(x=>x.report_id===r.report_id&&x.lang==='en')},
  snippetCount:snippets.filter(x=>x.report_id===r.report_id).length,
  institution:institutions.find(i=>i.institution_id===r.institution_id)??null,
 }));
}
/** fencedUpdateDocument patch → broker_document_fenced_update arguments. */
export function fencedArgs(patch:Partial<Pick<DocumentRow,'status'|'current_parse_run_id'|'page_count'>>&{releaseLease?:boolean}){
 const {releaseLease,...rest}=patch;
 return {patch:Object.fromEntries(Object.entries(rest).filter(([,v])=>v!==undefined)),release:releaseLease===true};
}
export const dropUndefined=<T extends R>(o:T):Partial<T>=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as Partial<T>;

interface Res{data:unknown;error:PgErrorLike|null}
type Builder=PromiseLike<Res>&{[k:string]:(...a:unknown[])=>Builder};
interface NarrowClient{rpc:(fn:string,args:R)=>PromiseLike<Res>;from:(t:string)=>Builder}

export function supabaseBrokerResearchDb(clients:{admin?:SupabaseClient|null;anon?:SupabaseClient|null}):BrokerResearchDb{
 const admin=()=>{if(!clients.admin)throw new BrokerResearchDbError('admin_client_required');return clients.admin as unknown as NarrowClient;};
 const anon=()=>{if(!clients.anon)throw new BrokerResearchDbError('anon_client_required');return clients.anon as unknown as NarrowClient;};
 const run=async<T>(q:PromiseLike<Res>):Promise<T>=>{const {data,error}=await q;if(error)throw toBrokerResearchDbError(error);return data as T;};
 const call=<T>(fn:string,args:R)=>run<T>(admin().rpc(fn,args));
 const from=(t:string)=>admin().from(t);
 /** Complete-set read in a fixed order (PostgREST max_rows truncates silently). */
 const pageAll=async(make:()=>Builder,limit?:number):Promise<R[]>=>{
  const out:R[]=[];
  for(let start=0;;){
   const size=limit===undefined?READ_PAGE:Math.min(READ_PAGE,limit-out.length);
   if(size<=0)return out;
   const part=(await run<R[]|null>(make().range(start,start+size-1)))??[];
   if(part.length===0)return out;
   out.push(...part);start+=part.length;   // a server row cap below READ_PAGE shortens a page but never ends the read (P-R3-05)
  }
 };
 const maybe=async(q:Builder)=>(await run<R|null>(q.maybeSingle()));
 const required=async(q:Builder,what:string)=>{const r=await maybe(q);if(!r)throw new BrokerResearchDbError('not_found',`not_found:${what}`,what);return r;};
 const pub=(t:string)=>anon().from(t);
 return {
  async getSettings(){return settingsFromRow(await required(from('broker_research_settings').select('*').eq('id',1),'settings'));},
  async setPublicEnabled(flag,by){await run(from('broker_research_settings').update({public_enabled:flag,updated_by:by,updated_at:new Date().toISOString()}).eq('id',1));},
  async setApprovedGoldCorpus(hash,by){const at=new Date().toISOString();await run(from('broker_research_settings').update({approved_gold_corpus_hash:hash,approved_gold_corpus_by:hash===null?null:by,approved_gold_corpus_at:hash===null?null:at,updated_by:by,updated_at:at}).eq('id',1));},
  async listLicences(){return (await pageAll(()=>from('broker_report_licences').select('*').order('created_at').order('licence_id'))).map(licenceFromRow);},
  async getLicence(id){const r=await maybe(from('broker_report_licences').select('*').eq('licence_id',id));return r?licenceFromRow(r):null;},
  async insertLicence(input){return licenceFromRow(await run<R>(from('broker_report_licences').insert(input).select('*').single()));},
  async updateLicence(id,patch){return licenceFromRow(await required(from('broker_report_licences').update(dropUndefined(patch)).eq('licence_id',id).select('*'),'licence'));},
  async confirmLicence(id,by,version){
   const hit=(await run<R[]|null>(from('broker_report_licences').update({confirmed_by:by,confirmed_at:new Date().toISOString(),confirmed_version:version}).eq('licence_id',id).eq('version',version).select('licence_id')))??[];
   if(hit.length)return 'confirmed';
   await required(from('broker_report_licences').select('licence_id').eq('licence_id',id),'licence');
   return 'version_mismatch';
  },
  async insertIntent(row){await run(from('broker_report_upload_intents').insert(row));},
  async getIntent(id){const r=await maybe(from('broker_report_upload_intents').select('*').eq('intent_id',id));return r?intentFromRow(r):null;},
  async transitionIntent(id,fromStatus,to,patch){
   const hit=(await run<R[]|null>(from('broker_report_upload_intents').update({status:to,...dropUndefined(patch??{})}).eq('intent_id',id).eq('status',fromStatus).select('intent_id')))??[];
   return hit.length>0;
  },
  async findDocumentBySha(sha){const r=await maybe(from('broker_report_documents').select('*').eq('sha256',sha));return r?documentFromRow(r):null;},
  async getDocument(id){const r=await maybe(from('broker_report_documents').select('*').eq('document_id',id));return r?documentFromRow(r):null;},
  async insertDocument(row){
   const {error}=await from('broker_report_documents').insert({...row,status:'uploaded',promotion_pending:true});
   if(!error)return 'inserted';
   const e=toBrokerResearchDbError(error);if(e.code==='duplicate_key')return 'duplicate';throw e;
  },
  async withdrawWithIntent(id,reason,purge,by){await call('broker_document_withdraw',{p_document:id,p_reason:reason,p_purge:purge,p_by:by});},
  async updateDocument(id,patch){await run(from('broker_report_documents').update(dropUndefined(patch)).eq('document_id',id));},
  async claimLease(id,token,ttl){return (await call<unknown>('broker_document_claim_lease',{p_document:id,p_token:token,p_ttl_seconds:ttl}))===true;},
  async renewLease(id,token,ttl){return await call<'ok'|'lease_lost'|'document_withdrawn'>('broker_document_renew_lease',{p_document:id,p_token:token,p_ttl_seconds:ttl});},
  async fencedUpdateDocument(id,token,patch){const a=fencedArgs(patch);return await call<'ok'|'lease_lost'>('broker_document_fenced_update',{p_document:id,p_token:token,p_patch:a.patch,p_release:a.release});},
  async insertRun(row){await run(from('broker_report_runs').insert({...row,detail:row.detail??{}}));},
  async finishRun(runId,token,patch){return await call<'ok'|'lease_lost'>('broker_run_finish',{p_run:runId,p_token:token,p_patch:dropUndefined(patch)});},
  async getRun(id){const r=await maybe(from('broker_report_runs').select('*').eq('run_id',id));return r?runFromRow(r):null;},
  async listRuns(documentId){return (await pageAll(()=>from('broker_report_runs').select('*').eq('document_id',documentId).order('started_at').order('run_id'))).map(runFromRow);},
  async ensureReport(documentId,codeVersion){
   await run(from('broker_research_reports').upsert({document_id:documentId,code_version:codeVersion},{onConflict:'document_id',ignoreDuplicates:true}));
   return reportFromRow(await required(from('broker_research_reports').select('*').eq('document_id',documentId),'report'));
  },
  async getReport(id){const r=await maybe(from('broker_research_reports').select('*').eq('report_id',id));return r?reportFromRow(r):null;},
  async reportByDocument(id){const r=await maybe(from('broker_research_reports').select('*').eq('document_id',id));return r?reportFromRow(r):null;},
  async listReports(opts){return (await pageAll(()=>from('broker_research_reports').select('*').eq('institution_id',opts.institutionId).order('created_at').order('report_id'))).map(reportFromRow);},
  async updateReportDraft(id,patch){const p=dropUndefined(patch);if(Object.keys(p).length)await run(from('broker_research_reports').update(p).eq('report_id',id));},
  async setReportFlags(id,flags){const p=dropUndefined(flags);if(Object.keys(p).length)await required(from('broker_research_reports').update(p).eq('report_id',id).select('report_id'),'report');},
  async extractCommit(documentId,token,runId,rows){return receiptFrom(await call('broker_extract_commit',{p_document_id:documentId,p_lease_token:token,p_run_id:runId,p_rows:rows}));},
  async fieldReview(fieldId,action,payload,by){return receiptFrom(await call('broker_field_review',{p_field_id:fieldId,p_action:action,p_payload:payload,p_by:by}));},
  async insertHumanField(reportId,row,by){const x=await call<R>('broker_field_add',{p_report_id:reportId,p_row:row,p_by:by});return {fieldId:String(x.field_id),receipt:receiptFrom(x.receipt)};},
  async upsertTargetOverride(row){return receiptFrom(await call('broker_target_override',{p_report_id:row.report_id,p_target_key:row.target_key,p_security_ticker:row.security_ticker,p_issuer_id:row.issuer_id,p_by:row.set_by,p_note:row.note}));},
  async materialize(id){return receiptFrom(await call('broker_report_materialize',{p_report_id:id}));},
  async listFields(reportId,opts){
   return (await pageAll(()=>{let q=from('broker_report_fields').select(FIELD_COLUMNS).eq('report_id',reportId);if(!opts?.includeSuperseded)q=q.is('superseded_by_run_id',null);
    return q.order('target_key',{ascending:true,nullsFirst:true}).order('field').order('occurrence').order('created_at').order('field_id');})).map(fieldFromRow);
  },
  async listTargets(reportId){return (await pageAll(()=>from('broker_report_targets').select(TARGET_COLUMNS).eq('report_id',reportId).order('target_key'))).map(targetFromRow);},
  async bindAnalyst(row){await run(from('broker_report_analysts').upsert(row,{onConflict:'report_id,analyst_id'}));},
  async listReportAnalysts(reportId){return (await pageAll(()=>from('broker_report_analysts').select('report_id,analyst_id,role,field_id').eq('report_id',reportId).order('analyst_id'))) as unknown as ReportAnalystRow[];},
  async insertRuleReceipt(row){return String((await run<R>(from('broker_report_rule_receipts').insert(row).select('receipt_id').single())).receipt_id);},
  async insertSnippet(row){return String((await run<R>(from('broker_report_snippets').insert({...row,status:'draft'}).select('snippet_id').single())).snippet_id);},
  async setSnippetStatus(id,patch){await run(from('broker_report_snippets').update(dropUndefined(patch)).eq('snippet_id',id));},
  async getSnippet(id){const r=await maybe(from('broker_report_snippets').select('*').eq('snippet_id',id));return r?snippetFromRow(r):null;},
  async listSnippets(reportId){return (await pageAll(()=>from('broker_report_snippets').select('*').eq('report_id',reportId).order('created_at').order('snippet_id'))).map(snippetFromRow);},
  async summaryCommit(documentId,token,runId,row){return String(await call('broker_summary_commit',{p_document:documentId,p_token:token,p_run:runId,p_row:row}));},
  async titleCommit(documentId,token,runId,titles){await call('broker_title_commit',{p_document:documentId,p_token:token,p_run:runId,p_titles:titles});return 'ok';},
  async extractSetScope(documentId,token,runId,scope){return receiptFrom(await call('broker_extract_set_scope',{p_document:documentId,p_token:token,p_run:runId,p_scope:scope}));},
  async extractFinalize(documentId,token,runId,detail){await call('broker_extract_finalize',{p_document:documentId,p_token:token,p_run:runId,p_detail:detail});return 'ok';},
  async insertSummary(row){return String((await run<R>(from('broker_report_summaries').insert(row).select('summary_id').single())).summary_id);},
  async setSummaryStatus(id,patch){await run(from('broker_report_summaries').update(dropUndefined(patch)).eq('summary_id',id));},
  async getSummary(id){const r=await maybe(from('broker_report_summaries').select('*').eq('summary_id',id));return r?summaryFromRow(r):null;},
  async listSummaries(reportId){return (await pageAll(()=>from('broker_report_summaries').select('*').eq('report_id',reportId).order('generated_at').order('summary_id'))).map(summaryFromRow);},
  async publishBlockers(id){return ((await call<string[]|null>('broker_report_publish_blockers',{p_report_id:id}))??[]).map(String);},
  async disclosureDigest(id){return String(await call('broker_report_disclosure_digest',{p_report_id:id}));},
  async disclosureRecheck(id,by,checks){const x=await call<R>('broker_report_disclosure_recheck',{p_report_id:id,p_by:by,p_checks:checks});return {restored:x.restored===true,failures:((x.failures??[]) as unknown[]).map(String)};},
  async publish(id,by){return {publicationId:String(await call('broker_report_publish',{p_report_id:id,p_by:by}))};},
  async unpublish(id,by,reason){await call('broker_report_unpublish',{p_report_id:id,p_by:by,p_reason:reason});},
  async getPublication(id){const r=await maybe(from('broker_report_publications').select('*').eq('publication_id',id));return r?publicationFromRow(r):null;},
  async upsertInstitution(row){
   if(row.institution_id){
    const patch=dropUndefined(row);delete patch.institution_id;
    if(Object.keys(patch).length){
     const updated=await maybe(from('research_institutions').update(patch).eq('institution_id',row.institution_id).select('institution_id'));
     if(updated)return String(updated.institution_id);
    }else if(await maybe(from('research_institutions').select('institution_id').eq('institution_id',row.institution_id)))return row.institution_id;
   }
   return String((await run<R>(from('research_institutions').insert(row).select('institution_id').single())).institution_id);
  },
  async listInstitutions(){return (await pageAll(()=>from('research_institutions').select('*').order('name_en').order('institution_id'))).map(institutionFromRow);},
  async insertRatingScale(row){return String((await run<R>(from('research_rating_scales').insert(row).select('scale_id').single())).scale_id);},
  async closeRatingScale(id,validTo,by){await required(from('research_rating_scales').update({valid_to:validTo,closed_by:by}).eq('scale_id',id).select('scale_id'),'rating_scale');},
  async listRatingScales(inst){return (await pageAll(()=>from('research_rating_scales').select('*').eq('institution_id',inst).order('raw_label').order('valid_from').order('scale_id'))).map(scaleFromRow);},
  async upsertAnalyst(row){
   if(row.analyst_id){
    const patch=dropUndefined(row);delete patch.analyst_id;
    if(Object.keys(patch).length){
     const updated=await maybe(from('research_analysts').update(patch).eq('analyst_id',row.analyst_id).select('analyst_id'));
     if(updated)return String(updated.analyst_id);
    }else if(await maybe(from('research_analysts').select('analyst_id').eq('analyst_id',row.analyst_id)))return row.analyst_id;
   }
   return String((await run<R>(from('research_analysts').insert(row).select('analyst_id').single())).analyst_id);
  },
  async listAnalysts(inst){return (await pageAll(()=>from('research_analysts').select('*').eq('institution_id',inst).order('display_name').order('analyst_id'))).map(analystFromRow);},
  async reviewQueue(opts){
   const statuses=opts.status?[opts.status]:['pending','in_review'];
   return (await pageAll(()=>from('broker_research_reports').select('*').eq('status','draft').in('review_status',statuses).order('updated_at').order('report_id'),opts.limit??DEFAULT_QUEUE_LIMIT)).map(reportFromRow);
  },
  async logAccess(row){await run(from('broker_report_access_log').insert(row));},
  async listAccessLog(opts){
   return (await pageAll(()=>{let q=from('broker_report_access_log').select('*');if(opts.documentId)q=q.eq('document_id',opts.documentId);return q.order('created_at',{ascending:false}).order('id',{ascending:false});},opts.limit)).map(accessFromRow);
  },
  async insertEvalReceipt(row){return String((await run<R>(from('broker_eval_receipts').insert(row).select('receipt_id').single())).receipt_id);},
  async latestEvalReceipt(digest){
   const rows=(await run<R[]|null>(from('broker_eval_receipts').select('*').eq('behavior_digest',digest).order('ran_at',{ascending:false}).order('receipt_id',{ascending:false}).limit(1)))??[];
   return rows[0]?evalFromRow(rows[0]):null;
  },
  async takePendingOutbox(limit){return (await pageAll(()=>from('broker_outbox').select('*').eq('status','pending').order('created_at').order('event_id'),limit)).map(outboxFromRow);},
  async markOutbox(id,outcome){await call('broker_outbox_mark',{p_event:id,p_delivered:outcome.delivered,p_error:outcome.delivered?null:outcome.error});},
  async upsertPurgeStep(documentId,step,outcome){await call('broker_purge_step_record',{p_document:documentId,p_step:step,p_ok:outcome.ok,p_error:outcome.ok?null:outcome.error});},
  async purgeSteps(documentId){return (await pageAll(()=>from('broker_purge_steps').select('*').eq('document_id',documentId).order('step'))).map(purgeFromRow);},
  async purgeReportText(reportId,step){
   const r=await required(from('broker_research_reports').select('report_id,status,document_id').eq('report_id',reportId),'report');
   if(r.status!=='withdrawn')throw new BrokerResearchDbError('report_not_withdrawn');
   if(step==='quarantine_payload'){
    const d=await required(from('broker_report_documents').select('sha256').eq('document_id',String(r.document_id)),'document');
    return ((await run<R[]|null>(from('dq_quarantine').update({payload:{}}).eq('dataset','broker_research').like('natural_key',`${String(d.sha256)}:%`).select('id')))??[]).length;
   }
   const t=PURGE_TEXT[step];
   return ((await run<R[]|null>(from(t.table).update(t.patch).eq('report_id',reportId).select(t.key)))??[]).length;
  },
  async quarantineResolve(id,status,by,payload){return await call<'resolved'|'not_found'|'already_resolved'>('broker_quarantine_resolve',{p_id:id,p_status:status,p_by:by,p_payload:payload});},
  async verifyCandidates(limit){
   const ids=[...new Set((await pageAll(()=>from('broker_research_reports').select('document_id').eq('status','published').order('report_id'))).map(r=>String(r.document_id)))];
   const docs:DocumentRow[]=[];
   for(let i=0;i<ids.length;i+=200)docs.push(...((await run<R[]|null>(from('broker_report_documents').select('*').in('document_id',ids.slice(i,i+200))))??[]).map(documentFromRow));
   return docs.sort(verifyOrder).slice(0,limit);
  },
  async registerWrite(row){return String((await run<R>(from('broker_storage_writes').insert(row).select('write_id').single())).write_id);},
  async abandonWrite(id){await run(from('broker_storage_writes').update({status:'abandoned'}).eq('write_id',id).eq('status','pending'));},
  async finishWrite(id){await run(from('broker_storage_writes').update({status:'done',finished_at:new Date().toISOString()}).eq('write_id',id).eq('status','pending'));},
  async writesFor(documentId){return (await pageAll(()=>from('broker_storage_writes').select('*').eq('document_id',documentId).order('started_at').order('write_id'))).map(writeFromRow);},
  async pendingWritesFor(documentId){return (await pageAll(()=>from('broker_storage_writes').select('*').eq('document_id',documentId).eq('status','pending').order('started_at').order('write_id'))).map(writeFromRow);},
  async unreconciledWrites(limit){
   // Explicit durable intent, including incomplete purges; failures move back in the persisted retry order.
   return (await pageAll(()=>from('broker_storage_writes').select('*,broker_report_documents!inner(purge_requested_at)').in('status',['pending','done']).not('broker_report_documents.purge_requested_at','is',null).lte('next_attempt_at',new Date().toISOString()).order('next_attempt_at').order('write_id'),limit))
    .map(r=>{const {broker_report_documents:_d,...x}=r;void _d;return writeFromRow(x);});
  },
  async retryWrite(id,nextAttemptAt,attempts){await run(from('broker_storage_writes').update({next_attempt_at:nextAttemptAt,attempts}).eq('write_id',id).in('status',['pending','done']));},
  async markReconciled(id,deletedAt){await run(from('broker_storage_writes').update({status:'reconciled',reconciled_at:new Date().toISOString(),deleted_at:deletedAt}).eq('write_id',id).eq('status','done').lte('finished_at',deletedAt));},
  // ---- public: anon client, views only
  async spreadReports(f){
   const rows=await pageAll(()=>{
    let q=pub('broker_spread_latest_v').select('*').eq('issuer_id',f.issuerId).eq('security_ticker',f.securityTicker).gte('published_date',f.from).order('institution_id');
    q=f.currency===null?q.is('currency',null):q.eq('currency',f.currency);return q;
   }); // exhaust institution pages; no finite guard
   const out:PublicReportBundle[]=[];
   for(const row of rows){const r=await this.publicReport(String(row.report_id));if(r)out.push(r);}
   return out;
  },
  async publicReports(filter){
   // every filter is a column predicate of broker_reports_public_v, evaluated in the database together with the keyset
   // cursor (P-R3-05): no client-side id sets, so the PostgREST row cap can never drop a matching report
   const build=()=>{
    let q=pub('broker_reports_public_v').select('*');
    // issuer and rating are correlated on the same target: one object with both keys, jsonb @> (P-R4-02; = pg exists, = memory)
    const facet={...(filter.issuerId?{issuer_id:filter.issuerId}:{}),...(filter.rating?{rating:filter.rating}:{}),...(filter.securityTicker!==undefined?{security_ticker:filter.securityTicker}:{}),...(filter.currency!==undefined?{currency:filter.currency}:{})};
    if(Object.keys(facet).length)q=q.contains('target_facets',JSON.stringify([facet]));   // ONE element must hold every key (P-R4-02, P-R5-04)
    if(filter.hasSummary!==undefined)q=q.eq('has_summary',filter.hasSummary);
    if(filter.institutionId)q=q.eq('institution_id',filter.institutionId);
    if(filter.scope)q=q.eq('scope',filter.scope);
    if(filter.from)q=q.gte('published_date',filter.from);
    if(filter.to)q=q.lte('published_date',filter.to);
    if(filter.cursor)q=q.or(`published_date.lt.${filter.cursor.publishedDate},and(published_date.eq.${filter.cursor.publishedDate},report_id.lt.${filter.cursor.reportId})`);
    return q.order('published_date',{ascending:false}).order('report_id',{ascending:false});
   };
   // the parent page is filled up to filter.limit through ordered range reads (P-R4-03): a server row cap below the
   // requested page size yields more round trips, never a short page while matching reports remain
   const reports=await pageAll(build,filter.limit);
   if(!reports.length)return [];
   const page=reports.map(r=>String(r.report_id));
   const insts=[...new Set(reports.map(r=>r.institution_id).filter((x):x is string=>typeof x==='string'))];
   // child rows of the page can exceed the row cap (e.g. 200 multi-issuer reports): read them completely, in a fixed order
   const [targets,summaries,snippets,institutions]=await Promise.all([
    pageAll(()=>pub('broker_report_targets_public_v').select(PUBLIC_TARGET_COLUMNS).in('report_id',page).order('report_id').order('target_key')),
    pageAll(()=>pub('broker_report_summaries_public_v').select('report_id,lang').in('report_id',page).order('report_id').order('lang')),
    pageAll(()=>pub('broker_report_snippets_public_v').select('report_id,snippet_id').in('report_id',page).order('report_id').order('snippet_id')),
    insts.length?pageAll(()=>pub('research_institutions_public_v').select('*').in('institution_id',insts).order('institution_id')):Promise.resolve([] as R[]),
   ]);
   return bundles(reports,targets??[],summaries??[],snippets??[],institutions??[]);
  },
  async publicReport(id){
   const report=await run<R|null>(pub('broker_reports_public_v').select('*').eq('report_id',id).maybeSingle());
   if(!report)return null;
   const [targets,citations,snippets,summaries,analysts,institutions]=await Promise.all([
    pageAll(()=>pub('broker_report_targets_public_v').select(PUBLIC_TARGET_COLUMNS).eq('report_id',id).order('target_key')),
    pageAll(()=>pub('broker_report_citations_v').select(PUBLIC_CITATION_COLUMNS).eq('report_id',id).order('target_key',{nullsFirst:true}).order('field').order('occurrence').order('field_id')),
    pageAll(()=>pub('broker_report_snippets_public_v').select('*').eq('report_id',id).order('page').order('snippet_id')),
    pageAll(()=>pub('broker_report_summaries_public_v').select('*').eq('report_id',id).order('lang').order('summary_id')),
    pageAll(()=>pub('broker_analysts_public_v').select('*').eq('report_id',id).order('display_name').order('analyst_id')),
    report.institution_id?pageAll(()=>pub('research_institutions_public_v').select('*').eq('institution_id',String(report.institution_id)).order('institution_id')):Promise.resolve([] as R[]),
   ]);
   const [b]=bundles([report],targets??[],summaries??[],snippets??[],institutions??[]);
   return {...b,citations:citations??[],snippets:snippets??[],summaries:(summaries??[]).map(publicRow),analysts:analysts??[]};
  },
  async publicInstitutions(){return (await pageAll(()=>pub('research_institutions_public_v').select('*').order('name_en').order('institution_id'))).map(publicRow);},
  async publicAnalysts(opts){return analystsDistinct(await pageAll(()=>pub('broker_analysts_public_v').select('report_id,analyst_id,display_name,institution_id').eq('institution_id',opts.institutionId).order('report_id').order('analyst_id')),opts.limit);},
  async ratingHistory(opts){
   let q=pub('broker_rating_history_v').select(HISTORY_COLUMNS).eq('security_ticker',opts.securityTicker);
   if(opts.institutionId)q=q.eq('institution_id',opts.institutionId);
   if(opts.currency)q=q.eq('target_currency',opts.currency);
   return (await pageAll(()=>q.order('published_date',{ascending:false}).order('report_id',{ascending:false}).order('target_key'),opts.limit)).map(publicRow);
  },
 };
}
