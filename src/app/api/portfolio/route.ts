export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPortfolio } from '@/lib/portfolio/store';

export async function GET() {
  try {
    return NextResponse.json(await getPortfolio());
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === 'not authenticated' ? 401 : 500 });
  }
}
