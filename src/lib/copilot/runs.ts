import { sanitizeEventMetadata } from '@/lib/analytics/sanitize';
import { sanitizeAiText } from '@/lib/llm/sanitize';

export interface RunDb {
  from(table: string): any;
}

export interface CreateRunInput {
  userId: string;
  ticker?: string | null;
  methodId: string;
  question?: string | null;
}

export interface CompleteRunInput {
  contentMd: string;
  verdict: Record<string, unknown> | null;
  durationMs: number;
}

export interface FailedRunInput {
  errorCode: string;
  partialContent: string;
  durationMs: number;
}

const SECRET_ASSIGNMENT = /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|authorization)\s*[:=]\s*\S+/gi;
const PROVIDER_KEY = /\bsk-[A-Za-z0-9_-]{12,}\b/g;

function safeText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const redacted = value
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(PROVIDER_KEY, '[redacted]');
  const sanitized = sanitizeAiText(redacted).slice(0, max);
  return sanitized || null;
}

function safeDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function createAiRun(db: RunDb, input: CreateRunInput): Promise<string> {
  const { data, error } = await db.from('ai_runs').insert({
    user_id: input.userId,
    ticker: input.ticker ?? null,
    method_id: input.methodId,
    question: safeText(input.question, 2_000),
    status: 'running',
  }).select('id').single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('ai run insert returned no id');
  return data.id as string;
}

export async function completeAiRun(db: RunDb, id: string, input: CompleteRunInput): Promise<void> {
  const { error } = await db.from('ai_runs').update({
    status: 'completed',
    content_md: safeText(input.contentMd, 200_000),
    verdict: input.verdict ? sanitizeEventMetadata(input.verdict) : null,
    error_code: null,
    duration_ms: safeDuration(input.durationMs),
    completed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function failAiRun(db: RunDb, id: string, input: FailedRunInput): Promise<void> {
  const { error } = await db.from('ai_runs').update({
    status: 'failed',
    content_md: safeText(input.partialContent, 200_000),
    error_code: input.errorCode.slice(0, 80),
    duration_ms: safeDuration(input.durationMs),
    completed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function failStaleAiRuns(db: RunDb, userId: string, cutoff: Date): Promise<number> {
  const { error, count } = await db.from('ai_runs').update({
    status: 'failed',
    error_code: 'run_interrupted',
    completed_at: new Date().toISOString(),
  }, { count: 'exact' })
    .eq('status', 'running')
    .eq('user_id', userId)
    .lt('created_at', cutoff.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function stableAiErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  if (/quota|额度/i.test(message)) return 'quota_exhausted';
  if (/not configured|未配置/i.test(message)) return 'provider_not_configured';
  if (/\b(?:401|403)\b|invalid api key|unauthori[sz]ed|authentication/i.test(message)) return 'provider_auth';
  if (/\b(?:400|404)\b.*(?:model|endpoint)|model.*(?:not found|invalid|unknown)/i.test(message)) return 'provider_model_invalid';
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return 'provider_rate_limited';
  if (name === 'AbortError' || /timeout|timed out|operation was aborted/i.test(message)) return 'provider_timeout';
  if (/abort|stream|socket/i.test(message)) return 'stream_error';
  if (/hop budget exhausted/i.test(message)) return 'hop_budget_exhausted';
  return 'provider_error';
}

export function aiEventMetadata(input: {
  runId: string | null;
  ticker: string | null;
  methodId: string;
  durationMs?: number;
  errorCode?: string | null;
}): Record<string, unknown> {
  return {
    run_id: input.runId,
    ticker: input.ticker,
    method_id: input.methodId,
    ...(input.durationMs === undefined ? {} : { duration_ms: safeDuration(input.durationMs) }),
    ...(input.errorCode ? { error_code: input.errorCode.slice(0, 80) } : {}),
  };
}
