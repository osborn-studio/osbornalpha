// Admin POST to run a licensed F3 parse (spec §6.2/§8.2).
import {adminPost,errorJson,jsonNoStore,uuidParam} from '@/lib/broker-research/admin-route';
import {brokerDeps,deadlineFrom} from '@/lib/broker-research/deps';
import {runParse} from '@/lib/broker-research/parse';
export const dynamic='force-dynamic';
export const maxDuration=300;
interface Ctx{params:Promise<{documentId:string}>}
export const POST=adminPost<Ctx>('documents.parse',async({ctx,userId})=>{
 const start=new Date();const r=await runParse(brokerDeps(),uuidParam((await ctx.params).documentId),userId,{deadline:deadlineFrom(start)});
 if(r.status==='succeeded')return jsonNoStore(r);
 return errorJson(r.errorCode!,r.errorCode==='lease_lost'?409:502,{runId:r.runId,batchStatus:r.batchStatus});
});
