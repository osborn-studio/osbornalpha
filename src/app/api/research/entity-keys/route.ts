import { NextResponse } from 'next/server';
import { requireResearchUser } from '@/lib/research/store';
import { addOwnerCompany, listScopedCompanies } from '@/lib/research/entity-keys/scope';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

const today = () => new Date().toISOString().slice(0, 10);

/** WP-A11: every company key row of the owner (candidates and owner-added), with securities. */
export async function GET() {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    return { companies: await listScopedCompanies(ctx) };
  });
}

/** WP-A11: add a company outside the §13 candidate list; body = OwnerCompanyAnswer. */
export async function POST(req: Request) {
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const company = await addOwnerCompany(ctx, body, { today: today() });
    return NextResponse.json({ company }, { status: 201 });
  });
}
