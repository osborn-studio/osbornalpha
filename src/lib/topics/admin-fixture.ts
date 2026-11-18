import {memoryTableClient} from '@/lib/db/memory-table-client';
// Topic plan PR-5 commander decision 2: isolated, process-wide admin fixtures.
import {memoryTopicsDb} from './memory-db';
import {memorySources} from '@/lib/evidence/memory-sources';
import {createResolver} from '@/lib/evidence/resolve';
import {macroResolver} from '@/lib/evidence/resolvers/macro';
import {industryResolver} from '@/lib/evidence/resolvers/industry';
import {factResolver} from '@/lib/evidence/resolvers/fact';
import {citationResolver} from '@/lib/evidence/resolvers/citation';
import {judgmentResolver} from '@/lib/evidence/resolvers/judgment';
import {brokerResolver} from '@/lib/evidence/resolvers/broker';
import {memoryCandidateLookup} from './evidence-search';
import {allFixtures} from '@/lib/evidence/fixtures';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {emptyDraft,parseDraftBody} from './drafts';
import type {AdminDeps} from './admin-deps';
import type {TopicsDb} from './types';
import {adminFixtureMode,FIXTURE_ADMIN_ID} from './admin-fixture-mode';
export {adminFixtureMode,FIXTURE_ADMIN_ID};
const KEY=Symbol.for('osborn.topics.admin-fixture');
const globals=globalThis as typeof globalThis&{[KEY]?:AdminDeps};
export function adminFixtureDeps():AdminDeps{
 if(globals[KEY])return globals[KEY];
 const base=memoryTopicsDb();
 const ready=(async()=>{
  const title={zh:'利率与银行',en:'Rates and banks'};
  const rates=await base.createTopic({slug:'rates-and-banks',category:'macro',body:emptyDraft(title),actor:FIXTURE_ADMIN_ID});
  const body=parseDraftBody({...emptyDraft(title),
   sections:[{key:'s1',title:{zh:'宏观证据',en:'Macro evidence'},note:{zh:'截至 {{ev:1.period}}，失业率为 {{ev:1}}。',en:'As of {{ev:1.period}}, unemployment was {{ev:1}}.'},items:[{ordinal:1},{ordinal:2},{ordinal:3},{expected_slot:'industry'}]}],
   evidence:[{ordinal:1,ref:{v:1,kind:'macro_observation',id:OBS.unrateV1},section_key:'s1'},
    {ordinal:2,ref:{v:1,kind:'financial_fact',id:FACT.usOk},section_key:'s1'},
    {ordinal:3,ref:{v:1,kind:'financial_fact',id:FACT.cnPending},section_key:'s1'}],
   expected_slots:[{key:'industry',kind:'industry_metric',label:{zh:'行业指标',en:'Industry metric'},reason_code:'industry_not_published'}],
  });
  await base.saveDraft({topicId:rates.topic_id,expectedRevision:rates.revision,body,actor:FIXTURE_ADMIN_ID});
  await base.createTopic({slug:'cn-company',category:'company',body:emptyDraft({zh:'中国公司',en:'China company'}),actor:FIXTURE_ADMIN_ID});
 })();
 // Every port operation waits for seeding, including the first request after a route bundle loads.
 const db=new Proxy(base as TopicsDb,{get(target,key,receiver){
  const method=Reflect.get(target,key,receiver);
  return typeof method==='function'?async(...args:unknown[])=>{await ready;return Reflect.apply(method,target,args);}:method;
 }});
 const sources=memorySources(allFixtures());
 const resolver=createResolver([macroResolver(sources),industryResolver(sources),factResolver(sources),citationResolver(sources),judgmentResolver(sources),brokerResolver()]);
 const deps:AdminDeps={tables:memoryTableClient(),db,resolver,lookup:memoryCandidateLookup(sources),now:()=>new Date(),codeVersion:'fixture',privateIds:async()=>new Set<string>()};
 globals[KEY]=deps;return deps;
}
