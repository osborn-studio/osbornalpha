import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {decideSummary} from '@/lib/topics/summary/workflow';
export const POST=adminPost<{params:Promise<{id:string;summaryId:string}>}>('[admin/topics] approve summary',async({ctx,userId})=>{
 const params=await ctx.params,topicId=uuidParam(params.id),summaryId=uuidParam(params.summaryId,'summaryId');
 return jsonNoStore(await decideSummary((await adminDeps()).db,topicId,summaryId,'approve',userId));
});
