import { NextResponse } from 'next/server';
import { getFeishuAccountConfig, hasFeishuAccountToken } from '@/lib/feishu/integration-auth';
import { MAX_REPORT_BYTES, parseReportName, REPORT_BUCKET, reportObjectPath, XLSX_MIME } from '@/lib/feishu/report-files';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store', vary: 'Authorization' } });

interface Ctx { params: Promise<{ name: string }> }

// The connector stores a generated workbook; the group gets a link to /analyst/report/files/<name>.
export async function PUT(request: Request, { params }: Ctx) {
  if (process.env.FEISHU_SIMULATION_INGEST_ENABLED !== 'true') return json({ error: 'not_found' }, 404);
  const config = getFeishuAccountConfig();
  if (!config) return json({ error: 'integration_unavailable' }, 503);
  if (!hasFeishuAccountToken(request, config.token)) return json({ error: 'unauthorized' }, 401);
  const { name } = await params;
  if (!parseReportName(name)) return json({ error: 'invalid_name' }, 400);
  if (request.headers.get('content-type') !== XLSX_MIME) return json({ error: 'invalid_type' }, 415);
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) return json({ error: 'too_large' }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_REPORT_BYTES) return json({ error: 'too_large' }, 413);
  // An .xlsx is a zip archive: refuse anything else before storing it.
  if (body[0] !== 0x50 || body[1] !== 0x4b || body[2] !== 0x03 || body[3] !== 0x04) return json({ error: 'invalid_type' }, 415);
  try {
    const { error } = await getAdminSupabase().storage.from(REPORT_BUCKET)
      .upload(reportObjectPath(config.ownerId, name), body, { contentType: XLSX_MIME, upsert: true });
    if (error) throw error;
  } catch {
    return json({ error: 'storage_unavailable' }, 503);
  }
  return json({ name, path: `/analyst/report/files/${name}` }, 200);
}
