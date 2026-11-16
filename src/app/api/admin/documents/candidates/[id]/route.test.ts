// src/app/api/admin/documents/candidates/[id]/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),deps:vi.fn(),promote:vi.fn(),audit:vi.fn(),codeVersion:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/candidates/run',()=>({supabaseCandidatesDeps:mocks.deps}));
vi.mock('@/lib/documents/hk-facts/promote',()=>({promoteIssuerNow:mocks.promote}));
vi.mock('@/lib/facts/deps',()=>({resolveCodeVersion:mocks.codeVersion}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {DocumentsDbError} from '@/lib/documents/types';
import {POST} from './route';

const ID='c0000000-0000-4000-8000-000000000001',ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',ISS='a0000000-0000-4000-8000-000000000001';
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'},id=ID)=>POST(new Request(`https://alpha.example/api/admin/documents/candidates/${id}`,{method:'POST',headers,body:JSON.stringify(body)}),{params:Promise.resolve({id})});

describe('POST /api/admin/documents/candidates/[id]',()=>{
 let db:Record<string,ReturnType<typeof vi.fn>>;
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({tag:'admin'});mocks.codeVersion.mockReturnValue('sha');
  db={candidateById:vi.fn(async()=>({candidate_id:ID,document_id:'d',status:'candidate'})),decideCandidate:vi.fn(async(_id:string,d:{status:string})=>({status:d.status})),documentById:vi.fn(async()=>({document_id:'d',issuer_id:ISS}))};
  mocks.deps.mockReturnValue({db,tables:{},port:{},now:()=>new Date(),deadline:null,codeVersion:'sha'});
  mocks.promote.mockResolvedValue({state:'published',batchId:'b'});mocks.audit.mockResolvedValue(undefined);
 });
 it('confirms, audits, and promotes the issuer right away',async()=>{
  const res=await post({status:'confirmed'});
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(await res.json()).toEqual({id:ID,status:'confirmed',run:{state:'published'}});
  expect(db.decideCandidate).toHaveBeenCalledWith(ID,{kind:'human',decided_by:ADMIN,status:'confirmed'});
  expect(mocks.promote).toHaveBeenCalledWith(expect.objectContaining({db}),ISS,'manual');
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'document.candidate_decide',ID,{status:'confirmed',previous:'candidate'});
  expect(mocks.deps.mock.calls[0][1]).toMatchObject({codeVersion:'sha'});
  expect(mocks.codeVersion).toHaveBeenCalledWith({allowGit:false});
 });
 it('is idempotent: repeating a decision does not call decideCandidate again (a repeated confirm still re-runs promotion)',async()=>{
  db.candidateById.mockResolvedValue({candidate_id:ID,document_id:'d',status:'promoted'});
  expect(await (await post({status:'confirmed'})).json()).toEqual({id:ID,status:'promoted',run:{state:'published'}});
  db.candidateById.mockResolvedValue({candidate_id:ID,document_id:'d',status:'rejected'});
  expect(await (await post({status:'rejected'})).json()).toEqual({id:ID,status:'rejected',run:{state:'skipped',message:'unchanged'}});
  expect(db.decideCandidate).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('reject does not promote; a failing promotion still answers 200 with run.state failed',async()=>{
  expect(await (await post({status:'rejected'})).json()).toEqual({id:ID,status:'rejected',run:{state:'skipped',message:'not_confirmed'}});
  expect(mocks.promote).not.toHaveBeenCalled();
  mocks.promote.mockRejectedValueOnce(new Error('db down'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await (await post({status:'confirmed'})).json()).toMatchObject({status:'confirmed',run:{state:'failed',message:'promote_error'}});
  spy.mockRestore();
 });
 it('409 not_eligible / decided, 404 unknown candidate',async()=>{
  db.decideCandidate.mockRejectedValueOnce(new DocumentsDbError('not_eligible'));
  const r=await post({status:'confirmed'});expect(r.status).toBe(409);expect(await r.json()).toEqual({error:'not_eligible'});
  db.candidateById.mockResolvedValueOnce({candidate_id:ID,document_id:'d',status:'confirmed'});
  db.decideCandidate.mockRejectedValueOnce(new DocumentsDbError('decided'));
  expect((await post({status:'candidate'})).status).toBe(409);
  db.candidateById.mockResolvedValueOnce(null);
  expect((await post({status:'confirmed'})).status).toBe(404);
  expect(mocks.promote).not.toHaveBeenCalled();
 });
 it('401 / 403 from the admin guard before touching the database',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));expect((await post({status:'confirmed'})).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));expect((await post({status:'confirmed'})).status).toBe(403);
  expect(db.candidateById).not.toHaveBeenCalled();
 });
 it('415 non-JSON, 403 foreign Origin, 400 bad id / status',async()=>{
  expect((await post({status:'confirmed'},{'content-type':'text/plain'})).status).toBe(415);
  expect((await post({status:'confirmed'},{'content-type':'application/json',origin:'https://evil.example'})).status).toBe(403);
  expect((await post({status:'confirmed'},{'content-type':'application/json'},'nope')).status).toBe(400);
  expect((await post({status:'promoted'})).status).toBe(400);
  expect(db.decideCandidate).not.toHaveBeenCalled();
 });
});
