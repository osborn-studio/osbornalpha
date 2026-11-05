// src/lib/facts/snapshot-store.test.ts
import {describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {memorySnapshotStore,supabaseSnapshotStore,snapshotPath,metaPath,SNAPSHOT_BUCKET} from './snapshot-store';
import type {RawSnapshot} from './types';

const ISSUER='00000000-0000-4000-8000-000000000001';
const snap=(text:string):RawSnapshot=>({bytes:new TextEncoder().encode(text),sha256:createHash('sha256').update(text).digest('hex'),meta:{source:'edgar',url:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',fetched_at:'2026-11-04T00:00:00.000Z',http_status:200}});
const budget=()=>({remainingMs:()=>60_000,signal:new AbortController().signal});
const aborted=()=>{const c=new AbortController();c.abort();return {remainingMs:()=>0,signal:c.signal};};

describe('snapshot paths',()=>{
 it('places the body under {source}/{issuer}/{sha256}.json with a .meta.json sidecar',()=>{
  const s=snap('{}');
  expect(snapshotPath('edgar',ISSUER,s.sha256)).toBe(`edgar/${ISSUER}/${s.sha256}.json`);
  expect(metaPath(snapshotPath('tushare',ISSUER,s.sha256))).toBe(`tushare/${ISSUER}/${s.sha256}.meta.json`);
 });
});

describe('memorySnapshotStore',()=>{
 it('stores once, answers exists on a repeat, keeps the sidecar and refuses bad paths or an exhausted budget',async()=>{
  const store=memorySnapshotStore();const s=snap('{"a":1}');const path=snapshotPath('edgar',ISSUER,s.sha256);
  expect(await store.put(s,path,budget())).toBe('stored');
  expect(await store.put(s,path,budget())).toBe('exists');
  expect(store.objects.get(path)).toEqual(s.bytes);
  expect(JSON.parse(store.objects.get(metaPath(path)) as string)).toMatchObject({source:'edgar',sha256:s.sha256,bytes:7,http_status:200});
  await expect(store.put(s,'edgar/x.json',budget())).rejects.toThrow('snapshot_upload_failed');
  await expect(store.put(snap('{"b":2}'),snapshotPath('edgar',ISSUER,'f'.repeat(64)),aborted())).rejects.toThrow('budget_exhausted');
 });
});

describe('snapshot evidence integrity',()=>{
 it('refuses bytes that do not match the declared hash and keeps its own copy of the bytes',async()=>{
  const bad:RawSnapshot={...snap('{"a":1}'),sha256:'e'.repeat(64)};
  await expect(memorySnapshotStore().put(bad,snapshotPath('edgar',ISSUER,bad.sha256),budget())).rejects.toThrow('snapshot_hash_mismatch');
  const upload=vi.fn(async()=>({error:null}));
  await expect(supabaseSnapshotStore({storage:{from:()=>({upload})}} as never).put(bad,snapshotPath('edgar',ISSUER,bad.sha256),budget())).rejects.toThrow('snapshot_hash_mismatch');
  expect(upload).not.toHaveBeenCalled();
  const store=memorySnapshotStore();const s=snap('{"a":1}');const path=snapshotPath('edgar',ISSUER,s.sha256);
  await store.put(s,path,budget());
  s.bytes[0]=0;                                                  // caller mutates its buffer afterwards
  expect(new TextDecoder().decode(store.read(path) as Uint8Array)).toBe('{"a":1}');
  (store.read(path) as Uint8Array)[0]=0;                          // and mutating a read copy changes nothing either
  expect(new TextDecoder().decode(store.read(path) as Uint8Array)).toBe('{"a":1}');
 });
});

describe('supabaseSnapshotStore',()=>{
 const fake=(upload:(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>)=>{const from=vi.fn(()=>({upload}));return {admin:{storage:{from}} as never,from};};
 it('uploads body then sidecar with upsert:false into disclosure-raw',async()=>{
  const upload=vi.fn<(path:string,body:unknown,opts:unknown)=>Promise<{error:unknown}>>(async()=>({error:null}));const {admin,from}=fake(upload);
  const s=snap('{"a":1}');const path=snapshotPath('edgar',ISSUER,s.sha256);
  expect(await supabaseSnapshotStore(admin).put(s,path,budget())).toBe('stored');
  expect(from).toHaveBeenCalledWith(SNAPSHOT_BUCKET);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0]).toEqual([path,s.bytes,{contentType:'application/json',upsert:false}]);
  expect(upload.mock.calls[1][0]).toBe(metaPath(path));
  expect(JSON.parse(upload.mock.calls[1][1] as string)).not.toHaveProperty('token');
 });
 it('maps 409 / already exists to exists and any other error to snapshot_upload_failed',async()=>{
  const s=snap('{}');const path=snapshotPath('tushare',ISSUER,s.sha256);
  const dup=fake(async()=>({error:{statusCode:'409',message:'The resource already exists'}}));
  expect(await supabaseSnapshotStore(dup.admin).put(s,path,budget())).toBe('exists');
  const dupMsg=fake(async()=>({error:{message:'Duplicate'}}));
  expect(await supabaseSnapshotStore(dupMsg.admin).put(s,path,budget())).toBe('exists');
  const down=fake(async()=>({error:{statusCode:500,message:'storage down'}}));
  await expect(supabaseSnapshotStore(down.admin).put(s,path,budget())).rejects.toThrow('snapshot_upload_failed: storage down');
 });
 it('rejects without waiting for a hung upload once the budget aborts',async()=>{
  const hung=fake(()=>new Promise(()=>{}));const c=new AbortController();
  const p=supabaseSnapshotStore(hung.admin).put(snap('{}'),snapshotPath('edgar',ISSUER,'a'.repeat(64)),{remainingMs:()=>1,signal:c.signal});
  c.abort();
  await expect(p).rejects.toThrow('budget_exhausted');
 });
});
