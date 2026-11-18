// Topic plan T5.2: real route handlers with memory persistence.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {POST,GET} from './route';
import {GET as getDraft,PUT} from './[id]/draft/route';
import {memoryTopicsDb} from '@/lib/topics/memory-db';
import {emptyDraft} from '@/lib/topics/drafts';
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
 vi.mocked(adminDeps).mockReturnValue({db:memoryTopicsDb(),resolver:memoryResolver(allFixtures()),now:()=>new Date(),codeVersion:'test',privateIds:async()=>new Set()});
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
 expect(await read.json()).toEqual({topic:{topic_id:created.topic_id,topic_slug:'rates-and-banks',category:'macro',status:'draft',current_version_id:null},draft:{revision:1,draft_hash:created.draft_hash,body:emptyDraft(title),updated_at:expect.any(String)},lint:[]});
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
 const {topic_id}=await (await create()).json();vi.spyOn(adminDeps().db,'draftOf').mockResolvedValue(null);
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
 const responses=await Promise.all([create(),GET(new Request('http://localhost'),{}),getDraft(new Request('http://localhost'),ctx()),PUT(req({}),ctx())]);
 for(const r of responses){expect(r.status).toBe(404);expect((await r.json()).error.code).toBe('topics_disabled');expect(r.headers.get('cache-control')).toBe('no-store');}
 expect(requireAdminUser).not.toHaveBeenCalled();
});
