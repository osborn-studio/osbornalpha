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
