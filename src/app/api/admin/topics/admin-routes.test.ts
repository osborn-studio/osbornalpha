// Topic plan T5.2: real route handlers with memory persistence.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {POST as check} from './[id]/disclosure-check/route';
import {GET as preview} from './[id]/preview/route';
import {POST as publish} from './[id]/publish/route';
import {POST as unpublish} from './[id]/unpublish/route';
import {GET as versions} from './[id]/versions/route';
import {POST as retire} from './[id]/retire/route';
import {GET as getSettings,POST as updateSettings} from './settings/route';
import {scenario,settingsBody,confirmations} from '@/lib/topics/fixtures/scenario';
import {POST,GET} from './route';
import {POST as lintDraft} from './[id]/lint/route';
import {GET as getDraft,PUT} from './[id]/draft/route';
import {memoryTopicsDb} from '@/lib/topics/memory-db';
import {emptyDraft} from '@/lib/topics/drafts';
import {POST as evidenceSearch} from './[id]/evidence-search/route';
import {memorySources} from '@/lib/evidence/memory-sources';
import {memoryCandidateLookup} from '@/lib/topics/evidence-search';
import {FACT} from '@/lib/evidence/fixtures/facts';
import {memoryResolver} from '@/lib/evidence';
import {allFixtures} from '@/lib/evidence/fixtures';
import {adminDeps} from '@/lib/topics/admin-deps';
import {requireAdminUser} from '@/lib/admin/auth';
vi.mock('@/lib/topics/admin-deps',()=>({adminDeps:vi.fn()}));
vi.mock('@/lib/admin/auth',()=>({requireAdminUser:vi.fn(),AdminUnauthenticated:class extends Error{},AdminForbidden:class extends Error{}}));
const actor='00000000-0000-4000-8000-000000000001',title={zh:'利率与银行',en:'Rates and banks'};
const ctx=(id=actor)=>({params:Promise.resolve({id})});
const req=(body:unknown,method='POST')=>new Request('http://localhost/api/admin/topics',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const create=()=>POST(req({slug:'rates-and-banks',category:'macro',title}),{});
beforeEach(()=>{
 vi.stubEnv('TOPICS_ENABLED','1');vi.stubEnv('TOPICS_E2E_FIXTURES','');
 const sources=memorySources(allFixtures());
 vi.mocked(adminDeps).mockResolvedValue({db:memoryTopicsDb(),resolver:memoryResolver(sources.seed),lookup:memoryCandidateLookup(sources),now:()=>new Date(),codeVersion:'test',privateIds:async()=>new Set()});
 vi.mocked(requireAdminUser).mockResolvedValue({id:actor} as Awaited<ReturnType<typeof requireAdminUser>>);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('creates, lists and reads a draft while the public switch remains off',async()=>{
 const r=await create();expect(r.status).toBe(201);const created=await r.json();
 expect(created).toMatchObject({revision:1,draft_hash:expect.stringMatching(/^[a-f0-9]{64}$/)});
 const list=await GET(new Request('http://localhost/api/admin/topics'),{});const data=await list.json();
 expect(data.topics).toHaveLength(1);expect(data.topics[0]).toMatchObject({topic_id:created.topic_id,topic_slug:'rates-and-banks'});
 expect(data.settings.public_enabled).toBe(false);
 const read=await getDraft(new Request('http://localhost'),ctx(created.topic_id));
 expect(await read.json()).toEqual({topic:{topic_id:created.topic_id,topic_slug:'rates-and-banks',category:'macro',status:'draft',current_version_id:null},draft:{revision:1,draft_hash:created.draft_hash,body:emptyDraft(title),updated_at:expect.any(String)},lint:[],evidence:[]});
});
it('rejects a repeated slug',async()=>{
 await create();const r=await create();expect(r.status).toBe(409);expect((await r.json()).error.code).toBe('slug_taken');
});
it('saves advisory lint and rejects stale revisions',async()=>{
 const {topic_id}=await (await create()).json();const body=emptyDraft(title);
 body.sections=[{key:'s1',title:{zh:'',en:''},note:{zh:'失业率为 4.3%',en:''},items:[]}];
 const save=()=>PUT(req({expected_revision:1,body},'PUT'),ctx(topic_id));
 const r=await save();expect(r.status).toBe(200);const data=await r.json();expect(data.revision).toBe(2);
 expect(data.lint).toContainEqual({field:'sections.s1.note.zh',code:'numeral_in_owner_text',match:'4.3%'});
 const stale=await save();expect(stale.status).toBe(409);expect((await stale.json()).error.code).toBe('revision_conflict');
});
it('returns not_found for unknown topics and missing drafts',async()=>{
 let r=await getDraft(new Request('http://localhost'),ctx());expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('not_found');
 const {topic_id}=await (await create()).json();vi.spyOn((await adminDeps()).db,'draftOf').mockResolvedValue(null);
 r=await getDraft(new Request('http://localhost'),ctx(topic_id));expect(r.status).toBe(404);
});
it.each([['ab','macro',title,'slug'],['Bad-slug','macro',title,'slug'],['a'.repeat(65),'macro',title,'slug'],['valid','other',title,'category'],['valid','macro',{zh:'',en:'Title'},'title.zh']])('validates create fields',async(slug,category,title,field)=>{
 const r=await POST(req({slug,category,title}),{});expect(r.status).toBe(400);expect((await r.json()).error.code).toBe(`invalid_body:${field}`);
});
it('validates revision and UUID parameters',async()=>{
 const {topic_id}=await (await create()).json();
 const r=await PUT(req({expected_revision:0,body:emptyDraft(title)},'PUT'),ctx(topic_id));expect(r.status).toBe(400);expect((await r.json()).error.code).toBe('invalid_body:expected_revision');
 const bad=await getDraft(new Request('http://localhost'),ctx('bad'));expect(bad.status).toBe(400);expect((await bad.json()).error.code).toBe('invalid_parameter:id');
});
it('closes every route before auth when the flag is unset',async()=>{
 vi.stubEnv('TOPICS_ENABLED',undefined);vi.mocked(requireAdminUser).mockClear();
 const responses=await Promise.all([create(),versions(req({}),ctx()),GET(new Request('http://localhost'),{}),getDraft(new Request('http://localhost'),ctx()),PUT(req({}),ctx()),evidenceSearch(req({}),ctx()),lintDraft(req({}),ctx()),check(req({}),ctx()),preview(req({}),ctx()),publish(req({}),ctx()),unpublish(req({}),ctx()),retire(req({}),ctx()),getSettings(req({}),{}),updateSettings(req({}),{})]);
 for(const r of responses){expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('topics_disabled');expect(r.headers.get('cache-control')).toBe('no-store');}
 expect(requireAdminUser).not.toHaveBeenCalled();
});

it('searches evidence only for existing topics',async()=>{
 const {topic_id}=await (await create()).json();
 const body={kind:'macro_observation',series_id:'US_UNRATE',period_end:'2026-08-31'};
 const r=await evidenceSearch(req(body),ctx(topic_id));expect(r.status).toBe(200);
 expect((await r.json()).candidates).toMatchObject([{label:{zh:'US_UNRATE · 失业率 · v1'},public:{state:'ok',text:'4.3%'}}]);
 const missing=await evidenceSearch(req(body),ctx());expect(missing.status).toBe(404);expect((await missing.json()).error.code).toBe('not_found');
});
it('includes public evidence previews in both draft responses',async()=>{
 const {topic_id}=await (await create()).json(),body=emptyDraft(title);
 body.sections=[{key:'s1',title,note:null,items:[{ordinal:1}]}];
 body.evidence=[{ordinal:1,section_key:'s1',ref:{v:1,kind:'financial_fact',id:FACT.cnPending}}];
 const saved=await PUT(req({expected_revision:1,body},'PUT'),ctx(topic_id));expect(saved.status).toBe(200);
 const read=await getDraft(new Request('http://localhost'),ctx(topic_id));expect(read.status).toBe(200);
 for(const response of [saved,read])expect((await response.json()).evidence).toMatchObject([{ordinal:1,state:'withheld',reason:'citation_pending',text:null}]);
});

it('lints and resolves without writing a draft',async()=>{
 const {topic_id}=await (await create()).json(),body=emptyDraft(title),db=(await adminDeps()).db;
 body.sections=[{key:'s1',title,note:{zh:'失业率为 4.3%',en:''},items:[{ordinal:1}]}];
 body.evidence=[{ordinal:1,section_key:'s1',ref:{v:1,kind:'financial_fact',id:FACT.cnPending}}];
 const before=await db.draftOf(topic_id),save=vi.spyOn(db,'saveDraft');
 const r=await lintDraft(req({body}),ctx(topic_id));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
 const data=await r.json();expect(data.lint).toContainEqual({field:'sections.s1.note.zh',code:'numeral_in_owner_text',match:'4.3%'});
 expect(data.evidence).toMatchObject([{ordinal:1,state:'withheld',text:null}]);expect(save).not.toHaveBeenCalled();expect(await db.draftOf(topic_id)).toEqual(before);
});
it('validates lint body, id, existence and authentication',async()=>{
 const {topic_id}=await (await create()).json();
 expect((await lintDraft(req({body:{}}),ctx(topic_id))).status).toBe(400);
 expect((await lintDraft(req({body:emptyDraft(title)}),ctx('bad'))).status).toBe(400);
 expect((await lintDraft(req({body:emptyDraft(title)}),ctx())).status).toBe(404);
 const {AdminForbidden}=await import('@/lib/admin/auth');vi.mocked(requireAdminUser).mockRejectedValue(new AdminForbidden());
 expect((await lintDraft(req({body:emptyDraft(title)}),ctx(topic_id))).status).toBe(403);
});

it('checks disclosure, previews, publishes and opens only with source confirmations',async()=>{
 const {deps,topicId}=await scenario();vi.mocked(adminDeps).mockResolvedValue(deps);
 const context=ctx(topicId),draft=(await deps.db.draftOf(topicId))!;
 const publishDraft=()=>publish(req({expected_draft_hash:draft.draft_hash}),context);
 let r=await publishDraft();expect(r.status).toBe(409);expect((await r.json()).error.code).toBe('publish_blocked:disclosure_required');
 r=await check(req({}),context);expect(r.status).toBe(200);
 const receipt=await r.json();expect(receipt.passed).toBe(true);expect(await deps.db.receiptById(receipt.receipt_id)).toMatchObject({draft_hash:draft.draft_hash});
 r=await preview(req({}),context);expect(r.status).toBe(200);const data=await r.json();
 expect(data.difference[2]).toMatchObject({ordinal:3,public:{state:'withheld',text:null}});expect(JSON.stringify(data.dossier)).not.toContain('987654321.12');
 expect(await deps.db.versionsOfTopic(topicId)).toEqual([]);
 expect((await publishDraft()).status).toBe(200);
 const listed=await versions(req({}),context);expect(listed.status).toBe(200);
 expect(await listed.json()).toMatchObject({versions:[{version_no:1,status:'current',counts:data.counts,drift:{revised:0,newer_period:0,retracted:0,now_withheld:0,unverifiable:0}}]});
 const settings=()=>getSettings(req({}),{});r=await settings();expect(r.status).toBe(200);
 const required=['documents:source','facts:sec','macro:attribution'];
 expect(await r.json()).toMatchObject({required_attributions:required,problems:[],settings:{public_enabled:false}});
 r=await updateSettings(req(settingsBody),{});expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:{code:'licence_confirmation_missing'},meta:{missing:required}});
 r=await updateSettings(req({...settingsBody,licence_confirmations:confirmations(required)}),{});expect(r.status).toBe(200);expect(await r.json()).toMatchObject({settings:{public_enabled:true}});
 expect(await (await settings()).json()).toMatchObject({settings:{public_enabled:true}});
 r=await unpublish(req({reason:'privacy'}),context);expect(r.status).toBe(200);expect(await r.json()).toEqual({current_version_no:null});
 expect(await (await versions(req({}),context)).json()).toMatchObject({versions:[{version_no:1,status:'unpublished',unpublish_reason:'privacy'}]});
});
it('returns a blocked receipt for a dangling slot',async()=>{
 const {deps,topicId}=await scenario();vi.mocked(adminDeps).mockResolvedValue(deps);
 const draft=(await deps.db.draftOf(topicId))!;draft.body.dek.zh='{{ev:9}}';
 await deps.db.saveDraft({topicId,actor,body:draft.body,expectedRevision:draft.revision});
 const r=await check(req({}),ctx(topicId));expect(r.status).toBe(200);expect(await r.json()).toMatchObject({passed:false,blocked:['dangling_slot']});
});
it('validates publication and withdrawal requests before mutation, and reserves retired slugs',async()=>{
 const {topic_id}=await (await create()).json(),context=ctx(topic_id);
 for(const [result,status,code] of [
  [await publish(req({expected_draft_hash:'bad'}),context),400,'invalid_body:expected_draft_hash'],
  [await unpublish(req({reason:'other'}),context),400,'invalid_body:reason'],
  [await unpublish(req({reason:'error',note:actor}),context),400,'invalid_body:note'],
  [await retire(req({reason:'error',note:'A'.repeat(64)}),context),400,'invalid_body:note'],
  [await unpublish(req({reason:'error'}),context),409,'publish_blocked:not_published'],
 ] as const){expect(result.status).toBe(status);expect((await result.json()).error.code).toBe(code);}
 const r=await retire(req({reason:'owner_request'}),context);expect(r.status).toBe(200);expect(await r.json()).toEqual({retired:true});
 const retired=await preview(req({}),context);expect(retired.status).toBe(410);expect((await retired.json()).error.code).toBe('topic_retired');
 const duplicate=await create();expect(duplicate.status).toBe(409);expect((await duplicate.json()).error.code).toBe('slug_taken');
});
