// src/lib/judgments/adapters/recommendation.ts
// recommendation_call@v1 (spec §11.2, §8.6): read-only private adapter. Maps one recommendations row (+ its
// recommendation_scores row) to a PrivateJudgmentCard and never writes judgments. Card id = uuidV8(sha256('recommendation:'+id)):
// a domain-separated content id, not an authorization boundary — private cards are only read through the user's session (G31).
// recommendation_scores is owner-writable, so calibration is fixed 'self_assessed': percent is always null, and selfAssessment()
// (same §8.1 math) is labelled "not auditable" and never enters judgment_calibrations.
import type {Market,Recommendation,RecommendationScore} from '@/lib/supabase/database.types';
import type {Bilingual,Horizon,Input,PrivateJudgmentCard,ReliabilityBin,Subject,Target} from '@/lib/judgments/types';
import {digest,sha256} from '@/lib/judgments/canonical';
import {uuidV8} from '@/lib/judgments/uuid-v8';
import {closeInstantUtc} from '@/lib/judgments/time';
import {settleWindow} from '@/lib/judgments/target';
import {originFor} from '@/lib/judgments/origins';
import {isPriceMarket} from '@/lib/judgments/markets';
import {brierParts,ece,reliabilityBins,selectIndependent} from '@/lib/judgments/calibration';
import type {CohortEntry} from '@/lib/judgments/calibration';
import {bandOf,type Band} from '@/lib/judgments/band';
import {callDirection,exchangeDate} from '@/lib/scoring/forward';
import {wilson} from '@/lib/research/fanout/calibration';

export {bandOf};
export const RECOMMENDATION_METHOD={id:'recommendation_call',version:'v1',title:{zh:'分析师建议（私有）',en:'Analyst call (private)'},href:'/analyst'} as const;
export const RECOMMENDATION_HORIZON:Horizon={unit:'trading_sessions',n:5};
/** trading_sessions default grace (contract 结算窗口算术, spec §3.4). */
export const RECOMMENDATION_GRACE_DAYS=60;
type LegacyFill=Extract<Input,{kind:'legacy_fill'}>;
type CardCondition=NonNullable<PrivateJudgmentCard['condition']>;
export interface RecommendationCardContext{issuerOf(ticker:string,market:Market,on:string):string|null}
export const NO_ISSUERS:RecommendationCardContext={issuerOf:()=>null};

const ACTION:Record<Recommendation['action'],Bilingual>={buy:{zh:'买入',en:'Buy'},add:{zh:'加仓',en:'Add'},sell:{zh:'卖出',en:'Sell'},trim:{zh:'减仓',en:'Trim'},hold:{zh:'持有',en:'Hold'},pass:{zh:'回避',en:'Pass'}};
const SELF_REPORT:Bilingual={zh:'分析师评分层自评（recommendation_scores 可被改写，不可审计）',en:'Analyst scoring layer self-report (recommendation_scores is owner-writable; not auditable)'};
const WITHDRAWN:Bilingual={zh:'分析师撤回',en:'Withdrawn by the analyst'};

export const recommendationCardId=(recommendationId:string)=>uuidV8(sha256(`recommendation:${recommendationId}`));

/** The one frozen price fact of the analyst scoring layer: the fill close (spec §11.2; legacy_fill, not price_bar). */
export function legacyFillInput(rec:Recommendation):LegacyFill|null{
 if(rec.fill_price===null||rec.fill_date===null||!isPriceMarket(rec.market))return null;
 const snapshot={recommendation_id:rec.id,fill_price:rec.fill_price,fill_date:rec.fill_date,market:rec.market,ticker:rec.ticker};
 return {kind:'legacy_fill',ref:{recommendation_id:rec.id},snapshot,hash:digest(snapshot),available_at:closeInstantUtc(rec.fill_date,rec.market),
  origin:originFor('legacy_fill','eastmoney',{recommendation_id:rec.id})};   // ORIGINS locator 'recommendations:{recommendation_id}' (Task 6)
}

const eventText=(dir:1|-1):Bilingual=>dir===1
 ?{zh:'第 5 个后续交易日收盘价高于基准日收盘（看多）',en:'Close on the 5th following session above the base-date close (long)'}
 :{zh:'第 5 个后续交易日收盘价低于基准日收盘（看空）',en:'Close on the 5th following session below the base-date close (short)'};
const headlineOf=(rec:Recommendation):Bilingual=>({zh:`${ACTION[rec.action].zh} ${rec.ticker} · 5 个交易日方向`,en:`${ACTION[rec.action].en} ${rec.ticker} · 5-session direction`});
const pctLabel=(v:number)=>`${v>0?'+':''}${v.toFixed(2)}%`;
function conditionOf(fill:LegacyFill,dir:1|-1):CardCondition{
 const target:Target={kind:'session_index',base_date:fill.snapshot.fill_date,n:RECOMMENDATION_HORIZON.n};
 const w=settleWindow(target,RECOMMENDATION_HORIZON,{grace_days:RECOMMENDATION_GRACE_DAYS});   // target.ts = time.ts settleWindowOf (Task 1)
 return {text:eventText(dir),horizon:RECOMMENDATION_HORIZON,target,label_policy:'first_observed',settle_after:w.settle_after,settle_by:w.settle_by};
}

/** State priority (spec §11.2): withdrawn > abstained(no_confidence > no_direction > market_unsupported) > pending_fill > settled > open. */
export function toJudgmentCard(rec:Recommendation,score:RecommendationScore|null,ctx:RecommendationCardContext=NO_ISSUERS):PrivateJudgmentCard{
 const asOf=exchangeDate(rec.recommended_at,rec.market);
 const issuer=ctx.issuerOf(rec.ticker,rec.market,asOf);
 const subject:Subject=issuer?{type:'issuer',key:issuer}:{type:'security',key:`${rec.market}:${rec.ticker}`};
 const p=rec.confidence===null?null:rec.confidence/100;
 const dir=callDirection(rec.action);
 const fill=legacyFillInput(rec);
 const condition=fill&&dir!==0?conditionOf(fill,dir):null;
 const inputs=fill?[{kind:fill.kind,ref:fill.ref,available_at:fill.available_at,origin:fill.origin,href:null}]:[];
 const base={judgment_id:recommendationCardId(rec.id),subject,judgment_type:'recommendation_call' as const,kind:'probability' as const,
  calibration:'self_assessed' as const,retrospective:asOf<rec.created_at.slice(0,10),as_of:asOf,registered_at:rec.created_at,
  methodology:{id:RECOMMENDATION_METHOD.id,version:RECOMMENDATION_METHOD.version,title:RECOMMENDATION_METHOD.title,href:RECOMMENDATION_METHOD.href},
  display:{headline:headlineOf(rec),percent:null,value:p,...(p===null?{}:{band:bandOf(p)})},
  calibration_summary:null,source:'recommendation' as const};
 if(rec.withdrawn_at!==null)return {...base,lifecycle:'withdrawn',outcome:null,condition,inputs,
  settlement:{kind:'withdrawn',outcome:null,realized:null,settled_at:rec.withdrawn_at,evidence_summary:rec.withdraw_reason?{zh:rec.withdraw_reason,en:rec.withdraw_reason}:WITHDRAWN}};
 const abstained=(reason:string):PrivateJudgmentCard=>({...base,display:{headline:base.display.headline,percent:null,value:null},
  lifecycle:'abstained',outcome:null,condition:null,settlement:null,inputs:[],abstain_reason:reason});
 if(p===null)return abstained('no_confidence');
 if(dir===0)return abstained('no_direction');
 if(!isPriceMarket(rec.market))return abstained('market_unsupported');
 if(!fill||!condition)return {...base,lifecycle:'pending_fill',outcome:null,condition:null,settlement:null,inputs:[]};
 if(score&&score.hit!==null){
  const outcome=score.hit?'hit' as const:'miss' as const;
  return {...base,lifecycle:'settled',outcome,condition,inputs,
   settlement:{kind:'settled',outcome,settled_at:score.scored_at,evidence_summary:SELF_REPORT,
    realized:{value:score.hit,...(score.forward_5d_pct===null?{}:{label:pctLabel(score.forward_5d_pct)}),unit:null,from:fill.snapshot.fill_date,to:null,label_policy:'first_observed'}}};
 }
 return {...base,lifecycle:'open',outcome:null,condition,inputs,settlement:null};
}

export interface SelfAssessmentBand{band:Band;n:number;hits:number;rate:number|null;low:number|null;high:number|null}
export interface SelfAssessment{state:'self_assessed';auditable:false;n_total:number;n_independent:number;brier:number|null;brier_skill:number|null;ece_raw:number|null;
 hit_rate:{rate:number;low:number|null;high:number|null}|null;reliability:ReliabilityBin[];bands:SelfAssessmentBand[]}

/** Spec §8.6: settled, non-retrospective calls → §8.2 independent sample (per security key) → §8.1 probability metrics. */
export function selfAssessment(rows:ReadonlyArray<{recommendation:Recommendation;score:RecommendationScore|null}>):SelfAssessment{
 const settled=rows.map(({recommendation:r,score})=>({r,card:toJudgmentCard(r,score)})).filter(x=>x.card.lifecycle==='settled'&&!x.card.retrospective);
 // Task 15 primitives (one §8.1/§8.2 implementation): entries stream per security key, window [as_of, settle_after date].
 const entries:CohortEntry[]=settled.map(({r,card})=>({judgment_id:card.judgment_id,subject_type:'security',subject_key:`${r.market}:${r.ticker}`,market:null,as_of:card.as_of,
  window_end:card.condition!.settle_after.slice(0,10),retrospective:false,lifecycle:'settled',settlement_id:null,forecast:{kind:'probability',p:r.confidence!/100},y:card.outcome==='hit'?1:0}));
 const chosen=selectIndependent(entries,0);
 const sample=entries.filter(e=>chosen.has(e.judgment_id)).sort((a,b)=>a.as_of<b.as_of?-1:a.as_of>b.as_of?1:a.judgment_id<b.judgment_id?-1:a.judgment_id>b.judgment_id?1:0)
  .map(e=>({p:(e.forecast as {p:number}).p,y:e.y as 0|1}));
 const bp=brierParts(sample);const hitsAll=sample.filter(s=>s.y===1).length;const wAll=wilson(hitsAll,sample.length);
 const m={brier:bp.brier,brier_skill:bp.skill,ece_raw:ece(sample),reliability:reliabilityBins(sample),
  hit_rate:sample.length?{rate:hitsAll/sample.length,low:wAll.low,high:wAll.high}:null};
 const bands=(['high','mid','low'] as const).map(band=>{
  const xs=sample.filter(s=>bandOf(s.p)===band);const hits=xs.filter(s=>s.y===1).length;const w=wilson(hits,xs.length);
  return {band,n:xs.length,hits,rate:xs.length?hits/xs.length:null,low:w.low,high:w.high};
 });
 return {state:'self_assessed',auditable:false,n_total:settled.length,n_independent:sample.length,brier:m.brier,brier_skill:m.brier_skill,ece_raw:m.ece_raw,hit_rate:m.hit_rate,reliability:m.reliability,bands};
}

type Rows={data:unknown;error:{message:string}|null};
/** Minimal read surface of the session Supabase client for the issuer lookup (issuer_securities and stocks_universe are public read). */
export interface IssuerLookupClient{from(table:'issuer_securities'|'stocks_universe'):{select(columns:string):{in(column:string,values:string[]):PromiseLike<Rows>}}}
const LOOKUP_CHUNK=200;
/** issuer_securities ⋈ stocks_universe(market): the issuer holding (ticker, market) on the recommendation's exchange date (spec §11.2). */
export async function loadIssuerIndex(client:IssuerLookupClient,recs:ReadonlyArray<Pick<Recommendation,'ticker'|'market'>>):Promise<RecommendationCardContext>{
 const tickers=[...new Set(recs.map(r=>r.ticker))];
 if(!tickers.length)return NO_ISSUERS;
 type Window={issuer_id:string;ticker:string;valid_from:string;valid_to:string|null};
 const windows:Window[]=[];const marketOf=new Map<string,string>();
 for(let i=0;i<tickers.length;i+=LOOKUP_CHUNK){
  const part=tickers.slice(i,i+LOOKUP_CHUNK);
  const [sec,uni]=await Promise.all([client.from('issuer_securities').select('issuer_id,ticker,valid_from,valid_to').in('ticker',part),client.from('stocks_universe').select('ticker,market').in('ticker',part)]);
  if(sec.error)throw new Error(sec.error.message);
  if(uni.error)throw new Error(uni.error.message);
  windows.push(...((sec.data??[]) as Window[]));
  for(const u of (uni.data??[]) as {ticker:string;market:string}[])marketOf.set(u.ticker,u.market);
 }
 return {issuerOf(ticker,market,on){
  if(marketOf.get(ticker)!==market)return null;
  return windows.find(w=>w.ticker===ticker&&w.valid_from<=on&&(w.valid_to===null||on<w.valid_to))?.issuer_id??null;
 }};
}
