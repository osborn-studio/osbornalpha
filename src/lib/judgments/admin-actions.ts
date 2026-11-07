// src/lib/judgments/admin-actions.ts
// Admin settlement corrections (spec §5.3, §9.5, §10): withdrawn (settled → withdrawn) and reopened
// (void | withdrawn → reopened) through append_settlement with lease token null and actor
// admin:<uuid>. The request key is admin:<request_id> and the payload is built only from the request
// and the immutable judgment row, so a retried request is byte-identical and answers already_applied
// (R06) instead of request_key_conflict. Each call records an ingest_batches receipt (dataset
// judgments.settle, triggered_by manual); invalid transitions surface as settlement_sequence (409).
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts} from '../dq/batches';
import {errorCodeOf} from './route-utils';
import type {AppendStatus,JudgmentsDb,SettlementInsert} from './types';

export type AdminAction='withdrawn'|'reopened';
export interface AdminActionInput{db:JudgmentsDb;tables:TableClient;judgmentId:string;kind:AdminAction;reason:string;requestId:string;adminId:string;codeVersion:string}
export type AdminActionResult=
 |{outcome:'unknown_judgment'}
 |{outcome:AppendStatus;seq:number;batchId:string}
 |{outcome:'settlement_sequence';batchId:string};
export const HTTP_OF:Record<AdminActionResult['outcome'],number>={applied:200,already_applied:200,already_final:409,request_key_conflict:409,settlement_sequence:409,unknown_judgment:404};

export async function appendAdminSettlement(x:AdminActionInput):Promise<AdminActionResult>{
 const j=await x.db.getJudgment(x.judgmentId);
 if(!j)return {outcome:'unknown_judgment'};
 const {batchId}=await startBatch(x.tables,{producer:'ts-judgments',dataset:'judgments.settle',codeVersion:x.codeVersion,triggeredBy:'manual'});
 const row:SettlementInsert={kind:x.kind,outcome:null,realized:null,evidence:{admin_action:x.kind},resolver:j.condition?.resolver??'none',resolver_version:'admin',
  reason:x.reason,actor:`admin:${x.adminId}`,code_version:x.codeVersion,batch_id:batchId};
 const counts:BatchCounts={...emptyCounts(),fetched:1};
 try{
  const r=await x.db.appendSettlement(x.judgmentId,null,`admin:${x.requestId}`,row);
  if(r.status==='applied')counts.versioned=1;else if(r.status==='request_key_conflict')counts.failed=1;else counts.duplicates=1;
  await finishBatch(x.tables,batchId,{counts,errors:r.status==='request_key_conflict'?[{code:'request_key_conflict',key:x.judgmentId}]:[]});
  return {outcome:r.status,seq:r.seq,batchId};
 }catch(e){
  const code=errorCodeOf(e);
  counts.failed=1;
  await finishBatch(x.tables,batchId,{counts,errors:[{code,key:x.judgmentId}]});
  if(code==='settlement_sequence')return {outcome:'settlement_sequence',batchId};
  throw e;
 }
}
