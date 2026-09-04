import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

const KNOWN_TAGS = [
  'tushare',
  'tushare-daily',
  'tushare-daily-basic',
  'tushare-fina-indicator',
  'tushare-income',
  'tushare-balance',
  'tushare-cashflow',
  'tushare-holders',
  'external-evidence',
];

/**
 * POST /api/cache/revalidate?tag=tushare-daily-basic
 *
 * Manually purge a cache tag. Requires CACHE_PURGE_SECRET in header
 * `X-Purge-Secret` if env var is set; otherwise password-gate (cookie auth)
 * is enough since middleware blocks unauthenticated requests.
 *
 * Useful when: ① Tushare data has been updated mid-day and you need fresh
 *               numbers ② Testing the cache layer ③ Major schema change
 *               that invalidates all cached payloads.
 */
export async function POST(req: Request) {
  const purgeSecret = process.env.CACHE_PURGE_SECRET;
  if (purgeSecret) {
    const got = req.headers.get('x-purge-secret');
    if (got !== purgeSecret) {
      return NextResponse.json({ error: 'invalid X-Purge-Secret' }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const tag = url.searchParams.get('tag') || 'tushare';

  if (!KNOWN_TAGS.includes(tag) && tag !== 'all') {
    return NextResponse.json(
      { error: `unknown tag '${tag}'`, known_tags: KNOWN_TAGS },
      { status: 400 }
    );
  }

  if (tag === 'all') {
    for (const t of KNOWN_TAGS) revalidateTag(t);
    return NextResponse.json({ revalidated: KNOWN_TAGS, ok: true });
  }

  revalidateTag(tag);
  return NextResponse.json({ revalidated: tag, ok: true });
}
