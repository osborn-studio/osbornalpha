export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { refreshRecommendationScores } from '@/lib/analyst/score-store';
import { analystError } from '@/lib/analyst/http';

export async function POST() {
  try {
    return NextResponse.json(await refreshRecommendationScores());
  } catch (e) {
    return analystError(e);
  }
}
