export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { listReviews, refreshReviews } from '@/lib/portfolio/review-store';

export async function GET() {
  try {
    const reviews = await listReviews();
    return NextResponse.json({ reviews });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}

export async function POST() {
  try {
    const { scored } = await refreshReviews();
    return NextResponse.json({ scored });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
