export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getProfile, loadBookRows } from '@/lib/analyst/store';
import { buildBook } from '@/lib/analyst/book';
import { analystError } from '@/lib/analyst/http';
import { isUuid } from '@/lib/portfolio/validate';

// F4: private self-assessment (spec §8.6)
import { selfAssessment } from '@/lib/judgments/adapters/recommendation';
// /F4

// GET ?analyst=<uuid> → { profile, book: { positions, closed, summary } }
export async function GET(req: Request) {
  const analyst = new URL(req.url).searchParams.get('analyst');
  if (!isUuid(analyst)) return NextResponse.json({ error: 'analyst must be a uuid' }, { status: 400 });
  try {
    const [profile, rows] = await Promise.all([getProfile(analyst), loadBookRows(analyst)]);
    // F4: preserve profile and book; add owner-only self-assessment
    return NextResponse.json({ profile, book: buildBook(rows), self_assessment: selfAssessment(rows) });
    // /F4
  } catch (e) {
    return analystError(e);
  }
}
