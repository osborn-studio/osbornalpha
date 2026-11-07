// src/lib/documents/object-store.test.ts
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {MAX_OBJECT_BYTES,ObjectStoreError,blobPath,extOfMime,isDuplicateError,isNotFoundError,isStorePath,memoryObjectStore,pagesJsonPath,supabaseObjectStore} from './object-store';
import {DOCS_BUCKET} from './types';

const H=createHash('sha256').update('pdf').digest('hex');const P=createHash('sha256').update('pages').digest('hex');
const bytes=(s:string)=>new TextEncoder().encode(s);
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');

describe('paths',()=>{
 it('are content addressed and validated',()=>{
  expect(blobPath(H,'application/pdf')).toBe(`blobs/${H}.pdf`);
  expect(blobPath(H,'text/html')).toBe(`blobs/${H}.htm`);
  expect(blobPath(H,'application/xhtml+xml')).toBe(`blobs/${H}.htm`);
  expect(blobPath(H,'text/xml')).toBe(`blobs/${H}.xml`);
  expect(blobPath(H,'application/json')).toBe(`blobs/${H}.json`);
  expect(pagesJsonPath(H,P)).toBe(`extractions/${H}/${P}.pages.json`);
  expect(()=>extOfMime('image/png')).toThrow(ObjectStoreError);
  expect(()=>blobPath('ABC','application/pdf')).toThrow(/invalid_path/);
  expect(()=>pagesJsonPath(H,'x')).toThrow(/invalid_path/);
  expect(isStorePath(`blobs/${H}.pdf`)).toBe(true);
  for(const bad of [`blobs/${H}.exe`,`../blobs/${H}.pdf`,`blobs/${H}.pdf/x`,`extractions/${H}/${P}.json`,''])expect(isStorePath(bad)).toBe(false);
 });
});

describe('error shape normalisation (Supabase duplicate shape unverified: spec §15 Q6)',()=>{
 it('treats statusCode 409, HTTP 409 and "already exists"/"Duplicate" as a duplicate; 404 shapes as not found',()=>{
  expect(isDuplicateError({message:'The resource already exists',status:400,statusCode:'409'})).toBe(true);
  expect(isDuplicateError({message:'x',status:409})).toBe(true);
  expect(isDuplicateError({message:'x',error:'Duplicate'})).toBe(true);
  expect(isDuplicateError({message:'The resource already exists'})).toBe(true);
  expect(isDuplicateError({message:'Payload too large',status:413,statusCode:'413'})).toBe(false);
  expect(isNotFoundError({message:'Object not found',status:400,statusCode:'404'})).toBe(true);
  expect(isNotFoundError({message:'x',status:404})).toBe(true);
  expect(isNotFoundError({message:'Internal error',status:500})).toBe(false);
 });
});

describe('memoryObjectStore',()=>{
 it('creates once, answers exists, copies bytes in and out, heads, signs, and fails on demand',async()=>{
  const jsonBytes=bytes('{}');const jsonPath=pagesJsonPath(H,sha(jsonBytes));
  const store=memoryObjectStore({failPut:p=>p.endsWith('.json')});const b=bytes('%PDF-1.4');const path=blobPath(sha(b),'application/pdf');
  expect(await store.put(path,b,'application/pdf')).toBe('created');
  b[0]=0;                                                                     // the caller's buffer changes afterwards
  expect(await store.put(path,bytes('%PDF-1.4'),'application/pdf')).toBe('exists');
  const got=await store.get(path);expect(new TextDecoder().decode(got)).toBe('%PDF-1.4');
  got[0]=0;expect(new TextDecoder().decode(await store.get(path))).toBe('%PDF-1.4');
  expect(await store.head(path)).toEqual({bytes:8});
  expect(await store.head(blobPath(P,'application/pdf'))).toBeNull();
  expect(await store.signedUrl(path,300)).toBe(`memory://${DOCS_BUCKET}/${path}?expires=300`);
  await expect(store.signedUrl(path,0)).rejects.toThrow(/signed_url_failed/);
  await expect(store.get(blobPath(P,'application/pdf'))).rejects.toMatchObject({code:'object_not_found'});
  await expect(store.put(jsonPath,jsonBytes,'application/json')).rejects.toMatchObject({code:'object_put_failed'});
  await expect(store.put('blobs/x.pdf',bytes('x'),'application/pdf')).rejects.toMatchObject({code:'invalid_path'});
  expect([...store.objects().keys()]).toEqual([path]);
 });
});

describe('supabaseObjectStore',()=>{
 const make=(api:Record<string,unknown>)=>{const from=vi.fn(()=>api);return {store:supabaseObjectStore({storage:{from}} as unknown as SupabaseClient),from};};
 it('uploads with upsert:false and the mime; maps duplicates to exists and other errors to object_put_failed',async()=>{
  const upload=vi.fn().mockResolvedValueOnce({data:{path:'p'},error:null})
   .mockResolvedValueOnce({data:null,error:{message:'The resource already exists',status:400,statusCode:'409'}})
   .mockResolvedValueOnce({data:null,error:{message:'gateway timeout',status:504,statusCode:'504'}});
  const {store,from}=make({upload});const body=bytes('%PDF');const path=blobPath(sha(body),'application/pdf');
  expect(await store.put(path,body,'application/pdf')).toBe('created');
  expect(upload).toHaveBeenCalledWith(path,body,{contentType:'application/pdf',upsert:false});
  expect(from).toHaveBeenCalledWith(DOCS_BUCKET);
  expect(await store.put(path,body,'application/pdf')).toBe('exists');
  await expect(store.put(path,body,'application/pdf')).rejects.toMatchObject({name:'ObjectStoreError',code:'object_put_failed'});
  await expect(store.put('../x',body,'application/pdf')).rejects.toMatchObject({code:'invalid_path'});
  expect(upload).toHaveBeenCalledTimes(3);                                   // the bad path never reached Storage
 });
 it('downloads bytes, heads sizes, signs URLs and normalises not-found',async()=>{
  const download=vi.fn().mockResolvedValueOnce({data:new Blob([bytes('%PDF')]),error:null}).mockResolvedValueOnce({data:null,error:{message:'Object not found',status:400,statusCode:'404'}})
   .mockResolvedValueOnce({data:null,error:{message:'boom',status:500}});
  const info=vi.fn().mockResolvedValueOnce({data:{size:4},error:null}).mockResolvedValueOnce({data:null,error:{message:'Object not found',status:400,statusCode:'404'}});
  const createSignedUrl=vi.fn().mockResolvedValueOnce({data:{signedUrl:'https://x/sign?t=1'},error:null}).mockResolvedValueOnce({data:null,error:{message:'nope'}});
  const {store}=make({download,info,createSignedUrl});const path=blobPath(H,'application/pdf');
  expect(new TextDecoder().decode(await store.get(path))).toBe('%PDF');
  await expect(store.get(path)).rejects.toMatchObject({code:'object_not_found'});
  await expect(store.get(path)).rejects.toMatchObject({code:'object_get_failed'});
  expect(await store.head(path)).toEqual({bytes:4});
  expect(await store.head(path)).toBeNull();
  expect(await store.signedUrl(path,300)).toBe('https://x/sign?t=1');
  expect(createSignedUrl).toHaveBeenCalledWith(path,300);
  await expect(store.signedUrl(path,300)).rejects.toMatchObject({code:'signed_url_failed'});
 });
});

describe('put integrity (review fixes)',()=>{
 const pdf=bytes('%PDF-1.4 x');const pdfPath=blobPath(sha(pdf),'application/pdf');
 const stores=()=>{const upload=vi.fn().mockResolvedValue({data:{path:'p'},error:null});
  return [['memory',memoryObjectStore(),null],['supabase',supabaseObjectStore({storage:{from:()=>({upload})}} as unknown as SupabaseClient),upload]] as const;};
 it('rejects bytes whose sha256 is not the one in the path, writing nothing',async()=>{
  for(const [,store,upload] of stores()){
   await expect(store.put(blobPath(H,'application/pdf'),pdf,'application/pdf')).rejects.toMatchObject({code:'invalid_path'});
   await expect(store.put(pagesJsonPath(H,P),bytes('{}'),'application/json')).rejects.toMatchObject({code:'invalid_path'});
   if(upload)expect(upload).not.toHaveBeenCalled();
  }
  const mem=memoryObjectStore();await mem.put(pagesJsonPath(H,sha(bytes('{}'))),bytes('{}'),'application/json').catch(()=>{});
  expect(mem.objects().size).toBe(1);
  const mem2=memoryObjectStore();await expect(mem2.put(blobPath(H,'application/pdf'),pdf,'application/pdf')).rejects.toBeInstanceOf(ObjectStoreError);expect(mem2.objects().size).toBe(0);
 });
 it('requires the mime to match the path extension and pages.json to be application/json',async()=>{
  for(const [,store,upload] of stores()){
   await expect(store.put(pdfPath,pdf,'text/html' as never)).rejects.toMatchObject({code:'invalid_path'});
   await expect(store.put(pdfPath,pdf,'image/png' as never)).rejects.toMatchObject({code:'invalid_path'});
   await expect(store.put(pagesJsonPath(H,sha(pdf)),pdf,'application/pdf')).rejects.toMatchObject({code:'invalid_path'});
   expect(await store.put(blobPath(sha(pdf),'text/xml'),pdf,'text/xml')).toBe('created');   // matching ext+hash is fine for any listed mime
   if(upload)expect(upload).toHaveBeenCalledTimes(1);
  }
 });
 it('memory store enforces the 52428800-byte bucket limit like Storage (object_put_failed)',async()=>{
  expect(MAX_OBJECT_BYTES).toBe(52428800);
  const ok=new Uint8Array(52428800);const big=new Uint8Array(52428801);
  const mem=memoryObjectStore();
  expect(await mem.put(blobPath(sha(ok),'application/pdf'),ok,'application/pdf')).toBe('created');
  await expect(mem.put(blobPath(sha(big),'application/pdf'),big,'application/pdf')).rejects.toMatchObject({code:'object_put_failed'});
  expect(mem.objects().size).toBe(1);
  const upload=vi.fn();
  const sb=supabaseObjectStore({storage:{from:()=>({upload})}} as unknown as SupabaseClient);
  await expect(sb.put(blobPath(sha(big),'application/pdf'),big,'application/pdf')).rejects.toMatchObject({code:'object_put_failed'});
  expect(upload).not.toHaveBeenCalled();
 });
});

describe('lookups and error mapping (review fixes)',()=>{
 it('mime lookup ignores inherited properties',()=>{
  for(const m of ['constructor','__proto__','toString','hasOwnProperty'])expect(()=>extOfMime(m)).toThrow(ObjectStoreError);
  expect(()=>blobPath(H,'constructor')).toThrow(/invalid_path/);
 });
 it('not-found: status codes decide first, and a missing bucket is not a missing object',()=>{
  expect(isNotFoundError({message:'Bucket not found',status:404,statusCode:'404'})).toBe(false);
  expect(isNotFoundError({message:'Bucket not found'})).toBe(false);
  expect(isNotFoundError({message:'Object not found',status:500,statusCode:'500'})).toBe(false);
  expect(isNotFoundError({message:'not found',statusCode:'',status:undefined})).toBe(true);
  expect(isNotFoundError({message:'x',statusCode:404})).toBe(true);
 });
 it('signing a missing object is object_not_found in both stores',async()=>{
  const path=blobPath(H,'application/pdf');
  await expect(memoryObjectStore().signedUrl(path,300)).rejects.toMatchObject({code:'object_not_found'});
  const createSignedUrl=vi.fn().mockResolvedValueOnce({data:null,error:{message:'Object not found',status:400,statusCode:'404'}}).mockResolvedValueOnce({data:null,error:{message:'Bucket not found',status:404,statusCode:'404'}});
  const sb=supabaseObjectStore({storage:{from:()=>({createSignedUrl})}} as unknown as SupabaseClient);
  await expect(sb.signedUrl(path,300)).rejects.toMatchObject({code:'object_not_found'});
  await expect(sb.signedUrl(path,300)).rejects.toMatchObject({code:'signed_url_failed'});
 });
 it('head validates the reported size',async()=>{
  const info=vi.fn().mockResolvedValueOnce({data:{size:'abc'},error:null}).mockResolvedValueOnce({data:{size:1.5},error:null}).mockResolvedValueOnce({data:{size:-1},error:null}).mockResolvedValueOnce({data:{size:Number.MAX_SAFE_INTEGER+2},error:null}).mockResolvedValueOnce({data:{size:'12'},error:null});
  const sb=supabaseObjectStore({storage:{from:()=>({info})}} as unknown as SupabaseClient);const path=blobPath(H,'application/pdf');
  for(let i=0;i<4;i++)await expect(sb.head(path)).rejects.toMatchObject({code:'object_get_failed'});
  expect(await sb.head(path)).toEqual({bytes:12});
 });
});
