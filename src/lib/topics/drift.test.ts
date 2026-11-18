import {expect,it,vi} from 'vitest';
import type {LatestIdentity} from '@/lib/evidence/resolve';
import {scenario,actor} from './fixtures/scenario';
import {checkDraft,publishTopic} from './publish';

const ref={v:1,kind:'macro_observation',id:'a',as_of:'2026-11-01T00:00:00Z'} as const;
const value={value_text:'4.2',unit:'pct',period:'2026-08',available_at:ref.as_of};
const latest:LatestIdentity={state:'ok',object_id:'b',value,newer_period:null,reason:null};
it.each([
 ['withheld',latest,'unchanged',null],['ok',null,'unverifiable',null],
 ['ok',{...latest,state:'retracted'},'retracted',null],['ok',{...latest,state:'withheld'},'now_withheld',null],
 ['ok',{...latest,state:'missing'},'unverifiable',null],['ok',latest,'revised',value],
 ['ok',{...latest,value:{...value,value_text:'4.3'}},'unchanged',null],
 ['ok',{...latest,object_id:'a',newer_period:'2026-09'},'newer_period',{value_text:null,unit:null,period:'2026-09',available_at:null}],
 ['ok',{...latest,newer_period:'2026-09'},'revised',value],
] as const)('classifies %s / %j',async(state,answer,drift,current_identity)=>{
 const {driftOf}=await import('./drift');
 expect(driftOf({ref,state,value_text:'4.3'},answer)).toEqual({drift,current_identity});
});

it('resumes at the persisted cursor, caching each version and counting failed lookups',async()=>{
 const {runDrift}=await import('./drift');
 const {deps,topicId}=await scenario(true);
 const {db}=deps,draft=(await db.draftOf(topicId))!,base=draft.body.evidence[0];
 draft.body.evidence=Array.from({length:400},(_,i)=>({...base,ordinal:i+1,ref:{
  ...base.ref,as_of:new Date(deps.now().getTime()-i*1000).toISOString(),
 }}));
 draft.body.sections[0].items=draft.body.evidence.map(({ordinal})=>({ordinal}));
 const {draft_hash}=await db.saveDraft({topicId,actor,expectedRevision:draft.revision,body:draft.body});
 await checkDraft(deps,{topicId,actor});
 for(let i=0;i<3;i++)await publishTopic(deps,{topicId,actor,expectedDraftHash:draft_hash});
 const ordered=(await db.liveVersionRefs()).map(v=>v.version_id).sort();
 const versionById=vi.spyOn(db,'versionById');
 const resolver={...deps.resolver,latestIdentity:vi.fn(async()=>{throw Error('offline');})};
 let ticks=0;
 expect(await runDrift({db,resolver,now:()=>new Date([0,1000,600000][Math.min(ticks++,2)])},{deadlineMs:60000})).toMatchObject({checked:500,complete:false,counts:{unverifiable:500}});
 expect(await db.settings()).toMatchObject({drift_checked_at:null,drift_cursor:{version_id:ordered[1],ordinal:100}});
 expect(await runDrift({...deps,db,resolver},{deadlineMs:250000})).toMatchObject({checked:700,complete:true});
 expect(await db.settings()).toMatchObject({drift_cursor:null,drift_checked_at:deps.now().toISOString()});
 expect(versionById).toHaveBeenCalledTimes(4);
 for(const id of ordered)expect(await db.driftOf(id)).toHaveLength(400);
 for(let i=0;i<3;i++)await db.unpublish({topicId,actor,reason:'error',note:null});
 resolver.latestIdentity.mockClear();
 await runDrift({...deps,resolver},{deadlineMs:250000});
 expect(resolver.latestIdentity).not.toHaveBeenCalled();
});
