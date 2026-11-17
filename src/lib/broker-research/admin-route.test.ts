// Admin route guard, error, and access-log ordering tests (spec §8.2).
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {BrokerResearchDbError} from './types';
import {BrokerError} from './errors';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn()}));
vi.mock('@/lib/admin/auth',async(orig)=>({...await orig<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
import {adminGet,adminPost,respondLogged,toErrorResponse} from './admin-route';
import {adminGuardCases,bodyOf,errCode,getReq,jsonReq} from './route-testing';

const ok=adminPost<unknown>('t.post',async({body,userId})=>new Response(JSON.stringify({body,userId}),{headers:{'Cache-Control':'no-store'}}));
const get=adminGet<unknown>('t.get',async()=>{throw new BrokerResearchDbError('publish_blocked','publish_blocked','review_not_approved,field_pending:target_price');});

describe('admin-route helpers',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:'admin-1'});});
 adminGuardCases({call:(r)=>ok(r,{}),request:()=>jsonReq('/api/admin/broker-research/x',{a:1}),requireAdmin:mocks.requireAdmin,post:true});
 it('passes parsed body and admin id; same-origin header accepted',async()=>{
  const r=await ok(jsonReq('/api/admin/broker-research/x',{a:1},{headers:{origin:'https://alpha.example'}}),{});
  expect(r.status).toBe(200);expect(await bodyOf(r)).toEqual({body:{a:1},userId:'admin-1'});
 });
 it('400 invalid_json for a non-object body',async()=>{
  const r=await ok(new Request('https://alpha.example/x',{method:'POST',headers:{'content-type':'application/json'},body:'[1]'}),{});
  expect(r.status).toBe(400);expect(await errCode(r)).toBe('invalid_json');
 });
 it('maps publish_blocked to 409 with the reason list',async()=>{
  const r=await get(getReq('/x'),{});expect(r.status).toBe(409);expect(r.headers.get('cache-control')).toBe('no-store');
  expect((await bodyOf<{error:{code:string;reasons:string[]}}>(r)).error).toMatchObject({code:'publish_blocked',reasons:['review_not_approved','field_pending:target_price']});
 });
 it('maps BrokerError and DB codes; unknown errors are logged 500',async()=>{
  expect(toErrorResponse(new BrokerError('lease_held',409),'t').status).toBe(409);
  expect(toErrorResponse(new BrokerResearchDbError('published_immutable'),'t').status).toBe(409);
  expect(toErrorResponse(new BrokerResearchDbError('hook_params_required'),'t').status).toBe(400);
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});const r=toErrorResponse(new Error('db down'),'t');
  expect(r.status).toBe(500);expect(await errCode(r)).toBe('internal_error');
  expect(spy).toHaveBeenCalledWith('[admin/broker-research] t','db down');spy.mockRestore();
 });
 it('respondLogged writes the log first; log failure never exposes payload',async()=>{
  const logAccess=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('log down'));
  const db={logAccess} as never,row={document_id:null,user_id:'admin-1',action:'text_viewed' as const,detail:{}};
  const a=await respondLogged(db,row,{secret:'x'});expect(a.status).toBe(200);expect(await bodyOf(a)).toEqual({secret:'x'});
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});const b=await respondLogged(db,row,{secret:'x'});
  expect(b.status).toBe(500);const body=await b.text();expect(body).not.toContain('secret');expect(body).toContain('access_log_failed');
  expect(b.headers.get('cache-control')).toBe('no-store');spy.mockRestore();
 });
});
