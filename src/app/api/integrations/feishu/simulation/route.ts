import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { parseRecommendationInput } from '@/lib/analyst/validate';
import { isUuid, parseTradeInput } from '@/lib/portfolio/validate';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {getFeishuAccountConfig, hasFeishuAccountToken, sourceKey} from '@/lib/feishu/integration-auth';

export const dynamic = 'force-dynamic';

const requestFields = ['sourceId', 'expectedOwnerId', 'analystKey', 'approvedAt', 'recommendation', 'execution'];
const recommendationFields = ['ticker', 'market', 'action', 'reference_price', 'confidence', 'target_price', 'stop_loss', 'horizon', 'thesis_ref', 'recommended_at', 'rationale'];
const executionFields = ['price', 'quantity', 'fee', 'executed_at', 'note'];

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(value).every((key) => fields.includes(key));
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendar = new Date(day + 'T00:00:00Z');
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day || instant > Date.now() + 60_000) return null;
  return new Date(instant).toISOString();
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function error(status: number, code: string) {
  return NextResponse.json({ error: code }, { status });
}

function parsePayload(body: Record<string, unknown>, ownerId: string) {
  const { sourceId, analystKey, recommendation, execution } = body;
  const approvedAt = timestamp(body.approvedAt);
  if (!hasOnly(body, requestFields) || !approvedAt ||
      typeof sourceId !== 'string' || !sourceKey.test(sourceId) ||
      typeof analystKey !== 'string' || !sourceKey.test(analystKey) ||
      !object(recommendation) || !hasOnly(recommendation, recommendationFields)) return null;

  const recommendedAt = recommendation.recommended_at == null ? approvedAt : timestamp(recommendation.recommended_at);
  if (!recommendedAt || recommendedAt > approvedAt) return null;
  for (const key of ['reference_price', 'confidence', 'target_price', 'stop_loss']) {
    if (recommendation[key] !== undefined && (typeof recommendation[key] !== 'number' || !Number.isFinite(recommendation[key]))) return null;
  }
  for (const key of ['rationale', 'thesis_ref', 'horizon']) {
    if (recommendation[key] !== undefined && typeof recommendation[key] !== 'string') return null;
  }
  const requestedHorizon = recommendation.horizon === '5d' || recommendation.horizon === '10d' ? recommendation.horizon : undefined;
  const validated = parseRecommendationInput({ ...recommendation, analyst_id: ownerId, recommended_at: recommendedAt });
  if (!validated.ok || (recommendation.horizon !== undefined && !validated.value.horizon && !requestedHorizon)) return null;
  const { analyst_id, source_type, source_ref, ...call } = validated.value;
  const event = { sourceId, analystKey, approvedAt, recommendation:call, ...(requestedHorizon && { requestedHorizon }) };
  if (execution == null) return { ...event, execution:null };
  const direction = call.action === 'buy' || call.action === 'add' ? 'buy'
    : call.action === 'sell' || call.action === 'trim' ? 'sell' : null;
  if (!direction || !object(execution) || !hasOnly(execution, executionFields) ||
      typeof execution.price !== 'number' || !Number.isFinite(execution.price) ||
      typeof execution.quantity !== 'number' || !Number.isFinite(execution.quantity) ||
      (execution.fee !== undefined && (typeof execution.fee !== 'number' || !Number.isFinite(execution.fee) || execution.fee < 0)) ||
      (execution.note !== undefined && typeof execution.note !== 'string')) return null;
  const executedAt = execution.executed_at == null ? approvedAt : timestamp(execution.executed_at);
  if (!executedAt || executedAt < approvedAt) return null;
  const trade = parseTradeInput({ ...execution, ticker: call.ticker, direction, executed_at: executedAt });
  if (!trade.ok) return null;
  const { price, quantity, fee, executed_at, note } = trade.value;
  return { ...event, execution:{ price, quantity, fee, executed_at, note } };
}

interface Receipt {
  recommendationId: string;
  decisionId: string | null;
  tradeId: string | null;
  replayed: boolean;
}

interface IngestRpc {
  rpc(name: 'ingest_feishu_simulation', args: {
    p_owner: string;
    p_analyst: string | null;
    p_source_id: string;
    p_payload_hash: string;
    p_payload: ReturnType<typeof parsePayload>;
  }): PromiseLike<{ data: Receipt | null; error: { code: string; message: string } | null }>;
}

export async function POST(request: Request) {
  if (process.env.FEISHU_SIMULATION_INGEST_ENABLED !== 'true') return error(404, 'not_found');
  const config = getFeishuAccountConfig();
  if (!config) return error(503, 'integration_unavailable');
  if (!hasFeishuAccountToken(request, config.token)) return error(401, 'unauthorized');
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return error(415, 'invalid_content_type');
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 16_384) return error(413, 'payload_too_large');
    body = JSON.parse(text);
  } catch {
    return error(400, 'invalid_payload');
  }
  if (!object(body) || !isUuid(body.expectedOwnerId)) return error(400, 'invalid_payload');
  if (body.expectedOwnerId.toLowerCase() !== config.ownerId) return error(403, 'owner_mismatch');
  const payload = parsePayload(body, config.ownerId);
  if (!payload) return error(400, 'invalid_payload');

  try {
    const admin = getAdminSupabase() as unknown as IngestRpc;
    const result = await admin.rpc('ingest_feishu_simulation', {
      p_owner:config.ownerId,
      p_analyst:config.analysts.get(payload.analystKey) ?? null,
      p_source_id:payload.sourceId,
      p_payload_hash:digest(JSON.stringify(payload)).toString('hex'),
      p_payload:payload,
    });
    if (result.error?.code === 'P0403') return error(403, 'analyst_unavailable');
    if (result.error?.code === 'P0409') return error(409, result.error.message === 'payload_conflict' ? 'payload_conflict' : 'position_conflict');
    if (result.error || !result.data) return error(503, 'integration_unavailable');
    return NextResponse.json(result.data, { status:result.data.replayed ? 200 : 201 });
  } catch {
    return error(503, 'integration_unavailable');
  }
}
