// src/lib/topics/db-contract.ts
// One behaviour suite, run against memory (db.test.ts) and PostgreSQL (topics.integration.test.ts).
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {TopicsDbError,type DraftBody,type EvidenceRowInput,type TopicsDb,type TopicSnapshot} from './types';

export interface TopicsContractHarness{db:TopicsDb;newId():string;setPublic(on:boolean):Promise<void>;asPublic():TopicsDb}
const body=(title:string):DraftBody=>({title:{zh:title,en:title},dek:{zh:'',en:''},sections:[],evidence:[],expected_slots:[],entries:[],blocks_provenance:{}});
export function fixtureVersion(h:TopicsContractHarness,slug:string,states:EvidenceRowInput['state'][]=['ok']):{snapshotText:string;evidence:EvidenceRowInput[]}{
 const evidence=states.map((state,i):EvidenceRowInput=>{
  const ref={v:1 as const,kind:'macro_observation' as const,id:h.newId(),as_of:'2026-11-01T00:00:00.000Z'};
  return {ordinal:i+1,kind:ref.kind,ref,ref_hash:sha256Hex(canonicalJson(ref)),as_of:ref.as_of,state,digest:state==='ok'?sha256Hex(`d${i}`):null,section_key:'s1'};
 });
 const counts={ok:0,missing:0,withheld:0,not_served:0,unsupported:0,retracted:0};for(const e of evidence)counts[e.state]++;
 const snapshot={topic:{slug,category:'macro',title:{zh:slug,en:slug},dek:{zh:'',en:''}},sections:[],expected_slots:[],entries:[],summary:null,counts,
  freshness_at_publication:{},contract_version:'evidence-ref/1',resolver_versions:{},
  evidence:evidence.map(e=>({ordinal:e.ordinal,ref:e.ref,ref_hash:e.ref_hash,section_key:e.section_key,resolved:{state:e.state,reason:e.state==='ok'?null:'fixture',ref:e.ref,basis:null,
   display:{label:{zh:'x',en:'x'},fact:e.state==='ok'?{template:'topic.macro_level',slots:{value:{value_text:'4.3',unit:'pct'}}}:null,period:'2026-08',available_at:null},
   drawer:null,digest:e.digest,freshness:null}}))} as unknown as TopicSnapshot;
 return {snapshotText:canonicalJson(snapshot),evidence};
}
export function topicsDbContract(label:string,setup:()=>Promise<TopicsContractHarness>):void{
 describe(`${label}: TopicsDb contract`,()=>{
  const actor='00000000-0000-4000-8000-0000000000aa';
  const make=async(h:TopicsContractHarness,slug:string,states?:EvidenceRowInput['state'][])=>{
   const t=await h.db.createTopic({slug,category:'macro',body:body(slug),actor});
   const receiptId=await h.db.recordDisclosure({topicId:t.topic_id,draftHash:t.draft_hash,checks:[],passed:true,codeVersion:'test',actor});
   const v=fixtureVersion(h,slug,states);
   const p=await h.db.publish({topicId:t.topic_id,expectedDraftHash:t.draft_hash,...v,summaryId:null,receiptId,cutoff:'2026-11-10T00:00:00.000Z',actor});
   return {...t,...p,...v};
  };
  it('creates a topic with draft revision 1 and the canonical draft hash',async()=>{
   const h=await setup();const t=await h.db.createTopic({slug:`${label}-c1`,category:'macro',body:body('a'),actor});
   expect(t.revision).toBe(1);expect(t.draft_hash).toBe(sha256Hex(canonicalJson(body('a'))));
  });
  it('rejects a reused slug with slug_taken',async()=>{
   const h=await setup();await h.db.createTopic({slug:`${label}-c2`,category:'macro',body:body('a'),actor});
   await expect(h.db.createTopic({slug:`${label}-c2`,category:'macro',body:body('b'),actor})).rejects.toEqual(new TopicsDbError('slug_taken'));
  });
  it('rejects a stale revision with revision_conflict',async()=>{
   const h=await setup();const t=await h.db.createTopic({slug:`${label}-c3`,category:'macro',body:body('a'),actor});
   await h.db.saveDraft({topicId:t.topic_id,expectedRevision:1,body:body('b'),actor});
   await expect(h.db.saveDraft({topicId:t.topic_id,expectedRevision:1,body:body('c'),actor})).rejects.toEqual(new TopicsDbError('revision_conflict'));
  });
  it('publishes, lists the evidence copy and returns the snapshot text unchanged',async()=>{
   const h=await setup();const p=await make(h,`${label}-c4`,['ok','withheld']);
   const [v]=await h.db.versionsOfTopic(p.topic_id);
   expect([v.version_no,v.snapshot_text,v.snapshot_hash]).toEqual([1,p.snapshotText,sha256Hex(p.snapshotText)]);
   expect((await h.db.liveEvidence(null,500)).filter(e=>e.version_id===p.version_id).map(e=>e.state)).toEqual(['ok','withheld']);
  });
  it('reads a complete version by id and returns null for an unknown id',async()=>{
   const h=await setup();
   const p=await make(h,`${label}-by-id`);
   const [row]=await h.db.versionsOfTopic(p.topic_id);
   expect(await h.db.versionById(p.version_id)).toEqual(row);
   expect(await h.db.versionById(h.newId())).toBeNull();
  });
  it('projects only live versions into job references',async()=>{
   const h=await setup();
   const live=await make(h,`${label}-live`);
   const removed=await make(h,`${label}-withdrawn`);
   await h.db.unpublish({topicId:removed.topic_id,reason:'privacy',note:null,actor});
   const refs=(await h.db.liveVersionRefs()).filter(ref=>[live.topic_id,removed.topic_id].includes(ref.topic_id));
   expect(refs).toEqual([{topic_id:live.topic_id,version_id:live.version_id,version_no:live.version_no}]);
  });
  it('hides everything from the public client until the switch is on',async()=>{
   const h=await setup();const p=await make(h,`${label}-c5`);
   await h.setPublic(false);expect(await h.asPublic().publicTopicBySlug(`${label}-c5`)).toBeNull();
   await h.setPublic(true);
   const t=await h.asPublic().publicTopicBySlug(`${label}-c5`);
   expect(await h.asPublic().publicOpen()).toBe(true);
   expect([t?.version_no,t?.title_zh,t?.evidence_counts?.ok]).toEqual([1,`${label}-c5`,1]);
   expect((await h.asPublic().publicVersions(p.topic_id)).map(v=>v.version_no)).toEqual([1]);
   await h.setPublic(false);
  });
  it('unpublish nulls the public snapshot and keeps the reason',async()=>{
   const h=await setup();const p=await make(h,`${label}-c6`);
   expect(await h.db.unpublish({topicId:p.topic_id,reason:'privacy',note:null,actor})).toEqual({current_version_no:null});
   await h.setPublic(true);
   const [v]=await h.asPublic().publicVersions(p.topic_id);
   expect([v.snapshot,v.unpublish_reason]).toEqual([null,'privacy']);
   await h.setPublic(false);
  });
  it('upserts drift and stamps the completed check time',async()=>{
   const h=await setup();const p=await make(h,`${label}-c7`);
   await h.db.upsertDrift([{version_id:p.version_id,ordinal:1,drift:'revised',current_identity:{value_text:'4.2',unit:'pct',period:'2026-08',available_at:'2026-10-03T12:30:00.000Z'}}],'2026-11-12T06:30:00.000Z',true,null);
   expect((await h.db.driftOf(p.version_id))[0].drift).toBe('revised');
   expect((await h.db.settings()).drift_checked_at).toBe('2026-11-12T06:30:00.000Z');
  });
  it('writes one audit row per write, without content',async()=>{
   const h=await setup();const p=await make(h,`${label}-c8`);
   expect((await h.db.auditOf(p.topic_id)).map(a=>a.action)).toEqual(['create','disclosure_check','publish']);
  });
 });
}
