// Topic plan T6.5: publish route.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {publishTopic} from '@/lib/topics/publish';
import {TopicError} from '@/lib/topics/errors';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] publish',async({ctx,userId,body})=>{
 const topicId=uuidParam((await ctx.params).id),deps=await adminDeps();
 const expectedDraftHash=body.expected_draft_hash;
 if(typeof expectedDraftHash!=='string'||!/^[a-f0-9]{64}$/i.test(expectedDraftHash))throw new TopicError('invalid_body:expected_draft_hash');
 return jsonNoStore(await publishTopic(deps,{topicId,actor:userId,expectedDraftHash:expectedDraftHash.toLowerCase()}));
});
