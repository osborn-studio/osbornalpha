// src/app/api/admin/documents/candidates/[id]/eligibility.test.ts
// Task 17 review: confirming runs against a REAL memoryDocumentsDb with real extractions — a
// candidate of a comparison-language (English) extraction is refused with 409 not_eligible and
// never reaches promotion; the same candidate of the primary extraction is confirmed.
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),deps:vi.fn(),promote:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/candidates/run',()=>({supabaseCandidatesDeps:mocks.deps}));
vi.mock('@/lib/documents/hk-facts/promote',()=>({promoteIssuerNow:mocks.promote}));
vi.mock('@/lib/research/store',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/research/store')>(),audit:mocks.audit}));

import {FY25,ADMIN,candidatesDepsOf,hkHarness,seedHkCandidates,seedHkExtraction} from '@/lib/documents/hk-facts/test-support';
import {POST} from './route';

const post=(id:string,status='confirmed')=>POST(new Request(`https://alpha.example/api/admin/documents/candidates/${id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status})}),{params:Promise.resolve({id})});

describe('POST /api/admin/documents/candidates/[id] — eligibility on real extractions',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.requireAdmin.mockResolvedValue({id:ADMIN});mocks.getAdmin.mockReturnValue({});mocks.promote.mockResolvedValue({state:'published'});mocks.audit.mockResolvedValue(undefined);});
 it('409 not_eligible for a comparison (English) candidate with passing checks; confirmed for the primary one',async()=>{
  const h=hkHarness();mocks.deps.mockReturnValue(candidatesDepsOf(h));
  const zh=await seedHkExtraction(h,{sourceRef:'2026000000001',language:'zh',facts:FY25.slice(0,1)});
  const en=await seedHkExtraction(h,{sourceRef:'2026000000002_e',language:'en',facts:FY25.slice(0,1),bytesTag:'en'});
  expect((await h.docs.extractionById(en.extractionId))!.candidates_role).toBe('comparison');
  const zhIds=[...(await seedHkCandidates(h,zh)).values()];const enIds=[...(await seedHkCandidates(h,en)).values()];
  const refused=await post(enIds[0]);
  expect(refused.status).toBe(409);expect(await refused.json()).toEqual({error:'not_eligible'});
  expect((await h.docs.candidateById(enIds[0]))!.status).toBe('candidate');
  expect(mocks.promote).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled();
  const ok=await post(zhIds[0]);
  expect(ok.status).toBe(200);expect((await ok.json()).status).toBe('confirmed');
  expect(mocks.promote).toHaveBeenCalledTimes(1);
 });
});
