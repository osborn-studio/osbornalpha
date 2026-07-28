import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { monitorAllTheses } from '@/lib/research/monitor';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// One LLM roundtrip per ACTIVE/WATCH/AT_RISK thesis.
export const maxDuration = 300;

/** Run the monitor for every ACTIVE / WATCH / AT_RISK thesis. */
export async function POST() {
  try {
    const ctx = await requireResearchUser();
    const results = await monitorAllTheses(ctx);
    return NextResponse.json({
      results,
      alerts: results.filter((r) => r.event !== null).length,
    });
  } catch (e) {
    return researchError(e);
  }
}
