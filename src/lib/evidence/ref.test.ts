// src/lib/evidence/ref.test.ts
import {describe,expect,it} from 'vitest';
import {EVIDENCE_KINDS as UI_KINDS} from '@/components/research-ui/source-drawer/types';
import {CONTRACT_VERSION,EVIDENCE_KINDS,EvidenceRefError,asOfFromDate,canonicalRef,parseRef,refHash} from './ref';
const ID='7b0f6c1e-5d0a-4f43-9a55-1d3f0c2b9a10';
describe('evidence-ref/1',()=>{
 it('names the contract and exactly the six kinds the drawer knows',()=>{
  expect(CONTRACT_VERSION).toBe('evidence-ref/1');expect([...EVIDENCE_KINDS]).toEqual([...UI_KINDS]);
 });
 it('normalises as_of to millisecond Z and drops the locator from identity',()=>{
  const ref=parseRef({v:1,kind:'macro_observation',id:ID,as_of:'2026-11-14T08:00:00+08:00',locator:{series_id:'US_UNRATE',period_end:'2026-08-31'}});
  expect(ref.as_of).toBe('2026-11-14T00:00:00.000Z');
  expect(canonicalRef(ref)).toEqual({v:1,kind:'macro_observation',id:ID,as_of:'2026-11-14T00:00:00.000Z'});
  expect(refHash(ref)).toBe(refHash({...ref,locator:{series_id:'OTHER',period_end:'2020-01-31'}}));
  expect(refHash(ref)).toMatch(/^[0-9a-f]{64}$/);
 });
 it('reads a date as the end of that UTC day',()=>{expect(asOfFromDate('2026-11-14')).toBe('2026-11-14T23:59:59.999Z');});
 it.each([
  [{v:2,kind:'macro_observation',id:ID,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:v'],
  [{v:1,kind:'podcast',id:ID,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:kind'],
  [{v:1,kind:'financial_fact',id:'not-a-uuid',as_of:'2026-11-14T00:00:00Z'},'invalid_ref:id'],
  [{v:1,kind:'industry_metric',id:`${ID}:7372:net_margin:2025-01-01`,as_of:'2026-11-14T00:00:00Z'},'invalid_ref:id'],
  [{v:1,kind:'judgment',id:ID,as_of:'yesterday'},'invalid_ref:as_of'],
  [{v:1,kind:'judgment',id:ID,as_of:'2026-11-14T00:00:00Z',locator:{a:1}},'invalid_ref:locator'],
  [{v:1,kind:'judgment',id:ID,as_of:'2026-11-14T00:00:00Z',extra:true},'invalid_ref:extra'],
 ])('rejects %j with %s',(raw,code)=>{expect(()=>parseRef(raw)).toThrow(new EvidenceRefError(code));});
 it('accepts the composite industry id',()=>{
  expect(parseRef({v:1,kind:'industry_metric',id:`${ID}:7372:net_margin:2025-01-01:2025-12-31`,as_of:'2026-11-14T00:00:00Z'}).kind).toBe('industry_metric');
 });
});
