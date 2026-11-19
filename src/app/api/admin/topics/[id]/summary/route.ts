import {adminPost,enumField,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {adminFixtureMode} from '@/lib/topics/admin-fixture-mode';
import {handleSummaryRequest} from '@/lib/topics/summary/request';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] summary',async({ctx,userId,body})=>{
 const topicId=uuidParam((await ctx.params).id),locale=enumField(body,'locale',['zh','en'] as const),request_id=uuidParam(body.request_id,'request_id');
 const llm=adminFixtureMode()?(await import('@/lib/topics/fixtures/summary')).fixtureSummaryLlm(locale):(await import('@/lib/topics/summary/llm-deps')).topicLlmDeps(userId);
 const result=await handleSummaryRequest({...await adminDeps(),llm},userId,{topicId,locale,request_id});
 return jsonNoStore(result.body,result.status);
});
