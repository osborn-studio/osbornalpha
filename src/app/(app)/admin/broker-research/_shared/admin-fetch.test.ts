// src/app/(app)/admin/broker-research/_shared/admin-fetch.test.ts
import {afterEach,describe,expect,it,vi} from 'vitest';
import {adminJson,baseCode,errorCode,errorField} from './admin-fetch';

afterEach(()=>vi.unstubAllGlobals());
describe('admin fetch',()=>{
 it('always sends JSON for writes and maps errors to codes',async()=>{
  const f=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'duplicate_document',documentId:'d1'}}),{status:409}));
  vi.stubGlobal('fetch',f);
  const r=await adminJson('POST','/documents/intent');
  expect(f).toHaveBeenCalledWith('/api/admin/broker-research/documents/intent',expect.objectContaining({method:'POST',body:'{}',headers:{'content-type':'application/json'},cache:'no-store'}));
  expect(r).toMatchObject({ok:false,status:409,code:'duplicate_document'});
  if(!r.ok)expect(errorField(r.body,'documentId','document_id')).toBe('d1');
 });
 it('falls back to http_<status> and splits base codes',()=>{
  expect(errorCode(null,502)).toBe('http_502');expect(baseCode('publish_blocked:review_not_approved')).toBe('publish_blocked');
  expect(errorField({error:{detail:{document_id:'x'}}},'documentId','document_id')).toBe('x');
 });
});

it('returns a failure result for network errors so write controls recover',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));
 expect(await adminJson('POST','/settings/public',{enabled:false})).toMatchObject({ok:false,status:0,code:'network_error'});
});
