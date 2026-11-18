import {expect,it,vi} from 'vitest';
import {memoryTableClient} from '@/lib/db/memory-table-client';
import {scenario,actor,hashOf} from './fixtures/scenario';
import {checkDraft,publishTopic} from './publish';

it('skips restricted drift and frozen non-ok, retains ref cutoffs and checks state before digest',async()=>{
 const {verifyVersion}=await import('./verify');
 const {deps,topicId}=await scenario(),tables=memoryTableClient();
 await checkDraft(deps,{topicId,actor});
 const {version_id}=await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 const version=(await deps.db.versionById(version_id))!;
 await deps.db.upsertDrift([{version_id,ordinal:1,drift:'retracted',current_identity:null},{version_id,ordinal:4,drift:'now_withheld',current_identity:null}],deps.now().toISOString(),true,null);
 const resolve=vi.fn<typeof deps.resolver.resolve>(async(refs,ctx)=>{
  expect(refs).toEqual([version.snapshot.evidence[1].ref]);expect(ctx.audience).toBe('public');
  const result=await deps.resolver.resolve(refs,ctx);
  result.resolved[0].state='missing';result.resolved[0].digest=null;
  return result;
 });
 const db={...deps.db,versionsOfTopic:async()=>[{...version,snapshot_text:version.snapshot_text+' '}]};
 const result=await verifyVersion({...deps,db,tables,resolver:{...deps.resolver,resolve}},{actor,topicId,versionNo:1});
 expect(result).toEqual({version_no:1,matched:0,skipped:3,mismatched:[{ordinal:0,reason:'snapshot_hash'},{ordinal:2,reason:'state_changed'}]});
 expect(resolve).toHaveBeenCalledOnce();
});
