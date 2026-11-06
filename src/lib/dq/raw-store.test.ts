// src/lib/dq/raw-store.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {RAW_EXT,RECONCILE_RAW_BUCKET,RawStoreError,memoryRawStore,rawMetaPath,rawPath,sha256Hex,supabaseRawStore} from './raw-store';
import type {RawPut} from './raw-store';

const enc=(s:string)=>new TextEncoder().encode(s);
const dec=(b:Uint8Array|undefined)=>new TextDecoder().decode(b);
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const item=(text:string,over:Partial<RawPut>={}):RawPut=>({kind:'sec-submissions',bytes:enc(text),contentType:'application/json',
 meta:{url:'https://data.sec.gov/submissions/CIK0000320193.json',fetched_at:'2026-11-05T00:00:00.000Z',http_status:200},...over});
const budget=()=>({remainingMs:()=>60_000,signal:new AbortController().signal});
const aborted=()=>{const c=new AbortController();c.abort();return {remainingMs:()=>0,signal:c.signal};};

describe('raw paths',()=>{
 it('content-addresses <kind>/<sha256>.<ext> with a .meta.json sidecar and parses the sha back',()=>{
  const h=sha('{}');
  expect(sha256Hex(enc('{}'))).toBe(h);
  expect(rawPath('sec-submissions',h,'json')).toBe(`sec-submissions/${h}.json`);
  expect(rawMetaPath(`cn-gold-pdf/${h}.pdf`)).toBe(`cn-gold-pdf/${h}.pdf.meta.json`);
  expect(RAW_EXT).toEqual({'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/zip':'zip'});
  const store=memoryRawStore();
  expect(store.sha256Of(`hkex/${h}.xlsx`)).toBe(h);
  expect(supabaseRawStore({} as never).sha256Of(`gleif/${h}.csv`)).toBe(h);
  for(const bad of [`hkex/${h}.exe`,`nope/${h}.json`,`hkex/${h.slice(1)}.json`,`hkex/${h}.meta.json`,`hkex/${h}.json.meta.json`,'../etc/passwd'])expect(()=>store.sha256Of(bad)).toThrow(RawStoreError);
 });
});

describe('memoryRawStore',()=>{
 it('stores once at the content address, answers exists on a repeat and keeps the first sidecar',async()=>{
  const store=memoryRawStore();
  const first=await store.put(item('{"a":1}'),budget());
  expect(first).toEqual({sha256:sha('{"a":1}'),path:`sec-submissions/${sha('{"a":1}')}.json`,status:'stored'});
  expect(await store.put(item('{"a":1}',{meta:{fetched_at:'2026-11-06T00:00:00.000Z'}}))).toEqual({...first,status:'exists'});
  expect(store.objects.get(first.path)).toEqual(enc('{"a":1}'));
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(first.path))))).toEqual({
   url:'https://data.sec.gov/submissions/CIK0000320193.json',fetched_at:'2026-11-05T00:00:00.000Z',http_status:200,
   kind:'sec-submissions',sha256:first.sha256,bytes:7,content_type:'application/json',
  });
 });
 it('keeps its own copy of the bytes',async()=>{
  const store=memoryRawStore();const it1=item('{"a":1}');
  const {path}=await store.put(it1);
  it1.bytes[0]=0;
  expect(dec(store.objects.get(path))).toBe('{"a":1}');
 });
 it('stores every content type under its extension',async()=>{
  const store=memoryRawStore();
  expect((await store.put({kind:'cn-gold-pdf',bytes:enc('%PDF-1.7'),contentType:'application/pdf'})).path).toBe(`cn-gold-pdf/${sha('%PDF-1.7')}.pdf`);
  expect((await store.put({kind:'hkex',bytes:enc('PK'),contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})).path).toBe(`hkex/${sha('PK')}.xlsx`);
 });
 it('refuses an unknown kind or content type, credential-like meta, a non-finite number and an exhausted budget',async()=>{
  const store=memoryRawStore();
  await expect(store.put(item('{}',{kind:'tickers' as never}))).rejects.toThrow('raw_invalid: kind:tickers');
  await expect(store.put(item('{}',{contentType:'image/png' as never}))).rejects.toThrow('raw_invalid: content_type:image/png');
  await expect(store.put(item('{}',{meta:{url:'https://api.example/x?token=abc'}}))).rejects.toThrow('raw_invalid: meta_credential:url');
  await expect(store.put(item('{}',{meta:{url:'https://user:pw@example.com/x'}}))).rejects.toThrow('raw_invalid: meta_credential:url');
  await expect(store.put(item('{}',{meta:{n:Number.NaN}}))).rejects.toThrow('raw_invalid: meta:n');
  await expect(store.put(item('{}'),aborted())).rejects.toThrow('raw_upload_failed: budget_exhausted');
  expect(store.objects.size).toBe(0);
 });
});

describe('cross-extension and credential hardening',()=>{
 const ZIP='application/zip' as const,XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
 it('memory: identical bytes under two content types keep two objects and two sidecars; sidecars are never overwritten',async()=>{
  const store=memoryRawStore();
  const a=await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'first'}});
  const b=await store.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX,meta:{note:'second'}});
  expect([a.status,b.status]).toEqual(['stored','stored']);
  expect(a.path).not.toBe(b.path);
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({content_type:ZIP,note:'first'});
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(b.path))))).toMatchObject({content_type:XLSX,note:'second'});
  expect((await store.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP,meta:{note:'third'}})).status).toBe('exists');
  expect(JSON.parse(dec(store.objects.get(rawMetaPath(a.path))))).toMatchObject({note:'first'});
 });
 it('supabase: cross-extension puts upload four distinct paths',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));
  const admin={storage:{from:()=>({upload})}} as never;const s=supabaseRawStore(admin);
  const a=await s.put({kind:'hkex',bytes:enc('PK'),contentType:ZIP});const b=await s.put({kind:'hkex',bytes:enc('PK'),contentType:XLSX});
  const paths=upload.mock.calls.map(c=>c[0]);
  expect(new Set(paths).size).toBe(4);
  expect(paths).toEqual([a.path,rawMetaPath(a.path),b.path,rawMetaPath(b.path)]);
  expect(JSON.parse(upload.mock.calls[3][1] as string)).toMatchObject({content_type:XLSX});
 });
 it('supabase: an already-aborted budget performs zero uploads; abort between object and sidecar skips the sidecar',async()=>{
  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
  await expect(s.put(item('{}'),aborted())).rejects.toThrow('raw_upload_failed: budget_exhausted');
  expect(upload).not.toHaveBeenCalled();
  const c=new AbortController();
  const up2=vi.fn(async()=>{c.abort();return {error:null};});
  const s2=supabaseRawStore({storage:{from:()=>({upload:up2})}} as never);
  await expect(s2.put(item('{}'),{remainingMs:()=>1,signal:c.signal})).rejects.toThrow('budget_exhausted');
  expect(up2).toHaveBeenCalledTimes(1);
 });
 it('rejects credential-like meta keys and URL parameter names (decoded) before any upload',async()=>{
  const upload=vi.fn(async()=>({error:null}));const s=supabaseRawStore({storage:{from:()=>({upload})}} as never);
  const mem=memoryRawStore();
  for(const meta of <Record<string,string>[]>[{api_key:'SECRET'},{Authorization:'Bearer x'},{cookie:'a=b'},{url:'https://example.test/?%61pi_key=SECRET'},{url:'https://example.test/a?x=1&Token=z'},{url:'https://example.test/#access_token=z'}]){
   await expect(s.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
   await expect(mem.put(item('{}',{meta}))).rejects.toThrow(/raw_invalid: meta_credential:/);
  }
  expect(upload).not.toHaveBeenCalled();
  expect(mem.objects.size).toBe(0);
  await expect(mem.put(item('{}',{meta:{url:'https://example.test/?page=2'}}))).resolves.toMatchObject({status:'stored'});
 });
});

describe('supabaseRawStore',()=>{
 const fake=(upload:(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>)=>{const from=vi.fn(()=>({upload}));return {admin:{storage:{from}} as never,from};};
 it('uploads the body then the sidecar with upsert:false into reconcile-raw',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));const {admin,from}=fake(upload);
  const out=await supabaseRawStore(admin).put(item('<html/>',{kind:'sec-document',contentType:'text/html',meta:{accession:'0000320193-25-000079'}}),budget());
  expect(out).toEqual({sha256:sha('<html/>'),path:`sec-document/${sha('<html/>')}.html`,status:'stored'});
  expect(from).toHaveBeenCalledWith(RECONCILE_RAW_BUCKET);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0]).toEqual([out.path,enc('<html/>'),{contentType:'text/html',upsert:false}]);
  expect(upload.mock.calls[1][0]).toBe(rawMetaPath(out.path));
  expect(upload.mock.calls[1][2]).toEqual({contentType:'application/json',upsert:false});
  expect(JSON.parse(upload.mock.calls[1][1] as string)).toEqual({accession:'0000320193-25-000079',kind:'sec-document',sha256:out.sha256,bytes:7,content_type:'text/html'});
 });
 it('maps 409 / already exists to exists and any other error to raw_upload_failed',async()=>{
  expect((await supabaseRawStore(fake(async()=>({error:{statusCode:'409',message:'The resource already exists'}})).admin).put(item('{}'))).status).toBe('exists');
  expect((await supabaseRawStore(fake(async()=>({error:{message:'Duplicate'}})).admin).put(item('{}'))).status).toBe('exists');
  const down=fake(async()=>({error:{statusCode:500,message:'storage down'}}));
  const e=await supabaseRawStore(down.admin).put(item('{}')).catch(x=>x);
  expect(e).toBeInstanceOf(RawStoreError);
  expect(e).toMatchObject({code:'raw_upload_failed',message:'raw_upload_failed: storage down'});
 });
 it('rejects without waiting for a hung upload once the budget aborts',async()=>{
  const hung=fake(()=>new Promise(()=>{}));const c=new AbortController();
  const p=supabaseRawStore(hung.admin).put(item('{}'),{remainingMs:()=>1,signal:c.signal});
  c.abort();
  await expect(p).rejects.toThrow('raw_upload_failed: budget_exhausted');
 });
 it('validates before any upload',async()=>{
  const upload=vi.fn(async()=>({error:null}));const {admin}=fake(upload);
  await expect(supabaseRawStore(admin).put(item('{}',{meta:{u:'https://x.example/?api_key=1'}}))).rejects.toThrow('raw_invalid: meta_credential:u');
  expect(upload).not.toHaveBeenCalled();
 });
});
