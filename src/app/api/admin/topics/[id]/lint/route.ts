// Topic plan T5.5 commander decision 1: advisory lint, no persistence.
import {adminPost,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {parseDraftBody,draftLint} from '@/lib/topics/drafts';
import {draftEvidenceView} from '@/lib/topics/evidence-search';
import {TopicError} from '@/lib/topics/errors';
export const POST=adminPost<{params:Promise<{id:string}>}>('[admin/topics] lint',async({ctx,body})=>{
 const id=uuidParam((await ctx.params).id),deps=await adminDeps();
 if(!await deps.db.topicById(id)||!await deps.db.draftOf(id))throw new TopicError('not_found');
 const draft=parseDraftBody(body.body);
 return jsonNoStore({lint:draftLint(draft),evidence:await draftEvidenceView(deps,draft)});
});
