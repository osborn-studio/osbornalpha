// src/lib/topics/db-contract.ts
// One behaviour suite, run against memory (db.test.ts) and PostgreSQL (topics.integration.test.ts).
import {describe,expect,it} from 'vitest';
import {canonicalJson,sha256Hex} from '@/lib/evidence/hash';
import {TopicsDbError,type DraftBody,type EvidenceRowInput,type TopicsDb,type TopicSnapshot} from './types';

import {emptyDraft} from './drafts';

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
  it('exposes only the requested licence status when the directory is open',async()=>{
   const h=await setup(),id=await h.db.setLicence({licenceId:null,actor,fields:testLicence});
   expect(await h.db.licences()).toContainEqual(expect.objectContaining({licence_id:id,source_title:testLicence.source_title}));
   await h.setPublic(false);expect(await h.asPublic().publicLicenceStatus([id])).toEqual([]);
   await h.setPublic(true);expect(await h.asPublic().publicLicenceStatus([id])).toEqual([{licence_id:id,status:'approved',excerpt_allowed:true}]);
   for(const fields of deniedLicences){
    await h.db.setLicence({licenceId:id,fields,actor});
    expect(await h.asPublic().publicLicenceStatus([id])).toEqual([{licence_id:id,status:fields.status,excerpt_allowed:false}]);
   }
   expect(await h.asPublic().publicLicenceStatus([h.newId()])).toEqual([]);
  });
  it('masks published excerpts at read time across licence changes',async()=>{
   const h=await setup();await checkPublishedExcerpt(h,`${label}-mask`,actor);
  });
  it('records promotion provenance and audits only the promotion id',async()=>{
   const h=await setup(),t=await h.db.createTopic({slug:`${label}-promotion`,category:'macro',body:body('text'),actor});
   const sourceId=h.newId(),sourceContentHash=sha256Hex('text'),copied={fields:['title','body'] as ['title','body'],at:new Date().toISOString()},stripped=[{field:'status',count:null}];
   const id=await h.db.recordPromotion({topicId:t.topic_id,sourceId,sourceContentHash,copied,stripped,actor});
   expect(await h.db.promotionOf(t.topic_id)).toMatchObject({promotion_id:id,source_id:sourceId,source_content_hash:sourceContentHash,copied,stripped});
   expect((await h.db.adminTopics()).find(row=>row.topic_id===t.topic_id)?.promoted).toBe(true);
   expect((await h.db.auditOf(t.topic_id)).at(-1)?.detail).toEqual({promotion_id:id});
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
  const summaryDraft=async(h:TopicsContractHarness,suffix:string)=>{
   const t=await h.db.createTopic({slug:`${label}-summary-${suffix}`,category:'macro',body:body('summary'),actor});
   return {topicId:t.topic_id,draftHash:t.draft_hash,actor,requestId:h.newId(),payloadHash:sha256Hex('payload'),
    locale:'en' as const,manifest:{facts:[]},promptVersion:'prompt/1',validatorVersion:'validator/1'};
  };
  const rendered={facts:[],points:[],counterpoints:[],incomparable:[],prompt_version:'prompt/1',validator_version:'validator/1',provider:'test',model:'test'};
  const finish={state:'accepted' as const,provider:'test',model:'test',rawOutput:{content:'output'},validation:{validator_version:'validator/1'},rendered,finalizePayload:{status:'completed'}};
  it('claims once, replays the same payload and rejects conflicting or stale claims',async()=>{
   const h=await setup(),i=await summaryDraft(h,'claim');
   const claims=await Promise.all([h.db.claimSummary(i),h.db.claimSummary(i)]);
   expect(claims.map(c=>c.replayed).sort()).toEqual([false,true]);
   expect(claims[1].run_id).toBe(claims[0].run_id);
   expect(claims[0].usage_audit_key).toBe(claims[0].run_id);
   await expect(h.db.claimSummary({...i,payloadHash:sha256Hex('other')})).rejects.toThrow('payload_conflict');
   await h.db.saveDraft({topicId:i.topicId,expectedRevision:1,body:body('edited'),actor});
   expect((await h.db.claimSummary(i)).replayed).toBe(true);
   await expect(h.db.claimSummary({...i,requestId:h.newId()})).rejects.toThrow('draft_changed');
  });
  it('approves one generated summary per draft and locale and rejects stale approval',async()=>{
   const h=await setup(),i=await summaryDraft(h,'approve');
   for(const locale of ['en','zh','en'] as const){
    const {run_id}=await h.db.claimSummary({...i,locale,requestId:h.newId()});
    await h.db.recordSummaryCompletion({runId:run_id,rawOutput:finish.rawOutput,finalizePayload:finish.finalizePayload});
    await h.db.finishSummary({...finish,runId:run_id});
    await h.db.markSummaryFinalized(run_id);
    const summary=(await h.db.summariesOf(i.topicId,i.draftHash)).find(s=>s.run_id===run_id)!;
    expect(summary).toMatchObject({status:'generated',rendered});
    expect(await h.db.latestSummaryRun(i.topicId,locale)).toMatchObject({run_id,draft_hash:i.draftHash,state:'accepted'});
    expect(await h.db.summaryById(i.topicId,summary.summary_id)).toEqual(summary);
    await h.db.approveSummary({summaryId:summary.summary_id,decision:'approve',actor});
    expect(await h.db.approvedSummary(i.topicId,i.draftHash,locale)).toMatchObject({run_id,status:'approved',approved_by:actor});
   }
   const all=await h.db.summariesOf(i.topicId,i.draftHash);
   expect(all.filter(s=>s.status==='approved')).toHaveLength(2);
   const older=all.find(s=>s.status==='discarded')!;
   expect(older).toMatchObject({locale:'en',approved_by:null,approved_at:null});
   await h.db.saveDraft({topicId:i.topicId,expectedRevision:1,body:body('edited'),actor});
   await expect(h.db.approveSummary({summaryId:older.summary_id,decision:'approve',actor})).rejects.toThrow('summary_mismatch');
  });
  it('preserves the recorded output and settlement payload across retries',async()=>{
   const h=await setup(),i=await summaryDraft(h,'retry'),{run_id:runId}=await h.db.claimSummary(i);
   await expect(h.db.markSummaryFinalized(runId)).rejects.toThrow('invalid_transition');
   const completion={runId,rawOutput:finish.rawOutput,finalizePayload:finish.finalizePayload};
   await h.db.recordSummaryCompletion(completion);
   await h.db.recordSummaryCompletion(completion);
   await expect(h.db.recordSummaryCompletion({...completion,rawOutput:'other'})).rejects.toThrow('invalid_transition');
   await expect(h.db.finishSummary({...finish,runId,finalizePayload:{status:'failed'}})).rejects.toThrow('invalid_transition');
   await expect(h.db.finishSummary({...finish,runId,rendered:null})).rejects.toThrow('rendered_required');
   const accepted=await h.db.finishSummary({...finish,runId});
   expect((await h.db.finishSummary({...finish,runId})).summary?.summary_id).toBe(accepted.summary?.summary_id);
   await h.db.markSummaryFinalized(runId);
   expect(await h.db.claimSummary(i)).toMatchObject({finalized:true,raw_output:finish.rawOutput,finalize_payload:finish.finalizePayload});
  });
  it('fails a validator version change without generating a summary',async()=>{
   const h=await setup(),i=await summaryDraft(h,'validator'),run=await h.db.claimSummary(i);
   const result=await h.db.finishSummary({...finish,runId:run.run_id,validation:{validator_version:'validator/2'}});
   expect(result).toMatchObject({state:'failed',validation:{code:'validator_version_changed'}});
   expect(await h.db.summariesOf(i.topicId,i.draftHash)).toEqual([]);
   await expect(h.db.recordSummaryCompletion({runId:run.run_id,rawOutput:{},finalizePayload:{}})).rejects.toThrow('run_not_running');
  });
  it('writes one audit row per write, without content',async()=>{
   const h=await setup();const p=await make(h,`${label}-c8`);
   expect((await h.db.auditOf(p.topic_id)).map(a=>a.action)).toEqual(['create','disclosure_check','publish']);
  });
 });
}

export const testLicence={source_title:'Source',publisher:'Publisher',source_url:'https://example.org',terms_url:'https://example.org/terms',terms_read_at:'2026-11-01',terms_clause:'Short quotations',permits:{display_excerpt:true,link_required:true},note:null,status:'approved' as const};
const deniedLicences=[{...testLicence,status:'revoked' as const},{...testLicence,permits:{display_excerpt:false,link_required:true}},{...testLicence,status:'pending' as const}];
export const quoteEntry=(licence_id:string,text='Quoted 42')=>({key:'quote',entry_type:'licensed_excerpt' as const,licence_id,fragments:[{text,date:'2026-11-01',attribution:'Author',url:'https://example.org'}]});
export async function checkPublishedExcerpt(h:TopicsContractHarness,slug:string,actor:string){
 const {db}=h,licenceId=await db.setLicence({licenceId:null,actor,fields:testLicence}),quote='quote-'+h.newId();
 const draft=emptyDraft({zh:'引文',en:'Excerpt'});
 draft.entries=[{key:'note',entry_type:'owner_note',body:{en:'Owner',zh:'注'}},quoteEntry(licenceId,quote)];
 const t=await db.createTopic({slug,actor,category:'macro',body:draft});
 const receiptId=await db.recordDisclosure({topicId:t.topic_id,draftHash:t.draft_hash,actor,checks:[],passed:true,codeVersion:'test'});
 const f=fixtureVersion(h,slug),snapshotText=JSON.stringify({...JSON.parse(f.snapshotText),entries:draft.entries});
 const v=await db.publish({topicId:t.topic_id,expectedDraftHash:t.draft_hash,receiptId,actor,evidence:f.evidence,snapshotText,summaryId:null,cutoff:'2026-11-10T00:00:00Z'});
 await h.setPublic(true);
 try{await assertExcerptMasking(db,h.asPublic(),slug,v.version_id,licenceId,actor,quote);}finally{await h.setPublic(false);}
}
export async function assertExcerptMasking(db:TopicsDb,reader:TopicsDb,slug:string,versionId:string,licenceId:string,actor:string,quote='Quoted 42'){
 const {readTopic}=await import('./public-read');
 const version=(await db.versionById(versionId))!,day=version.published_at.slice(0,10);
 const pub={db:reader,preview:false,now:()=>new Date(version.published_at)};
 const masked={key:'quote',entry_type:'licensed_excerpt',masked:true,reason:'licence_revoked',attributions:[{attribution:'Author',url:'https://example.org'}]};
 const check=async(allowed:boolean)=>{
  const stored=(await db.versionById(versionId))!;
  expect(stored.snapshot_hash).toBe(version.snapshot_hash);expect(JSON.stringify(stored.snapshot)).toContain(quote);
  const expected=version.snapshot.entries.map(e=>allowed||e.entry_type==='owner_note'?e:masked);
  const rows=await reader.publicVersions(version.topic_id);
  expect(rows.find(v=>v.version_id===versionId)).toMatchObject({snapshot_hash:version.snapshot_hash});
  expect(rows.find(v=>v.version_id===versionId)?.snapshot?.entries).toEqual(expected);
  expect(JSON.stringify(rows).includes(quote)).toBe(allowed);
  for(const view of [{},{version:version.version_no},{asOf:day}]){
   const dto=await readTopic(pub,slug,view);
   expect(dto.entries).toEqual(expected);expect(JSON.stringify(dto).includes(quote)).toBe(allowed);
  }
 };
 await check(true);
 for(const fields of deniedLicences){await db.setLicence({licenceId,actor,fields});await check(false);}
 await db.setLicence({licenceId,actor,fields:testLicence});await check(true);
}
export const assertRevokedViews=assertExcerptMasking;
