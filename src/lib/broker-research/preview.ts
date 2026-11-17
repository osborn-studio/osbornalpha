// src/lib/broker-research/preview.ts
// Admin preview (spec §9.1 "对外前预览", §14 acceptance 8): service-role rows assembled into the
// PublicReportDetail shape with the SAME filters as the §4.11 views — target-price values only when
// the licence allows, effective rows only (confirmed/corrected/absent, not superseded) through the
// effective-value selector, analyst rows only for public_display analysts, no title citation when a
// rewritten public title exists (the publish function's title_restricted is not computed yet), approved
// snippets ≤ N with allows_public_snippets, approved summaries with allows_public_summary — and then
// through the same whitelist DTO and the same ReportView. What differs from public: publication,
// public_enabled, evidence/disclosure flags and the licence confirmation are not required (they are
// what the preview is for). History and spread are public-view only and therefore empty.
import {effectiveValue} from './effective';
import {TARGET_PRICE_FIELDS,toPublicReportDetail} from './public-dto';
import type {AdminReadDeps} from './admin-document';
import type {ReportPageData} from './public-types';
import type {ReportStatus,ReviewStatus} from './types';

export interface PreviewMeta{status:ReportStatus;reviewStatus:ReviewStatus;metadataPublic:boolean}
export type PreviewResult={kind:'ok';data:ReportPageData;meta:PreviewMeta}|{kind:'not_found'}|{kind:'incomplete'};

export async function previewPageData(deps:AdminReadDeps,reportId:string):Promise<PreviewResult>{
 const report=await deps.db.getReport(reportId);
 if(!report||report.status==='withdrawn')return {kind:'not_found'};
 const doc=await deps.db.getDocument(report.document_id);
 if(!doc||doc.status==='withdrawn')return {kind:'not_found'};
 const lic=await deps.db.getLicence(doc.licence_id);
 if(!lic)return {kind:'not_found'};
 const [targets,fields,snippets,summaries,institutions,bindings]=await Promise.all([
  deps.db.listTargets(reportId),deps.db.listFields(reportId),deps.db.listSnippets(reportId),deps.db.listSummaries(reportId),deps.db.listInstitutions(),
  deps.db.listReportAnalysts(reportId),
 ]);
 const tpp=lic.allows_public_target_price,max=lic.snippet_max_chars;
 const inst=institutions.find(i=>i.institution_id===report.institution_id)??null;
 const analysts=inst?await deps.db.listAnalysts(inst.institution_id):[];
 const publicAnalyst=new Map(analysts.filter(a=>a.public_display).map(a=>[a.analyst_id,a]));
 const publicBindings=bindings.filter(b=>publicAnalyst.has(String(b.analyst_id)));
 const publicAnalystFields=new Set(publicBindings.map(b=>String(b.field_id)));
 const live=fields.filter(f=>(f.status==='confirmed'||f.status==='corrected'||f.status==='absent')&&f.superseded_by_run_id===null);
 const citations=live
  .filter(f=>!(TARGET_PRICE_FIELDS.has(f.field)&&!tpp)&&!(f.field==='analyst'&&!publicAnalystFields.has(f.field_id))&&!(f.field==='title'&&report.title_public!==null))
  .map(f=>{const v=effectiveValue(f);return {report_id:reportId,field_id:f.field_id,target_key:f.target_key,field:f.field,occurrence:f.occurrence,page:f.page,value_text:v.value_text,value_num:v.value_num,value_currency:v.value_currency,value_unit:v.value_unit,value_date:v.value_date,status:f.status,extractor_kind:f.extractor.startsWith('llm:')?'llm':'human'};});
 const snippetRows=lic.allows_public_snippets?snippets.filter(s=>s.status==='approved'&&s.text!==null&&s.text.length<=max).map(s=>({snippet_id:s.snippet_id,report_id:reportId,target_key:s.target_key,purpose:s.purpose,page:s.page,text:s.text,field_id:s.field_id})):[];
 const summaryRows=[];
 if(lic.allows_public_summary)for(const s of summaries.filter(x=>x.status==='approved')){
  const run=await deps.db.getRun(s.run_id);
  const grounding_assertions=(s.numeric_grounding?.assertions??[]).map(a=>({sentence_idx:a.sentence_idx,target_key:a.target_key,field:a.field,value:a.value,unit:a.unit}));   // as the view: no field_id
  summaryRows.push({summary_id:s.summary_id,report_id:reportId,lang:s.lang,kind:s.kind,model_id:run?.model_id??null,prompt_version:run?.prompt_version??null,summary_md:s.summary_md,generated_at:s.generated_at,grounding_assertions});
 }
 const titleRun=report.title_run_id?await deps.db.getRun(report.title_run_id):null;
 const title=report.title_public??report.title_original;
 const detail=toPublicReportDetail({
  report:{report_id:reportId,revision:report.revision,scope:report.scope,institution_id:report.institution_id,title,title_is_rewritten:report.title_public!==null,title_zh:report.title_zh,title_en:report.title_en,title_is_translation:report.title_run_id!==null,
   published_date:report.published_date,price_as_of_date:report.price_as_of_date,report_type:report.report_type,sector_as_stated:report.sector_as_stated,primary_target_key:report.primary_target_key,
   available_at:doc.uploaded_at,code_version:report.code_version,published_at:null,supersedes_report_id:report.supersedes_report_id,page_count:doc.page_count,snippet_max_chars:max,target_price_public:tpp,summary_public:lic.allows_public_summary,
   rules_version:null,title_model_id:titleRun?.model_id??null},   // rules_version comes from the publication's receipt: none before publish
  targets:targets.map(t=>({report_id:reportId,publication_id:report.current_publication_id,target_key:t.target_key,ticker_as_stated:t.ticker_as_stated,security_ticker:t.security_ticker,issuer_id:t.issuer_id,
   rating_raw:t.rating_raw,rating_normalized:t.rating_normalized,scale_id:t.scale_id,target_price:tpp?t.target_price:null,target_currency:tpp?t.target_currency:null,target_horizon_months:tpp?t.target_horizon_months:null,
   upside_pct:tpp?t.upside_pct:null,target_price_public:tpp,price_at_report:t.price_at_report,price_currency:t.price_currency,price_as_of_date:t.price_as_of_date,upside_formula_version:t.upside_formula_version})),
  hasSummary:{zh:summaryRows.some(s=>s.lang==='zh'),en:summaryRows.some(s=>s.lang==='en')},snippetCount:snippetRows.length,
  institution:inst?{institution_id:inst.institution_id,name_en:inst.name_en,name_zh:inst.name_zh,aliases:inst.aliases,kind:inst.kind,rating_disclosure_url:inst.rating_disclosure_url}:null,
  citations,snippets:snippetRows,summaries:summaryRows,
  analysts:publicBindings.map(b=>{const a=publicAnalyst.get(String(b.analyst_id))!;return {report_id:reportId,analyst_id:a.analyst_id,display_name:a.display_name,institution_id:a.institution_id,role:b.role??null};}),
 });
 if(!detail)return {kind:'incomplete'};
 const focus=detail.targets.find(t=>t.targetKey===detail.primaryTargetKey)??detail.targets[0]??null;
 return {kind:'ok',data:{report:detail,history:[],spread:[],focusTargetKey:focus?.targetKey??null},meta:{status:report.status,reviewStatus:report.review_status,metadataPublic:lic.allows_public_metadata}};
}
