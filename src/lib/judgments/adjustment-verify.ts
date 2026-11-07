// src/lib/judgments/adjustment-verify.ts
// Pure part of the adjustment verification program (spec §7.4, F4-2): the announced corporate
// actions used as evidence, the recorded-fixture shape, and the verdict. A verdict compares one
// adjusted series with the unadjusted one around the event under two models — ratio (factor
// f = adj/none jumps by the announced ratio: split ratio, or P_prev/(P_prev − D) for a cash dividend)
// and difference (cash dividends only: adj − none jumps by D) — because Chinese terminals implement
// forward adjustment either way and nothing in the repository says which one an adapter uses.
// adjusted == unadjusted on every aligned date → unsupported (the adapter only echoes the request).
// Tolerances are policy constants sized to two-decimal price rounding, not to model error.
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
export const RATIO_TOLERANCE=0.002;
export const DIFF_TOLERANCE_ABS=0.02;
export const DIFF_TOLERANCE_REL=0.01;
export const SIDE_SESSIONS=5;
const median=(xs:number[])=>{const s=[...xs].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const r6=(x:number)=>Math.round(x*1e6)/1e6;
export function judgeAdjustment(event:CorporateEvent,none:readonly {time:string;close:number}[],adjusted:readonly {time:string;close:number}[]):Verdict{
 const raw=new Map(none.map(b=>[b.time,b.close] as const));
 const pairs=adjusted.filter(b=>raw.has(b.time)).map(b=>({time:b.time,adj:b.close,raw:raw.get(b.time)!})).sort((a,b)=>a.time<b.time?-1:1);
 if(pairs.length>0&&pairs.every(p=>Math.abs(p.adj-p.raw)<=1e-9*Math.max(1,Math.abs(p.raw))))return {status:'unsupported',model:null,observed:null,expected:null,detail:'adjusted series equals the unadjusted series on every aligned date'};
 const before=pairs.filter(p=>p.time<event.ex_date).slice(-SIDE_SESSIONS),after=pairs.filter(p=>p.time>=event.ex_date).slice(0,SIDE_SESSIONS);
 if(before.length<3||after.length<3)return {status:'inconclusive',model:null,observed:null,expected:null,detail:`aligned sessions before/after ${event.ex_date}: ${before.length}/${after.length} (< 3)`};
 const pPrev=before[before.length-1].raw;
 const expectedRatio=event.type==='split'?event.ratio:pPrev/(pPrev-event.cash_per_share);
 const observedRatio=median(after.map(p=>p.adj/p.raw))/median(before.map(p=>p.adj/p.raw));
 if(Math.abs(observedRatio/expectedRatio-1)<=RATIO_TOLERANCE)return {status:'verified',model:'ratio',observed:r6(observedRatio),expected:r6(expectedRatio),detail:`factor jump within ${RATIO_TOLERANCE}`};
 if(event.type==='cash_dividend'){
  const observedDiff=Math.abs(median(after.map(p=>p.adj-p.raw))-median(before.map(p=>p.adj-p.raw)));
  if(Math.abs(observedDiff-event.cash_per_share)<=Math.max(DIFF_TOLERANCE_ABS,DIFF_TOLERANCE_REL*event.cash_per_share))return {status:'verified',model:'difference',observed:r6(observedDiff),expected:event.cash_per_share,detail:'offset jump equals the cash dividend'};
 }
 return {status:'inconclusive',model:null,observed:r6(observedRatio),expected:r6(expectedRatio),detail:'neither the ratio nor the difference model matches the announced action'};
}
export function judgeFixture(fx:Pick<KlineAdjustFixture,'event'|'series'>):{qfq:Verdict;hfq:Verdict}{
 return {qfq:judgeAdjustment(fx.event,fx.series.none.bars,fx.series.qfq.bars),hfq:judgeAdjustment(fx.event,fx.series.none.bars,fx.series.hfq.bars)};
}
export const fixturePathOf=(source:'eastmoney'|'datagateway',market:PriceMarket,ticker:string,exDate:string)=>`fixtures/judgments/kline/${source}-${market}-${ticker.replace(/[^A-Za-z0-9]+/g,'_')}-${exDate}.json`;
export const capabilityStatusOf=(v:Verdict):CapabilityStatus=>v.status==='verified'?'verified':v.status==='unsupported'?'unsupported':'unverified';
