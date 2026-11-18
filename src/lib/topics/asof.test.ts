// src/lib/topics/asof.test.ts
import {describe,expect,it} from 'vitest';
import {TopicError} from './errors';
import {ageDays,driftUnchecked,versionAtAsOf} from './asof';
const V=[{version_no:1,published_at:'2026-11-01T09:00:00.000Z',unpublished_at:null},{version_no:2,published_at:'2026-11-08T09:00:00.000Z',unpublished_at:null}];
describe('versionAtAsOf (spec §6.2, A5)',()=>{
 it.each([['2026-10-31',{kind:'no_version'}],['2026-11-01',{kind:'ok',version_no:1}],['2026-11-07',{kind:'ok',version_no:1}],
  ['2026-11-08',{kind:'ok',version_no:2}],['2026-11-15',{kind:'ok',version_no:2}]] as const)('asOf %s → %j',(d,want)=>{
  expect(versionAtAsOf(V,d,'2026-11-15')).toEqual(want);
 });
 it('answers unpublished for the version that was current then, whenever it was withdrawn; never silently falls back',()=>{
  const u=[V[0],{...V[1],unpublished_at:'2026-11-12T00:00:00.000Z'}];
  expect(versionAtAsOf(u,'2026-11-08','2026-11-15')).toEqual({kind:'unpublished',version_no:2});
  expect(versionAtAsOf(u,'2026-11-14','2026-11-15')).toEqual({kind:'unpublished',version_no:2});
  expect(versionAtAsOf(u,'2026-11-01','2026-11-15')).toEqual({kind:'ok',version_no:1});
 });
 it('rejects a future or malformed date',()=>{
  expect(()=>versionAtAsOf(V,'2026-11-16','2026-11-15')).toThrow(new TopicError('invalid_parameter:asOf'));
  expect(()=>versionAtAsOf(V,'11/08/2026','2026-11-15')).toThrow(new TopicError('invalid_parameter:asOf'));
 });
});
it('ageDays and the 72-hour drift rule (A15)',()=>{
 expect(ageDays('2026-11-01T00:00:00.000Z',new Date('2026-11-15T12:00:00Z'))).toBe(14);
 expect(driftUnchecked(null,new Date())).toBe(true);
 expect(driftUnchecked('2026-11-12T00:00:00.000Z',new Date('2026-11-14T23:00:00Z'))).toBe(false);
 expect(driftUnchecked('2026-11-12T00:00:00.000Z',new Date('2026-11-15T01:00:00Z'))).toBe(true);
});
it('validates calendar dates and exact staleness boundaries',()=>{
 expect(()=>versionAtAsOf(V,'2026-02-30','2026-11-15')).toThrow(new TopicError('invalid_parameter:asOf'));
 expect(driftUnchecked('2026-11-12T00:00:00.000Z',new Date('2026-11-15T00:00:00Z'))).toBe(false);
 expect(versionAtAsOf([...V].reverse(),'2026-11-08','2026-11-15')).toEqual({kind:'ok',version_no:2});
});
