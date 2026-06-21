// 通用化 DCF 确定性引擎（generic-dcf §B）。
// 输入扁平化的 DcfAssumptions（= §A decomposition + assumptions 摊平），
// 计算 4 个现金流变体（fcff / fcffAdj 扣非 / fcfExSbc 扣 SBC / ebitda 退出倍数），
// mid-year 折现 + Gordon/退出倍数终值 + WACC×g 敏感性。纯函数，可单测。
// 数学复用 portal-v2/lib/engine/models/blth-dcf/compute.ts（mid-year df、Gordon、敏感性网格）。

export interface RevenueLine {
  name: string;
  baseRevenue: number; // t=0 的收入（单位 = currencyUnit）
  cagr: number; // 年复合增速
  note?: string;
}

export interface DcfAssumptions {
  // 收入解构
  revenueLines: RevenueLine[];
  // 成本结构（占收入比，除 taxRate 外）
  grossMarginPct: number;
  sgaPct: number;
  rdPct: number;
  sbcPct: number;
  daPct: number;
  capexPct: number;
  wcPctOfRev: number;
  taxRate: number;
  // 折现 & 终值
  wacc: number;
  terminalG: number;
  forecastYears: number;
  // 股权桥
  sharesDiluted: number;
  netDebt: number;
  exitEvEbitda: number;
  // 可选
  nonRecurring?: number[]; // 每年非经常性项（绝对值，扣非变体用）；缺省 0
  // 元信息
  currency: string;
  currencyUnit: string;
}

export interface ForecastRow {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  dWc: number;
  sbc: number;
  ebitda: number;
  fcff: number;
  fcffAdj: number;
  fcfExSbc: number;
}

export interface VariantValuation {
  ev: number;
  equity: number;
  perShare: number;
  pvExplicit: number;
  pvTerminal: number;
  terminalPctEv: number;
}

export interface SensitivityGrid {
  rowLabel: string;
  colLabel: string;
  rows: number[]; // WACC
  cols: number[]; // g
  grid: number[][]; // 每股价值
}

export interface DcfResult {
  forecast: ForecastRow[];
  valuation: {
    fcff: VariantValuation;
    ebitda: VariantValuation;
    adjusted: VariantValuation;
    exSbc: VariantValuation;
    rangePerShare: { min: number; median: number; max: number };
  };
  sensitivity: SensitivityGrid;
}

const FIRST_YEAR = new Date().getFullYear() + 1; // 预测首年 = 次年（如 2026）

/** 各收入线 cagr 的均值，用于近似 rev[-1] 基线。 */
function meanCagr(lines: RevenueLine[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((s, l) => s + (l.cagr || 0), 0) / lines.length;
}

interface YearlyCore {
  rows: ForecastRow[];
  df: number[]; // mid-year 折现因子
}

/** 逐年构建 forecast 行 + mid-year 折现因子。 */
function buildYearly(a: DcfAssumptions): YearlyCore {
  const years = Math.max(1, Math.floor(a.forecastYears));
  const rows: ForecastRow[] = [];
  const df: number[] = [];

  // §B rev[-1] 近似基线：revenue[0]/(1+均值cagr)
  const rev0 = a.revenueLines.reduce((s, l) => s + l.baseRevenue, 0);
  const gMean = meanCagr(a.revenueLines);
  const revPrevBase = gMean > -1 ? rev0 / (1 + gMean) : rev0;

  let prevRev = revPrevBase;
  for (let t = 0; t < years; t++) {
    const revenue = a.revenueLines.reduce((s, l) => s + l.baseRevenue * Math.pow(1 + l.cagr, t), 0);
    // ebit = 毛利 − 销售 − 研发（sga/rd 已含 SBC）
    const ebit = revenue * a.grossMarginPct - revenue * a.sgaPct - revenue * a.rdPct;
    const da = revenue * a.daPct;
    const ebitda = ebit + da;
    const nopat = ebit * (1 - a.taxRate);
    const capex = revenue * a.capexPct;
    const dWc = Math.max(0, revenue - prevRev) * a.wcPctOfRev;
    const sbc = revenue * a.sbcPct;
    const nonRec = a.nonRecurring?.[t] ?? 0;

    // 4 变体现金流（§B）
    const fcff = nopat + da - capex - dWc; // 标准
    const fcffAdj = (ebit - nonRec) * (1 - a.taxRate) + da - capex - dWc; // 扣非
    const fcfExSbc = fcff - sbc; // 把 SBC 当额外现金流出（保守）

    rows.push({
      year: FIRST_YEAR + t,
      revenue,
      ebit,
      nopat,
      da,
      capex,
      dWc,
      sbc,
      ebitda,
      fcff,
      fcffAdj,
      fcfExSbc,
    });
    df.push(1 / Math.pow(1 + a.wacc, t + 0.5)); // mid-year convention
    prevRev = revenue;
  }
  return { rows, df };
}

type GordonKey = "fcff" | "fcffAdj" | "fcfExSbc";

/** Gordon 永续增长终值的 FCF 类变体估值。 */
function valueGordon(a: DcfAssumptions, core: YearlyCore, key: GordonKey): VariantValuation {
  const { rows, df } = core;
  const N = rows.length;
  let pvExplicit = 0;
  for (let t = 0; t < N; t++) pvExplicit += rows[t][key] * df[t];

  const lastFcf = rows[N - 1][key];
  // Gordon：TV = FCF[N-1]×(1+g)/(wacc−g)；保护 wacc≤g 退化。
  const spread = a.wacc - a.terminalG;
  const tv = spread > 1e-9 ? (lastFcf * (1 + a.terminalG)) / spread : 0;
  const pvTerminal = tv * df[N - 1];

  return finalize(a, pvExplicit, pvTerminal);
}

/** EBITDA 退出倍数终值变体：explicit 用 ebitda 现金流口径（ebitda − ebit×tax − capex − dWc）。 */
function valueExitMultiple(a: DcfAssumptions, core: YearlyCore): VariantValuation {
  const { rows, df } = core;
  const N = rows.length;
  let pvExplicit = 0;
  for (let t = 0; t < N; t++) {
    const r = rows[t];
    const proxyFcf = r.ebitda - r.ebit * a.taxRate - r.capex - r.dWc;
    pvExplicit += proxyFcf * df[t];
  }
  const tv = a.exitEvEbitda * rows[N - 1].ebitda;
  const pvTerminal = tv * df[N - 1];
  return finalize(a, pvExplicit, pvTerminal);
}

function finalize(a: DcfAssumptions, pvExplicit: number, pvTerminal: number): VariantValuation {
  const ev = pvExplicit + pvTerminal;
  const equity = ev - a.netDebt;
  const perShare = a.sharesDiluted > 0 ? equity / a.sharesDiluted : 0;
  const terminalPctEv = ev !== 0 ? pvTerminal / ev : 0;
  return { ev, equity, perShare, pvExplicit, pvTerminal, terminalPctEv };
}

/** fcff 变体的每股价值（敏感性网格用，按 wacc/g 重算）。 */
function fcffPerShare(a: DcfAssumptions): number {
  const core = buildYearly(a);
  return valueGordon(a, core, "fcff").perShare;
}

/** §B WACC × g 敏感性（以 fcff 变体每股价值），中心格 = 基准 wacc/g。 */
function buildSensitivity(a: DcfAssumptions): SensitivityGrid {
  const step = 0.015;
  const rows = [a.wacc - 2 * step, a.wacc - step, a.wacc, a.wacc + step, a.wacc + 2 * step].map(round4);
  const gStep = 0.01;
  const cols = [a.terminalG - 2 * gStep, a.terminalG - gStep, a.terminalG, a.terminalG + gStep, a.terminalG + 2 * gStep].map(
    round4,
  );
  const grid = rows.map((w) => cols.map((g) => fcffPerShare({ ...a, wacc: w, terminalG: g })));
  return { rowLabel: "WACC", colLabel: "g", rows, cols, grid };
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

function median3(values: number[]): { min: number; median: number; max: number } {
  const sorted = [...values].sort((x, y) => x - y);
  const n = sorted.length;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { min: sorted[0], median, max: sorted[n - 1] };
}

/** §B 组合式 DCF：4 变体估值 + 区间 + 敏感性。纯函数。 */
export function computeComposite(a: DcfAssumptions): DcfResult {
  const core = buildYearly(a);

  const fcff = valueGordon(a, core, "fcff");
  const adjusted = valueGordon(a, core, "fcffAdj");
  const exSbc = valueGordon(a, core, "fcfExSbc");
  const ebitda = valueExitMultiple(a, core);

  const perShares = [fcff.perShare, ebitda.perShare, adjusted.perShare, exSbc.perShare];
  const rangePerShare = median3(perShares);

  return {
    forecast: core.rows,
    valuation: { fcff, ebitda, adjusted, exSbc, rangePerShare },
    sensitivity: buildSensitivity(a),
  };
}
