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
  const sorted = [...points].filter(p => Number.isFinite(p.score)).sort((a, b) => a.score - b.score);
  const blocks: { sum: number; n: number; x_min: number; x_max: number }[] = [];
  for (const p of sorted) {
    blocks.push({ sum: p.hit, n: 1, x_min: p.score, x_max: p.score });
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

function scoredPoints(rows: ReportRow[]): IsotonicPoint[] {
  const out: IsotonicPoint[] = [];
  for (const r of rows) {
    if (r.label === null || r.abstained) continue;
    const score = calibrationScore(r);
    if (score == null) continue;
    const isNoul = r.confidence == null && typeof r.distribution?.true === 'number';
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
  const points = scoredPoints(rows);
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
