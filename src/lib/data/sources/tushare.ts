/**
 * Tushare Pro HTTP API client.
 *
 * Endpoint: https://api.tushare.pro
 * Auth:     POST body includes `token` (env var TUSHARE_TOKEN)
 *
 * Coverage: A-share deep data (income, balance sheet, shareholders, etc).
 * For real-time / HK / US, use Eastmoney instead.
 *
 * Set env var on Vercel:
 *   TUSHARE_TOKEN=your_token_here
 *
 * Free Pro tier (120 积分) supports basic endpoints. 5000 积分 (¥4500/year)
 * unlocks daily, daily_basic, fina_indicator with high quota.
 */

export const TUSHARE_ENDPOINT = 'https://api.tushare.pro';

export function isTushareConfigured(): boolean {
  return Boolean(process.env.TUSHARE_TOKEN);
}

interface TushareResp<T = any> {
  request_id: string;
  code: number;
  msg: string;
  data: {
    fields: string[];
    items: any[][];
    has_more: boolean;
  } | null;
}

export class TushareError extends Error {
  constructor(public code: number, msg: string) { super(msg); }
}

/**
 * Low-level call. Returns array of row-objects (fields → values).
 */
export async function tushareCall<T = Record<string, any>>(
  api_name: string,
  params: Record<string, any>,
  fields: string,
  timeoutMs = 8000
): Promise<T[]> {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) throw new TushareError(-1, 'TUSHARE_TOKEN not configured');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(TUSHARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_name, token, params, fields }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new TushareError(resp.status, `HTTP ${resp.status}`);
  const json: TushareResp = await resp.json();
  if (json.code !== 0) throw new TushareError(json.code, json.msg || 'Tushare error');
  if (!json.data) return [];

  return json.data.items.map((row) => {
    const obj: Record<string, any> = {};
    json.data!.fields.forEach((f, i) => (obj[f] = row[i]));
    return obj as T;
  });
}

// ─── Normalize ticker for Tushare ───
// Tushare uses "002624.SZ", "600519.SH", same as our canonical format.
// Just ensure uppercase suffix.
export function normalizeTushareTicker(ticker: string): string | null {
  const m = ticker.toUpperCase().match(/^(\d{6})\.(SH|SZ|BJ)$/);
  return m ? `${m[1]}.${m[2]}` : null;
}

// ─── Convenience wrappers ───

export interface TushareDaily {
  ts_code: string;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  pre_close: number;
  change: number;
  pct_chg: number;
  vol: number;
  amount: number;
}

/** Most-recent N daily bars. */
export async function fetchTushareDaily(ticker: string, limit = 1): Promise<TushareDaily[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  return tushareCall<TushareDaily>(
    'daily',
    { ts_code, limit },
    'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'
  );
}

export interface TushareDailyBasic {
  ts_code: string;
  trade_date: string;
  close: number;
  turnover_rate: number;
  pe: number;
  pe_ttm: number;
  pb: number;
  ps: number;
  ps_ttm: number;
  total_mv: number;        // 万元
  circ_mv: number;
  dv_ratio: number;        // 股息率
}

export async function fetchTushareDailyBasic(ticker: string): Promise<TushareDailyBasic | null> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return null;
  const rows = await tushareCall<TushareDailyBasic>(
    'daily_basic',
    { ts_code, limit: 1 },
    'ts_code,trade_date,close,turnover_rate,pe,pe_ttm,pb,ps,ps_ttm,total_mv,circ_mv,dv_ratio'
  );
  return rows[0] || null;
}

export interface TushareIndicator {
  ts_code: string;
  end_date: string;
  roe: number;             // %
  roe_dt: number;
  grossprofit_margin: number;
  netprofit_margin: number;
  current_ratio: number;
}

/** Most recent fina_indicator (financial indicator) row. */
export async function fetchTushareFinaIndicator(ticker: string): Promise<TushareIndicator | null> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return null;
  const rows = await tushareCall<TushareIndicator>(
    'fina_indicator',
    { ts_code, period: '' },
    'ts_code,end_date,roe,roe_dt,grossprofit_margin,netprofit_margin,current_ratio'
  );
  return rows[0] || null;
}

export interface TushareIncome {
  ts_code: string;
  end_date: string;
  total_revenue: number;
  revenue: number;
  n_income: number;
  basic_eps: number;
  diluted_eps: number;
}

/** Recent income statements (default 5 years annual). */
export async function fetchTushareIncome(ticker: string, limit = 5): Promise<TushareIncome[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  // report_type=1 合并报表, fetch more rows then filter to annual (period ending 1231)
  const rows = await tushareCall<TushareIncome>(
    'income',
    { ts_code, report_type: 1, limit: 40 },
    'ts_code,end_date,total_revenue,revenue,n_income,basic_eps,diluted_eps'
  );
  const annual = rows.filter((r) => String(r.end_date).endsWith('1231'));
  return annual.slice(0, limit);
}

export interface TushareBalance {
  ts_code: string;
  end_date: string;
  total_assets: number;
  total_liab: number;
  total_hldr_eqy_inc_min_int: number;
  total_share: number;
  money_cap: number;
}

/** Recent balance sheets (default 5 years annual). */
export async function fetchTushareBalance(ticker: string, limit = 5): Promise<TushareBalance[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const rows = await tushareCall<TushareBalance>(
    'balancesheet',
    { ts_code, report_type: 1, limit: 40 },
    'ts_code,end_date,total_assets,total_liab,total_hldr_eqy_inc_min_int,total_share,money_cap'
  );
  const annual = rows.filter((r) => String(r.end_date).endsWith('1231'));
  return annual.slice(0, limit);
}

export interface TushareCashflow {
  ts_code: string;
  end_date: string;
  n_cashflow_act: number;       // 经营活动产生的现金流量净额
  n_cashflow_inv_act: number;
  n_cash_flows_fnc_act: number;
  free_cashflow: number;
}

export async function fetchTushareCashflow(ticker: string, limit = 5): Promise<TushareCashflow[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const rows = await tushareCall<TushareCashflow>(
    'cashflow',
    { ts_code, report_type: 1, limit: 40 },
    'ts_code,end_date,n_cashflow_act,n_cashflow_inv_act,n_cash_flows_fnc_act,free_cashflow'
  );
  const annual = rows.filter((r) => String(r.end_date).endsWith('1231'));
  return annual.slice(0, limit);
}

export interface TushareHolder {
  ts_code: string;
  ann_date: string;
  end_date: string;
  holder_name: string;
  hold_amount: number;       // 持股数量 (股)
  hold_ratio: number;        // 持股比例 (%)
  hold_change?: number;
}

/** Top 10 shareholders for most recent period. */
export async function fetchTushareTopHolders(ticker: string): Promise<TushareHolder[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  // Fetch latest period's holders. Use a wide date range.
  const today = new Date();
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareHolder>(
    'top10_holders',
    { ts_code, start_date: start, end_date: end },
    'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio'
  );
  if (rows.length === 0) return [];
  // Get most recent end_date and return its 10 holders
  const latestPeriod = rows.reduce((max, r) => (r.end_date > max ? r.end_date : max), '');
  return rows
    .filter((r) => r.end_date === latestPeriod)
    .sort((a, b) => (b.hold_ratio || 0) - (a.hold_ratio || 0))
    .slice(0, 10);
}

/** Top 10 floating (流通) shareholders. */
export async function fetchTushareFloatHolders(ticker: string): Promise<TushareHolder[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
    .toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareHolder>(
    'top10_floatholders',
    { ts_code, start_date: start, end_date: end },
    'ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio'
  );
  if (rows.length === 0) return [];
  const latestPeriod = rows.reduce((max, r) => (r.end_date > max ? r.end_date : max), '');
  return rows
    .filter((r) => r.end_date === latestPeriod)
    .sort((a, b) => (b.hold_ratio || 0) - (a.hold_ratio || 0))
    .slice(0, 10);
}

// ─── 5000-积分 endpoints (unlocked at 5000 tier) ──────────────────────────

/**
 * @deprecated `hk_hold` is 港股通持股 (SOUTHBOUND — mainland investors holding
 * HK stocks). It returns HK tickers with exchange="HK", not A-share northbound
 * holdings. Use `fetchTushareNorthboundTop10` instead for per-A-share northbound
 * activity. Kept here in case future southbound HK signals are added.
 */
export interface TushareHkHold {
  code: string;
  trade_date: string;
  name: string;
  vol: number;
  ratio: number;
  exchange: string;        // 'HK' (always — this is southbound)
}

/** @deprecated See above. Returns SOUTHBOUND data, not northbound. */
export async function fetchTushareHkHold(ticker: string, days = 25): Promise<TushareHkHold[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const calendarDays = Math.ceil(days * 1.6);
  const start = new Date(today.getTime() - calendarDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareHkHold>(
    'hk_hold',
    { ts_code, start_date: start, end_date: end },
    'code,trade_date,name,vol,ratio,exchange'
  );
  return rows.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
}

/** 沪深股通十大成交股 — top 10 northbound A-shares per day. */
export interface TushareNorthboundTop10 {
  ts_code: string;
  trade_date: string;
  name: string;
  close: number;
  change: number;
  rank: number;            // 1-10 within that day's top 10
  amount: number;          // 成交金额 (元)
  net_amount: number | null;  // 净成交 (often null at 5k tier)
  buy: number | null;
  sell: number | null;
  market_type?: number;    // 1=沪股通 3=深股通
}

/**
 * Returns the days within the past N calendar days when this A-share appeared
 * in the daily 沪深股通十大成交股 list (top 10 northbound by traded amount).
 * Empty array means the ticker did not crack the top 10 in that window.
 *
 * Signal interpretation:
 *   - Frequent appearance (≥5 in 30d) → strong northbound interest
 *   - Latest rank ≤3 → very active today
 *
 * Note: net_amount / buy / sell are often null at 5000-积分 tier; we rely
 * on `amount` (total traded) and `rank` for the signal math.
 */
export async function fetchTushareNorthboundTop10(ticker: string, days = 30): Promise<TushareNorthboundTop10[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const calendarDays = Math.ceil(days * 1.6);
  const start = new Date(today.getTime() - calendarDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareNorthboundTop10>(
    'hsgt_top10',
    { ts_code, start_date: start, end_date: end },
    'ts_code,trade_date,name,close,change,rank,amount,net_amount,buy,sell,market_type'
  );
  return rows.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
}

/** 涨跌停统计 — limit-up / limit-down history for one ticker. */
export interface TushareLimitListItem {
  trade_date: string;
  ts_code: string;
  name: string;
  close: number;
  pct_chg: number;
  amount: number;          // 成交金额 (元)
  limit_amount?: number;   // 板上成交额
  float_mv?: number;       // 流通市值
  total_mv?: number;       // 总市值
  turnover_ratio?: number;
  fd_amount?: number;      // 封单金额
  first_time?: string;     // 首次封板时间 HH:MM:SS
  last_time?: string;      // 最后封板时间
  open_times?: number;     // 开板次数
  up_stat?: string;        // 涨停统计 "5/10" → 近5天/近10天涨停次数
  limit_times?: number;    // n 连板
  limit?: 'U' | 'D' | 'Z'; // U=涨停 D=跌停 Z=炸板
}

/**
 * Returns recent limit events (涨停 / 跌停 / 炸板) for one A-share.
 * Used to compute "n 连板" or "今日涨停" signals.
 */
export async function fetchTushareLimitList(ticker: string, days = 30): Promise<TushareLimitListItem[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const calendarDays = Math.ceil(days * 1.6);
  const start = new Date(today.getTime() - calendarDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareLimitListItem>(
    'limit_list_d',
    { ts_code, start_date: start, end_date: end },
    'trade_date,ts_code,name,close,pct_chg,amount,limit_amount,float_mv,total_mv,turnover_ratio,fd_amount,first_time,last_time,open_times,up_stat,limit_times,limit'
  );
  return rows.sort((a, b) => b.trade_date.localeCompare(a.trade_date));
}

/** 公告 — daily disclosure announcements for one A-share. */
export interface TushareAnnouncement {
  ts_code: string;
  ann_date: string;        // YYYYMMDD
  title: string;
  url?: string;
  rec_time?: string;
}

/**
 * Returns recent disclosure announcements. Used for event-driven signals
 * (dividend, buyback, earnings guidance, etc).
 *
 * Note: `anns_d` requires 5000 积分.
 */
export async function fetchTushareAnnouncements(ticker: string, days = 30): Promise<TushareAnnouncement[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareAnnouncement>(
    'anns_d',
    { ts_code, start_date: start, end_date: end },
    'ts_code,ann_date,title,url,rec_time'
  );
  return rows.sort((a, b) => b.ann_date.localeCompare(a.ann_date));
}

// ─── Event calendar endpoints (Tushare 2000+ 积分) ────────────────────────

/** 财报披露计划 — forward-looking earnings date schedule. */
export interface TushareDisclosureDate {
  ts_code: string;
  ann_date: string;          // YYYYMMDD — when the schedule was announced
  end_date: string;          // YYYYMMDD — reporting period end (e.g. 20260630)
  pre_date?: string | null;  // YYYYMMDD — previously planned date
  actual_date?: string | null;
  modify_date?: string | null;
}

/**
 * Returns earnings disclosure schedule rows. Used to compute "earnings T-7"
 * triggers. `end_date` is the *reporting period* end; the actual announcement
 * date is in `actual_date` (once known) or `pre_date` (plan).
 */
export async function fetchTushareDisclosureDate(ticker: string): Promise<TushareDisclosureDate[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const rows = await tushareCall<TushareDisclosureDate>(
    'disclosure_date',
    { ts_code },
    'ts_code,ann_date,end_date,pre_date,actual_date,modify_date'
  );
  // Newest reporting period first
  return rows.sort((a, b) => b.end_date.localeCompare(a.end_date));
}

/** 业绩预告 — forward earnings guidance ("Q2 net profit +30% YoY"). */
export interface TushareForecast {
  ts_code: string;
  ann_date: string;             // YYYYMMDD — when guidance was issued
  end_date: string;             // YYYYMMDD — reporting period end
  type?: string | null;         // 预增 / 预减 / 预亏 / 扭亏 / 略增 / 略减 / 续亏 / 续盈
  p_change_min?: number | null; // % change low end
  p_change_max?: number | null; // % change high end
  net_profit_min?: number | null; // 万元 low end
  net_profit_max?: number | null;
  last_parent_net?: number | null;
  first_ann_date?: string | null;
  summary?: string | null;
  change_reason?: string | null;
}

export async function fetchTushareForecast(ticker: string, days = 90): Promise<TushareForecast[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const start = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const end = today.toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareForecast>(
    'forecast',
    { ts_code, start_date: start, end_date: end },
    'ts_code,ann_date,end_date,type,p_change_min,p_change_max,net_profit_min,net_profit_max,last_parent_net,first_ann_date,summary,change_reason'
  );
  return rows.sort((a, b) => b.ann_date.localeCompare(a.ann_date));
}

/** 分红送股 — dividend / split events. */
export interface TushareDividend {
  ts_code: string;
  end_date: string;          // YYYYMMDD — reporting period
  ann_date: string;          // YYYYMMDD — announcement
  div_proc?: string | null;  // 进度: 预案 / 股东大会通过 / 实施
  stk_div?: number | null;   // 每股送转
  cash_div?: number | null;  // 每股派现 (税前)
  cash_div_tax?: number | null;
  record_date?: string | null;
  ex_date?: string | null;   // YYYYMMDD — ex-dividend date (the actionable one)
  pay_date?: string | null;
  div_listdate?: string | null;
  imp_ann_date?: string | null;
}

export async function fetchTushareDividend(ticker: string): Promise<TushareDividend[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const rows = await tushareCall<TushareDividend>(
    'dividend',
    { ts_code },
    'ts_code,end_date,ann_date,div_proc,stk_div,cash_div,cash_div_tax,record_date,ex_date,pay_date,div_listdate,imp_ann_date'
  );
  // Newest first by ann_date
  return rows.sort((a, b) => b.ann_date.localeCompare(a.ann_date));
}

/** 限售股解禁 — forward-looking share unlock schedule. */
export interface TushareShareFloat {
  ts_code: string;
  ann_date: string;          // YYYYMMDD
  float_date: string;        // YYYYMMDD — the day shares unlock
  float_share: number;       // 流通股数 (万股) — units vary by Tushare doc revision
  float_ratio?: number | null;
  holder_name?: string | null;
  share_type?: string | null;
}

export async function fetchTushareShareFloat(ticker: string, days_ahead = 180): Promise<TushareShareFloat[]> {
  const ts_code = normalizeTushareTicker(ticker);
  if (!ts_code) return [];
  const today = new Date();
  const start = today.toISOString().slice(0, 10).replace(/-/g, '');
  const end = new Date(today.getTime() + days_ahead * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  const rows = await tushareCall<TushareShareFloat>(
    'share_float',
    { ts_code, start_date: start, end_date: end },
    'ts_code,ann_date,float_date,float_share,float_ratio,holder_name,share_type'
  );
  // Soonest unlock first
  return rows.sort((a, b) => a.float_date.localeCompare(b.float_date));
}
