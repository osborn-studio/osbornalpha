// src/app/api/admin/documents/candidates/route.test.ts
import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({requireAdmin:vi.fn(),getAdmin:vi.fn(),db:null as unknown}));
vi.mock('@/lib/admin/auth',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/admin/auth')>(),requireAdminUser:mocks.requireAdmin}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:mocks.getAdmin}));
vi.mock('@/lib/documents/db',()=>({supabaseDocumentsDb:()=>mocks.db}));

import {AdminForbidden,AdminUnauthenticated} from '@/lib/admin/auth';
import {DocumentsDbError} from '@/lib/documents/types';
import {GET} from './route';

const EXT='e0000000-0000-4000-8000-000000000001',ISS='a0000000-0000-4000-8000-000000000001',DOC='d0000000-0000-4000-8000-000000000001';
const CAND={candidate_id:'c1',document_id:DOC,extraction_id:EXT,kind:'financial_fact',extractor_kind:'rule',extractor_ref:'hk-facts/1/hk-facts/1.0',natural_key:'revenue:2025-01-01:2025-12-31:12M:CNY',
 citations:{value:'v1',label:'l1',unit:'u1',period:[{role:'statement_title',citation_id:'t1'},{role:'column_header',citation_id:'h1'}]},payload:{concept:'revenue',value:'6256000000'},
 fingerprint:'f',checks:[{check:'identity_gp',blocking:true,passed:true}],checks_passed:true,status:'confirmed',decision_kind:'human',decided_by:'u',approval_id:null,decided_at:'2026-11-06T00:00:00.000Z',inherited_from:null,input_snapshot:{},batch_id:'b',created_at:'2026-11-06T00:00:00.000Z'};
const cite=(id:string,snippet:string)=>({citation_id:id,document_id:DOC,extraction_id:EXT,page_no:3,char_start:10,char_end:10+snippet.length,bbox:null,snippet,text_hash:'h',visibility:'internal',created_by:'extractor',created_ref:'r',created_at:'x'});
const url=(qs:string)=>new Request(`https://alpha.example/api/admin/documents/candidates?${qs}`);

describe('GET /api/admin/documents/candidates',()=>{
 let db:Record<string,ReturnType<typeof vi.fn>>;
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({id:'admin-1'});mocks.getAdmin.mockReturnValue({});
  db={candidatesOf:vi.fn(async()=>({rows:[CAND],nextCursor:'next'})),citationsByIds:vi.fn(async(ids:string[])=>ids.filter(i=>i!=='h1').map(i=>cite(i,i==='v1'?'6,256,000':'x'))),
   documentsByIds:vi.fn(async()=>[{document_id:DOC,title:'二零二五年年報'}]),publicationsOf:vi.fn(async()=>({rows:[{candidate_id:'c1',pub_gen:1,run_id:'r1',fact_id:'f1',state:'published',created_at:'x',updated_at:'y'}],nextCursor:null}))};
  mocks.db=db;
 });
 it('lists candidates with checks, cited snippets, the document title and publications (private, no-store)',async()=>{
  const res=await GET(url(`issuer=${ISS}&status=confirmed&limit=50`));
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('private, no-store');
  expect(db.candidatesOf).toHaveBeenCalledWith({issuerId:ISS,status:'confirmed'},{cursor:null,limit:50});
  const body=await res.json();
  expect(body.nextCursor).toBe('next');
  expect(body.candidates[0]).toMatchObject({candidateId:'c1',documentTitle:'二零二五年年報',status:'confirmed',checksPassed:true,checks:CAND.checks,payload:CAND.payload,
   publications:[{pubGen:1,runId:'r1',factId:'f1',state:'published'}]});
  expect(body.candidates[0].citations).toEqual([
   {role:'value',citationId:'v1',pageNo:3,charStart:10,charEnd:19,snippet:'6,256,000'},{role:'label',citationId:'l1',pageNo:3,charStart:10,charEnd:11,snippet:'x'},
   {role:'unit',citationId:'u1',pageNo:3,charStart:10,charEnd:11,snippet:'x'},{role:'period:statement_title',citationId:'t1',pageNo:3,charStart:10,charEnd:11,snippet:'x'},
   {role:'period:column_header',citationId:'h1',pageNo:null,charStart:null,charEnd:null,snippet:null}]);
 });
 it('returns the unit_currency evidence of an inherited-currency EPS candidate',async()=>{
  db.candidatesOf.mockResolvedValueOnce({rows:[{...CAND,payload:{concept:'eps_basic',unit:'HKD/share'},citations:{...CAND.citations,unit_currency:'uc1'}}],nextCursor:null});
  const body=await (await GET(url('status=confirmed'))).json();
  expect(body.candidates[0].citations.find((c:{role:string})=>c.role==='unit_currency')).toEqual({role:'unit_currency',citationId:'uc1',pageNo:3,charStart:10,charEnd:11,snippet:'x'});
  expect(db.citationsByIds.mock.calls[0][0]).toContain('uc1');
  expect(db.documentsByIds).toHaveBeenCalledTimes(1);   // one batched lookup, not one read per candidate
 });
 it('extraction wins over issuer; a status next to an extraction filters the page',async()=>{
  await GET(url(`extraction=${EXT}&issuer=${ISS}&status=candidate`));
  expect(db.candidatesOf).toHaveBeenCalledWith({extractionId:EXT},{cursor:null,limit:100});
  expect((await (await GET(url(`extraction=${EXT}&status=candidate`))).json()).candidates).toEqual([]);
 });
 it('validates parameters',async()=>{
  for(const qs of ['','status=nope','status=confirmed&status=rejected','extraction=x','issuer=1','status=candidate&limit=0','status=candidate&limit=1001'])expect((await GET(url(qs))).status,qs).toBe(400);
  db.candidatesOf.mockRejectedValueOnce(new DocumentsDbError('invalid_input','bad cursor'));
  expect(await (await GET(url('status=candidate&cursor=zzz'))).json()).toEqual({error:'invalid_parameter:cursor'});
 });
 it('401 / 403 from the admin guard',async()=>{
  mocks.requireAdmin.mockRejectedValueOnce(new AdminUnauthenticated('x'));expect((await GET(url('status=candidate'))).status).toBe(401);
  mocks.requireAdmin.mockRejectedValueOnce(new AdminForbidden('x'));expect((await GET(url('status=candidate'))).status).toBe(403);
  expect(db.candidatesOf).not.toHaveBeenCalled();
 });
});
