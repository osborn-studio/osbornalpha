// src/app/api/admin/documents/approvals/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),insert:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>({insertApproval:mocks.insert})}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {DocumentsDbError} from '@/lib/documents/types';
import {POST} from './route';

const ADMIN='9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BODY={extractorRef:'hk-facts/1/hk-facts/1.0',extractorVersion:'docs-extract/1.0',tableAlgoVersion:'tables/1.0',codeVersion:'a'.repeat(40),concepts:['revenue','gross_profit'],
 goldSha256:'b'.repeat(64),precision:'0.97',recall:'0.955',reportPath:'docs/audits/2026-11-06-document-pipeline/eval-hk-facts-2026-11-20.json'};
const post=(body:unknown,headers:Record<string,string>={'content-type':'application/json'})=>POST(new Request('https://alpha.example/api/admin/documents/approvals',{method:'POST',headers,body:JSON.stringify(body)}));

describe('POST /api/admin/documents/approvals',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.insert.mockResolvedValue('ap-1');mocks.audit.mockResolvedValue(undefined);});
 it('writes the approval with the admin as approver and audits it (201)',async()=>{
  const res=await post(BODY);
  expect(res.status).toBe(201);expect(await res.json()).toEqual({approvalId:'ap-1'});
  expect(mocks.insert).toHaveBeenCalledWith({extractor_ref:BODY.extractorRef,extractor_version:BODY.extractorVersion,table_algo_version:BODY.tableAlgoVersion,code_version:BODY.codeVersion,
   concepts:BODY.concepts,gold_sha256:BODY.goldSha256,precision:'0.97',recall:'0.955',report_path:BODY.reportPath,approved_by:ADMIN});
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({userId:ADMIN}),'document.approval_insert','ap-1',expect.objectContaining({extractor_ref:BODY.extractorRef,precision:'0.97',recall:'0.955'}));
 });
 it('422 threshold when precision or recall is below 0.95 (exact decimal compare), before the database',async()=>{
  for(const over of [{precision:'0.94'},{recall:'0.9499999'},{precision:'0.949'}]){
   const res=await post({...BODY,...over});
   expect(res.status,JSON.stringify(over)).toBe(422);expect(await res.json()).toEqual({error:'threshold'});
  }
  expect(mocks.insert).not.toHaveBeenCalled();
  expect((await post({...BODY,precision:'0.95',recall:'1'})).status).toBe(201);
 });
 it('maps the ea_threshold check violation to 422 as well',async()=>{
  mocks.insert.mockRejectedValueOnce(new DocumentsDbError('unknown','new row violates check constraint "ea_threshold"'));
  expect((await post(BODY)).status).toBe(422);
 });
 it('400 on malformed fields',async()=>{
  for(const over of [{concepts:[]},{concepts:['revenue','revenue']},{concepts:['rd_expense']},{goldSha256:'x'},{precision:'1.5'},{precision:'95%'},{extractorRef:''},{reportPath:'/etc/passwd'},{codeVersion:7}])
   expect((await post({...BODY,...over})).status,JSON.stringify(over)).toBe(400);
  expect(mocks.insert).not.toHaveBeenCalled();
 });
});
