/**
 * Deterministic rule backend: aliases + keyword lexicons + source domain.
 * It never calls out, so it also serves private sources. Its answers are the
 * floor that llm_deepseek and jev must beat on the frozen set (§10.3).
 */
import { decide, type QuestionId } from '../questions';
import type { BackendAnswer, BackendResult, FanoutBackend, FanoutInput } from './types';
import type { SourceDocument, Thesis } from '../../types';

export const RULE_MODEL = 'rules-v1';

const SUPPORT = ['增长','上线','中标','签约','落地','超预期','创新高','扩大','beat','record','wins','signed','launch','expands','growth'];
const WEAKEN = ['下滑','亏损','暂停','取消','流失','不及预期','下调','延迟','裁员','decline','miss','delay','cancel','loss','cut','churn'];
const COMPLETED = ['已完成','已经','宣布','完成','正式','已于','completed','announced','has ','closed'];
const PLANNED = ['计划','拟','预计','将于','预期','plans','expects','will ','intends','proposed'];
const DENIED = ['否认','否决','不属实','辟谣','denied','denies','rejected'];
const CONDITIONAL = ['若','如果','取决于','有条件','视','subject to','if ','contingent','conditional'];
const FILING_DOMAINS = ['sec.gov','cninfo.com.cn','hkexnews.hk','sse.com.cn','szse.cn','edgar'];
const MEDIA_TYPES = new Set(['NEWS','GITHUB_RADAR']);

const lower = (s: string) => s.toLowerCase();
const count = (text: string, terms: readonly string[]) => terms.reduce((n, t) => n + (t.trim() && text.includes(lower(t)) ? 1 : 0), 0);
const hostOf = (url: string | null | undefined) => { try { return url ? new URL(url).hostname.toLowerCase() : ''; } catch { return ''; } };

/** ≥2-char CJK fragments and ≥4-letter Latin words from thesis text, used as relevance keywords. */
export function keywordsOf(texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/[一-鿿]{2,}/g)) { const w = m[0]; for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2)); }
    for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9.-]{3,}/g)) out.add(lower(m[0]));
  }
  return [...out];
}

function q1(text: string, thesis: Thesis, aliases: string[]): Record<string, number> {
  const aliasHits = count(text, aliases.map(lower));
  const kw = keywordsOf([...thesis.invalidation_conditions, ...thesis.watch_metrics]);
  const kwHits = count(text, kw);
  const hits = aliasHits * 2 + kwHits;
  const p = hits === 0 ? 0.05 : Math.min(0.95, 0.35 + 0.15 * hits);
  return { true: round(p), false: round(1 - p) };
}

function q2(text: string, thesis: Thesis): Record<string, number> {
  const invalidation = thesis.invalidation_conditions.filter(c => c.trim().length >= 6 && text.includes(lower(c.trim()))).length;
  const s = count(text, SUPPORT), w = count(text, WEAKEN);
  if (invalidation > 0) return { support: 0.05, weaken: 0.1, trigger_invalidation: 0.8, related_insufficient: 0.05 };
  if (s === 0 && w === 0) return { support: 0.2, weaken: 0.2, trigger_invalidation: 0.05, related_insufficient: 0.55 };
  const total = s + w;
  return { support: round(0.1 + 0.75 * (s / total)), weaken: round(0.1 + 0.75 * (w / total)), trigger_invalidation: 0.02, related_insufficient: 0.03 };
}

export function q3(source: SourceDocument): Record<string, number> {
  const host = hostOf(source.url);
  const pick = (k: string, p = 0.85) => Object.fromEntries(['filing_or_regulator','executive_statement','third_party_data','analyst_or_media','retelling','unknown'].map(o => [o, o === k ? p : round((1 - p) / 5)]));
  if (source.source_type === 'FILING' || FILING_DOMAINS.some(d => host.includes(d))) return pick('filing_or_regulator');
  if (source.source_type === 'NOTE' || source.source_type === 'MANUAL') return pick('retelling', 0.7);
  if (source.source_type === 'MODEL_USAGE') return pick('third_party_data', 0.7);
  if (MEDIA_TYPES.has(source.source_type) && host) return pick('analyst_or_media', 0.75);
  return pick('unknown', 0.6);
}

function q4(text: string): Record<string, number> {
  const scores = { completed: count(text, COMPLETED), planned: count(text, PLANNED), denied: count(text, DENIED), conditional: count(text, CONDITIONAL) };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return { completed: 0.05, planned: 0.05, denied: 0.02, conditional: 0.03, not_applicable: 0.85 };
  const dist: Record<string, number> = { not_applicable: 0.08 };
  for (const [k, v] of Object.entries(scores)) dist[k] = round(0.02 + 0.84 * (v / total)); // 0.08 + 4×0.02 + 0.84 = 1
  return dist;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function answer(thesis_id: string, question_id: QuestionId, distribution: Record<string, number>): BackendAnswer {
  const d = decide(question_id, distribution, null);
  return { thesis_id, question_id, distribution, selected: d.selected, confidence: d.confidence, abstained: d.abstained };
}

export const ruleBackend: FanoutBackend = async (input: FanoutInput): Promise<BackendResult> => {
  const started = Date.now();
  const text = lower(`${input.source.title}\n${input.source.raw_text}`);
  const material = q3(input.source);
  const answers: BackendAnswer[] = [];
  for (const thesis of input.theses) {
    answers.push(answer(thesis.id, 'Q1', q1(text, thesis, input.aliases.get(thesis.id) ?? [])));
    answers.push(answer(thesis.id, 'Q2', q2(text, thesis)));
    answers.push(answer(thesis.id, 'Q3', material));
    answers.push(answer(thesis.id, 'Q4', q4(text)));
    if (input.askQ5) {
      // Without semantic diffing the rule treats a clustered follow-up as new only when it carries completion/denial cues.
      const cues = count(text, [...COMPLETED, ...DENIED]);
      answers.push(answer(thesis.id, 'Q5', cues > 0 ? { true: 0.6, false: 0.4 } : { true: 0.3, false: 0.7 }));
    }
  }
  return { backend: 'rule', backend_model: RULE_MODEL, prompt_sha256: null, input_token_count: null, latency_ms: Date.now() - started, cost_micros: 0, answers };
};
