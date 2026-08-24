export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createArtifact, listArtifacts } from '@/lib/portfolio/artifacts-store';

const MAX_TITLE = 200;
const MAX_CONTENT_BYTES = 65536; // 64KB

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  try {
    const artifacts = await listArtifacts({
      skill_id: url.searchParams.get('skill_id') ?? undefined,
      ticker: url.searchParams.get('ticker') ?? undefined,
      limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ artifacts });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { skill_id, ticker, title, content_md, params } = body;
  if (typeof skill_id !== 'string' || !skill_id.trim()) {
    return NextResponse.json({ error: 'skill_id required' }, { status: 400 });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (title.length > MAX_TITLE) {
    return NextResponse.json({ error: `title too long (max ${MAX_TITLE})` }, { status: 400 });
  }
  if (typeof content_md !== 'string' || !content_md.trim()) {
    return NextResponse.json({ error: 'content_md required' }, { status: 400 });
  }
  if (Buffer.byteLength(content_md, 'utf8') > MAX_CONTENT_BYTES) {
    return NextResponse.json({ error: 'content_md too large (max 64KB)' }, { status: 400 });
  }
  try {
    const artifact = await createArtifact({
      skill_id,
      ticker: typeof ticker === 'string' ? ticker : null,
      title,
      content_md,
      params: typeof params === 'object' && params !== null && !Array.isArray(params) ? (params as Record<string, unknown>) : undefined,
    });
    return NextResponse.json({ artifact }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
