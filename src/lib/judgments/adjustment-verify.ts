// src/lib/judgments/adjustment-verify.ts
// Pure part of the adjustment verification program (spec §7.4, F4-2): the announced corporate
// actions used as evidence, the recorded-fixture shape, and the verdict. A verdict compares one
// adjusted series with the unadjusted one around the event under two models — ratio (factor
// f = adj/none jumps by the announced ratio: split ratio, or P_prev/(P_prev − D) for a cash dividend)
// and difference (cash dividends only: adj − none jumps by D) — because Chinese terminals implement
// forward adjustment either way and nothing in the repository says which one an adapter uses.
// adjusted == unadjusted on every aligned date → unsupported (the adapter only echoes the request).
// A model is accepted only if the adjustment is constant on each side of the event and the signed jump matches.
import type {SourceKlineBar} from '@/lib/data/kline/types';
import type {PriceMarket} from './types';
import type {CapabilityStatus} from './resolvers/price-capabilities';

export type CorporateEvent={type:'cash_dividend';ex_date:string;cash_per_share:number;currency:string;source_document:string}|{type:'split';ex_date:string;ratio:number;source_document:string};
export interface AdjustEventSpec{market:PriceMarket;ticker:string;event:CorporateEvent}
/** Confirm each against its primary announcement before recording (plan Task 7). */
export const ADJUST_EVENTS:readonly AdjustEventSpec[]=Object.freeze([
 {market:'A',ticker:'600519.SH',event:{type:'cash_dividend',ex_date:'2024-06-19',cash_per_share:30.876,currency:'CNY',source_document:'上交所公告：贵州茅台酒股份有限公司 2023 年年度权益分派实施公告（A 股每股现金红利 30.876 元，除权（息）日 2024-06-19）'}},
 {market:'HK',ticker:'00700.HK',event:{type:'cash_dividend',ex_date:'2024-05-17',cash_per_share:3.4,currency:'HKD',source_document:'港交所披露易：腾讯控股 2023 年度末期股息公告（每股 3.40 港元，除息日 2024-05-17）'}},
 {market:'US',ticker:'NVDA',event:{type:'split',ex_date:'2024-06-10',ratio:10,source_document:'NVIDIA 新闻稿 2024-05-22 "NVIDIA Announces Financial Results for First Quarter Fiscal 2025"：ten-for-one forward split，2024-06-10 起按拆股后价格交易'}},
] as AdjustEventSpec[]);
export interface Verdict{status:'verified'|'unsupported'|'inconclusive';model:'ratio'|'difference'|null;observed:number|null;expected:number|null;detail:string}
export interface SeriesRecord{adjustment:'qfq'|'hfq'|'none';close_only:boolean;bars:SourceKlineBar[]}
export interface KlineAdjustFixture{fixture_version:'kline-adjust/1';source:'eastmoney'|'datagateway';market:PriceMarket;ticker:string;event:CorporateEvent;window:{from:string;to:string};recorded_at:string;series:{qfq:SeriesRecord;hfq:SeriesRecord;none:SeriesRecord};verdicts:{qfq:Verdict;hfq:Verdict}}
// Tolerances (policy constants, sized to price rounding — not to model error). Eastmoney quotes two
// decimals, so each close carries ±0.005. Difference model: adj − none is a constant on a side up to
// the two roundings, i.e. a within-side range ≤ DIFF_TOLERANCE_ABS = 0.02 (two ticks); the jump must
// equal the announced cash dividend within the same 0.02. Ratio model: the factor adj/none is a
// constant on a side up to the same roundings, which at prices ≥ 100 is ≤ 1e-4 relative per series;
// RATIO_TOLERANCE = 2e-4 (the two series) bounds both the within-side relative spread
// (max − min) / median and the jump's relative error against the announced ratio.
export const RATIO_TOLERANCE=0.0002;
export const DIFF_TOLERANCE_ABS=0.02;
export const SIDE_SESSIONS=5;
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const r6=(x:number)=>Math.round(x*1e6)/1e6;
const range=(xs:number[])=>Math.max(...xs)-Math.min(...xs);
interface Pair{time:string;adj:number;raw:number}
interface Fit{model:'ratio'|'difference';ok:boolean;score:number;observed:number;expected:number;detail:string}
/**
 * A model is accepted only if the adjustment is a constant on EACH side of the event (within-side
 * spread ≤ tolerance) AND the signed jump at the event matches the announcement. Eastmoney hfq is
 * "multiplier × raw + jumping offset": neither model is constant on a side, so it is inconclusive.
 * Both models are evaluated and the better-fitting accepted one wins (score = worst deviation / tolerance).
 */
function fitModels(event:CorporateEvent,before:Pair[],after:Pair[]):Fit[]{
 const pPrev=before[before.length-1].raw;
 const fits:Fit[]=[];
 {
  const fb=before.map(p=>p.adj/p.raw),fa=after.map(p=>p.adj/p.raw);
  const expected=event.type==='split'?event.ratio:pPrev/(pPrev-event.cash_per_share);
  const observed=median(fa)/median(fb);
  const spreadB=range(fb)/median(fb),spreadA=range(fa)/median(fa),jumpErr=Math.abs(observed/expected-1);
  const worst=Math.max(spreadB,spreadA,jumpErr);
  fits.push({model:'ratio',ok:worst<=RATIO_TOLERANCE,score:worst/RATIO_TOLERANCE,observed:r6(observed),expected:r6(expected),detail:`ratio: within-side spread ${spreadB.toExponential(2)}/${spreadA.toExponential(2)}, jump error ${jumpErr.toExponential(2)} (tolerance ${RATIO_TOLERANCE})`});
 }
 if(event.type==='cash_dividend'){
  const db=before.map(p=>p.adj-p.raw),da=after.map(p=>p.adj-p.raw);
  const observed=median(da)-median(db);   // signed: a reversed adjustment (−D) must not verify
  const spreadB=range(db),spreadA=range(da),jumpErr=Math.abs(observed-event.cash_per_share);
  const worst=Math.max(spreadB,spreadA,jumpErr);
  fits.push({model:'difference',ok:worst<=DIFF_TOLERANCE_ABS,score:worst/DIFF_TOLERANCE_ABS,observed:r6(observed),expected:event.cash_per_share,detail:`difference: within-side range ${spreadB.toFixed(4)}/${spreadA.toFixed(4)}, jump error ${jumpErr.toFixed(4)} (tolerance ${DIFF_TOLERANCE_ABS})`});
 }
 return fits;
}
export function judgeAdjustment(event:CorporateEvent,none:readonly {time:string;close:number}[],adjusted:readonly {time:string;close:number}[]):Verdict{
 const raw=new Map(none.map(b=>[b.time,b.close] as const));
 const pairs:Pair[]=adjusted.filter(b=>raw.has(b.time)).map(b=>({time:b.time,adj:b.close,raw:raw.get(b.time)!})).sort((a,b)=>a.time<b.time?-1:1);
 if(pairs.length>0&&pairs.every(p=>Math.abs(p.adj-p.raw)<=1e-9*Math.max(1,Math.abs(p.raw))))return {status:'unsupported',model:null,observed:null,expected:null,detail:'adjusted series equals the unadjusted series on every aligned date'};
 const before=pairs.filter(p=>p.time<event.ex_date).slice(-SIDE_SESSIONS),after=pairs.filter(p=>p.time>=event.ex_date).slice(0,SIDE_SESSIONS);
 if(before.length<3||after.length<3)return {status:'inconclusive',model:null,observed:null,expected:null,detail:`aligned sessions before/after ${event.ex_date}: ${before.length}/${after.length} (< 3)`};
 const fits=fitModels(event,before,after);
 const best=fits.filter(f=>f.ok).sort((a,b)=>a.score-b.score)[0];
 if(best)return {status:'verified',model:best.model,observed:best.observed,expected:best.expected,detail:best.detail};
 const closest=[...fits].sort((a,b)=>a.score-b.score)[0];
 return {status:'inconclusive',model:null,observed:closest.observed,expected:closest.expected,detail:`no model is constant on each side with the announced jump; closest ${closest.detail}`};
}
export function judgeFixture(fx:Pick<KlineAdjustFixture,'event'|'series'>):{qfq:Verdict;hfq:Verdict}{
 return {qfq:judgeAdjustment(fx.event,fx.series.none.bars,fx.series.qfq.bars),hfq:judgeAdjustment(fx.event,fx.series.none.bars,fx.series.hfq.bars)};
}
export const fixturePathOf=(source:'eastmoney'|'datagateway',market:PriceMarket,ticker:string,exDate:string)=>`fixtures/judgments/kline/${source}-${market}-${ticker.replace(/[^A-Za-z0-9]+/g,'_')}-${exDate}.json`;
export const capabilityStatusOf=(v:Verdict):CapabilityStatus=>v.status==='verified'?'verified':v.status==='unsupported'?'unsupported':'unverified';
