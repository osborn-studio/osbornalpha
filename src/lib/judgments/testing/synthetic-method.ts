// src/lib/judgments/testing/synthetic-method.ts
// synthetic_fact_metric@v1 — a TEST-ONLY rule method (never in REGISTRY; spec §14.4 "合成 fact_metric
// 判断") for the golden replay fixture. One financial_metric input: the issuer's latest
// params.metric (ttm_revenue) derivable at as_of in the market given by binding.market (default US),
// frozen with its derivation rows by the fixed builder. Claim: probability p = params.p. Condition:
// fact_metric "next quarter's TTM value > this TTM value", the key being this metric's key stepped one
// quarter (stepQuarter). Horizon 1 fiscal quarter, target by defaultResolveTarget, first_observed.
// Its numbers carry no meaning; it only exercises frozen-input replay of a fact-based judgment.
import {FORMULA_VERSION} from '@/lib/facts/derive';
import type {FactsMarket,Input,Methodology,MetricSnapshot,ProbabilityClaim} from '../types';
import {buildOrAbstain} from '../inputs';
import {defaultResolveTarget,stepQuarter} from '../target';

const snapshotOf=(inputs:readonly Input[])=>inputs.find(x=>x.kind==='financial_metric')?.snapshot as MetricSnapshot|undefined;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const syntheticFactMetric:Methodology<ProbabilityClaim>={
 id:'synthetic_fact_metric',version:'v1',judgment_type:'synthetic_fact_metric',kind:'probability',producer_kind:'rule',
 subject_types:['issuer'],input_kinds:['financial_metric'],upstream:{facts_formula_version:FORMULA_VERSION},
 title:{zh:'合成事实指标（测试专用）',en:'Synthetic fact metric (test only)'},doc:'docs/methodologies/README.md',
 params:{grace_days:120,label_policy:'first_observed',p:0.6,metric:'ttm_revenue'},horizon:{unit:'fiscal_quarters',n:1},deps:[],
 module:'src/lib/judgments/testing/synthetic-method.ts',status:'active',
 async gather(item,db){
  if(item.subject.type!=='issuer')return {abstained:true,reason:'subject_not_issuer'};
  const market=(item.binding?.market??'US') as FactsMarket;const metric=String(this.params.metric);
  const {metrics}=await db.deriveMetricsAsOf(item.subject.key,market,item.asOf,FORMULA_VERSION);
  const m=metrics.filter(x=>x.metric===metric).sort((a,b)=>cmp(a.period_end,b.period_end)).at(-1);
  if(!m)return {abstained:true,reason:'input_not_public',missing:[`${metric}@latest`]};
  const x=await buildOrAbstain({kind:'financial_metric',ref:{issuer_id:m.issuer_id,market:m.market,metric:m.metric,period_start:m.period_start,period_end:m.period_end,input_unit:m.input_unit,basis:m.basis,formula_version:m.formula_version}},db,item.asOf,item.observedAt);
  return 'abstained' in x?x:[x];
 },
 resolveTarget(item,inputs,db){return defaultResolveTarget(this.horizon,item,inputs,db);},
 compute(_subject,inputs){
  if(!snapshotOf(inputs))return {abstained:true,reason:'metric_missing'};
  return {abstained:false,claim:{p:Number(this.params.p),event:{zh:'下一财季的 TTM 营收高于本期 TTM 营收',en:'Next fiscal quarter TTM revenue exceeds the current TTM revenue'}}};
 },
 condition(_subject,inputs){
  const s=snapshotOf(inputs)!;
  return {resolver:'fact_metric',params:{issuer_id:s.issuer_id,market:s.market,metric:s.metric,period_start:stepQuarter(s.period_start,1),period_end:stepQuarter(s.period_end,1),duration:s.duration,unit:s.unit,input_unit:s.input_unit,basis:s.basis,formula_version:s.formula_version,compare:'value'},
   predicate:{op:'>',rhs:Number(s.value_text)},
   text:{zh:`截至 ${stepQuarter(s.period_end,1)} 的 TTM 营收高于 ${s.value_text} ${s.unit}`,en:`TTM revenue to ${stepQuarter(s.period_end,1)} exceeds ${s.value_text} ${s.unit}`}};
 },
};
