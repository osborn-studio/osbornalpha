/**
 * C1 calibration refit (§6.2 末段, §10.1 class ①, §10.2, §10.3): isotonic fits per question,
 * important-material recall, false-support rate, cross-fitted ECE, threshold proposals and
 * stop/switch verdicts. Pure over ReportRow; the script writes a dated artifact.
 */
import { calibrationScore, isCorrect, type ReportRow, summarize } from './report';

export interface IsotonicPoint { score: number; hit: number }
export interface IsotonicSegment { x_min: number; x_max: number; p: number }
export interface IsotonicFit { segments: IsotonicSegment[] }

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Pool-adjacent-violators regression of hit rate on score; adjacent equal-p blocks are merged. */
export function isotonicFit(points: IsotonicPoint[]): IsotonicFit {
  // Equal scores are pooled into one weighted block first, so the fit cannot depend on input order.
  const byScore = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.score)) continue;
    const b = byScore.get(p.score) ?? { sum: 0, n: 0 };
    b.sum += p.hit; b.n += 1; byScore.set(p.score, b);
  }
  const sorted = [...byScore.entries()].sort((a, b) => a[0] - b[0]);
  const blocks: { sum: number; n: number; x_min: number; x_max: number }[] = [];
  for (const [score, agg] of sorted) {
    blocks.push({ sum: agg.sum, n: agg.n, x_min: score, x_max: score });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]!, prev = blocks[blocks.length - 2]!;
      if (prev.sum / prev.n <= last.sum / last.n) break;
      blocks.splice(blocks.length - 2, 2, { sum: prev.sum + last.sum, n: prev.n + last.n, x_min: prev.x_min, x_max: last.x_max });
    }
  }
  const segments: IsotonicSegment[] = [];
  for (const b of blocks) {
    const p = round6(b.sum / b.n);
    const last = segments[segments.length - 1];
    if (last && last.p === p) last.x_max = b.x_max;
    else segments.push({ x_min: b.x_min, x_max: b.x_max, p });
  }
  return { segments };
}

/** Calibrated probability: segment value inside a segment, linear between segments, clamped outside. */
export function applyIsotonic(fit: IsotonicFit, score: number): number | null {
  const s = fit.segments;
  if (s.length === 0) return null;
  if (score <= s[0]!.x_min) return s[0]!.p;
  if (score >= s[s.length - 1]!.x_max) return s[s.length - 1]!.p;
  for (let i = 0; i < s.length; i++) {
    const seg = s[i]!;
    if (score >= seg.x_min && score <= seg.x_max) return seg.p;
    const next = s[i + 1];
    if (next && score > seg.x_max && score < next.x_min) {
      const t = (score - seg.x_max) / (next.x_min - seg.x_max);
      return round6(seg.p + t * (next.p - seg.p));
    }
  }
  return s[s.length - 1]!.p;
}

/** Wilson 95% score interval. */
export function wilson(k: number, n: number): { low: number | null; high: number | null } {
  if (n <= 0) return { low: null, high: null };
  const z = 1.959964, p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { low: round6(Math.max(0, centre - half)), high: round6(Math.min(1, centre + half)) };
}

export const MIN_LABELS = 30;
const FOLDS = 5;

const MATERIAL_LEVEL = new Set(['Q3']);
/** Material-level questions are asked once per source: keep one judgment per (source, backend, question). */
export function dedupeMaterialLevel(rows: ReportRow[]): ReportRow[] {
  const seen = new Set<string>();
  return rows.filter(r => {
    if (!MATERIAL_LEVEL.has(r.question_id)) return true;
    const k = `${r.source_id}|${r.backend}|${r.question_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function scoredPoints(rows: ReportRow[]): IsotonicPoint[] {
  const out: IsotonicPoint[] = [];
  for (const r of rows) {
    if (r.label === null || r.abstained) continue;
    const score = calibrationScore(r);
    if (score == null) continue;
    const isNoul = r.confidence == null && (typeof r.distribution?.true === 'number' || typeof r.distribution?.false === 'number');
    out.push({ score, hit: isNoul ? (r.label === 'true' ? 1 : 0) : isCorrect(r) ? 1 : 0 });
  }
  return out;
}

function eceOfPoints(points: IsotonicPoint[]): number | null {
  if (points.length === 0) return null;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, hit: 0 }));
  for (const p of points) { const b = bins[Math.min(9, Math.floor(p.score * 10))]!; b.n++; b.conf += p.score; b.hit += p.hit; }
  return round6(bins.reduce((acc, b) => (b.n === 0 ? acc : acc + (b.n / points.length) * Math.abs(b.hit / b.n - b.conf / b.n)), 0));
}

/** ECE before and after isotonic calibration; `after` is 5-fold cross-fitted (folds by row order). */
export function crossFittedEce(rows: ReportRow[]): { before: number | null; after: number | null; labeled: number } {
  const points = scoredPoints(dedupeMaterialLevel(rows));
  const before = eceOfPoints(points);
  if (points.length < MIN_LABELS) return { before, after: null, labeled: points.length };
  const calibrated: IsotonicPoint[] = [];
  for (let fold = 0; fold < FOLDS; fold++) {
    const fit = isotonicFit(points.filter((_, i) => i % FOLDS !== fold));
    for (const [i, p] of points.entries()) {
      if (i % FOLDS !== fold) continue;
      const score = applyIsotonic(fit, p.score);
      if (score !== null) calibrated.push({ score, hit: p.hit });
    }
  }
  return { before, after: eceOfPoints(calibrated), labeled: points.length };
}

export { summarize };

// ---------------------------------------------------------------------------
// §10.1 class ① metrics per backend
// ---------------------------------------------------------------------------
import { QUESTION_IDS, THRESHOLDS, type QuestionId } from './questions';

export interface Rate { k: number; n: number; rate: number | null; low: number | null; high: number | null }
export interface QuestionMetrics {
  question_id: string; n: number; labeled: number;
  /** Labeled rows that were actually decided (not abstained): the accuracy denominator. */
  decided: number; accuracy: number | null; abstain_rate: number;
  ece_before: number | null; ece_after: number | null; p50_latency_ms: number | null; p95_latency_ms: number | null; cost_micros_per_1k: number;
}
export interface BackendMetrics { backend: string; backend_model?: string | null; labels: number; important_recall: Rate; false_support: Rate; questions: QuestionMetrics[] }

const rate = (k: number, n: number): Rate => ({ k, n, rate: n === 0 ? null : round6(k / n), ...wilson(k, n) });

export function classMetrics(rows: ReportRow[]): BackendMetrics[] {
  const backends = [...new Set(rows.map(r => r.backend))].sort();
  const summary = summarize(rows);
  return backends.map(backend => {
    const mine = rows.filter(r => r.backend === backend);
    const q1True = mine.filter(r => r.question_id === 'Q1' && r.label === 'true');
    const q2Decided = mine.filter(r => r.question_id === 'Q2' && r.label !== null && !r.abstained);
    const questions = summary.filter(m => m.backend === backend).map(m => {
      const qRows = dedupeMaterialLevel(mine.filter(r => r.question_id === m.question_id));
      const e = crossFittedEce(qRows);
      return { question_id: m.question_id, n: m.n, labeled: m.labeled, decided: qRows.filter(r => r.label !== null && !r.abstained).length, accuracy: m.accuracy, abstain_rate: round6(m.abstain_rate),
        ece_before: e.before, ece_after: e.after, p50_latency_ms: m.p50_latency_ms, p95_latency_ms: m.p95_latency_ms, cost_micros_per_1k: m.cost_micros_per_1k };
    });
    const models = [...new Set(mine.map(r => r.backend_model ?? null))];
    return {
      backend, backend_model: models.length === 1 ? models[0] : null, labels: dedupeMaterialLevel(mine).filter(r => r.label !== null).length,
      important_recall: rate(q1True.filter(r => !r.abstained && r.selected === 'true').length, q1True.length),
      false_support: rate(q2Decided.filter(r => r.selected === 'support' && r.label !== 'support').length, q2Decided.length),
      questions,
    };
  });
}

// ---------------------------------------------------------------------------
// Threshold proposals (§6.1 reset after labelling, §10.2 targets)
// ---------------------------------------------------------------------------
export interface ThresholdProposal {
  question_id: QuestionId; backend_used: string | null; labeled: number;
  status: 'proposed' | 'infeasible' | 'insufficient_labels';
  current: Record<string, number | string>; proposed: Record<string, number> | null; metrics: Record<string, number | null>;
}
const grid = (from: number, to: number, step: number) => { const out: number[] = []; for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100); return out; };
/** P(true) of a noul row; a false-only distribution implies its complement, like decide(). */
const pTrue = (r: ReportRow): number | null => {
  if (typeof r.distribution?.true === 'number') return r.distribution.true;
  if (typeof r.distribution?.false === 'number') return 1 - r.distribution.false;
  return null;
};
const argmax = (d: Record<string, number>) => Object.entries(d).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

/**
 * Whether a follow-up row's gate is open once the Q1 proposal is applied: its Q1 P(true) must clear
 * the proposed `relevant_above`. Without a Q1 proposal or a recorded Q1 score, the historical gate stands.
 */
const gateOpenUnder = (r: ReportRow, q1: { relevant_above: number } | null): boolean => {
  if (q1 && typeof r.gate_p_true === 'number') return r.gate_p_true > q1.relevant_above;
  return r.gate_open !== false;
};

export function proposeThresholds(rows: ReportRow[]): ThresholdProposal[] {
  const jev = rows.filter(r => r.backend === 'jev');
  const pool = jev.length > 0 ? jev : rows;
  const backendUsed = jev.length > 0 ? 'jev' : rows.length ? 'all' : null;
  // Q1 first: its proposal re-gates the follow-ups, so their metrics describe the thresholds applied together.
  let q1Proposed: { relevant_above: number } | null = null;
  const ordered = [...QUESTION_IDS].sort((a, b) => (a === 'Q1' ? -1 : b === 'Q1' ? 1 : 0));
  const byQuestion = new Map<QuestionId, ThresholdProposal>();
  for (const q of ordered) {
    const proposal = proposeOne(q);
    if (q === 'Q1' && proposal.proposed && typeof proposal.proposed.relevant_above === 'number') q1Proposed = { relevant_above: proposal.proposed.relevant_above };
    byQuestion.set(q, proposal);
  }
  return QUESTION_IDS.map(q => byQuestion.get(q)!);

  function proposeOne(q: QuestionId): ThresholdProposal {
    const labeled = dedupeMaterialLevel(pool).filter(r => r.question_id === q && r.label !== null);
    const current = { ...(THRESHOLDS as Record<string, Record<string, number | string>>)[q] } as Record<string, number | string>;
    const base = { question_id: q, backend_used: backendUsed, labeled: labeled.length, current };
    if (q === 'Q1') {
      // Rows without a usable score are unavoidable abstentions: misses for recall, abstentions for the rate.
      const all = labeled.map(r => ({ p: pTrue(r), t: r.label === 'true' }));
      const pts = all.filter((x): x is { p: number; t: boolean } => x.p !== null);
      const unscored = all.length - pts.length, unscoredRelevant = all.filter(x => x.p === null && x.t).length;
      if (pts.length < MIN_LABELS) return { ...base, status: 'insufficient_labels', proposed: null, metrics: {} };
      const relevant = pts.filter(x => x.t).length + unscoredRelevant;
      let best: { lo: number; hi: number; recall: number; abstain: number; precision: number; feasible: boolean } | null = null;
      // Full range: decide() accepts any pair with lo < hi, so miscalibrated but separable scores can be refitted.
      for (const hi of grid(0.05, 0.95, 0.05)) for (const lo of grid(0.05, 0.95, 0.05)) {
        if (lo >= hi) continue;
        const sel = pts.filter(x => x.p > hi), abst = pts.filter(x => x.p >= lo && x.p <= hi);
        const recall = relevant ? sel.filter(x => x.t).length / relevant : 0, abstain = (abst.length + unscored) / all.length;
        const precision = sel.length ? sel.filter(x => x.t).length / sel.length : 0;
        const feasible = recall >= 0.9 && abstain <= 0.3;
        const cand = { lo, hi, recall, abstain, precision, feasible };
        const better = !best ? true : feasible !== best.feasible ? feasible
          : feasible ? (precision > best.precision || (precision === best.precision && (hi > best.hi || (hi === best.hi && lo > best.lo))))
          : (recall > best.recall || (recall === best.recall && abstain < best.abstain));
        if (better) best = cand;
      }
      if (!best) return { ...base, status: 'infeasible', proposed: null, metrics: {} };
      return { ...base, status: best.feasible ? 'proposed' : 'infeasible', proposed: best.feasible ? { irrelevant_below: best.lo, relevant_above: best.hi } : null,
        metrics: { recall: round6(best.recall), abstain_rate: round6(best.abstain), precision: round6(best.precision) } };
    }
    if (q === 'Q5') {
      // Q5 is thesis-gated too: rows closed under the proposed Q1 gate are abstentions at every threshold.
      const open = labeled.filter(r => gateOpenUnder(r, q1Proposed));
      const gated = labeled.length - open.length;
      const pts = open.map(r => ({ p: pTrue(r), t: r.label === 'true' })).filter((x): x is { p: number; t: boolean } => x.p !== null);
      if (pts.length < MIN_LABELS) return { ...base, status: 'insufficient_labels', proposed: null, metrics: {} };
      const abstainRate = (labeled.length - pts.length) / labeled.length;
      let best: { t: number; acc: number } | null = null;
      for (const t of grid(0.2, 0.8, 0.05)) { const acc = pts.filter(x => (x.p >= t) === x.t).length / labeled.length; if (!best || acc > best.acc) best = { t, acc }; }
      return { ...base, status: abstainRate <= 0.3 ? 'proposed' : 'infeasible', proposed: abstainRate <= 0.3 ? { retelling_below: best!.t } : null, metrics: { accuracy: round6(best!.acc), abstain_rate: round6(abstainRate), gated_by_proposed_q1: gated } };
    }
    // Choice questions: a minimum confidence.
    // Rows closed by the relevance gate (Q1 said "not relevant") can never be decided by this
    // question's threshold: they count as unavoidable abstentions, like score-less rows.
    // The gate is evaluated under the proposed Q1 thresholds, so the proposals describe one runtime.
    const openRows = labeled.filter(r => gateOpenUnder(r, q1Proposed));
    const gated = labeled.length - openRows.length;
    const pts = openRows.map(r => ({ c: r.confidence, sel: argmax(r.distribution ?? {}) ?? r.selected, label: r.label as string })).filter((x): x is { c: number; sel: string; label: string } => typeof x.c === 'number');
    if (pts.length < MIN_LABELS) return { ...base, status: 'insufficient_labels', proposed: null, metrics: {} };
    const unscored = labeled.length - pts.length;
    if (q === 'Q2') {
      let best: { t: number; coverage: number; fs: number; acc: number; feasible: boolean } | null = null;
      for (const t of grid(0.3, 0.95, 0.05)) {
        const decided = pts.filter(x => x.c >= t);
        // Score-less abstentions can never be decided, so they lower coverage at every threshold.
        const coverage = decided.length / (pts.length + unscored);
        const fs = decided.length ? decided.filter(x => x.sel === 'support' && x.label !== 'support').length / decided.length : 0;
        const acc = decided.length ? decided.filter(x => x.sel === x.label).length / decided.length : 0;
        const feasible = fs <= 0.05;
        const cand = { t, coverage, fs, acc, feasible };
        // Ties keep the higher threshold: same observed coverage, less exposure to unseen scores.
        const better = !best ? true : feasible !== best.feasible ? feasible : coverage > best.coverage || (coverage === best.coverage && t > best.t);
        if (better) best = cand;
      }
      if (!best) return { ...base, status: 'infeasible', proposed: null, metrics: {} };
      return { ...base, status: best.feasible ? 'proposed' : 'infeasible', proposed: best.feasible ? { min_confidence: best.t } : null,
        metrics: { coverage: round6(best.coverage), false_support_rate: round6(best.fs), accuracy: round6(best.acc), gated_by_proposed_q1: gated } };
    }
    // Q3/Q4 never abstain at runtime: below the threshold `decide()` answers the fallback option,
    // so the evaluated classifier is "argmax above t, fallback below t" and accuracy covers every row.
    const fallback = String((THRESHOLDS as Record<string, Record<string, unknown>>)[q]?.fallback ?? '');
    // Score-less rows (missing or invalid answers) are unavoidable abstentions at every threshold.
    const abstainRate = labeled.length ? unscored / labeled.length : 0;
    const feasible = abstainRate <= 0.3;
    let bestQ: { t: number; acc: number; fallback_rate: number } | null = null;
    for (const t of grid(0.3, 0.95, 0.05)) {
      const predicted = pts.map(x => (x.c >= t ? x.sel : fallback));
      const acc = labeled.length ? predicted.filter((p, i) => p === pts[i]!.label).length / labeled.length : 0;
      const fallbackRate = pts.length ? pts.filter(x => x.c < t).length / pts.length : 0;
      const better = !bestQ ? true : acc > bestQ.acc || (acc === bestQ.acc && fallbackRate < bestQ.fallback_rate);
      if (better) bestQ = { t, acc, fallback_rate: fallbackRate };
    }
    if (!bestQ) return { ...base, status: 'infeasible', proposed: null, metrics: {} };
    return { ...base, status: feasible ? 'proposed' : 'infeasible', proposed: feasible ? { min_confidence: bestQ.t } : null,
      metrics: { accuracy: round6(bestQ.acc), fallback_rate: round6(bestQ.fallback_rate), abstain_rate: round6(abstainRate), ...(q === 'Q4' ? { gated_by_proposed_q1: gated } : {}) } };
  }
}

// ---------------------------------------------------------------------------
// §10.3 stop / switch rules
// ---------------------------------------------------------------------------
export type StopRule = 'jev_q3q4_only' | 'do_not_introduce_jev' | 'switch_local_probe' | 'lock_version_recalibrate';
export interface StopVerdict { rule: StopRule; triggered: boolean; status: 'evaluated' | 'insufficient_evidence' | 'not_applicable'; evidence: string }

const meanAccuracy = (m: BackendMetrics, questions: string[]) => {
  const vals = m.questions.filter(q => questions.includes(q.question_id) && q.accuracy !== null).map(q => q.accuracy as number);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};
const meanAbstain = (m: BackendMetrics, questions: string[]) => {
  const vals = m.questions.filter(q => questions.includes(q.question_id)).map(q => q.abstain_rate);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

export function evaluateStopRules(metrics: BackendMetrics[], baseline?: { metrics: BackendMetrics[]; question_set_version?: string }): StopVerdict[] {
  const jev = metrics.find(m => m.backend === 'jev');
  const out: StopVerdict[] = [];
  // Questions where both backends have an accuracy from at least MIN_LABELS labels each.
  const shared = (a: BackendMetrics, b: BackendMetrics) => a.questions.map(q => q.question_id).filter(id => {
    const qa = a.questions.find(q => q.question_id === id), qb = b.questions.find(q => q.question_id === id);
    return !!qa && !!qb && qa.accuracy !== null && qb.accuracy !== null && qa.decided >= MIN_LABELS && qb.decided >= MIN_LABELS;
  });
  if (!jev) out.push({ rule: 'jev_q3q4_only', triggered: false, status: 'not_applicable', evidence: 'no jev judgments' });
  else {
    // Either breach is sufficient on its own evidence; concluding that neither fails needs both.
    const recallOk = jev.important_recall.n >= MIN_LABELS, fsOk = jev.false_support.n >= MIN_LABELS;
    const recall = jev.important_recall.rate, fs = jev.false_support.rate;
    const recallFails = recallOk && recall !== null && recall < 0.85;
    const fsFails = fsOk && fs !== null && fs > 0.08;
    const evidence = `recall ${recall ?? 'n/a'} (n=${jev.important_recall.n}${recallOk ? '' : ', thin'}), false-support ${fs ?? 'n/a'} (n=${jev.false_support.n}${fsOk ? '' : ', thin'})`;
    if (recallFails || fsFails) out.push({ rule: 'jev_q3q4_only', triggered: true, status: 'evaluated', evidence });
    else if (recallOk && fsOk) out.push({ rule: 'jev_q3q4_only', triggered: false, status: 'evaluated', evidence });
    else out.push({ rule: 'jev_q3q4_only', triggered: false, status: 'insufficient_evidence', evidence });
  }
  for (const rule of ['do_not_introduce_jev', 'switch_local_probe'] as const) {
    const others = rule === 'do_not_introduce_jev' ? ['rule', 'llm_deepseek'] : ['local_probe'];
    const candidates = metrics.filter(m => others.includes(m.backend));
    if (!jev || candidates.length === 0) { out.push({ rule, triggered: false, status: 'not_applicable', evidence: 'missing backend' }); continue; }
    if (rule === 'switch_local_probe' && jev.labels < 300) { out.push({ rule, triggered: false, status: 'insufficient_evidence', evidence: `jev labels ${jev.labels} < 300` }); continue; }
    const hits: string[] = [];
    let comparable = false;
    for (const other of candidates) {
      const qs = shared(jev, other);
      if (qs.length === 0) continue;
      comparable = true;
      const a = meanAccuracy(jev, qs), b = meanAccuracy(other, qs);
      if (a === null || b === null) continue;
      // Inclusive bands in percentage points, compared on rounded differences (90/100 − 87/100 is 3 pt, not 3.0000000000000027).
      const diff = Math.round((a - b) * 1e6) / 1e6;
      const within = rule === 'do_not_introduce_jev' ? diff <= 0.03 && (meanAbstain(other, qs) ?? 1) < (meanAbstain(jev, qs) ?? 0) : diff <= 0.02;
      if (within) hits.push(`${other.backend}: ${b.toFixed(3)} vs jev ${a.toFixed(3)} over ${qs.join('/')}`);
    }
    if (!comparable) { out.push({ rule, triggered: false, status: 'insufficient_evidence', evidence: `no question with ≥ ${MIN_LABELS} labels on both sides` }); continue; }
    out.push({ rule, triggered: hits.length > 0, status: 'evaluated', evidence: hits.join('; ') || 'no candidate within band' });
  }
  // A baseline of another question set measured different questions or thresholds: not drift, not comparable.
  const foreign = baseline?.question_set_version !== undefined && baseline.question_set_version !== QUESTION_SET_VERSION;
  if (!baseline || !jev || foreign) out.push({ rule: 'lock_version_recalibrate', triggered: false, status: 'not_applicable', evidence: !baseline ? 'no baseline supplied' : foreign ? `baseline question set ${baseline.question_set_version} ≠ ${QUESTION_SET_VERSION}` : 'no jev judgments' });
  else {
    const prev = baseline.metrics.find(m => m.backend === 'jev');
    const comparable = prev ? jev.questions.map(q => { const p = prev.questions.find(x => x.question_id === q.question_id); return p && p.accuracy !== null && q.accuracy !== null && p.decided >= MIN_LABELS && q.decided >= MIN_LABELS ? { q: q.question_id, d: q.accuracy - p.accuracy } : null; }).filter((x): x is { q: string; d: number } => x !== null) : [];
    // "More than five points": compare on rounded percentage points so 85/100 → 90/100 is not a drift.
    const drifts = comparable.filter(x => Math.round(Math.abs(x.d) * 1e6) / 1e6 > 0.05);
    out.push({ rule: 'lock_version_recalibrate', triggered: drifts.length > 0, status: !prev ? 'not_applicable' : comparable.length === 0 ? 'insufficient_evidence' : 'evaluated',
      evidence: drifts.map(d => `${d.q} ${d.d >= 0 ? '+' : ''}${(d.d * 100).toFixed(1)} pt`).join(', ') || (comparable.length ? 'within 5 pt' : `no question with ≥ ${MIN_LABELS} labels in both reports`) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Artifact, Markdown and runner
// ---------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { QUESTION_SET_VERSION } from './questions';

export interface CalibrationFit { backend: string; question_id: string; labeled: number; segments: IsotonicSegment[] }
export interface ExcludedPartition { question_set_version: string | null; backend: string; backend_model: string | null; rows: number }
export interface CalibrationArtifact {
  schema_name: 'alpha-calibration-report'; schema_version: '1.0'; question_set_version: string;
  generated_at: string; since: string | null; rows: number; labeled: number;
  /** Judgments of other question-set versions or superseded backend models, left out of the calibration. */
  excluded: ExcludedPartition[];
  metrics: BackendMetrics[]; fits: CalibrationFit[]; proposals: ThresholdProposal[]; stop_rules: StopVerdict[]; baseline_generated_at: string | null;
}

/** Full-sample isotonic fit per backend × question with at least MIN_LABELS eligible observations. */
export function calibrationFits(rows: ReportRow[]): CalibrationFit[] {
  const deduped = dedupeMaterialLevel(rows);
  const keys = [...new Set(deduped.map(r => `${r.backend}|${r.question_id}`))].sort();
  const out: CalibrationFit[] = [];
  for (const key of keys) {
    const [backend, question_id] = key.split('|') as [string, string];
    const points = scoredPoints(deduped.filter(r => r.backend === backend && r.question_id === question_id));
    if (points.length < MIN_LABELS) continue;
    out.push({ backend, question_id, labeled: points.length, segments: isotonicFit(points).segments });
  }
  return out;
}

/**
 * One classifier per report: only the current question-set version, and per backend only the model
 * seen most recently (rows arrive in created_at order). Everything else is reported as excluded.
 */
export function partitionRows(rows: ReportRow[]): { kept: ReportRow[]; excluded: ExcludedPartition[] } {
  const current = rows.filter(r => (r.question_set_version ?? QUESTION_SET_VERSION) === QUESTION_SET_VERSION);
  const latestModel = new Map<string, string | null>();
  for (const r of current) latestModel.set(r.backend, r.backend_model ?? null);
  const kept: ReportRow[] = [];
  const counts = new Map<string, ExcludedPartition>();
  for (const r of rows) {
    const version = r.question_set_version ?? QUESTION_SET_VERSION, model = r.backend_model ?? null;
    if (version === QUESTION_SET_VERSION && model === latestModel.get(r.backend)) { kept.push(r); continue; }
    const key = `${version}|${r.backend}|${model}`;
    const e = counts.get(key) ?? { question_set_version: version, backend: r.backend, backend_model: model, rows: 0 };
    e.rows++; counts.set(key, e);
  }
  return { kept, excluded: [...counts.values()] };
}

export function buildCalibrationArtifact(input: { rows: ReportRow[]; since: string | null; generatedAt: string; baseline: CalibrationArtifact | null }): CalibrationArtifact {
  const { kept, excluded } = partitionRows(input.rows);
  const metrics = classMetrics(kept);
  return {
    schema_name: 'alpha-calibration-report', schema_version: '1.0', question_set_version: QUESTION_SET_VERSION,
    generated_at: input.generatedAt, since: input.since, rows: kept.length, labeled: kept.filter(r => r.label !== null).length, excluded,
    metrics, fits: calibrationFits(kept), proposals: proposeThresholds(kept), stop_rules: evaluateStopRules(metrics, input.baseline ? { metrics: input.baseline.metrics, question_set_version: input.baseline.question_set_version } : undefined),
    baseline_generated_at: input.baseline?.generated_at ?? null,
  };
}

const f = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? '—' : v.toFixed(d));
const ci = (r: Rate) => (r.rate === null ? '—' : `${f(r.rate)} [${f(r.low)}, ${f(r.high)}] (k=${r.k}, n=${r.n})`);

export function renderCalibrationMarkdown(a: CalibrationArtifact): string {
  const lines = [`# 校准重拟报告 ${a.generated_at.slice(0, 10)}`, '', `问题集 ${a.question_set_version}；判断 ${a.rows} 条，其中有标签 ${a.labeled} 条${a.since ? `；起自 ${a.since}` : ''}${a.baseline_generated_at ? `；基线 ${a.baseline_generated_at}` : ''}。`, ''];
  if (a.excluded.length) {
    lines.push('未纳入（其它问题集版本或已被替换的模型）：', '');
    for (const e of a.excluded) lines.push(`- ${e.question_set_version ?? '未知版本'} / ${e.backend} / ${e.backend_model ?? '未知模型'}：${e.rows} 条`);
    lines.push('');
  }
  lines.push('## 类① 指标', '');
  for (const m of a.metrics) {
    lines.push(`### ${m.backend}${m.backend_model ? ` · ${m.backend_model}` : ''}（标签 ${m.labels}）`, '', `- important_recall（Q1）：${ci(m.important_recall)}`, `- false_support（Q2）：${ci(m.false_support)}`, '',
      '| question | n | labeled | accuracy | abstain | ECE before | ECE after | p50 ms | p95 ms | µ$/1k |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const q of m.questions) lines.push(`| ${q.question_id} | ${q.n} | ${q.labeled} | ${f(q.accuracy)} | ${f(q.abstain_rate)} | ${f(q.ece_before)} | ${f(q.ece_after)} | ${q.p50_latency_ms ?? '—'} | ${q.p95_latency_ms ?? '—'} | ${q.cost_micros_per_1k} |`);
    lines.push('');
  }
  lines.push('## Isotonic 拟合', '', '| backend | question | labeled | segments (x_min–x_max → p) |', '|---|---|---|---|');
  for (const fit of a.fits) lines.push(`| ${fit.backend} | ${fit.question_id} | ${fit.labeled} | ${fit.segments.map(s => `${s.x_min}–${s.x_max}→${s.p}`).join('; ')} |`);
  if (a.fits.length === 0) lines.push(`| — | — | — | 无问题达到 ${MIN_LABELS} 条标签 |`);
  lines.push('', '## 阈值重拟', '', '| question | 标签 | 状态 | 当前 | 提议 | 指标 |', '|---|---|---|---|---|---|');
  for (const p of a.proposals) lines.push(`| ${p.question_id} | ${p.labeled} | ${p.status} | ${JSON.stringify(p.current)} | ${p.proposed ? JSON.stringify(p.proposed) : '—'} | ${Object.keys(p.metrics).length ? JSON.stringify(p.metrics) : '—'} |`);
  lines.push('', 'Q2/Q4/Q5 的指标按提议的 Q1 门槛重新判定相关性（`gated_by_proposed_q1` 为因此关闭的行数），因此各提议应一起应用。', '应用方式：人工修改 `src/lib/research/fanout/questions.ts` 的 `THRESHOLDS` 并提升 `question_set_version`，在冻结集上回归后提交。', '', '## 停止 / 换后端', '', '| 规则 | 触发 | 状态 | 证据 |', '|---|---|---|---|');
  for (const v of a.stop_rules) lines.push(`| ${v.rule} | ${v.triggered ? '是' : '否'} | ${v.status} | ${v.evidence} |`);
  return `${lines.join('\n')}\n`;
}

export interface CalibrationCliDeps { load: (since?: string) => Promise<ReportRow[]>; now?: () => string }

/** Argument parsing + file writing; the loader is injected so the runner is testable without a database. */
export async function runCalibrationCli(args: readonly string[], deps: CalibrationCliDeps): Promise<{ exitCode: number; output: string }> {
  const fail = (code: number, error: string) => ({ exitCode: code, output: JSON.stringify({ error }) });
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = args[i + 1];
    if (!a || !['--out', '--since', '--baseline'].includes(a) || v === undefined || values.has(a)) return fail(2, 'invalid_arguments');
    values.set(a, v); i++;
  }
  const out = values.get('--out');
  if (!out || !path.isAbsolute(out)) return fail(2, 'invalid_arguments');
  const since = values.get('--since');
  if (since !== undefined && (Number.isNaN(Date.parse(since)) || !/^\d{4}-\d{2}-\d{2}/.test(since))) return fail(2, 'invalid_arguments');
  const baselinePath = values.get('--baseline');
  if (baselinePath !== undefined && !path.isAbsolute(baselinePath)) return fail(2, 'invalid_arguments');
  let baseline: CalibrationArtifact | null = null;
  if (baselinePath) {
    try { const parsed = JSON.parse(readFileSync(baselinePath, 'utf8')); if (parsed?.schema_name !== 'alpha-calibration-report') return fail(1, 'baseline_invalid'); baseline = parsed; }
    catch { return fail(1, 'baseline_unreadable'); }
  }
  const generatedAt = (deps.now ?? (() => new Date().toISOString()))();
  const rows = await deps.load(since);
  const artifact = buildCalibrationArtifact({ rows, since: since ?? null, generatedAt, baseline });
  const day = generatedAt.slice(0, 10);
  const json = path.join(out, `${day}.json`), markdown = path.join(out, `${day}.md`);
  mkdirSync(out, { recursive: true });
  writeFileSync(json, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  writeFileSync(markdown, renderCalibrationMarkdown(artifact), 'utf8');
  return { exitCode: 0, output: JSON.stringify({ rows: artifact.rows, labeled: artifact.labeled, json, markdown,
    stop_rules: artifact.stop_rules.map(v => ({ rule: v.rule, triggered: v.triggered, status: v.status })), proposals: artifact.proposals.map(p => ({ question_id: p.question_id, status: p.status })) }) };
}
