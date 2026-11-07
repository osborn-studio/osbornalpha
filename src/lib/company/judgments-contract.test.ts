// src/lib/company/judgments-contract.test.ts
// Contract of the company page against F4 (spec §10.4, §12.1): request shape, view/asOf echo, no
// post-cutoff settlement or calibration in replay, client-side percent defence.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {judgmentsUrl,checkJudgmentsResponse,displayPercent} from './judgments';

const fx=(name:string)=>JSON.parse(readFileSync(resolve(process.cwd(),'src/lib/company/fixtures/judgments',`${name}.json`),'utf8'));
const ISSUER='11111111-1111-4111-8111-111111111111';

describe('judgments request',()=>{
 it('asks for latest without asOf and for as_known with asOf in replay',()=>{
  expect(judgmentsUrl(ISSUER,null)).toBe(`/api/judgments?subject_type=issuer&subject_key=${ISSUER}&view=latest`);
  expect(judgmentsUrl(ISSUER,'2024-06-30')).toBe(`/api/judgments?subject_type=issuer&subject_key=${ISSUER}&view=as_known&asOf=2024-06-30`);
 });
});
describe('response contract',()=>{
 it('accepts the as_known fixture in replay: no settlement and no percent appear',()=>{
  const r=checkJudgmentsResponse(fx('as-known-2024-06-30'),'2024-06-30');
  expect(r.ok).toBe(true);
  if(!r.ok)return;
  expect(r.cards.every(c=>c.settlement===null)).toBe(true);
  expect(r.cards.map(displayPercent)).toEqual([null]);
 });
 it('rejects a latest response to a replay request (would leak the 2025 settlement and 62%)',()=>{
  expect(checkJudgmentsResponse(fx('latest'),'2024-06-30')).toEqual({ok:false,reason:'view_mismatch'});
 });
 it('rejects an as_known response whose asOf differs from the request',()=>{
  expect(checkJudgmentsResponse(fx('as-known-2024-06-30'),'2024-07-01')).toEqual({ok:false,reason:'asof_mismatch'});
 });
 it('fails closed when an as_known response still carries a post-cutoff settlement',()=>{
  expect(checkJudgmentsResponse(fx('leaky-as-known'),'2024-06-30')).toEqual({ok:false,reason:'post_cutoff'});
 });
 it('rejects an as_known response to a latest request and malformed bodies',()=>{
  expect(checkJudgmentsResponse(fx('as-known-2024-06-30'),null)).toEqual({ok:false,reason:'view_mismatch'});
  expect(checkJudgmentsResponse({view:'latest'},null)).toEqual({ok:false,reason:'malformed'});
  expect(checkJudgmentsResponse(null,null)).toEqual({ok:false,reason:'malformed'});
 });
 it('latest view shows the calibrated percent of an open/settled card',()=>{
  const r=checkJudgmentsResponse(fx('latest'),null);
  expect(r.ok&&r.cards.map(displayPercent)).toEqual([62]);
 });
});
describe('client-side percent defence',()=>{
 it('shows a percent only for calibrated, open/settled cards with a finite number',()=>{
  const r=checkJudgmentsResponse(fx('defective'),null);
  expect(r.ok&&r.cards.map(displayPercent)).toEqual([null,null,null,62]);
 });
});
