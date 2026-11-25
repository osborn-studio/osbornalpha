import type { Market } from '@/lib/supabase/database.types';
import type { KlineAdjustment } from '@/lib/data/kline/types';

export type SourceId = 'eastmoney' | 'sina' | 'tencent' | 'twse' | 'tpex' | 'eodhd'
  | 'datagateway' | 'tushare' | 'sec' | 'cninfo' | 'hkexnews' | 'fred' | 'akshare'
  | 'openfigi' | 'gleif' | 'hkex' | 'nasdaq' | 'sp-global' | 'nbs' | 'chinabond'
  | 'safe' | 'pboc' | 'cfets' | 'federalreserve' | 'opm';
export type DataDomain = 'quote' | 'kline_intraday' | 'kline_daily' | 'kline_weekly_monthly'
  | 'financial_facts' | 'filings' | 'documents' | 'entity_identifiers' | 'security_master'
  | 'industry_classification' | 'industry_marks' | 'macro_series' | 'filing_calendar' | 'company_snapshot';

type CatalogMarket = Market | 'CN'; // Macro regions use CN, equity routes use A.
export interface Capability {
  domain: DataDomain;
  markets: readonly CatalogMarket[];
  adjustments?: readonly KlineAdjustment[];
  bars?: 'ohlcv' | 'close_only';
  role: 'primary_or_fallback' | 'fallback_only';
  dataClass: 'A' | 'B' | 'C';
}
export interface SourceEntry {
  id: SourceId;
  name: { zh: string; en: string };
  aliases: readonly string[];
  hosts: readonly string[];
  credentials: readonly string[];
  pacing: { minIntervalMs: number; scope: 'process' } | null;
  licence: {
    place: 'industry_dataset_licenses' | 'methodologies_licenses_json' | 'macro_catalog_rights' | 'none';
    keys: readonly string[];
  };
  capabilities: readonly Capability[];
}

const equity: readonly Market[] = ['A', 'HK', 'US'];
const markets: readonly Market[] = [...equity, 'TW', 'JP', 'KR'];
const defaults = {
  aliases: [], credentials: [], pacing: null, licence: { place: 'none', keys: [] },
} as const;
const pace = (minIntervalMs: number) => ({ minIntervalMs, scope: 'process' } as const);
const capability = (domain: DataDomain, markets: readonly CatalogMarket[], dataClass: Capability['dataClass'] = 'B'): Capability =>
  ({ domain, markets, dataClass, role: 'primary_or_fallback' });
const quote = (markets: readonly Market[]) => capability('quote', markets, 'A');
const intraday: Capability = {
  ...capability('kline_intraday', equity, 'A'), adjustments: ['intraday'], bars: 'ohlcv',
};
// Weekly and monthly routes can aggregate a provider's daily bars.
function history(markets: readonly Market[], adjustments: readonly KlineAdjustment[], bars: Capability['bars'] = 'ohlcv'): Capability[] {
  return (['kline_daily', 'kline_weekly_monthly'] as const).map(domain => ({
    ...capability(domain, markets, 'A'), adjustments, bars,
    role: bars === 'close_only' ? 'fallback_only' : 'primary_or_fallback',
  }));
}

const nbsSeries = ['CN_CPI_INDEX', 'CN_CPI_YOY', 'CN_PPI_INDEX', 'CN_PPI_YOY', 'CN_PMI_MFG',
  'CN_GDP_INDEX', 'CN_GDP_YOY', 'CN_M2_YOY', 'CN_EXPORT_YOY'];
const bondSeries = ['CN_CGB_10Y_D', 'CN_CGB_10Y', 'CN_CGB10Y'];
const safeSeries = ['CN_USDCNY_CP_D', 'CN_USDCNY_CP'];
const rights = (keys: readonly string[]) => ({ place: 'macro_catalog_rights', keys } as const);
const cnMacro = [capability('macro_series', ['CN'])];

export const SOURCE_CATALOG: readonly SourceEntry[] = [
  {
    ...defaults, id: 'eastmoney', name: { zh: '东方财富', en: 'Eastmoney' },
    hosts: ['push2delay.eastmoney.com', 'push2his.eastmoney.com', 'searchapi.eastmoney.com',
      'quote.eastmoney.com', 'www.eastmoney.com'],
    licence: { place: 'methodologies_licenses_json', keys: ['price_bar×eastmoney', 'legacy_fill×eastmoney'] },
    capabilities: [quote(equity), intraday, ...history(['A', 'HK'], ['qfq', 'hfq', 'none']),
      ...history(['US'], ['none']), capability('security_master', equity, 'A')],
  },
  {
    ...defaults, id: 'sina', name: { zh: '新浪财经', en: 'Sina Finance' },
    hosts: ['hq.sinajs.cn', 'finance.sina.com.cn', 'quotes.sina.cn', 'stock.finance.sina.com.cn'],
    capabilities: [quote(equity), { ...intraday, markets: ['A'] }, ...history(['US'], ['none'])],
  },
  {
    ...defaults, id: 'tencent', name: { zh: '腾讯财经', en: 'Tencent Finance' },
    hosts: ['qt.gtimg.cn', 'gu.qq.com', 'web.ifzq.gtimg.cn', 'stockapp.finance.qq.com'],
    capabilities: [quote(equity), ...history(['A'], ['qfq']), ...history(['HK', 'US'], ['none'])],
  },
  {
    ...defaults, id: 'twse', name: { zh: '台湾证券交易所', en: 'Taiwan Stock Exchange' },
    hosts: ['mis.twse.com.tw', 'openapi.twse.com.tw', 'www.twse.com.tw'], pacing: pace(120),
    capabilities: [quote(['TW']), ...history(['TW'], ['none']), capability('security_master', ['TW'])],
  },
  {
    ...defaults, id: 'tpex', name: { zh: '证券柜台买卖中心', en: 'Taipei Exchange' },
    hosts: ['www.tpex.org.tw'], pacing: pace(120), capabilities: history(['TW'], ['none']),
  },
  {
    ...defaults, id: 'eodhd', name: { zh: 'EODHD 行情', en: 'EODHD' },
    hosts: ['eodhd.com'], credentials: ['EODHD_API_TOKEN'], capabilities: [quote(['JP', 'KR'])],
  },
  {
    ...defaults, id: 'datagateway', name: { zh: '万得数据网关', en: 'DataGateway / Wind' },
    aliases: ['datagateway-wind'], hosts: [], // Deployment supplies DATAGATEWAY_BASE_URL.
    credentials: ['DATAGATEWAY_API_KEY'],
    licence: { place: 'methodologies_licenses_json', keys: ['price_bar×datagateway'] },
    capabilities: [quote(markets), intraday, ...history(['A', 'HK'], ['qfq', 'none'], 'close_only'),
      ...history(['US', 'TW', 'JP', 'KR'], ['none'], 'close_only')],
  },
  {
    ...defaults, id: 'tushare', name: { zh: 'Tushare 金融大数据', en: 'Tushare' },
    aliases: ['tushare_stock_basic', 'tushare_hk_basic', 'tushare:stock_basic',
      'tushare:index_member_all', 'tushare:daily_basic', 'tushare:sw_daily'],
    hosts: ['api.tushare.pro'], credentials: ['TUSHARE_TOKEN'], pacing: pace(400),
    licence: { place: 'industry_dataset_licenses', keys: ['scheme:sw2021:2021', 'marks:tushare-daily_basic', 'official:tushare-sw_daily'] },
    capabilities: [capability('financial_facts', ['A']), capability('filings', ['A']), capability('filing_calendar', ['A']),
      capability('security_master', ['A', 'HK']), capability('industry_classification', ['A']),
      capability('industry_marks', ['A']), capability('company_snapshot', ['A'], 'A'),
      { ...capability('kline_daily', ['A'], 'A'), bars: 'ohlcv', adjustments: ['none'] }],
  },
  {
    ...defaults, id: 'sec', name: { zh: '美国证券交易委员会', en: 'SEC EDGAR' },
    aliases: ['edgar', 'sec_submissions', 'sec:submissions', 'sec_company_tickers_exchange'], hosts: ['data.sec.gov', 'www.sec.gov'],
    credentials: ['EDGAR_USER_AGENT'], pacing: pace(150),
    licence: { place: 'methodologies_licenses_json', keys: ['financial_fact×edgar', 'financial_metric×edgar'] },
    capabilities: [capability('financial_facts', ['US']), capability('filings', ['US']), capability('documents', ['US']),
      capability('entity_identifiers', ['US']), capability('security_master', ['US']),
      capability('industry_classification', ['US']), capability('filing_calendar', ['US'])],
  },
  {
    ...defaults, id: 'cninfo', name: { zh: '巨潮资讯', en: 'CNINFO' },
    aliases: ['cninfo_topsearch'], hosts: ['www.cninfo.com.cn', 'static.cninfo.com.cn'],
    pacing: pace(600), // Entity org-ID lookups wait 600 ms, filing clients 500 ms.
    capabilities: [capability('filings', ['A']), capability('documents', ['A']), capability('entity_identifiers', ['A'])],
  },
  {
    ...defaults, id: 'hkexnews', name: { zh: '披露易', en: 'HKEXnews' }, hosts: ['www1.hkexnews.hk'], pacing: pace(1000),
    capabilities: [capability('filings', ['HK']), capability('documents', ['HK']), capability('financial_facts', ['HK'])],
  },
  {
    ...defaults, id: 'openfigi', name: { zh: 'OpenFIGI 标识映射', en: 'OpenFIGI' },
    hosts: ['api.openfigi.com'], credentials: ['OPENFIGI_API_KEY'], pacing: pace(3000),
    capabilities: [capability('entity_identifiers', equity)],
  },
  {
    ...defaults, id: 'gleif', name: { zh: '全球法人识别编码基金会', en: 'GLEIF' },
    hosts: ['mapping.gleif.org'], capabilities: [capability('entity_identifiers', equity)],
  },
  {
    ...defaults, id: 'hkex', name: { zh: '香港交易所', en: 'Hong Kong Exchanges and Clearing' },
    aliases: ['hkex_list_of_securities', 'hkex_isin_hkex', 'hkex_isin_other_agencies', 'hkex_list_name_match'],
    hosts: ['www.hkex.com.hk'], capabilities: [capability('entity_identifiers', ['HK']), capability('security_master', ['HK'])],
  },
  {
    ...defaults, id: 'nasdaq', name: { zh: '纳斯达克', en: 'Nasdaq' }, hosts: ['api.nasdaq.com', 'www.nasdaqtrader.com'],
    capabilities: [capability('security_master', ['US'])],
  },
  {
    ...defaults, id: 'sp-global', name: { zh: '标普全球', en: 'S&P Global' }, hosts: ['www.spglobal.com'],
    capabilities: [capability('security_master', ['US'])],
  },
  {
    ...defaults, id: 'fred', name: { zh: '圣路易斯联储经济数据', en: 'FRED' }, aliases: ['fred_csv'],
    hosts: ['fred.stlouisfed.org'], capabilities: [capability('macro_series', ['US'])],
    licence: rights(['US_FEDFUNDS_EFF_D', 'US_DFF', 'US_FED_TARGET_UPPER_D', 'US_FED_TARGET_LOWER_D',
      'US_FED_TARGET_D', 'US_DGS10_D', 'US_DGS10', 'US_DTWEXBGS_D', 'US_DTWEXBGS', 'US_CPI_INDEX',
      'US_CPI_YOY', 'US_UNRATE', 'US_PPI_FD_INDEX', 'US_PPI_FD_YOY', 'US_VIX_D', 'US_VIX',
      'US_WTI_D', 'US_WTI', 'US_UST10Y', 'US_SP500', 'US_NASDAQCOM', 'US_DJIA']),
  },
  {
    ...defaults, id: 'akshare', name: { zh: 'AKShare 宏观数据接口', en: 'AKShare' },
    hosts: [], // Local relay library. Its upstream hosts are listed under their publishers.
    licence: rights([...nbsSeries, ...bondSeries, ...safeSeries, 'CN_CSI300']), capabilities: cnMacro,
  },
  {
    ...defaults, id: 'nbs', name: { zh: '国家统计局', en: 'National Bureau of Statistics' },
    hosts: ['data.stats.gov.cn'], licence: rights(nbsSeries), capabilities: cnMacro,
  },
  {
    ...defaults, id: 'chinabond', name: { zh: '中债', en: 'ChinaBond' }, hosts: ['yield.chinabond.com.cn'],
    licence: rights(bondSeries), capabilities: cnMacro,
  },
  {
    ...defaults, id: 'safe', name: { zh: '国家外汇管理局', en: 'State Administration of Foreign Exchange' },
    hosts: ['www.safe.gov.cn'], licence: rights(safeSeries), capabilities: cnMacro,
  },
  {
    ...defaults, id: 'pboc', name: { zh: '中国人民银行', en: "People's Bank of China" },
    hosts: ['www.pbc.gov.cn'], capabilities: cnMacro,
  },
  {
    ...defaults, id: 'cfets', name: { zh: '中国外汇交易中心', en: 'China Foreign Exchange Trade System' },
    hosts: ['www.chinamoney.org.cn'], capabilities: cnMacro,
  },
  {
    ...defaults, id: 'federalreserve', name: { zh: '美国联邦储备委员会', en: 'Federal Reserve Board' },
    hosts: ['www.federalreserve.gov'], capabilities: [capability('macro_series', ['US'])],
  },
  {
    ...defaults, id: 'opm', name: { zh: '美国人事管理局', en: 'Office of Personnel Management' },
    hosts: ['www.opm.gov'], capabilities: [capability('filing_calendar', ['US'])],
  },
];

export function sourceByName(name: string): SourceEntry | null {
  return SOURCE_CATALOG.find(source => source.id === name || source.aliases.includes(name)) ?? null;
}

export function capabilityFor(source: string, domain: DataDomain, market: CatalogMarket, adjustment?: KlineAdjustment): Capability | null {
  return sourceByName(source)?.capabilities.find(cap => cap.domain === domain && cap.markets.includes(market)
    && (adjustment === undefined || cap.adjustments?.includes(adjustment))) ?? null;
}

export function checkRoute(route: {
  domain: DataDomain; market: CatalogMarket; adjustment?: KlineAdjustment; sources: readonly string[]; soleSourceAllowed?: boolean;
}): string[] {
  const problems: string[] = [];
  for (const [index, name] of route.sources.entries()) {
    const cap = capabilityFor(name, route.domain, route.market, route.adjustment);
    if (!cap) problems.push(`${sourceByName(name) ? 'no_capability' : 'unknown_source'}:${name}`);
    else if (index === 0 && cap.role === 'fallback_only' && !(route.soleSourceAllowed && route.sources.length === 1)) {
      problems.push(`fallback_only_first:${name}`);
    }
  }
  return problems;
}
