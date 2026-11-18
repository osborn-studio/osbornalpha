// Topic plan T5.2: draft read and optimistic revision save.
import {adminGet,adminPost,intField,jsonNoStore,uuidParam} from '@/lib/topics/admin-route';
import {adminDeps} from '@/lib/topics/admin-deps';
import {draftLint,parseDraftBody} from '@/lib/topics/drafts';
import {draftEvidenceView} from '@/lib/topics/evidence-search';
import {TopicError} from '@/lib/topics/errors';
type Context={params:Promise<{id:string}>};
export const GET=adminGet<Context>('[admin/topics] draft',async({ctx})=>{
 const id=uuidParam((await ctx.params).id),deps=await adminDeps(),{db}=deps;
 const topic=await db.topicById(id),draft=await db.draftOf(id);
 if(!topic||!draft)throw new TopicError('not_found');
 return jsonNoStore({
  topic:{topic_id:topic.topic_id,topic_slug:topic.topic_slug,category:topic.category,status:topic.status,current_version_id:topic.current_version_id},
  draft:{revision:draft.revision,draft_hash:draft.draft_hash,body:draft.body,updated_at:draft.updated_at},lint:draftLint(draft.body),evidence:await draftEvidenceView(deps,draft.body),
 });
});
export const PUT=adminPost<Context>('[admin/topics] save draft',async({ctx,body,userId})=>{
 const topicId=uuidParam((await ctx.params).id),expectedRevision=intField(body,'expected_revision',1,Number.MAX_SAFE_INTEGER),draft=parseDraftBody(body.body);
 const deps=await adminDeps();
 const saved=await deps.db.saveDraft({topicId,expectedRevision,body:draft,actor:userId});
 return jsonNoStore({...saved,lint:draftLint(draft),evidence:await draftEvidenceView(deps,draft)});
});
