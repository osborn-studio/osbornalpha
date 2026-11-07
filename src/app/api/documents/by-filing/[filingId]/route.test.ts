import {beforeEach,describe,expect,it,vi} from 'vitest';
import {GET} from './route';
import {resolveFilingDocument} from '@/lib/documents/by-filing';

vi.mock('@/lib/documents/by-filing',()=>({resolveFilingDocument:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111';
const call=(filingId:string,query='')=>GET(new Request(`http://localhost/api/documents/by-filing/${filingId}${query}`),{params:Promise.resolve({filingId})});

describe('GET /api/documents/by-filing/[filingId]',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it('rejects invalid UUID before querying',async()=>{
  expect((await call('bad')).status).toBe(400);
  expect(resolveFilingDocument).not.toHaveBeenCalled();
 });
 it('returns JSON 404 for an unknown filing',async()=>{
  vi.mocked(resolveFilingDocument).mockResolvedValueOnce(null);
  const r=await call(id);
  expect(r.status).toBe(404);
  expect((await r.json()).error.code).toBe('not_found');
 });
 it('returns exact document or an ambiguous state',async()=>{
  vi.mocked(resolveFilingDocument).mockResolvedValueOnce({filingId:id,asOf:'2026-04-01',document:null,reason:'ambiguous'});
  const r=await call(id,'?asOf=2026-04-01');
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({filingId:id,asOf:'2026-04-01',document:null,reason:'ambiguous'});
  expect(resolveFilingDocument).toHaveBeenCalledWith(id,'2026-04-01');
 });
 it('validates asOf and keeps hidden documents indistinguishable from missing',async()=>{
  expect((await call(id,'?asOf=2999-01-01')).status).toBe(400);
  expect((await call(id,'?asOf=2026-02-30')).status).toBe(400);
  vi.mocked(resolveFilingDocument).mockResolvedValueOnce({filingId:id,asOf:'2026-04-01',document:null,reason:'not_found'});
  const r=await call(id,'?asOf=2026-04-01');
  expect(await r.json()).toEqual({filingId:id,asOf:'2026-04-01',document:null,reason:'not_found'});
 });
});
