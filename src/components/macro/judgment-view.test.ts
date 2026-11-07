// F4 judgment response handling (spec §3.2): tolerant card extraction, percent only when numeric, contributions.
import {describe,expect,it} from 'vitest';
import type {JudgmentCardView} from '@/lib/macro/judgment-contract';
import {cardsFromResponse,contributionText,contributionsFrom,percentOf} from './judgment-view';
// `satisfies` keeps lifecycle/calibration as their literal types (an unannotated literal widens them to string; 第 4 稿 P1-1).
const card={judgment_id:'j1',lifecycle:'open',calibration:'insufficient_sample',as_of:'2026-11-03T03:20:00Z',methodology:{id:'macro_regime',version:'1.0',title:{zh:'宏观状态',en:'Macro regime'},href:'/methods/macro_regime'},display:{headline:{zh:'复苏',en:'Recovery'},percent:null,value:null}} satisfies JudgmentCardView;
describe('judgment view',()=>{
 it('accepts an array, {judgments}, {cards} or {judgment}; drops malformed entries',()=>{
  expect(cardsFromResponse([card])).toHaveLength(1);
  expect(cardsFromResponse({judgments:[card,{judgment_id:3}]})).toHaveLength(1);
  expect(cardsFromResponse({cards:[card]})).toHaveLength(1);
  expect(cardsFromResponse({judgment:card})).toHaveLength(1);
  expect(cardsFromResponse({error:'x'})).toEqual([]);expect(cardsFromResponse(null)).toEqual([]);
 });
 it('percent only when display.percent is a finite number',()=>{
  expect(percentOf(card)).toBeNull();
  expect(percentOf({...card,display:{...card.display,percent:62}})).toBe(62);
  expect(percentOf({...card,display:{...card.display,percent:'62' as unknown as number}})).toBeNull();
 });
 it('contributions from the snapshot response',()=>{
  const c={series_id:'US_CPI_YOY',observation_id:'o',rule_id:'infl.yoy',weight:15,support:{},contribution:{recovery:0,overheat:4.5,stagflation:0,recession:0}};
  expect(contributionsFrom({contributions:[c,{bad:1}]})).toEqual([c]);
  expect(contributionsFrom({regime:{contributions:[c]}})).toEqual([c]);
  expect(contributionsFrom({})).toEqual([]);
  expect(contributionText(c)).toBe('overheat 4.5');
 });
});
