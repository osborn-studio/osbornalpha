// src/lib/judgments/adjustment-verify.test.ts
import {describe,expect,it} from 'vitest';
import {ADJUST_EVENTS,capabilityStatusOf,fixturePathOf,judgeAdjustment} from './adjustment-verify';
import type {CorporateEvent} from './adjustment-verify';

const days=['2024-06-12','2024-06-13','2024-06-14','2024-06-17','2024-06-18','2024-06-19','2024-06-20','2024-06-21','2024-06-24','2024-06-25'];
const raw=[1700,1690,1710,1705,1720,1690,1685,1700,1695,1710];   // ex-date 2024-06-19 is index 5
const DIV:CorporateEvent={type:'cash_dividend',ex_date:'2024-06-19',cash_per_share:30.876,currency:'CNY',source_document:'test'};
const SPLIT:CorporateEvent={type:'split',ex_date:'2024-06-19',ratio:10,source_document:'test'};
const series=(closes:number[])=>closes.map((close,i)=>({time:days[i],close}));
const round2=(x:number)=>Math.round(x*100)/100;

describe('judgeAdjustment (spec §7.4 verification program)',()=>{
 const pPrev=raw[4];const k=(pPrev-30.876)/pPrev;
 const qfq=raw.map((c,i)=>i<5?round2(c*k):c);
 it('ratio-model qfq and hfq around a cash dividend → verified(ratio)',()=>{
  const hfq=raw.map((c,i)=>i<5?c:round2(c/k));
  expect(judgeAdjustment(DIV,series(raw),series(qfq))).toMatchObject({status:'verified',model:'ratio'});
  expect(judgeAdjustment(DIV,series(raw),series(hfq))).toMatchObject({status:'verified',model:'ratio'});
 });
 it('difference-model qfq (subtract the dividend) → verified(difference) when the ratio model does not fit',()=>{
  const raw2=[100,150,80,120,60,62,61,63,60,64];   // wide pre-event range: the factor (c − D)/c is not constant
  const div2:CorporateEvent={...DIV,cash_per_share:10};
  const v=judgeAdjustment(div2,series(raw2),series(raw2.map((c,i)=>i<5?c-10:c)));
  expect(v).toMatchObject({status:'verified',model:'difference',expected:10});
  expect(v.observed).toBeCloseTo(10,6);
 });
 it('a 10-for-1 split in qfq (pre-split divided) and hfq (post-split multiplied) → verified(ratio, 10)',()=>{
  const none=raw.map((c,i)=>i<5?c*10:c);
  expect(judgeAdjustment(SPLIT,series(none),series(raw))).toMatchObject({status:'verified',model:'ratio',expected:10});
  expect(judgeAdjustment(SPLIT,series(none),series(raw.map(c=>c*10)))).toMatchObject({status:'verified',model:'ratio'});
 });
 it('adjusted == unadjusted → unsupported; a wrong jump or too few sessions → inconclusive',()=>{
  expect(judgeAdjustment(DIV,series(raw),series(raw))).toMatchObject({status:'unsupported',model:null});
  expect(judgeAdjustment(DIV,series(raw),series(raw.map((c,i)=>i<5?c*0.9:c))).status).toBe('inconclusive');
  expect(judgeAdjustment(DIV,series(raw).slice(3),series(qfq).slice(3)).status).toBe('inconclusive');
 });
 it('the adjustment must be a constant on each side: multiplier × raw + jumping offset (Eastmoney hfq) is inconclusive',()=>{
  const aff=raw.map((c,i)=>1.05*c+50+(i<5?0:30.876));
  expect(judgeAdjustment(DIV,series(raw),series(aff)).status).toBe('inconclusive');
 });
 it('the sign of the dividend jump is preserved: a reversed additive adjustment (jump −D) does not verify',()=>{
  const rev=raw.map((c,i)=>c+(i<5?30.876:0));
  expect(judgeAdjustment(DIV,series(raw),series(rev)).status).toBe('inconclusive');
  expect(judgeAdjustment(DIV,series(raw),series(raw.map((c,i)=>c-(i<5?30.876:0))))).toMatchObject({status:'verified',model:'difference'});
 });
 it('an exact difference adjustment is labelled difference even when the ratio model nearly fits',()=>{
  const flat=[397,397.2,396.8,397,397,395,395.2,394.8,395,395];
  const v=judgeAdjustment({...DIV,cash_per_share:3.4},series(flat),series(flat.map((c,i)=>i<5?Math.round((c-3.4)*100)/100:c)));
  expect(v).toMatchObject({status:'verified',model:'difference'});
 });
 it('maps verdicts to capability statuses; events and fixture paths are well formed',()=>{
  expect(capabilityStatusOf({status:'verified',model:'ratio',observed:1,expected:1,detail:''})).toBe('verified');
  expect(capabilityStatusOf({status:'unsupported',model:null,observed:null,expected:null,detail:''})).toBe('unsupported');
  expect(capabilityStatusOf({status:'inconclusive',model:null,observed:null,expected:null,detail:''})).toBe('unverified');
  expect(ADJUST_EVENTS.map(e=>e.market).sort()).toEqual(['A','HK','US']);
  for(const e of ADJUST_EVENTS){expect(e.event.ex_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(e.event.source_document.length).toBeGreaterThan(10);}
  expect(fixturePathOf('eastmoney','HK','00700.HK','2024-05-17')).toBe('fixtures/judgments/kline/eastmoney-HK-00700_HK-2024-05-17.json');
 });
});
