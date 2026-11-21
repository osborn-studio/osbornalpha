// Re-run rules after accepting a broker quarantine item, keyed by document SHA (spec §7.3).
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import {applyRules} from './rules-run';
import type {CoreDeps} from './deps';
export async function afterRulesForItem(deps:Pick<CoreDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>,naturalKey:string):Promise<'ok'|'failed'|'skipped'>{
 let batchId:string|undefined;
 const failed=async(message:string):Promise<'failed'>=>{
  if(batchId)await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'rules_error',message}]},deps.now()).catch(()=>{});
  return 'failed';
 };
 try{
  ({batchId}=await startBatch(deps.tables,{producer:'broker-research-review',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'}));
  if(!/^[0-9a-f]{64}:/.test(naturalKey))return failed('invalid_natural_key');
  const doc=await deps.db.findDocumentBySha(naturalKey.split(':')[0]);const report=doc?await deps.db.reportByDocument(doc.document_id):null;
  if(!report||report.status!=='draft'){await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[]},deps.now());return 'skipped';}
  await deps.db.materialize(report.report_id);
  const r=await applyRules(deps,report.report_id,{batchId});
  if((await deps.db.getReport(report.report_id))?.rules_input_hash!==r.inputHash)return failed('receipt_stale');
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),quarantined:r.quarantined},errors:r.quarantined?[{code:'rules_failed_summary'}]:[]},deps.now());return 'ok';
 }catch(e){const message=e instanceof Error?e.message:String(e);console.error('[broker-research] rules after quarantine resolve failed',message);return failed(message);}
}
