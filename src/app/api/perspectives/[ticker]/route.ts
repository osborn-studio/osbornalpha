import { NextResponse } from 'next/server';
import { PERSONAS } from '@/lib/data/personas';
import { resolveLlm } from '@/lib/llm/resolve';
import { getRequestLocale, apiMessage } from '@/lib/i18n/server';
import { getBudgetConfig } from '@/lib/billing/cost-budget';
import { normalizeEvidenceTickerParam } from '@/lib/external-evidence';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  parsePerspectiveAnalysisMode,
  perspectiveAnalysisNeedsSearch,
  type PerspectiveAnalysisRequestMode,
} from '@/lib/stocks/perspective-analysis';
import {
  enqueuePerspectiveGenerationJob,
  waitForPerspectiveGenerationJob,
  PerspectiveJobRepositoryError,
} from '@/lib/stocks/perspective-job-repository';
import { perspectiveGenerationJobView } from '@/lib/stocks/perspective-job-contract';
import { schedulePerspectiveGenerationWorker } from '@/lib/stocks/perspective-job-dispatch';
import { runPerspectiveGenerationJobByIdWithResult } from '@/lib/stocks/perspective-job-runner';
import { watchlistApiError } from '@/lib/watchlist/api-error';

export const dynamic = 'force-dynamic';
export const revalidate = 86400;
export const maxDuration = 300;

interface Ctx { params: Promise<{ ticker: string }> }

const MAX_EXPLICIT_PERSONAS = 6;

interface PerspectiveGenerationRequest {
  personaIds: string[] | null;
  analysisMode: PerspectiveAnalysisRequestMode;
  error: 'invalid_request' | 'invalid_personas' | 'invalid_analysis_mode' | null;
}

async function parseGenerationRequest(req: Request): Promise<PerspectiveGenerationRequest> {
  const searchParams = new URL(req.url).searchParams;
  const personasFromQuery = searchParams.get('personas')?.split(',').filter(Boolean) ?? null;
  const analysisModeFromQuery = searchParams.get('analysisMode');
  let body: Record<string, unknown> | null = null;
  if (req.headers.get('content-type')?.includes('application/json')) {
    const value: unknown = await req.json().catch(() => undefined);
    if (value === undefined || !value || typeof value !== 'object' || Array.isArray(value)) {
      return { personaIds: null, analysisMode: 'auto', error: 'invalid_request' };
    }
    body = value as Record<string, unknown>;
    if (body.personas !== undefined
      && (!Array.isArray(body.personas) || body.personas.some((id) => typeof id !== 'string'))) {
      return { personaIds: null, analysisMode: 'auto', error: 'invalid_personas' };
    }
  }
  const rawPersonas = Array.isArray(body?.personas) ? body.personas as string[] : personasFromQuery;
  const personaIds = rawPersonas
    ? [...new Set(rawPersonas.map((id) => id.trim()).filter(Boolean))]
    : null;
  const known = new Set<string>(PERSONAS.map((persona) => persona.id));
  if (personaIds
    && (personaIds.length === 0 || personaIds.length > MAX_EXPLICIT_PERSONAS
      || personaIds.some((id) => !known.has(id)))) {
    return { personaIds: null, analysisMode: 'auto', error: 'invalid_personas' };
  }
  const rawAnalysisMode = body?.analysisMode ?? analysisModeFromQuery ?? 'auto';
  const analysisMode = parsePerspectiveAnalysisMode(rawAnalysisMode);
  if (!analysisMode) return { personaIds, analysisMode: 'auto', error: 'invalid_analysis_mode' };
  return { personaIds, analysisMode, error: null };
}

function perspectiveApiError(
  code: string,
  status: number,
  ticker: string,
  source: string,
  details: Record<string, unknown> = {},
  error = code,
) {
  return watchlistApiError(code, status, {
    details: { source, ticker, error, errorCode: code, perspectives: [], ...details },
  });
}

function wantsAsyncResponse(request: Request): boolean {
  return request.headers.get('prefer')?.split(',').some((value) => value.trim() === 'respond-async') ?? false;
}

function completedResult(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  return Array.isArray(result.perspectives) ? result : null;
}

function jobErrorStatus(code: string | null): number {
  if (code === 'external_evidence_required') return 424;
  if (code === 'daily_cost_exhausted') return 429;
  if (code === 'pricing_unavailable' || code === 'budget_invariant_violation' || code === 'usage_audit_invariant') return 500;
  if (code === 'llm_provider_unavailable' || code === 'budget_unavailable' || code === 'usage_audit_unavailable') return 503;
  return 502;
}

export async function GET() {
  const response = watchlistApiError('method_not_allowed', 405, { details: { perspectives: [] } });
  response.headers.set('allow', 'POST');
  return response;
}

export async function POST(req: Request, { params }: Ctx) {
  const { ticker: raw } = await params;
  const ticker = normalizeEvidenceTickerParam(raw);
  if (!ticker) return watchlistApiError('invalid_ticker', 400, { details: { perspectives: [] } });
  const generationRequest = await parseGenerationRequest(req);
  if (generationRequest.error) {
    return watchlistApiError(generationRequest.error, 400, { details: { perspectives: [] } });
  }

  const llm = await resolveLlm();
  if (!llm) {
    return perspectiveApiError(
      'llm_provider_unavailable',
      503,
      ticker,
      'no-key',
      {},
      'No LLM provider configured - set DEEPSEEK_API_KEY (preferred) or ANTHROPIC_API_KEY in Vercel env vars',
    );
  }

  let userId: string;
  let userDb: Awaited<ReturnType<typeof getServerSupabase>>;
  try {
    userDb = await getServerSupabase();
    const { data, error } = await userDb.auth.getUser();
    if (error || !data.user) return watchlistApiError('not_authenticated', 401);
    userId = data.user.id;
  } catch {
    const locale = await getRequestLocale();
    const budget = getBudgetConfig();
    return perspectiveApiError('budget_unavailable', 503, ticker, 'cost_quota', {
      costLimit: { dailyMicrormb: budget.dailyLimitMicrormb, timezone: 'Asia/Shanghai' },
    }, apiMessage(locale, 'budgetUnavailable'));
  }

  const respondAsync = wantsAsyncResponse(req);
  let job;
  try {
    job = await enqueuePerspectiveGenerationJob(userDb, {
      ticker,
      personaIds: generationRequest.personaIds,
      analysisMode: generationRequest.analysisMode,
      llmSource: llm.source,
      includeExternalEvidence: perspectiveAnalysisNeedsSearch(generationRequest.analysisMode),
      warnings: [],
    });
    if (respondAsync) {
      if (job.status === 'queued') {
        schedulePerspectiveGenerationWorker(job.id);
      }
      return NextResponse.json({ job: perspectiveGenerationJobView(job) }, {
        status: job.status === 'succeeded' ? 200 : 202,
        headers: { location: `/api/perspectives/jobs/${job.id}` },
      });
    }
  } catch (error) {
    if (error instanceof PerspectiveJobRepositoryError && error.code === 'perspective_quota_exhausted') {
      const locale = await getRequestLocale();
      return perspectiveApiError(error.code, 429, ticker, 'quota', {
        quota: { ...(error.quota ?? { used: 0, limit: 0, plan: 'unknown' }), reason: 'quota_exhausted' },
      }, apiMessage(locale, 'quotaExhausted'));
    }
    if (error instanceof PerspectiveJobRepositoryError && error.code === 'external_evidence_rate_limited') {
      return watchlistApiError(error.code, 429, {
        retryAfterSeconds: 3600,
        details: { source: 'external_evidence_quota', ticker, errorCode: error.code, perspectives: [] },
      });
    }
    return perspectiveApiError('perspective_job_enqueue_failed', 503, ticker, 'job_queue');
  }

  try {
    const execution = await runPerspectiveGenerationJobByIdWithResult(job.id, getAdminSupabase(), llm);
    if (execution.result) return NextResponse.json(execution.result);
    if (execution.error) {
      return perspectiveApiError(
        execution.error.code,
        execution.error.status,
        ticker,
        execution.error.source,
        execution.error.details,
      );
    }

    const current = execution.outcome === 'superseded'
      ? await waitForPerspectiveGenerationJob(userDb, job.id, { timeoutMs: 240_000, signal: req.signal })
      : await waitForPerspectiveGenerationJob(userDb, job.id, { timeoutMs: 0, signal: req.signal });
    const result = current?.status === 'succeeded' ? completedResult(current.result) : null;
    if (result) return NextResponse.json(result);
    if (current?.status === 'queued' || current?.status === 'running') {
      schedulePerspectiveGenerationWorker(current.id);
      return NextResponse.json({ job: perspectiveGenerationJobView(current) }, {
        status: 202,
        headers: { location: `/api/perspectives/jobs/${current.id}` },
      });
    }
    const code = current?.error_code ?? (current?.status === 'cancelled' ? 'perspective_job_cancelled' : 'provider_error');
    return perspectiveApiError(code, current?.status === 'cancelled' ? 409 : jobErrorStatus(code), ticker, 'job');
  } catch (error) {
    return perspectiveApiError('provider_error', 502, ticker, 'llm');
  }
}
