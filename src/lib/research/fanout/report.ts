/**
 * WP-A6 frozen-set report (§10.1 class ①): per backend × question accuracy,
 * abstention rate, ECE, latency percentiles and cost per 1k judgments.
 * Pure over rows read from research_judgments ⟕ research_labels.
 */
export interface ReportRow {
  source_id: string;
  backend: string;
  question_id: string;
  selected: string | null;
  confidence: number | null;
  abstained: boolean;
  latency_ms: number | null;
  cost_micros: number | null;
  distribution: Record<string, number>;
  /** Latest human label for the judgment, or null. */
  label: string | null;
  /**
   * For thesis-gated follow-ups (Q2/Q4/Q5): whether the same run's Q1 for this source × thesis ×
   * backend answered "relevant". `false` means the runtime abstains whatever the follow-up's own
   * threshold is; `null`/absent means unknown (treated as open).
   */
  gate_open?: boolean | null;
}

export interface ReportMetric {
  backend: string; question_id: string;
  n: number; labeled: number;
  accuracy: number | null; abstain_rate: number; ece: number | null;
  p50_latency_ms: number | null; p95_latency_ms: number | null;
  cost_micros_per_1k: number;
}

const MATERIAL_LEVEL = new Set(['Q3']);
const BINS = 10;

/** Linear-interpolation percentile (numpy default), so p50 of an even-sized sample is the true median. */
function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = p * (sorted.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/** Confidence used for calibration: backend confidence for choices, P(true) for nouls. */
export function calibrationScore(r: ReportRow): number | null {
  if (r.confidence != null) return r.confidence;
  const p = r.distribution?.true;
  return typeof p === 'number' ? p : null;
}
export function isCorrect(r: ReportRow): boolean { return r.label !== null && r.selected === r.label; }

/** Expected calibration error with equal-width bins; nouls compare P(true) against label==='true'. */
export function ece(rows: ReportRow[]): number | null {
  const scored = rows.filter(r => r.label !== null && !r.abstained).map(r => {
    const isNoul = r.confidence == null && typeof r.distribution?.true === 'number';
    const conf = calibrationScore(r);
    if (conf == null) return null;
    return { conf, hit: isNoul ? (r.label === 'true' ? 1 : 0) : (isCorrect(r) ? 1 : 0) };
  }).filter((x): x is { conf: number; hit: number } => x !== null);
  if (scored.length === 0) return null;
  const bins = Array.from({ length: BINS }, () => ({ n: 0, conf: 0, hit: 0 }));
  for (const s of scored) { const b = bins[Math.min(BINS - 1, Math.floor(s.conf * BINS))]; b.n++; b.conf += s.conf; b.hit += s.hit; }
  return bins.reduce((acc, b) => (b.n === 0 ? acc : acc + (b.n / scored.length) * Math.abs(b.hit / b.n - b.conf / b.n)), 0);
}

export function summarize(rows: ReportRow[]): ReportMetric[] {
  const groups = new Map<string, ReportRow[]>();
  const seenMaterial = new Set<string>();
  for (const r of rows) {
    if (MATERIAL_LEVEL.has(r.question_id)) {
      const k = `${r.source_id}|${r.backend}|${r.question_id}`;
      if (seenMaterial.has(k)) continue;
      seenMaterial.add(k);
    }
    const key = `${r.backend}|${r.question_id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => {
    const [backend, question_id] = key.split('|');
    const labeled = rs.filter(r => r.label !== null);
    const decided = labeled.filter(r => !r.abstained);
    const latencies = rs.map(r => r.latency_ms).filter((v): v is number => typeof v === 'number');
    const cost = rs.reduce((a, r) => a + (r.cost_micros ?? 0), 0);
    return {
      backend, question_id, n: rs.length, labeled: labeled.length,
      accuracy: decided.length ? decided.filter(isCorrect).length / decided.length : null,
      abstain_rate: rs.filter(r => r.abstained).length / rs.length,
      ece: ece(rs),
      p50_latency_ms: percentile(latencies, 0.5), p95_latency_ms: percentile(latencies, 0.95),
      cost_micros_per_1k: Math.round((cost / rs.length) * 1000),
    };
  });
}

export function renderMarkdown(metrics: ReportMetric[]): string {
  const f = (v: number | null, d = 3) => (v === null ? '—' : v.toFixed(d));
  const lines = ['| backend | question | n | labeled | accuracy | abstain | ECE | p50 ms | p95 ms | µ$/1k |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const m of metrics) lines.push(`| ${m.backend} | ${m.question_id} | ${m.n} | ${m.labeled} | ${f(m.accuracy)} | ${f(m.abstain_rate)} | ${f(m.ece)} | ${m.p50_latency_ms ?? '—'} | ${m.p95_latency_ms ?? '—'} | ${m.cost_micros_per_1k} |`);
  return lines.join('\n');
}
