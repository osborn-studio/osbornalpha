import {describe,it,expect} from 'vitest';
import {assertResearchRequest} from './request';
const origin='http://127.0.0.1:3000';
const request=(url=origin,headers:Record<string,string>={})=>new Request(url,{method:'POST',headers:{host:'127.0.0.1:3000',origin,...headers}});
describe('research request origin boundary',()=>{
 it('accepts exact operator-selected authority',()=>expect(()=>assertResearchRequest(request(),origin)).not.toThrow());
 it.each([
  request('http://evil.example.test'),request(origin,{host:'evil.example.test'}),request(origin,{origin:'https://evil.example.test'}),
  request(origin,{'sec-fetch-site':'cross-site'}),request('http://evil.example.test',{'x-forwarded-host':'127.0.0.1:3000'}),
 ])('rejects mismatched authority without trusting forwarded headers',req=>expect(()=>assertResearchRequest(req,origin)).toThrow());
 it('requires origin on writes, but no origin on safe reads',()=>{
  expect(()=>assertResearchRequest(new Request(origin,{method:'POST',headers:{host:'127.0.0.1:3000'}}),origin)).toThrow();
  expect(()=>assertResearchRequest(new Request(origin,{headers:{host:'127.0.0.1:3000'}}),origin)).not.toThrow();
 });
 it('rejects configured credentials and paths',()=>{
  expect(()=>assertResearchRequest(request(),'http://user:pass@127.0.0.1:3000')).toThrow();
  expect(()=>assertResearchRequest(request(),origin+'/path')).toThrow();
 });
});
