// src/lib/documents/object-store.test.ts
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {ObjectStoreError,blobPath,extOfMime,isDuplicateError,isNotFoundError,isStorePath,memoryObjectStore,pagesJsonPath,supabaseObjectStore} from './object-store';
import {DOCS_BUCKET} from './types';

const H=createHash('sha256').update('pdf').digest('hex');const P=createHash('sha256').update('pages').digest('hex');
const bytes=(s:string)=>new TextEncoder().encode(s);

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
  const store=memoryObjectStore({failPut:p=>p.endsWith('.json')});const path=blobPath(H,'application/pdf');
  const b=bytes('%PDF-1.4');
  expect(await store.put(path,b,'application/pdf')).toBe('created');
  b[0]=0;                                                                     // the caller's buffer changes afterwards
  expect(await store.put(path,bytes('other'),'application/pdf')).toBe('exists');
  const got=await store.get(path);expect(new TextDecoder().decode(got)).toBe('%PDF-1.4');
  got[0]=0;expect(new TextDecoder().decode(await store.get(path))).toBe('%PDF-1.4');
  expect(await store.head(path)).toEqual({bytes:8});
  expect(await store.head(blobPath(P,'application/pdf'))).toBeNull();
  expect(await store.signedUrl(path,300)).toBe(`memory://${DOCS_BUCKET}/${path}?expires=300`);
  await expect(store.signedUrl(path,0)).rejects.toThrow(/signed_url_failed/);
  await expect(store.get(blobPath(P,'application/pdf'))).rejects.toMatchObject({code:'object_not_found'});
  await expect(store.put(pagesJsonPath(H,P),bytes('{}'),'application/json')).rejects.toMatchObject({code:'object_put_failed'});
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
  const {store,from}=make({upload});const path=blobPath(H,'application/pdf');const body=bytes('%PDF');
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
