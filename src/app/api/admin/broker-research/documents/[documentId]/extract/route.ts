// Admin POST for licensed extraction of a parsed private document (spec §6.2/§8.2).
import {adminPost,errorJson,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runExtract} from '@/lib/broker-research/extract/run';
export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{documentId:string}>}
export const POST=adminPost<Ctx>('documents.extract',async({ctx,userId})=>{
 const r=await runExtract(brokerDeps(),uuidParam((await ctx.params).documentId),userId,{deadline:deadlineFrom(new Date())});
 return r.status==='succeeded'?jsonNoStore(r):errorJson(r.errorCode!,r.errorCode==='lease_lost'?409:502,{runId:r.runId,batchStatus:r.batchStatus});
});
