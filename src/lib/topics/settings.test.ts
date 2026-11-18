// Topic plan T6.6: source confirmations and irreversible slug reservation.
import {expect,it,vi} from 'vitest';
import {actor,scenario,hashOf,settingsBody,confirmations} from './fixtures/scenario';
import {checkDraft,publishTopic} from './publish';
import {setPublicEnabled,requiredAttributions} from './settings';

it('requires the current macro attribution to open, and none to close',async()=>{
 const {deps,topicId}=await scenario(true);await checkDraft(deps,{topicId,actor});
 await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 expect(await requiredAttributions(deps.db)).toEqual({required:['macro:attribution'],problems:[]});
 await expect(setPublicEnabled(deps,settingsBody,actor)).rejects.toMatchObject({status:409,code:'licence_confirmation_missing',detail:{missing:['macro:attribution']}});
 const opened=await setPublicEnabled(deps,{...settingsBody,summary_provider_note:'',licence_confirmations:confirmations(['macro:attribution'])},actor);
 expect(opened).toMatchObject({public_enabled:true,summary_provider_note:null,updated_by:actor});
 expect(await deps.db.settings()).toEqual(opened);
 expect(await setPublicEnabled(deps,{...settingsBody,public_enabled:false},actor)).toMatchObject({public_enabled:false});
});
it.each([['http://example.org','2026-11-15'],['https://example.org','2026-11-16'],['https://example.org','2026-02-30']])('validates confirmation %s %s',async(terms_url,confirmed_on)=>{
 const {deps}=await scenario();
 await expect(setPublicEnabled(deps,{...settingsBody,licence_confirmations:{macro:{terms_url,confirmed_on}}},actor)).rejects.toMatchObject({code:'invalid_body:licence_confirmations',status:400});
});
it('requires a provider note to enable summaries',async()=>{
 const {deps}=await scenario();
 await expect(setPublicEnabled(deps,{...settingsBody,summary_public_enabled:true},actor)).rejects.toMatchObject({code:'invalid_body:summary_provider_note',status:400});
});
it('reports legacy snapshot problems by slug and ordinal even with confirmations',async()=>{
 const {deps,topicId,slug}=await scenario();await checkDraft(deps,{topicId,actor});
 await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 const versions=await deps.db.versionsOfTopic(topicId),evidence=versions[0].snapshot.evidence;
 const macro=evidence[0].resolved.drawer,fact=evidence[1].resolved.drawer;
 if(!macro||!('source' in macro)||!fact||!('source' in fact))throw new Error('missing fixture drawer');
 macro.licence.status='third_party';fact.attribution_key='';evidence[3].resolved.drawer=null;
 vi.spyOn(deps.db,'versionsOfTopic').mockResolvedValue(versions);
 const problems=[{slug,ordinal:1,kind:'macro_observation',problem:'licence_unconfirmed'},
  {slug,ordinal:2,kind:'financial_fact',problem:'no_attribution'},{slug,ordinal:4,kind:'document_citation',problem:'no_drawer'}];
 expect(await requiredAttributions(deps.db)).toEqual({required:['macro:attribution'],problems});
 await expect(setPublicEnabled(deps,{...settingsBody,licence_confirmations:confirmations(['macro:attribution'])},actor)).rejects.toMatchObject({
  code:'licence_confirmation_missing',status:409,detail:{missing:[],problems}});
 expect(await deps.db.publicOpen()).toBe(false);
 expect(await setPublicEnabled(deps,{...settingsBody,public_enabled:false},actor)).toMatchObject({public_enabled:false});
});
