// src/lib/evals/cli/deps.test.ts
import {describe,expect,it} from 'vitest';
import type {FactTarget} from '../types';
import {buildRunDeps,fetchSourceBytes,hostOf} from './deps';

const REVENUE:FactTarget={type:'fact',concept:'revenue',period_start:'2022-09-25',period_end:'2023-09-30',duration:'12M',consolidation:'consolidated',unit:{kind:'currency',currency:'USD'}};

describe('buildRunDeps (spec §7.1 table)',()=>{
 it('ci without a test database: an unprivileged reader over the F6 frozen world in memory, no store, no credentials',async()=>{
  const d=await buildRunDeps('ci',false,{env:{}});
  try{
   expect(d.reader).toMatchObject({module:'facts',privileged:false});
   expect(d.store).toBeNull();
   expect(d.environment).toEqual({db_host:null,app_origin:null,db_state_rev:null});
   const ref=await d.reader.resolveSubject({market:'US',cik:'9990601'},'2026-11-20');
   expect(ref).not.toBeNull();
   const r=await d.reader.readDocumentBound(ref!,REVENUE,{kind:'edgar_accession',value:'0009990601-23-000106'},'2026-11-20');
   expect(r.rows.map(x=>x.value_text)).toEqual(['383285000000']);
   const p=await d.reader.project({issuer:{market:'US',cik:'9990601'},concepts:['revenue'],asOf:'2024-06-30',durations:['12M']},'2026-11-20');   // Task 11: projector wired
   expect(p.module).toBe('facts');expect(p.rows.length).toBeGreaterThan(0);
  }finally{await d.close();}
 },120_000);
 it('ci is never privileged',async()=>{await expect(buildRunDeps('ci',true,{env:{}})).rejects.toThrow('never privileged');});
 it('a setup that does not verify is refused before anything is built',async()=>{
  await expect(buildRunDeps('ci',false,{env:{},setupPath:'src/lib/evals/fixtures/gold/lock.json'})).rejects.toThrow(/^setup_mismatch:/);
 });
});

describe('hostOf / fetchSourceBytes',()=>{
 it('hostOf keeps the bare hostname only (no user, password, port or path)',()=>{
  expect(hostOf('postgres://user:secret@127.0.0.1:54322/postgres')).toBe('127.0.0.1');
  expect(hostOf('https://abcd.supabase.co/rest/v1')).toBe('abcd.supabase.co');
  expect(hostOf(undefined)).toBeNull();expect(hostOf('not a url')).toBeNull();
 });
 it('fetchSourceBytes sends the SEC user agent and refuses a non-2xx response',async()=>{
  const seen:{url:string;ua:string|null}[]=[];
  const ok=(async(url:string|URL|Request,init?:RequestInit)=>{seen.push({url:String(url),ua:new Headers(init?.headers).get('User-Agent')});return new Response(new Uint8Array([1,2,3]),{status:200});}) as typeof fetch;
  expect(await fetchSourceBytes('https://www.sec.gov/x',ok,'F6 test ua')).toEqual(new Uint8Array([1,2,3]));
  expect(seen).toEqual([{url:'https://www.sec.gov/x',ua:'F6 test ua'}]);
  const notFound=(async()=>new Response('no',{status:404})) as typeof fetch;
  await expect(fetchSourceBytes('https://www.sec.gov/y',notFound,'ua')).rejects.toThrow('source_http_404');
 });
});
