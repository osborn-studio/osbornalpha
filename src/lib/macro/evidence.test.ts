// src/lib/macro/evidence.test.ts
// EvidenceStore (spec §4.3, §0.2 N2; pattern of src/lib/facts/snapshot-store.ts).
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {describe,expect,it,vi} from 'vitest';
import {EVIDENCE_BUCKET,EvidenceError,evidencePath,extFor,memoryEvidenceStore,metaPathOf,sha256Hex,supabaseEvidenceStore} from './evidence';
import type {EvidenceInput} from './types';

const input=(text:string,o:Partial<EvidenceInput>={}):EvidenceInput=>{
 const bytes=new TextEncoder().encode(text);
 return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes,adapter:'fred_csv',fetchUrl:'https://fred.stlouisfed.org/graph/fredgraph.csv?id=UNRATE&cosd=2000-01-01',fetchHost:'fred.stlouisfed.org',httpStatus:200,contentType:'text/csv; charset=utf-8',fetchedAt:'2026-11-06T05:30:00.000Z',toolVersions:{node:'22.11.0'},...o};
};
const uploadStub=(results:({error:null}|{error:{message:string;statusCode?:string}})[])=>{
 const calls:[string,string,unknown,unknown][]=[];let i=0;
 const client={storage:{from:(bucket:string)=>({upload:vi.fn(async(path:string,body:unknown,opts:unknown)=>{calls.push([bucket,path,body,opts]);return results[i++]??{error:null};})})}};
 return {client:client as unknown as SupabaseClient,calls};
};

describe('evidence paths',()=>{
 it('maps content types to extensions (unknown → txt) and builds <adapter>/<sha256>.<ext> with a .meta.json sidecar',()=>{
  expect(extFor('text/csv; charset=utf-8')).toBe('csv');expect(extFor('application/csv')).toBe('csv');expect(extFor('application/json;charset=UTF-8')).toBe('json');expect(extFor('application/json')).toBe('json');expect(extFor('TEXT/HTML')).toBe('html');expect(extFor('text/plain')).toBe('txt');expect(extFor('application/octet-stream')).toBe('txt');
  const sha='a'.repeat(64);
  expect(evidencePath('akshare',sha,'application/json')).toBe(`akshare/${sha}.json`);
  expect(metaPathOf(`fred_csv/${sha}.csv`)).toBe(`fred_csv/${sha}.meta.json`);
  expect(()=>evidencePath('akshare','A'.repeat(64),'text/csv')).toThrow('evidence_invalid');
  expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
 });
});

describe('memoryEvidenceStore',()=>{
 it('stores once, answers exists on a repeat, keeps a sidecar without secrets, copies the bytes',async()=>{
  const store=memoryEvidenceStore();const e=input('observation_date,UNRATE\n2026-09-01,4.1\n');
  expect(await store.put(e)).toEqual({objectPath:`fred_csv/${e.sha256}.csv`,status:'stored'});
  expect(await store.put(e)).toEqual({objectPath:`fred_csv/${e.sha256}.csv`,status:'exists'});
  e.bytes[0]=0;                                                                                  // later mutation cannot rewrite evidence
  expect(new TextDecoder().decode(store.read(`fred_csv/${e.sha256}.csv`) as Uint8Array).startsWith('observation_date')).toBe(true);
  expect(JSON.parse(store.read(`fred_csv/${e.sha256}.meta.json`) as string)).toEqual({sha256:e.sha256,adapter:'fred_csv',byte_length:e.bytes.byteLength,fetch_url:e.fetchUrl,fetch_host:'fred.stlouisfed.org',http_status:200,content_type:'text/csv; charset=utf-8',fetched_at:'2026-11-06T05:30:00.000Z',tool_versions:{node:'22.11.0'}});
 });
 it('refuses bytes that do not match the declared hash, a host that is not the URL host, and an unknown adapter',async()=>{
  const store=memoryEvidenceStore();
  await expect(store.put({...input('x'),sha256:'e'.repeat(64)})).rejects.toMatchObject({code:'evidence_hash_mismatch'});
  await expect(store.put(input('x',{fetchHost:'evil.example.com'}))).rejects.toMatchObject({code:'evidence_invalid'});
  await expect(store.put(input('x',{adapter:'yfinance' as never}))).rejects.toMatchObject({code:'evidence_invalid'});
  expect(store.objects.size).toBe(0);
 });
});

describe('supabaseEvidenceStore',()=>{
 it('uploads bytes then the sidecar to macro-raw with upsert:false and the bucket MIME type',async()=>{
  const {client,calls}=uploadStub([{error:null},{error:null}]);const e=input('a,b\n');
  expect(await supabaseEvidenceStore(client).put(e)).toEqual({objectPath:`fred_csv/${e.sha256}.csv`,status:'stored'});
  expect(calls.map(c=>[c[0],c[1],c[3]])).toEqual([[EVIDENCE_BUCKET,`fred_csv/${e.sha256}.csv`,{contentType:'text/csv',upsert:false}],[EVIDENCE_BUCKET,`fred_csv/${e.sha256}.meta.json`,{contentType:'application/json',upsert:false}]]);
  expect(calls[0][2]).toEqual(e.bytes);
  expect(EVIDENCE_BUCKET).toBe('macro-raw');
 });
 it('treats 409 / already exists as exists (bytes and sidecar), other errors as evidence_upload_failed',async()=>{
  const e=input('a,b\n');
  const dup=uploadStub([{error:{message:'The resource already exists',statusCode:'409'}},{error:{message:'Duplicate',statusCode:'409'}}]);
  expect((await supabaseEvidenceStore(dup.client).put(e)).status).toBe('exists');
  const bad=uploadStub([{error:{message:'mime type not allowed',statusCode:'415'}}]);
  await expect(supabaseEvidenceStore(bad.client).put(e)).rejects.toMatchObject({code:'evidence_upload_failed'});
  const sidecar=uploadStub([{error:null},{error:{message:'boom',statusCode:'500'}}]);
  await expect(supabaseEvidenceStore(sidecar.client).put(e)).rejects.toMatchObject({code:'evidence_upload_failed'});
 });
 it('verifies the hash before any upload',async()=>{
  const {client,calls}=uploadStub([]);
  await expect(supabaseEvidenceStore(client).put({...input('a'),sha256:'f'.repeat(64)})).rejects.toBeInstanceOf(EvidenceError);
  expect(calls).toEqual([]);
 });
});
