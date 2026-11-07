// src/lib/macro/regime.ts
// Typed regime rules and the single classification function (spec §5.1–§5.3, §0.2 M8/M14). The
// value_text → Number conversion happens at this boundary only; Δ / 3M changes are computed in
// decimal first. Weights are part of the method (frozen within v1.0); the coverage denominator is
// the region's WEIGHTS_V1 sum, missing/restricted items included. Pure: no I/O.
import {catalogById} from './catalog';
import {subtract,yoyPct} from './decimal';
import {REGIMES} from './judgment-contract';
import type {Regime,RegimeResult} from './judgment-contract';
import type {Region,RegimeContribution,SeriesType} from './types';

export const METHODOLOGY_VERSION='v1.0';
export const RULES_VERSION='macro-regime-rules/1.0';
/** id → weight for every role=indicator monthly/quarterly regime item (spec §4.2), frozen in v1.0. */
export const WEIGHTS_V1:Readonly<Record<string,number>>=Object.freeze({
 US_DFF:25,US_DGS10:15,US_DTWEXBGS:10,US_CPI_YOY:15,US_UNRATE:10,US_PPI_FD_YOY:5,US_ISM_PMI:15,US_VIX:5,
 CN_CPI_YOY:10,CN_PPI_YOY:15,CN_PMI_MFG:15,CN_GDP_YOY:5,CN_M2_YOY:10,CN_EXPORT_YOY:10,CN_CGB_10Y:15,CN_USDCNY_CP:5,
 CN_LPR_1Y:10,CN_MLF_1Y:10,CN_AFRE_STOCK_YOY:20,
});
export type Support=Partial<Record<Regime,number>>;
/** v = latest value; d3 = change vs the period 3 months earlier (previous quarter for quarterly;
 *  for fx a percent change, else a difference in the series unit); d1 = change vs the previous
 *  period. null = comparison period missing ⇒ any rule needing it does not match. */
export interface Rule{id:string;when:(v:number,d3:number|null,d1:number|null)=>boolean;support:Support;label:{zh:string;en:string}}
const rule=(id:string,when:Rule['when'],support:Support,zh:string,en:string):Rule=>({id,when,support,label:{zh,en}});
const nn=(x:number|null):x is number=>x!==null;
export const RULES:Readonly<Record<SeriesType,readonly Rule[]>>={
 policy_rate:[
  rule('policy.lt2_5',v=>v<2.5,{recovery:0.2,recession:0.7},'政策利率 < 2.5%','policy rate < 2.5%'),
  rule('policy.2_5to4_5',v=>v>=2.5&&v<4.5,{recovery:0.3,overheat:0.2,stagflation:0.1,recession:0.1},'2.5% ≤ 政策利率 < 4.5%','2.5% ≤ policy rate < 4.5%'),
  rule('policy.ge4_5.up',(v,_d3,d1)=>v>=4.5&&nn(d1)&&d1>=0,{overheat:0.6,stagflation:0.3},'政策利率 ≥ 4.5% 且未下调','policy rate ≥ 4.5% and not cut'),
  rule('policy.ge4_5.down',(v,_d3,d1)=>v>=4.5&&nn(d1)&&d1<0,{overheat:0.2,stagflation:0.2,recession:0.4},'政策利率 ≥ 4.5% 且下调','policy rate ≥ 4.5% and cut'),
 ],
 bond_yield:[
  rule('bond.d3m.ge25bp',(_v,d3)=>nn(d3)&&d3>=0.25,{overheat:0.5,stagflation:0.3},'收益率 3 个月上行 ≥ 25bp','yield up ≥ 25bp over 3 months'),
  rule('bond.d3m.le-25bp',(_v,d3)=>nn(d3)&&d3<=-0.25,{recovery:0.2,recession:0.5},'收益率 3 个月下行 ≥ 25bp','yield down ≥ 25bp over 3 months'),
  rule('bond.d3m.other',(_v,d3)=>nn(d3)&&d3>-0.25&&d3<0.25,{recovery:0.2,overheat:0.2,stagflation:0.2,recession:0.2},'收益率 3 个月变动在 ±25bp 内','yield 3-month change within ±25bp'),
 ],
 fx:[
  rule('fx.chg3m.ge2',(_v,d3)=>nn(d3)&&d3>=2,{overheat:0.4,stagflation:0.3},'汇率 3 个月变动 ≥ +2%','FX 3-month change ≥ +2%'),
  rule('fx.chg3m.le-2',(_v,d3)=>nn(d3)&&d3<=-2,{recovery:0.5,recession:0.2},'汇率 3 个月变动 ≤ −2%','FX 3-month change ≤ −2%'),
 ],
 inflation_yoy:[
  rule('infl.lt1',v=>v<1,{recovery:0.1,recession:0.7},'通胀同比 < 1%','inflation < 1% y/y'),
  rule('infl.1to2',v=>v>=1&&v<2,{recovery:0.5,recession:0.3},'1% ≤ 通胀同比 < 2%','1% ≤ inflation < 2% y/y'),
  rule('infl.2to3',v=>v>=2&&v<=3,{recovery:0.4,overheat:0.3,stagflation:0.1,recession:0.1},'2% ≤ 通胀同比 ≤ 3%','2% ≤ inflation ≤ 3% y/y'),
  rule('infl.3to4',v=>v>3&&v<=4,{overheat:0.6,stagflation:0.3},'3% < 通胀同比 ≤ 4%','3% < inflation ≤ 4% y/y'),
  rule('infl.gt4',v=>v>4,{overheat:0.4,stagflation:0.6},'通胀同比 > 4%','inflation > 4% y/y'),
 ],
 pmi:[
  rule('pmi.ge55',v=>v>=55,{recovery:0.3,overheat:0.6},'PMI ≥ 55','PMI ≥ 55'),
  rule('pmi.50to55',v=>v>=50&&v<55,{recovery:0.5,overheat:0.3},'50 ≤ PMI < 55','50 ≤ PMI < 55'),
  rule('pmi.47to50',v=>v>=47&&v<50,{recovery:0.1,stagflation:0.4,recession:0.4},'47 ≤ PMI < 50','47 ≤ PMI < 50'),
  rule('pmi.lt47',v=>v<47,{stagflation:0.3,recession:0.7},'PMI < 47','PMI < 47'),
 ],
 labor_rate:[
  rule('labor.d3m.ge0_3',(_v,d3)=>nn(d3)&&d3>=0.3,{stagflation:0.4,recession:0.5},'失业率 3 个月上升 ≥ 0.3pp','unemployment up ≥ 0.3pp over 3 months'),
  rule('labor.d3m.le-0_1',(_v,d3)=>nn(d3)&&d3<=-0.1,{recovery:0.5,overheat:0.4},'失业率 3 个月下降 ≥ 0.1pp','unemployment down ≥ 0.1pp over 3 months'),
 ],
 growth_yoy:[
  rule('growth.ge5.up',(v,_d3,d1)=>v>=5&&nn(d1)&&d1>=0,{recovery:0.5,overheat:0.3},'增长同比 ≥ 5% 且不低于上期','growth ≥ 5% y/y and not below the previous period'),
  rule('growth.lt4_5',v=>v<4.5,{stagflation:0.3,recession:0.6},'增长同比 < 4.5%','growth < 4.5% y/y'),
 ],
 liquidity_yoy:[
  rule('liq.ge8.up',(v,_d3,d1)=>v>=8&&nn(d1)&&d1>=0,{recovery:0.5,overheat:0.3},'流动性同比 ≥ 8% 且不低于上期','liquidity ≥ 8% y/y and not below the previous period'),
  rule('liq.ge8.down',(v,_d3,d1)=>v>=8&&nn(d1)&&d1<0,{recovery:0.2,overheat:0.4,stagflation:0.2},'流动性同比 ≥ 8% 且低于上期','liquidity ≥ 8% y/y and below the previous period'),
  rule('liq.lt8',v=>v<8,{stagflation:0.3,recession:0.5},'流动性同比 < 8%','liquidity < 8% y/y'),
 ],
 risk_index:[
  rule('risk.lt15',v=>v<15,{recovery:0.4,overheat:0.4},'风险指数 < 15','risk index < 15'),
  rule('risk.15to25',v=>v>=15&&v<25,{recovery:0.3,overheat:0.3,stagflation:0.2,recession:0.2},'15 ≤ 风险指数 < 25','15 ≤ risk index < 25'),
  rule('risk.ge25',v=>v>=25,{stagflation:0.5,recession:0.5},'风险指数 ≥ 25','risk index ≥ 25'),
 ],
 asset_price:[],
};
/** First rule of the series' own type whose condition holds (rules within a type are disjoint). */
export function matchRule(type:SeriesType,v:number,d3:number|null,d1:number|null):Rule|null{
 return RULES[type].find(r=>r.when(v,d3,d1))??null;
}
export interface ObsRef{observation_id:string;period_end:string;value_text:string}
export interface RegimeSeriesInput{latest:ObsRef;prev?:ObsRef;prev3m?:ObsRef}
export interface RegimeInput{region:Region;series:Record<string,RegimeSeriesInput>}
export interface RegimeOutput{regime:RegimeResult|null;contributions:RegimeContribution[];uncoveredWeight:number}

const r6=(x:number)=>Math.round(x*1e6)/1e6;
const zero=():Record<Regime,number>=>({recovery:0,overheat:0,stagflation:0,recession:0});
const GROWTH_TYPES:readonly SeriesType[]=['pmi','labor_rate','growth_yoy'];
/** WEIGHTS_V1 restricted to one region, in WEIGHTS_V1 order. */
export function regionWeights(region:Region):Record<string,number>{
 return Object.fromEntries(Object.entries(WEIGHTS_V1).filter(([id])=>catalogById(id)?.region===region));
}
function comparisons(type:SeriesType,s:RegimeSeriesInput):{v:number;d3:number|null;d1:number|null}|null{
 const v=Number(s.latest.value_text);
 if(!Number.isFinite(v))return null;
 const d1=s.prev?Number(subtract(s.latest.value_text,s.prev.value_text)):null;
 let d3:number|null=null;
 if(s.prev3m){
  if(type==='fx')d3=Number(s.prev3m.value_text)===0?null:Number(yoyPct(s.latest.value_text,s.prev3m.value_text));
  else d3=Number(subtract(s.latest.value_text,s.prev3m.value_text));
 }
 return {v,d3:d3!==null&&Number.isFinite(d3)?d3:null,d1:d1!==null&&Number.isFinite(d1)?d1:null};
}
/** argmax with the fixed tie order of REGIMES; secondary = best other state with norm > 0. */
export function pickStates(norm:Record<Regime,number>):{primary:Regime;secondary:Regime|null}{
 let primary:Regime=REGIMES[0];
 for(const s of REGIMES)if(norm[s]>norm[primary])primary=s;
 let secondary:Regime|null=null;
 for(const s of REGIMES){
  if(s===primary||norm[s]<=0)continue;
  if(secondary===null||norm[s]>norm[secondary])secondary=s;
 }
 return {primary,secondary};
}
/** The one classification function: snapshot publishing and MacroReadApi.classifyAsOf both call it. */
export function classifyRegime(input:RegimeInput):RegimeOutput{
 const weights=regionWeights(input.region);
 const denominator=Object.values(weights).reduce((a,b)=>a+b,0);
 const scores=zero();const contributions:RegimeContribution[]=[];
 let matched=0;const growth={num:0,w:0},inflation={num:0,w:0};
 for(const [id,weight] of Object.entries(weights)){
  const s=input.series[id];const def=catalogById(id);
  if(!s||!def||!def.type||weight<=0)continue;
  const c=comparisons(def.type,s);if(!c)continue;
  const hit=matchRule(def.type,c.v,c.d3,c.d1);if(!hit)continue;
  matched+=weight;
  const contribution=zero();
  for(const r of REGIMES){const x=weight*(hit.support[r]??0);scores[r]+=x;contribution[r]=r6(x);}
  const sp=(r:Regime)=>hit.support[r]??0;
  if(GROWTH_TYPES.includes(def.type)){growth.num+=weight*(sp('recovery')+sp('overheat')-sp('stagflation')-sp('recession'));growth.w+=weight;}
  if(def.type==='inflation_yoy'){inflation.num+=weight*(sp('overheat')+sp('stagflation')-sp('recovery')-sp('recession'));inflation.w+=weight;}
  contributions.push({series_id:id,observation_id:s.latest.observation_id,rule_id:hit.id,weight,support:{...hit.support},contribution});
 }
 const uncoveredWeight=r6(denominator-matched);
 const total=REGIMES.reduce((a,r)=>a+scores[r],0);
 const coverage=denominator>0?matched/denominator:0;
 if(coverage<0.6||total<=0)return {regime:null,contributions,uncoveredWeight};
 const norm=zero();for(const r of REGIMES)norm[r]=scores[r]/total;
 const {primary,secondary}=pickStates(norm);
 const regime:RegimeResult={
  primary_state:primary,secondary_state:secondary,
  scores:{recovery:r6(scores.recovery),overheat:r6(scores.overheat),stagflation:r6(scores.stagflation),recession:r6(scores.recession)},
  norm:{recovery:r6(norm.recovery),overheat:r6(norm.overheat),stagflation:r6(norm.stagflation),recession:r6(norm.recession)},
  coverage:r6(coverage),
  margin_pp:r6(100*(norm[primary]-(secondary===null?0:norm[secondary]))),
  growth_axis:growth.w>0?r6(growth.num/growth.w):null,
  inflation_axis:inflation.w>0?r6(inflation.num/inflation.w):null,
 };
 return {regime,contributions,uncoveredWeight};
}
