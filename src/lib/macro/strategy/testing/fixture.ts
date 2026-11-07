// src/lib/macro/strategy/testing/fixture.ts
// TEST-ONLY fixtures for the P3/P4 strategy module (plan 2026-11-07 Task 2; spec §4.2, §4.3, §12). Nothing under
// src/app or a non-test src/lib file may import this file at runtime (port.ts imports its type only).
// FIXTURE_CATALOG mirrors every row of the P1 catalog (P1 spec §4.2, P1 plan Task 2 catalog.ts): ids, regions, roles,
// types, names, units, frequencies, adjustment, status + reason, derive, aliasOf, revisionPolicy, weight, changeKind,
// releaseLagDays and definitionVersion exactly as P1 writes them; `source` is projected to the mirror shape
// {publisher, via, fetchHost, rights} (P1's adapter / seriesKey / attribution are not part of the P3 contract). It adds
// the P3 row US_FED_TARGET_D (spec §4.2, FRED DFEDTAR). FIXTURE_RULES copies P1 regime.ts RULES (P1 spec §5.2 table,
// P1 plan Task 10): the P1 rule ids, bilingual labels and support values in table order.
// Fixtures can carry publish state.
import type {Bilingual,MacroSeriesDef,ObservationRow,Region,RulesView,SnapshotRecord} from '../contract';

export interface StrategyFixture{
 catalog:MacroSeriesDef[];catalogVersion:string;rules:RulesView;
 snapshots:SnapshotRecord[];observations:ObservationRow[];   // all versions; memory port applies asOf / ok rules
 publishState?:Partial<Record<Region,{revision:number;input_revision:number}>>;
 today?:string;
}

// ---------------------------------------------------------------- catalog (P1 §4.2 + P3 §4.2)
type Src=NonNullable<MacroSeriesDef['source']>;
const FED:Bilingual={zh:'美国联邦储备委员会',en:'Board of Governors of the Federal Reserve System'};
const BLS:Bilingual={zh:'美国劳工统计局',en:'U.S. Bureau of Labor Statistics'};
const EIA:Bilingual={zh:'美国能源信息署',en:'U.S. Energy Information Administration'};
const CBOE:Bilingual={zh:'芝加哥期权交易所',en:'Cboe Global Markets'};
const SPDJI:Bilingual={zh:'标普道琼斯指数公司',en:'S&P Dow Jones Indices LLC'};
const NASDAQ:Bilingual={zh:'纳斯达克',en:'Nasdaq, Inc.'};
const NBS:Bilingual={zh:'国家统计局',en:'National Bureau of Statistics of China'};
const PBOC:Bilingual={zh:'中国人民银行',en:"People's Bank of China"};
const GACC:Bilingual={zh:'海关总署',en:'General Administration of Customs of China'};
const CCDC:Bilingual={zh:'中央国债登记结算有限责任公司',en:'China Central Depository & Clearing Co., Ltd.'};
const SAFE:Bilingual={zh:'国家外汇管理局',en:'State Administration of Foreign Exchange'};
const CSI:Bilingual={zh:'中证指数有限公司',en:'China Securities Index Co., Ltd.'};
const VIA_FRED:Bilingual={zh:'FRED（圣路易斯联储）',en:'FRED (Federal Reserve Bank of St. Louis)'};
const fred=(publisher:Bilingual,rights:Src['rights']='public_domain'):Src=>({publisher,via:VIA_FRED,fetchHost:'fred.stlouisfed.org',rights});
const nbs=(publisher:Bilingual=NBS):Src=>({publisher,...(publisher===NBS?{}:{via:NBS}),fetchHost:'data.stats.gov.cn',rights:'official_open'});
const S_FED=fred(FED),S_BLS=fred(BLS),S_VIX=fred(CBOE,'third_party'),S_WTI=fred(EIA);
const S_CGB:Src={publisher:CCDC,fetchHost:'yield.chinabond.com.cn',rights:'official_open'};
const S_USDCNY:Src={publisher:SAFE,fetchHost:'www.safe.gov.cn',rights:'official_open'};
const R_THIRD_PARTY:Bilingual={zh:'第三方版权数据，再分发权利未经 owner 确认，暂不采集',en:'Third-party copyrighted data; redistribution rights not confirmed by the owner, not collected'};

export const FIXTURE_CATALOG:MacroSeriesDef[]=[
 // ---------------------------------------------------------------- US
 {id:'US_FEDFUNDS_EFF_D',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（日）',en:'Effective federal funds rate (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DFF',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（月末）',en:'Effective federal funds rate (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_FEDFUNDS_EFF_D'},revisionPolicy:'immutable',weight:25,changeKind:'bp',definitionVersion:1},
 // P3 addition (spec §4.2): fred_csv / DFEDTAR, single target rate, the series ends 2008-12-15.
 {id:'US_FED_TARGET_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标利率（单一目标，止于 2008-12-15）',en:'Federal funds target rate (single target, ends 2008-12-15)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_UPPER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间上限',en:'Federal funds target range upper limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_LOWER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间下限',en:'Federal funds target range lower limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DGS10_D',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（日）',en:'U.S. 10-year Treasury yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DGS10',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（月末）',en:'U.S. 10-year Treasury yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_DGS10_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'US_DTWEXBGS_D',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（日）',en:'Nominal broad U.S. dollar index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_FED,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DTWEXBGS',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（月末）',en:'Nominal broad U.S. dollar index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,derive:{kind:'month_end',from:'US_DTWEXBGS_D'},revisionPolicy:'immutable',weight:10,changeKind:'pct',definitionVersion:1},
 {id:'US_CPI_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 CPI 指数（城市全体消费者，季调）',en:'U.S. CPI for all urban consumers (index, SA)'},unit:'index_1982_84_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_CPI_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 CPI 同比',en:'U.S. CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,derive:{kind:'yoy_from_index',from:'US_CPI_INDEX'},revisionPolicy:'revisable',weight:15,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_UNRATE',region:'US',role:'indicator',type:'labor_rate',name:{zh:'美国失业率',en:'U.S. unemployment rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:7,definitionVersion:1},
 {id:'US_PPI_FD_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 PPI 最终需求指数（季调）',en:'U.S. PPI final demand (index, SA)'},unit:'index_2009_11_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_PPI_FD_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 PPI 最终需求同比',en:'U.S. PPI final demand, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_BLS,derive:{kind:'yoy_from_index',from:'US_PPI_FD_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_ISM_PMI',region:'US',role:'indicator',type:'pmi',name:{zh:'ISM 制造业 PMI',en:'ISM manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'missing',reason:{zh:'FRED 已于 2016 年移除 ISM 数据；没有可采集的原始来源与再分发权利',en:'FRED removed ISM data in 2016; no collectable original source or redistribution rights'},source:null,revisionPolicy:'revisable',weight:15,changeKind:'points',definitionVersion:1},
 {id:'US_VIX_D',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（日）',en:'Cboe Volatility Index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,revisionPolicy:'immutable',weight:0,changeKind:'points',definitionVersion:1},
 {id:'US_VIX',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（月末）',en:'Cboe Volatility Index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,derive:{kind:'month_end',from:'US_VIX_D'},revisionPolicy:'immutable',weight:5,changeKind:'points',definitionVersion:1},
 {id:'US_WTI_D',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（日）',en:'WTI crude oil spot price (daily)'},unit:'usd_per_bbl',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_WTI,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_WTI',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（月末）',en:'WTI crude oil spot price (month end)'},unit:'usd_per_bbl',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_WTI,derive:{kind:'month_end',from:'US_WTI_D'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_UST10Y',region:'US',role:'asset',type:'asset_price',name:{zh:'美国 10 年期国债（资产视角）',en:'U.S. 10-year Treasury (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_FED,aliasOf:'US_DGS10',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_SP500',region:'US',role:'asset',type:'asset_price',name:{zh:'标普 500 指数',en:'S&P 500'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_NASDAQCOM',region:'US',role:'asset',type:'asset_price',name:{zh:'纳斯达克综合指数',en:'Nasdaq Composite'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(NASDAQ,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DJIA',region:'US',role:'asset',type:'asset_price',name:{zh:'道琼斯工业平均指数',en:'Dow Jones Industrial Average'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred(SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 // ---------------------------------------------------------------- CN
 {id:'CN_CPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'居民消费价格指数（上年同月=100）',en:'CPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_CPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 CPI 同比',en:'China CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_CPI_INDEX'},revisionPolicy:'immutable',weight:10,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'工业生产者出厂价格指数（上年同月=100）',en:'PPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 PPI 同比',en:'China PPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_PPI_INDEX'},revisionPolicy:'immutable',weight:15,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PMI_MFG',region:'CN',role:'indicator',type:'pmi',name:{zh:'制造业采购经理指数',en:'Manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:nbs(),revisionPolicy:'immutable',weight:15,changeKind:'points',releaseLagDays:1,definitionVersion:1},
 {id:'CN_GDP_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'国内生产总值指数（当季，上年同期=100）',en:'GDP index (quarter, same quarter last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:nbs(),revisionPolicy:'revisable',weight:0,changeKind:'points',releaseLagDays:20,definitionVersion:1},
 {id:'CN_GDP_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'中国 GDP 当季同比',en:'China GDP, quarter year over year'},unit:'pct',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:nbs(),derive:{kind:'index_minus_100',from:'CN_GDP_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:20,definitionVersion:1},
 {id:'CN_M2_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'M2 同比增长',en:'M2, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(PBOC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'CN_EXPORT_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'出口额同比（美元计）',en:'Exports, year over year (USD)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs(GACC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:10,definitionVersion:1},
 {id:'CN_CGB_10Y_D',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（日）',en:'ChinaBond 10-year government bond yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_CGB,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CGB_10Y',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（月末）',en:'ChinaBond 10-year government bond yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,derive:{kind:'month_end',from:'CN_CGB_10Y_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'CN_USDCNY_CP_D',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（日）',en:'RMB central parity, USD (daily)'},unit:'cny_per_100usd',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_USDCNY,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'CN_USDCNY_CP',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（月末）',en:'RMB central parity, USD (month end)'},unit:'cny_per_100usd',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_USDCNY,derive:{kind:'month_end',from:'CN_USDCNY_CP_D'},revisionPolicy:'immutable',weight:5,changeKind:'pct',definitionVersion:1},
 {id:'CN_LPR_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期贷款市场报价利率',en:'1-year loan prime rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'missing',reason:{zh:'AKShare 仅有东方财富转载，无已核实的官方接口（全国银行间同业拆借中心）',en:'AKShare only offers a third-party relay; no verified official interface (CFETS)'},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_MLF_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期中期借贷便利利率',en:'1-year MLF rate'},unit:'pct',nativeFrequency:'event',period:'day',adjustment:'na',status:'missing',reason:{zh:'无已核实的官方接口（中国人民银行）',en:"No verified official interface (People's Bank of China)"},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_AFRE_STOCK_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'社会融资规模存量同比',en:'Aggregate financing stock, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'missing',reason:{zh:'AKShare 只有商务部转载的增量口径，口径不同，不得替代存量同比',en:'AKShare only has a relayed flow measure; a different definition cannot stand in for the stock growth rate'},source:null,revisionPolicy:'revisable',weight:20,changeKind:'pp',definitionVersion:1},
 {id:'CN_CGB10Y',region:'CN',role:'asset',type:'asset_price',name:{zh:'中国 10 年期国债（资产视角）',en:'China 10-year government bond (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,aliasOf:'CN_CGB_10Y',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CSI300',region:'CN',role:'asset',type:'asset_price',name:{zh:'沪深 300 指数',en:'CSI 300 Index'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:{zh:'中证指数公司数据，再分发权利未确认，暂不采集',en:'China Securities Index data; redistribution rights not confirmed, not collected'},source:{publisher:CSI,fetchHost:'www.csindex.com.cn',rights:'third_party'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
];
export const FIXTURE_CATALOG_VERSION='macro-catalog/fixture-1';

// ---------------------------------------------------------------- rules (P1 §5.2, P1 plan Task 10 RULES, table order)
const r=(rule_id:string,type:RulesView['rows'][number]['type'],zh:string,en:string,support:RulesView['rows'][number]['support'])=>({rule_id,type,condition:{zh,en},support});
export const FIXTURE_RULES:RulesView={rulesVersion:'macro-regime-rules/1.0',rows:[
 r('policy.lt2_5','policy_rate','政策利率 < 2.5%','policy rate < 2.5%',{recovery:0.2,recession:0.7}),
 r('policy.2_5to4_5','policy_rate','2.5% ≤ 政策利率 < 4.5%','2.5% ≤ policy rate < 4.5%',{recovery:0.3,overheat:0.2,stagflation:0.1,recession:0.1}),
 r('policy.ge4_5.up','policy_rate','政策利率 ≥ 4.5% 且未下调','policy rate ≥ 4.5% and not cut',{overheat:0.6,stagflation:0.3}),
 r('policy.ge4_5.down','policy_rate','政策利率 ≥ 4.5% 且下调','policy rate ≥ 4.5% and cut',{overheat:0.2,stagflation:0.2,recession:0.4}),
 r('bond.d3m.ge25bp','bond_yield','收益率 3 个月上行 ≥ 25bp','yield up ≥ 25bp over 3 months',{overheat:0.5,stagflation:0.3}),
 r('bond.d3m.le-25bp','bond_yield','收益率 3 个月下行 ≥ 25bp','yield down ≥ 25bp over 3 months',{recovery:0.2,recession:0.5}),
 r('bond.d3m.other','bond_yield','收益率 3 个月变动在 ±25bp 内','yield 3-month change within ±25bp',{recovery:0.2,overheat:0.2,stagflation:0.2,recession:0.2}),
 r('fx.chg3m.ge2','fx','汇率 3 个月变动 ≥ +2%','FX 3-month change ≥ +2%',{overheat:0.4,stagflation:0.3}),
 r('fx.chg3m.le-2','fx','汇率 3 个月变动 ≤ −2%','FX 3-month change ≤ −2%',{recovery:0.5,recession:0.2}),
 r('infl.lt1','inflation_yoy','通胀同比 < 1%','inflation < 1% y/y',{recovery:0.1,recession:0.7}),
 r('infl.1to2','inflation_yoy','1% ≤ 通胀同比 < 2%','1% ≤ inflation < 2% y/y',{recovery:0.5,recession:0.3}),
 r('infl.2to3','inflation_yoy','2% ≤ 通胀同比 ≤ 3%','2% ≤ inflation ≤ 3% y/y',{recovery:0.4,overheat:0.3,stagflation:0.1,recession:0.1}),
 r('infl.3to4','inflation_yoy','3% < 通胀同比 ≤ 4%','3% < inflation ≤ 4% y/y',{overheat:0.6,stagflation:0.3}),
 r('infl.gt4','inflation_yoy','通胀同比 > 4%','inflation > 4% y/y',{overheat:0.4,stagflation:0.6}),
 r('pmi.ge55','pmi','PMI ≥ 55','PMI ≥ 55',{recovery:0.3,overheat:0.6}),
 r('pmi.50to55','pmi','50 ≤ PMI < 55','50 ≤ PMI < 55',{recovery:0.5,overheat:0.3}),
 r('pmi.47to50','pmi','47 ≤ PMI < 50','47 ≤ PMI < 50',{recovery:0.1,stagflation:0.4,recession:0.4}),
 r('pmi.lt47','pmi','PMI < 47','PMI < 47',{stagflation:0.3,recession:0.7}),
 r('labor.d3m.ge0_3','labor_rate','失业率 3 个月上升 ≥ 0.3pp','unemployment up ≥ 0.3pp over 3 months',{stagflation:0.4,recession:0.5}),
 r('labor.d3m.le-0_1','labor_rate','失业率 3 个月下降 ≥ 0.1pp','unemployment down ≥ 0.1pp over 3 months',{recovery:0.5,overheat:0.4}),
 r('growth.ge5.up','growth_yoy','增长同比 ≥ 5% 且不低于上期','growth ≥ 5% y/y and not below the previous period',{recovery:0.5,overheat:0.3}),
 r('growth.lt4_5','growth_yoy','增长同比 < 4.5%','growth < 4.5% y/y',{stagflation:0.3,recession:0.6}),
 r('liq.ge8.up','liquidity_yoy','流动性同比 ≥ 8% 且不低于上期','liquidity ≥ 8% y/y and not below the previous period',{recovery:0.5,overheat:0.3}),
 r('liq.ge8.down','liquidity_yoy','流动性同比 ≥ 8% 且低于上期','liquidity ≥ 8% y/y and below the previous period',{recovery:0.2,overheat:0.4,stagflation:0.2}),
 r('liq.lt8','liquidity_yoy','流动性同比 < 8%','liquidity < 8% y/y',{stagflation:0.3,recession:0.5}),
 r('risk.lt15','risk_index','风险指数 < 15','risk index < 15',{recovery:0.4,overheat:0.4}),
 r('risk.15to25','risk_index','15 ≤ 风险指数 < 25','15 ≤ risk index < 25',{recovery:0.3,overheat:0.3,stagflation:0.2,recession:0.2}),
 r('risk.ge25','risk_index','风险指数 ≥ 25','risk index ≥ 25',{stagflation:0.5,recession:0.5}),
]};

// ---------------------------------------------------------------- builders
const pad=(n:number)=>String(n).padStart(2,'0');
/** Last day of 'YYYY-MM' shifted by `k` months. */
function monthEndOf(firstMonth:string,k:number):string{
 const idx=Number(firstMonth.slice(0,4))*12+Number(firstMonth.slice(5,7))-1+k;
 const y=Math.floor(idx/12),m=idx%12+1;
 return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y,m,0)).getUTCDate())}`;
}
/** Observation builder: deterministic ids `obs:<series>:<period_end>:v<version>`; available_at default `${period_end}T12:00:00Z`. */
export function obs(seriesId:string,periodEnd:string,valueText:string,o:{version?:number;availableAt?:string;status?:ObservationRow['status']}={}):ObservationRow{
 const version=o.version??1;const availableAt=o.availableAt??`${periodEnd}T12:00:00Z`;
 return {observation_id:`obs:${seriesId}:${periodEnd}:v${version}`,series_id:seriesId,period_end:periodEnd,value_text:valueText,version,
  available_at:availableAt,availability_basis:'first_seen',ingested_at:availableAt,status:o.status??'ok',retrieval_id:null,derived_from:null,transform:null};
}
/** Monthly series helper: one month-end observation per entry starting at firstMonth ('YYYY-MM'); null = gap. */
export function monthly(seriesId:string,firstMonth:string,values:(string|null)[],o:{availableAt?:string}={}):ObservationRow[]{
 const out:ObservationRow[]=[];
 values.forEach((v,k)=>{if(v!==null)out.push(obs(seriesId,monthEndOf(firstMonth,k),v,{availableAt:o.availableAt}));});
 return out;
}
/** Daily helper: one observation per listed date. */
export function daily(seriesId:string,points:[string,string][]):ObservationRow[]{return points.map(([d,v])=>obs(seriesId,d,v));}
const countsOf=(region:Region):SnapshotRecord['catalog_counts']=>{
 const rows=FIXTURE_CATALOG.filter(d=>d.region===region);
 return {verified:rows.filter(d=>d.status==='active').length,missing:rows.filter(d=>d.status==='missing').length,restricted:rows.filter(d=>d.status==='restricted').length};
};
/** Snapshot builder: id `snap:<region>:<created_at>`, status active unless given. */
export function snap(region:Region,createdAt:string,observationIds:string[],o:{historyIds?:string[];status?:SnapshotRecord['status'];counts?:SnapshotRecord['catalog_counts']}={}):SnapshotRecord{
 return {snapshot_id:`snap:${region}:${createdAt}`,region,as_of:createdAt.slice(0,10),revision:1,methodology_version:'v1.0',catalog_version:FIXTURE_CATALOG_VERSION,
  observation_ids:[...observationIds],history_ids:[...(o.historyIds??[])],catalog_counts:o.counts??countsOf(region),status:o.status??'active',created_at:createdAt};
}

// ---------------------------------------------------------------- Fed target (FRED DFEDTAR / DFEDTARU / DFEDTARL)
// Sparse by design: each change date (value as published by FRED) plus the day before it (the previous value), which
// is enough for the event derivation to see every change and nothing else. DFEDTAR's last observation is 2008-12-15;
// DFEDTARU/L start 2008-12-16 (no "day before" for that first range observation).
const TARGET:[string,string][]=[['2007-09-17','5.25'],['2007-09-18','4.75'],['2007-10-30','4.75'],['2007-10-31','4.50'],['2007-12-10','4.50'],['2007-12-11','4.25'],
 ['2008-01-21','4.25'],['2008-01-22','3.50'],['2008-01-29','3.50'],['2008-01-30','3.00'],['2008-03-17','3.00'],['2008-03-18','2.25'],['2008-04-29','2.25'],['2008-04-30','2.00'],
 ['2008-10-07','2.00'],['2008-10-08','1.50'],['2008-10-28','1.50'],['2008-10-29','1.00'],['2008-12-15','1.00']];
/** [change date, upper, lower]; the day before each change (except the first) repeats the previous range. */
const RANGE_CHANGES:[string,string,string][]=[['2008-12-16','0.25','0.00'],['2015-12-17','0.50','0.25'],['2016-12-15','0.75','0.50'],['2017-03-16','1.00','0.75'],
 ['2017-06-15','1.25','1.00'],['2017-12-14','1.50','1.25'],['2018-03-22','1.75','1.50'],['2018-06-14','2.00','1.75'],['2018-09-27','2.25','2.00'],['2018-12-20','2.50','2.25'],
 ['2019-08-01','2.25','2.00'],['2019-09-19','2.00','1.75'],['2019-10-31','1.75','1.50'],['2020-03-04','1.25','1.00'],['2020-03-16','0.25','0.00'],['2022-03-17','0.50','0.25'],
 ['2022-05-05','1.00','0.75'],['2022-06-16','1.75','1.50'],['2022-07-28','2.50','2.25'],['2022-09-22','3.25','3.00'],['2022-11-03','4.00','3.75'],['2022-12-15','4.50','4.25'],
 ['2023-02-02','4.75','4.50'],['2023-03-23','5.00','4.75'],['2023-05-04','5.25','5.00'],['2023-07-27','5.50','5.25'],['2024-09-19','5.00','4.75'],['2024-11-08','4.75','4.50'],
 ['2024-12-19','4.50','4.25']];
const dayBefore=(d:string)=>new Date(Date.parse(`${d}T00:00:00Z`)-86400000).toISOString().slice(0,10);
/** Fed target fixture: DFEDTAR 2007-2008 single target incl. 2008-12-15 = 1.00, DFEDTARU/L from 2008-12-16 (0.25/0) and every
 *  later change through 2024-12-19 (values from FRED; effective dates as published). Ascending period_end per series. */
export function fedTargetFixture():ObservationRow[]{
 const upper:[string,string][]=[],lower:[string,string][]=[];
 RANGE_CHANGES.forEach(([d,u,l],i)=>{
  if(i>0){const [,pu,pl]=RANGE_CHANGES[i-1];upper.push([dayBefore(d),pu]);lower.push([dayBefore(d),pl]);}
  upper.push([d,u]);lower.push([d,l]);
 });
 return [...daily('US_FED_TARGET_D',TARGET),...daily('US_FED_TARGET_UPPER_D',upper),...daily('US_FED_TARGET_LOWER_D',lower)];
}
/** Defaults: FIXTURE_CATALOG, FIXTURE_CATALOG_VERSION, FIXTURE_RULES, no snapshots / observations. */
export function fixture(over:Partial<StrategyFixture>={}):StrategyFixture{
 return {catalog:FIXTURE_CATALOG,catalogVersion:FIXTURE_CATALOG_VERSION,rules:FIXTURE_RULES,snapshots:[],observations:[],...over};
}
