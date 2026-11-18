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
