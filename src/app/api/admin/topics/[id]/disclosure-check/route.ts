// Topic plan T6.4: disclosure-check route.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {checkDraft} from '@/lib/topics/publish';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] disclosure-check',async({ctx,userId})=>{
 const topicId=uuidParam((await ctx.params).id),deps=await adminDeps();
 return jsonNoStore(await checkDraft(deps,{topicId,actor:userId}));
});
