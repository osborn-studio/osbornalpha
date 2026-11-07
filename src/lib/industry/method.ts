// src/lib/industry/method.ts
// Aggregation method definition (spec §5.1–§5.2). METHOD_CONFIG is the complete, versioned
// description of how a cell is computed; CONFIG_HASH = sha256(canonicalJson(METHOD_CONFIG)) is
// stored on every run and manifest, so any edit to the config changes the hash (and must come with a
// METHOD_VERSION bump; the pinned hash in method.test.ts makes an accidental edit fail CI).
// AGG_CONCEPTS is plan 2's DERIVE_CONCEPTS.CN: one readFacts per issuer per run reads the union of
// every concept any metric needs (V6). Cell layout per period_end (cellSpecs):
//  - revenue_sum / net_income_parent_sum: 3M (q_single_*) at every quarter end; 12M (direct annual
//    fact) only at a December 31 period_end — A-share 12M facts are fiscal years, a 12M cell at
//    another quarter end would always be empty;
//  - gross_margin: 12M at December 31 only (spec: no single quarter);
//  - roe: TTM at every quarter end (window = the four quarters ending at period_end);
//  - revenue_yoy / net_income_yoy: 3M at every quarter end, 12M at December 31;
//  - member_count: INSTANT at every period_end.
// So the expected grid is codes × quarter ends × AGG_METRICS, except gross_margin, which has rows only
// at '-12-31' period_ends (the completeness rule of activate_industry_metric_run must match; see the
// plan skeleton's 跨任务接口约定 A1). Dates are 'YYYY-MM-DD' UTC calendar dates.
import {DERIVE_CONCEPTS,FORMULA_VERSION,addDays} from '../facts/derive';
import {canonicalJson,sha256Hex} from './canonical-json';
import {decCmp,decMul} from './decimal';
import {DISPLAY_MAX_UNRESOLVED,DISPLAY_MIN_COVERAGE,METHOD_VERSION} from './method-constants';
import {SW2021_CODE_ALIASES} from './sw2021';
import type {AggDuration,AggMetric,ClassificationRow,MetricRunRow} from './types';

export {DISPLAY_MAX_UNRESOLVED,DISPLAY_MIN_COVERAGE,METHOD_VERSION};
export {FORMULA_VERSION};
export const AGG_METRICS:readonly AggMetric[]=['revenue_sum','net_income_parent_sum','gross_margin','roe','revenue_yoy','net_income_yoy','member_count'];
/** Concepts read once per issuer per run (plan 2 DERIVE_CONCEPTS.CN, V6). */
export const AGG_CONCEPTS:readonly string[]=[...DERIVE_CONCEPTS.CN];
export const AGG_CURRENCY='CNY';
/** Default first period_end of the grid (SW2021 effective; verification item 3 may move it; a run parameter, not config). */
export const DEFAULT_HISTORY_START='2021-12-31';
/** Readiness gate (spec §4.10): at least this percentage of the run's member issuers must have fact_sync_scope.last_success_at. */
export const READINESS_MIN_PERCENT=95;

export const METHOD_CONFIG={
 method_version:METHOD_VERSION,
 approach:'whole_method',
 market:'CN',currency:AGG_CURRENCY,consolidation:'consolidated',
 concepts:AGG_CONCEPTS,
 membership:'members_at(on=period_end,known_by=facts_as_of)',
 facts_read:'one_read_facts_envelope_per_issuer_per_run(history=true,as_of=facts_as_of)',
 metrics:{
  revenue_sum:{'12M':'sum(fact:revenue@12M)','3M':'sum(derived:q_single_revenue)',unit:'CNY'},
  net_income_parent_sum:{'12M':'sum(fact:net_income_parent@12M)','3M':'sum(derived:q_single_net_income_parent)',unit:'CNY'},
  gross_margin:{'12M':'(sum(fact:revenue_operating)-sum(fact:cost_of_revenue))/sum(fact:revenue_operating)',unit:'ratio'},
  roe:{TTM:'sum(derived:ttm_net_income_parent)/sum(avg(fact:equity_parent@window_start-1d,fact:equity_parent@period_end))',non_positive_denominator:'zero_denominator',unit:'ratio'},
  revenue_yoy:{'12M':'yoy(fact:revenue@12M)','3M':'yoy(derived:q_single_revenue)',unit:'ratio'},
  net_income_yoy:{'12M':'yoy(fact:net_income_parent@12M)','3M':'yoy(derived:q_single_net_income_parent)',unit:'ratio'},
  member_count:{INSTANT:'count(members)',unit:'count'},
 },
 twelve_month_period_end:'12-31',
 yoy:{comparable_set:'members_with_current_and_prior',prior:'same_period_one_year_earlier',formula:'(sum_t-sum_prior)/abs(sum_prior)'},
 match:'exact_period_and_unit',
 financial_l1_codes:['801780','801790'],
 display_min_coverage:DISPLAY_MIN_COVERAGE,display_max_unresolved:DISPLAY_MAX_UNRESOLVED,
 ratio_scale:10,rounding:'half_away_from_zero',
 percentile_sampling:'month_end_published',
 total_share_basis:'all_classes_incl_h_b',   // spec 7th draft K2: daily_basic.total_share = A+H+B issued shares
 code_aliases:SW2021_CODE_ALIASES,           // spec 7th draft K3: member-API code → tree code (Task 7 sw2021.ts)
} as const;
export const CONFIG_HASH=sha256Hex(canonicalJson(METHOD_CONFIG));

export interface CellSpec{metric:AggMetric;duration:AggDuration;period_start:string;period_end:string;unit:'CNY'|'ratio'|'count'}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
export function assertDay(name:string,v:string):void{
 const t=typeof v==='string'&&DAY.test(v)?Date.parse(`${v}T00:00:00Z`):Number.NaN;
 if(Number.isNaN(t)||new Date(t).toISOString().slice(0,10)!==v)throw new Error(`invalid_date:${name}`);
}
const QUARTER_START:Record<string,string>={'03-31':'01-01','06-30':'04-01','09-30':'07-01','12-31':'10-01'};
export const isQuarterEnd=(d:string)=>DAY.test(d)&&d.slice(5) in QUARTER_START;
/** First day of the calendar quarter ending at `pe` (a quarter end). */
export function quarterStart(pe:string):string{
 const s=QUARTER_START[pe.slice(5)];if(!s)throw new Error(`not_quarter_end:${pe}`);
 return `${pe.slice(0,4)}-${s}`;
}
/** Same month-day `n` years later (n may be negative); quarter ends and Jan 1 never hit Feb 29. */
export function shiftYears(d:string,n:number):string{
 assertDay('date',d);
 const out=`${String(Number(d.slice(0,4))+n).padStart(4,'0')}${d.slice(4)}`;
 assertDay('shifted',out);return out;
}
/** Every calendar quarter end q with from <= q <= to, ascending. */
export function quarterEnds(from:string,to:string):string[]{
 assertDay('from',from);assertDay('to',to);
 const out:string[]=[];
 for(let y=Number(from.slice(0,4));y<=Number(to.slice(0,4));y++)for(const md of ['03-31','06-30','09-30','12-31']){const q=`${y}-${md}`;if(q>=from&&q<=to)out.push(q);}
 return out;
}
const DURATION_ORDER:Record<AggDuration,number>={'12M':0,'3M':1,TTM:2,INSTANT:3};
/** The cells of one (code, period_end), in AGG_METRICS then duration order. */
export function cellSpecs(pe:string):CellSpec[]{
 const qs=quarterStart(pe),dec=pe.endsWith('-12-31'),ys=`${pe.slice(0,4)}-01-01`;
 const out:CellSpec[]=[];
 const add=(metric:AggMetric,duration:AggDuration,period_start:string,unit:CellSpec['unit'])=>out.push({metric,duration,period_start,period_end:pe,unit});
 for(const m of ['revenue_sum','net_income_parent_sum'] as const){if(dec)add(m,'12M',ys,'CNY');add(m,'3M',qs,'CNY');}
 if(dec)add('gross_margin','12M',ys,'ratio');
 add('roe','TTM',addDays(shiftYears(pe,-1),1),'ratio');
 for(const m of ['revenue_yoy','net_income_yoy'] as const){if(dec)add(m,'12M',ys,'ratio');add(m,'3M',qs,'ratio');}
 add('member_count','INSTANT',pe,'count');
 return out.sort((a,b)=>AGG_METRICS.indexOf(a.metric)-AGG_METRICS.indexOf(b.metric)||DURATION_ORDER[a.duration]-DURATION_ORDER[b.duration]);
}
/** expected_grid of a run: sorted unique codes × quarter ends from historyStart to factsAsOf × AGG_METRICS. */
export function expectedGrid(codes:readonly string[],historyStart:string,factsAsOf:string):MetricRunRow['expected_grid']{
 assertDay('historyStart',historyStart);assertDay('factsAsOf',factsAsOf);
 if(historyStart>factsAsOf)throw new Error('invalid_grid:history_start_after_facts_as_of');
 const uniq=[...new Set(codes)].sort();
 if(uniq.length===0)throw new Error('invalid_grid:no_codes');
 return {codes:uniq,period_ends:quarterEnds(historyStart,factsAsOf),metrics:[...AGG_METRICS]};
}
/**
 * Every (code, metric, duration, period_end) the grid requires a row for = cellSpecs restricted to the
 * grid's metrics. This is exactly the completeness rule of activate_industry_metric_run (Task 2 SQL
 * values table; Task 3 memory REQUIRED_DURATIONS): 3M at every period end for the sums and YoY, 12M only
 * on December 31 (sums, YoY, gross_margin), TTM for roe, INSTANT for member_count.
 */
export function expectedCells(grid:MetricRunRow['expected_grid']):{code:string;metric:AggMetric;duration:AggDuration;period_end:string}[]{
 const out:{code:string;metric:AggMetric;duration:AggDuration;period_end:string}[]=[];
 for(const code of grid.codes)for(const pe of grid.period_ends)for(const c of cellSpecs(pe))if(grid.metrics.includes(c.metric))out.push({code,metric:c.metric,duration:c.duration,period_end:pe});
 return out;
}
export const cellKey=(code:string,periodEnd:string)=>`${code}:${periodEnd}`;
/** Financial L1 code ('801780.SI' or '801780'): gross margin is not computed (spec §5.1). */
export const isFinancialCode=(code:string)=>(METHOD_CONFIG.financial_l1_codes as readonly string[]).includes(code.replace(/\.SI$/i,''));
/** Walks parent_code up to the level-1 ancestor and applies isFinancialCode; an unknown or cyclic chain is not financial. */
export function isFinancialNode(code:string,tree:readonly ClassificationRow[]):boolean{
 const byCode=new Map(tree.map(r=>[r.code,r]));
 let cur=byCode.get(code);const seen=new Set<string>();
 while(cur&&cur.level>1&&cur.parent_code&&!seen.has(cur.code)){seen.add(cur.code);cur=byCode.get(cur.parent_code);}
 return !!cur&&cur.level===1&&isFinancialCode(cur.code);
}
/** Display thresholds (spec §5.2): never change a cell's status, only how the page labels it. */
export function displayFlags(c:{n_members:number;n_with_data:number;n_unresolved:number}):{coverageOk:boolean;unresolvedOk:boolean}{
 const total=String(c.n_members+c.n_unresolved);
 if(total==='0')return {coverageOk:false,unresolvedOk:true};
 return {coverageOk:decCmp(String(c.n_with_data),decMul(DISPLAY_MIN_COVERAGE,total))>=0,unresolvedOk:decCmp(String(c.n_unresolved),decMul(DISPLAY_MAX_UNRESOLVED,total))<=0};
}
