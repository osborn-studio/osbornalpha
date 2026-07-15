import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SecurityUniverse } from '@/lib/securities/model';
import { syncSecurityScopes } from '@/lib/securities/sync/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REGION_SCOPES: Record<string, SecurityUniverse[]> = {
  asia: ['a_stock', 'a_exchange_fund', 'a_cb', 'hk_main'],
  us: ['sp500', 'nasdaq_top500', 'us_china'],
};

function authorized(auth: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(auth ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function run(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Cron unavailable' }, { status: 503 });
  if (!authorized(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const region = url.searchParams.get('region') ?? '';
  const scopes = REGION_SCOPES[region];
  if (!scopes) return NextResponse.json({ error: 'Invalid region' }, { status: 400 });

  const asOf = new Date().toISOString().slice(0, 10);
  const results = await syncSecurityScopes({ scopes, dryRun: false, asOf });
  const ok = results.every((result) => result.status === 'success');
  return NextResponse.json({ ok, region, as_of: asOf, results }, { status: 200 });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
