// Topic plan T6.7 / spec §1.1: frozen public replay and evidence privacy.
import {expect,it} from 'vitest';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {actor,scenario,revisionOf,hashOf,settingsBody,confirmations} from './fixtures/scenario';
import {checkDraft,publishTopic} from './publish';
import {requiredAttributions,setPublicEnabled} from './settings';
import {readTopic} from './public-read';

it('v1 stays byte-identical after a revision is injected; asOf before v1 is 404; the CN value never leaves',async()=>{
 const {deps,pub,sources,topicId,slug}=await scenario();
 await checkDraft(deps,{topicId,actor});const v1=await publishTopic(deps,{topicId,expectedDraftHash:await hashOf(deps,topicId),actor});
 const {required}=await requiredAttributions(deps.db);
 expect(required).toEqual(['documents:source','facts:sec','macro:attribution']);
 await expect(setPublicEnabled(deps,settingsBody,actor)).rejects.toMatchObject({code:'licence_confirmation_missing',status:409,detail:{missing:required}});
 await setPublicEnabled(deps,{...settingsBody,licence_confirmations:confirmations(required)},actor);
 const before=JSON.stringify(await readTopic(pub(),slug,{version:1}));
 sources.seed.macro.rows.push(revisionOf(sources,OBS.unrateV1,OBS.unrateV2,'4.2'));
 expect(JSON.stringify(await readTopic(pub(),slug,{version:1}))).toBe(before);
 expect(before).toContain('"4.3"');expect(before).not.toContain('987654321.12');
 const d=await readTopic(pub(),slug,{});
 expect(d.evidence.find(e=>e.ordinal===3)).toMatchObject({state:'withheld',fact:null});
 expect(d.expected_slots[0].reason_code).toBe('industry_not_published');
 const published=(await deps.db.versionsOfTopic(topicId)).find(v=>v.version_id===v1.version_id)!;
 const dayBefore=new Date(Date.parse(published.published_at)-86400000).toISOString().slice(0,10);
 await expect(readTopic(pub(),slug,{asOf:dayBefore})).rejects.toMatchObject({code:'no_version_at_asof',status:404});
});

it('A4 and A15 retain frozen evidence and the last successful drift check',async()=>{
 const {runDrift}=await import('./drift');
 const {readEvidence}=await import('./public-read');
 const {topicDrawerInput}=await import('@/components/topics/dossier/topic-drawer-adapter');
 const {deps,pub,sources,topicId,slug}=await scenario();
 await checkDraft(deps,{topicId,actor});
 const v=await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 await setPublicEnabled(deps,{...settingsBody,licence_confirmations:confirmations((await requiredAttributions(deps.db)).required)},actor);
 sources.seed.macro.rows.push(revisionOf(sources,OBS.unrateV1,OBS.unrateV2,'4.2'));
 await runDrift(deps,{deadlineMs:250000});
 const before=await deps.db.driftOf(v.version_id);
 expect((await readTopic(pub(),slug,{})).evidence[0]).toMatchObject({drift:'revised',current:{value_text:'4.2'},fact:{slots:{value:{value_text:'4.3'}}}});
 const detail=await readEvidence(pub(),slug,1);
 expect(topicDrawerInput({detail,locale:'en',text:k=>k})).toMatchObject({variant:'revised',revised:{frozen:{value:expect.stringContaining('4.3')},current:{value:expect.stringContaining('4.2')}}});
 const later=()=>new Date(deps.now().getTime()+73*3600000);
 await expect(runDrift({...deps,now:later,db:{...deps.db,upsertDrift:async()=>{throw Error('offline');}}},{deadlineMs:250000})).rejects.toThrow('offline');
 expect(await deps.db.driftOf(v.version_id)).toEqual(before);
 expect(await readTopic({...pub(),now:later},slug,{})).toMatchObject({drift_checked_at:deps.now().toISOString(),drift_unchecked:true});
});

it('A7 audits matching and changed replays and quarantines just the changed ordinal',async()=>{
 const {verifyVersion}=await import('./verify');
 const {digestOf}=await import('@/lib/evidence/resolve');
 const {memoryTableClient}=await import('@/lib/db/memory-table-client');
 const {deps,topicId}=await scenario(),tables=memoryTableClient();
 await checkDraft(deps,{topicId,actor});
 const v=await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 const frozen=await deps.db.versionById(v.version_id),input={topicId,actor,versionNo:1};
 expect(await verifyVersion({...deps,tables},input)).toEqual({version_no:1,matched:3,skipped:1,mismatched:[]});
 const resolver={...deps.resolver,resolve:async(...args:Parameters<typeof deps.resolver.resolve>)=>{
  const result=await deps.resolver.resolve(...args);
  const item=result.resolved.find(r=>r.ref.id===OBS.unrateV1);
  if(item?.display.fact&&item.drawer){
   item.display.fact.template+='-updated';
   item.digest=digestOf(item.display.fact,item.drawer.identity);
  }
  return result;
 }};
 const changed=await verifyVersion({...deps,resolver,tables},input);
 expect(changed).toEqual({version_no:1,matched:2,skipped:1,mismatched:[{ordinal:1,reason:'digest_changed'}]});
 expect(tables.rows('dq_quarantine')).toMatchObject([{dataset:'topics.replay',table_name:'topic_versions',natural_key:v.version_id+':1',status:'open',reason_code:'replay_mismatch'}]);
 expect(tables.rows('ingest_batches')).toMatchObject([{status:'success',counts:{quarantined:1}}]);
 expect((await deps.db.auditOf(topicId)).filter(e=>e.action==='replay_verify')).toMatchObject([{actor,detail:{mismatched:[]}},{actor,detail:changed}]);
 expect(await deps.db.versionById(v.version_id)).toEqual(frozen);
});

it('previews before terms confirmation, freezes the approved summary, and masks its dependent hypothesis',async()=>{
 const {deps,pub,topicId,slug}=await scenario(true),draftHash=await hashOf(deps,topicId);
 const publish=()=>publishTopic(deps,{topicId,actor,expectedDraftHash:draftHash});
 await checkDraft(deps,{topicId,actor});
 const {handleSummaryRequest}=await import('./summary/request'),{fixtureSummaryLlm}=await import('./fixtures/summary');
 const result=await handleSummaryRequest({...deps,llm:fixtureSummaryLlm('en')},actor,{topicId,request_id:crypto.randomUUID(),locale:'en'});
 expect(result).toMatchObject({status:200,body:{state:'accepted'}});
 const [summary]=await deps.db.summariesOf(topicId,draftHash),rendered=summary.rendered;
 await deps.db.approveSummary({summaryId:summary!.summary_id,actor,decision:'approve'});
 const {previewDraft}=await import('./publish');
 expect((await previewDraft(deps,{topicId,actor})).dossier.summary).toMatchObject(rendered);
 const settings=(enabled:boolean,note:string)=>deps.db.setPublicEnabled({actor,publicEnabled:false,summaryPublicEnabled:enabled,summaryProviderNote:note,licenceConfirmations:{}});
 await expect(publish()).rejects.toMatchObject({code:'publish_blocked:summary_provider_unconfirmed'});
 await settings(true,'Other terms');await expect(publish()).rejects.toThrow('publish_blocked:summary_provider_mismatch');
 expect(await deps.db.versionsOfTopic(topicId)).toEqual([]);
 await settings(true,'Fixture terms');
 // Access can change without a draft edit. A new public projection must still support the frozen sentences.
 const resolver={...deps.resolver,resolve:async(...args:Parameters<typeof deps.resolver.resolve>)=>{
  const result=await deps.resolver.resolve(...args);
  if(args[1].audience==='public'){result.resolved[0].state='withheld';result.resolved[0].display.fact=null;}
  return result;
 }};
 const restricted={...deps,resolver};
 expect((await previewDraft(restricted,{topicId,actor})).dossier.summary).toBeNull();
 await expect(publishTopic(restricted,{topicId,actor,expectedDraftHash:draftHash})).rejects.toThrow('publish_blocked:summary_mismatch');
 const version=await publish();
 expect(await deps.db.versionById(version.version_id)).toMatchObject({summary_id:summary!.summary_id,version_no:1,snapshot:{summary:rendered}});
 await setPublicEnabled(deps,{...settingsBody,summary_public_enabled:true,summary_provider_note:'Fixture terms',licence_confirmations:confirmations(['macro:attribution'])},actor);
 expect((await readTopic(pub(),slug,{})).summary).toEqual({...rendered,hidden_points:0});
 await deps.db.upsertDrift([{version_id:version.version_id,ordinal:1,drift:'now_withheld',current_identity:null}],deps.now().toISOString(),true,null);
 expect((await readTopic(pub(),slug,{})).summary).toMatchObject({facts:[{text:''}],points:[],hidden_points:1});
});
