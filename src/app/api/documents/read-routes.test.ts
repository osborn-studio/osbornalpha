// src/app/api/documents/read-routes.test.ts
// Public branches of the document read routes (Task 11) over memoryDocumentsDb: the anon client is
// rlsView(db) (spec §4.12 imitation), the service client is db itself, the private bucket a memory
// store, the session a stub.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {DocumentsDb,ObjectStore} from '@/lib/documents/types';

const S=vi.hoisted(()=>({anon:null as unknown,db:null as unknown,store:null as unknown,user:null as string|null,resolve:vi.fn()}));
vi.mock('@/lib/supabase/anon',()=>({getAnonSupabase:()=>({__role:'anon'})}));
vi.mock('@/lib/supabase/admin',()=>({getAdminSupabase:()=>({__role:'service'})}));
vi.mock('@/lib/supabase/server',()=>({getServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:S.user?{id:S.user}:null},error:null})}})}));
vi.mock('@/lib/documents/db',async(orig)=>({...await orig<typeof import('@/lib/documents/db')>(),supabaseDocumentsDb:(c:{__role:string})=>c.__role==='anon'?S.anon:S.db}));
vi.mock('@/lib/documents/object-store',async(orig)=>({...await orig<typeof import('@/lib/documents/object-store')>(),supabaseObjectStore:()=>S.store}));
vi.mock('@/lib/entities/resolve',async(orig)=>({...await orig<typeof import('@/lib/entities/resolve')>(),resolveIssuer:S.resolve}));

import {GET as listGET} from './[ticker]/route';
import {GET as docGET} from './doc/[id]/route';
import {GET as pageGET} from './doc/[id]/pages/[n]/route';
import {GET as fileGET} from './doc/[id]/file/route';
import {GET as citationGET} from '../citations/[id]/route';
import {memoryDocumentsDb} from '@/lib/documents/memory-documents-db';
import type {MemoryDocumentsDb} from '@/lib/documents/memory-documents-db';
import {memoryObjectStore} from '@/lib/documents/object-store';
import {ISSUER,OWNER_A,rlsView,seedExtraction,seedPublicDocument,seedUpload,withOverride} from '@/lib/documents/test-seed';
import {cite} from '@/lib/documents/citations';
import {layoutFromItems} from '@/lib/documents/extract/pdf';
import {detectTables} from '@/lib/documents/extract/tables';
import {cpSlice} from '@/lib/documents/extract/pages-json';
import {CLASSIFIER_GEN,EXTRACTOR_VERSION} from '@/lib/documents/types';

const BASE='https://alpha.example';
const enc=(s:string)=>new TextEncoder().encode(s);
const TODAY=new Date().toISOString().slice(0,10);
const PUBLIC_SHORT=/^public, s-maxage=\d+, stale-while-revalidate=600$/;
const list=(ticker:string,qs='')=>listGET(new Request(`${BASE}/api/documents/${ticker}?${qs}`),{params:Promise.resolve({ticker})});
const doc=(id:string,qs='')=>docGET(new Request(`${BASE}/api/documents/doc/${id}?${qs}`),{params:Promise.resolve({id})});
const page=(id:string,n:string,qs='')=>pageGET(new Request(`${BASE}/api/documents/doc/${id}/pages/${n}?${qs}`),{params:Promise.resolve({id,n})});
const file=(id:string)=>fileGET(new Request(`${BASE}/api/documents/doc/${id}/file`),{params:Promise.resolve({id})});
const citation=(id:string)=>citationGET(new Request(`${BASE}/api/citations/${id}`),{params:Promise.resolve({id})});

let db:MemoryDocumentsDb,store:ReturnType<typeof memoryObjectStore>;
let v1:string,v2:string,licensed:string;
beforeEach(async()=>{
 vi.clearAllMocks();
 db=memoryDocumentsDb();store=memoryObjectStore();
 S.db=db;S.anon=rlsView(db as DocumentsDb);S.store=store;S.user=null;
 S.resolve.mockImplementation(async(_c:unknown,q:{ticker:string})=>q.ticker==='9999.HK'?null:({issuer_id:ISSUER,status:'active',names:{zh:'金蝶',en:'Kingdee'},identifiers:{cik:null,lei:null,usci:null},
  securities:[{ticker:'00268.HK',isin:null,figi:null,share_class:null,is_primary:true,valid_from:'2005-01-01',valid_to:null}]}));
 v1=await seedPublicDocument(db,enc('%PDF-v1'),{available_at:'2026-01-10T02:00:00.000Z',available_date:'2026-01-10',published_at:'2026-01-10T02:00:00.000Z'},store);
 v2=await seedPublicDocument(db,enc('%PDF-v2'),{available_at:'2026-03-05T02:00:00.000Z',available_date:'2026-03-05',published_at:'2026-01-10T02:00:00.000Z'},store);
 licensed=await seedUpload(db,OWNER_A,enc('%PDF-licensed'),{issuer_id:ISSUER,available_at:'2026-02-01T00:00:00.000Z',available_date:'2026-02-01'},store);
});

describe('GET /api/documents/[ticker]',()=>{
 it('HK ticker resolves; asOf picks the version available then; a past asOf is cached long; licensed rows never appear',async()=>{
  const res=await list('0268.HK','asOf=2026-02-01');
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('public, max-age=600, s-maxage=3600');
  const body=await res.json();
  expect(body).toMatchObject({issuerId:ISSUER,ticker:'00268.HK',asOf:'2026-02-01',extractorVersion:EXTRACTOR_VERSION,classifierGen:CLASSIFIER_GEN,nextCursor:null});
  expect(body.documents.map((d:{documentId:string})=>d.documentId)).toEqual([v1]);
  expect(body.documents[0]).toMatchObject({source:'hkexnews',sourceRef:'2026090300863_c',sourceVersion:1,observedReplacement:false,docClass:'annual_report',language:'zh',status:'stored',currentExtractionId:null,availableDate:'2026-01-10'});
  expect(Object.keys(body.documents[0]).sort()).toEqual(['availableAt','availableDate','bytes','contentSha256','currentExtractionId','docClass','documentId','filingSourceRef','fiscalPeriod','fiscalYear','formType','language','mime','observedReplacement','periodEnd','publishedAt','publishedAtPrecision','source','sourceRef','sourceUrl','sourceVersion','status','title'].sort());
  expect(Object.keys(body).sort()).toEqual(['asOf','classifierGen','documents','extractorVersion','issuerId','nextCursor','ticker']);
  expect(JSON.stringify(body)).not.toMatch(/owner|license|permission|storage/i);
  expect(S.resolve).toHaveBeenCalledWith(expect.anything(),{ticker:'0268.HK'},{today:TODAY});
 });
 it('default asOf = today → latest version (short public cache); versions=1 → all versions; cursor pages',async()=>{
  let res=await list('00268.HK');
  expect(res.headers.get('cache-control')).toMatch(PUBLIC_SHORT);
  expect((await res.json()).documents.map((d:{documentId:string;observedReplacement:boolean})=>[d.documentId,d.observedReplacement])).toEqual([[v2,true]]);
  res=await list('00268.HK','versions=1&limit=1');
  const first=await res.json();
  expect(first.documents.map((d:{documentId:string})=>d.documentId)).toEqual([v2]);
  expect(first.nextCursor).toEqual(expect.any(String));
  const second=await (await list('00268.HK',`versions=1&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
  expect(second.documents.map((d:{documentId:string})=>d.documentId)).toEqual([v1]);
  expect(second.nextCursor).toBeNull();
 });
 it('filters: source/class/from/to; an empty result is no-store',async()=>{
  expect((await (await list('00268.HK','source=edgar')).json()).documents).toEqual([]);
  const res=await list('00268.HK','asOf=2025-12-31');
  expect((await res.json()).documents).toEqual([]);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect((await (await list('00268.HK','from=2026-03-01&to=2026-03-31')).json()).documents.map((d:{documentId:string})=>d.documentId)).toEqual([v2]);
  expect((await (await list('00268.HK','class=interim_report')).json()).documents).toEqual([]);
 });
 it('400 on invalid or repeated parameters, 404 unknown_ticker, 409 ambiguous owner',async()=>{
  for(const qs of ['source=upload','class=memo','asOf=2999-01-01','asOf=2026-02-30','from=2026-03-01&to=2026-01-01','versions=true','limit=0','limit=1001','limit=1&limit=2','cursor=%%%','cursor=bm90LWpzb24'])
   expect((await list('00268.HK',qs)).status,qs).toBe(400);
  expect((await list('bad%ticker!')).status).toBe(400);
  const res=await list('9999.HK');
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe('unknown_ticker');
  expect(res.headers.get('cache-control')).toBe('no-store');
  S.resolve.mockRejectedValueOnce(new Error('ambiguous_owner'));
  expect((await list('00268.HK')).status).toBe(409);
 });
});

describe('GET /api/documents/doc/[id]',()=>{
 it('public document: metadata, assets, extractions page, supersedes / supersededBy, public cache',async()=>{
  const ext=await seedExtraction(db,v1,['a']);
  let res=await doc(v1);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toMatch(PUBLIC_SHORT);
  let body=await res.json();
  expect(body).toMatchObject({extractorVersion:EXTRACTOR_VERSION,classifierGen:CLASSIFIER_GEN,document:{documentId:v1,status:'extracted',currentExtractionId:ext},assets:[],supersedes:null,supersededBy:v2});
  expect(body.extractions).toEqual({rows:[{extractionId:ext,extractorVersion:EXTRACTOR_VERSION,tableAlgoVersion:'tables/1.0',pageCount:1,hasTextLayer:true,createdAt:expect.any(String)}],nextCursor:null});
  res=await doc(v2);
  body=await res.json();
  expect(body).toMatchObject({supersedes:v1,supersededBy:null,extractions:{rows:[],nextCursor:null}});
 });
 it('licensed and unknown ids are 404 (no-store); malformed id or cursor 400',async()=>{
  for(const id of [licensed,'00000000-0000-4000-8000-000000000000']){
   const res=await doc(id);
   expect(res.status).toBe(404);
   expect(res.headers.get('cache-control')).toBe('no-store');
  }
  expect((await doc('nope')).status).toBe(400);
  expect((await doc(v1,'extractionsCursor=%%%')).status).toBe(400);
 });
});

describe('GET /api/documents/doc/[id]/pages/[n]',()=>{
 it('current extraction by default; layout=1 adds lines and tables whose cell offsets slice the page text by code point',async()=>{
  const {text,lines}=layoutFromItems([
   {str:'𠀋😀 綜合損益表',x:50,y:800,w:80,h:12},
   {str:'收益',x:50,y:760,w:20,h:10},{str:'1,234',x:300,y:760,w:25,h:10},{str:'1,100',x:400,y:760,w:25,h:10},
   {str:'銷售成本',x:50,y:745,w:40,h:10},{str:'(800)',x:300,y:745,w:25,h:10},{str:'(700)',x:400,y:745,w:25,h:10},
  ]);
  const ext=await seedExtraction(db,v1,[],{store,layouts:[{page_no:1,width:595,height:842,text,lines,tables:detectTables(lines)}]});
  let res=await page(v1,'1');
  expect(res.status).toBe(200);
  let body=await res.json();
  expect(body).toEqual({documentId:v1,extractionId:ext,pageNo:1,text,textHash:expect.stringMatching(/^[0-9a-f]{64}$/),charCount:Array.from(text).length,width:595,height:842});
  res=await page(v1,'1','layout=1');
  body=await res.json();
  expect(body.lines[0]).toEqual({index:0,y:800,x0:50,x1:130,text:'𠀋😀 綜合損益表',charStart:0,charEnd:8});
  const cell=body.tables[0].cells.find((c:{text:string})=>c.text==='1,234');
  expect(cell).toMatchObject({row:0,col:1,numeric:true});
  expect(cpSlice(body.text,cell.charStart,cell.charEnd)).toBe('1,234');
  expect(body.tables[0].headerLines.map((l:{text:string})=>l.text)).toEqual(['𠀋😀 綜合損益表']);
 });
 it('explicit older extraction; foreign extraction, missing page, licensed document → 404; corrupt pages.json → 500',async()=>{
  const old=await seedExtraction(db,v1,['old text'],{store,extractorVersion:'docs-extract/0.9'});
  await db.requestExtract(v1,OWNER_A);
  const cur=await seedExtraction(db,v1,['new text'],{store});
  expect((await (await page(v1,'1',`extraction=${old}`)).json()).text).toBe('old text');
  expect((await (await page(v1,'1')).json()).extractionId).toBe(cur);
  const other=await seedExtraction(db,v2,['v2 text'],{store});
  expect((await page(v1,'1',`extraction=${other}`)).status).toBe(404);
  expect((await page(v1,'2')).status).toBe(404);
  expect((await page(v2,'1','extraction=not-a-uuid')).status).toBe(400);
  expect((await page(v2,'0')).status).toBe(400);
  expect((await page(v2,'x')).status).toBe(400);
  expect((await page(v2,'1','layout=yes')).status).toBe(400);
  await seedExtraction(db,licensed,['secret'],{store});
  expect((await page(licensed,'1')).status).toBe(404);
  const e=(await db.extractionById(cur))!;
  store.objects().set(e.pages_json_path,{bytes:enc('{"tampered":true}'),mime:'application/json'});
  expect((await page(v1,'1','layout=1')).status).toBe(500);
  expect((await page(v1,'1')).status).toBe(200);   // plain text does not need pages.json
 });
 it('a document without any extraction is 404',async()=>{
  expect((await page(v2,'1')).status).toBe(404);
 });
});

describe('GET /api/documents/doc/[id]/file',()=>{
 it('401 without a session; signed URL (300 s, private no-store) for a public document; licensed → 404',async()=>{
  let res=await file(v1);
  expect(res.status).toBe(401);
  expect((await res.json()).error.code).toBe('unauthenticated');
  S.user='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const signedCalls:[string,number][]=[];
  S.store=withOverride<ObjectStore>(store,{signedUrl:async(p:string,s:number)=>{signedCalls.push([p,s]);return `https://signed.example/${p}?e=${s}`;}});
  const before=Date.now();
  res=await file(v1);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('private, no-store');
  const body=await res.json();
  expect(signedCalls).toEqual([[(await db.documentById(v1))!.storage_path,300]]);
  expect(body.url).toBe(`https://signed.example/${(await db.documentById(v1))!.storage_path}?e=300`);
  expect(Date.parse(body.expiresAt)-before).toBeGreaterThanOrEqual(299_000);
  expect((await file(licensed)).status).toBe(404);
  expect((await file('bad')).status).toBe(400);
 });
});

describe('GET /api/citations/[id]',()=>{
 it('a published human citation is public with integrity and currentExtraction; internal and unknown citations are 404',async()=>{
  const ext=await seedExtraction(db,v1,['𠀋😀 Revenue 1,234']);
  const human=await cite(db,{document_id:v1,extraction_id:ext,page_no:1,char_start:3,char_end:10,created_by:'human',created_ref:OWNER_A});
  await db.publishCitations([human]);
  const internal=await cite(db,{document_id:v1,extraction_id:ext,page_no:1,char_start:11,char_end:16,created_by:'extractor',created_ref:'hk-facts/1/hk-facts/1.0'});
  const res=await citation(human);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toMatch(PUBLIC_SHORT);
  expect(await res.json()).toMatchObject({citationId:human,documentId:v1,extractionId:ext,pageNo:1,charStart:3,charEnd:10,snippet:'Revenue',integrity:'ok',currentExtraction:true,createdBy:'human',
   document:{title:'2025 年報',docClass:'annual_report',language:'zh',publishedAt:'2026-01-10T02:00:00.000Z',availableAt:'2026-01-10T02:00:00.000Z'}});
  for(const id of [internal,'00000000-0000-4000-8000-000000000000']){const r=await citation(id);expect(r.status).toBe(404);expect(r.headers.get('cache-control')).toBe('no-store');}
  expect((await citation('x')).status).toBe(400);
 });
});

describe('Task 11 review fixes',()=>{
 const WRONG_SHAPE='WyJ4Il0';   // base64url of ["x"]: decodes, is not a keyset cursor
 it('a decodable cursor of the wrong shape is 400 on the doc route, never 500',async()=>{
  let res=await doc(v1,`extractionsCursor=${WRONG_SHAPE}`);
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe('invalid_parameter:extractionsCursor');
  // a db-level cursor rejection (valid at the route, refused below) is still the caller's 400
  const {DocumentsDbError}=await import('@/lib/documents/types');
  S.anon=withOverride<DocumentsDb>(S.anon as DocumentsDb,{extractionsOf:async()=>{throw new DocumentsDbError('invalid_input','invalid_cursor');}});
  expect((await doc(v1)).status).toBe(400);
 });
 it('only cursor-related invalid_input is 400 on the list route; other errors are 500',async()=>{
  const {DocumentsDbError}=await import('@/lib/documents/types');
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  S.anon=withOverride<DocumentsDb>(S.anon as DocumentsDb,{readDocuments:async()=>{throw new DocumentsDbError('invalid_input','invalid_asof');}});
  expect((await list('00268.HK')).status).toBe(500);
  S.anon=withOverride<DocumentsDb>(S.anon as DocumentsDb,{readDocuments:async()=>{throw new DocumentsDbError('invalid_input','invalid_cursor');}});
  expect((await list('00268.HK')).status).toBe(400);
  spy.mockRestore();
 });
 it('supersededBy is a direct successor lookup (limit 1), not a bounded scan',async()=>{
  const calls:unknown[]=[];
  S.anon=withOverride<DocumentsDb>(S.anon as DocumentsDb,{documentVersions:async(s,r,p)=>{calls.push(p.limit);return (db as DocumentsDb).documentVersions(s,r,p);}});
  expect((await (await doc(v1)).json()).supersededBy).toBe(v2);
  expect(calls).toEqual([1]);
  // a first visible version above the current one that is not +1 (gap): no successor is claimed
  S.anon=withOverride<DocumentsDb>(S.anon as DocumentsDb,{documentVersions:async()=>({rows:[{...(await db.documentById(v2))!,source_version:20000}],nextCursor:null})});
  expect((await (await doc(v1)).json()).supersededBy).toBeNull();   // first version above is not +1 → no successor claimed from a gap
 });
 it('pages: n must be 1-999999 without leading zeros',async()=>{
  for(const n of ['01','0','1000000','-1','1.5'])expect((await page(v1,n)).status,n).toBe(400);
 });
 it('unknown query parameters are 400 invalid_parameter:<name> on every public read route',async()=>{
  const r1=await list('00268.HK','x=1');expect(r1.status).toBe(400);expect((await r1.json()).error.code).toBe('invalid_parameter:x');
  const r2=await doc(v1,'bust=1');expect(r2.status).toBe(400);expect((await r2.json()).error.code).toBe('invalid_parameter:bust');
  expect((await page(v1,'1','cb=1&layout=1')).status).toBe(400);
  const r3=await fileGET(new Request(`${BASE}/api/documents/doc/${v1}/file?t=1`),{params:Promise.resolve({id:v1})});expect(r3.status).toBe(400);
  const r4=await citationGET(new Request(`${BASE}/api/citations/00000000-0000-4000-8000-000000000000?t=1`),{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000000'})});expect(r4.status).toBe(400);
 });
 it('a citation on a licensed document is 404 to anon, even when the anon client leaks the row',async()=>{
  const ext=await seedExtraction(db,licensed,['secret Revenue 5']);
  const c=await cite(db,{document_id:licensed,extraction_id:ext,page_no:1,char_start:7,char_end:14,created_by:'human',created_ref:OWNER_A});
  const r=await citation(c);
  expect(r.status).toBe(404);
  expect(r.headers.get('cache-control')).toBe('no-store');
  S.anon=db;   // RLS bypassed: the explicit permission check still refuses
  expect((await citation(c)).status).toBe(404);
 });
 it('file: a missing stored object is 404 not_found (not 500)',async()=>{
  S.user='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const missing=await seedPublicDocument(db,enc('%PDF-nostore'),{source_ref:'2026090300999_c'});   // no store passed: no object
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const res=await file(missing);
  spy.mockRestore();
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe('not_found');
 });
});
