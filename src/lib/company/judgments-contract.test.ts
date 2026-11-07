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
 it('fails closed when only the calibration was computed after the cutoff',()=>{
  expect(checkJudgmentsResponse(fx('calibration-leak-as-known'),'2024-06-30')).toEqual({ok:false,reason:'post_cutoff'});
 });
 it('in replay a calibration summary without computed_at cannot prove it precedes the cutoff',()=>{
  const b=fx('calibration-leak-as-known');delete b.cards[0].calibration_summary.computed_at;
  expect(checkJudgmentsResponse(b,'2024-06-30')).toEqual({ok:false,reason:'post_cutoff'});
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

describe('malformed cards fail closed instead of crashing the adapter',()=>{
 const withCard=(mut:(c:Record<string,any>)=>void)=>{const b=fx('latest');mut(b.cards[0]);return b;};
 const bad:[string,(c:Record<string,any>)=>void][]=[
  ['headline without en',c=>{delete c.display.headline.en;}],
  ['headline missing',c=>{delete c.display.headline;}],
  ['display missing',c=>{delete c.display;}],
  ['methodology missing',c=>{delete c.methodology;}],
  ['methodology title not bilingual',c=>{c.methodology.title='x';}],
  ['methodology href is javascript:',c=>{c.methodology.href='javascript:alert(1)';}],
  ['condition text missing',c=>{c.condition={};}],
  ['settlement without settled_at',c=>{c.settlement={outcome:'hit'};}],
  ['settlement settled_at unparseable',c=>{c.settlement.settled_at='soon';}],
  ['as_of missing',c=>{delete c.as_of;}],
  ['band not low/mid/high',c=>{c.display.band='huge';}],
  ['inputs not an array',c=>{c.inputs='x';}],
  ['input href protocol-relative',c=>{c.inputs=[{href:'//evil.example/x'}];}],
  ['calibration href data:',c=>{c.calibration_summary.href='data:text/html,x';}],
 ];
 it.each(bad)('%s',(_n,mut)=>{expect(checkJudgmentsResponse(withCard(mut),null)).toEqual({ok:false,reason:'malformed'});});
 it('a non-object card and a missing cards array are malformed',()=>{
  expect(checkJudgmentsResponse({view:'latest',cards:[null]},null)).toEqual({ok:false,reason:'malformed'});
  expect(checkJudgmentsResponse({view:'latest'},null)).toEqual({ok:false,reason:'malformed'});
 });
 it('missing optional condition / settlement / inputs normalize to null / null / []',()=>{
  const b=withCard(c=>{delete c.condition;delete c.settlement;delete c.inputs;delete c.calibration_summary;});
  const r=checkJudgmentsResponse(b,null);
  expect(r.ok&&[r.cards[0].condition,r.cards[0].settlement,r.cards[0].inputs]).toEqual([null,null,[]]);
 });
});
describe('references survive the contract (evidence links)',()=>{
 it('keeps inputs, methodology.href and calibration_summary.href and still gates the percent',()=>{
  const r=checkJudgmentsResponse(fx('latest'),null);
  expect(r.ok).toBe(true);
  if(!r.ok)return;
  const c=r.cards[0];
  expect(c.methodology.href).toBe('/intel/methods/thesis-win/1.0.0');
  expect(c.calibration_summary?.href).toBe('/intel/methods/thesis-win/1.0.0');
  expect(c.inputs).toEqual([{label:{zh:'营业收入同比 FY2024',en:'Operating revenue YoY FY2024'},href:'/stock/600519.SH?view=metrics&asOf=2025-03-01'}]);
  expect(displayPercent(c)).toBe(62);
  const uncal=checkJudgmentsResponse(fx('as-known-2024-06-30'),'2024-06-30');
  expect(uncal.ok&&displayPercent(uncal.cards[0])).toBeNull();
 });
});
