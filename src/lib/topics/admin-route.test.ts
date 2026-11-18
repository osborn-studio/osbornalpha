// Topic plan T5.1: gating, body readers and safe error mapping.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AdminForbidden,AdminUnauthenticated,requireAdminUser} from '@/lib/admin/auth';
import {adminGet,adminPost,adminActor,jsonNoStore,uuidParam,strField,intField,enumField,objField} from './admin-route';
import {TopicError} from './errors';
import {TopicsDbError} from './types';
import {EvidenceRefError} from '@/lib/evidence/ref';
import {FIXTURE_ADMIN_ID} from './admin-fixture';
vi.mock('@/lib/admin/auth',()=>({requireAdminUser:vi.fn(),AdminForbidden:class extends Error{},AdminUnauthenticated:class extends Error{}}));
beforeEach(()=>{vi.stubEnv('TOPICS_ENABLED','1');vi.stubEnv('TOPICS_E2E_FIXTURES','');vi.mocked(requireAdminUser).mockResolvedValue({id:'actor'} as Awaited<ReturnType<typeof requireAdminUser>>);});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
const request=(headers:Record<string,string>={'content-type':'application/json'},body='{}')=>new Request('http://localhost/api/admin/topics',{method:'POST',headers,body});
const ok=vi.fn(async()=>jsonNoStore({ok:true}));
async function check(r:Response,status:number,code?:string){
 expect(r.status).toBe(status);expect(r.headers.get('cache-control')).toBe('no-store');
 if(code)expect(await r.json()).toMatchObject({error:{code,message:code}});
}
it('gates before authentication and body parsing',async()=>{
 vi.stubEnv('TOPICS_ENABLED','');vi.mocked(requireAdminUser).mockClear();ok.mockClear();
 for(const wrap of [adminGet,adminPost])await check(await wrap('test',ok)(request({},'['),{}),404,'topics_disabled');
 expect(requireAdminUser).not.toHaveBeenCalled();expect(ok).not.toHaveBeenCalled();
});
it.each([[new AdminUnauthenticated(),401,'authentication_required'],[new AdminForbidden(),403,'admin_required']] as const)('maps auth errors',async(e,status,code)=>{
 vi.mocked(requireAdminUser).mockRejectedValue(e);
 for(const wrap of [adminGet,adminPost])await check(await wrap('test',ok)(request({},'['),{}),status,code);
});
it.each([
 [{},'{}',415,'unsupported_media_type'],
 [{'content-type':'application/json',origin:'https://foreign.test'},'{}',403,'forbidden_origin'],
 [{'content-type':'application/json'},'[]',400,'invalid_body'],
 [{'content-type':'application/json'},'null',400,'invalid_body'],
 [{'content-type':'application/json'},'{',400,'invalid_body'],
] as const)('validates JSON transport',async(headers,body,status,code)=>{
 await check(await adminPost('test',ok)(request(headers,body),{}),status,code);
});
it('passes handler arguments and forces no-store on success',async()=>{
 const req=request({'content-type':'application/json; charset=utf-8',origin:'http://localhost'},'{"value":1}'),ctx={key:'context'};
 const fn=vi.fn(async()=>Response.json({ok:true}));
 await check(await adminPost('test',fn)(req,ctx),200);
 expect(fn).toHaveBeenCalledWith({request:req,ctx,userId:'actor',body:{value:1}});
 await check(await adminGet('test',async()=>Response.json({ok:true}))(req,ctx),200);
});
it.each([
 [new TopicsDbError('revision_conflict'),409,'revision_conflict'],
 [new TopicsDbError('topics_slug_shape'),400,'invalid_body:slug'],
 [new TopicsDbError('topics_category'),400,'invalid_body:category'],
 [new TopicsDbError('publish_blocked:draft_changed'),409,'publish_blocked:draft_changed'],
 [new EvidenceRefError('invalid_ref:id'),400,'invalid_ref:id'],
] as const)('maps known errors',async(e,status,code)=>{
 await check(await adminGet('test',async()=>{throw e;})(request(),{}),status,code);
});
it('places detail at meta and hides unknown database messages',async()=>{
 const r=await adminGet('test',async()=>{throw new TopicError('invalid_body:title',{field:'title'});})(request(),{});
 expect(await r.json()).toEqual({error:{code:'invalid_body:title',message:'invalid_body:title'},meta:{field:'title'}});
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 for(const e of [new TopicsDbError('secret_database_message'),new TopicsDbError('toString'),new Error('secret')]){
  await check(await adminGet('test',async()=>{throw e;})(request(),{}),500,'internal_error');
 }
 expect(log).toHaveBeenCalled();
});
it('uses fixture identity only in isolated mode',async()=>{
 vi.stubEnv('TOPICS_E2E_FIXTURES','1');vi.stubEnv('NODE_ENV','test');
 for(const key of ['VERCEL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])vi.stubEnv(key,'');
 vi.mocked(requireAdminUser).mockClear();
 expect(await adminActor()).toBe(FIXTURE_ADMIN_ID);expect(requireAdminUser).not.toHaveBeenCalled();
 vi.stubEnv('VERCEL','1');expect(await adminActor()).toBe('actor');
});
it('reads fields and distinguishes body errors from URL parameters',()=>{
 expect(strField({x:'ok'},'x',{max:3})).toBe('ok');expect(strField({},'x',{max:3,optional:true})).toBeUndefined();
 expect(intField({x:1},'x',1,3)).toBe(1);expect(enumField({x:'a'},'x',['a'])).toBe('a');expect(objField({x:{}},'x')).toEqual({});
 for(const read of [()=>strField({x:''},'x',{max:3}),()=>intField({x:1.5},'x',1,3),()=>enumField({x:'b'},'x',['a']),()=>objField({x:[]},'x')])expect(read).toThrow('invalid_body:x');
 expect(()=>uuidParam('bad','topic')).toThrow('invalid_parameter:topic');
 expect(uuidParam('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});
