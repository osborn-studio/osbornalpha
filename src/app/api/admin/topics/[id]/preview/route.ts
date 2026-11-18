// Topic plan T6.4: preview route.
import {adminGet,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {previewDraft} from '@/lib/topics/publish';
export const GET=adminGet<{params:Promise<{id:string}>}>('[admin/topics] preview',async({ctx,userId})=>{
 const topicId=uuidParam((await ctx.params).id),deps=await adminDeps();
 return jsonNoStore(await previewDraft(deps,{topicId,actor:userId}));
});
