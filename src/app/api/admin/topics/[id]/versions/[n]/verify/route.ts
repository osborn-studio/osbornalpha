import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {TopicError} from '@/lib/topics/errors';
import {verifyVersion} from '@/lib/topics/verify';

export const POST=adminPost<{params:Promise<{id:string;n:string}>}>('[admin/topics] verify',async({ctx,userId})=>{
 const {id,n}=await ctx.params,topicId=uuidParam(id),versionNo=Number(n);
 if(!/^[1-9]\d*$/.test(n)||!Number.isSafeInteger(versionNo))throw new TopicError('invalid_parameter:n');
 return jsonNoStore(await verifyVersion(await adminDeps(),{topicId,versionNo,actor:userId}));
});
