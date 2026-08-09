import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  consumeResolveQuota,
  discoverExternalCandidate,
  findExistingSecurity,
  promoteTrustedSecurity,
  queueDiscoveryCandidate,
  resolveTrustedSecurity,
} from '@/lib/securities/discovery';
import { inferCoreMarket, isCompleteCodeQuery, normalizeSecurityTicker } from '@/lib/securities/normalize';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const RESOLVE_TIMEOUT_MS = 6000;

class ResolveTimeoutError extends Error {}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResolveTimeoutError()), RESOLVE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function subjectHash(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export async function POST(request: Request) {
  const session = await getServerSupabase();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const query = payload && typeof payload === 'object' && typeof (payload as { query?: unknown }).query === 'string'
    ? (payload as { query: string }).query.trim() : '';
  if (!query || query.length > 80 || !isCompleteCodeQuery(query)) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const market = inferCoreMarket(query);
  const ticker = market ? normalizeSecurityTicker(query, market) : null;
  if (!ticker) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });

  const rateSecret = process.env.SECURITY_RATE_LIMIT_SECRET;
  if (!rateSecret) return NextResponse.json({ error: 'resolver_unavailable' }, { status: 503 });
  const admin = getAdminSupabase() as any;
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  try {
    const [userAllowed, ipAllowed] = await Promise.all([
      consumeResolveQuota(admin, subjectHash(rateSecret, `user:${user.id}`)),
      consumeResolveQuota(admin, subjectHash(rateSecret, `ip:${forwardedIp}`)),
    ]);
    if (!userAllowed || !ipAllowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const existing = await findExistingSecurity(admin, ticker);
    if (existing) return NextResponse.json({ source: 'security-master', result: existing });

    const result = await withTimeout((async () => {
      const trusted = await resolveTrustedSecurity(ticker, new Date().toISOString().slice(0, 10));
      if (trusted) {
        await promoteTrustedSecurity(admin, trusted);
        return {
          source: trusted.security.source,
          result: {
            t: trusted.security.ticker,
            n: trusted.security.name,
            py: trusted.security.pinyin ?? '',
            m: trusted.security.market,
            asset_type: trusted.security.asset_type,
            exchange: trusted.security.exchange,
            list_status: trusted.security.list_status,
            match_kind: 'resolved_exact',
            verification_status: 'verified',
            selectable: true,
          },
        };
      }

      const candidate = await discoverExternalCandidate(ticker);
      if (!candidate) return null;
      await queueDiscoveryCandidate(admin, ticker, candidate);
      return {
        source: candidate.source,
        result: {
          t: candidate.ticker,
          n: candidate.name,
          py: candidate.pinyin,
          m: candidate.market,
          asset_type: candidate.asset_type,
          exchange: null,
          list_status: 'pending',
          match_kind: 'external_exact',
          verification_status: candidate.verification_status,
          selectable: false,
        },
      };
    })());

    if (!result) return NextResponse.json({ error: 'security_not_found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResolveTimeoutError
      || (error && typeof error === 'object' && 'code' in error && error.code === 'source_timeout')) {
      return NextResponse.json({ error: 'security_resolve_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'security_resolve_failed' }, { status: 503 });
  }
}
