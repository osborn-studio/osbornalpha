/**
 * WP-A5 labeling sample and report (plan §10.1 class ②): pure helpers for the
 * 100-row human-labeling CSV and the correctness report with Wilson intervals.
 */

export const SAMPLE_COLUMNS = ['source_id', 'title', 'url', 'cluster_id', 'cluster_first', 'cluster_size', 'cluster_peer_title', 'aligned_entities', 'ambiguous_candidates', 'label_cluster_correct', 'label_alignment_correct'] as const;
export type SampleColumn = typeof SAMPLE_COLUMNS[number];
export type SampleRow = Record<SampleColumn, string>;

export interface SampleSource { id: string; title: string | null; url: string | null; cluster_id: string; cluster_first: boolean | null; entity_ids: string[] }
export interface SampleAlignment { entity_id: string; status: string }
export interface Interval { low: number; high: number }
export interface LabelMetric { correct: number; labeled: number; rate: number | null; ci: Interval }
export interface LabelSummary { sample_size: number; cluster: LabelMetric; alignment: LabelMetric }

/** Wilson score interval, z = 1.96. An empty sample is fully uncertain. */
export function wilson(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n; const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function toCsv(columns: readonly string[], rows: Array<Record<string, string>>): string {
  return [columns.join(','), ...rows.map(r => columns.map(c => cell(r[c] ?? '')).join(','))].join('\n') + '\n';
}

/** RFC 4180 parser: quoted fields may hold commas, quotes ("" escape) and newlines. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); records.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const [header, ...body] = records;
  if (!header) return [];
  return body.filter(r => r.length > 1 || r[0] !== '').map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** mulberry32: small seeded PRNG so a sample can be regenerated. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** n rows, half from clusters with ≥2 members when enough exist; deterministic per seed. */
export function pickSample<T extends { id: string; cluster_id: string }>(rows: T[], n: number, seed: number): T[] {
  const sizes = new Map<string, number>();
  for (const r of rows) sizes.set(r.cluster_id, (sizes.get(r.cluster_id) ?? 0) + 1);
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const random = rng(seed);
  const multi = shuffle(sorted.filter(r => (sizes.get(r.cluster_id) ?? 0) >= 2), random);
  const single = shuffle(sorted.filter(r => (sizes.get(r.cluster_id) ?? 0) < 2), random);
  const want = Math.min(n, rows.length);
  const fromMulti = Math.min(multi.length, Math.ceil(want / 2));
  const picked = multi.slice(0, fromMulti);
  picked.push(...single.slice(0, want - picked.length));
  if (picked.length < want) picked.push(...multi.slice(fromMulti, fromMulti + (want - picked.length)));
  return picked;
}

export function buildSampleRows(sample: SampleSource[], population: SampleSource[], alignments: Record<string, SampleAlignment[]>, entityNames: Record<string, string>): SampleRow[] {
  const byCluster = new Map<string, SampleSource[]>();
  for (const s of population) (byCluster.get(s.cluster_id) ?? byCluster.set(s.cluster_id, []).get(s.cluster_id)!).push(s);
  const name = (id: string) => entityNames[id] ?? id;
  return sample.map(s => {
    const members = byCluster.get(s.cluster_id) ?? [s];
    const peer = members.find(m => m.id !== s.id);
    const al = alignments[s.id] ?? [];
    return {
      source_id: s.id, title: s.title ?? '', url: s.url ?? '', cluster_id: s.cluster_id, cluster_first: String(s.cluster_first ?? ''),
      cluster_size: String(members.length), cluster_peer_title: peer?.title ?? '',
      aligned_entities: al.filter(a => a.status === 'aligned').map(a => name(a.entity_id)).join('; '),
      ambiguous_candidates: al.filter(a => a.status === 'ambiguous').map(a => name(a.entity_id)).join('; '),
      label_cluster_correct: '', label_alignment_correct: '',
    };
  });
}

function metric(values: string[]): LabelMetric {
  const labeled = values.filter(v => v === 'y' || v === 'n');
  const correct = labeled.filter(v => v === 'y').length;
  return { correct, labeled: labeled.length, rate: labeled.length ? correct / labeled.length : null, ci: wilson(correct, labeled.length) };
}
/** Labels are y/n (case-insensitive); blanks and anything else are unlabeled. */
export function summarizeLabels(rows: Array<Record<string, string>>): LabelSummary {
  const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase();
  return { sample_size: rows.length, cluster: metric(rows.map(r => norm(r.label_cluster_correct))), alignment: metric(rows.map(r => norm(r.label_alignment_correct))) };
}

export function renderLabelSummary(s: LabelSummary): string {
  const line = (label: string, m: LabelMetric) => `| ${label} | ${m.correct}/${m.labeled} | ${m.rate === null ? '—' : (m.rate * 100).toFixed(1) + '%'} | ${(m.ci.low * 100).toFixed(1)}%–${(m.ci.high * 100).toFixed(1)}% |`;
  return ['| metric | correct/labeled | rate | Wilson 95% |', '|---|---|---|---|', line('cluster', s.cluster), line('alignment', s.alignment), '', `sample size: ${s.sample_size}`].join('\n');
}
