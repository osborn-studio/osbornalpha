/**
 * Evidence-confidence classifier — heuristically rates the trustworthiness
 * of cite strings produced by LLM personas in the AI committee.
 *
 * Inspired by:
 *   - zer0quant/Financial-Query-Search evidence/merge.py
 *     (confidence per source_type: financial_data 0.95, filing 0.90,
 *      web_page 0.80, web_search 0.60)
 *   - anthropics/financial-services comps-analysis SKILL.md
 *     ("CRITICAL Data Source Priority: MCP > Bloomberg/EDGAR > NEVER
 *      web search as primary source for numbers")
 *
 * Use case: render visual trust indicators next to each cite in
 * PerspectiveCard so users can tell "this is from Tushare 5-year financials"
 * vs "this is vague AI hand-wave".
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface ConfidenceVerdict {
  level: ConfidenceLevel;
  score: number;          // 0..1
  kind: string;           // human-readable category (e.g. "财报数据")
  emoji: string;          // visual indicator
}

interface Pattern {
  regex: RegExp;
  level: ConfidenceLevel;
  score: number;
  kind: string;
}

// Ordered: most specific first. classifyCite uses first match.
const PATTERNS: Pattern[] = [
  // ─── HIGH (structured financial data, official filings) ─────────────
  { regex: /Tushare|daily_basic|fina_indicator|income\b|balancesheet/i, level: 'high', score: 0.95, kind: 'Tushare 财务数据' },
  { regex: /EDGAR|10-K|10-Q|8-K|13F|13D|13G/i, level: 'high', score: 0.95, kind: 'SEC 文件' },
  { regex: /(上交所|深交所|HKEX|港交所).*公告|公告.*(上交所|深交所|HKEX|港交所)/i, level: 'high', score: 0.92, kind: '交易所公告' },
  { regex: /(年报|季报|Q[1-4]|半年报|中报)\s*\d{4}|(\d{4})\s*(年报|季报|Q[1-4]|半年报|中报)/i, level: 'high', score: 0.90, kind: '财报' },
  { regex: /\b(PE|PB|PS|EPS|ROE|ROA|EV\/EBITDA)\b/i, level: 'high', score: 0.88, kind: '估值指标' },
  { regex: /(毛利率|净利率|股息率|总市值|流通市值|free cash flow|自由现金流)/, level: 'high', score: 0.88, kind: '财务比率' },
  { regex: /(营收|净利|净利润|营业收入|revenue|net income|gross profit)\s*[¥$HK\d]/i, level: 'high', score: 0.86, kind: '财务数据' },
  { regex: /(分红|派息|送股|股东|大股东|十大股东|质押)/, level: 'high', score: 0.85, kind: '股东数据' },

  // ─── MEDIUM (timestamped quotes, broker reports, ratings) ───────────
  { regex: /(中金|高盛|大摩|摩根士丹利|瑞银|UBS|JPM|高华|海通|国泰君安).*目标价|.*研报/, level: 'medium', score: 0.78, kind: '券商研报' },
  { regex: /目标价|评级.*(买入|增持|减持|卖出|Buy|Sell|Overweight|Underweight)/i, level: 'medium', score: 0.75, kind: '评级目标价' },
  { regex: /(财联社|路透|彭博|Reuters|Bloomberg|金融时报|FT|华尔街日报|WSJ)/i, level: 'medium', score: 0.75, kind: '专业新闻' },
  { regex: /\b(2026|2025|2024|2023)-\d{1,2}(-\d{1,2})?\b/, level: 'medium', score: 0.72, kind: '带日期来源' },
  { regex: /(同比|YoY|环比|QoQ)\s*[+\-]?\d/i, level: 'medium', score: 0.72, kind: '同比/环比' },
  { regex: /(K\s*线|MA\s*\d|RSI|MACD|布林|成交量|换手率|振幅)/, level: 'medium', score: 0.70, kind: '技术指标' },
  { regex: /(FRED|CPI|GDP|PMI|联邦基金|10Y|国债收益率|treasury yield)/i, level: 'medium', score: 0.70, kind: '宏观数据' },
  { regex: /(指引|guidance|展望|outlook|forecast)/i, level: 'medium', score: 0.68, kind: '公司指引' },

  // ─── LOW (informal news, social, vague references) ───────────────────
  { regex: /(微博|热搜|知乎|雪球|股吧|论坛|社区|抖音|快手|小红书)/, level: 'low', score: 0.45, kind: '社媒/社区' },
  { regex: /(传闻|据悉|有消息|有传言|消息称|sources said)/i, level: 'low', score: 0.40, kind: '未证实消息' },
  { regex: /(近期|最近|过去|recent|recently|过往)\s*(事件|动态|发展|news)/i, level: 'low', score: 0.40, kind: '模糊时间' },
  { regex: /(共识|consensus|市场普遍|大多认为)/i, level: 'low', score: 0.40, kind: '泛"共识"' },
  { regex: /(预期|预计|estimate|expect)(?!.*\d)/i, level: 'low', score: 0.38, kind: '无数字预期' },
];

/**
 * Classify a single cite string into one of 4 confidence levels.
 * Returns 'unknown' if no patterns match (often means LLM cited nothing concrete).
 */
export function classifyCite(cite: string): ConfidenceVerdict {
  const text = (cite || '').trim();
  if (text.length < 2) {
    return { level: 'unknown', score: 0.1, kind: '无引用', emoji: '○' };
  }
  for (const p of PATTERNS) {
    if (p.regex.test(text)) {
      return {
        level: p.level,
        score: p.score,
        kind: p.kind,
        emoji: p.level === 'high' ? '●' : p.level === 'medium' ? '◐' : '○',
      };
    }
  }
  // Fall-through: text exists but no pattern matched — treat as unknown
  return { level: 'unknown', score: 0.30, kind: '未分类', emoji: '○' };
}

/**
 * Aggregate confidence over a list of cites.
 * Returns:
 *   - score: weighted average (higher cites weight more)
 *   - level: aggregate level
 *   - distribution: how many cites of each level
 */
export interface AggregateConfidence {
  score: number;
  level: ConfidenceLevel;
  cite_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  unknown_count: number;
  /** Human-readable label like "强证据" / "弱证据" */
  label: string;
}

export function aggregateConfidence(cites: string[]): AggregateConfidence {
  if (cites.length === 0) {
    return {
      score: 0,
      level: 'unknown',
      cite_count: 0,
      high_count: 0, medium_count: 0, low_count: 0, unknown_count: 0,
      label: '无引用',
    };
  }
  const verdicts = cites.map(classifyCite);
  const high = verdicts.filter((v) => v.level === 'high').length;
  const medium = verdicts.filter((v) => v.level === 'medium').length;
  const low = verdicts.filter((v) => v.level === 'low').length;
  const unknown = verdicts.filter((v) => v.level === 'unknown').length;
  const avg = verdicts.reduce((s, v) => s + v.score, 0) / verdicts.length;

  // Apply a "count bonus": more cites = more confident
  const countBoost = Math.min(0.15, cites.length * 0.025);
  const finalScore = Math.min(1, avg + countBoost);

  let level: ConfidenceLevel;
  let label: string;
  if (finalScore >= 0.80) { level = 'high';    label = '强证据'; }
  else if (finalScore >= 0.60) { level = 'medium'; label = '中等证据'; }
  else if (finalScore >= 0.35) { level = 'low'; label = '弱证据'; }
  else { level = 'unknown'; label = '证据不足'; }

  return {
    score: Number(finalScore.toFixed(2)),
    level,
    cite_count: cites.length,
    high_count: high, medium_count: medium, low_count: low, unknown_count: unknown,
    label,
  };
}
