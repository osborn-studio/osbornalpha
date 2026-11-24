export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { refreshRecommendationScores } from '@/lib/analyst/score-store';
import { analystError } from '@/lib/analyst/http';

// POST → { scored, skipped, reasons }; refreshes the signed-in user's recommendation scores
export async function POST(request: Request) {
  try {
    const afterTicker = new URL(request.url).searchParams.get('afterTicker');
    return NextResponse.json(await refreshRecommendationScores(afterTicker ?? undefined));
  } catch (e) {
    return analystError(e);
  }
}
