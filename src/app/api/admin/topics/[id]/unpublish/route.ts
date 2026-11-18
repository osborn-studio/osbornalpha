// Topic plan T6.5: unpublish route.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {unpublishTopic,withdrawalFields} from '@/lib/topics/publish';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] unpublish',async({ctx,userId,body})=>{
 const topicId=uuidParam((await ctx.params).id),deps=await adminDeps();
 return jsonNoStore(await unpublishTopic(deps,{topicId,actor:userId,...withdrawalFields(body)}));
});
