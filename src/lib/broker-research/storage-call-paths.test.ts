import {expect,it} from 'vitest';
import {assertObjectPath,brokerPaths} from './storage';
const sha='b'.repeat(64),id='00000000-0000-4000-8000-000000000001';
it('builds and accepts flat numbered request and response paths',()=>{
 for(const seq of [1,9999]){
  const paths=[brokerPaths.callRequest(id,seq),brokerPaths.callResponse(id,seq),brokerPaths.evalCallRequest(sha,id,seq),brokerPaths.evalCallResponse(sha,id,seq)];
  expect(paths).toEqual([`runs/${id}`,`eval/${sha}/${id}`].flatMap(p=>['request','response'].map(k=>`${p}.call-${seq}.${k}.json`)));
  for(const path of paths)expect(()=>assertObjectPath(path)).not.toThrow();
 }
});
it('rejects malformed numbered paths in both namespaces',()=>{
 for(const prefix of [`runs/${id}`,`eval/${sha}/${id}`])for(const suffix of ['.call-0.request.json','.call-01.response.json','.call-10000.request.json','/call-1.response.json','.call-1.body.json','.call-1.request.json/']){
  expect(()=>assertObjectPath(prefix+suffix)).toThrow();
 }
});
