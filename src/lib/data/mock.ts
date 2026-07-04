// Mock data — used when Supabase isn't configured (guest mode) or as fallback.
// Mirrors structure of legacy-demo/assets/data/mock.json so the demo experience
// stays consistent across the migration.

import type { Market, Stance } from '../supabase/database.types';
import { currencyOfMarket } from '../utils';

export interface MockStock {
  ticker: string;
  name: string;
  market: Market;
  currency: string;
  price: number;
  change: number;
  change_pct: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  volume_value: number;
  amplitude: number;
  market_cap: string;
  pe_ttm: number;
  pb: number;
  roe: number;
  dividend_yield: number;
  high_52w: number;
  low_52w: number;
  next_earnings: string;
  sentinel_score: number;
  triggers: Array<{ rule: string; desc: string; weight: number }>;
  perspectives: Array<{
    persona: string;
    name: string;
    stance: Stance;
    confidence: number;
    summary: string;
    cites: string[];
  }>;
  news: Array<{ time: string; title: string; source: string; sentiment: number }>;
  broker_reports: Array<{
    broker: string;
    date: string;
    rating: string;
    target: string;
    target_change_pct: number;
  }>;
  financials: {
    years: number[];
    revenue: number[];
    net_income: number[];
    roe: number[];
  };
}

export const MOCK_DATA = {
  generated_at: '2026-05-15T08:30:00+08:00',
  ai_confidence: 6.2,
  ai_confidence_label: '中性偏多',
  macro: {
    sse_index: { value: 3150.4, change_pct: 0.5 },
    hsi_index: { value: 18750.2, change_pct: -0.3 },
    nasdaq: { value: 19200.8, change_pct: -0.3 },
    us_10y: { value: 4.32, change_bp: -3 },
    dxy: { value: 103.5, change_pct: -0.2 },
    north_bound: 3.8,
    south_bound: 2.2,
  },
  top5: [
    { ticker: '00700.HK', name: '腾讯控股', market: 'HK' as Market, score: 8.0, stars: 4, trigger: '财报前夜', trigger_detail: '明日 12:00 HKT 发布 Q1 2026 财报' },
    { ticker: 'NVDA',     name: '英伟达',  market: 'US' as Market, score: 7.8, stars: 4, trigger: '上调评级', trigger_detail: '高盛上调至 Buy' },
    { ticker: '002594.SZ', name: '比亚迪',  market: 'A' as Market,  score: 7.2, stars: 3, trigger: '超跌反弹', trigger_detail: 'RSI 触底' },
    { ticker: 'AAPL',     name: 'Apple',   market: 'US' as Market, score: 6.5, stars: 3, trigger: '财报临近', trigger_detail: 'T-7 高关注期' },
    { ticker: '600519.SH', name: '贵州茅台', market: 'A' as Market,  score: 6.0, stars: 3, trigger: '分红公告', trigger_detail: '拟派 ¥30.88/股' },
  ],
  watchlist_groups: [
    { id: 'long_hold',   name: '长期持有', tickers: ['00700.HK', 'AAPL', '600519.SH', 'BRK.B', 'GOOGL'] },
    { id: 'opportunity', name: '机会跟踪', tickers: ['NVDA', '002594.SZ', '09988.HK', 'MSFT', 'META', 'PDD'] },
    { id: 'watch_only',  name: '仅观察',   tickers: ['TSLA', 'COIN', 'PLTR', '688981.SH'] },
    { id: 'leopold_q4_2025', name: '🔮 Leopold Q4 2025', tickers: [
      'BE', 'CRWV', 'INTC', 'LITE', 'CORZ', 'IREN', 'APLD', 'SNDK',
      'CIFR', 'EQT', 'COHR', 'SOI', 'TSEM', 'RIOT', 'KRC', 'HUT',
      'WYFI', 'PSIX', 'BTDR', 'CLSK', 'BITF', 'LBRT', 'PUMP', 'BW',
    ]},
  ],
} as const;

// Per-stock detail. Keep stocks 0700, NVDA, AAPL, 600519, 002594 rich; rest minimal.
export const MOCK_STOCKS: Record<string, MockStock> = {
  '00700.HK': {
    ticker: '00700.HK', name: '腾讯控股', market: 'HK', currency: 'HK$',
    price: 420.40, change: 9.60, change_pct: 2.34,
    open: 411.80, high: 422.00, low: 410.20, prev_close: 410.80,
    volume_value: 1850000000, amplitude: 3.2, market_cap: '¥4.05万亿',
    pe_ttm: 18.5, pb: 3.2, roe: 22.4, dividend_yield: 0.5,
    high_52w: 445, low_52w: 280, next_earnings: '2026-05-16 12:00 HKT',
    sentinel_score: 8.0,
    triggers: [
      { rule: 'earnings_t-1', desc: '财报前夜 (T-1)', weight: 5 },
      { rule: 'north_inflow_5d', desc: '北向资金 5 日累计净流入', weight: 3 },
    ],
    perspectives: [
      { persona: 'zhang_kun', name: '张坤', stance: 'bullish', confidence: 8.5,
        summary: '游戏稳态 + 视频号广告超预期，估值已回到合理区间。一致预期 Q1 营收 ¥1,635 亿 +8.2% YoY，关键看广告能否破 ¥350 亿。',
        cites: ['Q1 2026 业绩预告', '中金 2026-05-14 研报'] },
      { persona: 'lynch', name: '彼得·林奇', stance: 'bullish', confidence: 7.0,
        summary: '微信生态像 80 年代的 Walmart——已经强大但还在扩张。月活 13.8 亿，视频号 DAU 同比 +35%。',
        cites: ['Q4 财报'] },
      { persona: 'marks', name: '霍华德·马克斯', stance: 'neutral', confidence: 5.5,
        summary: '当前价位风险/收益比适中，无急迫性。等待财报后再看。',
        cites: ['PE TTM 18.5x'] },
      { persona: 'duan_yongping', name: '段永平', stance: 'bearish', confidence: 6.0,
        summary: '监管风险未清，AI 投入回报周期长。本分哲学下，等更便宜。',
        cites: ['历史 PE 区间 12-25x'] },
    ],
    news: [
      { time: '10 分钟前', title: '中金研报：维持跑赢行业，目标价 HK$580', source: '中金', sentiment: 0.7 },
      { time: '2 小时前',  title: '宣派中期股息 HK$3.40/股', source: 'HKEX 公告', sentiment: 0.4 },
      { time: '6 小时前',  title: '微博热搜：腾讯 AI 新品发布', source: '微博', sentiment: 0.3 },
    ],
    broker_reports: [
      { broker: '中金',     date: '2026-05-14', rating: '跑赢行业', target: 'HK$580', target_change_pct: 8 },
      { broker: '高盛',     date: '2026-05-13', rating: 'Buy',      target: 'HK$560', target_change_pct: 5 },
      { broker: '摩根士丹利', date: '2026-05-10', rating: '中性',     target: 'HK$420', target_change_pct: 0 },
    ],
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      revenue: [5602, 5546, 6090, 6602, 7098],
      net_income: [1883, 1882, 1150, 1576, 1941],
      roe: [22.1, 18.5, 9.8, 13.2, 16.4],
    },
  },
  'NVDA': {
    ticker: 'NVDA', name: 'NVIDIA', market: 'US', currency: '$',
    price: 1180.50, change: 17.40, change_pct: 1.5,
    open: 1165.20, high: 1185.30, low: 1162.00, prev_close: 1163.10,
    volume_value: 25400000000, amplitude: 2.0, market_cap: '$2.9T',
    pe_ttm: 65.2, pb: 42.1, roe: 82.3, dividend_yield: 0.02,
    high_52w: 1280, low_52w: 480, next_earnings: '2026-05-22',
    sentinel_score: 7.8,
    triggers: [
      { rule: 'rating_upgrade', desc: '高盛上调至 Buy', weight: 3 },
      { rule: 'anomalous_volume', desc: '成交量 2.8x 5 日均', weight: 2 },
      { rule: 'news_positive', desc: 'GB300 出货早于预期', weight: 3 },
    ],
    perspectives: [
      { persona: 'druckenmiller', name: '德鲁肯米勒', stance: 'bullish', confidence: 8.2,
        summary: 'AI 算力需求曲线还在加速。GB300 出货早于预期 = 收入兑现提前。顺势而为。', cites: ['高盛 2026-05-14 研报'] },
      { persona: 'lynch', name: '彼得·林奇', stance: 'bullish', confidence: 7.5,
        summary: 'Tenbagger 候选——CUDA 生态护城河深，AI 工厂叙事仍在扩张早期。', cites: ['Q3 财报 CUDA 开发者 +45% YoY'] },
      { persona: 'burry', name: '迈克尔·伯里', stance: 'bearish', confidence: 7.0,
        summary: 'PE 65x 显著高于历史均值。AI Capex 周期顶部信号增多。逆向应警惕。', cites: ['Hyperscaler Capex YoY 增速放缓'] },
      { persona: 'munger', name: '芒格', stance: 'bearish', confidence: 6.5,
        summary: '在我的能力圈外。半导体周期变化太快，看不懂 5 年后的样子。', cites: [] },
      { persona: 'buffett', name: '巴菲特', stance: 'neutral', confidence: 5.0,
        summary: '估值不便宜，但护城河确实在。不动。', cites: [] },
    ],
    news: [
      { time: '1 小时前', title: '高盛上调评级至 Buy，目标 $1,250', source: 'Goldman Sachs', sentiment: 0.8 },
      { time: '4 小时前', title: 'GB300 出货早于预期', source: 'Bloomberg', sentiment: 0.7 },
      { time: '1 天前',  title: '分析师下调 NPS 预期', source: 'Reuters', sentiment: -0.4 },
    ],
    broker_reports: [
      { broker: '高盛',         date: '2026-05-14', rating: 'Buy',        target: '$1,250', target_change_pct: 5.9 },
      { broker: '摩根士丹利',   date: '2026-05-12', rating: 'Overweight', target: '$1,300', target_change_pct: 10.1 },
    ],
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      revenue: [269, 270, 609, 1305, 2200],
      net_income: [97, 44, 297, 730, 1080],
      roe: [44.8, 18.6, 91.4, 115.3, 82.3],
    },
  },
  'AAPL': {
    ticker: 'AAPL', name: 'Apple', market: 'US', currency: '$',
    price: 215.20, change: -0.86, change_pct: -0.4,
    open: 216.50, high: 217.10, low: 214.30, prev_close: 216.06,
    volume_value: 8200000000, amplitude: 1.3, market_cap: '$3.3T',
    pe_ttm: 28.4, pb: 45.2, roe: 156.8, dividend_yield: 0.5,
    high_52w: 235, low_52w: 165, next_earnings: '2026-05-22',
    sentinel_score: 6.5,
    triggers: [
      { rule: 'earnings_t-7', desc: '财报临近 (T-7)', weight: 3 },
      { rule: 'news_neutral', desc: 'AI 战略发布会预热', weight: 2 },
    ],
    perspectives: [
      { persona: 'buffett', name: '巴菲特', stance: 'bullish', confidence: 8.0,
        summary: '护城河顶级，现金流惊人，回购+分红双引擎。长期持有。', cites: ['Q4 自由现金流 $984 亿'] },
      { persona: 'marks', name: '霍华德·马克斯', stance: 'neutral', confidence: 5.5,
        summary: '估值合理但不便宜。等待 AI 战略给出明确叙事。', cites: ['PE TTM 28.4x vs 5 年均值 24x'] },
    ],
    news: [{ time: '3 小时前', title: 'Apple Intelligence 中国合作伙伴敲定', source: 'Bloomberg', sentiment: 0.5 }],
    broker_reports: [],
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      revenue: [3658, 3943, 3832, 3912, 4035],
      net_income: [947, 998, 970, 989, 1052],
      roe: [147.4, 175.5, 156.1, 152.8, 156.8],
    },
  },
  '600519.SH': {
    ticker: '600519.SH', name: '贵州茅台', market: 'A', currency: '¥',
    price: 1580.00, change: 12.50, change_pct: 0.80,
    open: 1572.00, high: 1585.00, low: 1568.00, prev_close: 1567.50,
    volume_value: 1850000000, amplitude: 1.1, market_cap: '¥1.98万亿',
    pe_ttm: 22.4, pb: 8.2, roe: 33.2, dividend_yield: 2.0,
    high_52w: 1820, low_52w: 1380, next_earnings: '2026-08-15',
    sentinel_score: 6.0,
    triggers: [{ rule: 'dividend_announcement', desc: '分红公告：拟派 ¥30.88/股', weight: 3 }],
    perspectives: [
      { persona: 'zhang_kun', name: '张坤', stance: 'bullish', confidence: 8.0,
        summary: '消费升级长期叙事不变。当前 PE 处于历史 30 分位，分红率提升给安全边际。', cites: ['分红公告'] },
      { persona: 'li_lu', name: '李录', stance: 'bullish', confidence: 7.5,
        summary: '护城河无可替代。安全边际充足。', cites: [] },
    ],
    news: [{ time: '30 分钟前', title: '拟派现 ¥30.88/股，特别分红来袭', source: '上交所', sentiment: 0.6 }],
    broker_reports: [],
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      revenue: [1095, 1276, 1505, 1709, 1900],
      net_income: [525, 627, 747, 838, 920],
      roe: [29.9, 31.1, 34.2, 34.7, 33.2],
    },
  },
  '002594.SZ': {
    ticker: '002594.SZ', name: '比亚迪', market: 'A', currency: '¥',
    price: 285.50, change: 6.20, change_pct: 2.22,
    open: 280.00, high: 288.00, low: 279.50, prev_close: 279.30,
    volume_value: 5200000000, amplitude: 3.0, market_cap: '¥8,310亿',
    pe_ttm: 22.5, pb: 4.8, roe: 24.5, dividend_yield: 0.8,
    high_52w: 330, low_52w: 220, next_earnings: '2026-08-28',
    sentinel_score: 7.2,
    triggers: [
      { rule: 'anomalous_volume', desc: '成交量 2.5x 5 日均', weight: 2 },
      { rule: 'oversold_bounce', desc: 'RSI 触底反弹', weight: 2 },
    ],
    perspectives: [
      { persona: 'druckenmiller', name: '德鲁肯米勒', stance: 'bullish', confidence: 7.0,
        summary: '出海叙事 + 新车型 + 自研芯片，多重利好叠加。', cites: ['4 月销量 41 万辆 +18% YoY'] },
    ],
    news: [],
    broker_reports: [],
    financials: {
      years: [2021, 2022, 2023, 2024, 2025],
      revenue: [2161, 4241, 6023, 7775, 9200],
      net_income: [30, 166, 300, 402, 510],
      roe: [3.7, 14.0, 21.6, 26.0, 24.5],
    },
  },
};

// Lightweight fallback for non-detail tickers.
// Lookup order: full mock → curated universe → browser-side custom registry → null.
export function getStockOrStub(ticker: string): MockStock | null {
  if (MOCK_STOCKS[ticker]) return MOCK_STOCKS[ticker];

  // Try the curated 30-stock universe first (synchronous, server-safe)
  const universe = MOCK_UNIVERSE.find((u) => u.t === ticker);
  if (universe) return makeStubFromUniverse(universe.t, universe.n, universe.m);

  // Fallback: client-side custom registry (added via search)
  if (typeof window !== 'undefined') {
    try {
      // Inline lookup to avoid circular import; mirrors custom-stocks.ts logic
      const raw = window.localStorage.getItem('stock-monitor:custom-stocks:v1');
      if (raw) {
        const map = JSON.parse(raw) as Record<string, { t: string; n: string; m: Market }>;
        const c = map[ticker];
        if (c) return makeStubFromUniverse(c.t, c.n, c.m);
      }
    } catch {}
  }

  return null;
}

function makeStubFromUniverse(ticker: string, name: string, market: Market): MockStock {
  return {
    ticker, name, market,
    currency: currencyOfMarket(market),
    price: 0, change: 0, change_pct: 0, open: 0, high: 0, low: 0, prev_close: 0,
    volume_value: 0, amplitude: 0, market_cap: '—',
    pe_ttm: 0, pb: 0, roe: 0, dividend_yield: 0,
    high_52w: 0, low_52w: 0, next_earnings: '—',
    sentinel_score: 0, triggers: [], perspectives: [], news: [], broker_reports: [],
    financials: { years: [], revenue: [], net_income: [], roe: [] },
  };
}

export interface UniverseRow { t: string; n: string; py: string; m: Market }

export const MOCK_UNIVERSE: UniverseRow[] = [
  { t: '00700.HK', n: '腾讯控股', py: 'TXKG', m: 'HK' },
  { t: '09988.HK', n: '阿里巴巴', py: 'ALBB', m: 'HK' },
  { t: '03690.HK', n: '美团', py: 'MT', m: 'HK' },
  { t: '01024.HK', n: '快手', py: 'KS', m: 'HK' },
  { t: '01810.HK', n: '小米集团', py: 'XMJT', m: 'HK' },
  { t: '02318.HK', n: '中国平安', py: 'ZGPA', m: 'HK' },
  { t: '00939.HK', n: '建设银行', py: 'JSYH', m: 'HK' },
  { t: 'AAPL', n: 'Apple', py: 'AAPL', m: 'US' },
  { t: 'NVDA', n: 'NVIDIA', py: 'NVDA', m: 'US' },
  { t: 'MSFT', n: '微软', py: 'MSFT', m: 'US' },
  { t: 'GOOGL', n: 'Alphabet', py: 'ABC', m: 'US' },
  { t: 'META', n: 'Meta', py: 'META', m: 'US' },
  { t: 'AMZN', n: '亚马逊', py: 'YMX', m: 'US' },
  { t: 'TSLA', n: '特斯拉', py: 'TSL', m: 'US' },
  { t: 'BRK.B', n: 'Berkshire B', py: 'BKB', m: 'US' },
  { t: 'PDD', n: '拼多多', py: 'PDD', m: 'US' },
  { t: 'BABA', n: '阿里巴巴 ADR', py: 'BABA', m: 'US' },
  { t: 'BIDU', n: '百度', py: 'BD', m: 'US' },
  { t: 'COIN', n: 'Coinbase', py: 'COIN', m: 'US' },
  { t: 'PLTR', n: 'Palantir', py: 'PLTR', m: 'US' },
  { t: '600519.SH', n: '贵州茅台', py: 'GZMT', m: 'A' },
  { t: '002594.SZ', n: '比亚迪', py: 'BYD', m: 'A' },
  { t: '000333.SZ', n: '美的集团', py: 'MDJT', m: 'A' },
  { t: '300750.SZ', n: '宁德时代', py: 'NDSD', m: 'A' },
  { t: '688981.SH', n: '中芯国际', py: 'ZXGJ', m: 'A' },
  { t: '600036.SH', n: '招商银行', py: 'ZSYH', m: 'A' },
  { t: '601318.SH', n: '中国平安', py: 'ZGPA', m: 'A' },
  { t: '002475.SZ', n: '立讯精密', py: 'LXJM', m: 'A' },
  { t: '000858.SZ', n: '五粮液', py: 'WLY', m: 'A' },
  { t: '600276.SH', n: '恒瑞医药', py: 'HRYY', m: 'A' },
  // Leopold Q4 2025 持仓 (Situational Awareness LP 13F)
  { t: 'BE', n: 'Bloom Energy', py: 'BE', m: 'US' },
  { t: 'CRWV', n: 'CoreWeave', py: 'CRWV', m: 'US' },
  { t: 'INTC', n: 'Intel', py: 'INTC', m: 'US' },
  { t: 'LITE', n: 'Lumentum', py: 'LITE', m: 'US' },
  { t: 'CORZ', n: 'Core Scientific', py: 'CORZ', m: 'US' },
  { t: 'IREN', n: 'IREN Limited', py: 'IREN', m: 'US' },
  { t: 'APLD', n: 'Applied Digital', py: 'APLD', m: 'US' },
  { t: 'SNDK', n: 'SanDisk', py: 'SNDK', m: 'US' },
  { t: 'CIFR', n: 'Cipher Mining', py: 'CIFR', m: 'US' },
  { t: 'EQT', n: 'EQT Corp', py: 'EQT', m: 'US' },
  { t: 'COHR', n: 'Coherent Corp', py: 'COHR', m: 'US' },
  { t: 'SOI', n: 'Solaris Energy', py: 'SOI', m: 'US' },
  { t: 'TSEM', n: 'Tower Semiconductor', py: 'TSEM', m: 'US' },
  { t: 'RIOT', n: 'Riot Platforms', py: 'RIOT', m: 'US' },
  { t: 'KRC', n: 'Kilroy Realty', py: 'KRC', m: 'US' },
  { t: 'HUT', n: 'Hut 8 Corp', py: 'HUT', m: 'US' },
  { t: 'WYFI', n: 'WhiteFiber', py: 'WYFI', m: 'US' },
  { t: 'PSIX', n: 'Power Solutions', py: 'PSIX', m: 'US' },
  { t: 'BTDR', n: 'Bitdeer Technologies', py: 'BTDR', m: 'US' },
  { t: 'CLSK', n: 'CleanSpark', py: 'CLSK', m: 'US' },
  { t: 'BITF', n: 'Bitfarms', py: 'BITF', m: 'US' },
  { t: 'LBRT', n: 'Liberty Energy', py: 'LBRT', m: 'US' },
  { t: 'PUMP', n: 'ProPetro Holding', py: 'PUMP', m: 'US' },
  { t: 'BW', n: 'Babcock & Wilcox', py: 'BW', m: 'US' },
];
