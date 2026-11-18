// Topic plan T5.3: admin-only evidence picker.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {parseEvidenceQuery,searchEvidence} from '@/lib/topics/evidence-search';
import {TopicError} from '@/lib/topics/errors';
type Context={params:Promise<{id:string}>};
export const POST=adminPost<Context>('[admin/topics] evidence search',async({ctx,body})=>{
 const id=uuidParam((await ctx.params).id),deps=adminDeps();
 if(!await deps.db.topicById(id))throw new TopicError('not_found');
 const {query,asOf}=parseEvidenceQuery(body);
 return jsonNoStore({candidates:await searchEvidence(deps,query,asOf)});
});
