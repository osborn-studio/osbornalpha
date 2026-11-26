import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/analyst/store';
import { loadAnalystReport } from '@/lib/analyst/report-store';
import { getFeishuAccountConfig } from '@/lib/feishu/integration-auth';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const config = getFeishuAccountConfig();
    if (!config) return NextResponse.json({ error: 'group_not_configured' }, { status: 503, headers });
    if (userId.toLowerCase() !== config.ownerId) return NextResponse.json({ error: 'group_access_denied' }, { status: 403, headers });
    const report = await loadAnalystReport(supabase, userId, config.analysts.values(), request.signal);
    return NextResponse.json(report, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'not authenticated') {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'report_unavailable' }, { status: 503, headers });
  }
}
