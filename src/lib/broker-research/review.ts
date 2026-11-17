// Review and publication services: verbatim evidence, materialized rules, and SQL publish gate (spec §6.3/§6.5).
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import {resolveIssuer} from '../entities/resolve';
import {auditAdmin} from './audit';
import {BrokerError,bad,conflict,notFound} from './errors';
import {sliceText} from './extract/locate';
import {toTyped} from './extract/typed';
import {isIsoDate} from './licences';
import {artifactLoader} from './parse';
import {checkDisclosure} from './disclosure';
import {TITLE_SURFACES,applyRules,disclosureInputOf} from './rules-run';
import type {RulesOutcome} from './rules-run';
import type {BrokerDeps} from './deps';
import type {CorrectedValue,DisclosureRecheckInput,FieldAction,FieldName,FieldRow,MaterializeReceipt,ReportRow,ReportScope,ReviewPayload,ReviewQuarantineItem,ValueUnit} from './types';
type RDeps=Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>;
const FIELDS:readonly FieldName[]=['institution','analyst','published_date','price_as_of_date','ticker','rating','target_price','target_currency','target_horizon','price_at_report','price_currency','upside_stated','wacc','terminal_growth','terminal_value_share','valuation_method','sector','title'];
const ABSENT_FIELDS:readonly FieldName[]=['rating','target_price','analyst','target_horizon'];
const SCOPES:readonly ReportScope[]=['single_issuer','multi_issuer','sector','macro_strategy'];
const UNIT:Partial<Record<FieldName,ValueUnit>>={target_price:'price',price_at_report:'price',upside_stated:'pct',wacc:'pct',terminal_growth:'pct',terminal_value_share:'pct',target_horizon:'months'};
const DECIMAL=/^-?\d+(\.\d+)?$/;
const inv=(k:string)=>bad(`invalid_parameter:${k}`);
async function reportOr404(deps:Pick<BrokerDeps,'db'>,reportId:string):Promise<ReportRow>{const r=await deps.db.getReport(reportId);if(!r)throw notFound('report_not_found');return r;}
async function currentParseRun(deps:RDeps,report:ReportRow):Promise<string>{
 const doc=await deps.db.getDocument(report.document_id);if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');return doc.current_parse_run_id;
}
export interface Span{page:number;charStart:number;charEnd:number}
const spanOf=(p:Record<string,unknown>):Span|null=>{
 if(p.page===undefined&&p.charStart===undefined&&p.charEnd===undefined)return null;
 for(const k of ['page','charStart','charEnd'])if(typeof p[k]!=='number'||!Number.isSafeInteger(p[k] as number)||(p[k] as number)<0)throw inv(k);
 return {page:p.page as number,charStart:p.charStart as number,charEnd:p.charEnd as number};
};
async function sliceOr400(deps:RDeps,parseRunId:string,s:Span):Promise<string>{
 const text=sliceText((await artifactLoader(deps)(parseRunId)).pages,s.page,s.charStart,s.charEnd);
 if(text===null)throw bad('span_out_of_range');return text;
}
async function afterChange(deps:RDeps,reportId:string):Promise<RulesOutcome>{
 const {batchId}=await startBatch(deps.tables,{producer:'broker-research-review',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'});
 try{const rules=await applyRules(deps,reportId,{batchId});
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),quarantined:rules.quarantined},errors:rules.quarantined?[{code:'rules_failed_summary',message:`${rules.quarantined} quarantined`}]:[]},deps.now());return rules;
 }catch(e){await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'rules_error',message:e instanceof Error?e.message:String(e)}]},deps.now());throw e;}
}
function corrected(field:FieldName,p:Record<string,unknown>):CorrectedValue{
 if(typeof p.valueText!=='string'||!p.valueText.trim()||p.valueText.length>400)throw bad('invalid_correction:valueText');
 const t=toTyped(field,p.valueText).value;const out:CorrectedValue={value_text:p.valueText,value_num:t.value_num,value_currency:t.value_currency,value_unit:t.value_unit,value_date:t.value_date};
 if(p.valueNum!==undefined){if(p.valueNum!==null&&(typeof p.valueNum!=='string'||!DECIMAL.test(p.valueNum)))throw bad('invalid_correction:valueNum');out.value_num=p.valueNum as string|null;}
 if(p.valueCurrency!==undefined){if(p.valueCurrency!==null&&(typeof p.valueCurrency!=='string'||!/^[A-Z]{3}$/.test(p.valueCurrency)))throw bad('invalid_correction:valueCurrency');out.value_currency=p.valueCurrency as string|null;}
 if(p.valueUnit!==undefined){if(p.valueUnit!==null&&p.valueUnit!==(UNIT[field]??null))throw bad('invalid_correction:valueUnit');out.value_unit=p.valueUnit as ValueUnit|null;}
 if(p.valueDate!==undefined){if(p.valueDate!==null&&!isIsoDate(p.valueDate))throw bad('invalid_correction:valueDate');out.value_date=p.valueDate as string|null;}
 return out;
}
export async function fieldAction(deps:RDeps,reportId:string,fieldId:string,action:FieldAction,payload:Record<string,unknown>,by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId);const field=(await deps.db.listFields(reportId,{includeSuperseded:true})).find(f=>f.field_id===fieldId);
 if(!field)throw notFound('field_not_found');let rpc:Record<string,unknown>={};
 if(action==='confirm'||action==='correct'){
  const framed=spanOf(payload);const s=framed??(field.page!==null&&field.char_start!==null&&field.char_end!==null?{page:field.page,charStart:field.char_start,charEnd:field.char_end}:null);
  if(!s)throw bad('span_required');const runId=field.parse_run_id??await currentParseRun(deps,report);const text=await sliceOr400(deps,runId,s);
  const norm=(x:string)=>x.replace(/\s+/g,'');
  if(!framed&&text!==field.value_source_text)throw bad('span_not_verbatim');
  if(framed&&action==='confirm'&&norm(text)!==norm(String(field.detail.quote??field.value_text)))throw bad('span_not_verbatim');
  rpc={page:s.page,char_start:s.charStart,char_end:s.charEnd,value_source_text:text,...(framed?{detail:{framed:true}}:{})};
  if(action==='correct')rpc={...rpc,...corrected(field.field,payload)};
 }else if(action==='absent'){
  if(!ABSENT_FIELDS.includes(field.field))throw inv('field');if(typeof payload.page!=='number'||!Number.isSafeInteger(payload.page)||payload.page<1)throw inv('page');rpc={page:payload.page};
 }else if(action!=='reject')throw inv('action');
 const receipt=await deps.db.fieldReview(fieldId,action,rpc,by);return {receipt,rules:await afterChange(deps,reportId)};
}
export interface AddInput extends Span{field:FieldName;targetKey:string|null;occurrence:number;valueText:string}
export function parseAddInput(b:Record<string,unknown>):AddInput{
 if(!FIELDS.includes(b.field as FieldName))throw inv('field');if(b.targetKey!==undefined&&b.targetKey!==null&&(typeof b.targetKey!=='string'||b.targetKey.length>64))throw inv('targetKey');
 const occ=b.occurrence??1;if(typeof occ!=='number'||!Number.isSafeInteger(occ)||occ<1||occ>50)throw inv('occurrence');
 if(typeof b.valueText!=='string'||!b.valueText.trim()||b.valueText.length>400)throw inv('valueText');const s=spanOf(b);if(!s)throw bad('span_required');
 return {field:b.field as FieldName,targetKey:(b.targetKey as string|null|undefined)??null,occurrence:occ,valueText:b.valueText,...s};
}
export async function addField(deps:RDeps,reportId:string,i:AddInput,by:string):Promise<{fieldId:string;receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId),runId=await currentParseRun(deps,report),text=await sliceOr400(deps,runId,i);
 if(text!==i.valueText)throw bad('span_not_verbatim');
 const r=await deps.db.insertHumanField(reportId,{target_key:i.targetKey,field:i.field,occurrence:i.occurrence,page:i.page,char_start:i.charStart,char_end:i.charEnd,value_source_text:text,...toTyped(i.field,i.valueText).value,parse_run_id:runId,status:'confirmed'},by);
 return {...r,rules:await afterChange(deps,reportId)};
}
export async function markAbsent(deps:RDeps,reportId:string,i:{field:FieldName;targetKey:string|null;page:number},by:string):Promise<{fieldId:string;receipt:MaterializeReceipt;rules:RulesOutcome}>{
 if(!ABSENT_FIELDS.includes(i.field))throw inv('field');if(!Number.isSafeInteger(i.page)||i.page<1)throw inv('page');
 const report=await reportOr404(deps,reportId),runId=await currentParseRun(deps,report);
 if(!(await artifactLoader(deps)(runId)).pages.some(p=>p.page===i.page))throw notFound('page_not_found');
 const r=await deps.db.insertHumanField(reportId,{target_key:i.targetKey,field:i.field,occurrence:1,page:i.page,char_start:null,char_end:null,value_source_text:null,value_text:'ABSENT',value_num:null,value_currency:null,value_unit:null,value_date:null,parse_run_id:runId,status:'absent'},by);
 return {...r,rules:await afterChange(deps,reportId)};
}
export interface BindInput{institutionId?:string|null;scope?:unknown;reportType?:string|null;primaryTargetKey?:string|null;supersedesReportId?:string|null;titlePublic?:string|null;analyst?:{analystId:string;fieldId:string;role?:string|null}}
export async function bindReport(deps:RDeps,reportId:string,b:BindInput,by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 await reportOr404(deps,reportId);const patch:Parameters<RDeps['db']['updateReportDraft']>[1]={};
 const nullableStr=(v:unknown,k:string,max:number)=>{if(v!==null&&(typeof v!=='string'||!v.trim()||v.length>max))throw inv(k);return v as string|null;};
 if(b.institutionId!==undefined)patch.institution_id=nullableStr(b.institutionId,'institutionId',36);
 if(b.scope!==undefined){if(!SCOPES.includes(b.scope as ReportScope))throw inv('scope');patch.scope=b.scope as ReportScope;}
 if(b.reportType!==undefined)patch.report_type=nullableStr(b.reportType,'reportType',80);
 if(b.primaryTargetKey!==undefined)patch.primary_target_key=nullableStr(b.primaryTargetKey,'primaryTargetKey',64);
 if(b.supersedesReportId!==undefined){const v=nullableStr(b.supersedesReportId,'supersedesReportId',36);if(v===reportId)throw inv('supersedesReportId');patch.supersedes_report_id=v;}
 if(b.titlePublic!==undefined){patch.title_public=nullableStr(b.titlePublic,'titlePublic',300);patch.title_public_by=patch.title_public===null?null:by;}
 if(Object.keys(patch).length)await deps.db.updateReportDraft(reportId,patch);
 if(b.analyst){const f=(await deps.db.listFields(reportId)).find(x=>x.field_id===b.analyst!.fieldId);if(!f||f.field!=='analyst'||!['confirmed','corrected'].includes(f.status))throw bad('analyst_field_required');await deps.db.bindAnalyst({report_id:reportId,analyst_id:b.analyst.analystId,role:b.analyst.role??null,field_id:f.field_id});}
 const receipt=await deps.db.materialize(reportId);return {receipt,rules:await afterChange(deps,reportId)};
}
export async function setOverride(deps:RDeps,reportId:string,i:{targetKey:string;securityTicker:string;note:string|null},by:string):Promise<{receipt:MaterializeReceipt;rules:RulesOutcome}>{
 const report=await reportOr404(deps,reportId),doc=await deps.db.getDocument(report.document_id);if(!doc)throw notFound('document_not_found');
 const issuer=await resolveIssuer(deps.tables,{ticker:i.securityTicker},{today:doc.uploaded_at.slice(0,10)});
 const receipt=await deps.db.upsertTargetOverride({report_id:reportId,target_key:i.targetKey,security_ticker:i.securityTicker,issuer_id:issuer?.issuer_id??null,set_by:by,note:i.note});return {receipt,rules:await afterChange(deps,reportId)};
}
export async function publishBlockersOf(deps:Pick<BrokerDeps,'db'>,reportId:string):Promise<{blockers:string[];reviewReady:boolean}>{
 await reportOr404(deps,reportId);const blockers=await deps.db.publishBlockers(reportId);return {blockers,reviewReady:blockers.filter(b=>b!=='review_not_approved').length===0};
}
export async function reviewAction(deps:RDeps,reportId:string,action:'start'|'approve'|'reject',by:string):Promise<ReportRow>{
 if(action==='approve'){const {blockers,reviewReady}=await publishBlockersOf(deps,reportId);if(!reviewReady)throw conflict('review_not_ready',{blockers});}else await reportOr404(deps,reportId);
 await deps.db.updateReportDraft(reportId,{review_status:action==='start'?'in_review':action==='approve'?'approved':'rejected'});
 await auditAdmin(deps.tables,by,`broker_research.review_${action}`,reportId,{},deps.now());return reportOr404(deps,reportId);
}
export async function publishReport(deps:RDeps,reportId:string,by:string):Promise<{publicationId:string}>{
 const report=await reportOr404(deps,reportId);if(report.status!=='draft')throw conflict(report.status==='published'?'published_immutable':'report_withdrawn');
 await deps.db.materialize(reportId);await afterChange(deps,reportId);const r=await deps.db.publish(reportId,by);
 await auditAdmin(deps.tables,by,'broker_research.publish',reportId,{publication_id:r.publicationId},deps.now());return r;
}
export async function unpublishReport(deps:RDeps,reportId:string,reason:string,by:string):Promise<ReportRow>{
 const report=await reportOr404(deps,reportId);if(report.status!=='published')throw conflict('not_published');
 await deps.db.unpublish(reportId,by,reason);await deps.db.logAccess({document_id:report.document_id,user_id:by,action:'unpublish',detail:{report_id:reportId,reason}});
 await auditAdmin(deps.tables,by,'broker_research.unpublish',reportId,{reason},deps.now());return reportOr404(deps,reportId);
}
export async function recheckDisclosure(deps:RDeps,reportId:string,by:string):Promise<{restored:boolean;failures:string[]}>{
 const report=await reportOr404(deps,reportId);if(report.status==='withdrawn')throw conflict('report_withdrawn');
 const expected_digest=await deps.db.disclosureDigest(reportId),input=await disclosureInputOf(deps,report),titles:DisclosureRecheckInput['titles']={};
 for(const k of TITLE_SURFACES){const t=report[k];if(t!==null)titles[k]=checkDisclosure(t,input);}
 const snippets=Object.fromEntries((await deps.db.listSnippets(reportId)).filter(s=>s.status==='approved'&&s.text!==null).map(s=>[s.snippet_id,checkDisclosure(s.text!,input)]));
 const summaries=Object.fromEntries((await deps.db.listSummaries(reportId)).filter(s=>s.status==='approved').map(s=>[s.summary_id,checkDisclosure(s.summary_md,input)]));
 const out=await deps.db.disclosureRecheck(reportId,by,{expected_digest,titles,snippets,summaries});await auditAdmin(deps.tables,by,'broker_research.disclosure_recheck',reportId,{...out},deps.now());return out;
}
export async function reviewData(deps:RDeps,reportId:string):Promise<{payload:ReviewPayload;log:{document_id:string;user_id:string;action:'text_viewed';detail:Record<string,unknown>}}>{
 const report=await reportOr404(deps,reportId),doc=await deps.db.getDocument(report.document_id);if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 const [licence,fields,targets,snippets,summaries,runs,blockers,institutions,analysts,reportAnalysts]=await Promise.all([deps.db.getLicence(doc.licence_id),deps.db.listFields(reportId,{includeSuperseded:true}),deps.db.listTargets(reportId),deps.db.listSnippets(reportId),deps.db.listSummaries(reportId),deps.db.listRuns(doc.document_id),deps.db.publishBlockers(reportId),deps.db.listInstitutions(),report.institution_id?deps.db.listAnalysts(report.institution_id):Promise.resolve([]),deps.db.listReportAnalysts(reportId)]);
 if(!licence)throw new BrokerError('licence_not_found',500);
 const quarantine:ReviewQuarantineItem[]=(await deps.tables.select('dq_quarantine',{dataset:'broker_research',status:'open'},{limit:1000})).filter(q=>String(q.natural_key).startsWith(`${doc.sha256}:`)).map(q=>({id:String(q.id),reason_code:String(q.reason_code),natural_key:String(q.natural_key),payload:(q.payload??{}) as Record<string,unknown>,created_at:String(q.created_at)}));
 return {payload:{report,document:doc,licence,fields,targets,snippets,summaries,runs,blockers,quarantine,institutions,analysts,reportAnalysts},log:{document_id:doc.document_id,user_id:'',action:'text_viewed',detail:{report_id:reportId,surface:'review'}}};
}
export async function pageText(deps:RDeps,documentId:string,page:number){
 const doc=await deps.db.getDocument(documentId);if(!doc)throw notFound('document_not_found');if(doc.status==='withdrawn')throw new BrokerError('document_withdrawn',410);
 if(!doc.current_parse_run_id)throw conflict('document_not_parsed');const a=await artifactLoader(deps)(doc.current_parse_run_id),p=a.pages.find(x=>x.page===page);
 if(!p)throw notFound('page_not_found');return {payload:{documentId,parseRunId:doc.current_parse_run_id,page,text:p.text,pageCount:a.page_count},log:{document_id:documentId,user_id:'',action:'text_viewed' as const,detail:{page,parse_run_id:doc.current_parse_run_id}}};
}
export type {FieldRow};
