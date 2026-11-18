// Topic plan T6.6: retire route.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {retireTopic,withdrawalFields} from '@/lib/topics/publish';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] retire',async({ctx,userId,body})=>{
 const topicId=uuidParam((await ctx.params).id),deps=await adminDeps();
 return jsonNoStore(await retireTopic(deps,{topicId,actor:userId,...withdrawalFields(body)}));
});
