import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedUsage } from '@/lib/billing/llm-pricing';

const mocks = vi.hoisted(() => ({
  resolveLlm: vi.fn(),
  chatResolved: vi.fn(),
  checkQuota: vi.fn(),
  usageFinalized: vi.fn(),
  beginUsageRun: vi.fn(),
  finalizeUsageRun: vi.fn(),
  getServerSupabase: vi.fn(),
  getAdminSupabase: vi.fn(() => ({ kind: 'admin-db' })),
  reserveCostBudget: vi.fn(),
  createCapExemptCostAudit: vi.fn(),
  loadPerspectiveContext: vi.fn(),
  persistStockPerspectives: vi.fn(),
  consumeExternalEvidenceQuota: vi.fn(),
  enqueuePerspectiveGenerationJob: vi.fn(),
  claimPerspectiveGenerationJobs: vi.fn(),
  loadPerspectiveGenerationJob: vi.fn(),
  updatePerspectiveGenerationJob: vi.fn(),
  waitForPerspectiveGenerationJob: vi.fn(),
  schedulePerspectiveGenerationWorker: vi.fn(),
  job: null as any,
}));

vi.mock('@/lib/llm/resolve', () => ({
  resolveLlm: mocks.resolveLlm,
}));

vi.mock('@/lib/data/sources/llm', () => ({
  chatResolved: mocks.chatResolved,
  extractJson: (value: string) => JSON.parse(value),
}));

vi.mock('@/lib/billing/quota', () => ({
  checkQuota: mocks.checkQuota,
  beginUsageRun: mocks.beginUsageRun,
  finalizeUsageRun: mocks.finalizeUsageRun,
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: mocks.getServerSupabase,
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

vi.mock('@/lib/billing/cost-budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/cost-budget')>();
  return {
    ...actual,
    reserveCostBudget: mocks.reserveCostBudget,
    createCapExemptCostAudit: mocks.createCapExemptCostAudit,
  };
});

vi.mock('@/lib/stocks/research-artifact-repository', () => ({
  persistStockPerspectives: mocks.persistStockPerspectives,
}));

vi.mock('@/lib/external-evidence/quota', () => ({
  consumeExternalEvidenceQuota: mocks.consumeExternalEvidenceQuota,
}));

vi.mock('@/lib/stocks/perspective-context', () => ({
  loadPerspectiveContext: mocks.loadPerspectiveContext,
}));

vi.mock('@/lib/stocks/perspective-job-repository', () => ({
  enqueuePerspectiveGenerationJob: mocks.enqueuePerspectiveGenerationJob,
  claimPerspectiveGenerationJobs: mocks.claimPerspectiveGenerationJobs,
  loadPerspectiveGenerationJob: mocks.loadPerspectiveGenerationJob,
  updatePerspectiveGenerationJob: mocks.updatePerspectiveGenerationJob,
  waitForPerspectiveGenerationJob: mocks.waitForPerspectiveGenerationJob,
  PerspectiveJobRepositoryError: class PerspectiveJobRepositoryError extends Error {
    constructor(public readonly code: string, public readonly quota: Record<string, unknown> | null = null) { super(code); }
  },
}));

vi.mock('@/lib/stocks/perspective-job-dispatch', () => ({
  schedulePerspectiveGenerationWorker: mocks.schedulePerspectiveGenerationWorker,
}));

vi.mock('@/lib/data/personas', () => ({
  PERSONAS: [
    { id: 'value', name: 'Value', prompt: 'value prompt' },
    { id: 'risk', name: 'Risk', prompt: 'risk prompt' },
  ],
  buildUserMessage: () => 'stock context',
}));

import { GET as rejectGenerationGet, POST as generatePerspectives } from './route';
import { PerspectiveJobRepositoryError } from '@/lib/stocks/perspective-job-repository';

const GET = (request: Request, context: Parameters<typeof generatePerspectives>[1]) => generatePerspectives(
  new Request(request, { method: 'POST' }),
  context,
);

const provider = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.test',
  apiKey: 'secret',
  model: 'deepseek-v4-flash',
  chatPath: '/chat/completions',
  protocol: 'openai' as const,
  source: 'env' as const,
};

const usage = (input: number, hit: number, output: number): NormalizedUsage => ({
  inputTokens: input,
  cacheHitInputTokens: hit,
  cacheMissInputTokens: input - hit,
  outputTokens: output,
  estimated: false,
});

function contextBundle(evidence: Record<string, unknown> = {}) {
  return {
    context: {
      ticker: 'AAPL', name: 'Apple', market: 'US', currency: 'USD', price: 200,
      change_pct: 1, pe_ttm: 30, market_cap_label: '3T', external_evidence: [],
    },
    evidence: {
      requestId: 'evidence-1', status: 'complete', provider: 'test-search', queryCount: 1,
      results: [], fetchedAt: '2026-09-04T00:00:00.000Z', durationMs: 5, warnings: [],
      ...evidence,
    },
    sources: ['test-quote', 'sec-company-facts', 'test-search'],
    financial: { source: 'sec-company-facts', availability: 'available', asOf: '2025-12-31', warnings: [] },
  };
}

function reservation(id: string, costMicrormb: number) {
  return {
    reservationId: id,
    reservedMicrormb: 1_500,
    markIncurred: vi.fn(),
    finalizeIncurred: vi.fn(),
    settle: vi.fn().mockResolvedValue({ costMicrormb, usageEstimated: false }),
    release: vi.fn(),
  };
}

function perspectiveContent(index: number) {
  return JSON.stringify({
    stance: index === 0 ? 'bullish' : 'bearish',
    confidence: 8,
    summary: `summary-${index}`,
    data_cites: ['PE TTM'],
    });
}

describe('POST /api/perspectives/[ticker] cost budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLlm.mockResolvedValue(provider);
    mocks.checkQuota.mockResolvedValue({ allowed: true, used: 0, limit: 5, plan: 'free' });
    mocks.beginUsageRun.mockResolvedValue(undefined);
    mocks.finalizeUsageRun.mockImplementation(
      async (...args) => mocks.usageFinalized(...args),
    );
    mocks.getServerSupabase.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'server-user' } },
          error: null,
        }),
      },
    });
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle());
    mocks.persistStockPerspectives.mockResolvedValue(undefined);
    mocks.consumeExternalEvidenceQuota.mockResolvedValue(true);
    mocks.enqueuePerspectiveGenerationJob.mockImplementation(async (_db, input) => {
      mocks.job = {
        id: 'e6191ea7-9a32-4f98-9891-7f2bea177cef', user_id: 'server-user', ticker: input.ticker,
        persona_ids: input.personaIds, requested_analysis_mode: input.analysisMode,
        llm_source: input.llmSource, include_external_evidence: input.includeExternalEvidence,
        request_warnings: input.warnings, status: 'queued', stage: 'queued', progress: 0,
        attempt_count: 0, max_attempts: 3, quota_plan: 'free', quota_limit: 5, quota_used: 1,
        next_attempt_at: '2026-09-04T12:00:00Z', lease_expires_at: null,
        lease_token: null, cancel_requested_at: null, result_generation_id: null, result: {},
        error_code: null, error_message: null, created_at: '2026-09-04T12:00:00Z',
        started_at: null, finished_at: null, updated_at: '2026-09-04T12:00:00Z',
      };
      return mocks.job;
    });
    mocks.claimPerspectiveGenerationJobs.mockImplementation(async () => {
      mocks.job = {
        ...mocks.job,
        status: 'running', stage: 'context', progress: 10, attempt_count: 1,
        lease_expires_at: '2026-09-04T12:05:00Z', lease_token: 'lease-1',
        started_at: '2026-09-04T12:00:00Z',
      };
      return [mocks.job];
    });
    mocks.loadPerspectiveGenerationJob.mockImplementation(async () => mocks.job);
    mocks.updatePerspectiveGenerationJob.mockImplementation(async (_db, _id, _lease, patch) => {
      mocks.job = { ...mocks.job, ...patch };
      return true;
    });
    mocks.waitForPerspectiveGenerationJob.mockImplementation(async () => mocks.job);
  });

  it('rejects GET generation requests with an explicit POST contract', async () => {
    const response = await rejectGenerationGet();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('rejects malformed ticker path parameters before provider work', async () => {
    const response = await GET(
      new Request('http://localhost/api/perspectives/%3Cscript%3E'),
      { params: Promise.resolve({ ticker: '%3Cscript%3E' }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.resolveLlm).not.toHaveBeenCalled();
  });

  it('rejects an unknown analysis mode before provider work', async () => {
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?analysisMode=web-ish'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_analysis_mode', perspectives: [] });
    expect(mocks.resolveLlm).not.toHaveBeenCalled();
  });

  it('uses the shared retryable error envelope when no LLM provider is configured', async () => {
    mocks.resolveLlm.mockResolvedValue(null);
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'llm_provider_unavailable', errorCode: 'llm_provider_unavailable',
      source: 'no-key', ticker: 'AAPL', retryable: true, perspectives: [],
    });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns HTTP 429 with quota metadata when the generation quota is exhausted', async () => {
    mocks.enqueuePerspectiveGenerationJob.mockRejectedValue(
      new PerspectiveJobRepositoryError('perspective_quota_exhausted', { used: 5, limit: 5, plan: 'free' }),
    );
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      code: 'perspective_quota_exhausted', errorCode: 'perspective_quota_exhausted',
      source: 'quota', retryable: true, perspectives: [],
    });
    expect(body.quota).toBeTruthy();
  });

  it('enqueues durable work when the client requests an async response', async () => {
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL', {
        headers: { Prefer: 'respond-async' },
      }),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get('location')).toBe('/api/perspectives/jobs/e6191ea7-9a32-4f98-9891-7f2bea177cef');
    expect(await response.json()).toMatchObject({
      job: { id: 'e6191ea7-9a32-4f98-9891-7f2bea177cef', status: 'queued', progress: 0 },
    });
    expect(mocks.enqueuePerspectiveGenerationJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ticker: 'AAPL', analysisMode: 'auto', includeExternalEvidence: true,
    }));
    expect(mocks.schedulePerspectiveGenerationWorker).toHaveBeenCalledWith('e6191ea7-9a32-4f98-9891-7f2bea177cef');
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.consumeExternalEvidenceQuota).not.toHaveBeenCalled();
    expect(mocks.chatResolved).not.toHaveBeenCalled();
  });

  it('maps atomic async quota rejection to HTTP 429', async () => {
    mocks.enqueuePerspectiveGenerationJob.mockRejectedValue(
      new PerspectiveJobRepositoryError('perspective_quota_exhausted'),
    );
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL', {
        headers: { Prefer: 'respond-async' },
      }),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      errorCode: 'perspective_quota_exhausted', source: 'quota', perspectives: [],
    });
  });

  it('fails closed when required external evidence is rate limited', async () => {
    mocks.enqueuePerspectiveGenerationJob.mockRejectedValue(
      new PerspectiveJobRepositoryError('external_evidence_rate_limited'),
    );

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?analysisMode=evidence_required'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(body).toMatchObject({ errorCode: 'external_evidence_rate_limited', perspectives: [] });
    expect(mocks.loadPerspectiveContext).not.toHaveBeenCalled();
  });

  it('degrades auto mode to structured data without hiding the quota warning', async () => {
    mocks.claimPerspectiveGenerationJobs.mockImplementationOnce(async () => {
      mocks.job = {
        ...mocks.job,
        include_external_evidence: false,
        request_warnings: ['external_evidence_rate_limited'],
        status: 'running', stage: 'context', progress: 10, attempt_count: 1,
        lease_expires_at: '2026-09-04T12:05:00Z', lease_token: 'lease-1',
        started_at: '2026-09-04T12:00:00Z',
      };
      return [mocks.job];
    });
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle({
      requestId: 'not-requested', status: 'unavailable',
      warnings: ['external_evidence_rate_limited'],
    }));
    mocks.reserveCostBudget.mockResolvedValue(reservation('r1', 110));
    mocks.chatResolved.mockResolvedValue({ content: perspectiveContent(0), usage: usage(20, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.loadPerspectiveContext).toHaveBeenCalledWith('AAPL', expect.objectContaining({
      includeExternalEvidence: false,
      evidenceSkipWarning: 'external_evidence_rate_limited',
    }));
    expect(body.meta.analysis).toMatchObject({
      requested_mode: 'auto', resolved_mode: 'structured_only', evidence_available: false,
      warnings: ['external_evidence_rate_limited'],
    });
  });

  it('never calls or charges search in structured-only mode', async () => {
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle({
      requestId: 'not-requested', status: 'unavailable',
      warnings: ['external_evidence_not_requested'],
    }));
    mocks.reserveCostBudget.mockResolvedValue(reservation('r1', 110));
    mocks.chatResolved.mockResolvedValue({ content: perspectiveContent(0), usage: usage(20, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value&analysisMode=structured_only'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.consumeExternalEvidenceQuota).not.toHaveBeenCalled();
    expect(mocks.loadPerspectiveContext).toHaveBeenCalledWith('AAPL', expect.objectContaining({
      includeExternalEvidence: false,
      evidenceSkipWarning: 'external_evidence_not_requested',
    }));
    expect(body.meta.provenance).toMatchObject({
      requestedAnalysisMode: 'structured_only', resolvedAnalysisMode: 'structured_only',
      evidenceStatus: 'unavailable',
    });
  });

  it('does not call the model when required evidence returns no usable results', async () => {
    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?analysisMode=evidence_required'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(424);
    expect(body).toMatchObject({
      source: 'external_evidence_required', errorCode: 'external_evidence_required', perspectives: [],
      meta: { analysis: { requested_mode: 'evidence_required', resolved_mode: 'structured_only' } },
    });
    expect(mocks.chatResolved).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).not.toHaveBeenCalled();
  });

  it('returns a stable error without calling the model when normalized context is unavailable', async () => {
    mocks.loadPerspectiveContext.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      source: 'context_unavailable', ticker: 'AAPL', perspectives: [],
    });
    expect(mocks.chatResolved).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).not.toHaveBeenCalled();
  });

  it('only exposes web citations that belong to the fetched evidence snapshot', async () => {
    const item = {
      citationId: 'web_valid', title: 'Verified update', url: 'https://reuters.com/update', domain: 'reuters.com',
      snippet: 'Verified excerpt', sourceType: 'news', publishedAt: '2026-09-03T00:00:00.000Z',
      fetchedAt: '2026-09-04T00:00:00.000Z', trustScore: 0.78, relevanceScore: 0.9,
    };
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle({
      requestId: 'evidence-2', results: [item], fetchedAt: item.fetchedAt,
    }));
    mocks.reserveCostBudget.mockResolvedValue(reservation('r1', 110));
    mocks.chatResolved.mockResolvedValue({
      content: JSON.stringify({
        stance: 'bullish', confidence: 7, summary: 'summary', data_cites: ['PE TTM'],
        citation_ids: ['web_valid', 'web_invented'],
      }),
      usage: usage(50, 0, 10),
    });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value&analysisMode=evidence_required'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(body.perspectives[0]).toMatchObject({
      cites: ['PE TTM'],
      citations: [{ id: 'web_valid', url: 'https://reuters.com/update' }],
    });
    expect(body.meta.evidence).toMatchObject({ status: 'complete', provider: 'test-search', result_count: 1 });
    expect(body.meta.provenance).toMatchObject({
      modelVersion: 'deepseek-v4-flash',
      promptVersion: 'watchlist-perspectives-2026-09-04.v3',
      requestedAnalysisMode: 'evidence_required',
      resolvedAnalysisMode: 'evidence_backed',
      evidenceStatus: 'complete',
      evidenceRequestId: 'evidence-2',
      evidenceResultCount: 1,
      evidenceCoverageRatio: 1,
    });
    expect(body.meta.financial).toEqual({
      source: 'sec-company-facts', status: 'available', as_of: '2025-12-31', warnings: [],
    });
  });

  it('rejects uncited model output in evidence-backed mode', async () => {
    const item = {
      citationId: 'web_valid', title: 'Verified update', url: 'https://reuters.com/update', domain: 'reuters.com',
      snippet: 'Verified excerpt', sourceType: 'news', publishedAt: null,
      fetchedAt: '2026-09-04T00:00:00.000Z', trustScore: 0.78, relevanceScore: 0.9,
    };
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle({ results: [item] }));
    mocks.reserveCostBudget.mockResolvedValue(reservation('r1', 110));
    mocks.chatResolved.mockResolvedValue({ content: perspectiveContent(0), usage: usage(20, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value&analysisMode=evidence_required'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.perspectives).toEqual([]);
    expect(body.meta.failures).toEqual([{ persona: 'value', code: 'evidence_citation_required' }]);
  });

  it('does not claim an auditable evidence request when search fails', async () => {
    mocks.loadPerspectiveContext.mockResolvedValue(contextBundle({
      requestId: 'error-request', status: 'error', provider: null, queryCount: 0,
      results: [], fetchedAt: '2026-09-04T00:00:00.000Z', durationMs: 0,
      warnings: ['evidence_search_failed'],
    }));
    mocks.reserveCostBudget.mockResolvedValue(reservation('r1', 110));
    mocks.chatResolved.mockResolvedValue({ content: perspectiveContent(0), usage: usage(20, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta.evidence.status).toBe('error');
    expect(body.meta.provenance).toMatchObject({
      requestedAnalysisMode: 'auto',
      resolvedAnalysisMode: 'structured_only',
      evidenceStatus: 'error',
      evidenceRequestId: null,
      evidenceFetchedAt: null,
      evidenceResultCount: 0,
      evidenceCoverageRatio: 0,
    });
  });

  it('meters every platform persona call and writes one completed aggregate ticker event', async () => {
    const reservations = [reservation('r1', 110), reservation('r2', 220)];
    mocks.reserveCostBudget
      .mockResolvedValueOnce(reservations[0])
      .mockResolvedValueOnce(reservations[1]);
    mocks.chatResolved
      .mockResolvedValueOnce({ content: perspectiveContent(0), usage: usage(100, 25, 20) })
      .mockResolvedValueOnce({ content: perspectiveContent(1), usage: usage(80, 0, 15) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.perspectives).toHaveLength(2);
    expect(mocks.reserveCostBudget).toHaveBeenCalledTimes(2);
    expect(reservations[0].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[1].markIncurred).toHaveBeenCalledTimes(1);
    expect(reservations[0].settle).toHaveBeenCalledWith(usage(100, 25, 20));
    expect(reservations[1].settle).toHaveBeenCalledWith(usage(80, 0, 15));
    expect(reservations[0].release).not.toHaveBeenCalled();
    expect(reservations[1].release).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledTimes(1);
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      ticker: 'AAPL',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 180,
      cacheHitInputTokens: 25,
      cacheMissInputTokens: 155,
      outputTokens: 35,
      costMicrormb: 330,
      pricingVersion: 'deepseek-2026-04-24',
      byo: false,
      status: 'completed',
      }),
    );
  });

  it('returns a sanitized 503 when server authentication storage is unavailable', async () => {
    mocks.getServerSupabase.mockRejectedValue(new Error('database connection detail'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      source: 'cost_quota',
      errorCode: 'budget_unavailable',
      perspectives: [],
    });
    expect(JSON.stringify(body)).not.toContain('database connection detail');
  });

  it('returns a stable cost-quota response and never calls the provider when reservation is denied', async () => {
    mocks.reserveCostBudget.mockRejectedValue(new Error('daily_cost_exhausted'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      source: 'cost_quota',
      ticker: 'AAPL',
      errorCode: 'daily_cost_exhausted',
      perspectives: [],
      costLimit: {
        dailyMicrormb: 8_800_000,
        timezone: 'Asia/Shanghai',
      },
      quota: {
        reason: 'daily_cost_exhausted',
        costLimitMicrormb: 8_800_000,
      },
    });
    expect(mocks.chatResolved).not.toHaveBeenCalled();
  });

  it.each([
    ['budget_unavailable', 503],
    ['pricing_unavailable', 500],
    ['budget_invariant_violation', 500],
  ])('maps stable %s to HTTP %s', async (errorCode, status) => {
    mocks.reserveCostBudget.mockRejectedValue(new Error(errorCode));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({ source: 'cost_quota', errorCode });
    expect(body).not.toHaveProperty('stack');
  });

  it('keeps failed incurred spend and writes a failed conservative audit that does not count quota', async () => {
    const current = reservation('r1', 110);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.chatResolved.mockRejectedValue(new Error('provider exploded'));

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(current.markIncurred).toHaveBeenCalledTimes(1);
    expect(current.settle).not.toHaveBeenCalled();
    expect(current.release).not.toHaveBeenCalled();
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      ticker: 'AAPL',
      inputTokens: 1_000_000,
      cacheMissInputTokens: 1_000_000,
      outputTokens: 400,
      costMicrormb: 1_500,
      usageEstimated: true,
      byo: false,
      status: 'failed',
      }),
    );
  });

  it('does not count a completed provider call as feature success when its perspective is unusable', async () => {
    const current = reservation('r1', 110);
    mocks.reserveCostBudget.mockResolvedValue(current);
    mocks.chatResolved.mockResolvedValue({ content: 'null', usage: usage(40, 0, 5) });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).perspectives).toEqual([]);
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      status: 'failed',
      inputTokens: 40,
      outputTokens: 5,
      costMicrormb: 110,
      }),
    );
  });

  it('keeps BYO calls outside platform pricing and budget', async () => {
    mocks.resolveLlm.mockResolvedValue({
      ...provider,
      source: 'user',
      provider: 'custom',
      model: 'private-model',
    });
    mocks.chatResolved.mockResolvedValue({
      content: perspectiveContent(0),
      usage: usage(60, 0, 10),
    });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.checkQuota).not.toHaveBeenCalled();
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
        ticker: 'AAPL',
        provider: 'custom',
        model: 'private-model',
        byo: true,
      }),
    );
    expect(mocks.beginUsageRun.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      provider: 'custom',
      model: 'private-model',
      costMicrormb: 0,
      byo: true,
      status: 'completed',
      }),
    );
  });

  it('price-reviews and audits admin calls without the cap RPC', async () => {
    const audit = reservation('admin-audit', 73);
    mocks.createCapExemptCostAudit.mockResolvedValue(audit);
    mocks.claimPerspectiveGenerationJobs.mockImplementationOnce(async () => {
      mocks.job = {
        ...mocks.job,
        quota_plan: 'admin', quota_limit: -1, quota_used: 0,
        status: 'running', stage: 'context', progress: 10, attempt_count: 1,
        lease_expires_at: '2026-09-04T12:05:00Z', lease_token: 'lease-1',
        started_at: '2026-09-04T12:00:00Z',
      };
      return [mocks.job];
    });
    mocks.chatResolved.mockResolvedValue({
      content: perspectiveContent(0),
      usage: usage(60, 0, 10),
    });

    const response = await GET(
      new Request('http://localhost/api/perspectives/AAPL?personas=value'),
      { params: Promise.resolve({ ticker: 'AAPL' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveCostBudget).not.toHaveBeenCalled();
    expect(mocks.createCapExemptCostAudit).toHaveBeenCalledTimes(1);
    expect(mocks.createCapExemptCostAudit.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.beginUsageRun).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
        ticker: 'AAPL',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        byo: false,
      }),
    );
    expect(mocks.beginUsageRun.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.chatResolved.mock.invocationCallOrder[0]);
    expect(mocks.usageFinalized).toHaveBeenCalledWith(
      'server-user',
      expect.any(String),
      'perspectives',
      expect.objectContaining({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      costMicrormb: expect.any(Number),
      byo: false,
      status: 'completed',
      }),
    );
  });
});
