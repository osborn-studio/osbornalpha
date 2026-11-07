// src/lib/judgments/kline.ts
// readKlineRange (spec §5.7 JudgmentInputsDb.kline, §7.4): daily bars of ONE frozen source and
// adjustment for the inclusive calendar window [from, to] (price_bar inputs, settlement windows).
// Only the two adapters with a historical end parameter are supported (eastmoney end=, datagateway
// startDate/endDate — F4 fences in the adapters); every other KlineSourceName → unsupported; the
// adjustment must be qfq or hfq (none is never allowed, audit F08). Eastmoney pages backwards (the
// latest `lmt` bars up to end=, then end = first bar − 1 day) until the window start is covered, a
// page brings nothing older, or MAX_PAGES (→ protocol); DataGateway requests 365-day windows
// forwards. Requests overshoot the window by one day on each side, so the provider's inclusive or
// exclusive end semantics cannot drop a boundary bar; the result is filtered to [from, to].
// Validation: YYYY-MM-DD times, each page sorted ascending with no duplicate date, overlapping pages
// must agree bar for bar, close finite > 0, the series adjustment equals the request; nothing is
// assumed about time continuity (holidays). DataGateway's close-only MarketDataItem shape (OHLC
// synthesised, volume 0 — audit G27) is reported as close_only:true; builders keep only close.
// Failures: KlineProviderError.kind as is; the caller's signal aborted → timeout; adapter null →
// eastmoney empty (unknown ticker / no history), datagateway unsupported (not configured or bad
// symbol). The contract type stays SourceKlineSeries|KlineFailure; closeOnlyOf() reads the flag.
import {asKlineProviderError} from '@/lib/data/kline/types';
import type {SourceKlineBar,SourceKlineSeries} from '@/lib/data/kline/types';
import {fetchDatagatewayDailyKline} from '@/lib/data/sources/datagateway';
import {fetchEastmoneyKline} from '@/lib/data/sources/eastmoney';
import type {KlineFailure,KlineRangeRequest} from './types';
import {addDaysIso} from './time';

export interface KlineRange extends SourceKlineSeries{close_only:boolean;from:string;to:string}
export const closeOnlyOf=(s:SourceKlineSeries)=>(s as Partial<KlineRange>).close_only===true;
export const EASTMONEY_PAGE=500;
export const MAX_PAGES=20;
export const DATAGATEWAY_WINDOW_DAYS=365;
export interface KlineRangeDeps{eastmoney?:typeof fetchEastmoneyKline;datagateway?:typeof fetchDatagatewayDailyKline}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
class SeriesError extends Error{constructor(public readonly failure:KlineFailure['failure']){super(failure);this.name='SeriesError';}}
function sortedPage(bars:readonly SourceKlineBar[]):SourceKlineBar[]{
 const out=[...bars].sort((a,b)=>a.time<b.time?-1:a.time>b.time?1:0);
 out.forEach((b,i)=>{
  if(!DAY.test(b.time)||!Number.isFinite(b.close)||b.close<=0)throw new SeriesError('invalid_data');
  if(i>0&&out[i-1].time===b.time)throw new SeriesError('invalid_data');
 });
 return out;
}
const sameBar=(a:SourceKlineBar,b:SourceKlineBar)=>a.open===b.open&&a.high===b.high&&a.low===b.low&&a.close===b.close&&a.volume===b.volume&&(a.amount??null)===(b.amount??null);
function merge(into:Map<string,SourceKlineBar>,bars:SourceKlineBar[]):void{
 for(const b of bars){const prev=into.get(b.time);if(prev&&!sameBar(prev,b))throw new SeriesError('invalid_data');into.set(b.time,b);}
}
const failureOf=(e:unknown,signal:AbortSignal):KlineFailure=>{
 if(e instanceof SeriesError)return {failure:e.failure};
 if(signal.aborted)return {failure:'timeout'};
 return {failure:asKlineProviderError(e).kind};
};
export async function readKlineRange(req:KlineRangeRequest,deps:KlineRangeDeps={}):Promise<KlineRange|KlineFailure>{
 if(!DAY.test(req.from)||!DAY.test(req.to)||req.from>req.to)throw new RangeError(`kline window [${req.from}, ${req.to}]`);
 if(req.adjustment!=='qfq'&&req.adjustment!=='hfq')throw new RangeError(`kline adjustment ${String(req.adjustment)}`);
 if(req.source!=='eastmoney'&&req.source!=='datagateway')return {failure:'unsupported'};
 if(req.signal.aborted)return {failure:'timeout'};
 const bars=new Map<string,SourceKlineBar>();let closeOnly=false;
 try{
  if(req.source==='eastmoney'){
   const em=deps.eastmoney??fetchEastmoneyKline;
   let end=addDaysIso(req.to,1);let prevFirst:string|null=null;
   for(let page=0;;page++){
    if(page>=MAX_PAGES)return {failure:'protocol'};
    if(req.signal.aborted)return {failure:'timeout'};
    const s=await em(req.ticker,'D',EASTMONEY_PAGE,{adjustment:req.adjustment,endDate:end,signal:req.signal});
    if(!s||s.bars.length===0){if(page===0)return {failure:'empty'};break;}
    if(s.adjustment!==req.adjustment)return {failure:'invalid_data'};
    const page_=sortedPage(s.bars);merge(bars,page_);
    const first=page_[0].time;
    if(first<=req.from||(prevFirst!==null&&first>=prevFirst))break;
    prevFirst=first;end=addDaysIso(first,-1);
   }
  }else{
   const dg=deps.datagateway??fetchDatagatewayDailyKline;
   const stop=addDaysIso(req.to,1);
   for(let start=addDaysIso(req.from,-1),page=0;start<=stop;start=addDaysIso(start,DATAGATEWAY_WINDOW_DAYS),page++){
    if(page>=MAX_PAGES)return {failure:'protocol'};
    if(req.signal.aborted)return {failure:'timeout'};
    const windowEnd=addDaysIso(start,DATAGATEWAY_WINDOW_DAYS-1);
    const s=await dg(req.ticker,req.market,DATAGATEWAY_WINDOW_DAYS,req.adjustment,{signal:req.signal,startDate:start,endDate:windowEnd<stop?windowEnd:stop,onCloseOnly:()=>{closeOnly=true;}});
    if(!s)return {failure:'unsupported'};
    if(s.adjustment!==req.adjustment)return {failure:'invalid_data'};
    merge(bars,sortedPage(s.bars));
   }
  }
 }catch(e){return failureOf(e,req.signal);}
 const inRange=[...bars.values()].filter(b=>b.time>=req.from&&b.time<=req.to).sort((a,b)=>a.time<b.time?-1:1);
 if(inRange.length===0)return {failure:'empty'};
 return {source:req.source,bars:inRange,adjustment:req.adjustment,volumeUnit:'shares',close_only:closeOnly,from:req.from,to:req.to};
}
