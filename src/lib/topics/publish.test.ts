// Topic plan T6.4–T6.5: preview and atomic publication.
import {expect,it,vi} from 'vitest';
import {createResolver,type EvidenceResolver} from '@/lib/evidence/resolve';
import {macroResolver} from '@/lib/evidence/resolvers/macro';
import {actor,scenario,hashOf} from './fixtures/scenario';
import {checkDraft,previewDraft,publishTopic,unpublishTopic} from './publish';

it('previews every ordinal, masks public values and records only the preview event',async()=>{
 const {deps,topicId}=await scenario(),before=await deps.db.auditOf(topicId);
 const p=await previewDraft(deps,{topicId,actor});
 expect(p.difference.map(e=>e.ordinal)).toEqual([1,2,3,4]);
 expect(p.difference[0]).toMatchObject({public:{state:'ok',text:'4.3%'},admin:{text:'4.3%'}});
 expect(p.difference[2]).toMatchObject({public:{state:'withheld',text:null},admin:{text:expect.any(String)}});
 expect(p).toMatchObject({masked:1,degraded:false,counts:{ok:3,withheld:1},dossier:{version:{version_no:1,is_current:true},total_versions:1,current_version_no:null,drift_unchecked:true}});
 expect(JSON.stringify(p.dossier)).not.toContain('987654321.12');
 expect(await deps.db.versionsOfTopic(topicId)).toEqual([]);
 expect((await deps.db.auditOf(topicId)).slice(before.length)).toEqual([expect.objectContaining({actor,action:'preview',detail:{draft_hash:await hashOf(deps,topicId),masked:1}})]);
});
it('publishes edited drafts as linked versions and restores the previous current version',async()=>{
 const {deps,topicId}=await scenario();
 const publish=async()=>{await checkDraft(deps,{topicId,actor});return publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});};
 const v1=await publish();expect(v1).toMatchObject({version_no:1,evidence:4,counts:{ok:3,withheld:1}});
 const draft=(await deps.db.draftOf(topicId))!;draft.body.title.en='Edited';
 await deps.db.saveDraft({topicId,actor,body:draft.body,expectedRevision:draft.revision});
 expect(await publish()).toMatchObject({version_no:2});
 expect((await deps.db.versionsOfTopic(topicId))[1].supersedes_version_id).toBe(v1.version_id);
 expect(await unpublishTopic(deps,{topicId,actor,reason:'error',note:null})).toEqual({current_version_no:1});
});
it.each(['draft_changed','absent receipt','failed receipt','resolver_degraded','private_reference'])('writes no version on %s',async(mode)=>{
 const {deps,topicId}=await scenario();
 if(mode==='failed receipt')deps.privateIds=async()=>new Set(['Unemployment']);
 if(mode!=='absent receipt')await checkDraft(deps,{topicId,actor});
 if(mode==='private_reference')deps.privateIds=async()=>new Set(['Unemployment']);
 if(mode==='resolver_degraded'){
  const resolve=deps.resolver.resolve;
  vi.spyOn(deps.resolver,'resolve').mockImplementation(async(...args)=>{
   const out=await resolve(...args);out.receipt.errors.push({index:0,kind:'macro_observation',message:'unavailable'});return out;
  });
 }
 const code=mode==='resolver_degraded'?mode:'publish_blocked:'+(mode.endsWith('receipt')?'disclosure_required':mode);
 await expect(publishTopic(deps,{topicId,actor,expectedDraftHash:mode==='draft_changed'?'0'.repeat(64):await hashOf(deps,topicId)})).rejects.toMatchObject({code});
 expect(await deps.db.versionsOfTopic(topicId)).toEqual([]);
});
it('blocks an ok macro projection with third-party rights at both gates',async()=>{
 const {deps,topicId,sources}=await scenario(true);
 await checkDraft(deps,{topicId,actor});
 sources.seed.macro.series.find(s=>s.id==='US_UNRATE')!.rights='third_party';
 const macro=macroResolver(sources);
 const stub:EvidenceResolver={...macro,resolve:(refs,ctx)=>macro.resolve(refs,{...ctx,audience:'admin'})};
 deps.resolver=createResolver([stub]);
 const problems=[{ordinal:1,kind:'macro_observation',problem:'licence_unconfirmed'}];
 const before=await deps.db.auditOf(topicId);
 await expect(publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)})).rejects.toMatchObject({code:'publish_blocked:licence_unconfirmed',detail:{problems}});
 expect(await deps.db.auditOf(topicId)).toEqual(before);expect(await deps.db.versionsOfTopic(topicId)).toEqual([]);
 const checked=await checkDraft(deps,{topicId,actor});expect(checked).toMatchObject({passed:false,blocked:['licence_unconfirmed']});
 expect(checked.checks[1]).toMatchObject({key:'evidence_audience',result:'block',detail:{licence:problems}});
});
