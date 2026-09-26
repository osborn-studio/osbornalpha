import { requireResearchUser } from '@/lib/research/store';
import { setScope } from '@/lib/research/entity-keys/scope';
import { withResearch } from '@/lib/research/api';

export const dynamic = 'force-dynamic';

/** WP-A11: scope a candidate in or out, with a rationale; optionally fill keys/names the owner knows. */
export async function PATCH(req: Request, { params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  return withResearch(async () => {
    const ctx = await requireResearchUser();
    const body = await req.json().catch(() => ({}));
    const company = await setScope(ctx, entityId, {
      in_scope: body.in_scope, rationale: body.rationale, cohort: body.cohort,
      keys: body.keys, names_zh: body.names_zh, names_en: body.names_en, aliases: body.aliases,
      today: new Date().toISOString().slice(0, 10),
    });
    return { company };
  });
}
