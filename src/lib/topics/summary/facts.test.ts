import {expect,it} from 'vitest';
import {actor,scenario,hashOf} from '../fixtures/scenario';
import {maskingFixture} from '../fixtures/published';
import {checkDraft,publishTopic} from '../publish';
import {topicFacts} from './facts';

it('uses only publishable frozen facts and keeps their evidence references',async()=>{
 const {deps,topicId}=await scenario();
 await checkDraft(deps,{topicId,actor});
 const version=await publishTopic(deps,{topicId,actor,expectedDraftHash:await hashOf(deps,topicId)});
 const {snapshot}=(await deps.db.versionById(version.version_id))!;
 const judgment=structuredClone(snapshot.evidence[0]);
 judgment.ordinal=5;judgment.ref.kind='judgment';
 const {facts}=topicFacts({evidence:[...snapshot.evidence,judgment]});
 expect(facts.map(f=>f.fact_id)).toEqual(['ev:1','ev:2','ev:4']);
 expect(facts[0]).toMatchObject({evidence:[snapshot.evidence[0].ref],refs:[1],slots:snapshot.evidence[0].resolved.display.fact!.slots});
});
it('pairs observations in ordinal order and records incompatible units',()=>{
 const {snapshot}=maskingFixture();
 snapshot.evidence.reverse();
 expect(topicFacts(snapshot).facts.filter(f=>f.kind==='change')).toMatchObject([
  {fact_id:'pair:1:2',refs:[1,2],template:'topic.macro_change',slots:{change:{value_text:'0.55',unit:'pp'}}}]);
 snapshot.evidence[1].resolved.display.fact!.slots.value={value_text:'430',unit:'bp'};
 const r=topicFacts(snapshot);
 expect(r.incomparable).toEqual([{a:1,b:2}]);
 expect(r.facts.some(f=>f.kind==='change')).toBe(false);
});
