// Re-run rules after accepting a broker quarantine item, keyed by document SHA (spec §7.3).
import {finishBatch,startBatch,emptyCounts} from '../dq/batches';
import {applyRules} from './rules-run';
import type {CoreDeps} from './deps';
export async function afterRulesForItem(deps:Pick<CoreDeps,'db'|'storage'|'tables'|'codeVersion'|'now'>,naturalKey:string):Promise<'ok'|'failed'>{
 let batchId:string|undefined;
 try{
  const doc=await deps.db.findDocumentBySha(naturalKey.split(':')[0]);const report=doc?await deps.db.reportByDocument(doc.document_id):null;
  if(!report||report.status!=='draft')return 'failed';
  await deps.db.materialize(report.report_id);
  ({batchId}=await startBatch(deps.tables,{producer:'broker-research-review',dataset:'broker_research',codeVersion:deps.codeVersion,triggeredBy:'manual'}));
  const r=await applyRules(deps,report.report_id,{batchId});
  await finishBatch(deps.tables,batchId,{counts:{...emptyCounts(),quarantined:r.quarantined},errors:r.quarantined?[{code:'rules_failed_summary'}]:[]},deps.now());return 'ok';
 }catch(e){
  if(batchId)await finishBatch(deps.tables,batchId,{counts:emptyCounts(),errors:[{code:'rules_error',message:e instanceof Error?e.message:String(e)}]},deps.now()).catch(()=>{});
  console.error('[broker-research] rules after quarantine resolve failed',e instanceof Error?e.message:e);return 'failed';
 }
}
