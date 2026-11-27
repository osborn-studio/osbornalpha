import { NextResponse } from 'next/server';
import { readFormalExport } from '@/lib/feishu/formal-export';
import { getFeishuAccountConfig, hasFeishuAccountToken } from '@/lib/feishu/integration-auth';
import { isUuid } from '@/lib/portfolio/validate';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store', vary: 'Authorization' } });

// Complete structured history of the group's bound analysts, for the connector's Excel workbook.
export async function GET(request: Request) {
  if (process.env.FEISHU_SIMULATION_INGEST_ENABLED !== 'true') return json({ error: 'not_found' }, 404);
  const config = getFeishuAccountConfig();
  if (!config) return json({ error: 'integration_unavailable' }, 503);
  if (!hasFeishuAccountToken(request, config.token)) return json({ error: 'unauthorized' }, 401);
  const params = new URL(request.url).searchParams;
  const owner = params.get('owner');
  if ([...params.keys()].some((key) => key !== 'owner') || params.getAll('owner').length !== 1 || !isUuid(owner)) {
    return json({ error: 'invalid_scope' }, 400);
  }
  if (owner.toLowerCase() !== config.ownerId) return json({ error: 'owner_mismatch' }, 403);
  if (config.analysts.size === 0) return json({ error: 'analyst_unavailable' }, 403);
  try {
    const data = await readFormalExport(getAdminSupabase((input, init) => fetch(input, { ...init, cache: 'no-store' })) as any,
      { ownerId: config.ownerId, analysts: config.analysts });
    return json({ generatedAt: new Date().toISOString(), ...data }, 200);
  } catch {
    return json({ error: 'query_unavailable' }, 503);
  }
}
