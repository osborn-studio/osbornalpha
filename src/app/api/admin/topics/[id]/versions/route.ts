// Topic plan T6.8: authenticated version history.
import {adminGet,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {TopicError} from '@/lib/topics/errors';
import {loadVersionRows} from '@/lib/topics/publish';
export const GET=adminGet<{params:Promise<{id:string}>}>('[admin/topics] versions',async({ctx})=>{
 const id=uuidParam((await ctx.params).id),{db}=await adminDeps(),topic=await db.topicById(id);
 if(!topic)throw new TopicError('not_found');
 return jsonNoStore({versions:await loadVersionRows(db,topic)});
});
