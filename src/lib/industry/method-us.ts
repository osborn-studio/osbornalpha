// US SIC snapshot reconstruction (§19): whole-method USD fiscal-year buckets, independent of CN.
// A bucket describes the calendar year of fiscal period_end; real fiscal dates stay in the manifest.
import {canonicalJson,sha256Hex} from './canonical-json';
import {assertDay} from './method';
import type {CellSpec} from './method';
import {DISPLAY_MIN_COVERAGE} from './method-constants';
import type {AggMetric,ExpectedGridUs} from './types-us';
export const METHOD_VERSION_US='industry-agg-us/1.0';
export const US_HISTORY_BUCKETS=3;
export const DISPLAY_MIN_MEMBERS_SIC=5;
export const READINESS_MIN_PERCENT_US=50;
export const AGG_CONCEPTS_US=['revenue','gross_profit','net_income_parent'] as const;
export const AGG_METRICS_US:readonly AggMetric[]=['revenue_sum','net_income_parent_sum','gross_margin','net_margin','revenue_yoy','net_income_yoy','member_count'];
export const METHOD_CONFIG_US={
 method_version:METHOD_VERSION_US,approach:'whole_method',market:'US',currency:'USD',consolidation:'consolidated',concepts:AGG_CONCEPTS_US,
 membership:'members_at(on=membership_on,known_by=facts_as_of)',history_class:'reconstruction',membership_on:'facts_as_of',
 facts_read:'one_read_facts_envelope_per_issuer_per_run(history=true,as_of=facts_as_of)',
 bucket:{rule:'fiscal_year_bucket/1',period_end:'fiscal_period_end_within_calendar_year',completed:'facts_as_of>=(Y+1)-04-01',history_buckets:US_HISTORY_BUCKETS,duration:'12M'},
 metrics:{revenue_sum:'sum(revenue)',net_income_parent_sum:'sum(net_income_parent)',gross_margin:'sum(gross_profit)/sum(revenue)',net_margin:'sum(net_income_parent)/sum(revenue)',revenue_yoy:'(sum_Y(revenue)-sum_prior(revenue))/abs(sum_prior(revenue))',net_income_yoy:'(sum_Y(net_income_parent)-sum_prior(net_income_parent))/abs(sum_prior(net_income_parent))',member_count:'count(members)'},
 pick:{candidates:'is_current=true,status=ok,consolidation=consolidated,duration=12M',unit:'USD',unique:'exactly_one_USD_row_per_issuer_concept_bucket',ambiguous:'ambiguous_period',other_unit:'unit_excluded',absent:'missing_concept',ratios:'identical_period_start_and_period_end_else_period_mismatch',yoy:'picked_current_and_prior_bucket_else_not_in_comparable_set',truncated:'read_truncated_all_value_cells'},
 financial_sic_range:['6000','6799'],financial_exclusion:'gross_margin',display_min_members:'5',display_min_coverage:DISPLAY_MIN_COVERAGE,
 ratio_scale:10,rounding:'half_away_from_zero',
} as const;
export const CONFIG_HASH_US=sha256Hex(canonicalJson(METHOD_CONFIG_US));
export function usBuckets(factsAsOf:string,n=US_HISTORY_BUCKETS):string[]{
 assertDay('factsAsOf',factsAsOf);if(!Number.isInteger(n)||n<1)throw new Error('invalid_bucket_count');
 const last=Number(factsAsOf.slice(0,4))-(factsAsOf.slice(5)>='04-01'?1:2);
 return Array.from({length:n},(_,i)=>`${last-n+1+i}-12-31`);
}
export function cellSpecsUs(pe:string):CellSpec[]{
 assertDay('periodEnd',pe);if(!pe.endsWith('-12-31'))throw new Error('invalid_us_bucket');
 return AGG_METRICS_US.map(metric=>({metric,duration:metric==='member_count'?'INSTANT':'12M',period_start:metric==='member_count'?pe:`${pe.slice(0,4)}-01-01`,period_end:pe,unit:metric==='member_count'?'count':metric.endsWith('_sum')?'USD':'ratio'}));
}
export function expectedGridUs(codes:readonly string[],factsAsOf:string):ExpectedGridUs{
 const uniq=[...new Set(codes)].sort();if(!uniq.length)throw new Error('invalid_grid:no_codes');
 return {codes:uniq,period_ends:usBuckets(factsAsOf),metrics:[...AGG_METRICS_US],cell_rule:'fiscal_year_bucket/1',membership_on:factsAsOf};
}
export const isFinancialCodeUs=(code:string)=>/^\d{4}$/.test(code)&&code>='6000'&&code<='6799';

/** Transport window containing every current/prior fiscal-year pick in the grid. */
export function usEnvelopeWindow(periodEnds:readonly string[]):{from:string;to:string}{
 if(!periodEnds.length)throw new Error('invalid_us_window');
 const years=periodEnds.map(pe=>{assertDay('periodEnd',pe);return Number(pe.slice(0,4));});
 return {from:`${Math.min(...years)-1}-01-01`,to:`${Math.max(...years)}-12-31`};
}
