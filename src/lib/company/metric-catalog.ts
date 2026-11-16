// src/lib/company/metric-catalog.ts
// Formula texts of the derived metrics (spec §0.1 item 1, §5.4), keyed by the landed FORMULA_VERSION:
// the facts layer exports deriveMetrics / metricNames but no human-readable formula. The catalogue
// must cover metricNames('US') ∪ metricNames('CN') exactly and describe derive.ts as it is (inputs,
// basis values); a FORMULA_VERSION bump fails metric-catalog.test.ts until the texts are reviewed.
// CN q_single_revenue / ttm_revenue are 营业总收入 (concept revenue), never 营业收入 (§0 #66).
import {Q_SINGLE_CONCEPTS} from '@/lib/facts/derive';
import type {Market} from '@/lib/facts/types';

export const METRIC_CATALOG_VERSION='facts-derive/1.0';
export interface MetricText{name:string;formula:string}
export interface MetricCatalogEntry{metric:string;formulaVersion:string;unitKind:'ratio'|'money';zh:MetricText;en:MetricText;inputs:Partial<Record<Market,readonly string[]>>;basisByMarket:Partial<Record<Market,string>>}

const QL:Record<string,{zh:string;en:string}>={
 revenue:{zh:'收入（美股营业收入；A 股营业总收入）',en:'Revenue (US revenue; CN total operating revenue)'},
 net_income_parent:{zh:'归母净利润',en:'Net income attributable to parent'},
 operating_income:{zh:'营业利润',en:'Operating income'},
 operating_cash_flow:{zh:'经营活动现金流净额',en:'Net cash from operating activities'},
 capex:{zh:'购建固定资产支出',en:'Purchases of property, plant and equipment'},
 capex_incl_intangibles:{zh:'购建固定资产、无形资产和其他长期资产支付的现金',en:'Cash paid for fixed, intangible and other long-term assets'},
};
const QUARTER_RULE_ZH='披露的 3 个月数值；无 3 个月披露时取相邻累计期之差，仅当两者来自同一文件（规则 a）或两条序列都从未修订（规则 b），且差额本身是一个季度';
const QUARTER_RULE_EN='the disclosed 3-month value; otherwise the difference of adjacent year-to-date periods, only when both come from the same filing (rule a) or neither sequence was ever revised (rule b), and the difference is itself one quarter';
const BASIS_Q=(m:Market,c:string)=>m==='CN'&&c==='capex_incl_intangibles'?'cn_incl_intangibles':m==='US'?'us_standard':'cn_standard';
const entry=(metric:string,unitKind:'ratio'|'money',zh:MetricText,en:MetricText,inputs:MetricCatalogEntry['inputs'],basisByMarket:MetricCatalogEntry['basisByMarket']):MetricCatalogEntry=>({metric,formulaVersion:METRIC_CATALOG_VERSION,unitKind,zh,en,inputs,basisByMarket});
const STD={US:'us_standard',CN:'cn_standard'};

const fixed:MetricCatalogEntry[]=[
 entry('gross_margin','ratio',
  {name:'毛利率',formula:'美股：毛利 ÷ 营业收入；无毛利披露时为（营业收入 − 营业成本）÷ 营业收入。A 股：（营业收入 revenue_operating − 营业成本）÷ 营业收入。同期间、同单位精确匹配；分母为 0 不产出'},
  {name:'Gross margin',formula:'US: gross profit ÷ revenue, or (revenue − cost of revenue) ÷ revenue when gross profit is not disclosed. CN: (operating revenue − cost of revenue) ÷ operating revenue. Exact period and unit match; zero denominator → not produced'},
  {US:['revenue','gross_profit','cost_of_revenue'],CN:['revenue_operating','cost_of_revenue']},STD),
 entry('net_margin','ratio',
  {name:'净利率',formula:'归母净利润 ÷ 营业收入（美股 revenue；A 股营业收入 revenue_operating）；同期间、同单位'},
  {name:'Net margin',formula:'Net income attributable to parent ÷ revenue (US revenue; CN operating revenue); same period and unit'},
  {US:['net_income_parent','revenue'],CN:['net_income_parent','revenue_operating']},STD),
 entry('fcf','money',
  {name:'自由现金流',formula:'经营活动现金流净额 − 资本开支（美股：购建固定资产支出；A 股：购建固定资产、无形资产和其他长期资产支付的现金）'},
  {name:'Free cash flow',formula:'Net cash from operating activities − capital expenditure (US: purchases of PP&E; CN: cash paid for fixed, intangible and other long-term assets)'},
  {US:['operating_cash_flow','capex'],CN:['operating_cash_flow','capex_incl_intangibles']},{US:'us_standard',CN:'cn_incl_intangibles'}),
 entry('borrowings_total','money',
  {name:'有息借款合计',formula:'美股：短期借款 + 长期借款；A 股：短期借款 + 长期借款 + 应付债券；同一时点、同单位'},
  {name:'Total borrowings',formula:'US: short-term + long-term borrowings; CN: short-term + long-term borrowings + bonds payable; same instant and unit'},
  {US:['short_term_borrowings','long_term_borrowings'],CN:['short_term_borrowings','long_term_borrowings','bonds_payable']},{US:'us_standard',CN:'cn_incl_bonds'}),
 entry('revenue_yoy','ratio',
  {name:'收入同比',formula:'（本期收入 − 上年同期）÷ |上年同期|；收入为 revenue（A 股营业总收入）；上年同期为同时长、同单位、期末早 350–380 天的唯一事实；上年同期为 0 不产出'},
  {name:'Revenue YoY',formula:'(revenue − prior) ÷ |prior|; revenue is concept revenue (CN total operating revenue); prior = the unique same-duration, same-unit fact ending 350–380 days earlier; zero prior → not produced'},
  {US:['revenue'],CN:['revenue']},STD),
 entry('net_income_yoy','ratio',
  {name:'归母净利润同比',formula:'（本期归母净利润 − 上年同期）÷ |上年同期|；上年同期规则同收入同比'},
  {name:'Net income YoY',formula:'(net income attributable to parent − prior) ÷ |prior|; prior chosen as for revenue YoY'},
  {US:['net_income_parent'],CN:['net_income_parent']},STD),
 entry('roe','ratio',
  {name:'净资产收益率（TTM）',formula:'近四季归母净利润 × 2 ÷（期初归母权益 + 期末归母权益）；期初为 TTM 窗口开始前一日的时点值；平均权益 ≤ 0 不产出'},
  {name:'Return on equity (TTM)',formula:'TTM net income attributable to parent × 2 ÷ (opening + closing parent equity); opening is the instant one day before the TTM window; non-positive average equity → not produced'},
  {US:['net_income_parent','equity_parent'],CN:['net_income_parent','equity_parent']},STD),
];
const quarterly:MetricCatalogEntry[]=[...new Set([...Q_SINGLE_CONCEPTS.US,...Q_SINGLE_CONCEPTS.CN])].flatMap(c=>{
 const markets=(['US','CN'] as Market[]).filter(m=>Q_SINGLE_CONCEPTS[m].includes(c));
 const inputs=Object.fromEntries(markets.map(m=>[m,[c]]));
 const basis=Object.fromEntries(markets.map(m=>[m,BASIS_Q(m,c)]));
 const l=QL[c];
 return [
  entry(`q_single_${c}`,'money',{name:`单季${l.zh}`,formula:`单季 ${l.zh}：${QUARTER_RULE_ZH}`},{name:`Single-quarter ${l.en}`,formula:`Single-quarter ${l.en}: ${QUARTER_RULE_EN}`},inputs,basis),
  entry(`ttm_${c}`,'money',{name:`近四季${l.zh}`,formula:`近四季 ${l.zh}：四个首尾相接、各自唯一的单季之和（单季规则同上）`},{name:`TTM ${l.en}`,formula:`TTM ${l.en}: sum of four exactly adjacent, each unique, single quarters (single-quarter rule as above)`},inputs,basis),
 ];
});
export const METRIC_CATALOG:Readonly<Record<string,MetricCatalogEntry>>=Object.fromEntries([...fixed,...quarterly].map(e=>[e.metric,e]));
export function catalogFor(formulaVersion:string):Readonly<Record<string,MetricCatalogEntry>>|null{return formulaVersion===METRIC_CATALOG_VERSION?METRIC_CATALOG:null;}
