// Materialized report rules, private evidence checks, receipt and quarantine (spec §6.2/§7.2).
import {quarantine} from '../dq/quarantine';
import {checkDisclosure} from './disclosure';
import type {DisclosureInput} from './disclosure';
import {BrokerError} from './errors';
import type {PageText} from './extract/locate';
import {artifactLoader} from './parse';
import {QUARANTINE_DATASET,QUARANTINE_TABLE,evaluateRules} from './rules';
import type {VersionPeer} from './rules';
import {RULES_VERSION} from './versions';
import type {BrokerDeps} from './deps';
import type {AnalystRow,ReportRow,RuleResult,TargetRow} from './types';

export const TITLE_SURFACES=['title_original','title_public','title_zh','title_en'] as const;
export interface RulesOutcome{receiptId:string;results:RuleResult[];quarantined:number;warnings:number;blockingFailures:number;unverifiedFieldIds:string[];infoCodes:string[]}
type RulesDeps=Pick<BrokerDeps,'db'|'storage'|'tables'|'codeVersion'>;
export async function boundAnalysts(deps:Pick<BrokerDeps,'db'>,report:ReportRow):Promise<AnalystRow[]>{
 const bound=await deps.db.listReportAnalysts(report.report_id);if(!bound.length)return [];
 const pool=report.institution_id?await deps.db.listAnalysts(report.institution_id):[];
 const out=bound.map(b=>pool.find(a=>a.analyst_id===b.analyst_id));
 if(out.some(a=>a===undefined))throw new BrokerError('rules_error',500,{reason:'bound_analyst_outside_institution'});
 return out as AnalystRow[];
}
export async function disclosureInputOf(deps:Pick<BrokerDeps,'db'>,report:ReportRow,targets?:TargetRow[]):Promise<DisclosureInput>{
 const doc=await deps.db.getDocument(report.document_id);const licence=doc?await deps.db.getLicence(doc.licence_id):null;
 if(!licence)throw new BrokerError('rules_error',500,{reason:'licence_missing'});
 const ts=targets??await deps.db.listTargets(report.report_id);
 return {allowsPublicTargetPrice:licence.allows_public_target_price,targets:ts.map(t=>({target_key:t.target_key,target_price:t.target_price,upside_pct:t.upside_pct})),
  analysts:(await boundAnalysts(deps,report)).map(a=>({analyst_id:a.analyst_id,display_name:a.display_name,name_variants:a.name_variants,public_display:a.public_display}))};
}
export function titleDisclosureResults(report:ReportRow,input:DisclosureInput):RuleResult[]{
 return TITLE_SURFACES.filter(k=>report[k]!==null).map(surface=>{
  const c=checkDisclosure(report[surface]!,input);
  const reason=c.passed?null:c.hits.some(h=>h.kind==='restricted_name')?'restricted_name':'restricted_value';
  return {rule:'disclosure',passed:c.passed,blocking:false,target_key:null,reason_code:reason,detail:{surface,hits:c.hits,version:c.version,inputs_hash:c.inputs_hash}};
 });
}
export async function applyRules(deps:RulesDeps,reportId:string,o:{batchId:string}):Promise<RulesOutcome>{
 const report=await deps.db.getReport(reportId);if(!report)throw new BrokerError('report_not_found',404);
 if(!report.rules_input_hash)throw new BrokerError('materialize_stale',409);
 const document=await deps.db.getDocument(report.document_id);if(!document)throw new BrokerError('document_not_found',404);
 const [fields,targets]=await Promise.all([deps.db.listFields(reportId),deps.db.listTargets(reportId)]);
 const ratingScales=report.institution_id?await deps.db.listRatingScales(report.institution_id):[];
 const load=artifactLoader(deps),artifacts=new Map<string,PageText>();
 for(const id of new Set(fields.map(f=>f.parse_run_id).filter((x):x is string=>x!==null))){try{artifacts.set(id,(await load(id)).pages);}catch{/* R1 records unavailable artifacts. */}}
 const peers:VersionPeer[]=[];
 if(report.institution_id)for(const r of await deps.db.listReports({institutionId:report.institution_id})){
  if(r.report_id===reportId||r.status==='withdrawn')continue;
  const t=await deps.db.listTargets(r.report_id);
  peers.push({report_id:r.report_id,institution_id:r.institution_id,published_date:r.published_date,title_original:r.title_original,
   security_tickers:t.map(x=>x.security_ticker).filter((x):x is string=>x!==null)});
 }
 const out=evaluateRules({report,documentSha256:document.sha256,uploadedAt:document.uploaded_at,fields,targets,ratingScales,artifacts,peers});
 const results=[...out.results,...titleDisclosureResults(report,await disclosureInputOf(deps,report,targets))];
 const receiptId=await deps.db.insertRuleReceipt({report_id:reportId,rules_version:RULES_VERSION,input_hash:report.rules_input_hash,results,code_version:deps.codeVersion});
 for(const q of out.quarantines)await quarantine(deps.tables,{dataset:QUARANTINE_DATASET,table:QUARANTINE_TABLE,naturalKey:q.naturalKey,reasonCode:q.reasonCode,payload:q.payload,
  detail:{report_id:reportId,receipt_id:receiptId,rules_version:RULES_VERSION,rule:q.rule},batchId:o.batchId});
 return {receiptId,results,quarantined:out.quarantines.length,warnings:out.results.filter(r=>r.rule==='horizon_present_with_target'&&!r.passed).length,
  blockingFailures:results.filter(r=>!r.passed&&r.blocking).length,unverifiedFieldIds:out.unverifiedFieldIds,infoCodes:out.infoCodes};
}
