import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TUSHARE_ENDPOINT = 'https://api.tushare.pro';
const ALLOWED_APIS = new Set([
  // Read-only data endpoints we already use or might want to probe.
  // We intentionally don't allow arbitrary endpoints to avoid making this
  // a generic proxy that could be abused.
  'stock_basic',
  'daily',
  'daily_basic',
  'fina_indicator',
  'hk_hold',
  'limit_list_d',
  'anns_d',
  'top10_holders',
  'top10_floatholders',
  'income',
  'balance',
  'cashflow',
  'hsgt_top10',
  'moneyflow_hsgt',
]);

/**
 * GET /api/diag/tushare?api_name=hk_hold&ts_code=600519.SH&trade_date=20260520
 *                       &start_date=20260401&end_date=20260520&limit=5
 *
 * Read-only diagnostic that forwards a single Tushare call and returns
 * the raw response body. Used to figure out why an endpoint returns
 * empty without raising an error (typically a param shape mismatch or
 * silent permission issue).
 *
 * - api_name must be in ALLOWED_APIS (deliberate denylist by default).
 * - All other query params are passed through as Tushare `params`.
 * - Token is read from TUSHARE_TOKEN env — never accepted from the URL.
 * - Token value itself is never echoed back in the response.
 */
export async function GET(req: Request) {
  const token = process.env.TUSHARE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TUSHARE_TOKEN not configured' }, { status: 200 });
  }

  const url = new URL(req.url);
  const api_name = url.searchParams.get('api_name') || '';
  if (!ALLOWED_APIS.has(api_name)) {
    return NextResponse.json(
      { error: `api_name '${api_name}' not in allowlist`, allowed: Array.from(ALLOWED_APIS) },
      { status: 400 }
    );
  }

  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k === 'api_name' || k === 'fields') return;
    params[k] = v;
  });
  const fields = url.searchParams.get('fields') || '';

  const body = { api_name, token, params, fields };

  let resp: Response;
  try {
    resp = await fetch(TUSHARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'network failed', api_name }, { status: 502 });
  }

  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch {}

  // Strip token from echoed body
  const safeBody = { ...body, token: '***REDACTED***' };

  return NextResponse.json({
    request: {
      api_name,
      params,
      fields,
      sent_body: safeBody,
    },
    response: {
      status: resp.status,
      code: parsed?.code ?? null,
      msg: parsed?.msg ?? null,
      has_data: parsed?.data != null,
      row_count: parsed?.data?.items?.length ?? 0,
      fields_returned: parsed?.data?.fields ?? null,
      first_row: parsed?.data?.items?.[0] ?? null,
      first_3_rows: parsed?.data?.items?.slice(0, 3) ?? null,
      raw_body: text.length > 4000 ? text.slice(0, 4000) + '…[truncated]' : text,
    },
  });
}
