/**
 * WP-E4 four-arm observation report (plan §7.2, §10.1 ③). Pure over ledger decisions joined
 * to the latest S6 evaluation of the observation each decision produced. Facts only: no model
 * commentary, no advice. Means use resolved windows only; the `averaged` arm is derived by
 * pairing human_baseline and ai_candidate results for the same thesis-week (a contrast baseline).
 */
import { DECISION_ARMS, type DecisionArm } from '../s4/ledger';

export interface ArmWindowResult { price_return: number; benchmark_price_return: number; benchmark_difference: number; max_drawdown: number; benchmark: string; currency: string }
export interface ArmWindow { trading_sessions: number; status: string; result: ArmWindowResult | null }
export interface ArmEvaluation { status: string; windows: ArmWindow[] }
export interface ArmRow { decision_id: string; thesis_id: string; week_of: string; arm: DecisionArm; action: string; observation_id: string | null; evaluation: ArmEvaluation | null }

export interface WindowStats { n: number; resolved: number; open: number; pending_start: number; data_insufficient: number; mean_price_return: number | null; mean_benchmark_difference: number | null; mean_max_drawdown: number | null }
export interface ArmStats { decisions: number; with_observation: number; evaluated: number; pairs: number; windows: Record<string, WindowStats> }
export interface ArmSummary { arms: Record<DecisionArm, ArmStats>; not_computed: string[]; note: string }

const NOT_COMPUTED = ['deflated_sharpe', 'cost', 'sector_benchmark', 'hit_rate'];
const round = (v: number) => Math.round(v * 1e10) / 1e10;
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function emptyArm(): ArmStats { return { decisions: 0, with_observation: 0, evaluated: 0, pairs: 0, windows: {} }; }
function windowStats(results: Array<{ status: string; result: ArmWindowResult | null }>): WindowStats {
  const resolved = results.filter(w => w.status === 'resolved' && w.result).map(w => w.result!);
  return {
    n: results.length, resolved: resolved.length,
    open: results.filter(w => w.status === 'open').length,
    pending_start: results.filter(w => w.status === 'pending_start').length,
    data_insufficient: results.filter(w => w.status === 'data_insufficient').length,
    mean_price_return: mean(resolved.map(r => r.price_return)),
    mean_benchmark_difference: mean(resolved.map(r => r.benchmark_difference)),
    mean_max_drawdown: mean(resolved.map(r => r.max_drawdown)),
  };
}
function groupWindows(evaluations: ArmEvaluation[]): Record<string, WindowStats> {
  const byWindow = new Map<number, Array<{ status: string; result: ArmWindowResult | null }>>();
  for (const e of evaluations) for (const w of e.windows) (byWindow.get(w.trading_sessions) ?? byWindow.set(w.trading_sessions, []).get(w.trading_sessions)!).push({ status: w.status, result: w.result });
  return Object.fromEntries([...byWindow.entries()].sort(([a], [b]) => a - b).map(([k, v]) => [String(k), windowStats(v)]));
}

export function summarizeArms(rows: ArmRow[]): ArmSummary {
  const arms = Object.fromEntries(DECISION_ARMS.map(a => [a, emptyArm()])) as Record<DecisionArm, ArmStats>;
  const evaluations: Record<DecisionArm, ArmEvaluation[]> = { human_baseline: [], ai_candidate: [], collab: [], averaged: [] };
  for (const r of rows) {
    if (!(r.arm in arms)) continue;
    const a = arms[r.arm];
    a.decisions++;
    if (r.observation_id) a.with_observation++;
    if (r.evaluation) { a.evaluated++; evaluations[r.arm].push(r.evaluation); }
  }
  for (const arm of DECISION_ARMS) arms[arm].windows = groupWindows(evaluations[arm]);
  // Derived averaged arm: pair human_baseline × ai_candidate by thesis-week; average each window both resolved.
  const key = (r: ArmRow) => `${r.thesis_id}|${r.week_of}`;
  const baseline = new Map<string, ArmRow>(), candidate = new Map<string, ArmRow>();
  for (const r of rows) {
    if (!r.evaluation) continue;
    if (r.arm === 'human_baseline' && !baseline.has(key(r))) baseline.set(key(r), r);
    if (r.arm === 'ai_candidate' && !candidate.has(key(r))) candidate.set(key(r), r);
  }
  const paired: ArmEvaluation[] = [];
  for (const [k, h] of baseline) {
    const c = candidate.get(k); if (!c) continue;
    const windows: ArmWindow[] = [];
    for (const hw of h.evaluation!.windows) {
      const cw = c.evaluation!.windows.find(w => w.trading_sessions === hw.trading_sessions); if (!cw) continue;
      if (hw.status === 'resolved' && cw.status === 'resolved' && hw.result && cw.result) {
        windows.push({ trading_sessions: hw.trading_sessions, status: 'resolved', result: {
          price_return: round((hw.result.price_return + cw.result.price_return) / 2), benchmark_price_return: round((hw.result.benchmark_price_return + cw.result.benchmark_price_return) / 2),
          benchmark_difference: round((hw.result.benchmark_difference + cw.result.benchmark_difference) / 2), max_drawdown: round((hw.result.max_drawdown + cw.result.max_drawdown) / 2),
          benchmark: hw.result.benchmark, currency: hw.result.currency } });
      }
    }
    // A thesis-week counts as a pair only when at least one window resolved on both arms.
    if (windows.length) paired.push({ status: 'resolved', windows });
  }
  arms.averaged.pairs = paired.length;
  arms.averaged.windows = groupWindows(paired);
  return { arms, not_computed: [...NOT_COMPUTED], note: '事实区：均值只含 resolved 窗口；averaged 臂为 human_baseline 与 ai_candidate 同 thesis-week 结果的简单平均，仅作对照基线。无模型解释。' };
}

export function renderArmMarkdown(s: ArmSummary): string {
  const f = (v: number | null) => (v === null ? '—' : v.toFixed(4));
  const lines = ['| arm | decisions | with obs. | evaluated | window | n | resolved | open | pending | insufficient | mean return | mean vs SPY | mean MDD |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const arm of DECISION_ARMS) {
    const a = s.arms[arm]; const windows = Object.entries(a.windows);
    const head = `| ${arm}${arm === 'averaged' ? ` (pairs ${a.pairs})` : ''} | ${a.decisions} | ${a.with_observation} | ${a.evaluated} |`;
    if (!windows.length) { lines.push(`${head} — | 0 | 0 | 0 | 0 | 0 | — | — | — |`); continue; }
    for (const [w, st] of windows) lines.push(`${head} ${w} | ${st.n} | ${st.resolved} | ${st.open} | ${st.pending_start} | ${st.data_insufficient} | ${f(st.mean_price_return)} | ${f(st.mean_benchmark_difference)} | ${f(st.mean_max_drawdown)} |`);
  }
  lines.push('', s.note, `not_computed: ${s.not_computed.join(', ')}`);
  return lines.join('\n');
}
