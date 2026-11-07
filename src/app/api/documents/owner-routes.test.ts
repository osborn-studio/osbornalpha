// src/app/api/documents/owner-routes.test.ts
// Owner branches (Task 12, spec §8.2): a licensed document of owner A is invisible to anon (404, file
// 401) and to owner B (404, nothing audited); owner A gets doc/page/file/citation with
// 'private, no-store' and one research_audit_log row per read; an audit failure is a 500.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {DocumentsDb,ObjectStore} from '@/lib/documents/types';

const S=vi.hoisted(()=>({anon:null as unknown,db:null as unknown,store:null as unknown,user:null as string|null,audit:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({__role:'anon'})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({__role:'service'})}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:S.user?{id:S.user}:null},error:null})}})}));
vi.mock('@/lib/documents/db',async(orig)=>({...await orig<typeof import('@/lib/documents/db')>(),supabaseDocumentsDb:(c:{__role:string})=>c.__role==='anon'?S.anon:S.db}));
vi.mock('@/lib/documents/object-store',async(orig)=>({...await orig<typeof import('@/lib/documents/object-store')>(),supabaseObjectStore:()=>S.store}));
vi.mock('@/lib/research/store',()=>({audit:S.audit}));

import {GET as docGET} from './doc/[id]/route';
import {GET as pageGET} from './doc/[id]/pages/[n]/route';
import {GET as fileGET} from './doc/[id]/file/route';
import {GET as citationGET} from '../citations/[id]/route';
import {memoryDocumentsDb} from '@/lib/documents/memory-documents-db';
import {memoryObjectStore} from '@/lib/documents/object-store';
import {OWNER_A,OWNER_B,rlsView,seedExtraction,seedPublicDocument,seedUpload,withOverride} from '@/lib/documents/test-seed';
import {cite} from '@/lib/documents/citations';

const BASE='https://alpha.example';
const enc=(s:string)=>new TextEncoder().encode(s);
const doc=(id:string)=>docGET(new Request(`${BASE}/api/documents/doc/${id}`),{params:Promise.resolve({id})});
const page=(id:string,n:string,qs='')=>pageGET(new Request(`${BASE}/api/documents/doc/${id}/pages/${n}?${qs}`),{params:Promise.resolve({id,n})});
const file=(id:string)=>fileGET(new Request(`${BASE}/api/documents/doc/${id}/file`),{params:Promise.resolve({id})});
const citation=(id:string)=>citationGET(new Request(`${BASE}/api/citations/${id}`),{params:Promise.resolve({id})});

let licensed:string,ext:string,cid:string,pub:string,internalPublic:string;
beforeEach(async()=>{
 vi.clearAllMocks();
 const db=memoryDocumentsDb();const store=memoryObjectStore();
 S.db=db;S.anon=rlsView(db as DocumentsDb);S.user=null;S.audit.mockResolvedValue(undefined);
 S.store=withOverride<ObjectStore>(store,{signedUrl:async(p:string,s:number)=>`https://signed.example/${p}?e=${s}`});
 licensed=await seedUpload(db,OWNER_A,enc('%PDF-licensed'),{},store);
 ext=await seedExtraction(db,licensed,['𠀋😀 target price 120'],{store});
 cid=await cite(db,{document_id:licensed,extraction_id:ext,page_no:1,char_start:3,char_end:15,created_by:'module',created_ref:'foreign-research'});
 pub=await seedPublicDocument(db,enc('%PDF-public'),{},store);
 const pubExt=await seedExtraction(db,pub,['public text'],{store});
 internalPublic=await cite(db,{document_id:pub,extraction_id:pubExt,page_no:1,char_start:0,char_end:6,created_by:'extractor',created_ref:'x'});
});

describe('licensed document, owner A',()=>{
 it('anonymous: 404 for doc/page/citation, 401 for file; nothing audited',async()=>{
  for(const r of [await doc(licensed),await page(licensed,'1'),await citation(cid)]){expect(r.status).toBe(404);expect(r.headers.get('cache-control')).toBe('no-store');}
  expect((await file(licensed)).status).toBe(401);
  expect(S.audit).not.toHaveBeenCalled();
 });
 it('owner B: the same 404 for all four; nothing audited',async()=>{
  S.user=OWNER_B;
  for(const r of [await doc(licensed),await page(licensed,'1'),await file(licensed),await citation(cid)]){
   expect(r.status).toBe(404);
   expect(await r.json()).toEqual({error:{code:'not_found',message:'not found'}});
  }
  expect(S.audit).not.toHaveBeenCalled();
 });
 it('owner A: all four with private, no-store, each audited once as document.read (audit scoped to the owner)',async()=>{
  S.user=OWNER_A;
  const d=await doc(licensed);
  expect(d.status).toBe(200);
  expect(d.headers.get('cache-control')).toBe('private, no-store');
  expect((await d.json()).document).toMatchObject({documentId:licensed,permission:'licensed',licenseRef:'lic-1',sourceUrl:null});
  const p=await page(licensed,'1','layout=1');
  expect(p.headers.get('cache-control')).toBe('private, no-store');
  expect(await p.json()).toMatchObject({pageNo:1,text:'𠀋😀 target price 120',lines:[{charStart:0,charEnd:19}]});
  const f=await file(licensed);
  expect(f.headers.get('cache-control')).toBe('private, no-store');
  expect((await f.json()).url).toMatch(/^https:\/\/signed\.example\/blobs\/[0-9a-f]{64}\.pdf\?e=300$/);
  const c=await citation(cid);
  expect(c.headers.get('cache-control')).toBe('private, no-store');
  expect(await c.json()).toMatchObject({citationId:cid,snippet:'target price',integrity:'ok',currentExtraction:true,createdBy:'module'});
  const calls=S.audit.mock.calls.map(([ctx,action,id,detail])=>[(ctx as {userId:string}).userId,action,id,detail]);
  expect(calls).toEqual([
   [OWNER_A,'document.read',licensed,{route:'documents/doc',requester:OWNER_A}],
   [OWNER_A,'document.read',licensed,{route:'documents/page',requester:OWNER_A,page_no:1}],
   [OWNER_A,'document.read',licensed,{route:'documents/file',requester:OWNER_A,signed_url_issued:true}],
   [OWNER_A,'document.read',licensed,{route:'citations',requester:OWNER_A,citation_id:cid}],
  ]);
 });
 it('owner A: a missing page is 404 and not audited; an audit failure is 500 audit_failed with no content',async()=>{
  S.user=OWNER_A;
  expect((await page(licensed,'2')).status).toBe(404);
  expect(S.audit).not.toHaveBeenCalled();
  S.audit.mockRejectedValue(new Error('insert failed'));
  for(const r of [await doc(licensed),await page(licensed,'1'),await file(licensed),await citation(cid)]){
   expect(r.status).toBe(500);
   const body=JSON.stringify(await r.json());
   expect(body).toContain('audit_failed');
   expect(body).not.toContain('target price');
   expect(body).not.toContain('signed.example');
  }
 });
});

describe('owner A with a foreign extraction id',()=>{
 it('own document id but owner B extraction id → 404 on page, nothing audited',async()=>{
  const db=S.db as ReturnType<typeof memoryDocumentsDb>;
  const bDoc=await seedUpload(db,OWNER_B,enc('%PDF-b-private'),{});
  const bExt=await seedExtraction(db,bDoc,['b secret'],{});
  S.user=OWNER_A;
  const r=await page(licensed,'1',`extraction=${bExt}`);
  expect(r.status).toBe(404);
  expect(JSON.stringify(await r.json())).not.toContain('b secret');
  expect(S.audit).not.toHaveBeenCalled();
 });
});

describe('public documents are not affected by the owner branch',()=>{
 it('signed-in users read public documents without audit; an internal citation of a public document stays 404 even for a signed-in user',async()=>{
  S.user=OWNER_A;
  expect((await doc(pub)).headers.get('cache-control')).toMatch(/^public, s-maxage=/);
  expect((await file(pub)).status).toBe(200);
  expect((await citation(internalPublic)).status).toBe(404);
  expect(S.audit).not.toHaveBeenCalled();
 });
});
