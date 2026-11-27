import { NextResponse } from 'next/server';
import { getFeishuAccountConfig } from '@/lib/feishu/integration-auth';
import { parseReportName, REPORT_BUCKET, reportDisposition, reportObjectPath, XLSX_MIME } from '@/lib/feishu/report-files';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ name: string }> }

const plain = (text: string, status: number) =>
  new NextResponse(text, { status, headers: { 'cache-control': 'private, no-store' } });

// Download a stored workbook. Only a session of the simulation account itself may read it
// (the middleware already sends anonymous visitors to /login).
export async function GET(_request: Request, { params }: Ctx) {
  const { name } = await params;
  const config = getFeishuAccountConfig();
  if (!config || !parseReportName(name)) return plain('Not found', 404);
  const { data: { user } } = await (await getServerSupabase()).auth.getUser();
  if (!user) return plain('Unauthorized', 401);
  if (user.id.toLowerCase() !== config.ownerId) return plain('Not found', 404);
  const { data, error } = await getAdminSupabase().storage.from(REPORT_BUCKET).download(reportObjectPath(config.ownerId, name));
  if (error || !data) return plain('Not found', 404);
  return new NextResponse(data.stream(), {
    status: 200,
    headers: {
      'content-type': XLSX_MIME,
      'content-disposition': reportDisposition(name),
      'cache-control': 'private, no-store',
    },
  });
}
