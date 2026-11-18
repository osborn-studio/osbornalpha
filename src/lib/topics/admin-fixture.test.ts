// Topic plan PR-5 commander fixture support.
import {expect,it,vi,afterEach} from 'vitest';
import {adminFixtureMode,adminFixtureDeps} from './admin-fixture';
import {parseDraftBody} from './drafts';
import {OBS} from '@/lib/evidence/fixtures/macro';
import {FACT} from '@/lib/evidence/fixtures/facts';
afterEach(()=>vi.unstubAllEnvs());
it('enables only explicitly isolated fixtures',()=>{
 expect(adminFixtureMode({TOPICS_E2E_FIXTURES:'1'})).toBe(true);
 for(const flag of [undefined,'','true','0','01'])expect(adminFixtureMode({TOPICS_E2E_FIXTURES:flag})).toBe(false);
 for(const [key,value] of [['NODE_ENV','production'],['VERCEL','1'],['NEXT_PUBLIC_SUPABASE_URL','https://example.test'],['SUPABASE_SERVICE_ROLE_KEY','key']]){
  expect(adminFixtureMode({TOPICS_E2E_FIXTURES:'1',[key]:value})).toBe(false);
 }
});
it('shares a seeded database across calls and module reloads',async()=>{
 const a=adminFixtureDeps(),b=adminFixtureDeps();expect(a.db).toBe(b.db);
 const topics=await a.db.adminTopics();expect(topics.map(t=>t.topic_slug).sort()).toEqual(['cn-company','rates-and-banks']);
 for(const topic of topics){const draft=(await a.db.draftOf(topic.topic_id))!;expect(parseDraftBody(draft.body)).toEqual(draft.body);}
 const rates=topics.find(t=>t.topic_slug==='rates-and-banks')!;
 expect(rates.category).toBe('macro');expect(rates.title).toEqual({zh:'利率与银行',en:'Rates and banks'});
 const draft=(await a.db.draftOf(rates.topic_id))!;
 expect(draft.body.evidence.map(e=>[e.ordinal,e.ref.id])).toEqual([[1,OBS.unrateV1],[2,FACT.usOk],[3,FACT.cnPending]]);
 expect(draft.body.expected_slots[0]).toMatchObject({kind:'industry_metric',reason_code:'industry_not_published'});
 expect(draft.body.sections[0].note!.zh).toContain('{{ev:1.period}}');expect(draft.body.sections[0].note!.zh).toContain('{{ev:1}}');
 const company=topics.find(t=>t.topic_slug==='cn-company')!;expect(company.category).toBe('company');
 expect((await a.db.draftOf(company.topic_id))!.body.evidence).toEqual([]);
 expect(a.codeVersion).toBe('fixture');expect(await a.privateIds('user')).toEqual(new Set());
 expect(Math.abs(a.now().getTime()-Date.now())).toBeLessThan(1000);
 vi.resetModules();expect((await import('./admin-fixture')).adminFixtureDeps().db).toBe(a.db);
});
