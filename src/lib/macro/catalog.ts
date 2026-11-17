// src/lib/macro/catalog.ts
// The macro series catalog as code (spec §4.2; §0.2 M1–M5, M14, M15). Every row is either an
// active official source (fetch host, original publisher, relay `via`, series key, rights,
// attribution) or explicitly missing/restricted with a bilingual reason. Native daily ids are
// separate from their derived month-end ids; derived rows carry their input's source and status;
// asset "views" (aliasOf) reuse another series' observations. Weights are the v1.0 judgment
// weights (Task 10 WEIGHTS_V1 must equal them). CATALOG_VERSION = 'macro-catalog/' + first 12 hex
// of SHA-256 over the key-sorted canonical JSON; pure TS so client components may import this file.
import type {Adapter,Bilingual,MacroSeriesDef,Region,Rights,SeriesSource} from './types';

// ---------------------------------------------------------------- publishers
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

const fred=(code:string,publisher:Bilingual,rights:Rights='public_domain'):SeriesSource=>({
 adapter:'fred_csv',fetchHost:'fred.stlouisfed.org',publisher,via:VIA_FRED,seriesKey:code,rights,
 attribution:{zh:`来源：${publisher.zh}，经 FRED（圣路易斯联储）`,en:`Source: ${publisher.en}, retrieved from FRED, Federal Reserve Bank of St. Louis`},
});
/** NBS national data via AKShare macro_china_nbs_nation; publisher = original agency, via = NBS when it relays. */
const nbs=(key:string,publisher:Bilingual=NBS):SeriesSource=>({
 adapter:'akshare',fetchHost:'data.stats.gov.cn',publisher,...(publisher===NBS?{}:{via:NBS}),seriesKey:`macro_china_nbs_nation|${key}`,rights:'official_open',
 attribution:publisher===NBS?{zh:'来源：国家统计局',en:'Source: National Bureau of Statistics of China'}:{zh:`来源：${publisher.zh}，经国家统计局`,en:`Source: ${publisher.en}, via National Bureau of Statistics of China`},
});
const akshare=(fetchHost:string,seriesKey:string,publisher:Bilingual,rights:Rights):SeriesSource=>({
 adapter:'akshare',fetchHost,publisher,seriesKey,rights,attribution:{zh:`来源：${publisher.zh}`,en:`Source: ${publisher.en}`},
});
const R_THIRD_PARTY:Bilingual={zh:'第三方版权数据，再分发权利未经 owner 确认，暂不采集',en:'Third-party copyrighted data; redistribution rights not confirmed by the owner, not collected'};

// ---------------------------------------------------------------- source constants (shared by native, derived and alias rows)
const S_DFF=fred('DFF',FED),S_DGS10=fred('DGS10',FED),S_DTWEX=fred('DTWEXBGS',FED),S_CPI=fred('CPIAUCSL',BLS),S_PPI=fred('PPIFIS',BLS),
 S_VIX=fred('VIXCLS',CBOE,'third_party'),S_WTI=fred('DCOILWTICO',EIA);
// NBS keys verified end to end against AKShare 1.20.35 and the live NBS tree on 2026-11-06 (plan Part B "已核实的上游事实").
// CPI is split into era leaves: the key names the current (2026-) leaf; cn-series.ts (Task 8) backfills from the sibling
// (2021-2025) and (2016-2020) leaves. A new era leaf (≈2031) means a new key and a new CATALOG_VERSION (runbook §10).
const S_CN_CPI=nbs('月度数据|价格指数 > 居民消费价格分类指数(上年同月=100) > 全国居民消费价格分类指数(上年同月=100)(2026-) > 居民消费价格指数(上年同月=100)');
const S_CN_PPI=nbs('月度数据|价格指数 > 工业生产者出厂价格分类指数 > 工业生产者出厂价格指数(上年同月=100) > 工业生产者出厂价格指数(上年同月=100)');
const S_CN_GDP=nbs('季度数据|国民经济核算 > 国内生产总值指数 > 国内生产总值指数(上年同期=100)当季值');
const S_CGB=akshare('yield.chinabond.com.cn','bond_china_yield|中债国债收益率曲线|10年',CCDC,'official_open');
// SAFE: only the RMBQuery.do HTML is evidence (the bucket takes no XLSX and there is no xlsx locator), so CN_USDCNY_CP_D
// history starts at the first date in that HTML (2026-01-05 when recorded); older history in SAFE's XLSX is NOT parsed
// and stays missing (runbook §10). Active rows carry no `reason`, so this note lives here, not in the catalog data.
const S_USDCNY=akshare('www.safe.gov.cn','currency_boc_safe|美元',SAFE,'official_open');

const CATALOG:MacroSeriesDef[]=[
 // ---------------------------------------------------------------- US
 {id:'US_FEDFUNDS_EFF_D',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（日）',en:'Effective federal funds rate (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_DFF,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DFF',region:'US',role:'indicator',type:'policy_rate',name:{zh:'联邦基金有效利率（月末）',en:'Effective federal funds rate (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_DFF,derive:{kind:'month_end',from:'US_FEDFUNDS_EFF_D'},revisionPolicy:'immutable',weight:25,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_UPPER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间上限',en:'Federal funds target range upper limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:fred('DFEDTARU',FED),revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_FED_TARGET_LOWER_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标区间下限',en:'Federal funds target range lower limit'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:fred('DFEDTARL',FED),revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 // MACRO-P3 (WP-S6, spec 2026-11-07 §4.2): the single Fed funds target before the range existed; FRED DFEDTAR ends 2008-12-15. Event source for policy events (§5.4); never enters the regime.
 {id:'US_FED_TARGET_D',region:'US',role:'event_source',type:'policy_rate',name:{zh:'联邦基金目标利率（单一目标，止于 2008-12-15）',en:'Federal funds target rate (single target, through 2008-12-15)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:fred('DFEDTAR',FED),revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 // /MACRO-P3
 {id:'US_DGS10_D',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（日）',en:'U.S. 10-year Treasury yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_DGS10,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_DGS10',region:'US',role:'indicator',type:'bond_yield',name:{zh:'美国 10 年期国债收益率（月末）',en:'U.S. 10-year Treasury yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_DGS10,derive:{kind:'month_end',from:'US_DGS10_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'US_DTWEXBGS_D',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（日）',en:'Nominal broad U.S. dollar index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_DTWEX,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DTWEXBGS',region:'US',role:'indicator',type:'fx',name:{zh:'美元名义广义指数（月末）',en:'Nominal broad U.S. dollar index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_DTWEX,derive:{kind:'month_end',from:'US_DTWEXBGS_D'},revisionPolicy:'immutable',weight:10,changeKind:'pct',definitionVersion:1},
 {id:'US_CPI_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 CPI 指数（城市全体消费者，季调）',en:'U.S. CPI for all urban consumers (index, SA)'},unit:'index_1982_84_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_CPI,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_CPI_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 CPI 同比',en:'U.S. CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_CPI,derive:{kind:'yoy_from_index',from:'US_CPI_INDEX'},revisionPolicy:'revisable',weight:15,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_UNRATE',region:'US',role:'indicator',type:'labor_rate',name:{zh:'美国失业率',en:'U.S. unemployment rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:fred('UNRATE',BLS),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:7,definitionVersion:1},
 {id:'US_PPI_FD_INDEX',region:'US',role:'indicator',type:null,name:{zh:'美国 PPI 最终需求指数（季调）',en:'U.S. PPI final demand (index, SA)'},unit:'index_2009_11_100',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_PPI,revisionPolicy:'revisable',weight:0,changeKind:'pct',releaseLagDays:15,definitionVersion:1},
 {id:'US_PPI_FD_YOY',region:'US',role:'indicator',type:'inflation_yoy',name:{zh:'美国 PPI 最终需求同比',en:'U.S. PPI final demand, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:S_PPI,derive:{kind:'yoy_from_index',from:'US_PPI_FD_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'US_ISM_PMI',region:'US',role:'indicator',type:'pmi',name:{zh:'ISM 制造业 PMI',en:'ISM manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'missing',reason:{zh:'FRED 已于 2016 年移除 ISM 数据；没有可采集的原始来源与再分发权利',en:'FRED removed ISM data in 2016; no collectable original source or redistribution rights'},source:null,revisionPolicy:'revisable',weight:15,changeKind:'points',definitionVersion:1},
 {id:'US_VIX_D',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（日）',en:'Cboe Volatility Index (daily)'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,revisionPolicy:'immutable',weight:0,changeKind:'points',definitionVersion:1},
 {id:'US_VIX',region:'US',role:'indicator',type:'risk_index',name:{zh:'VIX 波动率指数（月末）',en:'Cboe Volatility Index (month end)'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:S_VIX,derive:{kind:'month_end',from:'US_VIX_D'},revisionPolicy:'immutable',weight:5,changeKind:'points',definitionVersion:1},
 {id:'US_WTI_D',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（日）',en:'WTI crude oil spot price (daily)'},unit:'usd_per_bbl',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_WTI,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_WTI',region:'US',role:'asset',type:'asset_price',name:{zh:'WTI 原油现货价格（月末）',en:'WTI crude oil spot price (month end)'},unit:'usd_per_bbl',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_WTI,derive:{kind:'month_end',from:'US_WTI_D'},revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_UST10Y',region:'US',role:'asset',type:'asset_price',name:{zh:'美国 10 年期国债（资产视角）',en:'U.S. 10-year Treasury (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_DGS10,aliasOf:'US_DGS10',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'US_SP500',region:'US',role:'asset',type:'asset_price',name:{zh:'标普 500 指数',en:'S&P 500'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred('SP500',SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_NASDAQCOM',region:'US',role:'asset',type:'asset_price',name:{zh:'纳斯达克综合指数',en:'Nasdaq Composite'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred('NASDAQCOM',NASDAQ,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'US_DJIA',region:'US',role:'asset',type:'asset_price',name:{zh:'道琼斯工业平均指数',en:'Dow Jones Industrial Average'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:R_THIRD_PARTY,source:fred('DJIA',SPDJI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 // ---------------------------------------------------------------- CN
 {id:'CN_CPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'居民消费价格指数（上年同月=100）',en:'CPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:S_CN_CPI,revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_CPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 CPI 同比',en:'China CPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:S_CN_CPI,derive:{kind:'index_minus_100',from:'CN_CPI_INDEX'},revisionPolicy:'immutable',weight:10,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'工业生产者出厂价格指数（上年同月=100）',en:'PPI (same month last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:S_CN_PPI,revisionPolicy:'immutable',weight:0,changeKind:'points',releaseLagDays:12,definitionVersion:1},
 {id:'CN_PPI_YOY',region:'CN',role:'indicator',type:'inflation_yoy',name:{zh:'中国 PPI 同比',en:'China PPI, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:S_CN_PPI,derive:{kind:'index_minus_100',from:'CN_PPI_INDEX'},revisionPolicy:'immutable',weight:15,changeKind:'pp',releaseLagDays:12,definitionVersion:1},
 // NBS publishes PMI already seasonally adjusted (NBS PMI explanatory notes), hence 'sa'.
 {id:'CN_PMI_MFG',region:'CN',role:'indicator',type:'pmi',name:{zh:'制造业采购经理指数',en:'Manufacturing PMI'},unit:'index',nativeFrequency:'monthly',period:'month',adjustment:'sa',status:'active',source:nbs('月度数据|采购经理指数 > 制造业采购经理指数 > 制造业采购经理指数(%)'),revisionPolicy:'immutable',weight:15,changeKind:'points',releaseLagDays:1,definitionVersion:1},
 {id:'CN_GDP_INDEX',region:'CN',role:'indicator',type:null,name:{zh:'国内生产总值指数（当季，上年同期=100）',en:'GDP index (quarter, same quarter last year = 100)'},unit:'index_prev_year_100',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:S_CN_GDP,revisionPolicy:'revisable',weight:0,changeKind:'points',releaseLagDays:20,definitionVersion:1},
 {id:'CN_GDP_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'中国 GDP 当季同比',en:'China GDP, quarter year over year'},unit:'pct',nativeFrequency:'quarterly',period:'quarter',adjustment:'nsa',status:'active',source:S_CN_GDP,derive:{kind:'index_minus_100',from:'CN_GDP_INDEX'},revisionPolicy:'revisable',weight:5,changeKind:'pp',releaseLagDays:20,definitionVersion:1},
 {id:'CN_M2_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'M2 同比增长',en:'M2, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs('月度数据|金融 > 货币供应量 > 货币和准货币(M2)供应量_同比增长(%)',PBOC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:15,definitionVersion:1},
 {id:'CN_EXPORT_YOY',region:'CN',role:'indicator',type:'growth_yoy',name:{zh:'出口额同比（美元计）',en:'Exports, year over year (USD)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'active',source:nbs('月度数据|对外经济 > 货物进出口总额 > 出口总值同比增长(%)',GACC),revisionPolicy:'revisable',weight:10,changeKind:'pp',releaseLagDays:10,definitionVersion:1},
 {id:'CN_CGB_10Y_D',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（日）',en:'ChinaBond 10-year government bond yield (daily)'},unit:'pct',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_CGB,revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CGB_10Y',region:'CN',role:'indicator',type:'bond_yield',name:{zh:'中债 10 年期国债收益率（月末）',en:'ChinaBond 10-year government bond yield (month end)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,derive:{kind:'month_end',from:'CN_CGB_10Y_D'},revisionPolicy:'immutable',weight:15,changeKind:'bp',definitionVersion:1},
 {id:'CN_USDCNY_CP_D',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（日）',en:'RMB central parity, USD (daily)'},unit:'cny_per_100usd',nativeFrequency:'daily',period:'day',adjustment:'na',status:'active',source:S_USDCNY,revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
 {id:'CN_USDCNY_CP',region:'CN',role:'indicator',type:'fx',name:{zh:'人民币汇率中间价 美元（月末）',en:'RMB central parity, USD (month end)'},unit:'cny_per_100usd',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_USDCNY,derive:{kind:'month_end',from:'CN_USDCNY_CP_D'},revisionPolicy:'immutable',weight:5,changeKind:'pct',definitionVersion:1},
 {id:'CN_LPR_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期贷款市场报价利率',en:'1-year loan prime rate'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'missing',reason:{zh:'AKShare 仅有东方财富转载，无已核实的官方接口（全国银行间同业拆借中心）',en:'AKShare only offers a third-party relay; no verified official interface (CFETS)'},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_MLF_1Y',region:'CN',role:'indicator',type:'policy_rate',name:{zh:'1 年期中期借贷便利利率',en:'1-year MLF rate'},unit:'pct',nativeFrequency:'event',period:'day',adjustment:'na',status:'missing',reason:{zh:'无已核实的官方接口（中国人民银行）',en:"No verified official interface (People's Bank of China)"},source:null,revisionPolicy:'immutable',weight:10,changeKind:'bp',definitionVersion:1},
 {id:'CN_AFRE_STOCK_YOY',region:'CN',role:'indicator',type:'liquidity_yoy',name:{zh:'社会融资规模存量同比',en:'Aggregate financing stock, year over year'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'nsa',status:'missing',reason:{zh:'AKShare 只有商务部转载的增量口径，口径不同，不得替代存量同比',en:'AKShare only has a relayed flow measure; a different definition cannot stand in for the stock growth rate'},source:null,revisionPolicy:'revisable',weight:20,changeKind:'pp',definitionVersion:1},
 {id:'CN_CGB10Y',region:'CN',role:'asset',type:'asset_price',name:{zh:'中国 10 年期国债（资产视角）',en:'China 10-year government bond (asset view)'},unit:'pct',nativeFrequency:'monthly',period:'month',adjustment:'na',status:'active',source:S_CGB,aliasOf:'CN_CGB_10Y',revisionPolicy:'immutable',weight:0,changeKind:'bp',definitionVersion:1},
 {id:'CN_CSI300',region:'CN',role:'asset',type:'asset_price',name:{zh:'沪深 300 指数',en:'CSI 300 Index'},unit:'index',nativeFrequency:'daily',period:'day',adjustment:'na',status:'restricted',reason:{zh:'中证指数公司数据，再分发权利未确认，暂不采集',en:'China Securities Index data; redistribution rights not confirmed, not collected'},source:akshare('www.csindex.com.cn','stock_zh_index_hist_csindex|000300',CSI,'third_party'),revisionPolicy:'immutable',weight:0,changeKind:'pct',definitionVersion:1},
];

function deepFreeze<T>(v:T):T{
 if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const k of Object.keys(v as object))deepFreeze((v as Record<string,unknown>)[k]);}
 return v;
}
// Shared source constants appear in several rows; freezing them once is fine (they are never mutated).
export const MACRO_CATALOG:readonly MacroSeriesDef[]=deepFreeze(CATALOG);

// ---------------------------------------------------------------- canonical JSON + SHA-256 (pure TS)
/** JSON with object keys sorted (UTF-16 code unit order), undefined members dropped, arrays in order. */
export function canonicalJson(v:unknown):string{
 if(v===null||typeof v==='boolean'||typeof v==='string')return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('canonical_json_unsupported:number');return JSON.stringify(v);}
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(typeof v==='object'){const o=v as Record<string,unknown>;return `{${Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;}
 throw new Error(`canonical_json_unsupported:${typeof v}`);
}
const K=new Uint32Array([
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
/** SHA-256 hex of the UTF-8 bytes of text (FIPS 180-4). Synchronous and dependency-free. */
export function sha256HexSync(text:string):string{
 const bytes=new TextEncoder().encode(text);const len=bytes.length;
 const padded=new Uint8Array((((len+9)+63)>>6)<<6);padded.set(bytes);padded[len]=0x80;
 const dv=new DataView(padded.buffer);
 dv.setUint32(padded.length-8,Math.floor(len/0x20000000));dv.setUint32(padded.length-4,(len*8)>>>0);
 const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const W=new Uint32Array(64);
 for(let off=0;off<padded.length;off+=64){
  for(let i=0;i<16;i++)W[i]=dv.getUint32(off+i*4);
  for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+W[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0;}
  let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
  for(let i=0;i<64;i++){
   const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+W[i])>>>0;
   const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
   h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
 }
 return Array.from(H,x=>x.toString(16).padStart(8,'0')).join('');
}
export const CATALOG_VERSION=`macro-catalog/${sha256HexSync(canonicalJson(MACRO_CATALOG)).slice(0,12)}`;

// ---------------------------------------------------------------- helpers
const BY_ID=new Map(MACRO_CATALOG.map(d=>[d.id,d]));
const DERIVE_INPUTS=new Set(MACRO_CATALOG.flatMap(d=>d.derive?[d.derive.from]:[]));
export const catalogById=(id:string):MacroSeriesDef|undefined=>BY_ID.get(id);
/** Display indicators of a region, catalog order: role indicator, not merely the input of a derived series (missing/restricted included). */
export const indicatorsOf=(region:Region):MacroSeriesDef[]=>MACRO_CATALOG.filter(d=>d.region===region&&d.role==='indicator'&&!DERIVE_INPUTS.has(d.id));
/** Judgment inputs (§0.2 M14/M15): active, weighted, monthly or quarterly (derived month-end included; daily natives never). */
export const regimeInputsOf=(region:Region):MacroSeriesDef[]=>indicatorsOf(region).filter(d=>d.status==='active'&&d.weight>0&&d.nativeFrequency!=='daily'&&d.nativeFrequency!=='event');
/** Series that own evidence for one adapter: active, not derived, not an alias. */
export const collectableOf=(adapter:Adapter):MacroSeriesDef[]=>MACRO_CATALOG.filter(d=>d.status==='active'&&!d.derive&&!d.aliasOf&&d.source?.adapter===adapter);
