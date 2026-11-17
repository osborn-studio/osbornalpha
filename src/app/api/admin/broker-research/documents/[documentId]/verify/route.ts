// src/app/api/admin/broker-research/documents/[documentId]/verify/route.ts
// Admin single-document "re-run verify" (spec §8.3): same R1 re-check as the cron, restore=true (a pass
// sets evidence_ok back to true via setReportFlags), manual batch, NO recordAttempt (the cron stays the
// single producer of dataset freshness). Not ★: returns outcomes only, no text or spans. C's adminPost
// supplies 401/403/415/403-origin/400 invalid_json and no-store; BrokerError → status via toErrorResponse.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {coreDeps} from '@/lib/broker-research/deps';
import {conflict,gone,notFound} from '@/lib/broker-research/errors';
import {VERIFY_BUDGET_MS,runVerify} from '@/lib/broker-research/verify';

export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{documentId:string}>}
export const POST=adminPost<Ctx>('documents.verify',async({ctx})=>{
 const documentId=uuidParam((await ctx.params).documentId,'documentId');
 const deps=coreDeps();
 const doc=await deps.db.getDocument(documentId);
 if(!doc)throw notFound('document_not_found');
 if(doc.status==='withdrawn')throw gone();
 const receipt=await runVerify(deps,{deadline:new Date(Date.now()+VERIFY_BUDGET_MS),triggeredBy:'manual',recordFreshness:false,documentId,restore:true});
 if(receipt.checked===0)throw conflict('not_published');
 return jsonNoStore({batchId:receipt.batchId,status:receipt.status,outcome:receipt.results[0]?.outcome??'error'});
});
