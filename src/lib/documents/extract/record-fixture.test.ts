// src/lib/documents/extract/record-fixture.test.ts
// Offline checks of scripts/documents/record-fixture.ts (T10 review): redirect handling and atomic, validated writes.
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,describe,expect,it,vi} from 'vitest';
import {HKEX_HOST,MAX_REDIRECTS,download,recordProblem,writeFileAtomic} from '../../../../scripts/documents/record-fixture';

const START=`https://${HKEX_HOST}/listedco/listconews/sehk/2026/0903/2026090300863_c.pdf`;
const pdf=new TextEncoder().encode('%PDF-1.4 body');
const redirect=(to:string)=>new Response(null,{status:302,headers:{location:to}});
const ok=()=>new Response(pdf,{status:200,headers:{'content-type':'application/pdf'}});

describe('download (manual redirects)',()=>{
 it('asks fetch not to follow redirects, follows up to 3 hops on the HKEX host and returns the bytes',async()=>{
  const seen:string[]=[];const inits:RequestInit[]=[];
  const f=vi.fn(async(u:string|URL|Request,init?:RequestInit)=>{seen.push(String(u));inits.push(init!);return seen.length<=MAX_REDIRECTS?redirect(`/listedco/hop${seen.length}.pdf`):ok();});
  expect(new TextDecoder().decode(await download(START,f as unknown as typeof fetch))).toBe('%PDF-1.4 body');
  expect(seen).toHaveLength(MAX_REDIRECTS+1);
  expect(inits.every(i=>i.redirect==='manual')).toBe(true);
 });
 it('a fourth redirect is refused',async()=>{
  const f=vi.fn(async()=>redirect('/listedco/again.pdf'));
  await expect(download(START,f as unknown as typeof fetch)).rejects.toThrow('too_many_redirects');
  expect(f).toHaveBeenCalledTimes(MAX_REDIRECTS+1);
 });
 it('a redirect to another host, a plain-http hop or a bad scheme is refused before it is requested',async()=>{
  for(const to of ['https://evil.example/x.pdf',`http://${HKEX_HOST}/x.pdf`,'https://www.hkexnews.hk/x.pdf','ftp://www1.hkexnews.hk/x.pdf']){
   const f=vi.fn(async()=>redirect(to));
   await expect(download(START,f as unknown as typeof fetch),to).rejects.toThrow('redirect_host_not_allowed');
   expect(f).toHaveBeenCalledTimes(1);                                         // the offending hop was never fetched
  }
  const g=vi.fn(async()=>ok());
  await expect(download('https://evil.example/x.pdf',g as unknown as typeof fetch)).rejects.toThrow('redirect_host_not_allowed');
  expect(g).not.toHaveBeenCalled();
 });
});

describe('validation and atomic write',()=>{
 const dirs:string[]=[];
 const tmp=()=>{const d=mkdtempSync(join(tmpdir(),'f3-record-'));dirs.push(d);return d;};
 afterAll(()=>{for(const d of dirs)rmSync(d,{recursive:true,force:true});});
 it('a Chinese document without CJK text is a problem; English or CJK-bearing ones are not',()=>{
  expect(recordProblem('2026090300863_c',0)).toMatch(/cjk_chars=0/);
  expect(recordProblem('2026090300863_c',10)).toBeNull();
  expect(recordProblem('2026090300863',0)).toBeNull();
 });
 it('replaces the file in one rename and leaves no temporary file; a failed write keeps the old content and cleans up',()=>{
  const d=tmp();const p=join(d,'x.pages.json');
  writeFileAtomic(p,'old');writeFileAtomic(p,'new');
  expect(readFileSync(p,'utf8')).toBe('new');
  expect(readdirSync(d)).toEqual(['x.pages.json']);
  const blocked=join(d,'dir.pages.json');mkdirSync(blocked);writeFileSync(join(blocked,'keep'),'k');
  expect(()=>writeFileAtomic(blocked,'data')).toThrow();                       // rename onto a non-empty directory fails
  expect(existsSync(join(blocked,'keep'))).toBe(true);
  expect(readdirSync(d).sort()).toEqual(['dir.pages.json','x.pages.json']);   // the temp file was removed
 });
});
