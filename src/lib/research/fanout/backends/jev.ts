/**
 * jev backend: one System One request per material carrying every thesis's
 * Q1/Q2/Q4 (and Q5 when clustered) plus a single material-level Q3.
 * Pinned to jev-1.13.0; disabled without TYPESAFE_API_KEY; never throws.
 */
import { QUESTIONS, type QuestionId } from '../questions';
import { abstention, decided, microsForTokens, parseDistribution } from './shared';
import type { BackendAnswer, BackendResult, FanoutBackend, FanoutInput } from './types';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-1.13.0';
export const JEV_DEFAULT_MICROS_PER_1K = 45;
const MATERIAL_CHARS = 24_000;

export interface JevBackendOptions {
  apiKey: string | undefined;
  fetch?: typeof fetch;
  microsPer1kTokens?: number;
  timeoutMs?: number;
}

type JevAnswer = { type: 'noul'; noul: number } | { type: 'choice'; choice?: string; probabilities?: Record<string, number>; confidence?: number };
interface JevResponse { model?: string; answers?: Record<string, JevAnswer>; usage?: { input_tokens?: number; output_tokens?: number } }

function question(q: QuestionId) {
  const def = QUESTIONS[q];
  return { type: def.type, instructions: def.instructions, criteria: def.criteria };
}

export function buildJevRequest(input: FanoutInput) {
  const questions: Record<string, unknown> = { Q3: question('Q3') };
  input.theses.forEach((_, i) => {
    for (const q of ['Q1','Q2','Q4', ...(input.askQ5 ? ['Q5'] as const : [])] as const) questions[`t${i}_${q}`] = question(q);
  });
  const state = {
    material: { source_id: input.source.id, type: input.source.source_type, title: input.source.title, url: input.source.url,
      text: input.source.raw_text.slice(0, MATERIAL_CHARS) },
    theses: input.theses.map(t => ({ id: t.id, title: t.title, pillars: t.watch_metrics, invalidation_conditions: t.invalidation_conditions })),
    ...(input.askQ5 && input.baseline ? { cluster_baseline: { source_id: input.baseline.source_id, title: input.baseline.title, text: input.baseline.text.slice(0, MATERIAL_CHARS) } } : {}),
  };
  return { state, model: JEV_MODEL, questions };
}

function mapAnswer(thesis_id: string, q: QuestionId, raw: JevAnswer | undefined): BackendAnswer {
  if (!raw) return abstention(thesis_id, q);
  if (QUESTIONS[q].type === 'noul') {
    if (raw.type !== 'noul' || typeof raw.noul !== 'number' || raw.noul < 0 || raw.noul > 1) return abstention(thesis_id, q);
    const p = Math.round(raw.noul * 1000) / 1000;
    return decided(thesis_id, q, { true: p, false: Math.round((1 - p) * 1000) / 1000 }, null);
  }
  if (raw.type !== 'choice') return abstention(thesis_id, q);
  const dist = parseDistribution(q, raw.probabilities);
  if (!dist) return abstention(thesis_id, q);
  const conf = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : null;
  return decided(thesis_id, q, dist, conf);
}

export function createJevBackend(opts: JevBackendOptions): FanoutBackend {
  const doFetch = opts.fetch ?? fetch;
  const price = opts.microsPer1kTokens ?? JEV_DEFAULT_MICROS_PER_1K;
  return async (input: FanoutInput): Promise<BackendResult> => {
    const started = Date.now();
    const base = { backend: 'jev' as const, backend_model: JEV_MODEL, prompt_sha256: null, input_token_count: null, cost_micros: 0, answers: [] as BackendAnswer[] };
    if (!opts.apiKey) return { ...base, latency_ms: 0, skipped: 'disabled' };
    let data: JevResponse;
    try {
      const res = await doFetch(JEV_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(buildJevRequest(input)), signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
      if (!res.ok) return { ...base, latency_ms: Date.now() - started, skipped: 'error', error: `jev ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
      data = await res.json() as JevResponse;
    } catch (e) {
      return { ...base, latency_ms: Date.now() - started, skipped: 'error', error: e instanceof Error ? e.message : String(e) };
    }
    if (!data || typeof data !== 'object' || !data.answers || typeof data.answers !== 'object') return { ...base, latency_ms: Date.now() - started, skipped: 'error', error: 'jev response has no answers' };
    const answers: BackendAnswer[] = [];
    const q3 = data.answers.Q3;
    input.theses.forEach((t, i) => {
      for (const q of ['Q1','Q2','Q4', ...(input.askQ5 ? ['Q5'] as const : [])] as const) answers.push(mapAnswer(t.id, q, data.answers![`t${i}_${q}`]));
      answers.push(mapAnswer(t.id, 'Q3', q3));
    });
    // Cost is metered on input tokens (§6.2 estimate); output is a few tokens per question.
    const tokens = typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
    return { ...base, backend_model: typeof data.model === 'string' ? data.model : JEV_MODEL, input_token_count: tokens,
      latency_ms: Date.now() - started, cost_micros: tokens === null ? 0 : microsForTokens(tokens, price), answers };
  };
}
