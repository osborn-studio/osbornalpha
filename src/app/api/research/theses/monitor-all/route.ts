import { NextResponse } from 'next/server';
import { assertEnabled, getDb } from '@/lib/research/db';
import { monitorAllTheses } from '@/lib/research/monitor';
import { researchError } from '@/lib/research/api';

export const dynamic = 'force-dynamic';
// One LLM roundtrip per ACTIVE/WATCH/AT_RISK thesis.
export const maxDuration = 300;

/** Run the monitor for every ACTIVE / WATCH / AT_RISK thesis. */
export async function POST() {
  try {
    assertEnabled();
    const db = getDb();
    const results = await monitorAllTheses(db);
    return NextResponse.json({
      results,
      alerts: results.filter((r) => r.event !== null).length,
    });
  } catch (e) {
    return researchError(e);
  }
}
