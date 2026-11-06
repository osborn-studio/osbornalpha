// src/lib/evals/hash-source.test.ts
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import {hashSource} from './hash-source';

describe('hashSource',()=>{
 it('hashes exactly the served bytes and sends a declared User-Agent',async()=>{
  const body=new TextEncoder().encode('<html>10-K</html>');
  const seen:{url:string;ua:string|null}[]=[];
  const fake=(async(url:string,init?:RequestInit)=>{seen.push({url,ua:new Headers(init?.headers).get('user-agent')});return new Response(body,{status:200});}) as unknown as typeof fetch;
  const r=await hashSource('https://www.sec.gov/Archives/x.htm',{fetch:fake,userAgent:DEFAULT_USER_AGENT});
  expect(r).toEqual({url:'https://www.sec.gov/Archives/x.htm',sha256:createHash('sha256').update(body).digest('hex'),bytes:body.byteLength,status:200});
  expect(seen).toEqual([{url:'https://www.sec.gov/Archives/x.htm',ua:DEFAULT_USER_AGENT}]);
 });
 it('rejects non-https URLs and non-2xx responses',async()=>{
  const fake=(async()=>new Response('nope',{status:403})) as unknown as typeof fetch;
  await expect(hashSource('http://www.sec.gov/x',{fetch:fake})).rejects.toThrow('https_required');
  await expect(hashSource('not a url',{fetch:fake})).rejects.toThrow('invalid_url');
  await expect(hashSource('https://www.sec.gov/x',{fetch:fake})).rejects.toThrow('http_403');
 });
});
